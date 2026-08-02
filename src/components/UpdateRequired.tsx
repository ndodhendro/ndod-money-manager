import { useEffect, useState } from 'react'
import { APP_LOGO_URL } from '../lib/branding'
import { applyPwaUpdate, subscribePwaNeedRefresh } from '../lib/pwaUpdate'

export function UpdateRequired() {
  const [needed, setNeeded] = useState(false)

  useEffect(() => subscribePwaNeedRefresh(setNeeded), [])

  if (!needed) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/80 px-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
      aria-describedby="update-required-desc"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-neutral-900">
        <img
          src={APP_LOGO_URL}
          alt=""
          className="mx-auto h-14 w-14 object-contain"
          aria-hidden
        />
        <h2
          id="update-required-title"
          className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Update required
        </h2>
        <p
          id="update-required-desc"
          className="mt-2 text-sm text-neutral-500 dark:text-neutral-400"
        >
          A new version of Ndod Budget is available. Reload to continue.
        </p>
        <button
          type="button"
          onClick={applyPwaUpdate}
          className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:scale-[0.98]"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
