import {
  budgetGroupOfCategory,
  budgetGroupOfTransferTo,
  isPlannedNeedsSchedule,
  type BucketBudgetRef,
} from './freeWants'
import {
  effectiveAmount,
  estimateOccurrenceCount,
  type RecurringBill,
  type RecurringBillMonthOverride,
} from './recurringBillsApi'
import type {
  BudgetGroup,
  Category,
  TransactionWithCategory,
} from './types'

export type EstimateProgressStatus = 'under' | 'on_track' | 'over'

export type EstimateBucketRef = BucketBudgetRef & {
  icon?: string
}

export interface EstimateProgressRow {
  billId: string
  name: string
  icon: string
  group: BudgetGroup
  planned: number
  actual: number
  remaining: number
  status: EstimateProgressStatus
}

function progressStatus(planned: number, actual: number): EstimateProgressStatus {
  if (actual > planned) return 'over'
  if (actual < planned) return 'under'
  return 'on_track'
}

function categoryIdsMatchingEstimate(
  categoryId: string | null,
  categoriesById: Map<string, Category>,
): Set<string> {
  const ids = new Set<string>()
  if (!categoryId) return ids
  ids.add(categoryId)
  for (const cat of categoriesById.values()) {
    if (cat.parent_id === categoryId) ids.add(cat.id)
  }
  return ids
}

function actualForEstimateBill(
  bill: RecurringBill,
  transactions: TransactionWithCategory[],
  categoriesById: Map<string, Category>,
): number {
  if (bill.type === 'expense' && bill.category_id) {
    const ids = categoryIdsMatchingEstimate(bill.category_id, categoriesById)
    let sum = 0
    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.complete_later) continue
      if (!tx.category_id || !ids.has(tx.category_id)) continue
      sum += tx.amount
    }
    return sum
  }
  if (bill.type === 'transfer' && bill.to_bucket_id) {
    let sum = 0
    for (const tx of transactions) {
      if (tx.type !== 'transfer' || tx.complete_later) continue
      if (tx.to_bucket_id !== bill.to_bucket_id) continue
      sum += tx.amount
    }
    return sum
  }
  return 0
}

function billMatchesPlannedNeeds(
  bill: RecurringBill,
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
): boolean {
  if (!isPlannedNeedsSchedule(bill)) return false
  if (bill.type === 'expense') {
    return budgetGroupOfCategory(bill.category_id, categoriesById) === 'needs'
  }
  if (bill.type === 'transfer') {
    return budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById) === 'needs'
  }
  return false
}

function billMatchesCommittedWants(
  bill: RecurringBill,
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
): boolean {
  if (bill.type === 'expense') {
    return budgetGroupOfCategory(bill.category_id, categoriesById) === 'wants'
  }
  if (bill.type === 'transfer') {
    return budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById) === 'wants'
  }
  return false
}

/**
 * Per Monthly Estimate line: planned vs actual for Needs/Wants this month.
 * Same inclusion rules as sumPlannedNeeds / sumCommittedWants.
 */
export function buildEstimateProgressRows(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
}): EstimateProgressRow[] {
  const rows: EstimateProgressRow[] = []

  for (const bill of input.bills) {
    if (!bill.is_active) continue

    let group: BudgetGroup | null = null
    if (
      billMatchesPlannedNeeds(
        bill,
        input.categoriesById,
        input.bucketsById,
      )
    ) {
      group = 'needs'
    } else if (
      billMatchesCommittedWants(
        bill,
        input.categoriesById,
        input.bucketsById,
      )
    ) {
      group = 'wants'
    }
    if (!group) continue

    const override = input.overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      input.yearMonth,
      override,
      input.skippedOccurrenceKeys,
    )
    if (count === 0) continue

    const planned = effectiveAmount(bill, override) * count
    const actual = actualForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
    )
    const cat = bill.category_id
      ? input.categoriesById.get(bill.category_id)
      : undefined
    const bucket =
      bill.type === 'transfer' && bill.to_bucket_id
        ? input.bucketsById.get(bill.to_bucket_id)
        : undefined

    rows.push({
      billId: bill.id,
      name: bill.name,
      icon: cat?.icon ?? bucket?.icon ?? '🏷️',
      group,
      planned,
      actual,
      remaining: planned - actual,
      status: progressStatus(planned, actual),
    })
  }

  rows.sort((a, b) => {
    if (a.group !== b.group) return a.group === 'needs' ? -1 : 1
    if (a.status !== b.status) {
      const rank = { over: 0, on_track: 1, under: 2 }
      return rank[a.status] - rank[b.status]
    }
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
  })

  return rows
}

/** Sum of per-line overspend (actual − planned when positive). */
export function sumEstimateOverspend(rows: EstimateProgressRow[]): number {
  let sum = 0
  for (const row of rows) {
    if (row.actual > row.planned) sum += row.actual - row.planned
  }
  return sum
}
