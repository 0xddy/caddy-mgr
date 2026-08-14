<script setup lang="ts">
defineProps<{ compact?: boolean }>()
</script>

<template>
  <div class="brand" :class="{ 'brand--compact': compact }">
    <span class="brand__mark" aria-hidden="true">
      <svg viewBox="0 0 38 38" fill="none">
        <path d="M25.8 9.2A12 12 0 1 0 29.9 25" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" />
        <path d="M20.1 12.1A7.5 7.5 0 1 0 25.9 24.4" stroke="currentColor" stroke-opacity=".45" stroke-width="3.6" stroke-linecap="round" />
        <circle cx="28.5" cy="10.7" r="2.3" fill="currentColor" />
      </svg>
    </span>
    <span v-if="!compact" class="brand__text">
      <strong>Caddy</strong>
      <small>Manager</small>
    </span>
  </div>
</template>
