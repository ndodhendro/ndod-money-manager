import { useMemo } from 'react'
import {
  checkingBucketIdSet,
  estimateExpenseCoverageKeys,
  estimateSinkingExpenseCoverageKeys,
  historyPlanKindByTxId,
  monthBudgetCeilingOverspendTransactionIds,
  type HistoryPlanKind,
} from '../lib/freeGuiltyProgress'
import { isPlannedCashNeedsOrWantsExpense } from '../lib/freeWants'
import { sinkingFundOverspendTransactionIds } from '../lib/budgetSaveGate'
import type { PaydayAllocation } from '../lib/paydayAllocation'
import type {
  RecurringBill,
  RecurringBillMonthOverride,
} from '../lib/recurringBillsApi'
import type { Category, TransactionWithCategory } from '../lib/types'
import type { useBuckets } from './useBuckets'

type BucketsState = ReturnType<typeof useBuckets>

/**
 * Per-transaction labels shown in Transactions (History): Planned / Unplanned
 * and Overspend. Shared with Month Budget detail pages so they match.
 */
export function useHistoryTxMeta(input: {
  transactions: TransactionWithCategory[]
  bills: RecurringBill[]
  overrideByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys: Set<string>
  dueBillIdByTxId: Map<string, string>
  categoriesById: Map<string, Category>
  bucketsById: BucketsState['byId']
  buckets: BucketsState['buckets']
  movements: BucketsState['movements']
  yearMonth: string
  allocation: PaydayAllocation | null
}): {
  checkingIds: Set<string>
  estimateCoverageKeys: Set<string>
  overspendTxIds: Set<string>
  planKindByTxId: Map<string, HistoryPlanKind>
} {
  const {
    transactions,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    dueBillIdByTxId,
    categoriesById,
    bucketsById,
    buckets,
    movements,
    yearMonth,
    allocation,
  } = input

  const checkingIds = useMemo(() => checkingBucketIdSet(buckets), [buckets])

  const estimateCoverageKeys = useMemo(() => {
    return estimateExpenseCoverageKeys(
      bills,
      categoriesById,
      (bill) =>
        isPlannedCashNeedsOrWantsExpense(
          bill,
          categoriesById,
          bucketsById.values(),
        ),
      bucketsById,
    )
  }, [bills, categoriesById, bucketsById])

  const sinkingExpenseCoverageKeys = useMemo(
    () =>
      estimateSinkingExpenseCoverageKeys(
        bills,
        categoriesById,
        bucketsById.values(),
      ),
    [bills, categoriesById, bucketsById],
  )

  const overspendTxIds = useMemo(() => {
    const ids = new Set<string>()
    if (allocation) {
      for (const id of monthBudgetCeilingOverspendTransactionIds({
        bills,
        overridesByBillId: overrideByBillId,
        skippedOccurrenceKeys,
        categoriesById,
        bucketsById,
        yearMonth,
        transactions,
        checkingBucketIds: checkingIds,
        estimateCoverageKeys,
        bufferAllowance: allocation.buffer,
        guiltFreeAllowance: allocation.guiltFree,
        dueBillIdByTxId,
      })) {
        ids.add(id)
      }
    }
    for (const id of sinkingFundOverspendTransactionIds({
      buckets,
      movements,
      transactions,
      yearMonth,
    })) {
      ids.add(id)
    }
    return ids
  }, [
    allocation,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    bucketsById,
    buckets,
    movements,
    yearMonth,
    transactions,
    checkingIds,
    estimateCoverageKeys,
    dueBillIdByTxId,
  ])

  const planKindByTxId = useMemo(
    () =>
      historyPlanKindByTxId({
        transactions,
        estimateCoverageKeys,
        sinkingExpenseCoverageKeys,
        checkingBucketIds: checkingIds,
        dueBillIdByTxId,
        bucketsById,
        categoriesById,
      }),
    [
      transactions,
      estimateCoverageKeys,
      sinkingExpenseCoverageKeys,
      checkingIds,
      dueBillIdByTxId,
      bucketsById,
      categoriesById,
    ],
  )

  return { checkingIds, estimateCoverageKeys, overspendTxIds, planKindByTxId }
}
