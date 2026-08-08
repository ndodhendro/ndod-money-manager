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
 *
 * Saat claim: jangan focus ulang jika nominal sudah aktif (Strict Mode
 * double-invoke layoutEffect = sumber kedip open→close→open).
 */

let amountInput: HTMLInputElement | null = null
let ghost: HTMLInputElement | null = null
let holdGhostFocus = false
/** Ghost node yang sudah di-claim tapi belum di-remove (tunggu 1 frame). */
let ghostPendingRemoval: HTMLInputElement | null = null

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

function removeGhostNode(node: HTMLInputElement | null): void {
  if (!node) return
  if (document.body.contains(node)) node.remove()
}

function clearGhost(): void {
  holdGhostFocus = false
  removeGhostNode(ghost)
  ghost = null
  removeGhostNode(ghostPendingRemoval)
  ghostPendingRemoval = null
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
 * Dipanggil dari click FAB Tambah (masih dalam user gesture, setelah release).
 * Jangan panggil di pointerdown — numpad akan muncul di atas History sebelum
 * layar Tambah terlihat. Caller sebaiknya e.preventDefault() di pointerdown
 * agar tombol tidak mencuri fokus dari ghost.
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

  // Sudah di nominal (mis. invoke kedua Strict Mode) — hanya bersihkan ghost.
  if (document.activeElement === target) {
    const toRemove = ghost
    ghost = null
    ghostPendingRemoval = toRemove
    requestAnimationFrame(() => {
      if (ghostPendingRemoval === toRemove) {
        removeGhostNode(toRemove)
        ghostPendingRemoval = null
      }
    })
    return true
  }

  focusAmount(target)

  // Tunda remove ghost 1 frame supaya IME tidak “kehilangan” fokus di antara
  // blur ghost dan settle fokus nominal (sumber kedip di Chrome Android).
  const toRemove = ghost
  ghost = null
  ghostPendingRemoval = toRemove
  requestAnimationFrame(() => {
    if (ghostPendingRemoval === toRemove) {
      removeGhostNode(toRemove)
      ghostPendingRemoval = null
    }
  })
  return true
}

/**
 * Setelah splash / mount layar Tambah: claim ghost bila ada.
 * Jangan focus ulang jika nominal sudah aktif — itu yang bikin kedip.
 */
export function focusAmountOnTambahReady(
  target: HTMLInputElement | null,
): void {
  if (!target || !isElementVisible(target)) return
  if (claimNumericKeyboard(target)) return
  if (document.activeElement === target) return
  // Cold start / tanpa ghost: best-effort (mungkin tanpa gesture).
  focusAmount(target)
}

/**
 * Dipanggil sedini mungkin saat cold start (masih dekat window aktivasi
 * launch PWA) supaya numpad siap sebelum React mount selesai.
 */
export function prepareLaunchNumericKeyboard(): void {
  if (hasPendingNumericKeyboard()) return
  if (amountInput && isElementVisible(amountInput)) {
    focusAmount(amountInput)
    return
  }
  openGhostKeyboard()
}

export const FOCUS_AMOUNT_EVENT = 'mm:focus-amount'
