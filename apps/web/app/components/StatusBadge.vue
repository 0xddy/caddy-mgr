<script setup lang="ts">
import type { ServerConnectionStatus } from '~/types/api'

const props = defineProps<{
  status: ServerConnectionStatus
  serviceActive?: boolean
}>()

const presentation = computed(() => {
  if (props.status === 'online' && props.serviceActive !== false)
    return { label: '运行中', className: 'status--ok', pulse: true }
  if (props.status === 'online')
    return { label: '服务已停止', className: 'status--warn', pulse: false }
  if (props.status === 'offline')
    return { label: '无法连接', className: 'status--error', pulse: false }
  if (props.status === 'unsupported')
    return { label: '不受支持', className: 'status--warn', pulse: false }
  return { label: '状态未知', className: 'status--muted', pulse: false }
})
</script>

<template>
  <span class="status-badge" :class="presentation.className">
    <span class="status-badge__dot" :class="{ 'status-badge__dot--pulse': presentation.pulse }" />
    {{ presentation.label }}
  </span>
</template>
