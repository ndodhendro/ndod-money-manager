type ToastListener = (message: string | null) => void

let current: string | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<ToastListener>()

function emit() {
  for (const listener of listeners) listener(current)
}

export function showAppToast(message: string, durationMs = 2000): void {
  current = message
  emit()
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    current = null
    hideTimer = null
    emit()
  }, durationMs)
}

export function hideAppToast(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (current == null) return
  current = null
  emit()
}

export function subscribeAppToast(listener: ToastListener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}
