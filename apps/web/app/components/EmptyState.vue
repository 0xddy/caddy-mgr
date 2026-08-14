<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description: string
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon"><UIcon :name="icon || 'i-lucide-inbox'" /></div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
