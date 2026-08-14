<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 3 })
</script>

<template>
  <div class="loading-block" aria-label="正在加载">
    <USkeleton v-for="row in rows" :key="row" class="loading-block__line" :style="{ width: `${100 - (row - 1) * 9}%` }" />
  </div>
</template>
