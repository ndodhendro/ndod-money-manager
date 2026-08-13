import { useEffect, useMemo, useState } from 'react'
import { useBuckets } from './useBuckets'
import { useCategories } from './useCategories'
import { usePyfSettings } from './usePyfSettings'
import { useRecurringBills } from './useRecurringBills'
import {
  buildEstimateProgressRows,
  sumEstimateOverspend,
} from '../lib/estimateProgress'
import {
  buildMonthBudgetProgress,
  checkingBucketIdSet,
  estimateExpenseCoverageKeys,
  sumGuiltFreeSpent,
  type MonthBudgetProgress,
} from '../lib/freeGuiltyProgress'
import {
  budgetGroupOfEstimate,
  budgetGroupOfTransferTo,
  isPlannedNeedsSchedule,
  type BucketBudgetRef,
} from '../lib/freeWants'
import { sumMonthIncomeParts } from '../lib/moneyPlan'
import { fetchOpeningCarryForMonth } from '../lib/monthClosesApi'
import {
  buildPaydayAllocation,
  type PaydayAllocation,
} from '../lib/paydayAllocation'
import type { RecurringBill } from '../lib/recurringBillsApi'
import type { Category, TransactionWithCategory } from '../lib/types'

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

/**
 * Payday allocation + month budget tracks (Needs, Buffer, Wants, Guilt-Free).
 */
export function useFreeGuiltyProgress(
  yearMonth: string,
  transactions: TransactionWithCategory[],
): {
  allocation: PaydayAllocation | null
  progress: MonthBudgetProgress | null
  skippedOccurrenceKeys: Set<string>
  bills: RecurringBill[]
  overrideByBillId: Map<string, import('../lib/recurringBillsApi').RecurringBillMonthOverride>
  categoriesById: Map<string, Category>
  bucketsById: ReturnType<typeof useBuckets>['byId']
  buckets: ReturnType<typeof useBuckets>['buckets']
  loading: boolean
  error: string | null
  available: boolean
} {
  const {
    settings,
    loading: planLoading,
    error: planError,
  } = usePyfSettings()
  const {
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    loading: billsLoading,
    available: billsAvailable,
    error: billsError,
  } = useRecurringBills(yearMonth)
  const {
    byId: categoriesById,
    loading: categoriesLoading,
    error: categoriesError,
  } = useCategories('expense', { includeInactive: true })
  const {
    buckets,
    byId: bucketsById,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets({ includeInactive: true })

  const [openingCarry, setOpeningCarry] = useState({
    openingBufferCarry: 0,
    openingGuiltFreeCarry: 0,
  })

  useEffect(() => {
    let cancelled = false
    void fetchOpeningCarryForMonth(yearMonth)
      .then((carry) => {
        if (!cancelled) setOpeningCarry(carry)
      })
      .catch(() => {
        if (!cancelled) {
          setOpeningCarry({
            openingBufferCarry: 0,
            openingGuiltFreeCarry: 0,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [yearMonth])

  const incomeParts = useMemo(
    () => sumMonthIncomeParts(transactions),
    [transactions],
  )

  const allocation = useMemo(() => {
    if (!settings || !billsAvailable) return null
    return buildPaydayAllocation({
      income: incomeParts.regular,
      bonusIncome: incomeParts.bonus,
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      bufferPct: settings.buffer_pct,
      openingBufferCarry: openingCarry.openingBufferCarry,
      openingGuiltFreeCarry: openingCarry.openingGuiltFreeCarry,
    })
  }, [
    settings,
    billsAvailable,
    incomeParts,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    bucketsById,
    yearMonth,
    openingCarry,
  ])

  const estimateRows = useMemo(() => {
    if (!billsAvailable) return []
    return buildEstimateProgressRows({
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
      transactions,
    })
  }, [
    billsAvailable,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    bucketsById,
    yearMonth,
    transactions,
  ])

  const progress = useMemo(() => {
    if (!allocation) return null
    let needsActual = 0
    let wantsActual = 0
    for (const row of estimateRows) {
      if (row.group === 'needs') needsActual += row.actual
      else if (row.group === 'wants') wantsActual += row.actual
    }
    const estimateCoverageKeys = estimateExpenseCoverageKeys(
      bills,
      categoriesById,
      (bill) => isNeedsOrWantsEstimateBill(bill, categoriesById, bucketsById),
    )
    return buildMonthBudgetProgress({
      plannedNeeds: allocation.plannedNeeds,
      needsActual,
      plannedWants: allocation.plannedWants,
      wantsActual,
      buffer: allocation.buffer,
      guiltFree: allocation.guiltFree,
      guiltFreeSpent: sumGuiltFreeSpent({
        transactions,
        estimateCoverageKeys,
        checkingBucketIds: checkingBucketIdSet(buckets),
      }),
      estimateOverspend: sumEstimateOverspend(estimateRows),
    })
  }, [
    allocation,
    estimateRows,
    bills,
    categoriesById,
    bucketsById,
    buckets,
    transactions,
  ])

  const loading =
    planLoading || billsLoading || categoriesLoading || bucketsLoading
  const error = planError || billsError || categoriesError || bucketsError

  return {
    allocation,
    progress,
    skippedOccurrenceKeys,
    bills,
    overrideByBillId,
    categoriesById,
    bucketsById,
    buckets,
    loading,
    error,
    available: billsAvailable,
  }
}
