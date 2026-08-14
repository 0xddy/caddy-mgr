<script setup lang="ts">
import type { ConfigRevision, ValidationResult } from '~/types/api'
import { formatCaddyfile } from '~/utils/caddyfile-format'

const route = useRoute()
const id = computed(() => String(route.params.id))
const api = useApi()
const toast = useToast()
const view = ref<'editor' | 'diff' | 'history'>('editor')
const content = ref('')
const baseline = ref('')
const validation = ref<ValidationResult | null>(null)
const busy = ref<'validate' | 'apply' | 'restore' | null>(null)
const showApplyConfirm = ref(false)
const restoreRevision = ref<ConfigRevision | null>(null)
const selectedRevision = ref<ConfigRevision | null>(null)
const revisionLoading = ref(false)
const conflictMessage = ref('')
const { operation: activeOperation, poll } = useOperationPolling()

const { data, status, error, refresh } = await useAsyncData(`server-config-${id.value}`, async () => {
  const [server, config, revisions] = await Promise.all([
    api.servers.get(id.value),
    api.servers.config(id.value),
    api.servers.revisions(id.value),
  ])
  return { server, config, revisions }
})

if (data.value) {
  content.value = data.value.config.content
  baseline.value = data.value.config.content
}

const server = computed(() => data.value?.server)
const remoteConfig = computed(() => data.value?.config)
const revisions = computed(() => data.value?.revisions || [])
const dirty = computed(() => content.value !== baseline.value)
const lineCount = computed(() => content.value.split('\n').length)
const byteSize = computed(() => new TextEncoder().encode(content.value).length)

useHead(() => ({ title: server.value ? `编辑配置 · ${server.value.name}` : '编辑配置' }))

onBeforeRouteLeave(() => {
  if (dirty.value && import.meta.client && !window.confirm('配置尚未应用，确定离开吗？'))
    return false
})

async function reloadData() {
  await refresh()
  if (data.value) {
    content.value = data.value.config.content
    baseline.value = data.value.config.content
    validation.value = null
    conflictMessage.value = ''
  }
}

function formatConfig() {
  if (busy.value)
    return
  validation.value = null
  const formatted = formatCaddyfile(content.value)
  if (formatted === content.value) {
    toast.add({ title: '已经是规范格式', color: 'success' })
    return
  }
  content.value = formatted
  toast.add({ title: '已格式化', description: '仅调整本地内容，尚未写入远端', color: 'success' })
}

async function validateConfig() {
  busy.value = 'validate'
  validation.value = null
  try {
    validation.value = await api.servers.validate(id.value, content.value)
    toast.add({
      title: validation.value.valid ? '配置校验通过' : '配置校验失败',
      description: validation.value.output || undefined,
      color: validation.value.valid ? 'success' : 'error',
    })
    return validation.value.valid
  }
  catch (error) {
    const apiError = error as ApiError
    validation.value = { valid: false, output: apiError.message }
    toast.add({ title: '配置校验失败', description: apiError.message, color: 'error' })
    return false
  }
  finally {
    busy.value = null
  }
}

async function prepareApply() {
  if (!dirty.value)
    return
  conflictMessage.value = ''
  if (await validateConfig()) {
    view.value = 'diff'
    showApplyConfirm.value = true
  }
}

async function applyConfig() {
  if (!remoteConfig.value)
    return
  busy.value = 'apply'
  conflictMessage.value = ''
  try {
    const accepted = await api.servers.apply(id.value, content.value, remoteConfig.value.baseHash)
    showApplyConfirm.value = false
    await poll(accepted.operationId, async (completed) => {
      if (completed.status === 'succeeded') {
        toast.add({ title: '配置已应用', description: 'Caddy 已无损重载', color: 'success' })
        await reloadData()
        view.value = 'editor'
      }
      else {
        toast.add({
          title: completed.status === 'needs_attention' ? '需要人工处理' : '配置应用失败',
          description: completed.summary || completed.stage,
          color: 'error',
        })
        await refresh()
      }
    })
  }
  catch (error) {
    const apiError = error as ApiError
    if (apiError.statusCode === 409)
      conflictMessage.value = '远端配置已被其他方式修改。请刷新后比较新版本，再重新应用。'
    else
      toast.add({ title: '无法提交配置', description: apiError.message, color: 'error' })
  }
  finally {
    busy.value = null
  }
}

async function openRevision(revision: ConfigRevision) {
  selectedRevision.value = revision
  if (revision.content !== undefined)
    return
  revisionLoading.value = true
  try {
    selectedRevision.value = await api.servers.revision(id.value, revision.id)
  }
  catch (error) {
    toast.add({ title: '读取历史版本失败', description: (error as Error).message, color: 'error' })
  }
  finally {
    revisionLoading.value = false
  }
}

async function restore() {
  if (!restoreRevision.value || !remoteConfig.value)
    return
  busy.value = 'restore'
  try {
    const accepted = await api.servers.restore(id.value, restoreRevision.value.id, remoteConfig.value.baseHash)
    restoreRevision.value = null
    await poll(accepted.operationId, async (completed) => {
      if (completed.status === 'succeeded') {
        toast.add({ title: '历史版本已恢复', color: 'success' })
        await reloadData()
        view.value = 'editor'
      }
      else {
        toast.add({ title: '版本恢复失败', description: completed.summary || completed.stage, color: 'error' })
      }
    })
  }
  catch (error) {
    const apiError = error as ApiError
    if (apiError.statusCode === 409)
      conflictMessage.value = '远端配置已改变，不能基于旧版本直接恢复。请先刷新。'
    else
      toast.add({ title: '无法提交恢复任务', description: apiError.message, color: 'error' })
  }
  finally {
    busy.value = null
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
}

function sourceLabel(source: ConfigRevision['source']) {
  return { baseline: '变更前基线', apply: '配置应用', restore: '历史恢复', external: '远端同步' }[source]
}
</script>

<template>
  <div class="config-page">
    <LoadingBlock v-if="status === 'pending' && !data" class="panel" :rows="8" />
    <div v-else-if="error || !data" class="panel">
      <EmptyState icon="i-lucide-file-warning" title="无法读取配置" :description="error?.message || '服务器不存在。'">
        <UButton to="/servers" color="neutral" variant="outline">返回服务器</UButton>
      </EmptyState>
    </div>

    <template v-else>
      <PageHeader eyebrow="CADDYFILE" :title="`编辑 ${server?.name}`" :description="remoteConfig?.modifiedAt ? `远端文件更新于 ${formatDate(remoteConfig.modifiedAt)}` : '编辑远端 Caddyfile'">
        <template #actions>
          <UButton :to="`/servers/${id}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left">实例详情</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-wand-sparkles" :disabled="!!busy" @click="formatConfig">格式化</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-shield-check" :loading="busy === 'validate'" :disabled="!!busy" @click="validateConfig">校验</UButton>
          <UButton icon="i-lucide-cloud-upload" :disabled="!dirty || !!busy" @click="prepareApply">查看并应用</UButton>
        </template>
      </PageHeader>

      <div v-if="conflictMessage" class="warning-callout config-callout">
        <UIcon name="i-lucide-git-compare-arrows" />
        <span>{{ conflictMessage }}</span>
        <UButton size="xs" color="warning" variant="soft" @click="reloadData">刷新远端配置</UButton>
      </div>

      <div v-if="activeOperation" class="active-operation panel">
        <OperationCard :operation="activeOperation" />
      </div>

      <section class="editor-shell panel">
        <div class="editor-toolbar">
          <div class="view-tabs">
            <button :class="{ active: view === 'editor' }" @click="view = 'editor'"><UIcon name="i-lucide-code-2" />编辑器</button>
            <button :class="{ active: view === 'diff' }" @click="view = 'diff'"><UIcon name="i-lucide-git-compare" />变更对比 <span v-if="dirty" /></button>
            <button :class="{ active: view === 'history' }" @click="view = 'history'"><UIcon name="i-lucide-history" />版本历史</button>
          </div>
          <div class="file-meta">
            <span class="mono">{{ server?.configPath }}</span>
            <em v-if="dirty">未应用</em>
          </div>
        </div>

        <div v-show="view === 'editor'" class="editor-pane">
          <ClientOnly>
            <LazyConfigEditor v-model="content" />
            <template #fallback><div class="editor-loading"><UIcon name="i-lucide-loader-circle" class="spinning" />正在加载编辑器…</div></template>
          </ClientOnly>
        </div>
        <div v-if="view === 'diff'" class="diff-pane">
          <div class="pane-caption"><span>当前远端版本</span><span>待应用版本</span></div>
          <ConfigDiff :before="baseline" :after="content" />
        </div>
        <div v-if="view === 'history'" class="history-pane">
          <div class="history-list">
            <button v-for="revision in revisions" :key="revision.id" :class="{ active: selectedRevision?.id === revision.id }" @click="openRevision(revision)">
              <span class="history-list__mark"><UIcon name="i-lucide-git-commit-vertical" /></span>
              <span class="history-list__body"><strong>{{ sourceLabel(revision.source) }}</strong><small>{{ formatDate(revision.createdAt) }}</small><code>{{ revision.hash.slice(0, 12) }}</code></span>
              <span>{{ Math.max(1, Math.round(revision.size / 1024)) }} KB</span>
            </button>
            <EmptyState v-if="!revisions.length" icon="i-lucide-history" title="暂无历史版本" description="第一次应用配置后会保存变更基线。" />
          </div>
          <div class="history-preview">
            <div v-if="revisionLoading" class="editor-loading"><UIcon name="i-lucide-loader-circle" class="spinning" />正在解密历史版本…</div>
            <template v-else-if="selectedRevision?.content !== undefined">
              <div class="history-preview__header">
                <div><strong>{{ sourceLabel(selectedRevision.source) }}</strong><small>与当前远端配置对比</small></div>
                <UButton size="sm" color="warning" variant="soft" icon="i-lucide-history" @click="restoreRevision = selectedRevision">恢复此版本</UButton>
              </div>
              <ConfigDiff :before="baseline" :after="selectedRevision.content" />
            </template>
            <EmptyState v-else icon="i-lucide-mouse-pointer-click" title="选择历史版本" description="点击左侧版本可查看内容与当前配置的差异。" />
          </div>
        </div>

        <footer class="editor-footer">
          <div><span>{{ lineCount }} 行</span><span>{{ byteSize }} 字节</span><span v-if="remoteConfig" class="mono">SHA {{ remoteConfig.baseHash.slice(0, 10) }}</span></div>
          <div class="validation-status" :class="{ valid: validation?.valid, invalid: validation && !validation.valid }">
            <UIcon :name="validation?.valid ? 'i-lucide-circle-check' : validation ? 'i-lucide-circle-x' : 'i-lucide-circle-dashed'" />
            {{ validation?.valid ? '远端校验通过' : validation ? '校验失败' : '尚未校验' }}
          </div>
        </footer>
      </section>

      <div v-if="validation && !validation.valid" class="validation-output panel">
        <div class="panel__header"><h3>校验输出</h3></div>
        <pre>{{ validation.output }}</pre>
      </div>

      <div v-if="showApplyConfirm" class="confirm-overlay" role="dialog" aria-modal="true">
        <div class="apply-dialog panel">
          <div class="apply-dialog__header">
            <div class="apply-dialog__icon"><UIcon name="i-lucide-cloud-upload" /></div>
            <div><h2>应用这次配置变更？</h2><p>服务端会再次校验、创建备份并原子替换，然后执行无损重载。</p></div>
          </div>
          <div class="apply-dialog__checks">
            <span><UIcon name="i-lucide-check" />远端配置校验通过</span>
            <span><UIcon name="i-lucide-shield-check" />失败时自动恢复备份</span>
            <span><UIcon name="i-lucide-ban" />不会降级执行重启</span>
          </div>
          <div class="apply-dialog__actions">
            <UButton color="neutral" variant="outline" :disabled="busy === 'apply'" @click="showApplyConfirm = false">取消</UButton>
            <UButton :loading="busy === 'apply'" icon="i-lucide-cloud-upload" @click="applyConfig">确认应用</UButton>
          </div>
        </div>
      </div>

      <div v-if="restoreRevision" class="confirm-overlay" role="dialog" aria-modal="true">
        <div class="apply-dialog panel">
          <div class="apply-dialog__header">
            <div class="apply-dialog__icon warning"><UIcon name="i-lucide-history" /></div>
            <div><h2>恢复这个历史版本？</h2><p>{{ formatDate(restoreRevision.createdAt) }} · {{ restoreRevision.hash.slice(0, 12) }}</p></div>
          </div>
          <div class="warning-callout">恢复也会执行冲突检查、远端校验、备份和无损重载。</div>
          <div class="apply-dialog__actions">
            <UButton color="neutral" variant="outline" :disabled="busy === 'restore'" @click="restoreRevision = null">取消</UButton>
            <UButton color="warning" :loading="busy === 'restore'" icon="i-lucide-history" @click="restore">确认恢复</UButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.config-page { max-width: 1440px; margin: 0 auto; }
.config-callout { align-items: center; margin-bottom: 14px; }
.config-callout span { flex: 1; }
.active-operation { margin-bottom: 14px; padding: 3px 20px; border-color: rgba(117,174,250,.2); }
.editor-shell { overflow: hidden; }
.editor-toolbar { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 18px; padding: 0 12px; border-bottom: 1px solid var(--line); }
.view-tabs { display: flex; align-self: stretch; }
.view-tabs button { position: relative; display: flex; align-items: center; gap: 7px; border: 0; padding: 0 13px; color: var(--text-faint); background: transparent; font-size: 13px; cursor: pointer; }
.view-tabs button:hover { color: var(--text-soft); }
.view-tabs button.active { color: var(--text); }
.view-tabs button.active::after { position: absolute; right: 10px; bottom: -1px; left: 10px; height: 2px; background: var(--accent); content: ""; }
.view-tabs button span { width: 5px; height: 5px; border-radius: 50%; background: var(--warning); }
.file-meta { display: flex; min-width: 0; align-items: center; gap: 9px; color: var(--text-faint); font-size: 12px; }
.file-meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-meta em { border-radius: 999px; padding: 3px 7px; color: var(--warning); background: rgba(233,180,95,.1); font-style: normal; white-space: nowrap; }
.editor-pane { height: min(65vh, 720px); min-height: 540px; }
.editor-loading { display: flex; min-height: 540px; align-items: center; justify-content: center; gap: 8px; color: var(--text-faint); background: #0b0e0c; font-size: 11px; }
.diff-pane { min-height: 540px; }
.pane-caption { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--line); color: var(--text-faint); background: #0e1210; font-size: 9px; }
.pane-caption span { padding: 8px 14px; }
.pane-caption span + span { border-left: 1px solid var(--line); }
.history-pane { display: grid; min-height: 540px; grid-template-columns: 280px minmax(0, 1fr); background: #0b0e0c; }
.history-list { border-right: 1px solid var(--line); background: #101411; }
.history-list > button { display: flex; width: 100%; align-items: center; gap: 9px; border: 0; border-bottom: 1px solid var(--line); padding: 12px 13px; color: var(--text); background: transparent; text-align: left; cursor: pointer; }
.history-list > button:hover, .history-list > button.active { background: rgba(88,214,141,.06); }
.history-list__mark { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 8px; color: var(--text-faint); background: rgba(255,255,255,.035); }
.history-list__body { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.history-list__body strong { font-size: 13px; }
.history-list__body small { margin-top: 2px; color: var(--text-faint); font-size: 11px; }
.history-list__body code { margin-top: 3px; color: #708078; font-size: 11px; }
.history-list > button > span:last-child { color: var(--text-faint); font-size: 12px; }
.history-preview { min-width: 0; overflow: hidden; }
.history-preview__header { display: flex; min-height: 56px; align-items: center; justify-content: space-between; gap: 15px; padding: 8px 14px; border-bottom: 1px solid var(--line); background: #101411; }
.history-preview__header div { display: flex; flex-direction: column; }
.history-preview__header strong { font-size: 11px; }
.history-preview__header small { margin-top: 2px; color: var(--text-faint); font-size: 9px; }
.editor-footer { display: flex; min-height: 40px; align-items: center; justify-content: space-between; padding: 0 14px; border-top: 1px solid var(--line); color: var(--text-faint); background: #101411; font-size: 12px; }
.editor-footer > div { display: flex; gap: 14px; }
.validation-status { display: flex; align-items: center; gap: 5px; }
.validation-status.valid { color: var(--accent); }
.validation-status.invalid { color: var(--danger); }
.validation-output { overflow: hidden; margin-top: 14px; }
.validation-output pre { max-height: 220px; overflow: auto; margin: 0; padding: 17px 20px; color: #e7a0a0; background: #0b0e0c; font-size: 10px; line-height: 1.6; white-space: pre-wrap; }
.confirm-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px; background: rgba(3,5,4,.72); backdrop-filter: blur(8px); }
.apply-dialog { width: min(520px, 100%); padding: 25px; box-shadow: var(--shadow); }
.apply-dialog__header { display: flex; align-items: flex-start; gap: 14px; }
.apply-dialog__icon { display: grid; width: 43px; height: 43px; flex: 0 0 auto; place-items: center; border-radius: 12px; color: var(--accent); background: var(--accent-soft); }
.apply-dialog__icon.warning { color: var(--warning); background: rgba(233,180,95,.1); }
.apply-dialog h2 { margin: 1px 0 5px; font-size: 18px; }
.apply-dialog p { margin: 0; color: var(--text-soft); font-size: 11px; line-height: 1.55; }
.apply-dialog__checks { display: grid; gap: 8px; margin: 20px 0; border: 1px solid var(--line); border-radius: 10px; padding: 13px; color: var(--text-soft); background: rgba(0,0,0,.12); font-size: 11px; }
.apply-dialog__checks span { display: flex; align-items: center; gap: 7px; }
.apply-dialog__checks svg { color: var(--accent); }
.apply-dialog__actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 20px; }
@media (max-width: 760px) { .file-meta { display: none; } .history-pane { grid-template-columns: 1fr; } .history-list { max-height: 220px; overflow: auto; border-right: 0; border-bottom: 1px solid var(--line); } }
@media (max-width: 560px) { .view-tabs { width: 100%; } .view-tabs button { flex: 1; justify-content: center; padding: 0 5px; } .editor-footer > div span:nth-child(2), .editor-footer > div span:nth-child(3) { display: none; } }
</style>
