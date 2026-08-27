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
import {
  walkBucketLedger,
  type BucketMovement,
} from './bucketsApi'
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

function syntheticDraftTx(
  draft: NewTransactionInput,
  id: string,
  category: Category | null,
): TransactionWithCategory {
  return {
    id,
    type: draft.type,
    category_id: draft.category_id,
    from_bucket_id: draft.from_bucket_id,
    to_bucket_id: draft.to_bucket_id,
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
 * How much of this Main/checking draft must be borrowed from Emergency Fund.
 * Expenses: Buffer then EF for Needs overspend / unplanned Needs;
 * Guilt-Free then EF for Wants overspend / unplanned Wants.
 * Transfers into Needs/Wants sinking funds use the same tracks (planned
 * amount fills Planned; overage / unplanned hits Buffer or Guilt-Free).
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
  dueBillIdByTxId?: Map<string, string>
}): EfLoanEvaluation {
  const draft = input.draft
  if (draft.complete_later || draft.amount <= 0) {
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
    // Sinking (or other non-checking) outflow — not Buffer/GF Main spending.
    return { borrowAmount: 0, source: null }
  }

  let draftGroup: 'needs' | 'wants' | null = null
  if (draft.type === 'expense') {
    if (!draft.category_id) return { borrowAmount: 0, source: null }
  } else if (draft.type === 'transfer') {
    draftGroup = budgetGroupOfTransferTo(
      draft.to_bucket_id,
      input.bucketsById,
      input.categoriesById,
    )
    if (draftGroup == null) return { borrowAmount: 0, source: null }
  } else {
    return { borrowAmount: 0, source: null }
  }

  const estimateCoverageKeys = estimateExpenseCoverageKeys(
    input.bills,
    input.categoriesById,
    (bill) => isExpenseNeedsOrWantsEstimateBill(bill, input.categoriesById),
    input.bucketsById,
  )
  const category =
    draft.category_id != null
      ? (input.categoriesById.get(draft.category_id) ?? null)
      : null
  const draftTx = syntheticDraftTx(draft, input.editId ?? '__draft__', category)
  if (draftGroup == null) draftGroup = budgetGroupOfTx(draftTx)

  const baseTxs = input.editId
    ? input.transactions.filter((t) => t.id !== input.editId)
    : input.transactions

  const spendInput = {
    estimateCoverageKeys,
    checkingBucketIds: checkingIds,
    dueBillIdByTxId: input.dueBillIdByTxId,
    bucketsById: input.bucketsById,
    categoriesById: input.categoriesById,
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
      dueBillIdByTxId: input.dueBillIdByTxId,
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
      dueBillIdByTxId: input.dueBillIdByTxId,
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

/**
 * How much this sinking-fund expense increases overlay owed (before vs after).
 * Nested later spends are included so the confirm matches derived owed.
 */
export function evaluateSinkingFundEfLoan(input: {
  draft: NewTransactionInput
  buckets: Array<Pick<Bucket, 'id' | 'kind' | 'opening_balance'>>
  movements: BucketMovement[]
  editId?: string | null
  editSortOrder?: number
  editCreatedAt?: string
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

  const editId = input.editId ?? null
  const base = input.movements.filter((m) => m.id !== editId)
  const before = walkBucketLedger(input.buckets, base)
  const draftMovement: BucketMovement = {
    id: editId ?? '__draft__',
    type: 'expense',
    amount: Math.round(draft.amount),
    from_bucket_id: draft.from_bucket_id,
    to_bucket_id: null,
    occurred_on: draft.occurred_on,
    sort_order: input.editSortOrder ?? 999_999,
    created_at: input.editCreatedAt ?? 'z',
  }
  const after = walkBucketLedger(input.buckets, [...base, draftMovement])
  const borrowAmount = Math.max(
    0,
    after.sinkingBorrowTotal - before.sinkingBorrowTotal,
  )
  return {
    borrowAmount,
    source: borrowAmount > 0 ? 'sinking_fund' : null,
  }
}

/**
 * History "Overspend" for sinking-fund expenses: txs whose cash take was
 * short of the expense amount (EF overlay).
 */
export function sinkingFundOverspendTransactionIds(input: {
  buckets: Array<Pick<Bucket, 'id' | 'kind' | 'opening_balance'>>
  movements: BucketMovement[]
  transactions: TransactionWithCategory[]
  yearMonth: string
}): Set<string> {
  const ids = new Set<string>()
  const { sinkingBorrowByTxId } = walkBucketLedger(
    input.buckets,
    input.movements,
  )
  for (const tx of input.transactions) {
    if (tx.complete_later) continue
    if (String(tx.occurred_on ?? '').slice(0, 7) !== input.yearMonth) continue
    if ((sinkingBorrowByTxId.get(tx.id) ?? 0) > 0) ids.add(tx.id)
  }
  return ids
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
