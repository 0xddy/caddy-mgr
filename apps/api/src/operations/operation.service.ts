import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Operation, OperationKind, OperationStatus } from '../common/contracts';
import { AppError } from '../common/app-error';
import { cleanOutput } from '../common/serialize';
import { OperationEntity } from '../database/entities';

const MAX_OPERATION_SUMMARY = 16 * 1024;
const SECRET_FIELD = /(?:password|passwd|passphrase|private[_-]?key|sudo[_-]?password|authorization|cookie|token|secret|credential)/i;

function redactDiagnostic(value: string): string {
  return cleanOutput(value, [], MAX_OPERATION_SUMMARY)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(
      /\b(password|passwd|passphrase|private[_-]?key|sudo[_-]?password|authorization|cookie|token|secret|credential)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1$2[REDACTED]',
    );
}

function safeDiagnosticDetails(details: unknown): string {
  if (typeof details === 'string') return redactDiagnostic(details);
  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(details, (key, value: unknown) => {
      if (key && SECRET_FIELD.test(key)) return '[REDACTED]';
      if (typeof value === 'string') return redactDiagnostic(value);
      if (typeof value === 'bigint') return value.toString();
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
    return cleanOutput(serialized ?? String(details), [], MAX_OPERATION_SUMMARY);
  } catch {
    return '[Unserializable diagnostic details]';
  }
}

export interface OperationCompletion {
  status?: Extract<OperationStatus, 'succeeded' | 'rolled_back' | 'needs_attention'>;
  summary?: string;
  errorCode?: string;
  backupPath?: string;
}

export class OperationContext {
  constructor(
    readonly operation: OperationEntity,
    private readonly repository: Repository<OperationEntity>,
  ) {}

  async stage(stage: string, summary?: string): Promise<void> {
    this.operation.stage = stage;
    if (summary !== undefined) this.operation.summary = summary;
    await this.repository.save(this.operation);
  }

  async backup(path: string): Promise<void> {
    this.operation.backupPath = path;
    await this.repository.save(this.operation);
  }
}

@Injectable()
export class OperationService {
  private readonly logger = new Logger(OperationService.name);
  private readonly tails = new Map<string, Promise<void>>();

  constructor(@InjectRepository(OperationEntity) private readonly operations: Repository<OperationEntity>) {}

  async enqueue(
    serverId: string,
    kind: OperationKind,
    runner: (context: OperationContext) => Promise<OperationCompletion>,
    lockKey = serverId,
  ): Promise<{ operationId: string }> {
    const operation = await this.operations.save(
      this.operations.create({ serverId, kind, status: 'queued', stage: 'queued', summary: null, errorCode: null, backupPath: null }),
    );
    const previous = this.tails.get(lockKey) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.run(operation, runner));
    this.tails.set(lockKey, next);
    void next.finally(() => {
      if (this.tails.get(lockKey) === next) this.tails.delete(lockKey);
    });
    return { operationId: operation.id };
  }

  async get(id: string): Promise<Operation> {
    const operation = await this.operations.findOne({ where: { id } });
    if (!operation) throw new AppError('OPERATION_NOT_FOUND', '操作不存在', 404);
    return this.serialize(operation);
  }

  async list(serverId?: string, limit = 50): Promise<Operation[]> {
    const operations = await this.operations.find({
      ...(serverId ? { where: { serverId } } : {}),
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return operations.map((operation) => this.serialize(operation));
  }

  private async run(
    operation: OperationEntity,
    runner: (context: OperationContext) => Promise<OperationCompletion>,
  ): Promise<void> {
    operation.status = 'running';
    operation.stage = 'connecting';
    operation.startedAt = new Date();
    await this.operations.save(operation);
    try {
      const completion = await runner(new OperationContext(operation, this.operations));
      operation.status = completion.status ?? 'succeeded';
      operation.stage = operation.status === 'succeeded' ? 'completed' : operation.status;
      operation.summary = redactDiagnostic(completion.summary ?? operation.summary ?? '操作成功完成');
      operation.errorCode = completion.errorCode ?? null;
      operation.backupPath = completion.backupPath ?? operation.backupPath;
    } catch (error) {
      operation.status = 'failed';
      operation.stage = 'failed';
      operation.errorCode = error instanceof AppError ? error.code : 'REMOTE_OPERATION_FAILED';
      const message = redactDiagnostic(error instanceof Error ? error.message : '远程操作失败');
      const details = error instanceof AppError && error.details !== undefined
        ? safeDiagnosticDetails(error.details)
        : '';
      operation.summary = cleanOutput([message, details].filter(Boolean).join('\n'), [], MAX_OPERATION_SUMMARY);
      this.logger.error(`Operation ${operation.id} failed: ${operation.summary}`);
    } finally {
      operation.finishedAt = new Date();
      await this.operations.save(operation);
    }
  }

  private serialize(operation: OperationEntity): Operation {
    return {
      id: operation.id,
      serverId: operation.serverId,
      kind: operation.kind,
      status: operation.status,
      stage: operation.stage,
      summary: operation.summary,
      errorCode: operation.errorCode,
      backupPath: operation.backupPath,
      createdAt: operation.createdAt.toISOString(),
      startedAt: operation.startedAt?.toISOString() ?? null,
      finishedAt: operation.finishedAt?.toISOString() ?? null,
    };
  }
}
