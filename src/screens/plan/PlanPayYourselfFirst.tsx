import { useEffect, useMemo, useState } from 'react'
import { CollapseChevron } from '../../components/CollapseChevron'
import { CollapsibleDayGroup } from '../../components/CollapsibleDayGroup'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { MonthPager } from '../../components/MonthPager'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { useTransactions } from '../../hooks/useTransactions'
import { groupBucketsByKindAsTree } from '../../lib/bucketsGroup'
import {
  getCollapseOpen,
  setCollapseOpen,
} from '../../lib/collapseState'
import { formatRupiah } from '../../lib/format'
import { sumPlannedNeeds } from '../../lib/freeWants'
import {
  buildMoneyPlan,
  makeMoneyPlanBucket,
  sumMonthRegularIncome,
  sumSavingsActuals,
  type MoneyPlanBucket,
} from '../../lib/moneyPlan'
import { monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import {
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
} from '../../lib/recurringBillsApi'
import {
  BUCKET_KIND_LABELS,
  type BucketKind,
  type BucketTreeNode,
  type BucketWithBalance,
} from '../../lib/types'

const KIND_BAR: Record<BucketKind, string> = {
  checking: 'bg-sky-500',
  emergency: 'bg-teal-500',
  investment: 'bg-indigo-500',
  sinking: 'bg-violet-500',
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
      hint: `${monthlyPct}% of income · via Transfer · bal ${formatRupiah(b.balance)}`,
    }
  }
  return {
    bucket: makeMoneyPlanBucket(b.name, 0, monthInflow, 'floor'),
    hint:
      monthInflow > 0
        ? `Funded this month · bal ${formatRupiah(b.balance)}`
        : `No funding this month · bal ${formatRupiah(b.balance)}`,
  }
}

export function PlanPayYourselfFirst() {
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
    byId: bucketsById,
    emergency,
    investment,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets()
  const {
    byId: categoriesById,
    loading: categoriesLoading,
  } = useCategories('expense', { includeInactive: true })

  const [kindGroupsExpanded, setKindGroupsExpanded] = useState(true)
  const [kindGroupsVersion, setKindGroupsVersion] = useState(0)
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [billsLoading, setBillsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setBillsLoading(true)
    void (async () => {
      try {
        const rows = await fetchRecurringBills()
        if (!cancelled) setBills(rows)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        if (isMissingRecurringSchema(message)) setBills([])
      } finally {
        if (!cancelled) setBillsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  const viewYm = monthCursorKey(cursor)
  const plannedNeeds = useMemo(
    () =>
      sumPlannedNeeds(
        bills,
        new Map(),
        categoriesById,
        viewYm,
        undefined,
        bucketsById,
      ),
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
    () => groupBucketsByKindAsTree(buckets, categoriesById),
    [buckets, categoriesById],
  )

  const expandableSinkingParentIds = useMemo(() => {
    const sinking = groupedBuckets.find(([kind]) => kind === 'sinking')
    if (!sinking) return [] as string[]
    return sinking[1]
      .filter((node) => node.children.length > 0)
      .map((node) => node.bucket.id)
  }, [groupedBuckets])

  const allSinkingCatsExpanded =
    expandableSinkingParentIds.length > 0 &&
    expandableSinkingParentIds.every((id) => expandedParentIds.has(id))

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
    const parentsWithKids = buckets.filter(
      (b) =>
        b.kind === 'sinking' &&
        !b.parent_id &&
        buckets.some((c) => c.parent_id === b.id),
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
  }, [buckets])

  const inflowsByBucket = useMemo(
    () => monthInflowByBucketId(transactions),
    [transactions],
  )

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

  function renderSinkingNode(node: BucketTreeNode, kind: BucketKind) {
    const hasChildren = node.children.length > 0
    const expanded = expandedParentIds.has(node.bucket.id)
    const parentInflow = inflowForNode(node.bucket, node.children)
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
          bucket={
            hasChildren
              ? {
                  ...parentRow,
                  label: `${node.bucket.name} (${node.children.length})`,
                }
              : parentRow
          }
          hint={parentHint}
          barClass={KIND_BAR[kind]}
          mode="floor"
          leading={
            hasChildren ? (
              <button
                type="button"
                onClick={() => toggleParentExpanded(node.bucket.id)}
                className="-ml-1 shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                aria-label={expanded ? 'Collapse' : 'Expand'}
                aria-expanded={expanded}
              >
                <CollapseChevron expanded={expanded} />
              </button>
            ) : undefined
          }
        />
        {hasChildren && expanded
          ? node.children.map((child) => {
              const { bucket, hint } = rowForBucket(
                child,
                null,
                null,
                totalIncome,
                inflowsByBucket.get(child.id) ?? 0,
              )
              return (
                <div key={child.id} className="pl-5">
                  <PlanBudgetRow
                    icon={child.icon}
                    bucket={bucket}
                    hint={hint}
                    barClass={KIND_BAR[kind]}
                    mode="floor"
                    surfaceClassName="bg-neutral-100 dark:bg-neutral-700/70"
                  />
                </div>
              )
            })
          : null}
      </div>
    )
  }

  const pageLoading =
    loading || planLoading || bucketsLoading || billsLoading || categoriesLoading

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title={PlanTitle.payYourselfFirst}
        icon={PlanIcon.payYourselfFirst}
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
        {bucketsError && (
          <p className="mt-2 text-center text-sm text-red-500">{bucketsError}</p>
        )}

        {!pageLoading && buckets.length === 0 && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            No buckets yet. Add them in Settings → Savings Buckets.
          </p>
        )}

        {!pageLoading && !settings && buckets.length > 0 && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Set Money Plan percentages in Settings for monthly emergency &amp;
            investment targets.
          </p>
        )}

        {!pageLoading && buckets.length > 0 && (
          <div className="mt-4">
            <GroupedListFrame
              label="Pay Yourself First"
              expanded={kindGroupsExpanded}
              onToggle={(expanded) => {
                setKindGroupsExpanded(expanded)
                setKindGroupsVersion((v) => v + 1)
                setAllSinkingCatsExpanded(expanded)
              }}
            >
              <div className="space-y-5">
                {groupedBuckets.map(([kind, items]) =>
                  kind === 'sinking' ? (
                    <div key={kind}>
                      <button
                        type="button"
                        onClick={() =>
                          setAllSinkingCatsExpanded(!allSinkingCatsExpanded)
                        }
                        aria-expanded={allSinkingCatsExpanded}
                        aria-label={
                          allSinkingCatsExpanded
                            ? 'Collapse all sinking categories'
                            : 'Expand all sinking categories'
                        }
                        className="mb-2 flex w-full items-center gap-1.5 text-left"
                      >
                        <CollapseChevron
                          expanded={allSinkingCatsExpanded}
                          size={14}
                          className="shrink-0 text-neutral-400"
                        />
                        <p className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-neutral-400">
                          {BUCKET_KIND_LABELS[kind]}
                        </p>
                      </button>
                      <div className="space-y-2">
                        {items.map((node) => renderSinkingNode(node, kind))}
                      </div>
                    </div>
                  ) : (
                    <CollapsibleDayGroup
                      key={kind}
                      title={BUCKET_KIND_LABELS[kind]}
                      persistKey={`plan:pyf:kind:${kind}`}
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
                            />
                          )
                        })}
                      </div>
                    </CollapsibleDayGroup>
                  ),
                )}
              </div>
            </GroupedListFrame>
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
