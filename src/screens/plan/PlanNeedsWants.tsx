import { useEffect, useMemo, useState } from 'react'
import { CollapsibleDayGroup } from '../../components/CollapsibleDayGroup'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { MonthPager } from '../../components/MonthPager'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { SearchField } from '../../components/SearchField'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useTransactions } from '../../hooks/useTransactions'
import { areAllCollapseOpen } from '../../lib/collapseState'
import {
  buildEstimateProgressRows,
  upcomingEstimateProgressAmountByBillId,
} from '../../lib/estimateProgress'
import { todayIso } from '../../lib/format'
import { isBlankSearch, matchesRecurringBillSearch } from '../../lib/listSearch'
import { makeMoneyPlanBucket } from '../../lib/moneyPlan'
import { monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import {
  getRecurringBillDisplayParts,
  groupRecurringBillsForSettings,
  sortRecurringBillsForSettings,
} from '../../lib/recurringBillDisplay'
import {
  BUDGET_GROUP_BAR_CLASS,
  BUDGET_GROUP_LABELS,
} from '../../lib/types'
import {
  fetchRecurringBillMonthOverridesInRange,
  fetchRecurringBillOccurrenceSkipsInRange,
  fetchRecurringBillLogs,
  fetchRecurringBills,
  dueBillIdByTxIdFromLogs,
  isMissingRecurringSchema,
  occurrenceLogKey,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
  type RecurringBillOccurrenceSkip,
} from '../../lib/recurringBillsApi'

export function PlanNeedsWants() {
  const {
    cursor,
    range,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()

  const { transactions, loading, error } = useTransactions(range)
  const {
    byId: categoriesById,
    loading: categoriesLoading,
    error: categoriesError,
  } = useCategories('expense', { includeInactive: true })
  const {
    byId: bucketsById,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets({ includeInactive: true })

  const [bills, setBills] = useState<RecurringBill[]>([])
  const [overrides, setOverrides] = useState<RecurringBillMonthOverride[]>([])
  const [occurrenceSkips, setOccurrenceSkips] = useState<
    RecurringBillOccurrenceSkip[]
  >([])
  const [dueLogs, setDueLogs] = useState<RecurringBillLog[]>([])
  const [recurringLoading, setRecurringLoading] = useState(true)
  const [recurringError, setRecurringError] = useState<string | null>(null)
  const [estimateGroupsExpanded, setEstimateGroupsExpanded] = useState(true)
  const [estimateGroupsVersion, setEstimateGroupsVersion] = useState(0)
  const [estimateSearchQuery, setEstimateSearchQuery] = useState('')

  const viewYm = monthCursorKey(cursor)

  useEffect(() => {
    let cancelled = false
    setRecurringLoading(true)
    setRecurringError(null)
    void (async () => {
      try {
        const [billRows, overrideRows, skipRows, logRows] = await Promise.all([
          fetchRecurringBills({ includeInactive: true }),
          fetchRecurringBillMonthOverridesInRange(viewYm, viewYm),
          fetchRecurringBillOccurrenceSkipsInRange(viewYm, viewYm),
          fetchRecurringBillLogs(viewYm),
        ])
        if (cancelled) return
        setBills(billRows)
        setOverrides(overrideRows)
        setOccurrenceSkips(skipRows)
        setDueLogs(logRows)
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'Failed to load recurring'
        if (isMissingRecurringSchema(message)) {
          setBills([])
          setOverrides([])
          setOccurrenceSkips([])
          setDueLogs([])
          setRecurringError(null)
        } else {
          setRecurringError(message)
        }
      } finally {
        if (!cancelled) setRecurringLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [viewYm])

  const monthTx = useMemo(
    () =>
      transactions.filter((t) => {
        const key = t.occurred_on.slice(0, 7)
        return key === viewYm
      }),
    [transactions, viewYm],
  )

  const pageLoading =
    loading || recurringLoading || categoriesLoading || bucketsLoading

  const dueBillIdByTxId = useMemo(
    () => dueBillIdByTxIdFromLogs(dueLogs),
    [dueLogs],
  )

  const overridesByBillId = useMemo(
    () =>
      new Map(
        overrides
          .filter((o) => o.year_month === viewYm)
          .map((o) => [o.bill_id, o]),
      ),
    [overrides, viewYm],
  )

  const skippedOccurrenceKeys = useMemo(
    () =>
      new Set(
        occurrenceSkips
          .filter((s) => s.year_month === viewYm)
          .map((s) => occurrenceLogKey(s.bill_id, s.occurred_on)),
      ),
    [occurrenceSkips, viewYm],
  )

  const logByOccurrenceKey = useMemo(() => {
    const map = new Map<string, RecurringBillLog>()
    for (const log of dueLogs) {
      map.set(occurrenceLogKey(log.bill_id, log.occurred_on), log)
    }
    return map
  }, [dueLogs])

  const estimateProgress = useMemo(
    () =>
      buildEstimateProgressRows({
        bills,
        overridesByBillId,
        skippedOccurrenceKeys,
        categoriesById,
        bucketsById,
        yearMonth: viewYm,
        transactions: monthTx,
        dueBillIdByTxId,
      }),
    [
      bills,
      overridesByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      viewYm,
      monthTx,
      dueBillIdByTxId,
    ],
  )

  const upcomingByBillId = useMemo(
    () =>
      upcomingEstimateProgressAmountByBillId({
        bills,
        overridesByBillId,
        skippedOccurrenceKeys,
        logByOccurrenceKey,
        yearMonth: viewYm,
        today: todayIso(),
      }),
    [
      bills,
      overridesByBillId,
      skippedOccurrenceKeys,
      logByOccurrenceKey,
      viewYm,
    ],
  )

  const estimateProgressByBillId = useMemo(() => {
    const map = new Map(
      estimateProgress.map((row) => [row.billId, row] as const),
    )
    return map
  }, [estimateProgress])

  const estimateProgressBills = useMemo(() => {
    const byId = new Map(bills.map((bill) => [bill.id, bill]))
    const listed: RecurringBill[] = []
    for (const row of estimateProgress) {
      const bill = byId.get(row.billId)
      if (bill) listed.push(bill)
    }
    return sortRecurringBillsForSettings(
      listed,
      categoriesById,
      bucketsById,
    )
  }, [bills, estimateProgress, categoriesById, bucketsById])

  const estimateSearchActive = !isBlankSearch(estimateSearchQuery)

  const filteredEstimateProgressBills = useMemo(() => {
    if (!estimateSearchActive) return estimateProgressBills
    return estimateProgressBills.filter((bill) => {
      const row = estimateProgressByBillId.get(bill.id)
      if (!row) return false
      const display = getRecurringBillDisplayParts(
        bill,
        categoriesById,
        bucketsById,
      )
      return matchesRecurringBillSearch(estimateSearchQuery, bill, display, {
        amount: row.planned,
        planTag: BUDGET_GROUP_LABELS[row.group],
        meta: `${row.actual} ${row.remaining}`,
      })
    })
  }, [
    estimateSearchActive,
    estimateSearchQuery,
    estimateProgressBills,
    estimateProgressByBillId,
    categoriesById,
    bucketsById,
  ])

  const estimateProgressGroups = useMemo(
    () => groupRecurringBillsForSettings(filteredEstimateProgressBills),
    [filteredEstimateProgressBills],
  )

  const estimateGroupPersistKeys = useMemo(
    () =>
      estimateProgressGroups.map((g) => estimateProgressPersistKey(g.key)),
    [estimateProgressGroups],
  )

  useEffect(() => {
    if (estimateGroupsVersion > 0) return
    setEstimateGroupsExpanded(areAllCollapseOpen(estimateGroupPersistKeys, true))
  }, [estimateGroupPersistKeys, estimateGroupsVersion])

  const searchForceVersion = estimateSearchActive
    ? Math.max(1, estimateGroupsVersion)
    : estimateGroupsVersion

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title={PlanTitle.needsWants}
        icon={PlanIcon.needsWants}
        description=""
      >
        <MonthPager
          monthLabel={monthLabel}
          canGoNext={canGoNext}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
        />

        {pageLoading && (
          <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-red-500">{error}</p>
        )}
        {recurringError && (
          <p className="mt-2 text-center text-sm text-red-500">
            {recurringError}
          </p>
        )}
        {categoriesError && (
          <p className="mt-2 text-center text-sm text-red-500">
            {categoriesError}
          </p>
        )}
        {bucketsError && (
          <p className="mt-2 text-center text-sm text-red-500">{bucketsError}</p>
        )}

        {!pageLoading && estimateProgress.length === 0 && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Add estimates in Settings → Monthly Estimates to track progress.
          </p>
        )}

        {!pageLoading && estimateProgress.length > 0 && (
          <div className="mt-4 space-y-2">
            <SearchField
              value={estimateSearchQuery}
              onChange={setEstimateSearchQuery}
              placeholder="Search estimates…"
              aria-label="Search Monthly Estimate Progress"
              className="min-w-0"
            />
            {estimateSearchActive &&
            filteredEstimateProgressBills.length === 0 ? (
              <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                No matches.
              </p>
            ) : (
              // Extra top space: GroupedListFrame legend sits on the border
              // with -translate-y-1/2 and must not overlap the search field.
              <div className="pt-4">
                <GroupedListFrame
                  label="Monthly Estimate Progress"
                  expanded={
                    estimateSearchActive ? true : estimateGroupsExpanded
                  }
                  onToggle={(expanded) => {
                    setEstimateGroupsExpanded(expanded)
                    setEstimateGroupsVersion((v) => v + 1)
                  }}
                >
                  <div className="space-y-5">
                    {estimateProgressGroups.map((group) => (
                      <CollapsibleDayGroup
                        key={group.key}
                        title={group.title}
                        persistKey={estimateProgressPersistKey(group.key)}
                        forceOpen={
                          estimateSearchActive
                            ? true
                            : estimateGroupsVersion > 0
                              ? estimateGroupsExpanded
                              : undefined
                        }
                        forceVersion={searchForceVersion}
                      >
                        <div className="space-y-2">
                          {group.items.map((bill) => {
                            const row = estimateProgressByBillId.get(bill.id)
                            if (!row) return null
                            const display = getRecurringBillDisplayParts(
                              bill,
                              categoriesById,
                              bucketsById,
                            )
                            return (
                              <PlanBudgetRow
                                key={row.billId}
                                icon={display.parentIcon}
                                bucket={makeMoneyPlanBucket(
                                  display.parentName,
                                  row.planned,
                                  row.actual,
                                  'ceiling',
                                )}
                                detailStack={{
                                  childIcon: display.childIcon,
                                  childName: display.childName,
                                  note:
                                    bill.name.trim() ||
                                    display.transferToLabel,
                                  budgetGroup: row.group,
                                  owner: bill.owner,
                                  circle: display.circle,
                                  isTransfer: display.isTransfer,
                                }}
                                barClass={BUDGET_GROUP_BAR_CLASS[row.group]}
                                mode="ceiling"
                                upcoming={
                                  group.key !== 'estimate' && bill.is_recurring
                                    ? (upcomingByBillId.get(bill.id) ?? 0)
                                    : 0
                                }
                              />
                            )
                          })}
                        </div>
                      </CollapsibleDayGroup>
                    ))}
                  </div>
                </GroupedListFrame>
              </div>
            )}
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}

function estimateProgressPersistKey(groupKey: string): string {
  return groupKey === 'estimate'
    ? 'plan:needs-wants:estimates:nodate'
    : `plan:needs-wants:estimates:day:${groupKey.replace('day:', '')}`
}
