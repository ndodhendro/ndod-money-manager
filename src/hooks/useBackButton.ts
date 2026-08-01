import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { hideAppToast, showAppToast } from '../lib/appToast'
import { consumeBack, registerBackHandler } from '../lib/overlayBack'

const EXIT_ARM_MS = 2000

/**
 * Tombol Back HP:
 * 1) Tutup overlay/keyboard
 * 2) Kalau tidak ada yang ditutup → toast "tekan sekali lagi"
 * 3) Back kedua dalam window → keluar aplikasi
 *
 * Navigasi antar menu (BottomNav) tidak boleh di-rollback.
 */
export function useBackButtonTrap(): void {
  const location = useLocation()
  const stickyHref = useRef(window.location.href)
  const exitArmed = useRef(false)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allowExit = useRef(false)

  function clearExitArm() {
    exitArmed.current = false
    if (exitTimer.current) {
      clearTimeout(exitTimer.current)
      exitTimer.current = null
    }
  }

  function pushTrap(href = stickyHref.current) {
    window.history.pushState({ mmBackTrap: true }, '', href)
  }

  // Saat pindah menu via UI, update sticky URL + pasang trap baru.
  useEffect(() => {
    if (allowExit.current) return

    clearExitArm()
    hideAppToast()
    stickyHref.current = window.location.href
    pushTrap(stickyHref.current)
  }, [location])

  useEffect(() => {
    const onPopState = () => {
      if (allowExit.current) return

      // Selalu kembalikan URL ke halaman aktif (jangan biarkan history
      // router bergeser). Overlay/keyboard ditutup terpisah.
      const href = stickyHref.current

      if (consumeBack()) {
        clearExitArm()
        hideAppToast()
        pushTrap(href)
        return
      }

      if (exitArmed.current) {
        clearExitArm()
        hideAppToast()
        allowExit.current = true
        window.setTimeout(() => {
          window.history.back()
        }, 0)
        return
      }

      exitArmed.current = true
      showAppToast('Tekan sekali lagi untuk keluar', EXIT_ARM_MS)
      exitTimer.current = setTimeout(() => {
        exitArmed.current = false
        exitTimer.current = null
      }, EXIT_ARM_MS)
      pushTrap(href)
    }

    window.addEventListener('popstate', onPopState, true)
    return () => {
      window.removeEventListener('popstate', onPopState, true)
      clearExitArm()
    }
  }, [])
}

/**
 * Saat `active`, Back memanggil `onBack` (tutup overlay).
 * Return false dari onBack jika tidak jadi menangani.
 */
export function useOverlayBack(
  active: boolean,
  onBack: () => boolean | void,
): void {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    if (!active) return
    return registerBackHandler(() => {
      const result = onBackRef.current()
      return result !== false
    })
  }, [active])
}
