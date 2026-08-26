import {
  budgetGroupOfActiveSinkingTransfer,
  budgetGroupOfEstimate,
  isPlannedNeedsSchedule,
  type BucketBudgetRef,
} from './freeWants'
import { budgetGroupOfTx } from './moneyPlan'
import {
  effectiveAmount,
  estimatePlannedOccurrenceCount,
  isOccurrenceSkipped,
  occurrenceLogKey,
  occurrencesInMonth,
  plannedAmountForUpcomingOccurrence,
  type RecurringBill,
  type RecurringBillLog,
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
  /** Due-item tx → bill from recurring_bill_logs (covers missing FK). */
  dueBillIdByTxId?: Map<string, string>
}

function effectiveDueBillId(
  tx: TransactionWithCategory,
  dueBillIdByTxId?: Map<string, string>,
): string | null {
  return tx.recurring_bill_id ?? dueBillIdByTxId?.get(tx.id) ?? null
}

function isMainOrCheckingExpenseTx(
  tx: TransactionWithCategory,
  checkingBucketIds: Set<string>,
): boolean {
  if (tx.type !== 'expense' || tx.complete_later) return false
  const from = tx.from_bucket_id
  return from == null || checkingBucketIds.has(from)
}

export function transactionsForEstimateBill(
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
  const dueBillIdByTxId = options?.dueBillIdByTxId
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
      // Due-item check: FK, or checklist log when FK was never written.
      const dueBillId = effectiveDueBillId(tx, dueBillIdByTxId)
      if (dueBillId != null) {
        if (dueBillId === bill.id) matched.push(tx)
        continue
      }
      // Legacy due-item (is_recurring, no FK/log): match recurring estimate
      // by subcategory + note so sibling lines stay distinct.
      if (tx.is_recurring) {
        if (!bill.is_recurring) continue
        if (!tx.category_id || !ids.has(tx.category_id)) continue
        if (budgetGroupOfTx(tx) !== billGroup) continue
        if (!notesMatchEstimate(bill.name, tx.description)) continue
        matched.push(tx)
        continue
      }
      // Quick Add never fills a recurring estimate — that spend is Buffer / Guilt-Free.
      if (bill.is_recurring) continue
      // Non-recurring estimate: pool Quick Add by subcategory (and children).
      if (!tx.category_id || !ids.has(tx.category_id)) continue
      if (budgetGroupOfTx(tx) !== billGroup) continue
      matched.push(tx)
    }
    return matched
  }
  if (bill.type === 'transfer' && bill.to_bucket_id) {
    for (const tx of transactions) {
      if (tx.type !== 'transfer' || tx.complete_later) continue
      if (exclude?.has(tx.id)) continue
      const dueBillId = effectiveDueBillId(tx, dueBillIdByTxId)
      if (dueBillId != null) {
        if (dueBillId === bill.id) matched.push(tx)
        continue
      }
      if (tx.is_recurring) {
        if (!bill.is_recurring) continue
        if (tx.to_bucket_id !== bill.to_bucket_id) continue
        if (!notesMatchEstimate(bill.name, tx.description)) continue
        matched.push(tx)
        continue
      }
      if (bill.is_recurring) continue
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
    return (
      budgetGroupOfActiveSinkingTransfer(
        bill.to_bucket_id,
        bucketsById,
        categoriesById,
      ) === 'needs'
    )
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
    return (
      budgetGroupOfActiveSinkingTransfer(
        bill.to_bucket_id,
        bucketsById,
        categoriesById,
      ) === 'wants'
    )
  }
  return false
}

/**
 * Per Monthly Estimate line: planned vs actual for Needs/Wants this month.
 * Same inclusion rules as sumPlannedNeeds / sumCommittedWants.
 * Planned = this-month amount (override or template) × occurrences
 * (skips do not shrink the ceiling); actual = History transactions.
 */
export function buildEstimateProgressRows(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
  dueBillIdByTxId?: Map<string, string>
}): EstimateProgressRow[] {
  // Deduplicate Quick Add txs across non-recurring estimate rows so the same
  // spend is not counted in multiple bills sharing a subcategory.
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
    const count = estimatePlannedOccurrenceCount(
      bill,
      input.yearMonth,
      override,
    )
    if (count === 0) continue

    const planned = effectiveAmount(bill, override) * count
    const matched = transactionsForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
      input.bucketsById,
      {
        excludeTxIds: assignedManualTxIds,
        dueBillIdByTxId: input.dueBillIdByTxId,
      },
    )
    // Track Quick Add ids so they are not double-counted in another bill.
    for (const tx of matched) {
      if (effectiveDueBillId(tx, input.dueBillIdByTxId) == null) {
        assignedManualTxIds.add(tx.id)
      }
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
  dueBillIdByTxId?: Map<string, string>
}): EstimateProgressRow[] {
  const assignedTxIds = new Set<string>()
  const rows: EstimateProgressRow[] = []
  const matchOpts = {
    mainCheckingOnly: true as const,
    checkingBucketIds: input.checkingBucketIds,
    dueBillIdByTxId: input.dueBillIdByTxId,
  }

  for (const { bill, group } of monthBudgetExpenseCandidates(
    input.bills,
    input.categoriesById,
  )) {
    const override = input.overridesByBillId.get(bill.id)
    const count = estimatePlannedOccurrenceCount(
      bill,
      input.yearMonth,
      override,
    )
    if (count === 0) continue

    const planned = effectiveAmount(bill, override) * count
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
  dueBillIdByTxId?: Map<string, string>
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
    dueBillIdByTxId: input.dueBillIdByTxId,
  }

  for (const { bill, group } of monthBudgetExpenseCandidates(
    input.bills,
    input.categoriesById,
  )) {
    const override = input.overridesByBillId.get(bill.id)
    const count = estimatePlannedOccurrenceCount(
      bill,
      input.yearMonth,
      override,
    )
    if (count === 0) continue

    const planned = effectiveAmount(bill, override) * count
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

/** How much of each tx's demand is past the track plafond (chrono FIFO). */
export function borrowAmountsExceedingTrackAllowance(input: {
  demandByTxId: Map<string, number>
  transactionsById: Map<string, TransactionWithCategory>
  allowance: number
}): Map<string, number> {
  const borrows = new Map<string, number>()
  const allowance = Math.max(0, Math.round(input.allowance))
  const entries: Array<{ tx: TransactionWithCategory; amount: number }> = []
  for (const [txId, amount] of input.demandByTxId) {
    const tx = input.transactionsById.get(txId)
    if (!tx || amount <= 0) continue
    entries.push({ tx, amount: Math.round(amount) })
  }
  entries.sort((a, b) => compareTransactionsChrono(a.tx, b.tx))

  let remaining = allowance
  for (const { tx, amount } of entries) {
    if (remaining <= 0) {
      if (amount > 0) borrows.set(tx.id, amount)
      continue
    }
    if (amount > remaining) {
      borrows.set(tx.id, amount - remaining)
      remaining = 0
      continue
    }
    remaining -= amount
  }
  return borrows
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
  dueBillIdByTxId?: Map<string, string>
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
  dueBillIdByTxId?: Map<string, string>
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
    const count = estimatePlannedOccurrenceCount(
      bill,
      input.yearMonth,
      override,
    )
    if (count === 0) continue

    const planned = effectiveAmount(bill, override) * count
    const matched = transactionsForEstimateBill(
      bill,
      input.transactions,
      input.categoriesById,
      input.bucketsById,
      { dueBillIdByTxId: input.dueBillIdByTxId },
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

/**
 * Unchecked occurrence amount for one recurring bill in a month.
 * Skipped and checklist-checked dates are always omitted.
 * By default only future dates count; pass `includeDue` to also count
 * today/past due dates that are still unchecked (Estimate Progress shadow).
 */
function upcomingAmountForRecurringBill(
  bill: RecurringBill,
  yearMonth: string,
  today: string,
  override: RecurringBillMonthOverride | null | undefined,
  skippedOccurrenceKeys: Set<string> | undefined,
  logByOccurrenceKey: Map<string, RecurringBillLog>,
  options?: { includeDue?: boolean },
): number {
  if (!bill.is_recurring) return 0
  const unit = plannedAmountForUpcomingOccurrence(bill, override)
  let upcoming = 0
  for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
    if (!options?.includeDue && occurredOn <= today) continue
    if (
      isOccurrenceSkipped(
        bill.id,
        occurredOn,
        skippedOccurrenceKeys,
        override,
      )
    ) {
      continue
    }
    if (logByOccurrenceKey.has(occurrenceLogKey(bill.id, occurredOn))) {
      continue
    }
    upcoming += unit
  }
  return upcoming
}

/**
 * Unchecked future occurrences (Upcoming) per Month Budget expense line.
 * Uses the estimate for weekly/biweekly remaining dates (not a this-month
 * override from an earlier underspend). Monthly uses override, else template.
 * Skipped / checked / due (today or past) dates are omitted.
 */
export function upcomingExpenseAmountByBillId(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  logByOccurrenceKey: Map<string, RecurringBillLog>
  categoriesById: Map<string, Category>
  yearMonth: string
  today: string
}): Map<string, number> {
  const byBillId = new Map<string, number>()
  for (const { bill } of monthBudgetExpenseCandidates(
    input.bills,
    input.categoriesById,
  )) {
    const upcoming = upcomingAmountForRecurringBill(
      bill,
      input.yearMonth,
      input.today,
      input.overridesByBillId.get(bill.id),
      input.skippedOccurrenceKeys,
      input.logByOccurrenceKey,
    )
    if (upcoming > 0) byBillId.set(bill.id, upcoming)
  }
  return byBillId
}

/**
 * Shadow amounts for Monthly Estimate Progress recurring lines (expense +
 * transfer): every dated occurrence this month that is not skipped and not
 * checklist-checked — including already-due dates still unpaid.
 * Non-recurring estimates have no dated occurrences.
 */
export function upcomingEstimateProgressAmountByBillId(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  logByOccurrenceKey: Map<string, RecurringBillLog>
  yearMonth: string
  today: string
}): Map<string, number> {
  const byBillId = new Map<string, number>()
  for (const bill of input.bills) {
    if (!bill.is_active || !bill.is_recurring) continue
    const upcoming = upcomingAmountForRecurringBill(
      bill,
      input.yearMonth,
      input.today,
      input.overridesByBillId.get(bill.id),
      input.skippedOccurrenceKeys,
      input.logByOccurrenceKey,
      { includeDue: true },
    )
    if (upcoming > 0) byBillId.set(bill.id, upcoming)
  }
  return byBillId
}

/**
 * Upcoming that still fits on each estimate line (does not treat tentative
 * amounts as overspend). Extra beyond remaining room is ignored.
 */
export function sumCappedUpcomingOnRows(
  rows: EstimateProgressRow[],
  upcomingByBillId: Map<string, number>,
  group: BudgetGroup,
): number {
  let sum = 0
  for (const row of rows) {
    if (row.group !== group) continue
    const upcoming = upcomingByBillId.get(row.billId) ?? 0
    if (upcoming <= 0) continue
    const room = Math.max(0, row.planned - row.actual)
    sum += Math.min(upcoming, room)
  }
  return sum
}

/**
 * Remaining room on non-recurring (unscheduled) Month Budget estimate lines.
 * Recurring dated Upcoming is counted separately.
 */
export function sumUnscheduledEstimateRemaining(
  rows: EstimateProgressRow[],
  bills: RecurringBill[],
  group: BudgetGroup,
): number {
  const byId = new Map(bills.map((bill) => [bill.id, bill] as const))
  let sum = 0
  for (const row of rows) {
    if (row.group !== group) continue
    const bill = byId.get(row.billId)
    if (!bill || bill.is_recurring) continue
    sum += Math.max(0, row.planned - row.actual)
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
