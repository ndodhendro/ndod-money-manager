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

function notesMatchEstimate(billName: string, description: string | null): boolean {
  const expected = billName.trim()
  if (!expected) return true
  return (description ?? '').trim().localeCompare(expected, 'en', {
    sensitivity: 'accent',
  }) === 0
}

function emptyActualByOwner(): Record<Owner, number> {
  return { suami: 0, istri: 0 }
}

type EstimateBillMatchOptions = {
  /** Main Account (null from) or checking buckets only — Month Budget used. */
  mainCheckingOnly?: boolean
  checkingBucketIds?: Set<string>
  /** Skip txs already assigned to another estimate line (dedupe). */
  excludeTxIds?: Set<string>
}

function isMainOrCheckingExpenseTx(
  tx: TransactionWithCategory,
  checkingBucketIds: Set<string>,
): boolean {
  if (tx.type !== 'expense' || tx.complete_later) return false
  const from = tx.from_bucket_id
  return from == null || checkingBucketIds.has(from)
}

function transactionsForEstimateBill(
  bill: RecurringBill,
  transactions: TransactionWithCategory[],
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
  options?: EstimateBillMatchOptions,
): TransactionWithCategory[] {
  const matched: TransactionWithCategory[] = []
  const billGroup = budgetGroupOfEstimate(bill, categoriesById, bucketsById)
  const checkingIds = options?.checkingBucketIds
  const exclude = options?.excludeTxIds
  if (bill.type === 'expense' && bill.category_id) {
    const ids = categoryIdsMatchingEstimate(bill.category_id, categoriesById)
    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.complete_later) continue
      if (exclude?.has(tx.id)) continue
      if (
        options?.mainCheckingOnly &&
        checkingIds &&
        !isMainOrCheckingExpenseTx(tx, checkingIds)
      ) {
        continue
      }
      // Exact match: transaction was created from this specific due-item check.
      if (tx.recurring_bill_id != null) {
        if (tx.recurring_bill_id === bill.id) matched.push(tx)
        continue
      }
      // Fallback: manual Quick Add (no recurring_bill_id) — same category
      // and, when the estimate has a note, the same note (bill.name).
      // Otherwise every Gifts spend would pile onto one named line.
      if (!tx.category_id || !ids.has(tx.category_id)) continue
      if (budgetGroupOfTx(tx) !== billGroup) continue
      if (!notesMatchEstimate(bill.name, tx.description)) continue
      matched.push(tx)
    }
    return matched
  }
  if (bill.type === 'transfer' && bill.to_bucket_id) {
    for (const tx of transactions) {
      if (tx.type !== 'transfer' || tx.complete_later) continue
      if (exclude?.has(tx.id)) continue
      // Exact match via recurring_bill_id for transfer due-items.
      if (tx.recurring_bill_id != null) {
        if (tx.recurring_bill_id === bill.id) matched.push(tx)
        continue
      }
      if (tx.to_bucket_id !== bill.to_bucket_id) continue
      if (!notesMatchEstimate(bill.name, tx.description)) continue
      matched.push(tx)
    }
  }
  return matched
}


/** Oldest date first; within a day, earlier sort_order then created_at then id. */
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

/** History day list: newest first (sort_order, created_at, id descending). */
export function compareHistoryDayDisplay(
  a: TransactionWithCategory,
  b: TransactionWithCategory,
): number {
  return compareTransactionsChrono(b, a)
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
  // Deduplicate manual (non-recurring_bill_id) transactions across estimate rows
  // so the same Quick Add tx is not counted in multiple bills sharing a category.
  const assignedManualTxIds = new Set<string>()
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
    const matched = transactionsForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
      input.bucketsById,
      { excludeTxIds: assignedManualTxIds },
    )
    // Track manual tx ids so they are not double-counted in another bill.
    for (const tx of matched) {
      if (tx.recurring_bill_id == null) assignedManualTxIds.add(tx.id)
    }
    const byOwner = emptyActualByOwner()
    for (const tx of matched) byOwner[tx.owner] += tx.amount
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

  return rows
}

type MonthBudgetEstimateCandidate = {
  bill: RecurringBill
  group: BudgetGroup
}

function monthBudgetExpenseCandidates(
  bills: RecurringBill[],
  categoriesById: Map<string, Category>,
): MonthBudgetEstimateCandidate[] {
  const out: MonthBudgetEstimateCandidate[] = []
  for (const bill of bills) {
    if (!bill.is_active || bill.type !== 'expense') continue
    if (!isPlannedNeedsSchedule(bill)) continue
    const group = budgetGroupOfEstimate(bill, categoriesById)
    if (group === 'needs' || group === 'wants') {
      out.push({ bill, group })
    }
  }
  out.sort((a, b) => {
    if (a.group !== b.group) return a.group === 'needs' ? -1 : 1
    const sortA = a.bill.sort_order ?? 0
    const sortB = b.bill.sort_order ?? 0
    if (sortA !== sortB) return sortA - sortB
    return a.bill.name.localeCompare(b.bill.name, 'en', { sensitivity: 'base' })
  })
  return out
}

/**
 * Month Budget used: expense estimate lines only, Main/checking History,
 * each transaction counted at most once (first matching line wins).
 */
export function buildMonthBudgetEstimateRows(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
  checkingBucketIds: Set<string>
}): EstimateProgressRow[] {
  const assignedTxIds = new Set<string>()
  const rows: EstimateProgressRow[] = []
  const matchOpts = {
    mainCheckingOnly: true as const,
    checkingBucketIds: input.checkingBucketIds,
  }

  for (const { bill, group } of monthBudgetExpenseCandidates(
    input.bills,
    input.categoriesById,
  )) {
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

    const planned = bill.amount * count
    const matched = transactionsForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
      input.bucketsById,
      { ...matchOpts, excludeTxIds: assignedTxIds },
    )
    for (const tx of matched) assignedTxIds.add(tx.id)

    const byOwner = emptyActualByOwner()
    for (const tx of matched) byOwner[tx.owner] += tx.amount
    const actual = byOwner.suami + byOwner.istri
    const cat = bill.category_id
      ? input.categoriesById.get(bill.category_id)
      : undefined
    const name = bill.name || cat?.name || 'Unnamed'

    rows.push({
      billId: bill.id,
      name,
      icon: cat?.icon ?? '🏷️',
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

function addTrackDemand(
  map: Map<string, number>,
  txId: string,
  amount: number,
) {
  const add = Math.max(0, Math.round(amount))
  if (add <= 0) return
  map.set(txId, (map.get(txId) ?? 0) + add)
}

/**
 * Per-tx Buffer / Guilt-Free demand from estimate-line overage only
 * (Main/checking). Planned is consumed oldest-first; only the portion
 * above planned (and later matches on that line) counts.
 */
export function monthBudgetFlexibleTrackDemandByTxId(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
  checkingBucketIds: Set<string>
}): {
  bufferByTxId: Map<string, number>
  guiltFreeByTxId: Map<string, number>
} {
  const bufferByTxId = new Map<string, number>()
  const guiltFreeByTxId = new Map<string, number>()
  const assignedTxIds = new Set<string>()
  const matchOpts = {
    mainCheckingOnly: true as const,
    checkingBucketIds: input.checkingBucketIds,
  }

  for (const { bill, group } of monthBudgetExpenseCandidates(
    input.bills,
    input.categoriesById,
  )) {
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
      { ...matchOpts, excludeTxIds: assignedTxIds },
    )
    for (const tx of matched) assignedTxIds.add(tx.id)

    const actual = matched.reduce((sum, tx) => sum + tx.amount, 0)
    if (actual <= planned) continue

    const demandMap = group === 'needs' ? bufferByTxId : guiltFreeByTxId
    const oldestFirst = [...matched].sort(compareTransactionsChrono)
    let remaining = planned
    for (const tx of oldestFirst) {
      if (remaining <= 0) {
        addTrackDemand(demandMap, tx.id, tx.amount)
        continue
      }
      if (tx.amount > remaining) {
        addTrackDemand(demandMap, tx.id, tx.amount - remaining)
        remaining = 0
        continue
      }
      remaining -= tx.amount
    }
  }

  return { bufferByTxId, guiltFreeByTxId }
}

/**
 * Flag txs that chronologically push Buffer (Needs) or Guilt-Free (Wants)
 * past their payday plafond. Demand = estimate-line overage only; callers
 * add unplanned Needs/Wants demand before using this helper.
 */
export function idsExceedingTrackAllowance(input: {
  demandByTxId: Map<string, number>
  transactionsById: Map<string, TransactionWithCategory>
  allowance: number
}): Set<string> {
  const ids = new Set<string>()
  const allowance = Math.max(0, Math.round(input.allowance))
  const entries: Array<{ tx: TransactionWithCategory; amount: number }> = []
  for (const [txId, amount] of input.demandByTxId) {
    const tx = input.transactionsById.get(txId)
    if (!tx || amount <= 0) continue
    entries.push({ tx, amount })
  }
  entries.sort((a, b) => compareTransactionsChrono(a.tx, b.tx))

  let remaining = allowance
  for (const { tx, amount } of entries) {
    if (remaining <= 0) {
      ids.add(tx.id)
      continue
    }
    if (amount > remaining) {
      ids.add(tx.id)
      remaining = 0
      continue
    }
    remaining -= amount
  }
  return ids
}

/**
 * @deprecated Prefer monthBudgetCeilingOverspendTransactionIds — this only
 * lists estimate-line overage txs, not Buffer/GF plafond crossings.
 */
export function monthBudgetOverspendTransactionIds(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
  checkingBucketIds: Set<string>
}): Set<string> {
  const { bufferByTxId, guiltFreeByTxId } =
    monthBudgetFlexibleTrackDemandByTxId(input)
  const ids = new Set<string>()
  for (const id of bufferByTxId.keys()) ids.add(id)
  for (const id of guiltFreeByTxId.keys()) ids.add(id)
  return ids
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

/** Sum of per-line actual capped at planned (Month Budget Planned used). */
export function sumCappedEstimateActual(
  rows: EstimateProgressRow[],
  group: BudgetGroup,
): number {
  let sum = 0
  for (const row of rows) {
    if (row.group !== group) continue
    sum += Math.min(row.actual, row.planned)
  }
  return sum
}

/** Sum of per-line overspend (actual − planned when positive). */
export function sumEstimateOverspend(
  rows: EstimateProgressRow[],
  group?: BudgetGroup,
): number {
  let sum = 0
  for (const row of rows) {
    if (group != null && row.group !== group) continue
    if (row.actual > row.planned) sum += row.actual - row.planned
  }
  return sum
}

/**
 * Per-line estimate overspend attributed by who spent on that line
 * (not a flat 50/50 split).
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
