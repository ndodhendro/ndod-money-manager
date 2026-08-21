import {
  idsExceedingTrackAllowance,
  monthBudgetFlexibleTrackDemandByTxId,
  sumCappedEstimateActual,
  sumCappedUpcomingOnRows,
  sumEstimateOverspend,
  upcomingExpenseAmountByBillId,
  type EstimateBucketRef,
  type EstimateProgressRow,
} from './estimateProgress'
import type {
  RecurringBill,
  RecurringBillLog,
  RecurringBillMonthOverride,
} from './recurringBillsApi'
import { budgetGroupOfEstimate } from './freeWants'
import { budgetGroupOfTx } from './moneyPlan'
import type {
  Bucket,
  Category,
  TransactionWithCategory,
} from './types'

export type CheckingBucketRef = Pick<Bucket, 'id' | 'name' | 'kind'>

/** Title Case labels for payday budget tracks. */
export const BUDGET_TRACK_LABELS = {
  plannedNeeds: 'Planned Needs',
  buffer: 'Buffer',
  plannedWants: 'Planned Wants',
  guiltFree: 'Guilt-Free Fund',
} as const

function isMainOrCheckingExpense(
  tx: TransactionWithCategory,
  checkingBucketIds: Set<string>,
): boolean {
  if (tx.type !== 'expense' || tx.complete_later) return false
  const from = tx.from_bucket_id
  return from == null || checkingBucketIds.has(from)
}

/** Due-item check (FK, checklist log, or legacy is_recurring). Not Quick Add. */
function isDueItemTx(
  tx: TransactionWithCategory,
  dueBillIdByTxId?: Map<string, string>,
): boolean {
  return (
    tx.recurring_bill_id != null ||
    tx.is_recurring === true ||
    (dueBillIdByTxId?.has(tx.id) ?? false)
  )
}

/**
 * Needs expenses outside non-recurring Monthly Estimate coverage (Main/checking).
 * Quick Add on a recurring-only estimate category is included (Buffer).
 * Due-item checks are excluded — they fill Planned via the estimate line.
 * These consume Buffer directly (not Planned Needs, not Guilt-Free).
 */
export function sumUnplannedNeedsSpent(input: {
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
  dueBillIdByTxId?: Map<string, string>
}): number {
  let sum = 0
  for (const tx of input.transactions) {
    if (!isMainOrCheckingExpense(tx, input.checkingBucketIds)) continue
    if (isDueItemTx(tx, input.dueBillIdByTxId)) continue
    const group = budgetGroupOfTx(tx)
    if (group !== 'needs' || !tx.category_id) continue
    if (input.estimateCoverageKeys.has(`${tx.category_id}:needs`)) continue
    sum += tx.amount
  }
  return sum
}

/** Transaction ids for Needs outside non-recurring estimates (full amount uses Buffer). */
export function unplannedNeedsTransactionIds(input: {
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
  dueBillIdByTxId?: Map<string, string>
}): Set<string> {
  const ids = new Set<string>()
  for (const tx of input.transactions) {
    if (!isMainOrCheckingExpense(tx, input.checkingBucketIds)) continue
    if (isDueItemTx(tx, input.dueBillIdByTxId)) continue
    const group = budgetGroupOfTx(tx)
    if (group !== 'needs' || !tx.category_id) continue
    if (input.estimateCoverageKeys.has(`${tx.category_id}:needs`)) continue
    ids.add(tx.id)
  }
  return ids
}

/** Transaction ids for Wants outside non-recurring estimates (full amount uses Guilt-Free). */
export function unplannedWantsTransactionIds(input: {
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
  dueBillIdByTxId?: Map<string, string>
}): Set<string> {
  const ids = new Set<string>()
  for (const tx of input.transactions) {
    if (!isMainOrCheckingExpense(tx, input.checkingBucketIds)) continue
    if (isDueItemTx(tx, input.dueBillIdByTxId)) continue
    const group = budgetGroupOfTx(tx)
    if (group !== 'wants' || !tx.category_id) continue
    if (input.estimateCoverageKeys.has(`${tx.category_id}:wants`)) continue
    ids.add(tx.id)
  }
  return ids
}

/**
 * Wants expenses outside non-recurring Monthly Estimate coverage (Main/checking).
 * Quick Add on a recurring-only estimate category is included (Guilt-Free).
 * Due-item checks are excluded — they fill Planned via the estimate line.
 * Full amount uses Guilt-Free Fund (not Planned Wants).
 */
export function sumUnplannedWantsSpent(input: {
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
  dueBillIdByTxId?: Map<string, string>
}): number {
  let sum = 0
  for (const tx of input.transactions) {
    if (!isMainOrCheckingExpense(tx, input.checkingBucketIds)) continue
    if (isDueItemTx(tx, input.dueBillIdByTxId)) continue
    const group = budgetGroupOfTx(tx)
    if (group !== 'wants' || !tx.category_id) continue
    if (input.estimateCoverageKeys.has(`${tx.category_id}:wants`)) continue
    sum += tx.amount
  }
  return sum
}

/**
 * Guilt-Free Fund: Wants outside estimates only.
 * Estimate-line Wants overspend is added separately in computeMonthBudgetSpend.
 */
export function sumGuiltFreeSpent(input: {
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
}): number {
  return sumUnplannedWantsSpent(input)
}

/** @deprecated Use sumGuiltFreeSpent. */
export const sumFreeGuiltySpent = sumGuiltFreeSpent

/**
 * History "Overspend" badge: only txs that chronologically push Buffer
 * (Needs flexible demand) or Guilt-Free (Wants flexible demand) past their
 * payday plafond. Flexible demand = estimate-line overage + unplanned.
 */
export function monthBudgetCeilingOverspendTransactionIds(input: {
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
  checkingBucketIds: Set<string>
  estimateCoverageKeys: Set<string>
  bufferAllowance: number
  guiltFreeAllowance: number
  dueBillIdByTxId?: Map<string, string>
}): Set<string> {
  const { bufferByTxId, guiltFreeByTxId } = monthBudgetFlexibleTrackDemandByTxId(
    {
      bills: input.bills,
      overridesByBillId: input.overridesByBillId,
      skippedOccurrenceKeys: input.skippedOccurrenceKeys,
      categoriesById: input.categoriesById,
      bucketsById: input.bucketsById,
      yearMonth: input.yearMonth,
      transactions: input.transactions,
      checkingBucketIds: input.checkingBucketIds,
      dueBillIdByTxId: input.dueBillIdByTxId,
    },
  )

  const txsById = new Map(
    input.transactions.map((tx) => [tx.id, tx] as const),
  )

  for (const id of unplannedNeedsTransactionIds({
    transactions: input.transactions,
    estimateCoverageKeys: input.estimateCoverageKeys,
    checkingBucketIds: input.checkingBucketIds,
    dueBillIdByTxId: input.dueBillIdByTxId,
  })) {
    const tx = txsById.get(id)
    if (!tx) continue
    bufferByTxId.set(id, (bufferByTxId.get(id) ?? 0) + tx.amount)
  }
  for (const id of unplannedWantsTransactionIds({
    transactions: input.transactions,
    estimateCoverageKeys: input.estimateCoverageKeys,
    checkingBucketIds: input.checkingBucketIds,
    dueBillIdByTxId: input.dueBillIdByTxId,
  })) {
    const tx = txsById.get(id)
    if (!tx) continue
    guiltFreeByTxId.set(id, (guiltFreeByTxId.get(id) ?? 0) + tx.amount)
  }

  const ids = new Set<string>()
  for (const id of idsExceedingTrackAllowance({
    demandByTxId: bufferByTxId,
    transactionsById: txsById,
    allowance: input.bufferAllowance,
  })) {
    ids.add(id)
  }
  for (const id of idsExceedingTrackAllowance({
    demandByTxId: guiltFreeByTxId,
    transactionsById: txsById,
    allowance: input.guiltFreeAllowance,
  })) {
    ids.add(id)
  }
  return ids
}

/**
 * Category+group keys covered by active non-recurring Needs/Wants expense
 * estimates (incl. children). Recurring estimate categories are omitted so
 * Quick Add spend uses Buffer / Guilt-Free instead of Planned.
 */
export function estimateExpenseCoverageKeys(
  bills: RecurringBill[],
  categoriesById: Map<string, Category>,
  isNeedsOrWantsEstimate: (bill: RecurringBill) => boolean,
): Set<string> {
  const keys = new Set<string>()
  for (const bill of bills) {
    if (!bill.is_active || bill.type !== 'expense' || !bill.category_id) {
      continue
    }
    if (bill.is_recurring) continue
    if (!isNeedsOrWantsEstimate(bill)) continue
    const group = budgetGroupOfEstimate(bill, categoriesById)
    if (group !== 'needs' && group !== 'wants') continue
    keys.add(`${bill.category_id}:${group}`)
    for (const cat of categoriesById.values()) {
      if (cat.parent_id === bill.category_id) {
        keys.add(`${cat.id}:${group}`)
      }
    }
  }
  return keys
}

export function checkingBucketIdSet(
  buckets: CheckingBucketRef[],
): Set<string> {
  const ids = new Set<string>()
  for (const b of buckets) {
    if (b.kind === 'checking') ids.add(b.id)
  }
  return ids
}

export interface BudgetTrackProgress {
  label: string
  allowance: number
  used: number
  remaining: number
  /**
   * Unchecked future estimate occurrences (Upcoming), capped to remaining
   * room on each Planned line. 0 on Buffer / Guilt-Free.
   */
  upcoming: number
  /** Inset + lighter gray surface (Buffer, Guilt-Free Fund). */
  emphasize: boolean
  barClass: string
}

export interface MonthBudgetProgress {
  plannedNeeds: BudgetTrackProgress
  buffer: BudgetTrackProgress
  plannedWants: BudgetTrackProgress
  guiltFree: BudgetTrackProgress
  /** Total Needs + Wants per-line estimate overspend. */
  overspendTotal: number
  /** Needs overspend + unplanned Needs (may exceed Buffer plafond). */
  bufferUsed: number
  /**
   * Buffer used beyond allowance (needs EF loan).
   */
  bufferOverEfLoan: number
  /** Guilt-Free used beyond allowance (needs EF loan). */
  guiltFreeOverEfLoan: number
  /** @deprecated Prefer bufferOverEfLoan — no longer borrows Guilt-Free. */
  guiltFreeBorrowed: number
}

export type MonthBudgetSpend = {
  /** Per-line min(actual, planned) for Needs estimates. */
  needsUsed: number
  /** Per-line min(actual, planned) for Wants estimates. */
  wantsUsed: number
  needsOverspend: number
  wantsOverspend: number
  unplannedNeeds: number
  unplannedWants: number
  /** Needs overspend + unplanned Needs (may exceed Buffer plafond). */
  bufferSpent: number
  /** Wants overspend + unplanned Wants (may exceed Guilt-Free plafond). */
  guiltFreeSpent: number
}

/**
 * Split History spend across the four Month Budget tracks.
 * Planned used is capped per estimate line (due items + Quick Add on
 * non-recurring estimates). Leftover Needs and Quick Add on recurring-only
 * estimate categories → Buffer; leftover Wants / same for Wants → Guilt-Free.
 */
export function computeMonthBudgetSpend(input: {
  estimateRows: EstimateProgressRow[]
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
  dueBillIdByTxId?: Map<string, string>
}): MonthBudgetSpend {
  const needsUsed = sumCappedEstimateActual(input.estimateRows, 'needs')
  const wantsUsed = sumCappedEstimateActual(input.estimateRows, 'wants')
  const needsOverspend = sumEstimateOverspend(input.estimateRows, 'needs')
  const wantsOverspend = sumEstimateOverspend(input.estimateRows, 'wants')
  const unplannedNeeds = sumUnplannedNeedsSpent(input)
  const unplannedWants = sumUnplannedWantsSpent(input)
  return {
    needsUsed,
    wantsUsed,
    needsOverspend,
    wantsOverspend,
    unplannedNeeds,
    unplannedWants,
    bufferSpent: needsOverspend + unplannedNeeds,
    guiltFreeSpent: wantsOverspend + unplannedWants,
  }
}

function emptyTrackUpcoming(): { needsUpcoming: number; wantsUpcoming: number } {
  return { needsUpcoming: 0, wantsUpcoming: 0 }
}

/**
 * Upcoming expense amounts that still fit on Planned Needs / Planned Wants
 * lines. Due, skipped, and already-checked occurrences are excluded.
 */
export function computeMonthBudgetUpcoming(input: {
  estimateRows: EstimateProgressRow[]
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  logByOccurrenceKey: Map<string, RecurringBillLog>
  categoriesById: Map<string, Category>
  yearMonth: string
  today: string
}): { needsUpcoming: number; wantsUpcoming: number } {
  if (input.estimateRows.length === 0) return emptyTrackUpcoming()
  const upcomingByBillId = upcomingExpenseAmountByBillId(input)
  if (upcomingByBillId.size === 0) return emptyTrackUpcoming()
  return {
    needsUpcoming: sumCappedUpcomingOnRows(
      input.estimateRows,
      upcomingByBillId,
      'needs',
    ),
    wantsUpcoming: sumCappedUpcomingOnRows(
      input.estimateRows,
      upcomingByBillId,
      'wants',
    ),
  }
}

function capUpcomingToRoom(upcoming: number, allowance: number, used: number): number {
  return Math.min(Math.max(0, Math.round(upcoming)), Math.max(0, allowance - used))
}

/**
 * Four payday tracks in display order:
 * Planned Needs → Buffer → Planned Wants → Guilt-Free Fund.
 *
 * Planned used = per-line min(actual, planned).
 * Buffer used = Needs overspend + Needs outside non-recurring estimates (not capped).
 * Guilt-Free used = Wants overspend + Wants outside non-recurring estimates (not capped).
 * Used beyond plafond → EF loan need; bar fill stays at 100%.
 * Upcoming is tentative (not History) and only fills remaining Planned room.
 */
export function buildMonthBudgetProgress(input: {
  plannedNeeds: number
  needsUsed: number
  plannedWants: number
  wantsUsed: number
  buffer: number
  guiltFree: number
  bufferSpent: number
  guiltFreeSpent: number
  /** Needs + Wants per-line estimate overspend (excludes unplanned). */
  overspendTotal?: number
  /** Upcoming Needs that still fit on Planned lines. */
  needsUpcoming?: number
  /** Upcoming Wants that still fit on Planned lines. */
  wantsUpcoming?: number
}): MonthBudgetProgress {
  const plannedNeeds = Math.max(0, Math.round(input.plannedNeeds))
  const needsUsed = Math.max(0, Math.round(input.needsUsed))
  const plannedWants = Math.max(0, Math.round(input.plannedWants))
  const wantsUsed = Math.max(0, Math.round(input.wantsUsed))
  const buffer = Math.max(0, Math.round(input.buffer))
  const guiltFree = Math.max(0, Math.round(input.guiltFree))
  const bufferSpent = Math.max(0, Math.round(input.bufferSpent))
  const gfSpent = Math.max(0, Math.round(input.guiltFreeSpent))
  const needsUpcoming = capUpcomingToRoom(
    input.needsUpcoming ?? 0,
    plannedNeeds,
    needsUsed,
  )
  const wantsUpcoming = capUpcomingToRoom(
    input.wantsUpcoming ?? 0,
    plannedWants,
    wantsUsed,
  )

  const bufferOverEfLoan = Math.max(0, bufferSpent - buffer)
  const guiltFreeOverEfLoan = Math.max(0, gfSpent - guiltFree)

  return {
    overspendTotal: Math.max(0, Math.round(input.overspendTotal ?? 0)),
    bufferUsed: bufferSpent,
    bufferOverEfLoan,
    guiltFreeOverEfLoan,
    guiltFreeBorrowed: bufferOverEfLoan,
    plannedNeeds: {
      label: BUDGET_TRACK_LABELS.plannedNeeds,
      allowance: plannedNeeds,
      used: needsUsed,
      remaining: Math.max(0, plannedNeeds - needsUsed),
      upcoming: needsUpcoming,
      emphasize: false,
      barClass: 'bg-rose-500',
    },
    buffer: {
      label: BUDGET_TRACK_LABELS.buffer,
      allowance: buffer,
      used: bufferSpent,
      remaining: Math.max(0, buffer - bufferSpent),
      upcoming: 0,
      emphasize: true,
      barClass: 'bg-amber-500',
    },
    plannedWants: {
      label: BUDGET_TRACK_LABELS.plannedWants,
      allowance: plannedWants,
      used: wantsUsed,
      remaining: Math.max(0, plannedWants - wantsUsed),
      upcoming: wantsUpcoming,
      emphasize: false,
      barClass: 'bg-sky-500',
    },
    guiltFree: {
      label: BUDGET_TRACK_LABELS.guiltFree,
      allowance: guiltFree,
      used: gfSpent,
      remaining: Math.max(0, guiltFree - gfSpent),
      upcoming: 0,
      emphasize: true,
      barClass: 'bg-emerald-500',
    },
  }
}

/** @deprecated Prefer MonthBudgetProgress.guiltFree */
export type FreeGuiltyProgress = {
  allowance: number
  spent: number
  borrowed: number
  remaining: number
}

/** @deprecated Use buildMonthBudgetProgress. */
export function buildFreeGuiltyProgress(input: {
  allowance: number
  spent: number
  borrowed?: number
}): FreeGuiltyProgress {
  const allowance = Math.max(0, input.allowance)
  const spent = Math.max(0, input.spent)
  const borrowed = Math.max(0, Math.round(input.borrowed ?? 0))
  return {
    allowance,
    spent,
    borrowed,
    remaining: Math.max(0, allowance - spent - borrowed),
  }
}
