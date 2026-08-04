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

function isSettingsSubPath(pathname: string): boolean {
  return pathname.startsWith('/pengaturan/') && pathname !== '/pengaturan'
}

function isPlanSubPath(pathname: string): boolean {
  return pathname.startsWith('/rencana/') && pathname !== '/rencana'
}

/** Add/edit recurring form routes (not the list itself). */
export function isRecurringFormPath(pathname: string): boolean {
  if (pathname === '/pengaturan/recurring/new') return true
  if (!pathname.startsWith('/pengaturan/recurring/')) return false
  const rest = pathname.slice('/pengaturan/recurring/'.length)
  return rest.length > 0 && !rest.includes('/')
}

/** Add category form route (not the list itself). */
export function isCategoriesFormPath(pathname: string): boolean {
  return pathname === '/pengaturan/categories/new'
}

/**
 * Tombol Back HP:
 * 1) Tutup overlay (circle/category/date/…)
 * 2) Di add/edit → kembali ke History
 * 2b) Di add/edit recurring → list Recurring
 * 2c) Di add category → list Categories
 * 3) Di sub-halaman Settings → index Settings
 * 3b) Di sub-halaman Plan → index Plan
 * 4) Di tab utama → toast "tekan sekali lagi" / keluar
 */
export function useBackButtonTrap(): void {
  const location = useLocation()
  const navigate = useNavigate()
  const stickyHref = useRef(window.location.href)
  const pathRef = useRef(location.pathname)
  const exitArmed = useRef(false)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allowExit = useRef(false)
  const trapSeq = useRef(0)

  pathRef.current = location.pathname

  function clearExitArm() {
    exitArmed.current = false
    if (exitTimer.current) {
      clearTimeout(exitTimer.current)
      exitTimer.current = null
    }
  }

  /**
   * Re-arm the back trap. Same-URL pushState is ignored on some Android WebViews,
   * so we vary the document query (`_mmb`) outside the hash — HashRouter ignores it.
   * Do not replaceState afterward (that can coalesce entries and drop the trap).
   */
  function pushTrap(href = stickyHref.current) {
    trapSeq.current += 1
    try {
      const url = new URL(href)
      url.searchParams.set('_mmb', String(trapSeq.current))
      const next = url.toString()
      window.history.pushState(
        { mmBackTrap: true, n: trapSeq.current },
        '',
        next,
      )
      stickyHref.current = next
    } catch {
      window.history.pushState({ mmBackTrap: true, n: trapSeq.current }, '', href)
    }
  }

  useEffect(() => {
    if (allowExit.current) return

    // Only dismiss the "press again to exit" toast — keep success toasts
    // (Quick Add / Recurring save) for their full duration across navigations.
    const wasExitArmed = exitArmed.current
    clearExitArm()
    if (wasExitArmed) hideAppToast()
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

      // Leaving a route: do NOT pushTrap(stickyHref). sticky still points at the
      // page we're leaving; pushState would restore that hash and fight navigate()
      // (rapid list↔form redirects). Trap re-arms via the location effect.
      // 2) Add/edit transaction → History.
      if (isAddEditPath(path)) {
        clearExitArm()
        hideAppToast()
        dismissNumericKeyboard()
        window.setTimeout(() => {
          navigate('/riwayat', { replace: true })
        }, 0)
        return
      }

      // 2b) Add/edit recurring → list Recurring.
      if (isRecurringFormPath(path)) {
        clearExitArm()
        hideAppToast()
        dismissNumericKeyboard()
        window.setTimeout(() => {
          navigate('/pengaturan/recurring', { replace: true })
        }, 0)
        return
      }

      // 2c) Add category → list Categories.
      if (isCategoriesFormPath(path)) {
        clearExitArm()
        hideAppToast()
        dismissNumericKeyboard()
        window.setTimeout(() => {
          navigate('/pengaturan/categories', { replace: true })
        }, 0)
        return
      }

      // 3) Sub-halaman Settings → index Settings.
      if (isSettingsSubPath(path)) {
        clearExitArm()
        hideAppToast()
        dismissNumericKeyboard()
        window.setTimeout(() => {
          navigate('/pengaturan', { replace: true })
        }, 0)
        return
      }

      // 3b) Sub-halaman Plan → index Plan.
      if (isPlanSubPath(path)) {
        clearExitArm()
        hideAppToast()
        dismissNumericKeyboard()
        window.setTimeout(() => {
          navigate('/rencana', { replace: true })
        }, 0)
        return
      }

      // 4) Tab utama: tutup keyboard dulu.
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
