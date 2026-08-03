import {
  CIRCLE_BADGE_CLASS,
  CIRCLE_LABELS,
  CIRCLES,
  type Circle,
} from '../lib/types'

type CircleFilter = Circle | 'semua'

interface CircleFilterChipsProps {
  value: CircleFilter
  onChange: (next: CircleFilter) => void
}

export function CircleFilterChips({ value, onChange }: CircleFilterChipsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {(['semua', ...CIRCLES] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            value === f
              ? f === 'semua'
                ? 'bg-emerald-500 text-white'
                : CIRCLE_BADGE_CLASS[f]
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
          } ${
            value === f && f !== 'semua'
              ? 'ring-2 ring-offset-1 ring-current dark:ring-offset-neutral-950'
              : ''
          }`}
        >
          {f === 'semua' ? 'All circles' : CIRCLE_LABELS[f]}
        </button>
      ))}
    </div>
  )
}
