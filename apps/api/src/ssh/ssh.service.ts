import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2';
import { createHash, randomUUID } from 'node:crypto';
import { runtimeConfig } from '../common/runtime-config';
import { cleanOutput, shellQuote } from '../common/serialize';
import { SshError } from './ssh.error';
import type { ExecOptions, ExecResult, SshConnectionOptions } from './ssh.types';

function fingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

function validUser(value: string): boolean {
  return /^[a-z_][a-z0-9_.-]*[$]?$/i.test(value);
}

export class SshSession {
  constructor(
    private readonly client: Client,
    readonly options: SshConnectionOptions,
    readonly fingerprint: string,
  ) {}

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    let remoteCommand = command;
    let stdin: string | undefined;
    if (options.elevated || options.asUser) {
      if (options.asUser && !validUser(options.asUser)) throw new SshError('INVALID_SERVICE_USER', '服务用户名称无效');
      if (this.options.elevationMethod === 'root') {
        if (options.asUser && options.asUser !== this.options.username) {
          remoteCommand = `runuser -u ${shellQuote(options.asUser)} -- sh -c ${shellQuote(command)}`;
        }
      } else {
        const target = options.asUser ? ` -u ${shellQuote(options.asUser)}` : '';
        if (this.options.elevationMethod === 'sudoPassword') {
          remoteCommand = `sudo -S -p ''${target} -- sh -c ${shellQuote(command)}`;
          stdin = `${this.options.credentials.sudoPassword ?? ''}\n`;
        } else {
          remoteCommand = `sudo -n${target} -- sh -c ${shellQuote(command)}`;
        }
      }
    }
    return this.execRaw(remoteCommand, stdin, options.timeoutMs);
  }

  async writeTemporaryFile(content: Buffer): Promise<string> {
    const path = `/tmp/caddy-mgr-${randomUUID()}`;
    const sftp = await this.sftp();
    try {
      await new Promise<void>((resolve, reject) => {
        const stream = sftp.createWriteStream(path, { mode: 0o600, flags: 'wx' });
        stream.once('error', reject);
        stream.once('close', resolve);
        stream.end(content);
      });
    } catch (error) {
      throw new SshError('SFTP_UPLOAD_FAILED', '上传临时配置失败', String(error));
    } finally {
      sftp.end();
    }
    return path;
  }

  close(): void {
    this.client.end();
  }

  onceClose(listener: () => void): void {
    this.client.once('close', listener);
  }

  private async sftp(): Promise<SFTPWrapper> {
    return new Promise<SFTPWrapper>((resolve, reject) => {
      this.client.sftp((error, sftp) => {
        if (error) reject(new SshError('SFTP_UNAVAILABLE', '远程服务器不支持 SFTP', error.message));
        else resolve(sftp);
      });
    });
  }

  private async execRaw(command: string, stdin?: string, timeoutMs = runtimeConfig.sshCommandTimeoutMs): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      let settled = false;
      let channel: ClientChannel | undefined;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        channel?.close();
        reject(new SshError('SSH_COMMAND_TIMEOUT', '远程命令执行超时'));
      }, timeoutMs);
      this.client.exec(command, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          if (!settled) reject(new SshError('SSH_EXEC_FAILED', '无法执行远程命令', error.message));
          return;
        }
        channel = stream;
        let stdout = '';
        let stderr = '';
        stream.setEncoding('utf8');
        stream.stderr.setEncoding('utf8');
        const outputLimit = 4 * 1024 * 1024;
        stream.on('data', (value: string) => {
          if (stdout.length < outputLimit) stdout += value.slice(0, outputLimit - stdout.length);
        });
        stream.stderr.on('data', (value: string) => {
          if (stderr.length < outputLimit) stderr += value.slice(0, outputLimit - stderr.length);
        });
        stream.on('error', (streamError: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new SshError('SSH_STREAM_ERROR', 'SSH 连接中断', streamError.message));
        });
        stream.on('close', (code: number | null, signal: string | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const secrets = [this.options.credentials.password, this.options.credentials.privateKey, this.options.credentials.passphrase, this.options.credentials.sudoPassword];
          resolve({
            stdout: cleanOutput(stdout, secrets),
            stderr: cleanOutput(stderr, secrets),
            code: code ?? 255,
            ...(signal ? { signal } : {}),
          });
        });
        if (stdin) stream.end(stdin);
      });
    });
  }
}

interface PoolEntry {
  session?: SshSession;
  pending?: Promise<SshSession>;
  uses: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

const TRANSPORT_ERRORS = new Set(['SSH_STREAM_ERROR', 'SSH_EXEC_FAILED', 'SSH_CONNECTION_FAILED']);

export function isSshTransportError(error: unknown): boolean {
  return error instanceof SshError && TRANSPORT_ERRORS.has(error.code);
}

function connectionKey(options: SshConnectionOptions): string {
  const secrets = [
    options.credentials.password ?? '',
    options.credentials.privateKey ?? '',
    options.credentials.passphrase ?? '',
    options.credentials.sudoPassword ?? '',
  ].join('\0');
  const credentialHash = createHash('sha256').update(secrets).digest('hex');
  return [
    options.host,
    String(options.port),
    options.username,
    options.hostFingerprint ?? '',
    options.authMethod,
    credentialHash,
  ].join('\0');
}

@Injectable()
export class SshService implements OnModuleDestroy {
  private readonly pool = new Map<string, PoolEntry>();

  onModuleDestroy(): void {
    for (const key of [...this.pool.keys()]) this.drop(key, true);
  }

  async acquire(options: SshConnectionOptions): Promise<SshSession> {
    const key = connectionKey(options);
    for (;;) {
      const existing = this.pool.get(key);
      if (existing?.session) {
        existing.uses += 1;
        this.clearIdleTimer(existing);
        return existing.session;
      }
      if (existing?.pending) {
        await existing.pending;
        continue;
      }

      const entry: PoolEntry = { uses: 0 };
      let resolveReady: (session: SshSession) => void;
      let rejectReady: (error: unknown) => void;
      entry.pending = new Promise<SshSession>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      void entry.pending.catch(() => undefined);
      this.pool.set(key, entry);
      try {
        const session = await this.connect(options);
        if (this.pool.get(key) !== entry) {
          session.close();
          rejectReady!(new SshError('SSH_CONNECTION_FAILED', 'SSH 连接已关闭'));
          continue;
        }
        entry.session = session;
        entry.pending = undefined;
        entry.uses += 1;
        session.onceClose(() => this.drop(key, false));
        resolveReady!(session);
        return session;
      } catch (error) {
        if (this.pool.get(key) === entry) this.pool.delete(key);
        rejectReady!(error);
        throw error;
      }
    }
  }

  release(options: SshConnectionOptions): void {
    const key = connectionKey(options);
    const entry = this.pool.get(key);
    if (!entry) return;
    entry.uses = Math.max(0, entry.uses - 1);
    if (entry.uses === 0 && entry.session) this.scheduleIdleClose(key, entry);
  }

  discard(options: SshConnectionOptions): void {
    this.drop(connectionKey(options), true);
  }

  private scheduleIdleClose(key: string, entry: PoolEntry): void {
    this.clearIdleTimer(entry);
    entry.idleTimer = setTimeout(() => {
      if (entry.uses > 0 || this.pool.get(key) !== entry) return;
      this.drop(key, true);
    }, runtimeConfig.sshIdleTimeoutMs);
    entry.idleTimer.unref?.();
  }

  private clearIdleTimer(entry: PoolEntry): void {
    if (!entry.idleTimer) return;
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  private drop(key: string, closeSession: boolean): void {
    const entry = this.pool.get(key);
    if (!entry) return;
    this.pool.delete(key);
    this.clearIdleTimer(entry);
    if (closeSession) entry.session?.close();
  }

  async scanHostKey(host: string, port: number): Promise<{ fingerprint: string }> {
    const client = new Client();
    const result = new Promise<{ fingerprint: string }>((resolve, reject) => {
      let settled = false;
      const config: ConnectConfig = {
        host,
        port,
        // A fixed non-user identity is present only to satisfy SSH client setup. The
        // rejected host verifier ends key exchange before user authentication.
        username: 'caddy-mgr-host-key-scan',
        readyTimeout: runtimeConfig.sshConnectTimeoutMs,
        hostVerifier(key: Buffer) {
          if (!settled) {
            settled = true;
            resolve({ fingerprint: fingerprint(key) });
          }
          return false;
        },
      };
      client.once('error', (error) => {
        if (settled) return;
        settled = true;
        reject(new SshError('SSH_HOST_KEY_SCAN_FAILED', '无法获取 SSH 主机指纹', error.message));
      });
      client.once('close', () => {
        if (settled) return;
        settled = true;
        reject(new SshError('SSH_HOST_KEY_SCAN_FAILED', 'SSH 连接在返回主机指纹前中断'));
      });
      try {
        client.connect(config);
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(new SshError('SSH_CONFIGURATION_INVALID', 'SSH 连接参数无效', String(error)));
        }
      }
    });
    return result.finally(() => client.end());
  }

  async connect(options: SshConnectionOptions): Promise<SshSession> {
    if (!options.hostFingerprint) {
      throw new SshError('HOST_KEY_REQUIRED', 'SSH 主机指纹尚未确认');
    }
    let observedFingerprint = '';
    let fingerprintMismatch = false;
    const client = new Client();
    const config: ConnectConfig = {
      host: options.host,
      port: options.port,
      username: options.username,
      readyTimeout: runtimeConfig.sshConnectTimeoutMs,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 2,
      hostVerifier(key: Buffer) {
        observedFingerprint = fingerprint(key);
        fingerprintMismatch = Boolean(options.hostFingerprint && options.hostFingerprint !== observedFingerprint);
        return !fingerprintMismatch;
      },
      ...(options.authMethod === 'privateKey'
        ? { privateKey: options.credentials.privateKey, passphrase: options.credentials.passphrase || undefined }
        : { password: options.credentials.password }),
    };
    return new Promise<SshSession>((resolve, reject) => {
      let settled = false;
      client.once('ready', () => {
        settled = true;
        resolve(new SshSession(client, options, observedFingerprint));
      });
      client.once('error', (error) => {
        if (settled) return;
        settled = true;
        client.end();
        if (fingerprintMismatch) {
          reject(new SshError('HOST_KEY_MISMATCH', `SSH 主机指纹不匹配（当前 ${observedFingerprint}）`));
          return;
        }
        const message = error.level === 'client-authentication' ? 'SSH 身份验证失败' : '无法连接 SSH 服务器';
        reject(new SshError(error.level === 'client-authentication' ? 'SSH_AUTH_FAILED' : 'SSH_CONNECTION_FAILED', message));
      });
      try {
        client.connect(config);
      } catch (error) {
        reject(new SshError('SSH_CONFIGURATION_INVALID', 'SSH 连接参数无效', String(error)));
      }
    });
  }
}
