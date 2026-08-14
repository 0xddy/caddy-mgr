<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number, statusMessage?: string, message?: string } }>()

const title = computed(() => props.error.statusCode === 404 ? '页面不存在' : '页面暂时无法打开')

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp>
    <main class="error-page">
      <div class="error-code">{{ error.statusCode || 500 }}</div>
      <h1>{{ title }}</h1>
      <p>{{ error.statusMessage || error.message || '请稍后重试。' }}</p>
      <UButton icon="i-lucide-arrow-left" @click="goHome">返回控制台</UButton>
    </main>
  </UApp>
</template>
