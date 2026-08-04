import { useOverlayBack } from '../hooks/useBackButton'
import { ActionEmoji } from '../lib/actionEmoji'
import {
  CIRCLE_LABELS,
  CIRCLES,
  type Circle,
} from '../lib/types'

export const CIRCLE_ICONS: Record<Circle, string> = {
  hd_family: '👨‍👩‍👧',
  extended_family: '👨‍👩‍👧‍👦',
  friends: '👥',
}

interface CirclePickerProps {
  value: Circle | null
  onChange: (circle: Circle) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  highlighted?: boolean
  /** When true, show value but block changing (e.g. income → HD Family). */
  locked?: boolean
}

export function CirclePicker({
  value,
  onChange,
  open,
  onOpenChange,
  highlighted = false,
  locked = false,
}: CirclePickerProps) {
  useOverlayBack(open && !locked, () => {
    onOpenChange(false)
    return true
  })

  function handlePick(next: Circle) {
    onChange(next)
    onOpenChange(false)
  }

  return (
    <>
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          if (locked) return
          onOpenChange(true)
        }}
        className={`flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left shadow-sm dark:bg-neutral-800 ${
          locked ? 'cursor-default opacity-90' : ''
        } ${
          highlighted && !locked
            ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-neutral-950'
            : ''
        }`}
      >
        <span className="text-xl" aria-hidden>
          {value ? CIRCLE_ICONS[value] : '⭕'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-neutral-400">
            Circle
          </p>
          <p
            className={`truncate text-sm font-medium ${
              value
                ? 'text-neutral-900 dark:text-white'
                : 'text-neutral-400'
            }`}
          >
            {value ? CIRCLE_LABELS[value] : 'Select circle'}
          </p>
        </div>
        {!locked && (
          <span className="shrink-0 text-neutral-300">›</span>
        )}
      </button>

      {open && !locked && (
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
                Select circle
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
              {CIRCLES.map((c) => {
                const picked = c === value
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handlePick(c)}
                    className={`flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-4 text-left dark:border-neutral-900 ${
                      picked ? 'bg-emerald-50 dark:bg-emerald-950' : ''
                    }`}
                  >
                    <span className="text-2xl" aria-hidden>
                      {CIRCLE_ICONS[c]}
                    </span>
                    <span
                      className={`min-w-0 flex-1 text-sm font-semibold ${
                        picked
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-neutral-800 dark:text-neutral-100'
                      }`}
                    >
                      {CIRCLE_LABELS[c]}
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
