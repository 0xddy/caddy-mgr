import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DiscoveryResult, ServerDetail, ServerSummary } from '../common/contracts';
import { AppError } from '../common/app-error';
import { CryptoService } from '../common/crypto.service';
import { assertAbsolutePath, assertSystemdUnit, shellQuote } from '../common/serialize';
import { targetIdentity } from '../common/target-identity';
import { CaddyServerEntity, OperationEntity } from '../database/entities';
import { SshError } from '../ssh/ssh.error';
import { isSshTransportError, SshService, type SshSession } from '../ssh/ssh.service';
import type { SshConnectionOptions, SshCredentials } from '../ssh/ssh.types';
import { CaddyDiscoveryService, applyPreferredCandidate } from '../caddy/caddy-discovery.service';
import type { CreateServerDto, HostKeyDto, ProbeServerDto, UpdateServerDto } from './server.dto';

@Injectable()
export class ServersService {
  constructor(
    @InjectRepository(CaddyServerEntity) private readonly servers: Repository<CaddyServerEntity>,
    @InjectRepository(OperationEntity) private readonly operations: Repository<OperationEntity>,
    private readonly crypto: CryptoService,
    private readonly ssh: SshService,
    private readonly discovery: CaddyDiscoveryService,
  ) {}

  async list(): Promise<ServerSummary[]> {
    const servers = await this.servers.find({ order: { createdAt: 'DESC' } });
    return servers.map((server) => this.summary(server));
  }

  async detail(id: string): Promise<ServerDetail> {
    return this.serialize(await this.requireEntity(id));
  }

  async requireEntity(id: string): Promise<CaddyServerEntity> {
    const server = await this.servers.findOne({ where: { id } });
    if (!server) throw new AppError('SERVER_NOT_FOUND', '服务器不存在', 404);
    return server;
  }

  async hostKey(input: HostKeyDto): Promise<{ fingerprint: string }> {
    try {
      return await this.ssh.scanHostKey(input.host, input.port);
    } catch (error) {
      if (error instanceof SshError) throw this.mapSshError(error);
      throw error;
    }
  }

  async probe(input: ProbeServerDto): Promise<{ fingerprint: string; discovery: DiscoveryResult }> {
    const session = await this.open(this.connectionFromInput(input));
    try {
      return { fingerprint: session.fingerprint, discovery: await this.discovery.discover(session) };
    } finally {
      session.close();
    }
  }

  async create(input: CreateServerDto): Promise<ServerDetail> {
    this.validateRemoteSelection(
      input.serviceName,
      input.caddyBinary,
      input.configPath,
      input.adapter,
      input.workingDirectory,
    );
    if (!input.hostFingerprint || !/^SHA256:[A-Za-z0-9+/]+$/.test(input.hostFingerprint)) {
      throw new AppError('HOST_FINGERPRINT_REQUIRED', '保存前必须确认 SSH 主机指纹', 422);
    }
    const credentials = this.credentialsFromInput(input);
    this.validateCredentials(input.authMethod, input.elevationMethod, credentials);
    await this.assertTargetAvailable(input.hostFingerprint, input.serviceName, input.configPath);
    const entity = this.servers.create({
      targetKey: targetIdentity(input),
      name: input.name.trim(),
      host: input.host,
      port: input.port,
      username: input.username,
      authMethod: input.authMethod,
      elevationMethod: input.elevationMethod,
      credentialCipher: this.crypto.encryptJson(credentials),
      hostFingerprint: input.hostFingerprint,
      serviceName: input.serviceName,
      caddyBinary: input.caddyBinary,
      caddyVersion: input.caddyVersion?.trim() || null,
      configPath: input.configPath,
      adapter: input.adapter,
      serviceUser: input.serviceUser || null,
      workingDirectory: input.workingDirectory || null,
      supported: true,
      discoveryJson: input.discovery ? JSON.stringify(input.discovery) : null,
      lastConnectionStatus: null,
      lastConnectedAt: null,
    });
    return this.serialize(await this.saveServer(entity));
  }

  async update(id: string, input: UpdateServerDto): Promise<ServerDetail> {
    const server = await this.requireEntity(id);
    const previous = this.connection(server);
    const credentials = { ...previous.credentials, ...this.credentialsFromInput(input, true) };
    const authMethod = input.authMethod ?? server.authMethod;
    const elevationMethod = input.elevationMethod ?? server.elevationMethod;
    this.validateCredentials(authMethod, elevationMethod, credentials);
    const serviceName = input.serviceName ?? server.serviceName;
    const binary = input.caddyBinary ?? server.caddyBinary;
    const configPath = input.configPath ?? server.configPath;
    const adapter = input.adapter ?? server.adapter;
    this.validateRemoteSelection(serviceName, binary, configPath, adapter, input.workingDirectory ?? server.workingDirectory);
    Object.assign(server, {
      ...this.onlyDefined({
        name: input.name?.trim(), host: input.host, port: input.port, username: input.username,
        authMethod: input.authMethod, elevationMethod: input.elevationMethod,
        hostFingerprint: input.hostFingerprint, serviceName: input.serviceName,
        caddyBinary: input.caddyBinary, configPath: input.configPath, adapter: input.adapter,
        serviceUser: input.serviceUser, workingDirectory: input.workingDirectory,
      }),
      credentialCipher: this.crypto.encryptJson(credentials),
    });
    await this.assertTargetAvailable(server.hostFingerprint, server.serviceName, server.configPath, server.id);
    server.targetKey = targetIdentity(server);
    const saved = await this.saveServer(server);
    this.ssh.discard(previous);
    return this.serialize(saved);
  }

  async remove(id: string): Promise<void> {
    const server = await this.requireEntity(id);
    const active = await this.operations.count({ where: [{ serverId: id, status: 'queued' }, { serverId: id, status: 'running' }] });
    if (active) throw new AppError('SERVER_BUSY', '服务器正在执行操作，暂时无法删除', 409);
    this.ssh.discard(this.connection(server));
    await this.servers.remove(server);
  }

  async rediscover(id: string): Promise<DiscoveryResult> {
    const server = await this.requireEntity(id);
    return this.withSession(server, async (session) => {
      const result = applyPreferredCandidate(await this.discovery.discover(session), server.serviceName);
      server.discoveryJson = JSON.stringify(result);
      server.caddyVersion = result.version?.trim() || null;
      server.supported = result.supported;
      if (result.supported) {
        this.validateRemoteSelection(
          result.serviceName!,
          result.caddyBinary!,
          result.configPath!,
          result.adapter!,
          result.workingDirectory,
        );
        server.serviceName = result.serviceName!;
        server.caddyBinary = result.caddyBinary!;
        server.configPath = result.configPath!;
        server.adapter = result.adapter!;
        server.serviceUser = result.serviceUser || null;
        server.workingDirectory = result.workingDirectory || null;
        await this.assertTargetAvailable(server.hostFingerprint, server.serviceName, server.configPath, server.id);
        server.targetKey = targetIdentity(server);
      }
      await this.saveServer(server);
      return result;
    });
  }

  async status(id: string) {
    const server = await this.requireEntity(id);
    return this.withSession(server, async (session) => {
      assertSystemdUnit(server.serviceName);
      assertAbsolutePath(server.caddyBinary, 'caddyBinary');
      const status = await session.exec(`systemctl is-active ${shellQuote(server.serviceName)}`);
      const version = await session.exec(`${shellQuote(server.caddyBinary)} version`);
      return {
        active: status.stdout.trim() === 'active',
        serviceStatus: status.stdout.trim() || status.stderr.trim() || 'unknown',
        version: version.stdout.trim() || version.stderr.trim() || 'unknown',
        checkedAt: new Date().toISOString(),
      };
    });
  }

  async logs(id: string, lines: number): Promise<{ content: string; lines: number }> {
    const server = await this.requireEntity(id);
    const safeLines = Math.min(Math.max(lines, 1), 1000);
    return this.withSession(server, async (session) => {
      const result = await session.exec(
        `journalctl -u ${shellQuote(server.serviceName)} -n ${safeLines} --no-pager -o short-iso`,
        { elevated: true },
      );
      if (result.code !== 0) throw new AppError('REMOTE_LOGS_FAILED', '读取 Caddy 日志失败', 502, result.stderr);
      return { content: result.stdout, lines: safeLines };
    });
  }

  connection(server: CaddyServerEntity): SshConnectionOptions {
    return {
      host: server.host,
      port: server.port,
      username: server.username,
      authMethod: server.authMethod,
      elevationMethod: server.elevationMethod,
      credentials: this.crypto.decryptJson<SshCredentials>(server.credentialCipher),
      hostFingerprint: server.hostFingerprint,
    };
  }

  async withSession<T>(server: CaddyServerEntity, action: (session: SshSession) => Promise<T>): Promise<T> {
    const options = this.connection(server);
    let acquired = false;
    try {
      let session: SshSession;
      try {
        session = await this.ssh.acquire(options);
      } catch (error) {
        if (error instanceof SshError) throw this.mapSshError(error);
        throw error;
      }
      acquired = true;
      const recentlySeen =
        server.lastConnectionStatus === 'ok'
        && server.lastConnectedAt
        && Date.now() - server.lastConnectedAt.getTime() < 5 * 60_000;
      if (!recentlySeen) {
        server.lastConnectionStatus = 'ok';
        server.lastConnectedAt = new Date();
        await this.servers.save(server);
      }
      return await action(session);
    } catch (error) {
      if (isSshTransportError(error)) this.ssh.discard(options);
      server.lastConnectionStatus = error instanceof SshError ? error.code : error instanceof AppError ? error.code : 'REMOTE_ERROR';
      // Persist only diagnostics here: an action such as rediscovery may have mutated
      // other fields before failing, and saving the whole entity would commit them.
      await this.servers.update(server.id, { lastConnectionStatus: server.lastConnectionStatus }).catch(() => undefined);
      if (error instanceof AppError) throw error;
      if (error instanceof SshError) throw this.mapSshError(error);
      throw error;
    } finally {
      if (acquired) this.ssh.release(options);
    }
  }

  private async open(options: SshConnectionOptions): Promise<SshSession> {
    try {
      return await this.ssh.connect(options);
    } catch (error) {
      if (error instanceof SshError) throw this.mapSshError(error);
      throw error;
    }
  }

  private mapSshError(error: SshError): AppError {
    const code = error.code === 'SSH_AUTH_FAILED' ? 'SSH_AUTHENTICATION_FAILED' : error.code;
    const status = code === 'HOST_KEY_MISMATCH' ? 409 : code === 'HOST_KEY_REQUIRED' || code === 'SSH_AUTHENTICATION_FAILED' ? 422 : 502;
    return new AppError(code, error.message, status, error.remoteOutput);
  }

  private connectionFromInput(input: ProbeServerDto): SshConnectionOptions {
    const credentials = this.credentialsFromInput(input);
    this.validateCredentials(input.authMethod, input.elevationMethod, credentials);
    return { host: input.host, port: input.port, username: input.username, authMethod: input.authMethod, elevationMethod: input.elevationMethod, credentials, hostFingerprint: input.hostFingerprint };
  }

  private credentialsFromInput(input: Partial<ProbeServerDto>, omitUndefined = false): SshCredentials {
    const values: SshCredentials = { password: input.password, privateKey: input.privateKey, passphrase: input.passphrase, sudoPassword: input.sudoPassword };
    return omitUndefined ? this.onlyDefined(values) : values;
  }

  private validateCredentials(authMethod: string, elevationMethod: string, credentials: SshCredentials): void {
    if (authMethod === 'password' && !credentials.password) throw new AppError('SSH_PASSWORD_REQUIRED', '请输入 SSH 密码', 422);
    if (authMethod === 'privateKey' && !credentials.privateKey) throw new AppError('SSH_PRIVATE_KEY_REQUIRED', '请输入 SSH 私钥', 422);
    if (elevationMethod === 'sudoPassword' && !credentials.sudoPassword) throw new AppError('SUDO_PASSWORD_REQUIRED', '请输入 sudo 密码', 422);
  }

  private validateRemoteSelection(
    unit: string,
    binary: string,
    config: string,
    adapter: string,
    workingDirectory?: string | null,
  ): void {
    try {
      assertSystemdUnit(unit);
      assertAbsolutePath(binary, 'caddyBinary');
      assertAbsolutePath(config, 'configPath');
      if (workingDirectory) assertAbsolutePath(workingDirectory, 'workingDirectory');
    } catch (error) {
      throw new AppError('INVALID_REMOTE_SELECTION', (error as Error).message, 422);
    }
    if (adapter !== 'caddyfile') throw new AppError('UNSUPPORTED_ADAPTER', '仅支持 caddyfile adapter', 422);
  }

  private onlyDefined<T extends object>(input: T): T {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
  }

  private async assertTargetAvailable(
    hostFingerprint: string,
    serviceName: string,
    configPath: string,
    excludeId?: string,
  ): Promise<void> {
    const matches = await this.servers.find({
      where: { hostFingerprint, serviceName, configPath },
      select: { id: true },
      take: excludeId ? 2 : 1,
    });
    if (matches.some((match) => match.id !== excludeId)) {
      throw this.duplicateTargetError();
    }
  }

  private async saveServer(server: CaddyServerEntity): Promise<CaddyServerEntity> {
    try {
      return await this.servers.save(server);
    } catch (error) {
      if (this.isTargetUniqueConstraint(error)) throw this.duplicateTargetError();
      throw error;
    }
  }

  private isTargetUniqueConstraint(error: unknown): boolean {
    const value = error as { message?: string; code?: string; driverError?: { message?: string; code?: string } };
    const code = value.driverError?.code ?? value.code;
    const message = `${value.message ?? ''} ${value.driverError?.message ?? ''}`;
    return code === 'SQLITE_CONSTRAINT_UNIQUE' && /(?:caddy_servers\.targetKey|IDX_caddy_server_target)/i.test(message);
  }

  private duplicateTargetError(): AppError {
    return new AppError('CADDY_TARGET_DUPLICATE', '该 Caddy 实例已存在，不能重复添加', 409);
  }

  private summary(server: CaddyServerEntity): ServerSummary {
    const discovery = server.discoveryJson ? (JSON.parse(server.discoveryJson) as DiscoveryResult) : null;
    return {
      id: server.id, name: server.name, host: server.host, port: server.port, username: server.username,
      serviceName: server.serviceName, configPath: server.configPath, supported: server.supported,
      caddyVersion: server.caddyVersion ?? discovery?.version ?? null,
      lastConnectionStatus: server.lastConnectionStatus,
      lastConnectedAt: server.lastConnectedAt?.toISOString() ?? null,
      createdAt: server.createdAt.toISOString(), updatedAt: server.updatedAt.toISOString(),
    };
  }

  private serialize(server: CaddyServerEntity): ServerDetail {
    const discovery = server.discoveryJson ? (JSON.parse(server.discoveryJson) as DiscoveryResult) : null;
    return {
      ...this.summary(server), authMethod: server.authMethod, elevationMethod: server.elevationMethod,
      hostFingerprint: server.hostFingerprint, caddyBinary: server.caddyBinary, adapter: server.adapter,
      serviceUser: server.serviceUser, workingDirectory: server.workingDirectory,
      discovery,
    };
  }
}
