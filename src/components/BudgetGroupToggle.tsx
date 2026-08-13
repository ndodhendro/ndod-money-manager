import {
  BUDGET_GROUP_LABELS,
  BUDGET_GROUP_TEXT_CLASS,
  type BudgetGroup,
} from '../lib/types'

const GROUPS: BudgetGroup[] = ['needs', 'wants']

interface BudgetGroupToggleProps {
  value: BudgetGroup
  onChange: (group: BudgetGroup) => void
}

/** Segmented Needs / Wants — defaulted from subcategory, overridable. */
export function BudgetGroupToggle({
  value,
  onChange,
}: BudgetGroupToggleProps) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800"
      role="radiogroup"
      aria-label="Needs or Wants"
    >
      {GROUPS.map((group) => {
        const selected = value === group
        return (
          <button
            key={group}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(group)}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              selected
                ? `bg-white shadow-sm dark:bg-neutral-900 ${BUDGET_GROUP_TEXT_CLASS[group]}`
                : 'text-neutral-500'
            }`}
          >
            {BUDGET_GROUP_LABELS[group]}
          </button>
        )
      })}
    </div>
  )
}
