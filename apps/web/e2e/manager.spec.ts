import { expect, test, type Page } from '@playwright/test'

const fingerprint = 'SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCD'
const baselineConfig = 'example.com {\n\trespond "old"\n}\n'
const changedConfig = 'example.com {\n\trespond "new"\n}\n'
const baselineHash = 'a'.repeat(64)
const revisionId = '11111111-1111-4111-8111-111111111111'
const applyOperationId = '22222222-2222-4222-8222-222222222222'
const restoreOperationId = '33333333-3333-4333-8333-333333333333'

async function signIn(page: Page): Promise<void> {
  const captchaResponse = await page.request.get('/api/auth/captcha')
  expect(captchaResponse.ok()).toBe(true)
  const captcha = await captchaResponse.json() as { captchaId: string, debugCode?: string }
  expect(captcha.debugCode).toBeTruthy()

  const loginResponse = await page.request.post('/api/auth/login', {
    data: {
      username: 'admin',
      password: 'admin',
      captchaId: captcha.captchaId,
      captchaCode: captcha.debugCode,
    },
  })
  expect(loginResponse.ok()).toBe(true)
}

test.describe.configure({ mode: 'serial' })

test('SSR 守卫回跳登录页，默认密码不拦截管理功能', async ({ page }) => {
  const response = await page.goto('/servers')
  expect(response?.status()).toBe(200)
  const redirected = new URL(page.url())
  expect(redirected.pathname).toBe('/login')
  expect(redirected.searchParams.get('redirect')).toBe('/servers')

  await signIn(page)
  await page.goto('/servers')
  expect(new URL(page.url()).pathname).toBe('/servers')
  await expect(page.getByText('当前仍在使用初始密码，建议尽快修改。')).toBeVisible()
})

test('SSH 向导在确认指纹前不发送任何秘密', async ({ page }) => {
  await signIn(page)
  let hostKeyPayload: Record<string, unknown> | undefined
  let probePayload: Record<string, unknown> | undefined

  await page.route('**/api/servers/host-key', async (route) => {
    hostKeyPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ json: { fingerprint } })
  })
  await page.route('**/api/servers/probe', async (route) => {
    probePayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      json: {
        fingerprint,
        discovery: {
          supported: true,
          platform: 'Linux',
          serviceName: 'caddy.service',
          serviceNames: ['caddy.service'],
          caddyBinary: '/usr/bin/caddy',
          configPath: '/etc/caddy/Caddyfile',
          adapter: 'caddyfile',
          serviceUser: 'caddy',
          workingDirectory: '/etc/caddy',
          version: 'v2.10.0',
          sudoAvailable: true,
          warnings: [],
        },
      },
    })
  })

  await page.goto('/servers/new')
  await page.getByLabel('显示名称').fill('向导验收')
  await page.getByLabel('服务器地址').fill('192.0.2.20')
  await page.getByLabel('SSH 密码').fill('ssh-secret-e2e')
  await page.getByRole('button', { name: '测试连接' }).click()
  await expect(page.getByText(fingerprint)).toBeVisible()

  expect(hostKeyPayload).toEqual({ host: '192.0.2.20', port: 22 })
  expect(JSON.stringify(hostKeyPayload)).not.toContain('ssh-secret-e2e')

  await page.getByRole('button', { name: '确认并自动探测' }).click()
  await expect(page.getByLabel('Caddyfile 路径')).toHaveValue('/etc/caddy/Caddyfile')
  expect(probePayload?.hostFingerprint).toBe(fingerprint)
  expect(probePayload?.password).toBe('ssh-secret-e2e')
  expect(await page.content()).not.toContain('ssh-secret-e2e')
})

test('探测到多个 Caddyfile systemd unit 时可以在向导中选择', async ({ page }) => {
  await signIn(page)

  await page.route('**/api/servers/host-key', async (route) => {
    await route.fulfill({ json: { fingerprint } })
  })
  await page.route('**/api/servers/probe', async (route) => {
    await route.fulfill({
      json: {
        fingerprint,
        discovery: {
          supported: true,
          platform: 'Linux',
          serviceName: 'caddy.service',
          serviceNames: ['caddy.service', 'caddy-edge.service'],
          caddyBinary: '/usr/bin/caddy',
          configPath: '/etc/caddy/Caddyfile',
          adapter: 'caddyfile',
          serviceUser: 'caddy',
          workingDirectory: '/etc/caddy',
          version: 'v2.10.0',
          sudoAvailable: true,
          warnings: [],
          skipped: [],
          candidates: [
            {
              serviceName: 'caddy.service',
              caddyBinary: '/usr/bin/caddy',
              configPath: '/etc/caddy/Caddyfile',
              adapter: 'caddyfile',
              serviceUser: 'caddy',
              workingDirectory: '/etc/caddy',
              version: 'v2.10.0',
            },
            {
              serviceName: 'caddy-edge.service',
              caddyBinary: '/usr/bin/caddy',
              configPath: '/etc/caddy/edge.Caddyfile',
              adapter: 'caddyfile',
              serviceUser: 'caddy',
              workingDirectory: '/etc/caddy',
              version: 'v2.10.0',
            },
          ],
        },
      },
    })
  })

  await page.goto('/servers/new')
  await page.getByLabel('显示名称').fill('多实例选择')
  await page.getByLabel('服务器地址').fill('192.0.2.21')
  await page.getByLabel('SSH 密码').fill('ssh-secret-e2e')
  await page.getByRole('button', { name: '测试连接' }).click()
  await page.getByRole('button', { name: '确认并自动探测' }).click()

  await expect(page.getByText('检测到 2 个 systemd unit，请选择要管理的实例')).toBeVisible()
  await expect(page.getByLabel('systemd 服务名')).toHaveValue('caddy.service')
  await expect(page.getByLabel('Caddyfile 路径')).toHaveValue('/etc/caddy/Caddyfile')

  await page.getByText('caddy-edge.service', { exact: true }).click()
  await expect(page.getByLabel('systemd 服务名')).toHaveValue('caddy-edge.service')
  await expect(page.getByLabel('Caddyfile 路径')).toHaveValue('/etc/caddy/edge.Caddyfile')
})

test('日志、编辑器 hydration、diff、应用进度和历史恢复形成闭环', async ({ page }) => {
  await signIn(page)
  const secret = 'server-secret-e2e'
  const createResponse = await page.request.post('/api/servers', {
    data: {
      name: 'E2E Caddy',
      host: '192.0.2.30',
      port: 22,
      username: 'root',
      authMethod: 'password',
      password: secret,
      elevationMethod: 'root',
      hostFingerprint: fingerprint,
      serviceName: 'caddy.service',
      caddyBinary: '/usr/bin/caddy',
      configPath: '/etc/caddy/Caddyfile',
      adapter: 'caddyfile',
      serviceUser: 'caddy',
      workingDirectory: '/etc/caddy',
    },
  })
  expect(createResponse.ok()).toBe(true)
  const created = await createResponse.json() as { id: string }
  expect(JSON.stringify(created)).not.toContain(secret)

  let logRequests = 0
  let remoteContent = baselineConfig
  const operationPolls = new Map<string, number>()
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.route(`**/api/servers/${created.id}/status`, route => route.fulfill({
    json: { active: true, serviceStatus: 'active', version: 'v2.10.0', checkedAt: new Date().toISOString() },
  }))
  await page.route(`**/api/servers/${created.id}/logs**`, async (route) => {
    logRequests += 1
    await route.fulfill({ json: { content: logRequests === 1 ? 'boot log' : 'manual refresh log', lines: 100 } })
  })
  await page.route('**/api/operations?*', route => route.fulfill({ json: [] }))
  await page.route(`**/api/servers/${created.id}/config`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          content: remoteContent,
          baseHash: baselineHash,
          mtime: 1_723_600_000,
          size: Buffer.byteLength(remoteContent),
          owner: 'caddy',
          group: 'caddy',
          mode: '644',
        },
      })
    }
    else {
      await route.fallback()
    }
  })
  await page.route(`**/api/servers/${created.id}/config/validate`, route => route.fulfill({
    json: { valid: true, output: 'Valid configuration' },
  }))
  await page.route(`**/api/servers/${created.id}/config/apply`, async (route) => {
    const payload = route.request().postDataJSON() as { content: string, baseHash: string }
    expect(payload.baseHash).toBe(baselineHash)
    remoteContent = payload.content
    await route.fulfill({ status: 202, json: { operationId: applyOperationId } })
  })
  await page.route(`**/api/servers/${created.id}/revisions`, route => route.fulfill({
    json: [{
      id: revisionId,
      serverId: created.id,
      hash: baselineHash,
      source: 'baseline',
      operationId: null,
      createdAt: new Date().toISOString(),
      size: Buffer.byteLength(baselineConfig),
    }],
  }))
  await page.route(`**/api/servers/${created.id}/revisions/${revisionId}`, route => route.fulfill({
    json: {
      id: revisionId,
      serverId: created.id,
      hash: baselineHash,
      source: 'baseline',
      operationId: null,
      createdAt: new Date().toISOString(),
      size: Buffer.byteLength(baselineConfig),
      content: baselineConfig,
    },
  }))
  await page.route(`**/api/servers/${created.id}/revisions/${revisionId}/restore`, async (route) => {
    remoteContent = baselineConfig
    await route.fulfill({ status: 202, json: { operationId: restoreOperationId } })
  })
  await page.route('**/api/operations/*', async (route) => {
    const operationId = new URL(route.request().url()).pathname.split('/').at(-1)!
    const count = (operationPolls.get(operationId) ?? 0) + 1
    operationPolls.set(operationId, count)
    const terminal = count > 1
    await route.fulfill({
      json: {
        id: operationId,
        serverId: created.id,
        kind: operationId === restoreOperationId ? 'restore' : 'apply',
        status: terminal ? 'succeeded' : 'running',
        stage: terminal ? 'completed' : 'reloading',
        summary: terminal ? '操作成功完成' : '正在 reload',
        errorCode: null,
        backupPath: null,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: terminal ? new Date().toISOString() : null,
      },
    })
  })

  await page.goto('/servers')
  await page.getByRole('link', { name: /E2E Caddy/ }).click()
  await expect(page.getByText('boot log')).toBeVisible()
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('manual refresh log')).toBeVisible()
  await page.getByRole('link', { name: '编辑配置' }).click()

  await expect(page.locator('.cm-editor')).toBeVisible()
  const content = page.locator('.cm-content')
  await content.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.insertText(changedConfig)
  await page.getByRole('button', { name: /变更对比/ }).click()
  await expect(page.getByText('待应用版本')).toBeVisible()
  await expect(page.getByRole('code').filter({ hasText: 'respond "new"' })).toBeVisible()

  await page.getByRole('button', { name: '查看并应用' }).click()
  await expect(page.getByRole('dialog').getByText('应用这次配置变更？')).toBeVisible()
  await page.getByRole('button', { name: '确认应用' }).click()
  await expect(page.getByText('正在 reload')).toBeVisible()
  await expect(page.getByText('配置已应用', { exact: true })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: '版本历史' }).click()
  await page.getByRole('button', { name: /变更前基线/ }).click()
  await page.getByRole('button', { name: '恢复此版本' }).click()
  await page.getByRole('button', { name: '确认恢复' }).click()
  await expect(page.getByText('历史版本已恢复', { exact: true })).toBeVisible({ timeout: 10_000 })
  expect(consoleErrors.filter(error => /hydration|mismatch/i.test(error))).toEqual([])
})
