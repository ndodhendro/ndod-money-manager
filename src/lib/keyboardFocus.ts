/**
 * Fokus input nominal dari gesture user tanpa kedip keyboard.
 *
 * Aturan:
 * - Input nominal VISIBLE → fokus langsung.
 * - Input belum visible (sedang di menu lain) → buka ghost + tahan blur
 *   sampai Quick Add terlihat, baru claim sekali ke nominal.
 *
 * Jangan pernah focus() ke input yang opacity-0 / tersembunyi —
 * di Chrome/Samsung itu bikin numpad muncul lalu langsung hilang.
 */

let amountInput: HTMLInputElement | null = null
let ghost: HTMLInputElement | null = null
let holdGhostFocus = false

export function registerAmountInput(el: HTMLInputElement | null): void {
  amountInput = el
}

function isElementVisible(el: HTMLElement): boolean {
  let node: HTMLElement | null = el
  while (node) {
    if (node.getAttribute('aria-hidden') === 'true') return false
    const style = window.getComputedStyle(node)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false
    }
    node = node.parentElement
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function hasPendingNumericKeyboard(): boolean {
  return ghost != null && document.body.contains(ghost)
}

function clearGhost(): void {
  holdGhostFocus = false
  if (ghost) {
    ghost.remove()
    ghost = null
  }
}

function openGhostKeyboard(): void {
  clearGhost()

  const input = document.createElement('input')
  input.type = 'text'
  input.inputMode = 'numeric'
  input.setAttribute('pattern', '[0-9]*')
  input.setAttribute('enterkeyhint', 'next')
  input.autocomplete = 'off'
  input.setAttribute('aria-hidden', 'true')
  input.tabIndex = -1
  Object.assign(input.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    border: '0',
    padding: '0',
    margin: '0',
    zIndex: '-1',
  })
  document.body.appendChild(input)
  ghost = input
  holdGhostFocus = true

  // Tahan fokus di ghost selama navigasi route agar numpad tidak drop.
  input.addEventListener('blur', () => {
    if (holdGhostFocus && ghost === input) {
      requestAnimationFrame(() => {
        if (holdGhostFocus && ghost === input) {
          input.focus({ preventScroll: true })
        }
      })
    }
  })

  input.focus({ preventScroll: true })
}

function focusAmount(el: HTMLInputElement): void {
  el.focus({ preventScroll: true })
  try {
    const len = el.value.length
    el.setSelectionRange(len, len)
  } catch {
    // abaikan
  }
}

/**
 * Dipanggil dari pointerdown menu Tambah (masih dalam user gesture).
 */
export function requestAmountFocus(): void {
  if (amountInput && isElementVisible(amountInput)) {
    clearGhost()
    focusAmount(amountInput)
    return
  }
  // Layar Tambah belum terlihat — jangan fokus ke input tersembunyi.
  openGhostKeyboard()
}

export function openNumericKeyboard(): void {
  if (amountInput && isElementVisible(amountInput)) {
    clearGhost()
    focusAmount(amountInput)
    return
  }
  openGhostKeyboard()
}

/** Tutup numpad (ghost + input nominal). Dipakai saat pindah ke menu non-Tambah. */
export function dismissNumericKeyboard(): void {
  holdGhostFocus = false
  clearGhost()
  if (amountInput) amountInput.blur()
  const active = document.activeElement
  if (
    active instanceof HTMLInputElement &&
    (active.inputMode === 'numeric' || active.inputMode === 'decimal')
  ) {
    active.blur()
  }
}

/**
 * Pindahkan fokus ghost → input nominal setelah layar Tambah terlihat.
 */
export function claimNumericKeyboard(target: HTMLInputElement | null): boolean {
  if (!target) return false
  if (!hasPendingNumericKeyboard()) return false
  if (!isElementVisible(target)) return false

  holdGhostFocus = false
  focusAmount(target)
  clearGhost()
  return true
}

export const FOCUS_AMOUNT_EVENT = 'mm:focus-amount'
