import { useEffect, useMemo, useState } from 'react'
import { useBuckets } from './useBuckets'
import { useCategories } from './useCategories'
import { usePyfSettings } from './usePyfSettings'
import { useRecurringBills } from './useRecurringBills'
import { buildMonthBudgetEstimateRows } from '../lib/estimateProgress'
import {
  buildMonthBudgetProgress,
  checkingBucketIdSet,
  computeMonthBudgetSpend,
  computeMonthBudgetUpcoming,
  estimateExpenseCoverageKeys,
  type MonthBudgetProgress,
} from '../lib/freeGuiltyProgress'
import { todayIso } from '../lib/format'
import {
  budgetGroupOfEstimate,
  isPlannedNeedsSchedule,
} from '../lib/freeWants'
import { sumMonthIncomeParts } from '../lib/moneyPlan'
import { fetchOpeningCarryForMonth } from '../lib/monthClosesApi'
import {
  buildPaydayAllocation,
  type PaydayAllocation,
} from '../lib/paydayAllocation'
import type { RecurringBill } from '../lib/recurringBillsApi'
import type { Category, TransactionWithCategory } from '../lib/types'

function isExpenseNeedsOrWantsEstimateBill(
  bill: RecurringBill,
  categoriesById: Map<string, Category>,
): boolean {
  if (!isPlannedNeedsSchedule(bill)) return false
  if (bill.type !== 'expense') return false
  const g = budgetGroupOfEstimate(bill, categoriesById)
  return g === 'needs' || g === 'wants'
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
  logByOccurrenceKey: Map<
    string,
    import('../lib/recurringBillsApi').RecurringBillLog
  >
  dueBillIdByTxId: Map<string, string>
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
    logByOccurrenceKey,
    dueBillIdByTxId,
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
    return buildMonthBudgetEstimateRows({
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
      transactions,
      checkingBucketIds: checkingBucketIdSet(buckets),
      dueBillIdByTxId,
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
    buckets,
    dueBillIdByTxId,
  ])

  const progress = useMemo(() => {
    if (!allocation) return null
    const estimateCoverageKeys = estimateExpenseCoverageKeys(
      bills,
      categoriesById,
      (bill) => isExpenseNeedsOrWantsEstimateBill(bill, categoriesById),
    )
    const spend = computeMonthBudgetSpend({
      estimateRows,
      transactions,
      estimateCoverageKeys,
      checkingBucketIds: checkingBucketIdSet(buckets),
      dueBillIdByTxId,
    })
    const upcoming = computeMonthBudgetUpcoming({
      estimateRows,
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      logByOccurrenceKey,
      categoriesById,
      yearMonth,
      today: todayIso(),
    })
    return buildMonthBudgetProgress({
      plannedNeeds: allocation.plannedNeeds,
      needsUsed: spend.needsUsed,
      plannedWants: allocation.plannedWants,
      wantsUsed: spend.wantsUsed,
      buffer: allocation.buffer,
      guiltFree: allocation.guiltFree,
      bufferSpent: spend.bufferSpent,
      guiltFreeSpent: spend.guiltFreeSpent,
      overspendTotal: spend.needsOverspend + spend.wantsOverspend,
      needsUpcoming: upcoming.needsUpcoming,
      wantsUpcoming: upcoming.wantsUpcoming,
      needsUnscheduled: upcoming.needsUnscheduled,
      wantsUnscheduled: upcoming.wantsUnscheduled,
    })
  }, [
    allocation,
    estimateRows,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    logByOccurrenceKey,
    categoriesById,
    bucketsById,
    buckets,
    transactions,
    dueBillIdByTxId,
    yearMonth,
  ])

  const loading =
    planLoading || billsLoading || categoriesLoading || bucketsLoading
  const error = planError || billsError || categoriesError || bucketsError

  return {
    allocation,
    progress,
    skippedOccurrenceKeys,
    bills,
    logByOccurrenceKey,
    dueBillIdByTxId,
    overrideByBillId,
    categoriesById,
    bucketsById,
    buckets,
    loading,
    error,
    available: billsAvailable,
  }
}
