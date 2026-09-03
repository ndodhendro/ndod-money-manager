import {
  SINKING_FUNDING_SOURCE_LABELS,
  SINKING_FUNDING_SOURCES,
  type SinkingFundingSource,
} from '../lib/types'

interface SinkingFundingToggleProps {
  value: SinkingFundingSource
  onChange: (source: SinkingFundingSource) => void
}

/** Segmented Monthly Estimate / Bonus Income (THR). */
export function SinkingFundingToggle({
  value,
  onChange,
}: SinkingFundingToggleProps) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
      role="radiogroup"
      aria-label="Funding source"
    >
      {SINKING_FUNDING_SOURCES.map((source) => {
        const selected = value === source
        return (
          <button
            key={source}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(source)}
            className={`rounded-lg px-1 py-2 text-sm font-semibold leading-tight transition-colors ${
              selected
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50'
                : 'text-neutral-500'
            }`}
          >
            {SINKING_FUNDING_SOURCE_LABELS[source]}
          </button>
        )
      })}
    </div>
  )
}
