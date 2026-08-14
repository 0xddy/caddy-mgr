<script setup lang="ts">
import { createLineDiff } from '~/utils/diff'

const props = defineProps<{ before: string, after: string }>()
const lines = computed(() => createLineDiff(props.before, props.after))
const changed = computed(() => lines.value.filter(line => line.kind !== 'equal').length)
</script>

<template>
  <div class="diff-wrap">
    <div v-if="!changed" class="diff-empty"><UIcon name="i-lucide-circle-check" />配置没有变化</div>
    <div v-else class="diff-view">
      <div v-for="(line, index) in lines" :key="`${index}-${line.kind}`" class="diff-line" :class="`diff-line--${line.kind}`">
        <span class="diff-line__number">{{ line.oldNumber ?? '' }}</span>
        <span class="diff-line__number">{{ line.newNumber ?? '' }}</span>
        <span class="diff-line__mark">{{ line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' ' }}</span>
        <code>{{ line.text || ' ' }}</code>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-wrap { min-height: 420px; background: #0b0e0c; }
.diff-empty { display: flex; min-height: 420px; align-items: center; justify-content: center; gap: 8px; color: var(--accent); font-size: 12px; }
.diff-view { overflow: auto; padding: 10px 0; font-size: 11px; line-height: 1.65; }
.diff-line { display: grid; min-width: max-content; grid-template-columns: 44px 44px 26px minmax(500px, 1fr); }
.diff-line__number { padding-right: 10px; color: #4d5751; text-align: right; user-select: none; }
.diff-line__mark { color: #6d776f; text-align: center; user-select: none; }
.diff-line code { padding-right: 20px; white-space: pre; }
.diff-line--add { background: rgba(68, 177, 111, .12); }
.diff-line--add .diff-line__mark, .diff-line--add code { color: #89dfaa; }
.diff-line--remove { background: rgba(217, 91, 91, .11); }
.diff-line--remove .diff-line__mark, .diff-line--remove code { color: #eba1a1; }
</style>
