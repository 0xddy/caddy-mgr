import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { Repository } from 'typeorm';
import type { ConfigRevision, RemoteConfig, ValidationResult } from '../common/contracts';
import { AppError } from '../common/app-error';
import { CryptoService } from '../common/crypto.service';
import { runtimeConfig } from '../common/runtime-config';
import { assertAbsolutePath, assertSystemdUnit, sha256, shellQuote } from '../common/serialize';
import { targetIdentity } from '../common/target-identity';
import { CaddyServerEntity, ConfigRevisionEntity } from '../database/entities';
import { OperationContext, OperationService, type OperationCompletion } from '../operations/operation.service';
import type { SshSession } from '../ssh/ssh.service';
import { ServersService } from '../servers/servers.service';
import type { ApplyConfigDto } from './caddy.dto';
import { extractExecCommand, flagValues, parseEnvironmentFiles, parseSystemdProperties } from './systemd-parser';

interface PreparedCandidate {
  path: string;
  metadata: RemoteConfig;
}

@Injectable()
export class CaddyService {
  constructor(
    @InjectRepository(ConfigRevisionEntity) private readonly revisions: Repository<ConfigRevisionEntity>,
    private readonly servers: ServersService,
    private readonly operations: OperationService,
    private readonly crypto: CryptoService,
  ) {}

  async read(id: string): Promise<RemoteConfig> {
    const server = await this.servers.requireEntity(id);
    const config = await this.servers.withSession(server, (session) => this.readInSession(server, session));
    await this.snapshotRemoteConfig(server.id, config);
    return config;
  }

  async format(id: string, content: string): Promise<ValidationResult> {
    this.assertContent(content);
    const server = await this.servers.requireEntity(id);
    return this.servers.withSession(server, async (session) => {
      const candidate = await this.prepareCandidate(server, session, content);
      try {
        const command = this.inWorkingDirectory(
          server,
          `${shellQuote(server.caddyBinary)} fmt ${shellQuote(candidate.path)}`,
        );
        const result = await session.exec(command, { elevated: true, asUser: server.serviceUser });
        if (result.code !== 0 && !result.stdout) {
          throw new AppError('CADDY_FORMAT_FAILED', 'Caddyfile 格式化失败', 422, result.stderr || result.stdout);
        }
        return { valid: true, output: result.stderr, formatted: result.stdout || content };
      } finally {
        await this.removeCandidate(session, candidate.path);
      }
    });
  }

  async validate(id: string, content: string): Promise<ValidationResult> {
    this.assertContent(content);
    const server = await this.servers.requireEntity(id);
    const result = await this.servers.withSession(server, (session) => this.validateInSession(server, session, content));
    if (!result.valid) throw new AppError('CADDY_VALIDATION_FAILED', 'Caddy 配置校验失败', 422, result.output);
    return result;
  }

  async queueApply(id: string, input: ApplyConfigDto): Promise<{ operationId: string }> {
    return this.queueConfigChange(id, input.content, input.baseHash, 'apply', 'apply');
  }

  async listRevisions(serverId: string): Promise<ConfigRevision[]> {
    await this.servers.requireEntity(serverId);
    const revisions = await this.revisions.find({ where: { serverId }, order: { createdAt: 'DESC' } });
    return Promise.all(revisions.map((revision) => this.serializeRevision(revision)));
  }

  async revision(serverId: string, revisionId: string): Promise<ConfigRevision & { content: string }> {
    await this.servers.requireEntity(serverId);
    const revision = await this.requireRevision(serverId, revisionId);
    const content = this.crypto.decryptString(revision.contentCipher);
    return { ...(await this.serializeRevision(revision, content)), content };
  }

  async queueRestore(serverId: string, revisionId: string, baseHash: string): Promise<{ operationId: string }> {
    const revision = await this.requireRevision(serverId, revisionId);
    return this.queueConfigChange(serverId, this.crypto.decryptString(revision.contentCipher), baseHash, 'restore', 'restore');
  }

  async queueServiceAction(serverId: string, action: 'reload' | 'restart'): Promise<{ operationId: string }> {
    const server = await this.servers.requireEntity(serverId);
    return this.operations.enqueue(serverId, action, async (context) => {
      return this.servers.withSession(server, async (session) => {
        await context.stage(action, `正在执行 systemctl ${action}`);
        const result = await this.systemctl(session, server, action);
        if (result.code !== 0) throw new AppError(`CADDY_${action.toUpperCase()}_FAILED`, `Caddy ${action} 失败`, 502, result.stderr);
        const active = await this.systemctl(session, server, 'is-active');
        if (active.stdout.trim() !== 'active') throw new AppError('CADDY_SERVICE_INACTIVE', '操作后 Caddy 服务未处于 active 状态', 502, active.stderr || active.stdout);
        return { summary: `Caddy ${action} 已完成` };
      });
    }, targetIdentity(server));
  }

  async queueRecovery(
    operationId: string,
    action: 'retryReload' | 'restoreBackup',
  ): Promise<{ operationId: string }> {
    const original = await this.operations.get(operationId);
    if (!['failed', 'interrupted', 'needs_attention', 'rolled_back'].includes(original.status)) {
      throw new AppError('OPERATION_NOT_RECOVERABLE', '该操作当前不需要恢复', 409);
    }
    if (action === 'retryReload') return this.queueServiceAction(original.serverId, 'reload');
    if (!original.backupPath) {
      throw new AppError('OPERATION_BACKUP_UNAVAILABLE', '该操作没有可恢复的远端备份', 422);
    }

    const server = await this.servers.requireEntity(original.serverId);
    this.assertRecoveryBackupPath(server.configPath, original.backupPath);
    const recovery = await this.servers.withSession(server, async (session) => {
      const [current, backup] = await Promise.all([
        this.readInSession(server, session),
        this.readPathInSession(original.backupPath!, session),
      ]);
      return { content: backup.content, baseHash: current.baseHash };
    });
    return this.queueConfigChange(server.id, recovery.content, recovery.baseHash, 'restore', 'restore');
  }

  async readInSession(server: CaddyServerEntity, session: SshSession): Promise<RemoteConfig> {
    assertAbsolutePath(server.configPath);
    return this.readPathInSession(server.configPath, session);
  }

  private async readPathInSession(path: string, session: SshSession): Promise<RemoteConfig> {
    assertAbsolutePath(path);
    const command = `stat -Lc '%Y|%s|%U|%G|%a' -- ${shellQuote(path)} && base64 -w0 -- ${shellQuote(path)}`;
    const result = await session.exec(command, { elevated: true });
    if (result.code !== 0) throw new AppError('REMOTE_CONFIG_READ_FAILED', '读取远程 Caddyfile 失败', 502, result.stderr);
    const newline = result.stdout.indexOf('\n');
    if (newline < 0) throw new AppError('REMOTE_CONFIG_METADATA_INVALID', '远程配置元数据格式无效', 502);
    const [mtimeText, sizeText, owner, group, mode] = result.stdout.slice(0, newline).trim().split('|');
    const size = Number.parseInt(sizeText ?? '', 10);
    const mtime = Number.parseInt(mtimeText ?? '', 10);
    if (!Number.isFinite(size) || size < 0 || size > runtimeConfig.maxConfigBytes) {
      throw new AppError('REMOTE_CONFIG_TOO_LARGE', `远程配置超过 ${runtimeConfig.maxConfigBytes} 字节限制`, 413);
    }
    const buffer = Buffer.from(result.stdout.slice(newline + 1).trim(), 'base64');
    if (buffer.length !== size) throw new AppError('REMOTE_CONFIG_TRUNCATED', '远程配置读取不完整', 502);
    const content = buffer.toString('utf8');
    if (content.includes('\u0000')) throw new AppError('REMOTE_CONFIG_NOT_TEXT', '远程配置不是 UTF-8 文本', 422);
    return { content, baseHash: sha256(buffer), mtime, size, owner, group, mode };
  }

  private async queueConfigChange(
    serverId: string,
    content: string,
    baseHash: string,
    kind: 'apply' | 'restore',
    source: ConfigRevision['source'],
  ): Promise<{ operationId: string }> {
    this.assertContent(content);
    const server = await this.servers.requireEntity(serverId);
    // Synchronous preflight gives callers deterministic 409/422 responses; the worker repeats both checks under its lock.
    await this.servers.withSession(server, async (session) => {
      await this.assertServiceActive(session, server);
      const current = await this.readInSession(server, session);
      if (current.baseHash !== baseHash) throw new AppError('CONFIG_CONFLICT', '远程配置已被其他操作修改，请刷新后重试', 409, { currentHash: current.baseHash });
      const validation = await this.validateInSession(server, session, content);
      if (!validation.valid) throw new AppError('CADDY_VALIDATION_FAILED', 'Caddy 配置校验失败', 422, validation.output);
    });
    return this.operations.enqueue(
      serverId,
      kind,
      (context) => this.applyUnderLock(server, content, baseHash, source, context),
      targetIdentity(server),
    );
  }

  private async applyUnderLock(
    server: CaddyServerEntity,
    content: string,
    baseHash: string,
    source: ConfigRevision['source'],
    context: OperationContext,
  ): Promise<OperationCompletion> {
    return this.servers.withSession(server, async (session) => {
      await context.stage('checking_conflict', '正在检查远程配置版本');
      await this.assertServiceActive(session, server);
      const current = await this.readInSession(server, session);
      if (current.baseHash !== baseHash) throw new AppError('CONFIG_CONFLICT', '远程配置已被其他操作修改', 409);
      await context.stage('uploading', '正在上传候选配置');
      const candidate = await this.prepareCandidate(server, session, content, current);
      let candidateExists = true;
      try {
        await context.stage('validating', '正在使用远程 Caddy 校验候选配置');
        const validation = await this.validateCandidate(server, session, candidate.path);
        if (!validation.valid) throw new AppError('CADDY_VALIDATION_FAILED', 'Caddy 配置校验失败', 422, validation.output);

        await this.ensureRevision(server.id, current.content, current.baseHash, 'baseline', context.operation.id);
        const backupPath = `${posix.dirname(server.configPath)}/.caddy-mgr-backup-${Date.now()}-${randomUUID()}`;
        await context.stage('backing_up', '正在创建远程备份');
        const backup = await session.exec(
          `cp --preserve=mode,ownership,timestamps -- ${shellQuote(server.configPath)} ${shellQuote(backupPath)}`,
          { elevated: true },
        );
        if (backup.code !== 0) throw new AppError('REMOTE_BACKUP_FAILED', '创建远程配置备份失败', 502, backup.stderr);
        await context.backup(backupPath);

        await context.stage('replacing', '正在原子替换 Caddyfile');
        const replace = await session.exec(
          `actual_hash=$(sha256sum -- ${shellQuote(server.configPath)} | awk '{print $1}') || exit $?; ` +
          `if [ "$actual_hash" != ${shellQuote(baseHash)} ]; then exit 42; fi; ` +
          `mv -f -- ${shellQuote(candidate.path)} ${shellQuote(server.configPath)} && ` +
          `(command -v restorecon >/dev/null 2>&1 && restorecon -F ${shellQuote(server.configPath)} || true)`,
          { elevated: true },
        );
        if (replace.code === 42) {
          throw new AppError('CONFIG_CONFLICT', '远程配置在替换前发生变化，请刷新后重试', 409);
        }
        if (replace.code !== 0) throw new AppError('REMOTE_REPLACE_FAILED', '原子替换远程配置失败', 502, replace.stderr);
        candidateExists = false;

        await context.stage('reloading', '正在 reload Caddy 服务');
        const reload = await this.reloadAndCheck(session, server);
        if (!reload.ok) {
          await context.stage('rolling_back', 'reload 失败，正在恢复旧配置');
          const recoveryPath = `${posix.dirname(server.configPath)}/.caddy-mgr-restore-${randomUUID()}`;
          const restore = await session.exec(
            `cp --preserve=mode,ownership,timestamps -- ${shellQuote(backupPath)} ${shellQuote(recoveryPath)} && mv -f -- ${shellQuote(recoveryPath)} ${shellQuote(server.configPath)} && (command -v restorecon >/dev/null 2>&1 && restorecon -F ${shellQuote(server.configPath)} || true)`,
            { elevated: true },
          );
          if (restore.code !== 0) {
            return { status: 'needs_attention', errorCode: 'ROLLBACK_RESTORE_FAILED', summary: `reload 失败且无法恢复备份：${(restore.stderr || reload.output).slice(0, 16_000)}`, backupPath };
          }
          const oldReload = await this.reloadAndCheck(session, server);
          if (!oldReload.ok) {
            return { status: 'needs_attention', errorCode: 'ROLLBACK_RELOAD_FAILED', summary: `旧配置已恢复，但服务仍无法 reload：${oldReload.output.slice(0, 16_000)}`, backupPath };
          }
          return { status: 'rolled_back', errorCode: 'CADDY_RELOAD_FAILED', summary: `新配置 reload 失败，已自动恢复旧配置：${reload.output.slice(0, 16_000)}`, backupPath };
        }

        await context.stage('pruning_backups', '正在清理旧远程备份');
        await this.pruneBackups(session, posix.dirname(server.configPath));
        try {
          await this.saveRevision(server.id, content, sha256(content), source, context.operation.id);
        } catch {
          return { status: 'needs_attention', errorCode: 'REVISION_PERSIST_FAILED', summary: '远程配置已成功应用，但本地历史版本保存失败', backupPath };
        }
        return { status: 'succeeded', summary: '配置已校验、应用并成功 reload', backupPath };
      } finally {
        if (candidateExists) await this.removeCandidate(session, candidate.path);
      }
    });
  }

  private async validateInSession(server: CaddyServerEntity, session: SshSession, content: string): Promise<ValidationResult> {
    const candidate = await this.prepareCandidate(server, session, content);
    try {
      return await this.validateCandidate(server, session, candidate.path);
    } finally {
      await this.removeCandidate(session, candidate.path);
    }
  }

  private async validateCandidate(server: CaddyServerEntity, session: SshSession, path: string): Promise<ValidationResult> {
    assertSystemdUnit(server.serviceName);
    const propertiesResult = await session.exec(
      `systemctl show ${shellQuote(server.serviceName)} -p User -p Group -p WorkingDirectory -p Environment -p EnvironmentFiles -p ExecStart`,
    );
    if (propertiesResult.code !== 0) {
      return { valid: false, output: propertiesResult.stderr || '无法读取 Caddy systemd 运行环境' };
    }
    const properties = parseSystemdProperties(propertiesResult.stdout);
    const environmentFiles = parseEnvironmentFiles(properties.EnvironmentFiles ?? '');
    const execStart = extractExecCommand(properties.ExecStart ?? '');
    const caddyEnvFiles = flagValues(execStart, '--envfile');
    if (caddyEnvFiles.some((envFile) => !envFile)) {
      return { valid: false, output: 'Caddy ExecStart 中的 --envfile 参数缺少路径，无法复用运行环境' };
    }
    const workingDirectory = properties.WorkingDirectory || server.workingDirectory || posix.dirname(server.configPath);
    assertAbsolutePath(workingDirectory, 'workingDirectory');
    // `--envfile` belongs to the validate subcommand; preserve every run value in argv order.
    const envFileFlags = caddyEnvFiles.map((envFile) => `--envfile ${shellQuote(envFile)}`).join(' ');
    const validate = [
      shellQuote(server.caddyBinary),
      'validate',
      '--config',
      shellQuote(path),
      '--adapter',
      shellQuote(server.adapter),
      envFileFlags,
    ].filter(Boolean).join(' ');
    const needsTransientUnit = Boolean(properties.Environment || environmentFiles.length || properties.Group);
    let result;
    if (needsTransientUnit) {
      const transientProperties = [
        'Type=exec',
        `WorkingDirectory=${workingDirectory}`,
        ...(properties.User ? [`User=${properties.User}`] : []),
        ...(properties.Group ? [`Group=${properties.Group}`] : []),
        ...(properties.Environment ? [`Environment=${properties.Environment}`] : []),
        ...environmentFiles.map((file) => `EnvironmentFile=${file}`),
      ];
      const command = [
        'systemd-run --quiet --wait --pipe --collect',
        `--unit=${shellQuote(`caddy-mgr-validate-${randomUUID()}`)}`,
        ...transientProperties.map((property) => `--property=${shellQuote(property)}`),
        '--',
        validate,
      ].join(' ');
      result = await session.exec(command, { elevated: true });
    } else {
      const command = `cd -- ${shellQuote(workingDirectory)} && ${validate}`;
      // An empty User= means the service runs as root; do not guess a caddy account.
      result = await session.exec(command, { elevated: true, asUser: properties.User || null });
    }
    return { valid: result.code === 0, output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() };
  }

  private async prepareCandidate(
    server: CaddyServerEntity,
    session: SshSession,
    content: string,
    metadata?: RemoteConfig,
  ): Promise<PreparedCandidate> {
    const current = metadata ?? (await this.readInSession(server, session));
    const temporaryPath = await session.writeTemporaryFile(Buffer.from(content, 'utf8'));
    const candidatePath = `${posix.dirname(server.configPath)}/.caddy-mgr-${randomUUID()}.candidate`;
    try {
      const install = await session.exec(
        `install -o ${shellQuote(current.owner)} -g ${shellQuote(current.group)} -m ${shellQuote(current.mode)} -- ${shellQuote(temporaryPath)} ${shellQuote(candidatePath)} && (command -v restorecon >/dev/null 2>&1 && restorecon -F ${shellQuote(candidatePath)} || true)`,
        { elevated: true },
      );
      if (install.code !== 0) {
        await session.exec(`rm -f -- ${shellQuote(candidatePath)}`, { elevated: true }).catch(() => undefined);
        throw new AppError('REMOTE_CANDIDATE_INSTALL_FAILED', '安装远程候选配置失败', 502, install.stderr);
      }
      return { path: candidatePath, metadata: current };
    } finally {
      await session.exec(`rm -f -- ${shellQuote(temporaryPath)}`, { elevated: true }).catch(() => undefined);
    }
  }

  private async removeCandidate(session: SshSession, path: string): Promise<void> {
    await session.exec(`rm -f -- ${shellQuote(path)}`, { elevated: true }).catch(() => undefined);
  }

  private async reloadAndCheck(session: SshSession, server: CaddyServerEntity): Promise<{ ok: boolean; output: string }> {
    const reload = await this.systemctl(session, server, 'reload');
    if (reload.code !== 0) return { ok: false, output: reload.stderr || reload.stdout };
    const active = await this.systemctl(session, server, 'is-active');
    return { ok: active.stdout.trim() === 'active', output: active.stderr || active.stdout };
  }

  private async assertServiceActive(session: SshSession, server: CaddyServerEntity): Promise<void> {
    const active = await this.systemctl(session, server, 'is-active');
    if (active.code !== 0 || active.stdout.trim() !== 'active') {
      throw new AppError(
        'CADDY_SERVICE_INACTIVE',
        'Caddy 服务未处于 active 状态，已取消配置变更',
        409,
        active.stderr || active.stdout,
      );
    }
  }

  private systemctl(session: SshSession, server: CaddyServerEntity, action: 'reload' | 'restart' | 'is-active') {
    assertSystemdUnit(server.serviceName);
    return session.exec(`systemctl ${action} ${shellQuote(server.serviceName)}`, { elevated: true });
  }

  private inWorkingDirectory(server: CaddyServerEntity, command: string): string {
    const directory = server.workingDirectory || posix.dirname(server.configPath);
    assertAbsolutePath(directory, 'workingDirectory');
    return `cd -- ${shellQuote(directory)} && ${command}`;
  }

  private async pruneBackups(session: SshSession, directory: string): Promise<void> {
    const command = `find ${shellQuote(directory)} -maxdepth 1 -type f -name '.caddy-mgr-backup-*' -printf '%T@|%p\\n' 2>/dev/null | sort -nr | awk 'NR>5 { sub(/^[^|]*\\|/, ""); print }' | while IFS= read -r file; do rm -f -- "$file"; done`;
    await session.exec(command, { elevated: true }).catch(() => undefined);
  }

  private async snapshotRemoteConfig(serverId: string, config: RemoteConfig): Promise<void> {
    const latest = await this.revisions.findOne({ where: { serverId }, order: { createdAt: 'DESC' } });
    if (latest?.hash === config.baseHash) return;
    await this.saveRevision(serverId, config.content, config.baseHash, latest ? 'external' : 'baseline', null);
  }

  private async ensureRevision(serverId: string, content: string, hash: string, source: ConfigRevision['source'], operationId: string | null): Promise<void> {
    const latest = await this.revisions.findOne({ where: { serverId }, order: { createdAt: 'DESC' } });
    if (latest?.hash === hash) return;
    await this.saveRevision(serverId, content, hash, source, operationId);
  }

  private async saveRevision(serverId: string, content: string, hash: string, source: ConfigRevision['source'], operationId: string | null): Promise<void> {
    await this.revisions.save(this.revisions.create({
      serverId,
      contentCipher: this.crypto.encryptString(content),
      hash,
      source,
      operationId,
      size: Buffer.byteLength(content, 'utf8'),
    }));
  }

  private async requireRevision(serverId: string, revisionId: string): Promise<ConfigRevisionEntity> {
    const revision = await this.revisions.findOne({ where: { id: revisionId, serverId } });
    if (!revision) throw new AppError('REVISION_NOT_FOUND', '配置历史不存在', 404);
    return revision;
  }

  private async serializeRevision(revision: ConfigRevisionEntity, decryptedContent?: string): Promise<ConfigRevision> {
    let size = revision.size;
    if (typeof size !== 'number') {
      const content = decryptedContent ?? this.crypto.decryptString(revision.contentCipher);
      size = Buffer.byteLength(content, 'utf8');
      revision.size = size;
      await this.revisions.save(revision);
    }
    return {
      id: revision.id,
      serverId: revision.serverId,
      hash: revision.hash,
      source: revision.source,
      operationId: revision.operationId,
      createdAt: revision.createdAt.toISOString(),
      size,
    };
  }

  private assertContent(content: string): void {
    const size = Buffer.byteLength(content, 'utf8');
    if (size > runtimeConfig.maxConfigBytes) throw new AppError('CONFIG_TOO_LARGE', `配置超过 ${runtimeConfig.maxConfigBytes} 字节限制`, 413);
    if (content.includes('\u0000')) throw new AppError('CONFIG_NOT_TEXT', '配置包含非法 NUL 字符', 422);
  }

  private assertRecoveryBackupPath(configPath: string, backupPath: string): void {
    assertAbsolutePath(configPath, 'configPath');
    assertAbsolutePath(backupPath, 'backupPath');
    const expectedDirectory = posix.dirname(configPath);
    const name = posix.basename(backupPath);
    if (
      posix.dirname(backupPath) !== expectedDirectory
      || !/^\.caddy-mgr-backup-\d+-[0-9a-f-]{36}$/i.test(name)
    ) {
      throw new AppError('OPERATION_BACKUP_INVALID', '远端备份路径无效，已拒绝恢复', 422);
    }
  }
}
