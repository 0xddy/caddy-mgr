import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const envPath = resolve(projectRoot, '.env.production');

if (!existsSync(envPath)) {
  throw new Error('缺少 .env.production；请先复制 .env.production.example');
}

function readEnvValue(name) {
  const contents = readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim().replace(/^export\s+/u, '');
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1 || line.slice(0, separator).trim() !== name) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, '').trim();
    }
    return value;
  }
  return undefined;
}

function resolveFromProject(path) {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

const databasePath = readEnvValue('DATABASE_PATH') ?? './var/data/caddy-mgr.sqlite';
const masterKeyPath = readEnvValue('MASTER_KEY_PATH') ?? './var/secrets/master.key';
const directories = [
  dirname(resolveFromProject(databasePath)),
  dirname(resolveFromProject(masterKeyPath)),
  resolve(projectRoot, 'var/logs'),
];

for (const directory of new Set(directories)) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
}

console.log('运行时目录已准备完成。');
