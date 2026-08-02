import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { hideAppToast, showAppToast } from '../lib/appToast'
import {
  consumeOverlayHandlers,
  dismissSoftKeyboard,
  registerBackHandler,
} from '../lib/overlayBack'
import { dismissNumericKeyboard } from '../lib/keyboardFocus'

const EXIT_ARM_MS = 2000

function isAddEditPath(pathname: string): boolean {
  return pathname === '/tambah' || pathname.startsWith('/transaksi/')
}

/**
 * Tombol Back HP:
 * 1) Tutup overlay (circle/category/date/…)
 * 2) Di add/edit → kembali ke History (sama seperti tombol ←), keyboard ikut ditutup
 * 3) Di tab utama → tutup keyboard, lalu toast "tekan sekali lagi" / keluar
 *
 * Navigasi antar menu (BottomNav) tidak boleh di-rollback.
 */
export function useBackButtonTrap(): void {
  const location = useLocation()
  const navigate = useNavigate()
  const stickyHref = useRef(window.location.href)
  const pathRef = useRef(location.pathname)
  const exitArmed = useRef(false)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allowExit = useRef(false)

  pathRef.current = location.pathname

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

      const href = stickyHref.current
      const path = pathRef.current

      // 1) Overlay sheet/picker dulu.
      if (consumeOverlayHandlers()) {
        clearExitArm()
        hideAppToast()
        pushTrap(href)
        return
      }

      // 2) Add/edit: selalu kembali ke History (jangan tertahan di dismiss keyboard).
      if (isAddEditPath(path)) {
        clearExitArm()
        hideAppToast()
        dismissNumericKeyboard()
        // Tunda navigate: beberapa browser/HashRouter bentrok jika
        // navigate dipanggil sinkron di dalam handler popstate.
        window.setTimeout(() => {
          navigate('/riwayat', { replace: true })
        }, 0)
        return
      }

      // 3) Tab utama: tutup keyboard dulu.
      if (dismissSoftKeyboard()) {
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
      showAppToast('Press again to exit', EXIT_ARM_MS)
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
  }, [navigate])
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
