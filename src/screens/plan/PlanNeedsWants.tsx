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
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { useTransactions } from '../../hooks/useTransactions'
import { formatRupiah, todayIso } from '../../lib/format'
import { isBlankSearch, matchesRecurringBillSearch } from '../../lib/listSearch'
import {
  buildEstimateProgressRows,
} from '../../lib/estimateProgress'
import {
  buildFreeWantsPace,
  budgetGroupOfTransferTo,
  freeWantsLookbackMonths,
  groupOverridesByMonth,
  isFreeWantsExpense,
  mondayOf,
  sumCommittedWants,
  sumPlannedNeeds,
  sumTransferActualsByBudgetGroup,
} from '../../lib/freeWants'
import {
  buildMoneyPlan,
  budgetGroupOfTx,
  isBonusIncomeCategory,
  makeMoneyPlanBucket,
  sumMonthRegularIncome,
} from '../../lib/moneyPlan'
import { monthCursorKey, monthCursorRange } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import { areAllCollapseOpen } from '../../lib/collapseState'
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
  fetchRecurringBills,
  isMissingRecurringSchema,
  occurrenceLogKey,
  type RecurringBill,
  type RecurringBillMonthOverride,
  type RecurringBillOccurrenceSkip,
} from '../../lib/recurringBillsApi'

export function PlanNeedsWants() {
  const {
    cursor,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()
  const lookbackMonths = useMemo(() => freeWantsLookbackMonths(cursor), [cursor])
  const lookbackRange = useMemo(() => {
    const start = monthCursorRange(lookbackMonths[0])
    const end = monthCursorRange(cursor)
    return { start: start.start, end: end.end }
  }, [lookbackMonths, cursor])

  const { transactions, loading, error } = useTransactions(lookbackRange)
  const {
    settings,
    loading: planLoading,
    error: planError,
  } = usePyfSettings()
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
  const [recurringLoading, setRecurringLoading] = useState(true)
  const [recurringError, setRecurringError] = useState<string | null>(null)
  const [estimateGroupsExpanded, setEstimateGroupsExpanded] = useState(true)
  const [estimateGroupsVersion, setEstimateGroupsVersion] = useState(0)
  const [estimateSearchQuery, setEstimateSearchQuery] = useState('')

  const lookbackStartYm = monthCursorKey(lookbackMonths[0])
  const lookbackEndYm = monthCursorKey(cursor)

  useEffect(() => {
    let cancelled = false
    setRecurringLoading(true)
    setRecurringError(null)
    void (async () => {
      try {
        const [billRows, overrideRows, skipRows] = await Promise.all([
          fetchRecurringBills({ includeInactive: true }),
          fetchRecurringBillMonthOverridesInRange(
            lookbackStartYm,
            lookbackEndYm,
          ),
          fetchRecurringBillOccurrenceSkipsInRange(
            lookbackStartYm,
            lookbackEndYm,
          ),
        ])
        if (cancelled) return
        setBills(billRows)
        setOverrides(overrideRows)
        setOccurrenceSkips(skipRows)
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'Failed to load recurring'
        if (isMissingRecurringSchema(message)) {
          setBills([])
          setOverrides([])
          setOccurrenceSkips([])
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
  }, [lookbackStartYm, lookbackEndYm])

  const viewYm = monthCursorKey(cursor)
  const monthTx = useMemo(
    () =>
      transactions.filter((t) => {
        const key = t.occurred_on.slice(0, 7)
        return key === viewYm
      }),
    [transactions, viewYm],
  )

  const totalIncome = sumMonthRegularIncome(monthTx)
  const needsExpenseTotal = monthTx
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.complete_later &&
        budgetGroupOfTx(t) === 'needs',
    )
    .reduce((sum, t) => sum + t.amount, 0)
  const wantsExpenseTotal = monthTx
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.complete_later &&
        budgetGroupOfTx(t) === 'wants',
    )
    .reduce((sum, t) => sum + t.amount, 0)
  const needsTransferTotal = sumTransferActualsByBudgetGroup(
    monthTx,
    bucketsById,
    'needs',
  )
  const wantsTransferTotal = sumTransferActualsByBudgetGroup(
    monthTx,
    bucketsById,
    'wants',
  )
  const needsTotal = needsExpenseTotal + needsTransferTotal
  const wantsTotal = wantsExpenseTotal + wantsTransferTotal
  const committedPaidExpense = monthTx
    .filter(
      (t) =>
        t.type === 'expense' &&
        !t.complete_later &&
        t.is_recurring &&
        budgetGroupOfTx(t) === 'wants',
    )
    .reduce((sum, t) => sum + t.amount, 0)
  const committedPaidTransfer = monthTx
    .filter(
      (t) =>
        t.type === 'transfer' &&
        !t.complete_later &&
        t.is_recurring &&
        budgetGroupOfTransferTo(t.to_bucket_id, bucketsById) === 'wants',
    )
    .reduce((sum, t) => sum + t.amount, 0)
  const committedPaid = committedPaidExpense + committedPaidTransfer

  const moneyPlan = useMemo(() => {
    if (!settings) return null
    const overridesByBill = new Map(
      overrides
        .filter((o) => o.year_month === viewYm)
        .map((o) => [o.bill_id, o]),
    )
    const skipKeys = new Set(
      occurrenceSkips
        .filter((s) => s.year_month === viewYm)
        .map((s) => occurrenceLogKey(s.bill_id, s.occurred_on)),
    )
    const plannedNeeds = sumPlannedNeeds(
      bills,
      overridesByBill,
      categoriesById,
      viewYm,
      skipKeys,
      bucketsById,
    )
    return buildMoneyPlan({
      income: totalIncome,
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      plannedNeeds,
      needsActual: needsTotal,
      wantsActual: wantsTotal,
      emergencyActual: 0,
      investmentActual: 0,
    })
  }, [
    settings,
    totalIncome,
    needsTotal,
    wantsTotal,
    bills,
    overrides,
    occurrenceSkips,
    categoriesById,
    bucketsById,
    viewYm,
  ])

  const freeWants = useMemo(() => {
    if (!settings) return null
    const overridesByMonth = groupOverridesByMonth(overrides)
    const skipsByMonth = new Map<string, Set<string>>()
    for (const row of occurrenceSkips) {
      const set = skipsByMonth.get(row.year_month) ?? new Set<string>()
      set.add(occurrenceLogKey(row.bill_id, row.occurred_on))
      skipsByMonth.set(row.year_month, set)
    }
    const incomeByMonth = new Map<string, number>()
    const committedByMonth = new Map<string, number>()
    const plannedNeedsByMonth = new Map<string, number>()

    for (const m of lookbackMonths) {
      const ym = monthCursorKey(m)
      incomeByMonth.set(ym, 0)
      const byBill = overridesByMonth.get(ym) ?? new Map()
      const skipKeys = skipsByMonth.get(ym)
      committedByMonth.set(
        ym,
        sumCommittedWants(
          bills,
          byBill,
          categoriesById,
          ym,
          skipKeys,
          bucketsById,
        ),
      )
      plannedNeedsByMonth.set(
        ym,
        sumPlannedNeeds(
          bills,
          byBill,
          categoriesById,
          ym,
          skipKeys,
          bucketsById,
        ),
      )
    }
    for (const tx of transactions) {
      if (tx.type !== 'income' || tx.complete_later) continue
      if (isBonusIncomeCategory(tx.category)) continue
      const ym = tx.occurred_on.slice(0, 7)
      if (!incomeByMonth.has(ym)) continue
      incomeByMonth.set(ym, (incomeByMonth.get(ym) ?? 0) + tx.amount)
    }

    const viewPlannedNeeds =
      plannedNeedsByMonth.get(monthCursorKey(cursor)) ?? 0

    return buildFreeWantsPace({
      months: lookbackMonths,
      incomeByMonth,
      committedByMonth,
      freeSpendTxs: transactions.filter(isFreeWantsExpense),
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      plannedNeeds: viewPlannedNeeds,
      viewMonth: cursor,
      today: todayIso(),
    })
  }, [
    settings,
    overrides,
    occurrenceSkips,
    lookbackMonths,
    bills,
    categoriesById,
    bucketsById,
    transactions,
    cursor,
  ])

  const pageLoading =
    loading ||
    planLoading ||
    recurringLoading ||
    categoriesLoading ||
    bucketsLoading
  const hasSplit = needsTotal > 0 || wantsTotal > 0

  const committedBucket = freeWants
    ? makeMoneyPlanBucket(
        'Committed Wants',
        freeWants.committed,
        committedPaid,
        'floor',
      )
    : null
  const freeBucket = freeWants
    ? makeMoneyPlanBucket(
        'Free Wants',
        freeWants.freeBudget,
        freeWants.freeSpent,
        'ceiling',
      )
    : null
  const weekBucket =
    freeWants?.focusWeek != null
      ? makeMoneyPlanBucket(
          isCurrentWeekLabel(freeWants.focusWeek.weekMonday, cursor)
            ? 'This Week'
            : 'Week Pace',
          Math.max(0, freeWants.focusWeek.available),
          freeWants.focusWeek.spent,
          'ceiling',
        )
      : null

  const estimateProgress = useMemo(() => {
    const overridesByBill = new Map(
      overrides
        .filter((o) => o.year_month === viewYm)
        .map((o) => [o.bill_id, o]),
    )
    const skipKeys = new Set(
      occurrenceSkips
        .filter((s) => s.year_month === viewYm)
        .map((s) => occurrenceLogKey(s.bill_id, s.occurred_on)),
    )
    return buildEstimateProgressRows({
      bills,
      overridesByBillId: overridesByBill,
      skippedOccurrenceKeys: skipKeys,
      categoriesById,
      bucketsById,
      yearMonth: viewYm,
      transactions: monthTx,
    })
  }, [
    bills,
    overrides,
    occurrenceSkips,
    categoriesById,
    bucketsById,
    viewYm,
    monthTx,
  ])

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
        {planError && (
          <p className="mt-2 text-center text-sm text-red-500">{planError}</p>
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

        {!pageLoading && !moneyPlan && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Set savings targets in Settings → Money Plan to see budgets.
          </p>
        )}

        {!pageLoading && moneyPlan && moneyPlan.needs.target <= 0 && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Add needs expenses in Settings → Monthly Estimates to set planned
            needs.
          </p>
        )}

        {!pageLoading && moneyPlan && totalIncome <= 0 && !hasSplit && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Log this month&apos;s income and spending to track needs vs wants.
          </p>
        )}

        {!pageLoading && moneyPlan && (totalIncome > 0 || hasSplit) && (
          <div className="mt-4 space-y-2">
            <PlanBudgetRow
              bucket={moneyPlan.needs}
              hint="Planned essentials"
              barClass={BUDGET_GROUP_BAR_CLASS.needs}
              mode="ceiling"
            />
            <PlanBudgetRow
              bucket={moneyPlan.wants}
              hint="Leftover after savings & needs"
              barClass={BUDGET_GROUP_BAR_CLASS.wants}
              mode="ceiling"
            />
            {moneyPlan.wantsWarning && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Wants spending is at{' '}
                {Math.round(moneyPlan.wants.ratio * 100)}% of this month&apos;s
                budget.
              </p>
            )}

            {committedBucket && freeBucket && (
              <>
                <p className="pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Free Wants Pace
                </p>
                <PlanBudgetRow
                  bucket={committedBucket}
                  hint="Estimate wants reserved this month"
                  barClass="bg-violet-400"
                  mode="ceiling"
                />
                <PlanBudgetRow
                  bucket={freeBucket}
                  hint="Reward money after committed wants"
                  barClass="bg-emerald-500"
                  mode="ceiling"
                />
                {weekBucket && freeWants?.focusWeek && (
                  <>
                    <PlanBudgetRow
                      bucket={weekBucket}
                      hint={weekHint(freeWants.focusWeek)}
                      barClass="bg-teal-500"
                      mode="ceiling"
                    />
                    {freeWants.focusWeek.available < 0 && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-200">
                        Carry debt{' '}
                        {formatRupiah(
                          Math.abs(freeWants.focusWeek.available),
                        )}{' '}
                        from prior weeks — this week&apos;s base is already used
                        up.
                      </p>
                    )}
                    {freeWants.focusWeek.available >= 0 &&
                      freeWants.focusWeek.spent >
                        freeWants.focusWeek.available && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          Over this week&apos;s pace — the shortfall carries to
                          next week.
                        </p>
                      )}
                  </>
                )}
              </>
            )}

            {estimateProgress.length > 0 && (
              <div className="space-y-2 pt-3">
                <SearchField
                  value={estimateSearchQuery}
                  onChange={setEstimateSearchQuery}
                  placeholder="Search estimates…"
                  aria-label="Search Estimate Progress"
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
                      label="Estimate Progress"
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
                                const row = estimateProgressByBillId.get(
                                  bill.id,
                                )
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
                                    barClass={
                                      BUDGET_GROUP_BAR_CLASS[row.group]
                                    }
                                    mode="ceiling"
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

function isCurrentWeekLabel(
  weekMonday: string,
  viewCursor: { year: number; month: number },
): boolean {
  const today = todayIso()
  const now = new Date()
  const isCurrentMonth =
    now.getFullYear() === viewCursor.year &&
    now.getMonth() === viewCursor.month
  if (!isCurrentMonth) return false
  return mondayOf(today) === weekMonday
}

function weekHint(week: {
  weekMonday: string
  weekSunday: string
  base: number
  carryIn: number
  available: number
}): string {
  const range = `${formatShortDay(week.weekMonday)}–${formatShortDay(week.weekSunday)}`
  if (week.carryIn === 0) {
    return `${range} · Mon–Sun · carry rolls over`
  }
  const carryLabel =
    week.carryIn > 0
      ? `+${formatRupiah(week.carryIn)} carry`
      : `${formatRupiah(week.carryIn)} carry`
  return `${range} · ${carryLabel}`
}

function formatShortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
