import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import {
  leafBuckets,
  sortLeavesForPicker,
  type CategorySortRef,
} from '../lib/bucketsGroup'
import {
  isBlankSearch,
  matchesBucketSearch,
  matchesSearchText,
} from '../lib/listSearch'
import {
  CASHFLOW_LABEL,
  type BudgetGroup,
  type BucketWithBalance,
} from '../lib/types'
import { BudgetGroupBadge } from './BudgetGroupBadge'
import { SearchField } from './SearchField'

/** null = Main Account (checking / available money). */
export type BucketSelection = string | null

interface BucketPickerProps {
  label: string
  /** undefined = not chosen yet; null = Main Account; string = bucket id */
  value: BucketSelection | undefined
  buckets: BucketWithBalance[]
  /** When set, sinking leaves follow category / subcategory sequence. */
  categoriesById?: Map<string, CategorySortRef> | null
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
  categoriesById = null,
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
  const [searchQuery, setSearchQuery] = useState('')

  useOverlayBack(open, () => {
    onOpenChange(false)
  })

  useEffect(() => {
    if (!open) setSearchQuery('')
  }, [open])

  const byId = useMemo(() => {
    const map = new Map<string, BucketWithBalance>()
    for (const b of buckets) map.set(b.id, b)
    return map
  }, [buckets])

  const selected =
    value && value.length > 0 ? byId.get(value) : undefined
  const selectedGroup = showBudgetGroup
    ? sinkingBudgetGroup(selected)
    : null
  const selectedParent =
    selected?.parent_id ? byId.get(selected.parent_id) : undefined

  const options = useMemo(() => {
    const leaves = leafBuckets(buckets).filter((b) => b.id !== excludeId)
    return sortLeavesForPicker(leaves, buckets, categoriesById)
  }, [buckets, excludeId, categoriesById])

  const searchActive = !isBlankSearch(searchQuery)
  const filteredOptions = useMemo(() => {
    if (!searchActive) return options
    return options.filter((b) => {
      const parent = b.parent_id ? byId.get(b.parent_id) : undefined
      return matchesBucketSearch(searchQuery, b, {
        parentName: parent?.name,
      })
    })
  }, [options, searchActive, searchQuery, byId])
  const cashflowVisible =
    allowCashflow &&
    (!searchActive || matchesSearchText(searchQuery, CASHFLOW_LABEL, 'main'))

  function displayLabel(): string {
    if (value === undefined) return 'Select…'
    if (value === null) return `💵 ${CASHFLOW_LABEL}`
    if (selected) {
      if (selectedParent) {
        return `${selected.icon} ${selectedParent.name} › ${selected.name}`
      }
      return `${selected.icon} ${selected.name}`
    }
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
        <div
          id={listId}
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          <div className="border-b border-neutral-100 p-1.5 dark:border-neutral-700">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search buckets…"
              aria-label="Search buckets"
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
          {cashflowVisible && (
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
          {filteredOptions.map((b) => {
            const optionGroup = showBudgetGroup
              ? sinkingBudgetGroup(b)
              : null
            const parent = b.parent_id ? byId.get(b.parent_id) : undefined
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
                  } ${parent ? 'pl-8' : ''}`}
                >
                  <span>{b.icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {parent ? (
                      <>
                        <span className="text-neutral-400">
                          {parent.name} ›{' '}
                        </span>
                        {b.name}
                      </>
                    ) : (
                      b.name
                    )}
                  </span>
                  {optionGroup ? (
                    <BudgetGroupBadge group={optionGroup} />
                  ) : null}
                </button>
              </li>
            )
          })}
          {filteredOptions.length === 0 && !cashflowVisible && (
            <li className="px-4 py-2 text-xs text-neutral-400">
              {searchActive
                ? 'No matches.'
                : 'No buckets yet. Add one in Settings.'}
            </li>
          )}
          </ul>
        </div>
      )}
    </div>
  )
}
