const fs = require('node:fs');
const path = require('node:path');

const projectRoot = __dirname;
const envFile = path.join(projectRoot, '.env.production');

function parseEnv(contents) {
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

if (!fs.existsSync(envFile)) {
  throw new Error('缺少 .env.production；请复制 .env.production.example 并配置后再启动 PM2');
}

const fromFile = parseEnv(fs.readFileSync(envFile, 'utf8'));
const productionEnv = Object.fromEntries(
  Object.entries(fromFile).map(([key, value]) => [key, process.env[key] ?? value]),
);
productionEnv.NODE_ENV = 'production';

const common = {
  cwd: projectRoot,
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  watch: false,
  time: true,
  kill_timeout: 10_000,
  listen_timeout: 15_000,
  min_uptime: '10s',
  max_restarts: 10,
  merge_logs: true,
  env: productionEnv,
  env_production: productionEnv,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'caddy-mgr-api',
      script: 'apps/api/dist/main.js',
      interpreter: process.execPath,
      max_memory_restart: '512M',
      out_file: 'var/logs/api-out.log',
      error_file: 'var/logs/api-error.log',
    },
    {
      ...common,
      name: 'caddy-mgr-web',
      script: 'scripts/start-web.mjs',
      interpreter: process.execPath,
      max_memory_restart: '768M',
      out_file: 'var/logs/web-out.log',
      error_file: 'var/logs/web-error.log',
    },
  ],
};
