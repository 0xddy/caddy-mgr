import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return value.toLowerCase() === 'true' || value === '1';
}

const dataDirectory = resolve(process.env.API_DATA_DIR ?? process.env.DATA_DIR ?? './data');
const databasePath = resolve(process.env.API_DATABASE_PATH ?? process.env.DATABASE_PATH ?? `${dataDirectory}/caddy-manager.sqlite`);
const publicUrl = process.env.PUBLIC_URL ?? process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Captured before TypeORM opens SQLite so a missing key is never mistaken for a fresh install. */
export const runtimeConfig = Object.freeze({
  host: process.env.API_HOST ?? '127.0.0.1',
  port: positiveInteger(process.env.API_PORT, 3001),
  publicUrl,
  dataDirectory,
  databasePath,
  masterKeyPath: resolve(process.env.API_MASTER_KEY_PATH ?? process.env.MASTER_KEY_PATH ?? `${dataDirectory}/master.key`),
  databaseExistedAtBoot: existsSync(databasePath),
  sessionTtlSeconds: positiveInteger(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7),
  sshConnectTimeoutMs: positiveInteger(process.env.SSH_CONNECT_TIMEOUT_MS, 15_000),
  sshCommandTimeoutMs: positiveInteger(process.env.SSH_COMMAND_TIMEOUT_MS, 30_000),
  sshIdleTimeoutMs: positiveInteger(process.env.SSH_IDLE_TIMEOUT_MS, 5 * 60_000),
  maxConfigBytes: positiveInteger(process.env.MAX_CONFIG_BYTES, 2 * 1024 * 1024),
  sessionCookieSecure: optionalBoolean(process.env.SESSION_COOKIE_SECURE) ?? publicUrl.startsWith('https://'),
  trustProxy: optionalBoolean(process.env.TRUST_PROXY) ?? false,
  loginMaxFailures: positiveInteger(process.env.LOGIN_MAX_FAILURES, 5),
  loginFailureWindowSeconds: positiveInteger(process.env.LOGIN_FAILURE_WINDOW_SECONDS, 15 * 60),
  loginLockoutSeconds: positiveInteger(process.env.LOGIN_LOCKOUT_SECONDS, 15 * 60),
  captchaTtlSeconds: positiveInteger(process.env.CAPTCHA_TTL_SECONDS, 5 * 60),
  captchaMaxPerMinute: positiveInteger(process.env.CAPTCHA_MAX_PER_MINUTE, 30),
  /** Smoke/dev only: include plaintext captcha code in JSON. Never enable in production. */
  captchaDebugCode: optionalBoolean(process.env.CAPTCHA_DEBUG_CODE) ?? false,
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || 'admin',
});

export type RuntimeConfig = typeof runtimeConfig;
