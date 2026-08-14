import { createHash } from 'node:crypto';
import type { ConnectConfig } from 'ssh2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runtimeConfig } from '../common/runtime-config';
import type { SshConnectionOptions } from './ssh.types';

const sshMock = vi.hoisted(() => ({
  configs: [] as ConnectConfig[],
  verifierResults: [] as boolean[],
  endCalls: 0,
}));

vi.mock('ssh2', () => ({
  Client: class MockClient {
    private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    once(event: string, handler: (...args: unknown[]) => void): this {
      const list = this.listeners.get(event) ?? [];
      list.push(handler);
      this.listeners.set(event, list);
      return this;
    }

    connect(config: ConnectConfig): this {
      sshMock.configs.push(config);
      const verifier = config.hostVerifier as ((key: Buffer) => boolean) | undefined;
      const accepted = verifier?.(Buffer.from('test-host-public-key')) ?? true;
      sshMock.verifierResults.push(accepted);
      if (accepted) this.emit('ready');
      return this;
    }

    end(): this {
      sshMock.endCalls += 1;
      this.emit('close');
      return this;
    }

    private emit(event: string, ...args: unknown[]): void {
      const list = this.listeners.get(event) ?? [];
      this.listeners.set(event, []);
      for (const handler of list) handler(...args);
    }
  },
}));

import { SshService } from './ssh.service';

function hostFingerprint(): string {
  return `SHA256:${createHash('sha256').update('test-host-public-key').digest('base64').replace(/=+$/, '')}`;
}

function authOptions(overrides: Partial<SshConnectionOptions> = {}): SshConnectionOptions {
  return {
    host: '192.0.2.10',
    port: 22,
    username: 'root',
    authMethod: 'password',
    elevationMethod: 'root',
    credentials: { password: 'ssh-password' },
    hostFingerprint: hostFingerprint(),
    ...overrides,
  };
}

function authConnectCount(): number {
  return sshMock.configs.filter((config) => config.username !== 'caddy-mgr-host-key-scan').length;
}

describe('SshService host-key scan', () => {
  beforeEach(() => {
    sshMock.configs.length = 0;
    sshMock.verifierResults.length = 0;
    sshMock.endCalls = 0;
  });

  it('captures and rejects the host key without configuring authentication secrets', async () => {
    const service = new SshService();

    const result = await service.scanHostKey('192.0.2.10', 22);

    expect(result.fingerprint).toMatch(/^SHA256:/u);
    expect(sshMock.verifierResults).toEqual([false]);
    expect(sshMock.configs).toHaveLength(1);
    expect(sshMock.configs[0]).toMatchObject({
      host: '192.0.2.10',
      port: 22,
      username: 'caddy-mgr-host-key-scan',
    });
    expect(sshMock.configs[0]).not.toHaveProperty('password');
    expect(sshMock.configs[0]).not.toHaveProperty('privateKey');
    expect(sshMock.configs[0]).not.toHaveProperty('passphrase');
    expect(sshMock.configs[0]).not.toHaveProperty('agent');
    expect(sshMock.endCalls).toBe(1);
  });
});

describe('SshService connection pool', () => {
  let service: SshService;

  beforeEach(() => {
    sshMock.configs.length = 0;
    sshMock.verifierResults.length = 0;
    sshMock.endCalls = 0;
    service = new SshService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('reuses one SSH client across overlapping acquire calls', async () => {
    const options = authOptions();
    const [first, second] = await Promise.all([service.acquire(options), service.acquire(options)]);

    expect(first).toBe(second);
    expect(authConnectCount()).toBe(1);

    service.release(options);
    service.release(options);
    expect(sshMock.endCalls).toBe(0);
  });

  it('closes an idle connection after the configured timeout', async () => {
    vi.useFakeTimers();
    const options = authOptions();
    await service.acquire(options);
    service.release(options);
    expect(sshMock.endCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(runtimeConfig.sshIdleTimeoutMs);
    expect(sshMock.endCalls).toBe(1);
  });

  it('reconnects after discard', async () => {
    const options = authOptions();
    const first = await service.acquire(options);
    service.release(options);
    service.discard(options);
    expect(sshMock.endCalls).toBe(1);

    const second = await service.acquire(options);
    expect(second).not.toBe(first);
    expect(authConnectCount()).toBe(2);
    service.release(options);
  });

  it('does not reuse a connection when credentials change', async () => {
    const firstOptions = authOptions();
    const first = await service.acquire(firstOptions);
    service.release(firstOptions);

    const second = await service.acquire(authOptions({ credentials: { password: 'other-password' } }));
    expect(second).not.toBe(first);
    expect(authConnectCount()).toBe(2);
    service.release(authOptions({ credentials: { password: 'other-password' } }));
  });

  it('closes pooled clients on shutdown', async () => {
    const options = authOptions();
    await service.acquire(options);
    service.release(options);
    service.onModuleDestroy();
    expect(sshMock.endCalls).toBe(1);
  });
});
