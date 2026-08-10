import {
  BUDGET_GROUP_LABELS,
  BUDGET_GROUP_TEXT_CLASS,
  type BudgetGroup,
} from '../lib/types'

interface BudgetGroupBadgeProps {
  group: BudgetGroup
  className?: string
}

/** Text-only Needs / Wants marker (no background). */
export function BudgetGroupBadge({
  group,
  className = '',
}: BudgetGroupBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center text-[11px] font-medium leading-none ${BUDGET_GROUP_TEXT_CLASS[group]} ${className}`}
    >
      {BUDGET_GROUP_LABELS[group]}
    </span>
  )
}
