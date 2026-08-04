import { useOverlayBack } from '../hooks/useBackButton'
import { ActionEmoji } from '../lib/actionEmoji'
import {
  OWNER_LABELS,
  OWNERS,
  type Owner,
} from '../lib/types'

export const OWNER_ICONS: Record<Owner, string> = {
  suami: '🧑',
  istri: '👩',
}

interface OwnerPickerProps {
  value: Owner | null
  onChange: (owner: Owner) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  highlighted?: boolean
}

export function OwnerPicker({
  value,
  onChange,
  open,
  onOpenChange,
  highlighted = false,
}: OwnerPickerProps) {
  useOverlayBack(open, () => {
    onOpenChange(false)
    return true
  })

  function handlePick(next: Owner) {
    onChange(next)
    onOpenChange(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left shadow-sm dark:bg-neutral-800 ${
          highlighted
            ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-neutral-950'
            : ''
        }`}
      >
        <span className="text-xl" aria-hidden>
          {value ? OWNER_ICONS[value] : '👤'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-neutral-400">
            Profile
          </p>
          <p
            className={`truncate text-sm font-medium ${
              value
                ? 'text-neutral-900 dark:text-white'
                : 'text-neutral-400'
            }`}
          >
            {value ? OWNER_LABELS[value] : 'Select profile'}
          </p>
        </div>
        <span className="shrink-0 text-neutral-300">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative flex max-h-[50vh] flex-col rounded-t-2xl bg-neutral-100 shadow-2xl dark:bg-neutral-900">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                Select profile
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-2 py-1 text-base leading-none"
                aria-label="Close"
                title="Close"
              >
                {ActionEmoji.close}
              </button>
            </div>
            <div className="overflow-y-auto bg-white dark:bg-neutral-950">
              {OWNERS.map((o) => {
                const picked = o === value
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => handlePick(o)}
                    className={`flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-4 text-left dark:border-neutral-900 ${
                      picked ? 'bg-emerald-50 dark:bg-emerald-950' : ''
                    }`}
                  >
                    <span className="text-2xl" aria-hidden>
                      {OWNER_ICONS[o]}
                    </span>
                    <span
                      className={`min-w-0 flex-1 text-sm font-semibold ${
                        picked
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-neutral-800 dark:text-neutral-100'
                      }`}
                    >
                      {OWNER_LABELS[o]}
                    </span>
                    {picked && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✓
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
