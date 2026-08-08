import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { subscribeAppToast } from '../lib/appToast'

const TOAST_TOP_PAD = 'max(0.75rem, env(safe-area-inset-top))'

/** Toast global — selalu di viewport terlihat (aman dari scroll / keyboard / bottom nav). */
export function AppToast() {
  const [message, setMessage] = useState<string | null>(null)
  const [viewportTop, setViewportTop] = useState(0)

  useEffect(() => subscribeAppToast(setMessage), [])

  // Mobile: scroll / keyboard menggeser visualViewport — pin toast ke area terlihat.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const sync = () => setViewportTop(vv.offsetTop)
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  if (!message) return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ top: `calc(${viewportTop}px + ${TOAST_TOP_PAD})` }}
    >
      <div className="rounded-full bg-neutral-900/95 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
        {message}
      </div>
    </div>,
    document.body,
  )
}
