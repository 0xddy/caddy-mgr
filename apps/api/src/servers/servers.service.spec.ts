import type { Repository } from 'typeorm';
import type { CaddyDiscoveryService } from '../caddy/caddy-discovery.service';
import { AppError } from '../common/app-error';
import type { CryptoService } from '../common/crypto.service';
import type { CaddyServerEntity, OperationEntity } from '../database/entities';
import { SshError } from '../ssh/ssh.error';
import type { SshService } from '../ssh/ssh.service';
import type { CreateServerDto } from './server.dto';
import { ServersService } from './servers.service';

const createInput: CreateServerDto = {
  name: 'Production',
  host: '192.0.2.10',
  port: 22,
  username: 'root',
  authMethod: 'password',
  password: 'ssh-password',
  elevationMethod: 'root',
  hostFingerprint: 'SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  serviceName: 'caddy.service',
  caddyBinary: '/usr/bin/caddy',
  configPath: '/etc/caddy/Caddyfile',
  adapter: 'caddyfile',
};

function savedServer(): CaddyServerEntity {
  return {
    id: 'server-id',
    host: createInput.host,
    port: createInput.port,
    username: createInput.username,
    authMethod: createInput.authMethod,
    elevationMethod: createInput.elevationMethod,
    hostFingerprint: createInput.hostFingerprint,
    credentialCipher: 'encrypted-credentials',
    lastConnectionStatus: 'ok',
    lastConnectedAt: new Date(),
  } as CaddyServerEntity;
}

function harness() {
  const repositoryFind = vi.fn(async (): Promise<CaddyServerEntity[]> => []);
  const repositoryFindOne = vi.fn(async (): Promise<CaddyServerEntity | null> => null);
  const repositoryCreate = vi.fn((value: Partial<CaddyServerEntity>) => value as CaddyServerEntity);
  const repositorySave = vi.fn(async (value: CaddyServerEntity) => value);
  const repositoryUpdate = vi.fn(async () => undefined);
  const repositoryRemove = vi.fn(async (value: CaddyServerEntity) => value);
  const repository = {
    find: repositoryFind,
    findOne: repositoryFindOne,
    create: repositoryCreate,
    save: repositorySave,
    update: repositoryUpdate,
    remove: repositoryRemove,
  } as unknown as Repository<CaddyServerEntity>;
  const operations = { count: vi.fn(async () => 0) } as unknown as Repository<OperationEntity>;
  const crypto = {
    encryptJson: vi.fn(() => 'encrypted-credentials'),
    decryptJson: vi.fn(() => ({ password: 'ssh-password' })),
  } as unknown as CryptoService;
  const sshConnect = vi.fn();
  const sshAcquire = vi.fn();
  const sshRelease = vi.fn();
  const sshDiscard = vi.fn();
  const ssh = {
    connect: sshConnect,
    acquire: sshAcquire,
    release: sshRelease,
    discard: sshDiscard,
    scanHostKey: vi.fn(),
  } as unknown as SshService;
  const discovery = {} as CaddyDiscoveryService;
  return {
    service: new ServersService(repository, operations, crypto, ssh, discovery),
    repository,
    repositoryFind,
    repositoryFindOne,
    repositoryCreate,
    repositorySave,
    repositoryRemove,
    ssh,
    sshConnect,
    sshAcquire,
    sshRelease,
    sshDiscard,
  };
}

async function captureAppError(action: Promise<unknown>): Promise<AppError> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error('expected AppError');
}

describe('ServersService target identity and SSH errors', () => {
  it('rejects a duplicate physical Caddy target even when it would have a different local row', async () => {
    const test = harness();
    test.repositoryFind.mockResolvedValue([{ id: 'existing-server' }] as CaddyServerEntity[]);

    const error = await captureAppError(test.service.create(createInput));
    expect(error.code).toBe('CADDY_TARGET_DUPLICATE');
    expect(error.getStatus()).toBe(409);
    expect(test.repositorySave).not.toHaveBeenCalled();
  });

  it('maps a unique-index race to the same stable duplicate-target response', async () => {
    const test = harness();
    test.repositorySave.mockRejectedValue(Object.assign(
      new Error('UNIQUE constraint failed: caddy_servers.targetKey'),
      { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    ));

    const error = await captureAppError(test.service.create(createInput));
    expect(error.code).toBe('CADDY_TARGET_DUPLICATE');
    expect(error.getStatus()).toBe(409);
    expect(test.repositoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      targetKey: `${createInput.hostFingerprint}\n${createInput.serviceName}\n${createInput.configPath}`,
    }));
  });

  it('rejects a Caddyfile path that escapes with ..', async () => {
    const test = harness();
    const error = await captureAppError(test.service.create({
      ...createInput,
      configPath: '/etc/caddy/../../etc/shadow',
    }));
    expect(error.code).toBe('INVALID_REMOTE_SELECTION');
    expect(error.getStatus()).toBe(422);
    expect(test.repositorySave).not.toHaveBeenCalled();
  });

  it('does not expose remote authentication failures as panel-session 401 responses', async () => {
    const test = harness();
    test.sshConnect.mockRejectedValue(new SshError('SSH_AUTH_FAILED', 'SSH 身份验证失败'));

    const error = await captureAppError(test.service.probe(createInput));
    expect(error.code).toBe('SSH_AUTHENTICATION_FAILED');
    expect(error.getStatus()).toBe(422);
  });

  it('reuses a pooled SSH session instead of closing after each remote action', async () => {
    const test = harness();
    const session = { close: vi.fn() };
    test.sshAcquire.mockResolvedValue(session);
    const server = savedServer();

    await expect(test.service.withSession(server, async (value) => {
      expect(value).toBe(session);
      return 'ok';
    })).resolves.toBe('ok');

    expect(test.sshAcquire).toHaveBeenCalledOnce();
    expect(test.sshRelease).toHaveBeenCalledOnce();
    expect(session.close).not.toHaveBeenCalled();
  });

  it('drops the pooled SSH connection when a server is deleted', async () => {
    const test = harness();
    const server = savedServer();
    test.repositoryFindOne.mockResolvedValue(server);

    await test.service.remove(server.id);

    expect(test.sshDiscard).toHaveBeenCalledOnce();
    expect(test.repositoryRemove).toHaveBeenCalledWith(server);
  });
});
