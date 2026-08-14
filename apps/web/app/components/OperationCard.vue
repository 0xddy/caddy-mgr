<script setup lang="ts">
import type { Operation } from '~/types/api'

const props = defineProps<{ operation: Operation, compact?: boolean }>()

const kindLabels = {
  apply: '应用配置',
  restore: '恢复版本',
  reload: '重载服务',
  restart: '重启服务',
  discover: '重新探测',
}

const statusMeta = computed(() => ({
  queued: { label: '等待中', icon: 'i-lucide-clock-3', className: 'operation--pending' },
  running: { label: '执行中', icon: 'i-lucide-loader-circle', className: 'operation--running' },
  succeeded: { label: '已完成', icon: 'i-lucide-circle-check', className: 'operation--success' },
  failed: { label: '失败', icon: 'i-lucide-circle-x', className: 'operation--failed' },
  rolled_back: { label: '已自动恢复', icon: 'i-lucide-rotate-ccw', className: 'operation--warn' },
  interrupted: { label: '已中断', icon: 'i-lucide-circle-pause', className: 'operation--warn' },
  needs_attention: { label: '需人工处理', icon: 'i-lucide-triangle-alert', className: 'operation--failed' },
})[props.operation.status])

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <article class="operation-card" :class="[statusMeta.className, { 'operation-card--compact': compact }]">
    <div class="operation-card__icon">
      <UIcon :name="statusMeta.icon" :class="{ spinning: operation.status === 'running' }" />
    </div>
    <div class="operation-card__body">
      <div class="operation-card__topline">
        <strong>{{ kindLabels[operation.kind] }}</strong>
        <span>{{ statusMeta.label }}</span>
      </div>
      <p>{{ operation.summary || operation.stage || '正在准备操作' }}</p>
      <div v-if="!compact && operation.backupPath" class="operation-card__detail">
        远端备份：<code>{{ operation.backupPath }}</code>
      </div>
      <time>{{ formatDate(operation.finishedAt || operation.startedAt || operation.createdAt) }}</time>
    </div>
  </article>
</template>
