import { buildMonthBudgetEstimateRows } from './estimateProgress'
import {
  buildMonthBudgetProgress,
  checkingBucketIdSet,
  computeMonthBudgetSpend,
  estimateExpenseCoverageKeys,
} from './freeGuiltyProgress'
import {
  isPlannedNeedsSchedule,
  budgetGroupOfEstimate,
  type BucketBudgetRef,
} from './freeWants'
import { formatRupiah, formatYearMonthLabel } from './format'
import { budgetGroupOfTx } from './moneyPlan'
import {
  currentMonthCursor,
  monthCursorKey,
  shiftMonthCursor,
} from './monthCursor'
import { hasAnyMonthClose, isMonthClosed } from './monthClosesApi'
import type { RecurringBill, RecurringBillMonthOverride } from './recurringBillsApi'
import type {
  Bucket,
  Category,
  EfLoanSource,
  NewTransactionInput,
  TransactionWithCategory,
} from './types'

export function yearMonthFromOccurredOn(occurredOn: string): string {
  return occurredOn.slice(0, 7)
}

export type MonthWritePolicy =
  | { allowed: true; monthClosed: boolean; yearMonth: string }
  | {
      allowed: false
      reason: 'awaiting_prior_close'
      yearMonth: string
      priorYearMonth: string
      message: string
    }

/**
 * Current (and future) calendar months stay locked until the previous
 * month is closed. Prior months stay writable (close ritual / late EF).
 */
export async function resolveMonthWritePolicy(
  occurredOn: string,
): Promise<MonthWritePolicy> {
  const yearMonth = yearMonthFromOccurredOn(occurredOn)
  const currentYm = monthCursorKey(currentMonthCursor())
  const priorYm = monthCursorKey(shiftMonthCursor(currentMonthCursor(), -1))

  if (yearMonth >= currentYm) {
    // Until the household has closed at least one month, do not lock
    // (avoids blocking brand-new installs forever).
    const anyClose = await hasAnyMonthClose()
    if (anyClose) {
      const priorClosed = await isMonthClosed(priorYm)
      if (!priorClosed) {
        return {
          allowed: false,
          reason: 'awaiting_prior_close',
          yearMonth,
          priorYearMonth: priorYm,
          message: `Close ${formatYearMonthLabel(priorYm)} before adding transactions in ${formatYearMonthLabel(yearMonth)}.`,
        }
      }
    }
  }

  const monthClosed = await isMonthClosed(yearMonth)
  return { allowed: true, monthClosed, yearMonth }
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

function syntheticExpense(
  draft: NewTransactionInput,
  id: string,
  category: Category | null,
): TransactionWithCategory {
  return {
    id,
    type: 'expense',
    category_id: draft.category_id,
    from_bucket_id: draft.from_bucket_id,
    to_bucket_id: null,
    amount: draft.amount,
    description: draft.description,
    owner: draft.owner,
    circle: draft.circle,
    occurred_on: draft.occurred_on,
    is_recurring: draft.is_recurring,
    recurring_bill_id: draft.recurring_bill_id ?? null,
    complete_later: false,
    budget_group: draft.budget_group ?? null,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: category
      ? { ...category, parent: null }
      : null,
  }
}

export type EfLoanEvaluation = {
  borrowAmount: number
  source: EfLoanSource | null
}

/**
 * How much of this expense draft must be borrowed from Emergency Fund.
 * Open month: Buffer then EF for Needs overspend / unplanned Needs;
 * Guilt-Free then EF for Wants overspend / unplanned Wants.
 * Closed month: leftover capacity frozen — new overage → EF only.
 */
export function evaluateExpenseEfLoan(input: {
  draft: NewTransactionInput
  editId?: string | null
  monthClosed: boolean
  transactions: TransactionWithCategory[]
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, BucketBudgetRef>
  buckets: Array<{ id: string; kind: string }>
  yearMonth: string
  bufferAllowance: number
  guiltFreeAllowance: number
}): EfLoanEvaluation {
  const draft = input.draft
  if (
    draft.type !== 'expense' ||
    draft.complete_later ||
    draft.amount <= 0 ||
    !draft.category_id
  ) {
    return { borrowAmount: 0, source: null }
  }

  const checkingIds = checkingBucketIdSet(
    input.buckets.map((b) => ({
      id: b.id,
      name: '',
      kind: b.kind as 'checking' | 'emergency' | 'investment' | 'sinking',
    })),
  )
  const from = draft.from_bucket_id
  if (from != null && !checkingIds.has(from)) {
    // Sinking-bucket expense — not Buffer/GF Main spending.
    return { borrowAmount: 0, source: null }
  }

  const estimateCoverageKeys = estimateExpenseCoverageKeys(
    input.bills,
    input.categoriesById,
    (bill) => isExpenseNeedsOrWantsEstimateBill(bill, input.categoriesById),
  )
  const category = input.categoriesById.get(draft.category_id) ?? null
  const draftTx = syntheticExpense(draft, input.editId ?? '__draft__', category)
  const draftGroup = budgetGroupOfTx(draftTx)

  const baseTxs = input.editId
    ? input.transactions.filter((t) => t.id !== input.editId)
    : input.transactions

  const spendInput = {
    estimateCoverageKeys,
    checkingBucketIds: checkingIds,
  }

  const before = computeMonthBudgetSpend({
    estimateRows: buildMonthBudgetEstimateRows({
      bills: input.bills,
      overridesByBillId: input.overridesByBillId,
      skippedOccurrenceKeys: input.skippedOccurrenceKeys,
      categoriesById: input.categoriesById,
      bucketsById: input.bucketsById,
      yearMonth: input.yearMonth,
      transactions: baseTxs,
      checkingBucketIds: checkingIds,
    }),
    transactions: baseTxs,
    ...spendInput,
  })
  const afterTxs = [...baseTxs, draftTx]
  const after = computeMonthBudgetSpend({
    estimateRows: buildMonthBudgetEstimateRows({
      bills: input.bills,
      overridesByBillId: input.overridesByBillId,
      skippedOccurrenceKeys: input.skippedOccurrenceKeys,
      categoriesById: input.categoriesById,
      bucketsById: input.bucketsById,
      yearMonth: input.yearMonth,
      transactions: afterTxs,
      checkingBucketIds: checkingIds,
    }),
    transactions: afterTxs,
    ...spendInput,
  })

  const buffer = Math.max(0, Math.round(input.bufferAllowance))
  const guiltFree = Math.max(0, Math.round(input.guiltFreeAllowance))

  if (draftGroup === 'needs') {
    const demandBefore = before.bufferSpent
    const demandAfter = after.bufferSpent
    const bufferCap = input.monthClosed
      ? Math.min(buffer, demandBefore)
      : buffer
    const efBefore = Math.max(0, demandBefore - bufferCap)
    const efAfter = Math.max(0, demandAfter - bufferCap)
    const borrowAmount = Math.max(0, efAfter - efBefore)
    return {
      borrowAmount,
      source: borrowAmount > 0 ? 'buffer' : null,
    }
  }

  if (draftGroup === 'wants') {
    const demandBefore = before.guiltFreeSpent
    const demandAfter = after.guiltFreeSpent
    const gfCap = input.monthClosed
      ? Math.min(guiltFree, demandBefore)
      : guiltFree
    const overBefore = Math.max(0, demandBefore - gfCap)
    const overAfter = Math.max(0, demandAfter - gfCap)
    const borrowAmount = Math.max(0, overAfter - overBefore)
    return {
      borrowAmount,
      source: borrowAmount > 0 ? 'guilt_free' : null,
    }
  }

  return { borrowAmount: 0, source: null }
}

function ownBucketLedgerBalance(
  bucketId: string,
  openingBalance: number,
  movements: Array<{
    amount: number
    from_bucket_id: string | null
    to_bucket_id: string | null
  }>,
): number {
  let balance = openingBalance
  for (const m of movements) {
    if (m.to_bucket_id === bucketId) balance += m.amount
    if (m.from_bucket_id === bucketId) balance -= m.amount
  }
  return balance
}

/**
 * How much of a sinking-fund expense must be borrowed from Emergency Fund
 * when the expense exceeds the bucket ledger balance (display floors at 0).
 */
export function evaluateSinkingFundEfLoan(input: {
  draft: NewTransactionInput
  buckets: Array<Pick<Bucket, 'id' | 'kind' | 'opening_balance'>>
  movements: Array<{
    amount: number
    from_bucket_id: string | null
    to_bucket_id: string | null
  }>
  /** When editing, reverse the prior expense from this bucket first. */
  editingPrior?: {
    from_bucket_id: string | null
    amount: number
  } | null
}): EfLoanEvaluation {
  const draft = input.draft
  if (
    draft.type !== 'expense' ||
    draft.complete_later ||
    draft.amount <= 0 ||
    !draft.from_bucket_id
  ) {
    return { borrowAmount: 0, source: null }
  }

  const bucket = input.buckets.find((b) => b.id === draft.from_bucket_id)
  if (!bucket || bucket.kind !== 'sinking') {
    return { borrowAmount: 0, source: null }
  }

  let balance = ownBucketLedgerBalance(
    bucket.id,
    bucket.opening_balance,
    input.movements,
  )
  const prior = input.editingPrior
  if (prior?.from_bucket_id === bucket.id && prior.amount > 0) {
    balance += prior.amount
  }

  const available = Math.max(0, Math.round(balance))
  const borrowAmount = Math.max(0, Math.round(draft.amount) - available)
  return {
    borrowAmount,
    source: borrowAmount > 0 ? 'sinking_fund' : null,
  }
}

export function efLoanConfirmMessage(
  borrowAmount: number,
  source: EfLoanSource,
): string {
  if (source === 'sinking_fund') {
    return `This expense exceeds the sinking fund and will borrow ${formatRupiah(borrowAmount)} from Emergency Fund. Continue?`
  }
  const track = source === 'buffer' ? 'Buffer' : 'Guilt-Free Fund'
  return `This overspends ${track} and will borrow ${formatRupiah(borrowAmount)} from Emergency Fund. Continue?`
}

/** Progress remaining helpers for Close Month UI. */
export function remainingFromProgress(progress: {
  buffer: { remaining: number; used: number; allowance: number }
  guiltFree: { remaining: number; used: number; allowance: number }
}): { bufferRemaining: number; guiltFreeRemaining: number } {
  return {
    bufferRemaining: Math.max(0, Math.round(progress.buffer.remaining)),
    guiltFreeRemaining: Math.max(0, Math.round(progress.guiltFree.remaining)),
  }
}

export { buildMonthBudgetProgress }
