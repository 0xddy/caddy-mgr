import type { Repository } from 'typeorm';
import { AppError } from '../common/app-error';
import type { OperationEntity } from '../database/entities';
import { OperationService } from './operation.service';

function repositoryHarness() {
  let sequence = 0;
  const rows = new Map<string, OperationEntity>();
  const repository = {
    create: (value: Partial<OperationEntity>) => ({
      id: `operation-${++sequence}`,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      ...value,
    }) as OperationEntity,
    save: async (value: OperationEntity) => {
      rows.set(value.id, value);
      return value;
    },
    findOne: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
    find: async () => [...rows.values()],
  } as unknown as Repository<OperationEntity>;
  return { repository, rows };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('timed out waiting for operation');
}

describe('OperationService', () => {
  it('serializes different database rows that share the same physical target lock', async () => {
    const test = repositoryHarness();
    const service = new OperationService(test.repository);
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = await service.enqueue('server-one', 'reload', async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
      return { status: 'succeeded' };
    }, 'same-fingerprint\ncaddy.service\n/etc/caddy/Caddyfile');
    const second = await service.enqueue('server-two', 'restart', async () => {
      events.push('second:start');
      return { status: 'succeeded' };
    }, 'same-fingerprint\ncaddy.service\n/etc/caddy/Caddyfile');

    await waitUntil(() => events.length > 0);
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await waitUntil(() => test.rows.get(second.operationId)?.status === 'succeeded');
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    expect(test.rows.get(first.operationId)?.status).toBe('succeeded');
  });

  it('persists bounded diagnostics while redacting likely secrets', async () => {
    const test = repositoryHarness();
    const service = new OperationService(test.repository);
    (service as unknown as { logger: { error: (message: string) => void } }).logger.error = vi.fn();
    const result = await service.enqueue('server-one', 'apply', async () => {
      throw new AppError('CADDY_VALIDATION_FAILED', 'validation failed', 422, {
        stderr: 'module failed: password=hunter2',
        privateKey: 'private-key-value',
        nested: { token: 'bearer-value' },
        longOutput: 'x'.repeat(40_000),
      });
    });

    await waitUntil(() => test.rows.get(result.operationId)?.status === 'failed');
    const operation = test.rows.get(result.operationId)!;
    expect(operation.errorCode).toBe('CADDY_VALIDATION_FAILED');
    expect(operation.summary).toContain('validation failed');
    expect(operation.summary).toContain('[REDACTED]');
    expect(operation.summary).not.toContain('hunter2');
    expect(operation.summary).not.toContain('private-key-value');
    expect(operation.summary).not.toContain('bearer-value');
    expect(operation.summary!.length).toBeLessThanOrEqual(16 * 1024);
  });
});
