import type { BetterSqlite3ConnectionOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runtimeConfig } from '../common/runtime-config';
import { ENTITIES } from './entities';
import { InitialSchema1723600000000 } from './migrations/1723600000000-InitialSchema';
import { TargetIdentity1723600001000 } from './migrations/1723600001000-TargetIdentity';
import { RevisionSize1723600002000 } from './migrations/1723600002000-RevisionSize';

interface SqliteDatabase {
  pragma(statement: string): unknown;
}

mkdirSync(dirname(runtimeConfig.databasePath), { recursive: true });

export const typeormOptions: BetterSqlite3ConnectionOptions = {
  type: 'better-sqlite3',
  database: runtimeConfig.databasePath,
  entities: [...ENTITIES],
  migrations: [InitialSchema1723600000000, TargetIdentity1723600001000, RevisionSize1723600002000],
  migrationsRun: true,
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
  prepareDatabase(database: SqliteDatabase) {
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
  },
};
