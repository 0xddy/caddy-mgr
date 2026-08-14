import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
const envPath = resolve(projectRoot, '.env.production');
const errors = [];
const warnings = [];

function parseEnvFile(contents) {
  const result = {};

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

    result[key] = value.replace(/\\n/gu, '\n');
  }

  return result;
}

function resolveFromProject(value) {
  return isAbsolute(value) ? value : resolve(projectRoot, value);
}

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
if (nodeMajor !== 24) {
  errors.push(`需要 Node.js 24.x，当前为 ${process.versions.node}`);
}

if (!existsSync(envPath)) {
  errors.push('缺少 .env.production；请先复制 .env.production.example 并按实际环境修改');
}

const env = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
for (const key of [
  'API_HOST',
  'API_PORT',
  'PUBLIC_APP_URL',
  'DATABASE_PATH',
  'MASTER_KEY_PATH',
  'SESSION_TTL_SECONDS',
  'NITRO_HOST',
  'NITRO_PORT',
  'NUXT_API_BASE_URL',
]) {
  if (!env[key]) errors.push(`.env.production 缺少 ${key}`);
}

const hasCertificate = Boolean(env.NITRO_SSL_CERT);
const hasCertificateKey = Boolean(env.NITRO_SSL_KEY);
if (hasCertificate !== hasCertificateKey) {
  errors.push('NITRO_SSL_CERT 与 NITRO_SSL_KEY 必须同时配置或同时留空');
}

for (const key of ['API_PORT', 'NITRO_PORT']) {
  const port = Number(env[key]);
  if (env[key] && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
    errors.push(`${key} 必须是 1-65535 之间的整数`);
  }
}

if (env.SESSION_TTL_SECONDS) {
  const ttl = Number(env.SESSION_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl < 300) {
    errors.push('SESSION_TTL_SECONDS 必须是至少 300 秒的整数');
  }
}

for (const key of [
  'LOGIN_MAX_FAILURES',
  'LOGIN_FAILURE_WINDOW_SECONDS',
  'LOGIN_LOCKOUT_SECONDS',
  'CAPTCHA_TTL_SECONDS',
  'CAPTCHA_MAX_PER_MINUTE',
]) {
  const value = Number(env[key]);
  if (env[key] !== undefined && (!Number.isInteger(value) || value < 1)) {
    errors.push(`${key} must be a positive integer`);
  }
}

if (['1', 'true'].includes((env.CAPTCHA_DEBUG_CODE ?? '').toLowerCase())) {
  errors.push('CAPTCHA_DEBUG_CODE must remain false in .env.production');
}

if (env.INITIAL_ADMIN_PASSWORD) {
  if (env.INITIAL_ADMIN_PASSWORD.length < 12) {
    errors.push('INITIAL_ADMIN_PASSWORD 必须至少 12 个字符');
  }
  if (env.INITIAL_ADMIN_PASSWORD === 'admin') {
    errors.push('INITIAL_ADMIN_PASSWORD 不能使用初始默认密码 admin');
  }
}

for (const entrypoint of ['apps/api/dist/main.js', 'apps/web/.output/server/index.mjs']) {
  const absoluteEntrypoint = resolve(projectRoot, entrypoint);
  if (!existsSync(absoluteEntrypoint)) {
    errors.push(`缺少生产构建入口：${entrypoint}；请先运行 pnpm build`);
  }
}

if (hasCertificate && !existsSync(resolveFromProject(env.NITRO_SSL_CERT))) {
  errors.push(`找不到 NITRO_SSL_CERT：${resolveFromProject(env.NITRO_SSL_CERT)}`);
}
if (hasCertificateKey && !existsSync(resolveFromProject(env.NITRO_SSL_KEY))) {
  errors.push(`找不到 NITRO_SSL_KEY：${resolveFromProject(env.NITRO_SSL_KEY)}`);
}

if (env.DATABASE_PATH && env.MASTER_KEY_PATH) {
  const databasePath = resolveFromProject(env.DATABASE_PATH);
  const masterKeyPath = resolveFromProject(env.MASTER_KEY_PATH);
  if (existsSync(databasePath) && !existsSync(masterKeyPath)) {
    errors.push(
      `数据库已存在但主密钥缺失：${masterKeyPath}。请从备份恢复密钥，不要生成新密钥`,
    );
  }
  if (existsSync(masterKeyPath) && readFileSync(masterKeyPath).length !== 32) {
    errors.push(`MASTER_KEY_PATH must point to an exact 32-byte key: ${masterKeyPath}`);
  }
  if (!existsSync(dirname(databasePath))) warnings.push(`将创建数据库目录：${dirname(databasePath)}`);
  if (!existsSync(dirname(masterKeyPath))) warnings.push(`将创建密钥目录：${dirname(masterKeyPath)}`);
}

for (const warning of warnings) console.warn(`[警告] ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[错误] ${error}`);
  process.exitCode = 1;
} else {
  console.log('生产运行前检查通过（未输出任何秘密值）。');
}
