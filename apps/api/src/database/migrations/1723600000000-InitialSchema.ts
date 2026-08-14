import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1723600000000 implements MigrationInterface {
  name = 'InitialSchema1723600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" varchar PRIMARY KEY NOT NULL,
        "username" text NOT NULL,
        "passwordHash" text NOT NULL,
        "usingDefaultPassword" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_admin_username" ON "admins" ("username")');
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tokenHash" text NOT NULL,
        "adminId" varchar NOT NULL,
        "expiresAt" datetime NOT NULL,
        "lastSeenAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_session_admin" FOREIGN KEY ("adminId") REFERENCES "admins" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_session_token" ON "sessions" ("tokenHash")');
    await queryRunner.query('CREATE INDEX "IDX_session_admin" ON "sessions" ("adminId")');
    await queryRunner.query('CREATE INDEX "IDX_session_expiry" ON "sessions" ("expiresAt")');
    await queryRunner.query(`
      CREATE TABLE "caddy_servers" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "host" text NOT NULL,
        "port" integer NOT NULL DEFAULT (22),
        "username" text NOT NULL,
        "authMethod" text NOT NULL,
        "elevationMethod" text NOT NULL,
        "credentialCipher" text NOT NULL,
        "hostFingerprint" text NOT NULL,
        "serviceName" text NOT NULL,
        "caddyBinary" text NOT NULL,
        "configPath" text NOT NULL,
        "adapter" text NOT NULL DEFAULT ('caddyfile'),
        "serviceUser" text,
        "workingDirectory" text,
        "supported" boolean NOT NULL DEFAULT (1),
        "discoveryJson" text,
        "lastConnectionStatus" text,
        "lastConnectedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "operations" (
        "id" varchar PRIMARY KEY NOT NULL,
        "serverId" varchar NOT NULL,
        "kind" text NOT NULL,
        "status" text NOT NULL DEFAULT ('queued'),
        "stage" text NOT NULL DEFAULT ('queued'),
        "summary" text,
        "errorCode" text,
        "backupPath" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "startedAt" datetime,
        "finishedAt" datetime,
        CONSTRAINT "FK_operation_server" FOREIGN KEY ("serverId") REFERENCES "caddy_servers" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_operation_server_created" ON "operations" ("serverId", "createdAt")');
    await queryRunner.query(`
      CREATE TABLE "config_revisions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "serverId" varchar NOT NULL,
        "hash" text NOT NULL,
        "contentCipher" text NOT NULL,
        "source" text NOT NULL,
        "operationId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_revision_server" FOREIGN KEY ("serverId") REFERENCES "caddy_servers" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_revision_operation" FOREIGN KEY ("operationId") REFERENCES "operations" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_revision_server_created" ON "config_revisions" ("serverId", "createdAt")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "config_revisions"');
    await queryRunner.query('DROP TABLE "operations"');
    await queryRunner.query('DROP TABLE "caddy_servers"');
    await queryRunner.query('DROP TABLE "sessions"');
    await queryRunner.query('DROP TABLE "admins"');
  }
}
