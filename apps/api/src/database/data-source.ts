import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { runtimeConfig } from '../common/runtime-config';
import { typeormOptions } from './typeorm-options';

mkdirSync(dirname(runtimeConfig.databasePath), { recursive: true });

/**
 * The TypeORM CLI initializes this data source before running every command.
 * In particular, `migration:revert` must not first auto-apply pending migrations.
 * Nest keeps using `typeormOptions`, where startup migrations remain enabled.
 */
export const cliTypeormOptions = {
  ...typeormOptions,
  migrationsRun: false,
} satisfies typeof typeormOptions;

export default new DataSource(cliTypeormOptions);
