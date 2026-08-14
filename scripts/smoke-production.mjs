import { closeSync, existsSync, mkdirSync, openSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const smokeDirectory = join(projectRoot, 'var', `smoke-${randomUUID()}`);
const databasePath = join(smokeDirectory, 'caddy-manager.sqlite');
const masterKeyPath = join(smokeDirectory, 'master.key');
const apiOrigin = 'http://127.0.0.1:39101';
const webOrigin = 'http://127.0.0.1:39100';

mkdirSync(smokeDirectory, { recursive: true });

const childEnvironment = {
  ...process.env,
  API_HOST: '127.0.0.1',
  API_PORT: '39101',
  DATABASE_PATH: databasePath,
  MASTER_KEY_PATH: masterKeyPath,
  PUBLIC_APP_URL: webOrigin,
  SESSION_COOKIE_SECURE: 'false',
  // Simulate a trusted public reverse proxy in front of Nuxt.
  TRUST_PROXY: 'true',
  LOGIN_MAX_FAILURES: '3',
  LOGIN_LOCKOUT_SECONDS: '60',
  CAPTCHA_DEBUG_CODE: 'true',
  NITRO_HOST: '127.0.0.1',
  NITRO_PORT: '39100',
  NUXT_API_BASE_URL: apiOrigin,
};

const children = new Set();
const logDescriptors = [];

function start(name, entrypoint) {
  const stdout = openSync(join(smokeDirectory, `${name}.out.log`), 'a');
  const stderr = openSync(join(smokeDirectory, `${name}.err.log`), 'a');
  logDescriptors.push(stdout, stderr);
  const child = spawn(process.execPath, [entrypoint], {
    cwd: projectRoot,
    env: childEnvironment,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  if (!(await waitForExit(child, 5_000))) {
    child.kill('SIGKILL');
    await waitForExit(child, 2_000);
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function waitFor(url, attempts = 80) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError ?? new Error(`${url} did not become ready`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function jsonBody(value, headers = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  };
}

async function loginWithCaptcha(username, password, clientIp) {
  const forwardedHeaders = clientIp ? { 'x-forwarded-for': clientIp } : {};
  const captcha = await jsonRequest(`${webOrigin}/api/auth/captcha`, { headers: forwardedHeaders });
  if (!captcha.response.ok || !captcha.body?.captchaId || !captcha.body?.debugCode) {
    throw new Error('Captcha issuance failed or CAPTCHA_DEBUG_CODE is disabled');
  }
  return jsonRequest(
    `${webOrigin}/api/auth/login`,
    jsonBody(
      {
        username,
        password,
        captchaId: captcha.body.captchaId,
        captchaCode: captcha.body.debugCode,
      },
      forwardedHeaders,
    ),
  );
}

let api;
try {
  api = start('api', 'apps/api/dist/main.js');
  const healthResponse = await waitFor(`${apiOrigin}/api/health`);
  const health = await healthResponse.json();
  if (health.status !== 'ok') throw new Error('The API health endpoint was not healthy');
  if (!existsSync(databasePath)) throw new Error('SQLite database was not created');
  if (!existsSync(masterKeyPath) || statSync(masterKeyPath).size !== 32) {
    throw new Error('The generated master key is not exactly 32 bytes');
  }

  start('web', 'scripts/start-web.mjs');
  const loginPageResponse = await waitFor(`${webOrigin}/login`);
  const loginPage = await loginPageResponse.text();
  if (!loginPage.includes('<html')) throw new Error('The Nuxt login page was not server-rendered');

  const noisyClientIp = '203.0.113.10';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const failedLogin = await loginWithCaptcha('admin', `wrong-password-${attempt}`, noisyClientIp);
    if (failedLogin.response.status !== 401) {
      throw new Error(
        `Expected a credential failure before lockout, received HTTP ${failedLogin.response.status}`,
      );
    }
  }
  const lockedLogin = await loginWithCaptcha('admin', 'admin', noisyClientIp);
  if (
    lockedLogin.response.status !== 429 ||
    lockedLogin.body?.error?.code !== 'LOGIN_RATE_LIMITED'
  ) {
    throw new Error('The repeated-login lockout was not applied to the noisy client');
  }

  const initialLogin = await loginWithCaptcha('admin', 'admin', '203.0.113.11');
  if (
    !initialLogin.response.ok ||
    initialLogin.body?.username !== 'admin' ||
    !initialLogin.body?.usingDefaultPassword
  ) {
    throw new Error('The initial admin credentials or default-password flag failed');
  }
  const cookie = initialLogin.response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('The login response did not set the session cookie');

  const me = await jsonRequest(`${webOrigin}/api/auth/me`, { headers: { cookie } });
  if (!me.response.ok || me.body?.username !== 'admin') {
    throw new Error('The session cookie did not survive the Nuxt proxy');
  }
  const servers = await jsonRequest(`${webOrigin}/api/servers`, { headers: { cookie } });
  if (!servers.response.ok || !Array.isArray(servers.body)) {
    throw new Error('Default-password sessions should be able to list servers');
  }

  const passwordChange = await jsonRequest(`${webOrigin}/api/auth/account`, {
    ...jsonBody({ currentPassword: 'admin', newPassword: 'smoke-password' }),
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
  });
  if (!passwordChange.response.ok || passwordChange.body?.usingDefaultPassword !== false) {
    throw new Error('Changing the initial password failed');
  }
  const revokedSession = await fetch(`${webOrigin}/api/auth/me`, { headers: { cookie } });
  if (revokedSession.status !== 401)
    throw new Error('Changing the password did not revoke the existing session');

  await terminate(api);
  api = start('api-restart', 'apps/api/dist/main.js');
  await waitFor(`${apiOrigin}/api/health`);
  const persistedLogin = await loginWithCaptcha('admin', 'smoke-password', '203.0.113.12');
  if (!persistedLogin.response.ok || persistedLogin.body?.username !== 'admin') {
    throw new Error('The administrator or database did not persist across an API restart');
  }
  const persistedCookie = persistedLogin.response.headers.get('set-cookie')?.split(';', 1)[0];
  const dashboardResponse = await fetch(`${webOrigin}/`, {
    headers: persistedCookie ? { cookie: persistedCookie } : {},
    redirect: 'manual',
  });
  const dashboard = await dashboardResponse.text();
  if (!dashboardResponse.ok || !dashboard.includes('Caddy')) {
    throw new Error('The authenticated dashboard was not server-rendered');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        apiHealth: health.status,
        loginSsr: loginPageResponse.status,
        initialAdmin: initialLogin.body.username,
        defaultPasswordReminder: initialLogin.body.usingDefaultPassword,
        defaultPasswordBlocked: blocked.response.status,
        isolatedLoginRateLimit: lockedLogin.response.status,
        sessionProxy: me.body.username,
        dashboardSsr: dashboardResponse.status,
        passwordRevokedOldSession: true,
        restartPersistence: persistedLogin.body.username,
        databaseBytes: statSync(databasePath).size,
        masterKeyBytes: statSync(masterKeyPath).size,
        artifacts: smokeDirectory,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all([...children].map((child) => terminate(child)));
  for (const descriptor of logDescriptors) closeSync(descriptor);
}
