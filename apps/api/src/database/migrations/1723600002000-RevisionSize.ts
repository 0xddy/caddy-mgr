import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RevisionSize1723600002000 implements MigrationInterface {
  name = 'RevisionSize1723600002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "config_revisions" ADD COLUMN "size" integer');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "config_revisions" DROP COLUMN "size"');
  }
}
