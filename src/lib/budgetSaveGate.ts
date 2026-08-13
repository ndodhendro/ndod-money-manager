import {
  buildEstimateProgressRows,
  sumEstimateOverspend,
} from './estimateProgress'
import {
  buildMonthBudgetProgress,
  checkingBucketIdSet,
  estimateExpenseCoverageKeys,
  sumGuiltFreeSpent,
  sumUnplannedNeedsSpent,
} from './freeGuiltyProgress'
import {
  isPlannedNeedsSchedule,
  budgetGroupOfEstimate,
  budgetGroupOfTransferTo,
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

function isNeedsOrWantsEstimateBill(
  bill: RecurringBill,
  categoriesById: Map<string, Category>,
  bucketsById: Map<string, BucketBudgetRef>,
): boolean {
  if (!isPlannedNeedsSchedule(bill)) return false
  if (bill.type === 'expense') {
    const g = budgetGroupOfEstimate(bill, categoriesById)
    return g === 'needs' || g === 'wants'
  }
  if (bill.type === 'transfer') {
    const g = budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById)
    return g === 'needs' || g === 'wants'
  }
  return false
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
 * Open month: Buffer then EF for estimate overspend; GF overspend → EF.
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
    (bill) =>
      isNeedsOrWantsEstimateBill(
        bill,
        input.categoriesById,
        input.bucketsById,
      ),
  )
  const category = input.categoriesById.get(draft.category_id) ?? null
  const draftTx = syntheticExpense(draft, input.editId ?? '__draft__', category)
  const draftGroup = budgetGroupOfTx(draftTx)
  const isEstimateCat = Boolean(
    draft.category_id &&
      draftGroup &&
      estimateCoverageKeys.has(`${draft.category_id}:${draftGroup}`),
  )

  const baseTxs = input.editId
    ? input.transactions.filter((t) => t.id !== input.editId)
    : input.transactions

  const beforeRows = buildEstimateProgressRows({
    bills: input.bills,
    overridesByBillId: input.overridesByBillId,
    skippedOccurrenceKeys: input.skippedOccurrenceKeys,
    categoriesById: input.categoriesById,
    bucketsById: input.bucketsById,
    yearMonth: input.yearMonth,
    transactions: baseTxs,
  })
  const overspendBefore = sumEstimateOverspend(beforeRows)
  const unplannedNeedsBefore = sumUnplannedNeedsSpent({
    transactions: baseTxs,
    estimateCoverageKeys,
    checkingBucketIds: checkingIds,
  })
  const gfSpentBefore = sumGuiltFreeSpent({
    transactions: baseTxs,
    estimateCoverageKeys,
    checkingBucketIds: checkingIds,
  })

  const afterTxs = [...baseTxs, draftTx]
  const afterRows = buildEstimateProgressRows({
    bills: input.bills,
    overridesByBillId: input.overridesByBillId,
    skippedOccurrenceKeys: input.skippedOccurrenceKeys,
    categoriesById: input.categoriesById,
    bucketsById: input.bucketsById,
    yearMonth: input.yearMonth,
    transactions: afterTxs,
  })
  const overspendAfter = sumEstimateOverspend(afterRows)
  const unplannedNeedsAfter = sumUnplannedNeedsSpent({
    transactions: afterTxs,
    estimateCoverageKeys,
    checkingBucketIds: checkingIds,
  })
  const gfSpentAfter = sumGuiltFreeSpent({
    transactions: afterTxs,
    estimateCoverageKeys,
    checkingBucketIds: checkingIds,
  })

  const buffer = Math.max(0, Math.round(input.bufferAllowance))
  const guiltFree = Math.max(0, Math.round(input.guiltFreeAllowance))

  // Estimate-line overspend + Needs outside estimates both demand Buffer.
  const usesBuffer = isEstimateCat || draftGroup === 'needs'
  if (usesBuffer) {
    const demandBefore = overspendBefore + unplannedNeedsBefore
    const demandAfter = overspendAfter + unplannedNeedsAfter
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

  // Guilt-Free Fund (non-Needs, non-estimate Main/checking expense)
  const gfCap = input.monthClosed
    ? Math.min(guiltFree, gfSpentBefore)
    : guiltFree
  const overBefore = Math.max(0, gfSpentBefore - gfCap)
  const overAfter = Math.max(0, gfSpentAfter - gfCap)
  const borrowAmount = Math.max(0, overAfter - overBefore)
  return {
    borrowAmount,
    source: borrowAmount > 0 ? 'guilt_free' : null,
  }
}

export function efLoanConfirmMessage(
  borrowAmount: number,
  source: EfLoanSource,
): string {
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
