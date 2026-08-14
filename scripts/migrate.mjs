import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { ensureMigrationMasterKey } from './master-key.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const envPath = resolve(projectRoot, '.env.production');
const action = process.argv[2];

if (action !== 'run' && action !== 'revert') {
  throw new Error('用法：node scripts/migrate.mjs <run|revert>');
}
if (!existsSync(envPath)) {
  throw new Error('缺少 .env.production；拒绝对默认或未知数据库执行 migration');
}

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator < 1) continue;

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, '').trim();
    }
    values[key] = value.replace(/\\n/gu, '\n');
  }
  return values;
}

function absoluteFromProject(value) {
  return isAbsolute(value) ? value : resolve(projectRoot, value);
}

const fileEnvironment = parseEnvFile(readFileSync(envPath, 'utf8'));
const childEnvironment = { ...fileEnvironment, ...process.env, NODE_ENV: 'production' };
const dataDirectory = absoluteFromProject(
  childEnvironment.API_DATA_DIR ?? childEnvironment.DATA_DIR ?? './data',
);
const databasePath = absoluteFromProject(
  childEnvironment.API_DATABASE_PATH ??
    childEnvironment.DATABASE_PATH ??
    resolve(dataDirectory, 'caddy-manager.sqlite'),
);
const masterKeyPath = absoluteFromProject(
  childEnvironment.API_MASTER_KEY_PATH ??
    childEnvironment.MASTER_KEY_PATH ??
    resolve(dataDirectory, 'master.key'),
);

// The TypeORM CLI runs with apps/api as cwd. Force all storage paths to absolute
// project-root-based values so it cannot silently migrate apps/api/data instead.
Object.assign(childEnvironment, {
  API_DATA_DIR: dataDirectory,
  DATA_DIR: dataDirectory,
  API_DATABASE_PATH: databasePath,
  DATABASE_PATH: databasePath,
  API_MASTER_KEY_PATH: masterKeyPath,
  MASTER_KEY_PATH: masterKeyPath,
});

// TypeORM may create SQLite as soon as it initializes. Establish or validate
// the encryption key first so a fresh migration cannot leave a keyless database.
ensureMigrationMasterKey({ databasePath, masterKeyPath });

const pnpmArguments = [
  '--filter',
  '@caddy-mgr/api',
  'exec',
  'typeorm-ts-node-commonjs',
  '-d',
  'src/database/data-source.ts',
  `migration:${action}`,
];
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const commandArguments = npmExecPath ? [npmExecPath, ...pnpmArguments] : pnpmArguments;
const result = spawnSync(command, commandArguments, {
  cwd: projectRoot,
  env: childEnvironment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.signal) {
  throw new Error(`migration 子进程被信号 ${result.signal} 终止`);
}
process.exitCode = result.status ?? 1;
