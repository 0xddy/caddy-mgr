import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a durable uniqueness key for the physical Caddy target. Existing rows
 * receive a legacy suffix so an upgrade never destroys or arbitrarily merges
 * user data; application-level canonical locking still serializes such rows.
 */
export class TargetIdentity1723600001000 implements MigrationInterface {
  name = 'TargetIdentity1723600001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "caddy_servers" ADD COLUMN "targetKey" text NOT NULL DEFAULT (\'\')');
    await queryRunner.query(`
      UPDATE "caddy_servers"
      SET "targetKey" = "hostFingerprint" || char(10) || "serviceName" || char(10) || "configPath" || char(10) || 'legacy:' || "id"
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_caddy_server_target" ON "caddy_servers" ("targetKey")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_caddy_server_target"');
    await queryRunner.query('ALTER TABLE "caddy_servers" DROP COLUMN "targetKey"');
  }
}
