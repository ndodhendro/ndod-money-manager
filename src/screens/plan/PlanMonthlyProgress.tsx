import { useEffect, useMemo, useState } from 'react'
import { CollapseChevron } from '../../components/CollapseChevron'
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
import { groupBucketsByKindAsTree } from '../../lib/bucketsGroup'
import {
  areAllCollapseOpen,
  getCollapseOpen,
  setCollapseOpen,
} from '../../lib/collapseState'
import {
  buildEstimateProgressRows,
  upcomingEstimateProgressAmountByBillId,
} from '../../lib/estimateProgress'
import { formatRupiah, todayIso } from '../../lib/format'
import { plannedNeedsCeiling } from '../../lib/freeWants'
import {
  isBlankSearch,
  matchesBucketSearch,
  matchesRecurringBillSearch,
} from '../../lib/listSearch'
import {
  buildMoneyPlan,
  isPyfFundingTransfer,
  makeMoneyPlanBucket,
  sumMonthRegularIncome,
  sumSavingsActuals,
  type MoneyPlanBucket,
} from '../../lib/moneyPlan'
import { monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import {
  getRecurringBillDisplayParts,
  groupRecurringBillsForSettings,
  sortRecurringBillsForSettings,
} from '../../lib/recurringBillDisplay'
import {
  fetchRecurringBillLogs,
  fetchRecurringBillMonthOverridesInRange,
  fetchRecurringBillOccurrenceSkipsInRange,
  fetchRecurringBills,
  dueBillIdByTxIdFromLogs,
  isMissingRecurringSchema,
  occurrenceLogKey,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
  type RecurringBillOccurrenceSkip,
} from '../../lib/recurringBillsApi'
import {
  missedTransferHint,
  sinkingMissedTransferAmount,
  sinkingMonthTransferTarget,
} from '../../lib/sinkingTransferArrears'
import {
  BUDGET_GROUP_BAR_CLASS,
  BUDGET_GROUP_LABELS,
  BUCKET_KIND_LABELS,
  type BucketKind,
  type BucketTreeNode,
  type BucketWithBalance,
} from '../../lib/types'

const KIND_BAR: Record<Exclude<BucketKind, 'checking'>, string> = {
  emergency: 'bg-teal-500',
  investment: 'bg-indigo-500',
  sinking: 'bg-violet-500',
}

/** Hide sinking PYF rows with no monthly target unless already funded or in arrears. */
function pyfSinkingVisibleThisMonth(input: {
  monthTarget: number
  monthInflow: number
  missed: number
}): boolean {
  return input.monthTarget > 0 || input.monthInflow > 0 || input.missed > 0
}

function monthInflowByBucketId(
  transactions: Array<{
    type: string
    amount: number
    to_bucket_id?: string | null
    complete_later?: boolean
  }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.complete_later) continue
    if (tx.type !== 'transfer' || !tx.to_bucket_id) continue
    map.set(tx.to_bucket_id, (map.get(tx.to_bucket_id) ?? 0) + tx.amount)
  }
  return map
}

function rowForBucket(
  b: BucketWithBalance,
  monthly: MoneyPlanBucket | null,
  monthlyPct: number | null,
  totalIncome: number,
  monthInflow: number,
): { bucket: MoneyPlanBucket; hint: string } {
  if (monthly && totalIncome > 0 && monthlyPct != null) {
    return {
      bucket: { ...monthly, label: b.name },
      hint: `${monthlyPct}% of income · via Transfer · ${formatRupiah(b.balance)}`,
    }
  }
  return {
    bucket: makeMoneyPlanBucket(b.name, 0, monthInflow, 'floor'),
    hint:
      monthInflow > 0
        ? `Funded this month ·  ${formatRupiah(b.balance)}`
        : `${formatRupiah(b.balance)}`,
  }
}

function estimateProgressPersistKey(groupKey: string): string {
  return groupKey === 'estimate'
    ? 'plan:monthly-progress:estimates:nodate'
    : `plan:monthly-progress:estimates:day:${groupKey.replace('day:', '')}`
}

function pyfKindPersistKey(kind: BucketKind): string {
  return `plan:monthly-progress:pyf:${kind}`
}

export function PlanMonthlyProgress() {
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
    settings,
    loading: planLoading,
    error: planError,
  } = usePyfSettings()
  const {
    buckets,
    movements,
    byId: bucketsById,
    emergency,
    investment,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets({ includeInactive: true })
  const {
    byId: categoriesById,
    loading: categoriesLoading,
    error: categoriesError,
  } = useCategories('expense', { includeInactive: true })

  const [bills, setBills] = useState<RecurringBill[]>([])
  const [overrides, setOverrides] = useState<RecurringBillMonthOverride[]>([])
  const [occurrenceSkips, setOccurrenceSkips] = useState<
    RecurringBillOccurrenceSkip[]
  >([])
  const [dueLogs, setDueLogs] = useState<RecurringBillLog[]>([])
  const [recurringLoading, setRecurringLoading] = useState(true)
  const [recurringError, setRecurringError] = useState<string | null>(null)

  const [kindGroupsExpanded, setKindGroupsExpanded] = useState(true)
  const [kindGroupsVersion, setKindGroupsVersion] = useState(0)
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [sinkingSearchQuery, setSinkingSearchQuery] = useState('')

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

  const pyfBuckets = useMemo(
    () =>
      buckets.filter(
        (b) => b.is_active !== false && b.kind !== 'checking',
      ),
    [buckets],
  )

  const totalIncome = sumMonthRegularIncome(transactions)
  const savingsActuals = useMemo(
    () =>
      sumSavingsActuals(
        transactions,
        emergency?.id ?? null,
        investment?.id ?? null,
      ),
    [transactions, emergency?.id, investment?.id],
  )
  const plannedNeeds = useMemo(
    () =>
      plannedNeedsCeiling({
        bills,
        categoriesById,
        bucketsById,
        yearMonth: viewYm,
      }),
    [bills, categoriesById, bucketsById, viewYm],
  )
  const moneyPlan = useMemo(() => {
    if (!settings) return null
    return buildMoneyPlan({
      income: totalIncome,
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      plannedNeeds,
      needsActual: 0,
      wantsActual: 0,
      emergencyActual: savingsActuals.emergency,
      investmentActual: savingsActuals.investment,
    })
  }, [settings, totalIncome, savingsActuals, plannedNeeds])

  const groupedBuckets = useMemo(
    () => groupBucketsByKindAsTree(pyfBuckets, categoriesById),
    [pyfBuckets, categoriesById],
  )

  const sinkingSearchActive = !isBlankSearch(sinkingSearchQuery)
  const sinkingNodes = useMemo(() => {
    const sinking = groupedBuckets.find(([kind]) => kind === 'sinking')
    return sinking?.[1] ?? []
  }, [groupedBuckets])

  const pyfKindPersistKeys = useMemo(
    () =>
      groupedBuckets
        .filter(([kind]) => kind !== 'checking')
        .filter(([kind]) => kind !== 'sinking' || sinkingNodes.length > 0)
        .map(([kind]) => pyfKindPersistKey(kind)),
    [groupedBuckets, sinkingNodes.length],
  )

  useEffect(() => {
    if (kindGroupsVersion > 0) return
    setKindGroupsExpanded(areAllCollapseOpen(pyfKindPersistKeys, true))
  }, [pyfKindPersistKeys, kindGroupsVersion])

  const expandableSinkingParentIds = useMemo(
    () =>
      sinkingNodes
        .filter((node) => node.children.length > 0)
        .map((node) => node.bucket.id),
    [sinkingNodes],
  )

  function setAllSinkingCatsExpanded(expanded: boolean) {
    const next = expanded
      ? new Set(expandableSinkingParentIds)
      : new Set<string>()
    setExpandedParentIds(next)
    for (const id of expandableSinkingParentIds) {
      setCollapseOpen(`plan:pyf:parent:${id}`, expanded)
    }
  }

  function toggleParentExpanded(parentId: string) {
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      const open = !next.has(parentId)
      if (open) next.add(parentId)
      else next.delete(parentId)
      setCollapseOpen(`plan:pyf:parent:${parentId}`, open)
      return next
    })
  }

  useEffect(() => {
    const parentsWithKids = pyfBuckets.filter(
      (b) =>
        b.kind === 'sinking' &&
        !b.parent_id &&
        pyfBuckets.some((c) => c.parent_id === b.id),
    )
    if (parentsWithKids.length === 0) return
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const p of parentsWithKids) {
        if (getCollapseOpen(`plan:pyf:parent:${p.id}`, false) && !next.has(p.id)) {
          next.add(p.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [pyfBuckets])

  const inflowsByBucket = useMemo(
    () => monthInflowByBucketId(transactions),
    [transactions],
  )

  const missedByBucketId = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of pyfBuckets) {
      if (b.kind !== 'sinking') continue
      map.set(
        b.id,
        sinkingMissedTransferAmount({
          destinationIds: [b.id],
          bills,
          movements,
          throughYearMonth: viewYm,
          openingTransfers: b.opening_transfers,
        }),
      )
    }
    return map
  }, [pyfBuckets, bills, movements, viewYm])

  function sinkingMonthActivity(bucketId: string) {
    return {
      monthTarget: sinkingMonthTransferTarget({
        destinationIds: [bucketId],
        bills,
        yearMonth: viewYm,
      }),
      monthInflow: inflowsByBucket.get(bucketId) ?? 0,
      missed: missedByBucketId.get(bucketId) ?? 0,
    }
  }

  function isSinkingDueThisMonth(bucketId: string) {
    return pyfSinkingVisibleThisMonth(sinkingMonthActivity(bucketId))
  }

  const filteredSinkingNodes = useMemo(() => {
    if (sinkingSearchActive) {
      return sinkingNodes
        .map((node) => {
          const parentMatch = matchesBucketSearch(sinkingSearchQuery, node.bucket)
          const children = node.children.filter(
            (child) =>
              parentMatch ||
              matchesBucketSearch(sinkingSearchQuery, child, {
                parentName: node.bucket.name,
              }),
          )
          return { ...node, children }
        })
        .filter(
          (node) =>
            matchesBucketSearch(sinkingSearchQuery, node.bucket) ||
            node.children.length > 0,
        )
    }
    return sinkingNodes
      .map((node) => ({
        ...node,
        children: node.children.filter((child) =>
          isSinkingDueThisMonth(child.id),
        ),
      }))
      .filter(
        (node) =>
          node.children.length > 0 || isSinkingDueThisMonth(node.bucket.id),
      )
  }, [
    sinkingNodes,
    sinkingSearchActive,
    sinkingSearchQuery,
    missedByBucketId,
    inflowsByBucket,
    bills,
    viewYm,
  ])

  function inflowForNode(
    bucket: BucketWithBalance,
    children: BucketWithBalance[],
  ): number {
    if (children.length === 0) {
      return inflowsByBucket.get(bucket.id) ?? 0
    }
    let sum = 0
    for (const child of children) {
      sum += inflowsByBucket.get(child.id) ?? 0
    }
    return sum
  }

  function renderSinkingNode(node: BucketTreeNode, kind: 'sinking') {
    const visibleChildren = node.children
    const hasChildren = visibleChildren.length > 0
    if (!hasChildren) {
      const { monthTarget, monthInflow, missed } = sinkingMonthActivity(
        node.bucket.id,
      )
      const hint =
        monthInflow > 0
          ? `Funded this month · ${formatRupiah(monthInflow)}`
          : undefined
      return (
        <div key={node.bucket.id} className="space-y-2">
          <PlanBudgetRow
            icon={node.bucket.icon}
            bucket={makeMoneyPlanBucket(
              node.bucket.name,
              monthTarget,
              monthInflow,
              'floor',
            )}
            hint={hint}
            alertHint={missedTransferHint(missed)}
            barClass={KIND_BAR[kind]}
            mode="floor"
            floorStatusPlacement="under-title"
          />
        </div>
      )
    }

    const expanded = sinkingSearchActive || expandedParentIds.has(node.bucket.id)
    const parentInflow = inflowForNode(node.bucket, visibleChildren)
    const parentMissed = visibleChildren.reduce(
      (sum, child) => sum + (missedByBucketId.get(child.id) ?? 0),
      0,
    )
    const { bucket: parentRow, hint: parentHint } = rowForBucket(
      node.bucket,
      null,
      null,
      totalIncome,
      parentInflow,
    )
    return (
      <div key={node.bucket.id} className="space-y-2">
        <PlanBudgetRow
          icon={node.bucket.icon}
          bucket={{
            ...parentRow,
            label: `${node.bucket.name} (${visibleChildren.length})`,
          }}
          hint={parentHint}
          alertHint={missedTransferHint(parentMissed)}
          barClass={KIND_BAR[kind]}
          mode="floor"
          floorStatusPlacement="under-title"
          leading={
            <button
              type="button"
              onClick={() => toggleParentExpanded(node.bucket.id)}
              className="-ml-1 shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              aria-expanded={expanded}
            >
              <CollapseChevron expanded={expanded} />
            </button>
          }
        />
        {expanded
          ? visibleChildren.map((child) => {
              const { monthTarget, monthInflow, missed } = sinkingMonthActivity(
                child.id,
              )
              const hint =
                monthInflow > 0
                  ? `Funded this month · ${formatRupiah(monthInflow)}`
                  : undefined
              return (
                <div key={child.id} className="pl-5">
                  <PlanBudgetRow
                    icon={child.icon}
                    bucket={makeMoneyPlanBucket(
                      child.name,
                      monthTarget,
                      monthInflow,
                      'floor',
                    )}
                    hint={hint}
                    alertHint={missedTransferHint(missed)}
                    barClass={KIND_BAR[kind]}
                    mode="floor"
                    floorStatusPlacement="under-title"
                    surfaceClassName="bg-neutral-100 dark:bg-neutral-700/70"
                  />
                </div>
              )
            })
          : null}
      </div>
    )
  }

  const monthTx = useMemo(
    () =>
      transactions.filter((t) => {
        const key = t.occurred_on.slice(0, 7)
        return key === viewYm
      }),
    [transactions, viewYm],
  )

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
      if (!bill) continue
      if (isPyfFundingTransfer(bill, bucketsById)) continue
      listed.push(bill)
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

  const estimateSearchForceVersion = estimateSearchActive
    ? Math.max(1, estimateGroupsVersion)
    : estimateGroupsVersion

  const pyfSearchForceVersion = sinkingSearchActive
    ? Math.max(1, kindGroupsVersion)
    : kindGroupsVersion

  const pageLoading =
    loading ||
    planLoading ||
    bucketsLoading ||
    recurringLoading ||
    categoriesLoading

  const hasActiveBuckets = buckets.some((b) => b.is_active !== false)
  const showPyf = pyfBuckets.length > 0
  const showEstimates = estimateProgressBills.length > 0
  const searchForceAll = sinkingSearchActive || estimateSearchActive
  const allSectionsExpanded =
    (!showPyf || kindGroupsExpanded) &&
    (!showEstimates || estimateGroupsExpanded)

  function toggleAllSections(expanded: boolean) {
    setKindGroupsExpanded(expanded)
    setKindGroupsVersion((v) => v + 1)
    setAllSinkingCatsExpanded(expanded)
    setEstimateGroupsExpanded(expanded)
    setEstimateGroupsVersion((v) => v + 1)
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title={PlanTitle.monthlyProgress}
        icon={PlanIcon.monthlyProgress}
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

        {!pageLoading && (
          <div className="mt-4">
            <GroupedListFrame
              label={PlanTitle.monthlyProgress}
              expanded={searchForceAll ? true : allSectionsExpanded}
              onToggle={toggleAllSections}
            >
              <div className="space-y-5">
                {!hasActiveBuckets && (
                  <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                    No buckets yet. Add them in Settings → Savings Buckets.
                  </p>
                )}

                {!settings && showPyf && (
                  <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                    Set Money Plan percentages in Settings for monthly emergency
                    &amp; investment targets.
                  </p>
                )}

                {showPyf && (
            <GroupedListFrame
              label="Pay Yourself First"
              expanded={sinkingSearchActive ? true : kindGroupsExpanded}
              onToggle={(expanded) => {
                setKindGroupsExpanded(expanded)
                setKindGroupsVersion((v) => v + 1)
                setAllSinkingCatsExpanded(expanded)
              }}
            >
              <div className="space-y-5">
                {groupedBuckets.map(([kind, items]) =>
                  kind === 'sinking' ? (
                    sinkingNodes.length > 0 ? (
                    <CollapsibleDayGroup
                      key={kind}
                      title={BUCKET_KIND_LABELS[kind]}
                      persistKey={pyfKindPersistKey(kind)}
                      forceOpen={
                        sinkingSearchActive
                          ? true
                          : kindGroupsVersion > 0
                            ? kindGroupsExpanded
                            : undefined
                      }
                      forceVersion={pyfSearchForceVersion}
                    >
                      <SearchField
                        value={sinkingSearchQuery}
                        onChange={setSinkingSearchQuery}
                        placeholder="Search sinking funds…"
                        aria-label="Search Sinking Funds"
                        className="mb-2 min-w-0"
                      />
                      {sinkingSearchActive &&
                      filteredSinkingNodes.length === 0 ? (
                        <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                          No matches.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {filteredSinkingNodes.map((node) =>
                            renderSinkingNode(node, kind),
                          )}
                        </div>
                      )}
                    </CollapsibleDayGroup>
                    ) : null
                  ) : kind === 'checking' ? null : (
                    <CollapsibleDayGroup
                      key={kind}
                      title={BUCKET_KIND_LABELS[kind]}
                      persistKey={pyfKindPersistKey(kind)}
                      forceOpen={
                        kindGroupsVersion > 0 ? kindGroupsExpanded : undefined
                      }
                      forceVersion={kindGroupsVersion}
                    >
                      <div className="space-y-2">
                        {items.map((node) => {
                          const b = node.bucket
                          const isPyfSystem =
                            (kind === 'emergency' &&
                              b.id === emergency?.id) ||
                            (kind === 'investment' &&
                              b.id === investment?.id)
                          const monthly = isPyfSystem
                            ? kind === 'emergency'
                              ? (moneyPlan?.emergency ?? null)
                              : (moneyPlan?.investment ?? null)
                            : null
                          const monthlyPct = isPyfSystem
                            ? kind === 'emergency'
                              ? (settings?.emergency_fund_pct ?? null)
                              : (settings?.investment_pct ?? null)
                            : null
                          const { bucket, hint } = rowForBucket(
                            b,
                            monthly,
                            monthlyPct,
                            totalIncome,
                            inflowForNode(node.bucket, node.children),
                          )
                          return (
                            <PlanBudgetRow
                              key={b.id}
                              icon={b.icon}
                              bucket={bucket}
                              hint={hint}
                              barClass={KIND_BAR[kind]}
                              mode="floor"
                              floorStatusPlacement="under-title"
                            />
                          )
                        })}
                      </div>
                    </CollapsibleDayGroup>
                  ),
                )}
              </div>
            </GroupedListFrame>
                )}

                {!showEstimates && !showPyf && (
                  <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                    Add spending estimates in Settings → Monthly Estimates.
                    Funding transfers are under Pay Yourself First.
                  </p>
                )}

                {showEstimates && (
            <GroupedListFrame
              label="Estimate Progress"
              expanded={estimateSearchActive ? true : estimateGroupsExpanded}
              onToggle={(expanded) => {
                setEstimateGroupsExpanded(expanded)
                setEstimateGroupsVersion((v) => v + 1)
              }}
            >
              <SearchField
                value={estimateSearchQuery}
                onChange={setEstimateSearchQuery}
                placeholder="Search estimates…"
                aria-label="Search Estimate Progress"
                className="mb-2 min-w-0"
              />
              {estimateSearchActive &&
              filteredEstimateProgressBills.length === 0 ? (
                <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                  No matches.
                </p>
              ) : (
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
                      forceVersion={estimateSearchForceVersion}
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
                              progressKind={
                                display.isTransfer ? 'fund' : 'spend'
                              }
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
              )}
            </GroupedListFrame>
                )}
              </div>
            </GroupedListFrame>
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
