import type { BucketWithBalance, Category, Circle, Owner } from './types'
import {
  categoryDisplayParts,
  formatTransferLabel,
  type CategoryWithParent,
} from './types'
import { recurringOccurredOn, type MonthCursor } from './monthCursor'
import {
  effectiveDueDay,
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
  circle: RecurringBill['circle']
}

export function getRecurringBillDisplayParts(
  bill: RecurringBill,
  byId: Map<string, Category>,
  bucketsById: Map<string, BucketWithBalance>,
): RecurringBillDisplayParts {
  if (bill.type === 'transfer') {
    return {
      parentIcon: '🔄',
      parentName: formatTransferLabel(
        bill.from_bucket_id ? bucketsById.get(bill.from_bucket_id) : null,
        bill.to_bucket_id ? bucketsById.get(bill.to_bucket_id) : null,
      ),
      childIcon: null,
      childName: null,
      isTransfer: true,
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
    circle: bill.circle,
  }
}

function compareTextAsc(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/** income → transfer → expense */
function typeSortRank(type: RecurringBill['type']): number {
  if (type === 'income') return 0
  if (type === 'transfer') return 1
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

/** Amounts < 0 ascending; amounts > 0 descending; negatives before positives. */
function compareAmount(a: number, b: number): number {
  if (a < 0 && b < 0) return a - b
  if (a > 0 && b > 0) return b - a
  if (a === b) return 0
  if (a < 0) return -1
  if (b < 0) return 1
  return b - a
}

/**
 * Shared within-day order (Settings list + Plan checklist):
 * type → category order → subcategory order → amount → circle → owner → note.
 */
export function compareRecurringBillsWithinDay(
  a: RecurringBill,
  b: RecurringBill,
  byId: Map<string, Category>,
): number {
  const byType = typeSortRank(a.type) - typeSortRank(b.type)
  if (byType !== 0) return byType

  const ka = categoryOrderKeys(a, byId)
  const kb = categoryOrderKeys(b, byId)
  if (ka.categoryOrder !== kb.categoryOrder) {
    return ka.categoryOrder - kb.categoryOrder
  }
  if (ka.subcategoryOrder !== kb.subcategoryOrder) {
    return ka.subcategoryOrder - kb.subcategoryOrder
  }

  const byAmount = compareAmount(a.amount, b.amount)
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
  _bucketsById: Map<string, BucketWithBalance>,
): RecurringBill[] {
  return [...bills].sort((a, b) => {
    if (a.due_day !== b.due_day) return b.due_day - a.due_day
    return compareRecurringBillsWithinDay(a, b, byId)
  })
}

export type RecurringChecklistOccurrence = {
  bill: RecurringBill
  occurredOn: string
  key: string
}

/**
 * Plan checklist: unchecked first, then occurred-on descending,
 * then the same within-day order (applies inside unchecked and checked).
 */
export function sortRecurringOccurrencesForChecklist(
  items: RecurringChecklistOccurrence[],
  logByOccurrenceKey: Map<string, RecurringBillLog>,
  byId: Map<string, Category>,
): RecurringChecklistOccurrence[] {
  return [...items].sort((a, b) => {
    const aDone = logByOccurrenceKey.has(a.key)
    const bDone = logByOccurrenceKey.has(b.key)
    if (aDone !== bDone) return aDone ? 1 : -1

    if (a.occurredOn !== b.occurredOn) {
      return b.occurredOn.localeCompare(a.occurredOn)
    }

    return compareRecurringBillsWithinDay(a.bill, b.bill, byId)
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

    return compareRecurringBillsWithinDay(a, b, byId)
  })
}
