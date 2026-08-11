import { useEffect, useMemo, useState } from 'react'
import { CollapseChevron } from '../../components/CollapseChevron'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { groupBucketsByKindAsTree } from '../../lib/bucketsGroup'
import {
  getCollapseOpen,
  setCollapseOpen,
} from '../../lib/collapseState'
import { sumPlannedNeeds } from '../../lib/freeWants'
import {
  emergencyFundTarget,
  makeMoneyPlanBucket,
  type MoneyPlanBucket,
} from '../../lib/moneyPlan'
import { currentMonthCursor, monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import {
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
} from '../../lib/recurringBillsApi'
import {
  computeSinkingFundPace,
  SINKING_PACE_BADGE_CLASS,
  SINKING_PACE_BAR_CLASS,
  SINKING_PACE_DELTA_CLASS,
  sinkingPaceDeltaLabel,
  sinkingPaceLabel,
} from '../../lib/sinkingFundPace'
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

function overallRowForBucket(
  b: BucketWithBalance,
  emergencyId: string | null,
  efTarget: number,
  efMultiplier: number,
  bills: RecurringBill[],
  yearMonth: string,
): {
  bucket: MoneyPlanBucket
  hint: string
  badge: { label: string; className: string } | null
  /** Pace-colored bar for sinking; null = use kind default. */
  barClass: string | null
  paceMeta: {
    expected: number
    monthsElapsed: number
    monthsTotal: number
    deltaText: string
    deltaClassName: string
  } | null
} {
  const isSystemEmergency = emergencyId != null && b.id === emergencyId
  if (isSystemEmergency && efTarget > 0) {
    const row = makeMoneyPlanBucket(b.name, efTarget, b.balance, 'floor')
    return {
      bucket: row,
      hint: `${efMultiplier}× planned needs`,
      badge: null,
      barClass: null,
      paceMeta: null,
    }
  }
  if (b.kind === 'investment') {
    return {
      bucket: makeMoneyPlanBucket(b.name, 0, b.balance, 'floor'),
      hint: '',
      badge: null,
      barClass: null,
      paceMeta: null,
    }
  }

  const target = b.target_amount ?? 0
  const pace =
    b.kind === 'sinking' && target > 0
      ? computeSinkingFundPace({
          destinationIds: [b.id],
          target,
          balance: b.balance,
          yearMonth,
          bills,
        })
      : null
  const badge = pace
    ? {
        label: sinkingPaceLabel(pace.status),
        className: SINKING_PACE_BADGE_CLASS[pace.status],
      }
    : null
  const delta = pace
    ? sinkingPaceDeltaLabel(pace.balance, pace.expected)
    : null
  const paceMeta = pace
    ? {
        expected: pace.expected,
        monthsElapsed: pace.monthsElapsed,
        monthsTotal: pace.monthsTotal,
        deltaText: delta!.text,
        deltaClassName: SINKING_PACE_DELTA_CLASS[delta!.tone],
      }
    : null
  const hint =
    pace != null
      ? ''
      : target > 0
        ? 'Balance vs target'
        : ''
  return {
    bucket: makeMoneyPlanBucket(b.name, target, b.balance, 'floor'),
    hint,
    badge,
    barClass: pace ? SINKING_PACE_BAR_CLASS[pace.status] : null,
    paceMeta,
  }
}

export function PlanEmergency() {
  const {
    settings,
    loading: planLoading,
    error: planError,
  } = usePyfSettings()
  const {
    buckets,
    byId: bucketsById,
    emergency,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets()
  const {
    byId: categoriesById,
    loading: categoriesLoading,
  } = useCategories('expense', { includeInactive: true })

  const [kindGroupsExpanded, setKindGroupsExpanded] = useState(true)
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

  const viewYm = monthCursorKey(currentMonthCursor())
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

  const efTarget = useMemo(() => {
    if (!settings) return 0
    return emergencyFundTarget(
      plannedNeeds,
      settings.emergency_fund_target_multiplier,
    )
  }, [settings, plannedNeeds])

  const efMultiplier = settings?.emergency_fund_target_multiplier ?? 3
  const groupedBuckets = useMemo(
    () =>
      groupBucketsByKindAsTree(buckets, categoriesById).filter(
        ([kind]) => kind !== 'checking',
      ),
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
      setCollapseOpen(`plan:goals:parent:${id}`, expanded)
    }
  }

  function toggleParentExpanded(parentId: string) {
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      const open = !next.has(parentId)
      if (open) next.add(parentId)
      else next.delete(parentId)
      setCollapseOpen(`plan:goals:parent:${parentId}`, open)
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
        if (
          getCollapseOpen(`plan:goals:parent:${p.id}`, false) &&
          !next.has(p.id)
        ) {
          next.add(p.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [buckets])

  const pageLoading =
    planLoading || bucketsLoading || billsLoading || categoriesLoading

  const systemEmergencyFunded =
    emergency != null && efTarget > 0 && emergency.balance >= efTarget

  function renderSinkingNode(node: BucketTreeNode, kind: BucketKind) {
    const hasChildren = node.children.length > 0
    const expanded = expandedParentIds.has(node.bucket.id)

    if (hasChildren) {
      return (
        <div key={node.bucket.id} className="space-y-2">
          <PlanBudgetRow
            icon={node.bucket.icon}
            bucket={makeMoneyPlanBucket(
              `${node.bucket.name} (${node.children.length})`,
              0,
              node.bucket.balance,
              'floor',
            )}
            barClass={KIND_BAR[kind]}
            mode="floor"
            showMetrics={false}
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
            ? node.children.map((child) => {
                const { bucket, hint, badge, barClass, paceMeta } =
                  overallRowForBucket(
                    child,
                    emergency?.id ?? null,
                    efTarget,
                    efMultiplier,
                    bills,
                    viewYm,
                  )
                return (
                  <div key={child.id} className="pl-5">
                    <PlanBudgetRow
                      icon={child.icon}
                      bucket={bucket}
                      hint={hint}
                      badge={badge}
                      paceMeta={paceMeta}
                      barClass={barClass ?? KIND_BAR[kind]}
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

    const { bucket, hint, badge, barClass, paceMeta } = overallRowForBucket(
      node.bucket,
      emergency?.id ?? null,
      efTarget,
      efMultiplier,
      bills,
      viewYm,
    )
    return (
      <div key={node.bucket.id} className="space-y-2">
        <PlanBudgetRow
          icon={node.bucket.icon}
          bucket={bucket}
          hint={hint}
          badge={badge}
          paceMeta={paceMeta}
          barClass={barClass ?? KIND_BAR[kind]}
          mode="floor"
        />
      </div>
    )
  }

  return (
    <PlanSubPage
      title={PlanTitle.emergency}
      icon={PlanIcon.emergency}
      description=""
    >
      {pageLoading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
      )}
      {planError && (
        <p className="mt-4 text-center text-sm text-red-500">{planError}</p>
      )}
      {bucketsError && (
        <p className="mt-2 text-center text-sm text-red-500">{bucketsError}</p>
      )}

      {!pageLoading && buckets.length === 0 && (
        <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
          No buckets yet. Add them in Settings → Savings Buckets.
        </p>
      )}

      {!pageLoading &&
        buckets.length > 0 &&
        emergency &&
        efTarget <= 0 && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Add needs expenses in Settings → Monthly Estimates and set the
            emergency multiplier in Settings → Money Plan for the overall
            target.
          </p>
        )}

      {!pageLoading && buckets.length > 0 && (
        <div className="mt-4">
          <GroupedListFrame
            label="Savings Goals"
            expanded={kindGroupsExpanded}
            onToggle={(expanded) => {
              setKindGroupsExpanded(expanded)
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
                  <div key={kind}>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">
                      {BUCKET_KIND_LABELS[kind]}
                    </p>
                    <div className="space-y-2">
                      {items.map((node) => {
                        const { bucket, hint } = overallRowForBucket(
                          node.bucket,
                          emergency?.id ?? null,
                          efTarget,
                          efMultiplier,
                          bills,
                          viewYm,
                        )
                        const isSystemEmergency =
                          emergency != null &&
                          node.bucket.id === emergency.id
                        return (
                          <div key={node.bucket.id}>
                            <PlanBudgetRow
                              icon={node.bucket.icon}
                              bucket={bucket}
                              hint={hint}
                              barClass={KIND_BAR[kind]}
                              mode="floor"
                            />
                            {isSystemEmergency && systemEmergencyFunded && (
                              <p className="mt-1 px-1 text-[11px] text-teal-700 dark:text-teal-300">
                                Target reached — consider lowering the monthly
                                emergency %.
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          </GroupedListFrame>
        </div>
      )}
    </PlanSubPage>
  )
}
