import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CaddyVersion1723600003000 implements MigrationInterface {
  name = 'CaddyVersion1723600003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasCaddyVersion = await queryRunner.hasColumn('caddy_servers', 'caddyVersion');
    if (!hasCaddyVersion) {
      await queryRunner.query('ALTER TABLE "caddy_servers" ADD COLUMN "caddyVersion" text');
    }
    await queryRunner.query(`
      UPDATE "caddy_servers"
      SET "caddyVersion" = CASE
        WHEN json_valid("discoveryJson")
          THEN CASE
            WHEN json_type("discoveryJson", '$.version') = 'text'
              THEN json_extract("discoveryJson", '$.version')
            ELSE NULL
          END
        ELSE NULL
      END
      WHERE "caddyVersion" IS NULL OR trim("caddyVersion") = ''
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('caddy_servers', 'caddyVersion')) {
      await queryRunner.query('ALTER TABLE "caddy_servers" DROP COLUMN "caddyVersion"');
    }
  }
}
