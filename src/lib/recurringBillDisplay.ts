import type { BucketWithBalance, Category, Circle, Owner } from './types'
import {
  categoryDisplayParts,
  formatTransferLabel,
  formatTransferToLabel,
  OWNER_ACCOUNT_LABELS,
  TRANSFER_TYPE_ICON,
  type CategoryWithParent,
} from './types'
import { recurringOccurredOn, type MonthCursor } from './monthCursor'
import {
  estimatePlanTag,
  estimatePlanTagSortRank,
  type BucketBudgetRef,
} from './freeWants'
import {
  effectiveDueDay,
  RECURRING_EVERY_OPTIONS,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
} from './recurringBillsApi'

export type RecurringBillDisplayParts = {
  parentIcon: string
  parentName: string
  childIcon: string | null
  childName: string | null
  isTransfer: boolean
  /** Shown in the note slot for transfers (destination bucket). */
  transferToLabel: string | null
  circle: RecurringBill['circle']
}

export function getRecurringBillDisplayParts(
  bill: RecurringBill,
  byId: Map<string, Category>,
  bucketsById: Map<string, BucketWithBalance>,
): RecurringBillDisplayParts {
  if (bill.type === 'transfer') {
    const from = bill.from_bucket_id
      ? bucketsById.get(bill.from_bucket_id)
      : null
    const to = bill.to_bucket_id
      ? bucketsById.get(bill.to_bucket_id)
      : null
    return {
      parentIcon: TRANSFER_TYPE_ICON,
      parentName: formatTransferLabel(from),
      childIcon: null,
      childName: null,
      isTransfer: true,
      transferToLabel: formatTransferToLabel(to),
      circle: bill.circle,
    }
  }

  const cat = bill.category_id ? byId.get(bill.category_id) : null
  const withParent: CategoryWithParent | null = cat
    ? {
        ...cat,
        parent: cat.parent_id ? (byId.get(cat.parent_id) ?? null) : null,
      }
    : null
  const parts = categoryDisplayParts(withParent)

  return {
    ...parts,
    isTransfer: false,
    transferToLabel: null,
    circle: bill.circle,
  }
}

function compareTextAsc(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/** Transfer into Ndod Account / Devi Account (system checking buckets). */
function isTransferToCheckingAccount(
  bill: RecurringBill,
  bucketsById?: Map<string, BucketBudgetRef>,
): boolean {
  if (bill.type !== 'transfer' || !bill.to_bucket_id || !bucketsById) {
    return false
  }
  return bucketsById.get(bill.to_bucket_id)?.kind === 'checking'
}

/**
 * income → transfer (non-checking) → expense → Ndod Account → Devi Account.
 * Checking-account transfers sit at the bottom of the date group (Ndod first).
 */
function typeSortRank(
  bill: RecurringBill,
  bucketsById?: Map<string, BucketBudgetRef>,
): number {
  if (bill.type === 'income') return 0
  if (bill.type === 'transfer') {
    if (!isTransferToCheckingAccount(bill, bucketsById)) return 1
    const name = bill.to_bucket_id
      ? bucketsById?.get(bill.to_bucket_id)?.name
      : undefined
    if (name === OWNER_ACCOUNT_LABELS.istri) return 4
    return 3 // Ndod Account (and any other checking)
  }
  return 2
}

const CIRCLE_SORT_RANK: Record<Circle, number> = {
  hd_family: 0,
  extended_family: 1,
  friends: 2,
}

/** Hendro (suami) before Devi (istri). */
const OWNER_SORT_RANK: Record<Owner, number> = {
  suami: 0,
  istri: 1,
}

/** Parent category sort_order, then subcategory sort_order (parent-only → -1). */
function categoryOrderKeys(
  bill: RecurringBill,
  byId: Map<string, Category>,
): { categoryOrder: number; subcategoryOrder: number } {
  if (bill.type === 'transfer' || !bill.category_id) {
    return {
      categoryOrder: Number.POSITIVE_INFINITY,
      subcategoryOrder: Number.POSITIVE_INFINITY,
    }
  }
  const cat = byId.get(bill.category_id)
  if (!cat) {
    return {
      categoryOrder: Number.POSITIVE_INFINITY,
      subcategoryOrder: Number.POSITIVE_INFINITY,
    }
  }
  if (cat.parent_id) {
    const parent = byId.get(cat.parent_id)
    return {
      categoryOrder: parent?.sort_order ?? Number.POSITIVE_INFINITY,
      subcategoryOrder: cat.sort_order,
    }
  }
  return { categoryOrder: cat.sort_order, subcategoryOrder: -1 }
}

/** Amount descending (larger first). */
function compareAmountDesc(a: number, b: number): number {
  return b - a
}

/**
 * Index in RECURRING_EVERY_OPTIONS: 1 week → 2 weeks → 1–12 months → 2–10 years.
 * Unknown combos sort after known options, then by unit then every.
 */
function intervalSortRank(bill: RecurringBill): number {
  const unit = bill.interval_unit ?? 'month'
  const every = bill.interval_months
  const idx = RECURRING_EVERY_OPTIONS.findIndex(
    (o) => o.unit === unit && o.every === every,
  )
  if (idx >= 0) return idx
  // Fallback: weeks after known weeks, months/years after known months.
  const weekCount = RECURRING_EVERY_OPTIONS.filter((o) => o.unit === 'week')
    .length
  if (unit === 'week') return weekCount + every
  return RECURRING_EVERY_OPTIONS.length + every
}

/**
 * Shared row order for Settings Monthly Estimates and Plan Due Checklist
 * (within the same date / day group):
 * 1. type — income → transfer → expense → Ndod Account → Devi Account
 * 2. interval — shortest recurring first
 * 3. plan tag — Emergency → Investment → Needs → Wants
 * 4. category sort_order ascending
 * 5. subcategory sort_order ascending
 * 6. amount descending
 * 7. circle
 * 8. profile (owner)
 * 9. note
 */
export function compareRecurringBillsWithinDay(
  a: RecurringBill,
  b: RecurringBill,
  byId: Map<string, Category>,
  bucketsById?: Map<string, BucketBudgetRef>,
): number {
  const byType = typeSortRank(a, bucketsById) - typeSortRank(b, bucketsById)
  if (byType !== 0) return byType

  const byInterval = intervalSortRank(a) - intervalSortRank(b)
  if (byInterval !== 0) return byInterval

  if (bucketsById) {
    const byPlan =
      estimatePlanTagSortRank(estimatePlanTag(a, byId, bucketsById)) -
      estimatePlanTagSortRank(estimatePlanTag(b, byId, bucketsById))
    if (byPlan !== 0) return byPlan
  }

  const ka = categoryOrderKeys(a, byId)
  const kb = categoryOrderKeys(b, byId)
  if (ka.categoryOrder !== kb.categoryOrder) {
    return ka.categoryOrder - kb.categoryOrder
  }
  if (ka.subcategoryOrder !== kb.subcategoryOrder) {
    return ka.subcategoryOrder - kb.subcategoryOrder
  }

  const byAmount = compareAmountDesc(a.amount, b.amount)
  if (byAmount !== 0) return byAmount

  const byCircle = CIRCLE_SORT_RANK[a.circle] - CIRCLE_SORT_RANK[b.circle]
  if (byCircle !== 0) return byCircle

  const byOwner = OWNER_SORT_RANK[a.owner] - OWNER_SORT_RANK[b.owner]
  if (byOwner !== 0) return byOwner

  const byNote = compareTextAsc(a.name.trim(), b.name.trim())
  if (byNote !== 0) return byNote

  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.created_at.localeCompare(b.created_at)
}

/**
 * Settings recurring list: due day descending, then within-day order.
 */
export function sortRecurringBillsForSettings(
  bills: RecurringBill[],
  byId: Map<string, Category>,
  bucketsById: Map<string, BucketWithBalance>,
): RecurringBill[] {
  return [...bills].sort((a, b) => {
    // Non-recurring Estimates group before dated recurring (due_day unused for estimates).
    const aRecurring = a.is_recurring !== false
    const bRecurring = b.is_recurring !== false
    if (aRecurring !== bRecurring) return aRecurring ? 1 : -1
    if (aRecurring && bRecurring && a.due_day !== b.due_day) {
      return b.due_day - a.due_day
    }
    return compareRecurringBillsWithinDay(a, b, byId, bucketsById)
  })
}

export type RecurringChecklistOccurrence = {
  bill: RecurringBill
  occurredOn: string
  key: string
}

/**
 * Plan checklist: status-ready order, then occurred-on descending,
 * then the same within-day order as Monthly Estimates
 * (`compareRecurringBillsWithinDay` — pass bucketsById for plan-tag parity).
 */
export function sortRecurringOccurrencesForChecklist(
  items: RecurringChecklistOccurrence[],
  logByOccurrenceKey: Map<string, RecurringBillLog>,
  byId: Map<string, Category>,
  bucketsById?: Map<string, BucketBudgetRef>,
): RecurringChecklistOccurrence[] {
  return [...items].sort((a, b) => {
    const aDone = logByOccurrenceKey.has(a.key)
    const bDone = logByOccurrenceKey.has(b.key)
    if (aDone !== bDone) return aDone ? 1 : -1

    if (a.occurredOn !== b.occurredOn) {
      return b.occurredOn.localeCompare(a.occurredOn)
    }

    return compareRecurringBillsWithinDay(a.bill, b.bill, byId, bucketsById)
  })
}

/**
 * @deprecated Prefer sortRecurringOccurrencesForChecklist.
 */
export function sortRecurringBillsForChecklist(
  bills: RecurringBill[],
  logByBillId: Map<string, RecurringBillLog>,
  cursor: MonthCursor,
  byId: Map<string, Category>,
  overrideByBillId?: Map<string, RecurringBillMonthOverride>,
  bucketsById?: Map<string, BucketBudgetRef>,
): RecurringBill[] {
  return [...bills].sort((a, b) => {
    const aDone = logByBillId.has(a.id)
    const bDone = logByBillId.has(b.id)
    if (aDone !== bDone) return aDone ? 1 : -1

    const aDate = recurringOccurredOn(
      cursor,
      effectiveDueDay(a, overrideByBillId?.get(a.id)),
    )
    const bDate = recurringOccurredOn(
      cursor,
      effectiveDueDay(b, overrideByBillId?.get(b.id)),
    )
    if (aDate !== bDate) return bDate.localeCompare(aDate)

    return compareRecurringBillsWithinDay(a, b, byId, bucketsById)
  })
}
