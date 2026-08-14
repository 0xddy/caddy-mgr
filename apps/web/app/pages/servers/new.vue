<script setup lang="ts">
import type { DiscoveryCandidate, DiscoveryResult, HostKeyResult, ServerConnectionInput } from '~/types/api'
import { shortCaddyVersion } from '~/composables/useApi'

useHead({ title: '添加服务器' })
const api = useApi()
const toast = useToast()

const step = ref(1)
const working = ref(false)
const errorMessage = ref('')
const probeResult = ref<HostKeyResult | null>(null)
const discovery = ref<DiscoveryResult | null>(null)
const selectedIndex = ref(0)

const form = reactive<ServerConnectionInput>({
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authMethod: 'password',
  password: '',
  privateKey: '',
  privateKeyPassphrase: '',
  privilegeMode: 'root',
  sudoPassword: '',
})

const candidate = reactive<DiscoveryCandidate>({
  serviceName: 'caddy.service',
  configPath: '/etc/caddy/Caddyfile',
  caddyBinary: '/usr/bin/caddy',
  adapter: 'caddyfile',
  serviceUser: 'caddy',
  workingDirectory: '/etc/caddy',
})

const steps = [
  { id: 1, label: '连接信息', icon: 'i-lucide-key-round' },
  { id: 2, label: '确认主机', icon: 'i-lucide-fingerprint' },
  { id: 3, label: '确认实例', icon: 'i-lucide-scan-search' },
]

const authMethods = [
  { label: 'SSH 密码', value: 'password' },
  { label: 'SSH 私钥', value: 'privateKey' },
]
const privilegeModes = [
  { label: 'root（无需 sudo）', value: 'root' },
  { label: '免密 sudo', value: 'sudo-nopasswd' },
  { label: 'sudo 密码', value: 'sudo-password' },
]

function connectionPayload(): ServerConnectionInput {
  return {
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port),
    username: form.username.trim(),
    authMethod: form.authMethod,
    password: form.authMethod === 'password' ? form.password : undefined,
    privateKey: form.authMethod === 'privateKey' ? form.privateKey : undefined,
    privateKeyPassphrase: form.authMethod === 'privateKey' ? form.privateKeyPassphrase || undefined : undefined,
    privilegeMode: form.privilegeMode,
    sudoPassword: form.privilegeMode === 'sudo-password' ? form.sudoPassword : undefined,
    hostFingerprint: probeResult.value?.hostFingerprint,
  }
}

function validateConnection() {
  if (!form.name.trim() || !form.host.trim() || !form.username.trim())
    return '请填写服务器名称、地址和 SSH 用户名'
  if (!Number.isInteger(Number(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535)
    return 'SSH 端口必须在 1–65535 之间'
  if (form.authMethod === 'password' && !form.password)
    return '请输入 SSH 密码'
  if (form.authMethod === 'privateKey' && !(form.privateKey ?? '').trim())
    return '请粘贴 SSH 私钥'
  if (form.privilegeMode === 'sudo-password' && !form.sudoPassword)
    return '请输入 sudo 密码'
  return ''
}

async function probe() {
  errorMessage.value = validateConnection()
  if (errorMessage.value)
    return
  working.value = true
  try {
    probeResult.value = await api.servers.hostKey({ host: form.host.trim(), port: Number(form.port) })
    step.value = 2
  }
  catch (error) {
    errorMessage.value = (error as Error).message
  }
  finally {
    working.value = false
  }
}

async function confirmAndDiscover() {
  if (!probeResult.value)
    return
  working.value = true
  errorMessage.value = ''
  try {
    discovery.value = await api.servers.discover({
      ...connectionPayload(),
      hostFingerprint: probeResult.value.hostFingerprint,
    })
    if (discovery.value.candidates.length) {
      const preferred = discovery.value.candidates.findIndex(item => item.serviceName === 'caddy.service')
      applyCandidate(preferred >= 0 ? preferred : 0)
    }
    step.value = 3
  }
  catch (error) {
    errorMessage.value = (error as Error).message
  }
  finally {
    working.value = false
  }
}

function applyCandidate(index: number) {
  const value = discovery.value?.candidates[index]
  if (!value)
    return
  selectedIndex.value = index
  Object.assign(candidate, value)
}

const unitRows = computed(() => {
  const rows: Array<{
    key: string
    selectable: boolean
    candidateIndex?: number
    serviceName: string
    detail: string
    badge: string
  }> = []
  for (const [index, item] of (discovery.value?.candidates ?? []).entries()) {
    rows.push({
      key: `ok-${item.serviceName}-${item.configPath}`,
      selectable: true,
      candidateIndex: index,
      serviceName: item.serviceName,
      detail: [item.configPath, shortCaddyVersion(item.caddyVersion)].filter(Boolean).join(' · '),
      badge: '可管理',
    })
  }
  for (const item of discovery.value?.skipped ?? []) {
    rows.push({
      key: `skip-${item.serviceName}-${item.reason}`,
      selectable: false,
      serviceName: item.serviceName,
      detail: item.reason,
      badge: '不支持',
    })
  }
  return rows
})

const unitListLegend = computed(() => {
  const usable = discovery.value?.candidates.length ?? 0
  const total = unitRows.value.length
  if (usable > 1)
    return `检测到 ${total} 个 systemd unit，请选择要管理的实例`
  if (total > 1)
    return `检测到 ${total} 个 systemd unit，已选中可管理的实例`
  return '探测到的 systemd 实例'
})

const connectionWarnings = computed(() => discovery.value?.warnings ?? [])

async function save() {
  if (!probeResult.value || !candidate.serviceName || !candidate.configPath || !candidate.caddyBinary) {
    errorMessage.value = '请补全服务名、Caddy 路径和配置文件路径'
    return
  }
  working.value = true
  errorMessage.value = ''
  try {
    const created = await api.servers.create({
      ...connectionPayload(),
      ...candidate,
      hostFingerprint: probeResult.value.hostFingerprint,
    })
    toast.add({ title: '服务器已添加', description: `${created.name} 已可管理`, color: 'success' })
    await navigateTo(`/servers/${created.id}`)
  }
  catch (error) {
    errorMessage.value = (error as Error).message
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div class="wizard-page">
    <PageHeader eyebrow="ADD SERVER" title="添加服务器" description="连接远程 Linux 主机并识别 systemd Caddy 实例；存在多个 unit 时可手动选择。">
      <template #actions><UButton to="/servers" color="neutral" variant="ghost" icon="i-lucide-x">取消</UButton></template>
    </PageHeader>

    <ol class="wizard-steps" aria-label="添加步骤">
      <li v-for="item in steps" :key="item.id" :class="{ active: step === item.id, done: step > item.id }">
        <span><UIcon :name="step > item.id ? 'i-lucide-check' : item.icon" /></span>
        <div><small>步骤 {{ item.id }}</small><strong>{{ item.label }}</strong></div>
      </li>
    </ol>

    <section class="wizard-card panel">
      <template v-if="step === 1">
        <div class="panel__header"><div><h2>SSH 连接信息</h2><p>凭据会加密保存，之后不会在界面中回显。</p></div></div>
        <div class="panel__body">
          <div class="form-grid">
            <UFormField label="显示名称" required>
              <UInput v-model="form.name" placeholder="生产网关" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="服务器地址" required>
              <UInput v-model="form.host" placeholder="192.0.2.10 或主机名" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="SSH 端口" required>
              <UInput v-model.number="form.port" type="number" min="1" max="65535" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="SSH 用户名" required>
              <UInput v-model="form.username" autocomplete="username" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="认证方式" required>
              <USelect v-model="form.authMethod" :items="authMethods" value-key="value" size="lg" class="w-full" />
            </UFormField>
            <UFormField v-if="form.authMethod === 'password'" label="SSH 密码" required>
              <UInput v-model="form.password" type="password" autocomplete="off" size="lg" class="w-full" />
            </UFormField>
            <UFormField v-else class="form-span-2" label="SSH 私钥" required description="支持 OpenSSH 和 PEM 格式。">
              <UTextarea v-model="form.privateKey" :rows="7" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" class="w-full mono" />
            </UFormField>
            <UFormField v-if="form.authMethod === 'privateKey'" label="私钥口令" description="未加密私钥可留空">
              <UInput v-model="form.privateKeyPassphrase" type="password" autocomplete="off" size="lg" class="w-full" />
            </UFormField>
            <UFormField label="提权方式" required>
              <USelect v-model="form.privilegeMode" :items="privilegeModes" value-key="value" size="lg" class="w-full" />
            </UFormField>
            <UFormField v-if="form.privilegeMode === 'sudo-password'" label="sudo 密码" required>
              <UInput v-model="form.sudoPassword" type="password" autocomplete="off" size="lg" class="w-full" />
            </UFormField>
          </div>

          <div v-if="errorMessage" class="error-callout form-message"><UIcon name="i-lucide-circle-alert" />{{ errorMessage }}</div>
          <div class="form-actions">
            <UButton :loading="working" icon="i-lucide-plug-zap" @click="probe">测试连接</UButton>
          </div>
        </div>
      </template>

      <template v-else-if="step === 2">
        <div class="panel__header"><div><h2>确认主机身份</h2><p>首次连接需要核对 SSH 主机指纹。</p></div></div>
        <div class="fingerprint-view panel__body">
          <div class="fingerprint-view__icon"><UIcon name="i-lucide-fingerprint" /></div>
          <h3>{{ form.host }}:{{ form.port }}</h3>
          <p>请与服务器管理员提供的指纹核对。确认后，面板会信任这台主机；以后指纹变化时连接将被拒绝。</p>
          <code>{{ probeResult?.hostFingerprint }}</code>
          <div v-if="errorMessage" class="error-callout"><UIcon name="i-lucide-circle-alert" />{{ errorMessage }}</div>
          <div class="fingerprint-view__actions">
            <UButton color="neutral" variant="outline" :disabled="working" icon="i-lucide-arrow-left" @click="step = 1">返回修改</UButton>
            <UButton :loading="working" icon="i-lucide-shield-check" @click="confirmAndDiscover">确认并自动探测</UButton>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="panel__header"><div><h2>确认 Caddy 实例</h2><p>若检测到多个 systemd unit，请先选择要管理的一个，再确认路径后保存。</p></div></div>
        <div class="panel__body">
          <div v-if="!discovery?.supported" class="warning-callout discovery-status">
            <UIcon name="i-lucide-triangle-alert" />
            <span>
              <strong>{{ discovery?.candidates.length ? '当前无法保存' : '此实例暂不受支持' }}</strong>
              <br>{{ discovery?.reason || '未发现可靠的 Caddyfile systemd 实例。' }}
            </span>
          </div>
          <div v-for="warning in connectionWarnings" :key="warning" class="warning-callout discovery-status">
            <UIcon name="i-lucide-info" />{{ warning }}
          </div>

          <fieldset v-if="unitRows.length" class="unit-list">
            <legend>{{ unitListLegend }}</legend>
            <component
              :is="row.selectable ? 'label' : 'div'"
              v-for="row in unitRows"
              :key="row.key"
              class="unit-row"
              :class="{ selected: row.selectable && selectedIndex === row.candidateIndex, disabled: !row.selectable }"
            >
              <input
                v-if="row.selectable"
                type="radio"
                name="candidate"
                :checked="selectedIndex === row.candidateIndex"
                @change="typeof row.candidateIndex === 'number' && applyCandidate(row.candidateIndex)"
              >
              <span v-else class="unit-row__mark" aria-hidden="true" />
              <span class="unit-row__meta">
                <strong>{{ row.serviceName }}</strong>
                <small>{{ row.detail }}</small>
              </span>
              <span class="unit-row__badge" :class="row.selectable ? 'ok' : 'skip'">{{ row.badge }}</span>
            </component>
          </fieldset>

          <p v-else-if="discovery?.supported" class="discovery-note">请确认下方路径后保存。</p>

          <div class="form-grid">
            <UFormField label="systemd 服务名" required>
              <UInput v-model="candidate.serviceName" size="lg" class="w-full mono" />
            </UFormField>
            <UFormField label="配置 adapter" required>
              <UInput v-model="candidate.adapter" size="lg" class="w-full mono" :disabled="candidate.adapter !== 'caddyfile'" />
            </UFormField>
            <UFormField label="Caddy 可执行文件" required>
              <UInput v-model="candidate.caddyBinary" size="lg" class="w-full mono" />
            </UFormField>
            <UFormField label="Caddyfile 路径" required>
              <UInput v-model="candidate.configPath" size="lg" class="w-full mono" />
            </UFormField>
            <UFormField label="服务用户">
              <UInput v-model="candidate.serviceUser" size="lg" class="w-full mono" />
            </UFormField>
            <UFormField label="工作目录">
              <UInput v-model="candidate.workingDirectory" size="lg" class="w-full mono" />
            </UFormField>
          </div>

          <div v-if="errorMessage" class="error-callout form-message"><UIcon name="i-lucide-circle-alert" />{{ errorMessage }}</div>
          <div class="form-actions">
            <UButton color="neutral" variant="outline" :disabled="working" icon="i-lucide-arrow-left" @click="step = 1">重新填写</UButton>
            <UButton :loading="working" :disabled="!discovery?.supported || candidate.adapter !== 'caddyfile'" @click="save">保存服务器</UButton>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.wizard-page { max-width: 900px; margin: 0 auto; }
.wizard-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 0 0 22px; padding: 0; list-style: none; }
.wizard-steps li { position: relative; display: flex; align-items: center; gap: 12px; color: var(--text-faint); }
.wizard-steps li::after { position: absolute; top: 19px; right: 16px; left: 62px; height: 1px; background: var(--line); content: ""; }
.wizard-steps li:last-child::after { display: none; }
.wizard-steps li > span { z-index: 1; display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); }
.wizard-steps li > span svg { width: 16px; height: 16px; }
.wizard-steps li div { z-index: 1; display: flex; padding-right: 16px; flex-direction: column; background: var(--bg); }
.wizard-steps small { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.wizard-steps strong { margin-top: 3px; font-size: 13px; }
.wizard-steps .active { color: var(--text); }
.wizard-steps .active > span { border-color: rgba(88,214,141,.4); color: var(--accent); background: var(--accent-soft); }
.wizard-steps .done { color: var(--accent); }
.wizard-card { overflow: hidden; }
.form-message { margin-top: 20px; }
.fingerprint-view { display: flex; align-items: center; flex-direction: column; padding-top: 32px; padding-bottom: 32px; text-align: center; }
.fingerprint-view__icon { display: grid; width: 58px; height: 58px; place-items: center; border: 1px solid rgba(88,214,141,.2); border-radius: 17px; color: var(--accent); background: var(--accent-soft); }
.fingerprint-view__icon svg { width: 28px; height: 28px; }
.fingerprint-view h3 { margin: 16px 0 5px; font-size: 17px; }
.fingerprint-view > p { max-width: 570px; margin: 0; color: var(--text-soft); font-size: 13px; line-height: 1.65; }
.fingerprint-view > code { display: block; max-width: 100%; overflow: auto; margin: 20px 0; border: 1px solid var(--line); border-radius: 9px; padding: 12px 15px; color: #c8d3cc; background: rgba(0,0,0,.22); font-size: 13px; white-space: nowrap; }
.fingerprint-view .error-callout { width: 100%; margin-bottom: 18px; text-align: left; }
.fingerprint-view__actions { display: flex; gap: 9px; }
.discovery-status { margin-bottom: 14px; }
.discovery-note { margin: 0 0 16px; color: var(--text-soft); font-size: 13px; }
.unit-list { display: grid; gap: 8px; margin: 0 0 20px; border: 0; padding: 0; }
.unit-list legend { margin-bottom: 9px; color: var(--text-soft); font-size: 12px; }
.unit-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px; }
.unit-row:not(.disabled) { cursor: pointer; }
.unit-row.selected { border-color: rgba(88,214,141,.35); background: var(--accent-soft); }
.unit-row.disabled { opacity: .78; }
.unit-row input { accent-color: var(--accent); }
.unit-row__mark { width: 14px; height: 14px; border: 1px dashed var(--line); border-radius: 999px; }
.unit-row__meta { display: flex; min-width: 0; flex-direction: column; }
.unit-row strong { font-size: 13px; }
.unit-row small { overflow: hidden; margin-top: 3px; color: var(--text-faint); font-family: monospace; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.unit-row__badge { flex: 0 0 auto; border-radius: 999px; padding: 3px 8px; font-size: 11px; line-height: 1.3; }
.unit-row__badge.ok { color: var(--accent); background: rgba(88,214,141,.12); }
.unit-row__badge.skip { color: #e9c887; background: rgba(233,180,95,.12); }
@media (max-width: 620px) {
  .wizard-steps li div { display: none; }
  .wizard-steps li::after { right: 10px; left: 46px; }
  .wizard-steps li { justify-content: flex-start; }
  .wizard-steps li:last-child { justify-content: flex-end; }
  .wizard-steps li:nth-child(2) { justify-content: center; }
  .fingerprint-view__actions { align-items: stretch; flex-direction: column-reverse; }
}
</style>
