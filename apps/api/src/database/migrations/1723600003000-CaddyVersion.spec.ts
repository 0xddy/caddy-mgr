import type { QueryRunner } from 'typeorm';
import { CaddyVersion1723600003000 } from './1723600003000-CaddyVersion';

function queryRunner(hasColumn: boolean) {
  const query = vi.fn(async () => undefined);
  return {
    runner: {
      hasColumn: vi.fn(async () => hasColumn),
      query,
    } as unknown as QueryRunner,
    query,
  };
}

describe('CaddyVersion1723600003000', () => {
  it('adds the version column only when it is missing', async () => {
    const missing = queryRunner(false);
    await new CaddyVersion1723600003000().up(missing.runner);

    expect(missing.query).toHaveBeenCalledWith(
      'ALTER TABLE "caddy_servers" ADD COLUMN "caddyVersion" text',
    );

    const existing = queryRunner(true);
    await new CaddyVersion1723600003000().up(existing.runner);

    expect(existing.query).not.toHaveBeenCalledWith(
      'ALTER TABLE "caddy_servers" ADD COLUMN "caddyVersion" text',
    );
    expect(existing.query).toHaveBeenCalledOnce();
  });

  it('drops the version column only when it exists', async () => {
    const missing = queryRunner(false);
    await new CaddyVersion1723600003000().down(missing.runner);
    expect(missing.query).not.toHaveBeenCalled();

    const existing = queryRunner(true);
    await new CaddyVersion1723600003000().down(existing.runner);
    expect(existing.query).toHaveBeenCalledWith(
      'ALTER TABLE "caddy_servers" DROP COLUMN "caddyVersion"',
    );
  });
});
