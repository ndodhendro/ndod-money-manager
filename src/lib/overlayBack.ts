import { dismissNumericKeyboard, hasPendingNumericKeyboard } from './keyboardFocus'

type BackHandler = () => boolean

/** LIFO: handler terakhir (overlay paling atas) ditanya duluan. */
const handlers: BackHandler[] = []

/**
 * Daftarkan aksi tombol Back HP. Return true jika berhasil menutup sesuatu.
 * Unsubscribe saat overlay ditutup / unmount.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler)
  return () => {
    const i = handlers.lastIndexOf(handler)
    if (i >= 0) handlers.splice(i, 1)
  }
}

function dismissSoftKeyboard(): boolean {
  const active = document.activeElement
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    (active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      active.isContentEditable)
  ) {
    active.blur()
    dismissNumericKeyboard()
    return true
  }
  if (hasPendingNumericKeyboard()) {
    dismissNumericKeyboard()
    return true
  }
  return false
}

/** Dipanggil saat user tekan Back. True = ada yang ditutup. */
export function consumeBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]!()) return true
  }
  return dismissSoftKeyboard()
}
