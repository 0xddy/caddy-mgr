<script setup lang="ts">
import { shortCaddyVersion } from '~/composables/useApi'

useHead({ title: '服务器' })
const api = useApi()
const toast = useToast()
const search = ref('')
const deleting = ref<string | null>(null)
const deletePending = ref(false)

const { data: servers, status, error, refresh } = await useAsyncData('servers-list', () => api.servers.list(), { default: () => [] })

const filteredServers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword)
    return servers.value
  return servers.value.filter(server => [server.name, server.host, server.username, server.configPath, server.serviceName]
    .some(value => value?.toLowerCase().includes(keyword)))
})

async function removeServer() {
  if (!deleting.value)
    return
  deletePending.value = true
  try {
    await api.servers.remove(deleting.value)
    deleting.value = null
    await refresh()
    toast.add({ title: '服务器已移除', color: 'success' })
  }
  catch (error) {
    toast.add({ title: '移除失败', description: (error as Error).message, color: 'error' })
  }
  finally {
    deletePending.value = false
  }
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '从未'
}
</script>

<template>
  <div>
    <PageHeader eyebrow="SERVERS" title="服务器" description="通过 SSH 管理远程 systemd Caddy 实例。">
      <template #actions><UButton to="/servers/new" icon="i-lucide-plus">添加服务器</UButton></template>
    </PageHeader>

    <div class="server-toolbar">
      <UInput v-model="search" icon="i-lucide-search" placeholder="搜索名称、主机或路径" class="server-search" />
      <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">刷新</UButton>
    </div>

    <div v-if="error" class="error-callout servers-error">{{ error.message }}</div>
    <LoadingBlock v-if="status === 'pending' && !servers.length" :rows="5" class="panel" />

    <div v-else-if="filteredServers.length" class="server-grid">
      <article v-for="server in filteredServers" :key="server.id" class="server-card panel">
        <NuxtLink :to="`/servers/${server.id}`" class="server-card__main">
          <div class="server-card__topline">
            <div class="server-card__icon"><UIcon name="i-lucide-server" /></div>
            <StatusBadge :status="server.status" :service-active="server.serviceActive" />
          </div>
          <h2>{{ server.name }}</h2>
          <p class="server-card__host">{{ server.username }}@{{ server.host }}:{{ server.port }}</p>
          <dl>
            <div><dt>服务</dt><dd>{{ server.serviceName || '待探测' }}</dd></div>
            <div><dt>配置</dt><dd :title="server.configPath || ''">{{ server.configPath || '待探测' }}</dd></div>
            <div><dt>版本</dt><dd>{{ shortCaddyVersion(server.caddyVersion) || '未知' }}</dd></div>
          </dl>
        </NuxtLink>
        <footer>
          <span>最后连接 {{ formatDate(server.lastConnectedAt) }}</span>
          <div>
            <UButton :to="`/servers/${server.id}/config`" size="xs" color="neutral" variant="ghost" icon="i-lucide-file-pen-line" aria-label="编辑配置" />
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" aria-label="移除服务器" @click="deleting = server.id" />
          </div>
        </footer>
      </article>
    </div>

    <EmptyState v-else-if="!servers.length" class="panel" icon="i-lucide-server-off" title="还没有服务器" description="填写 SSH 信息后，面板会自动查找 Caddy 服务和配置文件。">
      <UButton to="/servers/new" icon="i-lucide-plus">添加第一台服务器</UButton>
    </EmptyState>
    <EmptyState v-else class="panel" icon="i-lucide-search-x" title="没有匹配结果" description="试试搜索其他关键词。" />

    <div v-if="deleting" class="confirm-overlay" role="dialog" aria-modal="true">
      <div class="confirm-dialog panel">
        <div class="confirm-dialog__icon"><UIcon name="i-lucide-trash-2" /></div>
        <h2>移除这台服务器？</h2>
        <p>只会删除面板中的连接信息与本地历史，不会修改远端 Caddy 服务。</p>
        <div class="confirm-dialog__actions">
          <UButton color="neutral" variant="outline" :disabled="deletePending" @click="deleting = null">取消</UButton>
          <UButton color="error" :loading="deletePending" @click="removeServer">确认移除</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.server-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.server-search { width: min(380px, 100%); }
.server-search :deep([data-slot='base']) {
  height: 40px;
  border-radius: 10px;
  color: var(--text);
  background: rgba(7, 11, 9, 0.55);
  box-shadow: 0 0 0 1px var(--line-strong) inset;
}
.servers-error { margin-bottom: 17px; }
.server-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.server-card { overflow: hidden; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
.server-card:hover { border-color: var(--line-strong); transform: translateY(-2px); box-shadow: 0 18px 40px rgba(0,0,0,.2); }
.server-card__main { display: block; padding: 20px 20px 16px; }
.server-card__topline { display: flex; align-items: center; justify-content: space-between; }
.server-card__icon { display: grid; width: 40px; height: 40px; place-items: center; border: 1px solid rgba(88,214,141,.2); border-radius: 12px; color: var(--accent); background: var(--accent-soft); }
.server-card h2 { margin: 16px 0 4px; font-size: 17px; letter-spacing: -.02em; }
.server-card__host { margin: 0 0 18px; color: var(--text-faint); font-family: monospace; font-size: 12px; }
.server-card dl { display: grid; gap: 10px; margin: 0; }
.server-card dl div { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 9px; }
.server-card dt { color: var(--text-faint); font-size: 12px; }
.server-card dd { overflow: hidden; margin: 0; color: var(--text-soft); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.server-card footer { display: flex; min-height: 46px; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 13px 8px 20px; border-top: 1px solid var(--line); color: var(--text-faint); background: rgba(0,0,0,.14); font-size: 12px; }
.server-card footer div { display: flex; }
.confirm-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px; background: rgba(3,5,4,.72); backdrop-filter: blur(8px); }
.confirm-dialog { width: min(410px, 100%); padding: 26px; text-align: center; box-shadow: var(--shadow); }
.confirm-dialog__icon { display: grid; width: 46px; height: 46px; margin: 0 auto; place-items: center; border-radius: 13px; color: var(--danger); background: rgba(243,121,121,.1); }
.confirm-dialog h2 { margin: 16px 0 6px; font-size: 18px; }
.confirm-dialog p { margin: 0; color: var(--text-soft); font-size: 13px; line-height: 1.6; }
.confirm-dialog__actions { display: flex; justify-content: center; gap: 9px; margin-top: 22px; }
@media (max-width: 1100px) { .server-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .server-grid { grid-template-columns: 1fr; } .server-toolbar { align-items: stretch; flex-direction: column; } .server-search { width: 100%; } }
</style>
