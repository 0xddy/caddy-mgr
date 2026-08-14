import type { Repository } from 'typeorm';
import type { CaddyServerEntity, ConfigRevisionEntity } from '../database/entities';
import type { OperationCompletion, OperationContext, OperationService } from '../operations/operation.service';
import type { ServersService } from '../servers/servers.service';
import type { SshSession } from '../ssh/ssh.service';
import type { ExecOptions } from '../ssh/ssh.types';
import { CaddyService } from './caddy.service';

const original = 'example.com {\n  respond "old"\n}\n';

interface FakeSessionOptions {
  reloadFailsOnce?: boolean;
  inactive?: boolean;
  replaceConflict?: boolean;
  systemdProperties?: string;
}

interface ExecutedCommand {
  command: string;
  options?: ExecOptions;
}

function server(): CaddyServerEntity {
  return {
    id: 'server-id',
    targetKey: 'fingerprint\ncaddy.service\n/etc/caddy/Caddyfile',
    hostFingerprint: 'SHA256:fingerprint',
    configPath: '/etc/caddy/Caddyfile',
    caddyBinary: '/usr/bin/caddy',
    adapter: 'caddyfile',
    serviceName: 'caddy.service',
    serviceUser: 'caddy',
    workingDirectory: '/etc/caddy',
  } as CaddyServerEntity;
}

function session(
  settings: FakeSessionOptions,
  commands: ExecutedCommand[],
  onUpload: () => void,
): SshSession {
  let reloads = 0;
  const defaultProperties = [
    'User=',
    'Group=',
    'WorkingDirectory=/etc/caddy',
    'Environment=',
    'EnvironmentFiles=',
    'ExecStart={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile ; }',
  ].join('\n');
  return {
    writeTemporaryFile: async () => {
      onUpload();
      return '/tmp/upload';
    },
    exec: async (command: string, options?: ExecOptions) => {
      commands.push({ command, options });
      if (command.includes('systemctl is-active')) {
        return settings.inactive
          ? { code: 3, stdout: 'inactive\n', stderr: '' }
          : { code: 0, stdout: 'active\n', stderr: '' };
      }
      if (command.includes('systemctl show')) {
        return { code: 0, stdout: settings.systemdProperties ?? defaultProperties, stderr: '' };
      }
      if (command.startsWith('stat ')) {
        return { code: 0, stderr: '', stdout: `1700000000|${Buffer.byteLength(original)}|caddy|caddy|644\n${Buffer.from(original).toString('base64')}` };
      }
      if (command.includes('actual_hash=$(sha256sum') && settings.replaceConflict) {
        return { code: 42, stdout: '', stderr: '' };
      }
      if (command.includes(' validate ')) return { code: 0, stdout: 'Valid configuration', stderr: '' };
      if (command.includes('systemctl reload')) {
        reloads += 1;
        if (settings.reloadFailsOnce && reloads === 1) return { code: 1, stdout: '', stderr: 'reload rejected' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  } as unknown as SshSession;
}

function harness(settings: FakeSessionOptions = {}) {
  const commands: ExecutedCommand[] = [];
  let uploads = 0;
  const remote = session(settings, commands, () => { uploads += 1; });
  const target = server();
  let completion: OperationCompletion | undefined;
  let lockKey: string | undefined;
  const revisionRows: ConfigRevisionEntity[] = [];
  const revisions = {
    find: async () => revisionRows,
    findOne: async () => revisionRows.at(-1) ?? null,
    create: (value: ConfigRevisionEntity) => ({ ...value, createdAt: value.createdAt ?? new Date() }),
    save: async (value: ConfigRevisionEntity) => {
      revisionRows.push(value);
      return value;
    },
  } as unknown as Repository<ConfigRevisionEntity>;
  const servers = {
    requireEntity: async () => target,
    withSession: async (_server: CaddyServerEntity, action: (value: SshSession) => Promise<unknown>) => action(remote),
  } as unknown as ServersService;
  const operations = {
    get: async () => ({
      id: 'recoverable-operation',
      serverId: target.id,
      kind: 'apply',
      status: 'needs_attention',
      stage: 'needs_attention',
      summary: 'reload failed',
      errorCode: 'ROLLBACK_RELOAD_FAILED',
      backupPath: '/etc/caddy/.caddy-mgr-backup-1700000000000-11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    }),
    enqueue: async (
      _serverId: string,
      _kind: string,
      runner: (context: OperationContext) => Promise<OperationCompletion>,
      targetLockKey?: string,
    ) => {
      lockKey = targetLockKey;
      completion = await runner({ operation: { id: 'operation-id' }, stage: async () => undefined, backup: async () => undefined } as unknown as OperationContext);
      return { operationId: 'operation-id' };
    },
  } as unknown as OperationService;
  const crypto = {
    encryptString: (value: string) => `encrypted:${value}`,
    decryptString: vi.fn((value: string) => value.replace(/^encrypted:/, '')),
  };
  return {
    service: new CaddyService(revisions, servers, operations, crypto as never),
    target,
    commands,
    getCompletion: () => completion,
    getLockKey: () => lockKey,
    getUploads: () => uploads,
    revisionRows,
    decryptString: crypto.decryptString,
  };
}

describe('Caddy apply orchestration', () => {
  it('validates twice, records history, and completes after reload', async () => {
    const test = harness();
    const before = await test.service.read(test.target.id);
    const result = await test.service.queueApply(test.target.id, { content: 'example.com { respond "new" }', baseHash: before.baseHash });
    expect(result).toEqual({ operationId: 'operation-id' });
    expect(test.getCompletion()?.status).toBe('succeeded');
    expect(test.getLockKey()).toBe('SHA256:fingerprint\ncaddy.service\n/etc/caddy/Caddyfile');
    expect(test.revisionRows.map((row) => row.source)).toEqual(['baseline', 'apply']);
    expect(test.revisionRows.every((row) => typeof row.size === 'number')).toBe(true);
    test.decryptString.mockClear();
    const listed = await test.service.listRevisions(test.target.id);
    expect(listed.map((row) => row.size)).toEqual(test.revisionRows.map((row) => row.size));
    expect(test.decryptString).not.toHaveBeenCalled();
  });

  it('restores the backup and reports rolled_back when the new config cannot reload', async () => {
    const test = harness({ reloadFailsOnce: true });
    const before = await test.service.read(test.target.id);
    await test.service.queueApply(test.target.id, { content: 'example.com { respond "new" }', baseHash: before.baseHash });
    expect(test.getCompletion()?.status).toBe('rolled_back');
    expect(test.getCompletion()?.errorCode).toBe('CADDY_RELOAD_FAILED');
    expect(test.revisionRows.map((row) => row.source)).toEqual(['baseline']);
  });

  it('rejects a stopped service before uploading a candidate', async () => {
    const test = harness({ inactive: true });
    const before = await test.service.read(test.target.id);
    await expect(test.service.queueApply(test.target.id, {
      content: 'example.com { respond "new" }',
      baseHash: before.baseHash,
    })).rejects.toMatchObject({ code: 'CADDY_SERVICE_INACTIVE', status: 409 });
    expect(test.getUploads()).toBe(0);
  });

  it('detects a last-moment config change inside the atomic replacement command', async () => {
    const test = harness({ replaceConflict: true });
    const before = await test.service.read(test.target.id);
    await expect(test.service.queueApply(test.target.id, {
      content: 'example.com { respond "new" }',
      baseHash: before.baseHash,
    })).rejects.toMatchObject({ code: 'CONFIG_CONFLICT', status: 409 });
    expect(test.commands.some(({ command }) => command.includes('actual_hash=$(sha256sum'))).toBe(true);
    expect(test.commands.some(({ command }) => command.includes('systemctl reload'))).toBe(false);
  });

  it('reuses systemd environment, EnvironmentFile, Caddy --envfile, and an empty root User', async () => {
    const properties = [
      'User=',
      'Group=caddy',
      'WorkingDirectory=/srv/caddy',
      'Environment=TOKEN=runtime-value "SPACED=x y"',
      'EnvironmentFiles=/etc/caddy/service.env (ignore_errors=no)',
      'ExecStart={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile --envfile /etc/caddy/caddy.env ; }',
    ].join('\n');
    const test = harness({ systemdProperties: properties });
    await test.service.validate(test.target.id, 'example.com { respond "new" }');
    const validation = test.commands.find(({ command }) => command.startsWith('systemd-run'));
    expect(validation?.command).toContain("--property='Group=caddy'");
    expect(validation?.command).toContain("--property='Environment=TOKEN=runtime-value \"SPACED=x y\"'");
    expect(validation?.command).toContain("--property='EnvironmentFile=/etc/caddy/service.env'");
    expect(validation?.command).toContain("validate --config '/etc/caddy/.caddy-mgr-");
    expect(validation?.command).toContain("--envfile '/etc/caddy/caddy.env'");
    expect(validation?.command).not.toContain("--property='User=");
    expect(validation?.options).toEqual({ elevated: true });
  });

  it('does not guess the configured serviceUser when live systemd User is empty', async () => {
    const test = harness();
    await test.service.validate(test.target.id, 'example.com { respond "new" }');
    const validation = test.commands.find(({ command }) => command.includes(' validate '));
    expect(validation?.options).toMatchObject({ elevated: true, asUser: null });
  });

  it('restores an operation backup through the full validation and apply workflow', async () => {
    const test = harness();
    const result = await test.service.queueRecovery('recoverable-operation', 'restoreBackup');

    expect(result).toEqual({ operationId: 'operation-id' });
    expect(test.getCompletion()?.status).toBe('succeeded');
    expect(test.commands.some(({ command }) => command.includes('.caddy-mgr-backup-1700000000000-'))).toBe(true);
    expect(test.commands.some(({ command }) => command.includes(' validate '))).toBe(true);
    expect(test.commands.some(({ command }) => command.includes('systemctl reload'))).toBe(true);
  });
});
