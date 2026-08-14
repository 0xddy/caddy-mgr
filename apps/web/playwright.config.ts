import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

const projectRoot = resolve(import.meta.dirname, '../..')
const runtimeDirectory = resolve(projectRoot, 'var', 'playwright', randomUUID())
const webPort = 3210
const apiPort = 3211
const webOrigin = `http://127.0.0.1:${webPort}`
const apiOrigin = `http://127.0.0.1:${apiPort}`
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
)
const configuredChannel = process.env.PLAYWRIGHT_CHANNEL as 'chrome' | 'msedge' | undefined
const channel = configuredChannel ?? (process.env.CI ? undefined : 'chrome')

export default defineConfig({
  testDir: './e2e',
  outputDir: resolve(projectRoot, 'var', 'playwright-results'),
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['line']],
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...(channel ? { channel } : {}),
  },
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      cwd: projectRoot,
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...inheritedEnvironment,
        NODE_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT: String(apiPort),
        API_DATA_DIR: runtimeDirectory,
        DATA_DIR: runtimeDirectory,
        API_DATABASE_PATH: resolve(runtimeDirectory, 'caddy-manager.sqlite'),
        PUBLIC_APP_URL: webOrigin,
        PUBLIC_URL: webOrigin,
        DATABASE_PATH: resolve(runtimeDirectory, 'caddy-manager.sqlite'),
        API_MASTER_KEY_PATH: resolve(runtimeDirectory, 'master.key'),
        MASTER_KEY_PATH: resolve(runtimeDirectory, 'master.key'),
        SESSION_COOKIE_SECURE: 'false',
        CAPTCHA_DEBUG_CODE: 'true',
        TRUST_PROXY: 'false',
      },
    },
    {
      command: 'node scripts/start-web.mjs',
      cwd: projectRoot,
      url: `${webOrigin}/login`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...inheritedEnvironment,
        NODE_ENV: 'test',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(webPort),
        NUXT_API_BASE_URL: apiOrigin,
        NITRO_SSL_CERT: '',
        NITRO_SSL_KEY: '',
        TRUST_PROXY: 'false',
      },
    },
  ],
})
