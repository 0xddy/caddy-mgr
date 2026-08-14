<script setup lang="ts">
import { shortCaddyVersion } from '~/composables/useApi'
import type { Operation, ServerLogResult } from '~/types/api'

const route = useRoute()
const id = computed(() => String(route.params.id))
const api = useApi()
const toast = useToast()
const pendingAction = ref<'reload' | 'restart' | null>(null)
const actionPending = ref(false)
const rediscovering = ref(false)
const recoveryPending = ref<string | null>(null)
const { operation: activeOperation, poll } = useOperationPolling()

const { data, status, error, refresh } = await useAsyncData(`server-${id.value}`, async () => {
  const [server, operations, logs] = await Promise.all([
    api.servers.get(id.value),
    api.servers.operations(id.value).catch(() => [] as Operation[]),
    api.servers.logs(id.value).catch(() => ({ lines: [], fetchedAt: new Date().toISOString() }) as ServerLogResult),
  ])
  return { server, operations, logs }
})

const server = computed(() => data.value?.server)
const operations = computed(() => data.value?.operations || [])
const logs = computed(() => data.value?.logs.lines || [])

useHead(() => ({ title: server.value?.name || '服务器详情' }))

let logsTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  logsTimer = setInterval(refreshLogs, 15_000)
})
onBeforeUnmount(() => {
  if (logsTimer)
    clearInterval(logsTimer)
})

async function refreshLogs() {
  if (!data.value)
    return
  try {
    const logs = await api.servers.logs(id.value)
    if (data.value)
      data.value = { ...data.value, logs }
  }
  catch {
    // 保留最后一次成功内容，定时刷新不打断用户。
  }
}

async function runServiceAction() {
  if (!pendingAction.value)
    return
  const action = pendingAction.value
  actionPending.value = true
  try {
    const result = await api.servers.serviceAction(id.value, action)
    pendingAction.value = null
    await poll(result.operationId, async (completed) => {
      toast.add({
        title: completed.status === 'succeeded' ? '服务操作完成' : '服务操作未完成',
        description: completed.summary || completed.stage,
        color: completed.status === 'succeeded' ? 'success' : 'error',
      })
      await refresh()
    })
  }
  catch (error) {
    toast.add({ title: '操作提交失败', description: (error as Error).message, color: 'error' })
  }
  finally {
    actionPending.value = false
  }
}

async function rediscover() {
  rediscovering.value = true
  try {
    const result = await api.servers.rediscover(id.value)
    if (result.supported) {
      toast.add({ title: '探测完成', description: `发现 ${result.candidates.length} 个可用实例`, color: 'success' })
      await refresh()
    }
    else {
      toast.add({ title: '实例不受支持', description: result.reason, color: 'warning' })
    }
  }
  catch (error) {
    toast.add({ title: '重新探测失败', description: (error as Error).message, color: 'error' })
  }
  finally {
    rediscovering.value = false
  }
}

function isRecoverable(operation: Operation) {
  return ['failed', 'interrupted', 'needs_attention', 'rolled_back'].includes(operation.status)
}

async function recoverOperation(operation: Operation, action: 'retryReload' | 'restoreBackup') {
  const label = action === 'retryReload' ? '重试重载' : '恢复远端备份'
  const warning = action === 'retryReload'
    ? '将重新执行服务重载并检查服务状态，是否继续？'
    : `将读取操作留下的备份并走完整的校验、替换和重载流程。备份路径：${operation.backupPath}。是否继续？`
  if (!window.confirm(warning))
    return

  recoveryPending.value = operation.id
  try {
    const result = await api.operations.recover(operation.id, action)
    toast.add({ title: `${label} 已提交`, description: `操作 ID：${result.operationId}`, color: 'info' })
    await poll(result.operationId, async (completed) => {
      toast.add({
        title: completed.status === 'succeeded' ? `${label}完成` : `${label}未完成`,
        description: completed.summary || completed.stage,
        color: completed.status === 'succeeded' ? 'success' : 'error',
      })
      await refresh()
    })
  }
  catch (error) {
    toast.add({ title: `${label}提交失败`, description: (error as Error).message, color: 'error' })
  }
  finally {
    recoveryPending.value = null
  }
}

async function copyPath() {
  if (!server.value?.configPath)
    return
  await navigator.clipboard.writeText(server.value.configPath)
  toast.add({ title: '路径已复制', color: 'success' })
}

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : '从未'
}
</script>

<template>
  <div>
    <LoadingBlock v-if="status === 'pending' && !server" class="panel" :rows="7" />
    <div v-else-if="error || !server" class="panel">
      <EmptyState icon="i-lucide-server-off" title="无法加载服务器" :description="error?.message || '服务器不存在或已被移除。'">
        <UButton to="/servers" color="neutral" variant="outline">返回列表</UButton>
      </EmptyState>
    </div>

    <template v-else>
      <PageHeader eyebrow="SERVER" :title="server.name" :description="`${server.username}@${server.host}:${server.port}`">
        <template #actions>
          <UButton color="neutral" variant="outline" icon="i-lucide-scan-search" :loading="rediscovering" @click="rediscover">重新探测</UButton>
          <UButton :to="`/servers/${id}/config`" icon="i-lucide-file-pen-line">编辑配置</UButton>
        </template>
      </PageHeader>

      <div class="server-hero panel">
        <div class="server-hero__status">
          <div class="server-hero__orb" :class="{ online: server.status === 'online' && server.serviceActive !== false }">
            <UIcon name="i-lucide-server" />
          </div>
          <div>
            <StatusBadge :status="server.status" :service-active="server.serviceActive" />
            <h2>{{ server.serviceName || 'Caddy' }}</h2>
            <p>{{ shortCaddyVersion(server.caddyVersion) || '版本未知' }}</p>
          </div>
        </div>
        <div class="server-hero__facts">
          <div><span>最后连接</span><strong>{{ formatDate(server.lastConnectedAt) }}</strong></div>
          <div><span>配置适配器</span><strong>{{ server.adapter || 'caddyfile' }}</strong></div>
          <div><span>服务用户</span><strong>{{ server.serviceUser || '未知' }}</strong></div>
        </div>
        <div class="server-hero__actions">
          <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="pendingAction = 'reload'">重载</UButton>
          <UButton color="warning" variant="soft" icon="i-lucide-rotate-cw" @click="pendingAction = 'restart'">重启</UButton>
        </div>
      </div>

      <div v-if="activeOperation && ['queued', 'running'].includes(activeOperation.status)" class="active-operation panel">
        <OperationCard :operation="activeOperation" />
      </div>

      <div class="detail-grid">
        <div class="detail-main">
          <section class="panel info-panel">
            <div class="panel__header"><div><h2>实例信息</h2><p>最近一次探测确认的运行参数</p></div></div>
            <dl class="info-list">
              <div><dt>主机指纹</dt><dd class="mono">{{ server.hostFingerprint }}</dd></div>
              <div><dt>Caddy 可执行文件</dt><dd class="mono">{{ server.caddyBinary || '未知' }}</dd></div>
              <div><dt>Caddyfile</dt><dd class="mono path-value"><span>{{ server.configPath || '未知' }}</span><button v-if="server.configPath" aria-label="复制配置路径" @click="copyPath"><UIcon name="i-lucide-copy" /></button></dd></div>
              <div><dt>工作目录</dt><dd class="mono">{{ server.workingDirectory || '未设置' }}</dd></div>
              <div><dt>提权方式</dt><dd>{{ { root: 'root', 'sudo-nopasswd': '免密 sudo', 'sudo-password': 'sudo 密码' }[server.privilegeMode] }}</dd></div>
              <div><dt>认证方式</dt><dd>{{ server.authMethod === 'password' ? 'SSH 密码' : 'SSH 私钥' }}</dd></div>
            </dl>
          </section>

          <section class="panel log-panel">
            <div class="panel__header">
              <div><h2>近期日志</h2><p>journalctl 最近 100 行 · 每 15 秒刷新</p></div>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" @click="refreshLogs">刷新</UButton>
            </div>
            <pre v-if="logs.length" class="log-view"><code><span v-for="(line, index) in logs" :key="index">{{ line }}
</span></code></pre>
            <EmptyState v-else icon="i-lucide-file-clock" title="暂无日志" description="远端没有返回日志，或当前账号没有读取权限。" />
          </section>
        </div>

        <aside class="panel operation-panel">
          <div class="panel__header"><div><h2>操作记录</h2><p>该实例的近期变更</p></div></div>
          <div v-if="operations.length" class="operation-panel__list">
            <div v-for="item in operations.slice(0, 10)" :key="item.id" class="operation-panel__item">
              <OperationCard :operation="item" compact />
              <div v-if="isRecoverable(item)" class="operation-panel__recovery">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-refresh-cw"
                  :loading="recoveryPending === item.id"
                  :disabled="recoveryPending !== null"
                  @click="recoverOperation(item, 'retryReload')"
                >
                  重试重载
                </UButton>
                <UButton
                  v-if="item.backupPath"
                  size="xs"
                  color="warning"
                  variant="soft"
                  icon="i-lucide-archive-restore"
                  :loading="recoveryPending === item.id"
                  :disabled="recoveryPending !== null"
                  @click="recoverOperation(item, 'restoreBackup')"
                >
                  恢复备份
                </UButton>
              </div>
            </div>
          </div>
          <EmptyState v-else icon="i-lucide-list-checks" title="暂无操作" description="重载、重启和配置变更会显示在这里。" />
        </aside>
      </div>

      <div v-if="pendingAction" class="confirm-overlay" role="dialog" aria-modal="true">
        <div class="confirm-dialog panel">
          <div class="confirm-dialog__icon" :class="{ restart: pendingAction === 'restart' }"><UIcon :name="pendingAction === 'restart' ? 'i-lucide-rotate-cw' : 'i-lucide-refresh-cw'" /></div>
          <h2>{{ pendingAction === 'restart' ? '重启 Caddy 服务？' : '重载 Caddy 配置？' }}</h2>
          <p v-if="pendingAction === 'restart'">重启可能造成短暂连接中断。仅在明确需要时使用。</p>
          <p v-else>将执行服务重载，并在操作完成后检查服务状态。</p>
          <div class="confirm-dialog__actions">
            <UButton color="neutral" variant="outline" :disabled="actionPending" @click="pendingAction = null">取消</UButton>
            <UButton :color="pendingAction === 'restart' ? 'warning' : 'primary'" :loading="actionPending" @click="runServiceAction">确认执行</UButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.server-hero { display: flex; align-items: center; gap: 28px; margin-bottom: 19px; padding: 22px; }
.server-hero__status { display: flex; min-width: 230px; align-items: center; gap: 14px; }
.server-hero__orb { display: grid; width: 52px; height: 52px; flex: 0 0 auto; place-items: center; border: 1px solid var(--line); border-radius: 15px; color: var(--text-faint); background: rgba(255,255,255,.025); }
.server-hero__orb.online { border-color: rgba(88,214,141,.2); color: var(--accent); background: var(--accent-soft); }
.server-hero__orb svg { width: 24px; height: 24px; }
.server-hero h2 { margin: 8px 0 1px; font-size: 16px; }
.server-hero p { margin: 0; color: var(--text-faint); font-size: 12px; }
.server-hero__facts { display: grid; flex: 1; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.server-hero__facts div { display: flex; flex-direction: column; }
.server-hero__facts span { color: var(--text-faint); font-size: 12px; }
.server-hero__facts strong { margin-top: 4px; font-size: 13px; }
.server-hero__actions { display: flex; gap: 8px; }
.active-operation { margin-bottom: 19px; padding: 3px 20px; border-color: rgba(117,174,250,.2); }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(290px, .75fr); align-items: start; gap: 19px; }
.detail-main { display: grid; gap: 19px; }
.info-list { display: grid; margin: 0; }
.info-list div { display: grid; grid-template-columns: 165px minmax(0, 1fr); gap: 15px; padding: 13px 21px; border-bottom: 1px solid var(--line); }
.info-list div:last-child { border-bottom: 0; }
.info-list dt { color: var(--text-faint); font-size: 12px; }
.info-list dd { overflow: hidden; margin: 0; color: var(--text-soft); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.path-value { display: flex; align-items: center; gap: 7px; }
.path-value span { overflow: hidden; text-overflow: ellipsis; }
.path-value button { border: 0; padding: 0; color: var(--text-faint); background: none; cursor: pointer; }
.log-panel { overflow: hidden; }
.log-view { max-height: 390px; overflow: auto; margin: 0; padding: 17px 20px; color: #b8c6bd; background: #0a0d0b; font-size: 12px; line-height: 1.65; tab-size: 2; }
.log-view span { display: block; min-height: 1em; white-space: pre-wrap; word-break: break-all; }
.operation-panel__list { padding: 4px 20px 8px; }
.operation-panel__item { padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.operation-panel__item:last-child { border-bottom: 0; }
.operation-panel__recovery { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 0 8px 34px; }
.confirm-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px; background: rgba(3,5,4,.72); backdrop-filter: blur(8px); }
.confirm-dialog { width: min(410px, 100%); padding: 26px; text-align: center; box-shadow: var(--shadow); }
.confirm-dialog__icon { display: grid; width: 46px; height: 46px; margin: 0 auto; place-items: center; border-radius: 13px; color: var(--accent); background: var(--accent-soft); }
.confirm-dialog__icon.restart { color: var(--warning); background: rgba(233,180,95,.1); }
.confirm-dialog h2 { margin: 16px 0 6px; font-size: 18px; }
.confirm-dialog p { margin: 0; color: var(--text-soft); font-size: 13px; line-height: 1.6; }
.confirm-dialog__actions { display: flex; justify-content: center; gap: 9px; margin-top: 22px; }
@media (max-width: 1100px) { .server-hero { align-items: flex-start; flex-wrap: wrap; } .server-hero__facts { order: 3; min-width: 100%; } .detail-grid { grid-template-columns: 1fr; } }
@media (max-width: 650px) { .server-hero__facts { grid-template-columns: 1fr; } .server-hero__actions { width: 100%; } .server-hero__actions > * { flex: 1; } .info-list div { grid-template-columns: 1fr; gap: 4px; } }
</style>
