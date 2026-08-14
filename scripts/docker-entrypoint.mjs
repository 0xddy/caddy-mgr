import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const apiPort = process.env.API_PORT || '3001';
const children = [];
let shuttingDown = false;

function resolveFromProject(value) {
  return isAbsolute(value) ? value : resolve(projectRoot, value);
}

function ensureRuntimeDirectories() {
  const databasePath = process.env.DATABASE_PATH || './var/data/caddy-mgr.sqlite';
  const masterKeyPath = process.env.MASTER_KEY_PATH || './var/secrets/master.key';
  mkdirSync(dirname(resolveFromProject(databasePath)), { recursive: true });
  mkdirSync(dirname(resolveFromProject(masterKeyPath)), { recursive: true });
}

function spawnNode(script) {
  const child = spawn(process.execPath, [script], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    const exitCode = signal ? 1 : code ?? 1;
    shutdown(exitCode);
  });
  return child;
}

function shutdown(code = 1) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 8_000).unref();
}

async function waitForApi() {
  const url = `http://127.0.0.1:${apiPort}/api/health`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (shuttingDown) throw new Error('API 进程已退出');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // API is still booting or running migrations.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`API 未在 http://127.0.0.1:${apiPort}/api/health 就绪`);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

ensureRuntimeDirectories();
spawnNode(resolve(projectRoot, 'apps/api/dist/main.js'));
try {
  await waitForApi();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
  await new Promise(() => undefined);
}
if (!shuttingDown) spawnNode(resolve(projectRoot, 'scripts/start-web.mjs'));
