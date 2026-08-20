import { SINKING_FUND_LABEL_CLASS } from '../lib/types'

interface SinkingFundLabelProps {
  className?: string
}

/** Text-only SF marker for subcategories linked to a sinking fund. */
export function SinkingFundLabel({ className = '' }: SinkingFundLabelProps) {
  return (
    <span
      className={`shrink-0 text-xs font-medium leading-none ${SINKING_FUND_LABEL_CLASS} ${className}`}
      title="Sinking Fund"
      aria-label="Sinking Fund"
    >
      SF
    </span>
  )
}
