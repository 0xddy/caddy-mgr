import type { Operation } from '~/types/api'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'rolled_back', 'interrupted', 'needs_attention'])

export function useOperationPolling() {
  const operation = ref<Operation | null>(null)
  const polling = ref(false)
  const api = useApi()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function poll(id: string, onFinished?: (operation: Operation) => void) {
    stop()
    polling.value = true

    const tick = async () => {
      try {
        operation.value = await api.operations.get(id)
        if (TERMINAL_STATUSES.has(operation.value.status)) {
          polling.value = false
          onFinished?.(operation.value)
          return
        }
        timer = setTimeout(() => { void tick() }, 1200)
      }
      catch {
        timer = setTimeout(() => { void tick() }, 2500)
      }
    }

    await tick()
  }

  function stop() {
    if (timer)
      clearTimeout(timer)
    timer = undefined
    polling.value = false
  }

  onScopeDispose(stop)
  return { operation, polling, poll, stop }
}
