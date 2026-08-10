import { useId, useRef } from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import { compareBucketsForPicker } from '../lib/bucketsGroup'
import {
  CASHFLOW_LABEL,
  type BudgetGroup,
  type BucketWithBalance,
} from '../lib/types'
import { BudgetGroupBadge } from './BudgetGroupBadge'

/** null = Main Account (checking / available money). */
export type BucketSelection = string | null

interface BucketPickerProps {
  label: string
  /** undefined = not chosen yet; null = Main Account; string = bucket id */
  value: BucketSelection | undefined
  buckets: BucketWithBalance[]
  /** Exclude this bucket id from options (e.g. the other side of a transfer). */
  excludeId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (next: BucketSelection) => void
  allowCashflow?: boolean
  highlighted?: boolean
  /** Settings Monthly Estimates: show Needs / Wants on sinking funds. */
  showBudgetGroup?: boolean
}

function sinkingBudgetGroup(
  bucket: BucketWithBalance | undefined,
): BudgetGroup | null {
  if (!bucket || bucket.kind !== 'sinking') return null
  if (bucket.budget_group === 'needs' || bucket.budget_group === 'wants') {
    return bucket.budget_group
  }
  return null
}

export function BucketPicker({
  label,
  value,
  buckets,
  excludeId,
  open,
  onOpenChange,
  onChange,
  allowCashflow = true,
  highlighted = false,
  showBudgetGroup = false,
}: BucketPickerProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useOverlayBack(open, () => {
    onOpenChange(false)
  })

  const selected =
    value && value.length > 0
      ? buckets.find((b) => b.id === value)
      : undefined
  const selectedGroup = showBudgetGroup
    ? sinkingBudgetGroup(selected)
    : null

  const options = buckets
    .filter((b) => b.id !== excludeId)
    .slice()
    .sort(compareBucketsForPicker)

  function displayLabel(): string {
    if (value === undefined) return 'Select…'
    if (value === null) return `💵 ${CASHFLOW_LABEL}`
    if (selected) return `${selected.icon} ${selected.name}`
    return 'Select…'
  }

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1.5 block text-xs text-neutral-400">{label}</span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => onOpenChange(!open)}
        className={`flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm dark:bg-neutral-800 ${
          highlighted ? 'ring-2 ring-emerald-400' : ''
        }`}
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${
              value === undefined
                ? 'text-neutral-400'
                : 'font-medium text-neutral-800 dark:text-neutral-100'
            }`}
          >
            {displayLabel()}
          </span>
          {selectedGroup ? (
            <span className="mt-0.5 inline-block">
              <BudgetGroupBadge group={selectedGroup} />
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-neutral-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <ul
          id={listId}
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-neutral-100 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          {allowCashflow && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  onOpenChange(false)
                }}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${
                  value === null
                    ? 'bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'text-neutral-700 dark:text-neutral-200'
                }`}
              >
                <span>💵</span>
                <span>{CASHFLOW_LABEL}</span>
              </button>
            </li>
          )}
          {options.map((b) => {
            const optionGroup = showBudgetGroup
              ? sinkingBudgetGroup(b)
              : null
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(b.id)
                    onOpenChange(false)
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm ${
                    value === b.id
                      ? 'bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  <span>{b.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {optionGroup ? (
                    <BudgetGroupBadge group={optionGroup} />
                  ) : null}
                </button>
              </li>
            )
          })}
          {options.length === 0 && !allowCashflow && (
            <li className="px-4 py-2 text-xs text-neutral-400">
              No buckets yet. Add one in Settings.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
