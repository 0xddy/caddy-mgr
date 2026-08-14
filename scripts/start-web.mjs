import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const webEntrypoint = resolve(projectRoot, 'apps/web/.output/server/index.mjs');

function absoluteFromProject(value) {
  return isAbsolute(value) ? value : resolve(projectRoot, value);
}

const certificatePath = process.env.NITRO_SSL_CERT?.trim();
const certificateKeyPath = process.env.NITRO_SSL_KEY?.trim();
if (Boolean(certificatePath) !== Boolean(certificateKeyPath)) {
  throw new Error('NITRO_SSL_CERT 与 NITRO_SSL_KEY 必须同时配置或同时留空');
}

if (certificatePath && certificateKeyPath) {
  // Nitro expects PEM contents in these variables, while operators configure
  // filesystem paths. Read them before importing the generated server entry.
  process.env.NITRO_SSL_CERT = readFileSync(absoluteFromProject(certificatePath), 'utf8');
  process.env.NITRO_SSL_KEY = readFileSync(absoluteFromProject(certificateKeyPath), 'utf8');
} else {
  delete process.env.NITRO_SSL_CERT;
  delete process.env.NITRO_SSL_KEY;
}

if (!existsSync(webEntrypoint)) {
  throw new Error(`缺少 Nuxt 生产入口 ${webEntrypoint}；请先运行 pnpm build`);
}

await import(pathToFileURL(webEntrypoint).href);
