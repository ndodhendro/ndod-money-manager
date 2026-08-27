import {
  fetchBucketMovements,
  fetchBuckets,
  walkBucketLedger,
  type BucketMovement,
} from './bucketsApi'
import { borrowAmountsExceedingTrackAllowance, compareTransactionsChrono } from './estimateProgress'
import {
  checkingBucketIdSet,
  estimateExpenseCoverageKeys,
  monthBudgetTrackDemandByTxId,
} from './freeGuiltyProgress'
import { budgetGroupOfEstimate, isPlannedNeedsSchedule } from './freeWants'
import { fetchAllMonthCloses } from './monthClosesApi'
import { sumMonthIncomeParts } from './moneyPlan'
import { computeGuiltFreePools, type PaydayBucketRef } from './paydayAllocation'
import { getPyfSettings } from './pyfSettingsApi'
import {
  dueBillIdByTxIdFromLogs,
  fetchAllRecurringBillLogs,
  fetchRecurringBillMonthOverridesInRange,
  fetchRecurringBillOccurrenceSkipsInRange,
  fetchRecurringBills,
  isEstimateActiveInMonth,
  occurrenceLogKey,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
  type RecurringBillOccurrenceSkip,
} from './recurringBillsApi'
import { supabase } from './supabase'
import { fetchTransactions } from './transactionsApi'
import type {
  Bucket,
  Category,
  EfLoanSource,
  MonthClose,
  TransactionWithCategory,
} from './types'

export type EfOwedBySource = {
  buffer: number
  guiltFree: number
  sinkingFund: number
  total: number
}

export const EMPTY_EF_OWED: EfOwedBySource = {
  buffer: 0,
  guiltFree: 0,
  sinkingFund: 0,
  total: 0,
}

export type DerivedEfLoan = {
  transactionId: string
  yearMonth: string
  source: EfLoanSource
  amount: number
  outstanding: number
  occurredOn: string
  sortOrder: number
  createdAt: string
}

export type DerivedEfOwed = {
  loans: DerivedEfLoan[]
  bySource: EfOwedBySource
}

function isExpenseNeedsOrWantsEstimateBill(
  bill: RecurringBill,
  categoriesById: Map<string, Category>,
): boolean {
  if (!isPlannedNeedsSchedule(bill)) return false
  if (bill.type !== 'expense') return false
  const g = budgetGroupOfEstimate(bill, categoriesById)
  return g === 'needs' || g === 'wants'
}

function nextYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function yearMonthsInTransactions(
  transactions: TransactionWithCategory[],
): string[] {
  const set = new Set<string>()
  for (const tx of transactions) {
    if (tx.complete_later) continue
    const ym = String(tx.occurred_on ?? '').slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym)
  }
  return [...set].sort()
}

function openingCarryByMonth(closes: MonthClose[]): Map<
  string,
  { buffer: number; guiltFree: number }
> {
  const map = new Map<string, { buffer: number; guiltFree: number }>()
  for (const close of closes) {
    map.set(nextYearMonth(close.year_month), {
      buffer: Math.max(0, Math.round(close.opening_buffer_next)),
      guiltFree: Math.max(0, Math.round(close.opening_guilt_free_next)),
    })
  }
  return map
}

function compareDerivedLoans(a: DerivedEfLoan, b: DerivedEfLoan): number {
  return compareTransactionsChrono(
    {
      id: a.transactionId,
      occurred_on: a.occurredOn,
      sort_order: a.sortOrder,
      created_at: a.createdAt,
    } as TransactionWithCategory,
    {
      id: b.transactionId,
      occurred_on: b.occurredOn,
      sort_order: b.sortOrder,
      created_at: b.createdAt,
    } as TransactionWithCategory,
  )
}

function applyFifoRepayments(
  loans: DerivedEfLoan[],
  repayments: TransactionWithCategory[],
): DerivedEfLoan[] {
  const next = loans.map((loan) => ({ ...loan, outstanding: loan.amount }))
  next.sort(compareDerivedLoans)
  const pays = repayments.slice().sort(compareTransactionsChrono)
  let payIndex = 0
  let payLeft = 0
  for (const loan of next) {
    while (loan.outstanding > 0) {
      if (payLeft <= 0) {
        if (payIndex >= pays.length) return next
        payLeft = Math.max(0, Math.round(pays[payIndex].amount))
        payIndex += 1
        continue
      }
      const take = Math.min(loan.outstanding, payLeft)
      loan.outstanding -= take
      payLeft -= take
    }
  }
  return next
}

function sumBySource(loans: DerivedEfLoan[]): EfOwedBySource {
  let buffer = 0
  let guiltFree = 0
  let sinkingFund = 0
  for (const loan of loans) {
    const n = Math.max(0, Math.round(loan.outstanding))
    if (n <= 0) continue
    if (loan.source === 'buffer') buffer += n
    else if (loan.source === 'guilt_free') guiltFree += n
    else if (loan.source === 'sinking_fund') sinkingFund += n
  }
  return {
    buffer,
    guiltFree,
    sinkingFund,
    total: buffer + guiltFree + sinkingFund,
  }
}

export function computeDerivedEfOwed(input: {
  transactions: TransactionWithCategory[]
  buckets: Bucket[]
  movements: BucketMovement[]
  emergencyId: string | null
  bills: RecurringBill[]
  logs: RecurringBillLog[]
  overrides: RecurringBillMonthOverride[]
  skips: RecurringBillOccurrenceSkip[]
  categoriesById: Map<string, Category>
  settings: {
    emergencyPct: number
    investmentPct: number
    bufferPct: number
  }
  closes: MonthClose[]
}): DerivedEfOwed {
  const completed = input.transactions.filter((tx) => !tx.complete_later)
  const loans: DerivedEfLoan[] = []
  const txsById = new Map(completed.map((tx) => [tx.id, tx] as const))

  const sinking = walkBucketLedger(input.buckets, input.movements)
  for (const [txId, amount] of sinking.sinkingBorrowByTxId) {
    const tx = txsById.get(txId)
    if (!tx || amount <= 0) continue
    loans.push({
      transactionId: tx.id,
      yearMonth: String(tx.occurred_on).slice(0, 7),
      source: 'sinking_fund',
      amount,
      outstanding: amount,
      occurredOn: String(tx.occurred_on),
      sortOrder: Number(tx.sort_order ?? 0),
      createdAt: String(tx.created_at ?? ''),
    })
  }

  const checkingIds = checkingBucketIdSet(input.buckets)
  const bucketsById = new Map<string, PaydayBucketRef>(
    input.buckets.map((b) => [
      b.id,
      {
        id: b.id,
        name: b.name,
        kind: b.kind,
        icon: b.icon,
        budget_group: b.budget_group,
        balance: 0,
        target_amount: b.target_amount,
        sort_order: b.sort_order,
        is_active: b.is_active,
        parent_id: b.parent_id,
        category_id: b.category_id,
      },
    ]),
  )
  const dueBillIdByTxId = dueBillIdByTxIdFromLogs(input.logs)
  const carryByMonth = openingCarryByMonth(input.closes)
  const overridesByMonth = new Map<string, RecurringBillMonthOverride[]>()
  for (const row of input.overrides) {
    const list = overridesByMonth.get(row.year_month) ?? []
    list.push(row)
    overridesByMonth.set(row.year_month, list)
  }
  const skipsByMonth = new Map<string, RecurringBillOccurrenceSkip[]>()
  for (const row of input.skips) {
    const list = skipsByMonth.get(row.year_month) ?? []
    list.push(row)
    skipsByMonth.set(row.year_month, list)
  }

  for (const yearMonth of yearMonthsInTransactions(completed)) {
    const monthTxs = completed.filter(
      (tx) => String(tx.occurred_on).slice(0, 7) === yearMonth,
    )
    const monthOverrides = overridesByMonth.get(yearMonth) ?? []
    const overrideByBillId = new Map(
      monthOverrides.map((row) => [row.bill_id, row] as const),
    )
    const skippedOccurrenceKeys = new Set<string>()
    for (const row of skipsByMonth.get(yearMonth) ?? []) {
      skippedOccurrenceKeys.add(occurrenceLogKey(row.bill_id, row.occurred_on))
    }
    const bills = input.bills.filter((bill) =>
      isEstimateActiveInMonth(bill, yearMonth, overrideByBillId.get(bill.id)),
    )
    const carry = carryByMonth.get(yearMonth) ?? { buffer: 0, guiltFree: 0 }
    const incomeParts = sumMonthIncomeParts(monthTxs)
    const pools = computeGuiltFreePools({
      income: incomeParts.regular,
      bills: input.bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById: input.categoriesById,
      bucketsById,
      yearMonth,
      emergencyPct: input.settings.emergencyPct,
      investmentPct: input.settings.investmentPct,
      bufferPct: input.settings.bufferPct,
      openingBufferCarry: carry.buffer,
      openingGuiltFreeCarry: carry.guiltFree,
    })
    const estimateCoverageKeys = estimateExpenseCoverageKeys(
      bills,
      input.categoriesById,
      (bill) => isExpenseNeedsOrWantsEstimateBill(bill, input.categoriesById),
      bucketsById,
    )
    const demand = monthBudgetTrackDemandByTxId({
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById: input.categoriesById,
      bucketsById,
      yearMonth,
      transactions: monthTxs,
      checkingBucketIds: checkingIds,
      estimateCoverageKeys,
      dueBillIdByTxId,
    })
    const monthTxsById = new Map(monthTxs.map((tx) => [tx.id, tx] as const))
    const bufferBorrows = borrowAmountsExceedingTrackAllowance({
      demandByTxId: demand.bufferByTxId,
      transactionsById: monthTxsById,
      allowance: pools.buffer,
    })
    const gfBorrows = borrowAmountsExceedingTrackAllowance({
      demandByTxId: demand.guiltFreeByTxId,
      transactionsById: monthTxsById,
      allowance: pools.guiltFree,
    })
    for (const [txId, amount] of bufferBorrows) {
      const tx = monthTxsById.get(txId)
      if (!tx || amount <= 0) continue
      loans.push({
        transactionId: tx.id,
        yearMonth,
        source: 'buffer',
        amount,
        outstanding: amount,
        occurredOn: String(tx.occurred_on),
        sortOrder: Number(tx.sort_order ?? 0),
        createdAt: String(tx.created_at ?? ''),
      })
    }
    for (const [txId, amount] of gfBorrows) {
      const tx = monthTxsById.get(txId)
      if (!tx || amount <= 0) continue
      loans.push({
        transactionId: tx.id,
        yearMonth,
        source: 'guilt_free',
        amount,
        outstanding: amount,
        occurredOn: String(tx.occurred_on),
        sortOrder: Number(tx.sort_order ?? 0),
        createdAt: String(tx.created_at ?? ''),
      })
    }
  }

  const repayments = completed.filter(
    (tx) =>
      tx.type === 'transfer' &&
      input.emergencyId != null &&
      tx.to_bucket_id === input.emergencyId &&
      tx.amount > 0,
  )
  const withOutstanding = applyFifoRepayments(loans, repayments)
  return {
    loans: withOutstanding,
    bySource: sumBySource(withOutstanding),
  }
}

function mapCategoryRow(row: Record<string, unknown>): Category {
  const group = row.budget_group
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as Category['type'],
    budget_group: group === 'needs' || group === 'wants' ? group : null,
    icon: String(row.icon ?? '🏷️'),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    parent_id: (row.parent_id as string | null) ?? null,
  }
}

/** Load everything owed needs and compute on the fly. */
export async function fetchDerivedEfOwed(): Promise<DerivedEfOwed> {
  const [buckets, movements, transactions, bills, logs, closes, settings, catRes] =
    await Promise.all([
      fetchBuckets({ includeInactive: true }),
      fetchBucketMovements(),
      fetchTransactions({ start: '2000-01-01', end: '2099-12-31' }),
      fetchRecurringBills({ includeInactive: true }).catch(() => [] as RecurringBill[]),
      fetchAllRecurringBillLogs().catch(() => [] as RecurringBillLog[]),
      fetchAllMonthCloses(),
      getPyfSettings(),
      supabase.from('categories').select('*'),
    ])

  if (catRes.error) throw new Error(catRes.error.message)
  const categoriesById = new Map<string, Category>()
  for (const row of catRes.data ?? []) {
    const cat = mapCategoryRow(row as Record<string, unknown>)
    categoriesById.set(cat.id, cat)
  }

  const months = yearMonthsInTransactions(transactions)
  const startYm = months[0] ?? '2000-01'
  const endYm = months[months.length - 1] ?? '2099-12'
  const [overrides, skips] = await Promise.all([
    fetchRecurringBillMonthOverridesInRange(startYm, endYm),
    fetchRecurringBillOccurrenceSkipsInRange(startYm, endYm),
  ])

  const emergency = buckets.find((b) => b.kind === 'emergency') ?? null
  return computeDerivedEfOwed({
    transactions,
    buckets,
    movements,
    emergencyId: emergency?.id ?? null,
    bills,
    logs,
    overrides,
    skips,
    categoriesById,
    settings: {
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      bufferPct: settings.buffer_pct,
    },
    closes,
  })
}
