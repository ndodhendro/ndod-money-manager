import { NO_TRANSFER_LABEL, NO_TRANSFER_LABEL_CLASS } from '../lib/types'

interface NoTransferLabelProps {
  className?: string
}

/** Text-only marker for sinking funds with no Monthly Estimate transfer. */
export function NoTransferLabel({ className = '' }: NoTransferLabelProps) {
  return (
    <span
      className={`shrink-0 text-xs font-medium leading-none ${NO_TRANSFER_LABEL_CLASS} ${className}`}
      title="No Transfer in Monthly Estimates"
      aria-label="No Transfer in Monthly Estimates"
    >
      {NO_TRANSFER_LABEL}
    </span>
  )
}
