type Listener = () => void

const listeners = new Set<Listener>()

/** Notify checklist / FAB that paid logs changed (check, uncheck, or tx delete). */
export function notifyRecurringBillsChanged(): void {
  for (const listener of listeners) listener()
}

export function subscribeRecurringBillsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
