<script setup lang="ts">
import type { Operation, ServerSummary } from '~/types/api'

useHead({ title: '概览' })
const api = useApi()

const { data, status, error, refresh } = await useAsyncData('dashboard-summary', async () => {
  const [servers, operations] = await Promise.all([
    api.servers.list(),
    api.operations.list().catch(() => [] as Operation[]),
  ])
  return { servers, operations }
})

const servers = computed<ServerSummary[]>(() => data.value?.servers || [])
const operations = computed<Operation[]>(() => data.value?.operations || [])
const online = computed(() => servers.value.filter(item => item.status === 'online' && item.serviceActive !== false).length)
const attention = computed(() => operations.value.filter(item => ['failed', 'interrupted', 'needs_attention'].includes(item.status)).length)
const recentOperations = computed(() => operations.value.slice(0, 5))

function formatAgo(value: string | null) {
  if (!value)
    return '尚未连接'
  const diff = Date.now() - new Date(value).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="OVERVIEW"
      title="运行概览"
      description="查看所有 Caddy 实例的连接状态与近期操作。"
    >
      <template #actions>
        <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">
          刷新
        </UButton>
        <UButton to="/servers/new" icon="i-lucide-plus">添加服务器</UButton>
      </template>
    </PageHeader>

    <div v-if="error" class="error-callout dashboard-error">
      <UIcon name="i-lucide-wifi-off" />
      <span>概览加载失败：{{ error.message }}</span>
      <button @click="refresh()">重试</button>
    </div>

    <div class="metric-grid">
      <article class="metric-card panel">
        <div class="metric-card__icon metric-card__icon--green"><UIcon name="i-lucide-server" /></div>
        <div class="metric-card__body">
          <span>服务器总数</span>
          <strong>{{ servers.length }}</strong>
          <small>已录入实例</small>
        </div>
      </article>
      <article class="metric-card panel">
        <div class="metric-card__icon metric-card__icon--blue"><UIcon name="i-lucide-activity" /></div>
        <div class="metric-card__body">
          <span>正常运行</span>
          <strong>{{ online }}</strong>
          <small>{{ servers.length ? `${Math.round(online / servers.length * 100)}% 可用` : '等待添加' }}</small>
        </div>
      </article>
      <article class="metric-card panel">
        <div class="metric-card__icon metric-card__icon--amber"><UIcon name="i-lucide-triangle-alert" /></div>
        <div class="metric-card__body">
          <span>需关注操作</span>
          <strong>{{ attention }}</strong>
          <small>近期失败或中断</small>
        </div>
      </article>
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel__header">
          <div><h2>服务器状态</h2><p>所有已管理实例</p></div>
          <NuxtLink class="subtle-link" to="/servers">查看全部 <UIcon name="i-lucide-arrow-right" /></NuxtLink>
        </div>
        <LoadingBlock v-if="status === 'pending'" />
        <div v-else-if="servers.length" class="server-overview-list">
          <NuxtLink v-for="server in servers.slice(0, 6)" :key="server.id" :to="`/servers/${server.id}`" class="server-overview-row">
            <div class="server-overview-row__mark"><UIcon name="i-lucide-server" /></div>
            <div class="server-overview-row__main">
              <strong>{{ server.name }}</strong>
              <span>{{ server.username }}@{{ server.host }}:{{ server.port }}</span>
            </div>
            <div class="server-overview-row__meta">
              <StatusBadge :status="server.status" :service-active="server.serviceActive" />
              <small>{{ formatAgo(server.lastConnectedAt) }}</small>
            </div>
            <UIcon name="i-lucide-chevron-right" class="chevron" />
          </NuxtLink>
        </div>
        <EmptyState v-else icon="i-lucide-server-off" title="还没有服务器" description="添加第一台服务器，面板会自动探测 Caddy 服务。">
          <UButton to="/servers/new" size="sm">添加服务器</UButton>
        </EmptyState>
      </section>

      <aside class="panel recent-panel">
        <div class="panel__header"><div><h2>近期操作</h2><p>配置与服务变更</p></div></div>
        <div v-if="recentOperations.length" class="recent-list">
          <OperationCard v-for="operation in recentOperations" :key="operation.id" :operation="operation" compact />
        </div>
        <EmptyState v-else icon="i-lucide-history" title="暂无操作" description="配置应用和服务操作会显示在这里。" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dashboard-error { margin-bottom: 20px; }
.dashboard-error button { margin-left: auto; color: inherit; text-decoration: underline; }
.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
.metric-card { position: relative; display: flex; align-items: flex-start; gap: 16px; overflow: hidden; padding: 22px; transition: border-color .18s ease, transform .18s ease; }
.metric-card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.metric-card::after { position: absolute; right: -28px; bottom: -38px; width: 108px; height: 108px; border: 1px solid var(--line); border-radius: 50%; content: ""; }
.metric-card__icon { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: 12px; }
.metric-card__icon svg { width: 20px; height: 20px; }
.metric-card__icon--green { color: var(--accent); background: var(--accent-soft); }
.metric-card__icon--blue { color: var(--info); background: rgba(117,174,250,.1); }
.metric-card__icon--amber { color: var(--warning); background: rgba(233,180,95,.1); }
.metric-card__body { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.metric-card__body span { color: var(--text-soft); font-size: 13px; }
.metric-card__body strong { display: block; margin-top: 6px; font-size: 32px; font-weight: 720; letter-spacing: -.04em; line-height: 1; }
.metric-card__body small { margin-top: 8px; color: var(--text-faint); font-size: 12px; }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(290px, .85fr); gap: 20px; }
.subtle-link { display: flex; align-items: center; gap: 4px; color: var(--text-soft); font-size: 12px; }
.subtle-link:hover { color: var(--accent); }
.server-overview-row { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--line); transition: background .15s; }
.server-overview-row:last-child { border-bottom: 0; }
.server-overview-row:hover { background: rgba(255,255,255,.025); }
.server-overview-row__mark { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border: 1px solid var(--line); border-radius: 10px; color: var(--text-soft); }
.server-overview-row__main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.server-overview-row__main strong { font-size: 14px; }
.server-overview-row__main span { overflow: hidden; margin-top: 3px; color: var(--text-faint); font-family: monospace; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.server-overview-row__meta { display: flex; align-items: flex-end; flex-direction: column; gap: 5px; }
.server-overview-row__meta small { color: var(--text-faint); font-size: 11px; }
.chevron { color: var(--text-faint); }
.recent-list { padding: 4px 20px 8px; }
.recent-panel :deep(.empty-state) { min-height: 260px; }
@media (max-width: 1100px) { .dashboard-grid { grid-template-columns: 1fr; } }
@media (max-width: 680px) { .metric-grid { grid-template-columns: 1fr; } .server-overview-row__meta small { display: none; } }
</style>
