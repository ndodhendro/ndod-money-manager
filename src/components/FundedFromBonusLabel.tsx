import {
  FUNDED_FROM_BONUS_LABEL,
  FUNDED_FROM_BONUS_LABEL_CLASS,
} from '../lib/types'

interface FundedFromBonusLabelProps {
  className?: string
}

/** Text-only marker for sinking funds filled from bonus income. */
export function FundedFromBonusLabel({
  className = '',
}: FundedFromBonusLabelProps) {
  return (
    <span
      className={`shrink-0 text-xs font-medium leading-none ${FUNDED_FROM_BONUS_LABEL_CLASS} ${className}`}
      title="Funded from Holiday Bonus (THR) and Performance Bonus"
      aria-label="Funded from Holiday Bonus (THR) and Performance Bonus"
    >
      {FUNDED_FROM_BONUS_LABEL}
    </span>
  )
}
