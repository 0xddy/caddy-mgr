<script setup lang="ts">
import { indentWithTab } from '@codemirror/commands'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { caddyfileSupport } from '~/utils/caddyfile-language'

const props = withDefaults(defineProps<{
  modelValue: string
  readonly?: boolean
}>(), { readonly: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLDivElement>()
let editor: EditorView | undefined
const readOnly = new Compartment()

const caddyTheme = EditorView.theme({
  '&': { height: '100%', color: '#d8e3dc', backgroundColor: '#0b0e0c' },
  '.cm-content': { caretColor: '#58d68d', padding: '16px 0', fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: '13px', lineHeight: '1.7' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#58d68d' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(88, 214, 141, .18)' },
  '.cm-gutters': { backgroundColor: '#0e1210', color: '#4d5851', border: 'none', borderRight: '1px solid rgba(255,255,255,.055)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,.025)' },
  '.cm-foldPlaceholder': { backgroundColor: '#1a211d', border: 'none', color: '#829087' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-tooltip': { backgroundColor: '#151a17', border: '1px solid rgba(255,255,255,.08)', color: '#d8e3dc' },
}, { dark: true })

onMounted(() => {
  if (!host.value)
    return
  editor = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        keymap.of([indentWithTab]),
        basicSetup,
        ...caddyfileSupport(),
        caddyTheme,
        EditorState.tabSize.of(4),
        readOnly.of(EditorState.readOnly.of(props.readonly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged)
            emit('update:modelValue', update.state.doc.toString())
        }),
      ],
    }),
  })
})

watch(() => props.modelValue, (value) => {
  if (!editor || editor.state.doc.toString() === value)
    return
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
})

watch(() => props.readonly, (value) => {
  editor?.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(value)) })
})

onBeforeUnmount(() => editor?.destroy())
</script>

<template>
  <div ref="host" class="config-editor" />
</template>

<style scoped>
.config-editor { height: 100%; min-height: 540px; overflow: hidden; }
.config-editor :deep(.cm-editor) { height: 100%; outline: none; }
.config-editor :deep(.cm-focused) { outline: none; }
</style>
