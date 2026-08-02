import { useEffect, useState } from 'react'
import { subscribeAppToast } from '../lib/appToast'

/** Toast global — selalu di atas layar (aman dari keyboard / bottom nav). */
export function AppToast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => subscribeAppToast(setMessage), [])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex justify-center px-4"
    >
      <div className="rounded-full bg-neutral-900/95 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
        {message}
      </div>
    </div>
  )
}
