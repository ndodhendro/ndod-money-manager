import {
  budgetGroupOfEstimate,
  budgetGroupOfTransferTo,
  isPlannedNeedsSchedule,
  type BucketBudgetRef,
} from './freeWants'
import { budgetGroupOfTx } from './moneyPlan'
import {
  estimateOccurrenceCount,
  estimatePlannedOccurrenceCount,
  type RecurringBill,
  type RecurringBillMonthOverride,
} from './recurringBillsApi'
import type {
  BudgetGroup,
  Category,
  Owner,
  TransactionWithCategory,
} from './types'

export type EstimateProgressStatus = 'under' | 'on_track' | 'over'

export type OwnerAmountSplit = {
  suami: number
  istri: number
}

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
  /** Actual spend attributed to Ndod (suami) on this estimate line. */
  actualSuami: number
  /** Actual spend attributed to Devi (istri) on this estimate line. */
  actualIstri: number
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

function emptyActualByOwner(): Record<Owner, number> {
  return { suami: 0, istri: 0 }
}

function transactionsForEstimateBill(
  bill: RecurringBill,
  transactions: TransactionWithCategory[],
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
): TransactionWithCategory[] {
  const matched: TransactionWithCategory[] = []
  const billGroup = budgetGroupOfEstimate(bill, categoriesById, bucketsById)
  if (bill.type === 'expense' && bill.category_id) {
    const ids = categoryIdsMatchingEstimate(bill.category_id, categoriesById)
    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.complete_later) continue
      if (!tx.category_id || !ids.has(tx.category_id)) continue
      if (budgetGroupOfTx(tx) !== billGroup) continue
      matched.push(tx)
    }
    return matched
  }
  if (bill.type === 'transfer' && bill.to_bucket_id) {
    for (const tx of transactions) {
      if (tx.type !== 'transfer' || tx.complete_later) continue
      if (tx.to_bucket_id !== bill.to_bucket_id) continue
      matched.push(tx)
    }
  }
  return matched
}

function actualByOwnerForEstimateBill(
  bill: RecurringBill,
  transactions: TransactionWithCategory[],
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
): Record<Owner, number> {
  const byOwner = emptyActualByOwner()
  for (const tx of transactionsForEstimateBill(
    bill,
    transactions,
    categoriesById,
    bucketsById,
  )) {
    byOwner[tx.owner] += tx.amount
  }
  return byOwner
}

/** Oldest date first; within a day, sort_order (morning → evening), then created_at. */
export function compareTransactionsChrono(
  a: TransactionWithCategory,
  b: TransactionWithCategory,
): number {
  const aDay = String(a.occurred_on ?? '').slice(0, 10)
  const bDay = String(b.occurred_on ?? '').slice(0, 10)
  if (aDay !== bDay) return aDay < bDay ? -1 : 1
  const aOrd = Number(a.sort_order ?? 0)
  const bOrd = Number(b.sort_order ?? 0)
  if (aOrd !== bOrd) return aOrd - bOrd
  const aAt = String(a.created_at ?? '')
  const bAt = String(b.created_at ?? '')
  if (aAt !== bAt) return aAt < bAt ? -1 : 1
  return a.id.localeCompare(b.id)
}

/**
 * Split line overspend across profiles in proportion to who spent on that line.
 * Rounding remainder goes to the larger spender so parts always sum to overspend.
 */
export function allocateOverspendBySpender(
  overspend: number,
  actualSuami: number,
  actualIstri: number,
): OwnerAmountSplit {
  const safeOver = Math.max(0, Math.round(overspend))
  const aS = Math.max(0, actualSuami)
  const aI = Math.max(0, actualIstri)
  const total = aS + aI
  if (safeOver === 0 || total <= 0) return { suami: 0, istri: 0 }
  if (aS >= aI) {
    const istri = Math.floor((safeOver * aI) / total)
    return { suami: safeOver - istri, istri }
  }
  const suami = Math.floor((safeOver * aS) / total)
  return { suami, istri: safeOver - suami }
}

function billMatchesPlannedNeeds(
  bill: RecurringBill,
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
): boolean {
  if (!isPlannedNeedsSchedule(bill)) return false
  if (bill.type === 'expense') {
    return budgetGroupOfEstimate(bill, categoriesById) === 'needs'
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
  if (!isPlannedNeedsSchedule(bill)) return false
  if (bill.type === 'expense') {
    return budgetGroupOfEstimate(bill, categoriesById) === 'wants'
  }
  if (bill.type === 'transfer') {
    return budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById) === 'wants'
  }
  return false
}

/**
 * Per Monthly Estimate line: planned vs actual for Needs/Wants this month.
 * Same inclusion rules as sumPlannedNeeds / sumCommittedWants.
 * Planned = template × occurrences (skips shrink ceiling when keys passed);
 * actual = History transactions.
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
    const count =
      input.skippedOccurrenceKeys === undefined
        ? estimatePlannedOccurrenceCount(
            bill,
            input.yearMonth,
            override,
          )
        : estimateOccurrenceCount(
            bill,
            input.yearMonth,
            override,
            input.skippedOccurrenceKeys,
          )
    if (count === 0) continue

    const planned = bill.amount * count
    const byOwner = actualByOwnerForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
      input.bucketsById,
    )
    const actual = byOwner.suami + byOwner.istri
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
      actualSuami: byOwner.suami,
      actualIstri: byOwner.istri,
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

/**
 * Transaction ids that pushed a Needs/Wants estimate line over its planned
 * ceiling. Planned is consumed oldest-first (date, then intra-day sort_order);
 * the crossing tx and every later match on that line are Overspend.
 */
export function overspendTransactionIds(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
}): Set<string> {
  const ids = new Set<string>()

  for (const bill of input.bills) {
    if (!bill.is_active) continue
    if (
      !billMatchesPlannedNeeds(
        bill,
        input.categoriesById,
        input.bucketsById,
      ) &&
      !billMatchesCommittedWants(
        bill,
        input.categoriesById,
        input.bucketsById,
      )
    ) {
      continue
    }

    const override = input.overridesByBillId.get(bill.id)
    const count =
      input.skippedOccurrenceKeys === undefined
        ? estimatePlannedOccurrenceCount(bill, input.yearMonth, override)
        : estimateOccurrenceCount(
            bill,
            input.yearMonth,
            override,
            input.skippedOccurrenceKeys,
          )
    if (count === 0) continue

    const unit =
      override?.amount != null && override.amount > 0
        ? override.amount
        : bill.amount
    const planned = unit * count
    const matched = transactionsForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
      input.bucketsById,
    )
    const actual = matched.reduce((sum, tx) => sum + tx.amount, 0)
    if (actual <= planned) continue

    const oldestFirst = [...matched].sort(compareTransactionsChrono)
    let remaining = planned
    for (const tx of oldestFirst) {
      if (remaining <= 0) {
        ids.add(tx.id)
        continue
      }
      if (tx.amount > remaining) {
        ids.add(tx.id)
        remaining = 0
        continue
      }
      remaining -= tx.amount
    }
  }

  return ids
}

/** Sum of per-line overspend (actual − planned when positive). */
export function sumEstimateOverspend(rows: EstimateProgressRow[]): number {
  let sum = 0
  for (const row of rows) {
    if (row.actual > row.planned) sum += row.actual - row.planned
  }
  return sum
}

/**
 * Estimate overspend borrowed from Buffer then Guilt-Free Fund, attributed by who spent
 * on each overspent line (not a flat 50/50 split).
 */
export function sumEstimateOverspendByOwner(
  rows: EstimateProgressRow[],
): OwnerAmountSplit {
  let suami = 0
  let istri = 0
  for (const row of rows) {
    if (row.actual <= row.planned) continue
    const part = allocateOverspendBySpender(
      row.actual - row.planned,
      row.actualSuami,
      row.actualIstri,
    )
    suami += part.suami
    istri += part.istri
  }
  return { suami, istri }
}
