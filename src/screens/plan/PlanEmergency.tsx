import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CollapseChevron } from '../../components/CollapseChevron'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import {
  PlanBudgetAmount,
  PlanBudgetRow,
} from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { SearchField } from '../../components/SearchField'
import { SinkingAllocateSheet } from '../../components/SinkingAllocateSheet'
import { useBuckets } from '../../hooks/useBuckets'
import { useEfOwed } from '../../hooks/useEfOwed'
import { useCategories } from '../../hooks/useCategories'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { ActionEmoji } from '../../lib/actionEmoji'
import { showAppToast } from '../../lib/appToast'
import { groupBucketsByKindAsTree, withoutEmptySinkingCategoryNodes } from '../../lib/bucketsGroup'
import {
  getCollapseOpen,
  setCollapseOpen,
} from '../../lib/collapseState'
import { plannedNeedsCeiling } from '../../lib/freeWants'
import {
  emergencyFundTarget,
  makeMoneyPlanBucket,
  type MoneyPlanBucket,
} from '../../lib/moneyPlan'
import { formatRupiah } from '../../lib/format'
import { isBlankSearch, matchesBucketSearch } from '../../lib/listSearch'
import { currentMonthCursor, monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import {
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
} from '../../lib/recurringBillsApi'
import {
  buildSinkingGoalsRow,
  computeSinkingFundPace,
  type SinkingPaceStatus,
} from '../../lib/sinkingFundPace'
import {
  missedTransferHint,
  sinkingMissedTransferAmount,
} from '../../lib/sinkingTransferArrears'
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
  efOwedTotal: number,
): {
  bucket: MoneyPlanBucket
  hint: ReactNode
} {
  const isSystemEmergency = emergencyId != null && b.id === emergencyId
  if (isSystemEmergency && efTarget > 0) {
    const available = Math.max(0, Math.round(b.balance) - Math.max(0, efOwedTotal))
    return {
      bucket: makeMoneyPlanBucket(b.name, efTarget, b.balance, 'floor'),
      hint: (
        <span className="block space-y-0.5">
          <span className="block">{`${efMultiplier}× planned needs`}</span>
          <span className="block">Available {formatRupiah(available)}</span>
        </span>
      ),
    }
  }
  if (b.kind === 'investment') {
    return {
      bucket: makeMoneyPlanBucket(b.name, 0, b.balance, 'floor'),
      hint: '',
    }
  }

  const target = b.target_amount ?? 0
  return {
    bucket: makeMoneyPlanBucket(b.name, target, b.balance, 'floor'),
    hint: '',
  }
}

function sinkingGoalsRowForBucket(input: {
  bucket: BucketWithBalance
  bills: RecurringBill[]
  movements: Array<{
    id: string
    amount: number
    from_bucket_id: string | null
    occurred_on: string
  }>
  sinkingBorrowByTxId?: Map<string, number>
  yearMonth: string
  barFallback: string
}) {
  const b = input.bucket
  const target = b.target_amount ?? 0
  const onHand = Math.max(0, Math.round(b.balance))
  const cashAndProgress = (progress: number) => ({
    headlineAmount: (
      <PlanBudgetAmount prefix="Available" actual={onHand} tone="emphasis" />
    ) as ReactNode,
    hint: (
      <PlanBudgetAmount actual={progress} target={target} tone="muted" />
    ) as ReactNode,
    hintAlign: 'right' as const,
  })
  const fallback = {
    bucket: makeMoneyPlanBucket(b.name, target, b.balance, 'floor'),
    hint: '' as ReactNode,
    hintAlign: 'left' as const,
    headlineAmount: undefined as ReactNode,
    badge: null as { label: string; className: string } | null,
    barClass: input.barFallback,
    footerNote: undefined as string | undefined,
    footerNoteClassName: undefined as string | undefined,
  }
  if (target <= 0) return fallback

  const pace = computeSinkingFundPace({
    destinationIds: [b.id],
    target,
    balance: b.balance,
    openingTransfers: b.opening_transfers,
    movements: input.movements,
    ledgerBalance: b.own_balance,
    sinkingBorrowByTxId: input.sinkingBorrowByTxId,
    yearMonth: input.yearMonth,
    bills: input.bills,
  })
  if (!pace) {
    return {
      ...fallback,
      ...cashAndProgress(onHand),
    }
  }

  const row = buildSinkingGoalsRow({ pace, onHand: b.balance })
  return {
    bucket: makeMoneyPlanBucket(b.name, target, row.progress, 'floor'),
    ...cashAndProgress(row.progress),
    badge: row.badge,
    barClass: row.barClass,
    footerNote: row.footerText,
    footerNoteClassName: row.footerClass,
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
    movements,
    sinkingBorrowByTxId,
    byId: bucketsById,
    emergency,
    investment,
    loading: bucketsLoading,
    error: bucketsError,
    reload: reloadBuckets,
  } = useBuckets()
  const { owed: efOwed } = useEfOwed()
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
  const [allocateBucket, setAllocateBucket] = useState<BucketWithBalance | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState('')

  const viewYm = monthCursorKey(currentMonthCursor())

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

  const searchActive = !isBlankSearch(searchQuery)
  const sinkingNodes = useMemo(() => {
    const sinking = groupedBuckets.find(([kind]) => kind === 'sinking')
    return withoutEmptySinkingCategoryNodes(sinking?.[1] ?? [])
  }, [groupedBuckets])
  const sinkingAvailableTotal = useMemo(
    () =>
      sinkingNodes.reduce(
        (sum, node) => sum + Math.max(0, Math.round(node.bucket.balance)),
        0,
      ),
    [sinkingNodes],
  )

  const missedByBucketId = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of buckets) {
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
  }, [buckets, bills, movements, viewYm])

  const paceStatusByBucketId = useMemo(() => {
    const map = new Map<string, SinkingPaceStatus>()
    for (const b of buckets) {
      if (b.kind !== 'sinking') continue
      const target = b.target_amount ?? 0
      if (target <= 0) continue
      const pace = computeSinkingFundPace({
        destinationIds: [b.id],
        target,
        balance: b.balance,
        openingTransfers: b.opening_transfers,
        movements,
        ledgerBalance: b.own_balance,
        sinkingBorrowByTxId,
        yearMonth: viewYm,
        bills,
      })
      if (pace) map.set(b.id, pace.status)
    }
    return map
  }, [buckets, bills, movements, sinkingBorrowByTxId, viewYm])

  const filteredSinkingNodes = useMemo(() => {
    if (!searchActive) return sinkingNodes
    const hasMissed = (bucketId: string) =>
      (missedByBucketId.get(bucketId) ?? 0) > 0
    const paceStatus = (bucketId: string) => paceStatusByBucketId.get(bucketId)
    return withoutEmptySinkingCategoryNodes(
      sinkingNodes
        .map((node) => {
          const parentMatch = matchesBucketSearch(searchQuery, node.bucket)
          const children = node.children.filter(
            (child) =>
              parentMatch ||
              matchesBucketSearch(searchQuery, child, {
                parentName: node.bucket.name,
                missedTransfer: hasMissed(child.id),
                paceStatus: paceStatus(child.id),
              }),
          )
          return { ...node, children }
        })
        .filter(
          (node) =>
            matchesBucketSearch(searchQuery, node.bucket, {
              missedTransfer: hasMissed(node.bucket.id),
              paceStatus: paceStatus(node.bucket.id),
            }) || node.children.length > 0,
        ),
    )
  }, [
    sinkingNodes,
    searchActive,
    searchQuery,
    missedByBucketId,
    paceStatusByBucketId,
  ])

  const expandableSinkingParentIds = useMemo(
    () =>
      sinkingNodes
        .filter((node) => node.children.length > 0)
        .map((node) => node.bucket.id),
    [sinkingNodes],
  )

  function sinkingRow(b: BucketWithBalance) {
    return sinkingGoalsRowForBucket({
      bucket: b,
      bills,
      movements,
      sinkingBorrowByTxId,
      yearMonth: viewYm,
      barFallback: KIND_BAR.sinking,
    })
  }

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

  function allocateTrailing(b: BucketWithBalance) {
    if (b.kind !== 'sinking' || b.balance <= 0) return null
    return (
      <button
        type="button"
        title="Allocate Surplus"
        aria-label="Allocate Surplus"
        onClick={() => {
          if (!emergency || !investment) {
            showAppToast('Emergency or Investment bucket missing')
            return
          }
          setAllocateBucket(b)
        }}
        className="mt-0.5 shrink-0 rounded-lg px-1.5 py-1 text-base leading-none hover:bg-neutral-100 dark:hover:bg-neutral-700"
      >
        {ActionEmoji.allocate}
      </button>
    )
  }

  function renderSinkingNode(node: BucketTreeNode, kind: BucketKind) {
    const hasChildren = node.children.length > 0
    const expanded = searchActive || expandedParentIds.has(node.bucket.id)

    if (!hasChildren && node.bucket.parent_id == null && node.bucket.category_id) {
      return null
    }

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
            alertHint={missedTransferHint(
              node.children.reduce(
                (sum, child) => sum + (missedByBucketId.get(child.id) ?? 0),
                0,
              ),
            )}
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
                const row = sinkingRow(child)
                return (
                <div key={child.id} className="pl-5">
                  <PlanBudgetRow
                    icon={child.icon}
                    bucket={row.bucket}
                    hint={row.hint || undefined}
                    hintAlign={row.hintAlign}
                    headlineAmount={row.headlineAmount}
                    badge={row.badge}
                    footerNote={row.footerNote}
                    footerNoteClassName={row.footerNoteClassName}
                    alertHint={missedTransferHint(
                      missedByBucketId.get(child.id) ?? 0,
                    )}
                    barClass={row.barClass}
                    mode="floor"
                    showToGo={false}
                    surfaceClassName="bg-neutral-100 dark:bg-neutral-700/70"
                    trailing={allocateTrailing(child)}
                  />
                </div>
                )
              })
            : null}
        </div>
      )
    }

    const row = sinkingRow(node.bucket)
    return (
      <div key={node.bucket.id} className="space-y-2">
        <PlanBudgetRow
          icon={node.bucket.icon}
          bucket={row.bucket}
          hint={row.hint || undefined}
          hintAlign={row.hintAlign}
          headlineAmount={row.headlineAmount}
          badge={row.badge}
          footerNote={row.footerNote}
          footerNoteClassName={row.footerNoteClassName}
          alertHint={missedTransferHint(
            missedByBucketId.get(node.bucket.id) ?? 0,
          )}
          barClass={row.barClass}
          mode="floor"
          showToGo={false}
          trailing={allocateTrailing(node.bucket)}
        />
      </div>
    )
  }

  return (
    <>
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
                  filteredSinkingNodes.length === 0 && !searchActive ? null : (
                  <div key={kind}>
                    <button
                      type="button"
                      onClick={() => {
                        if (searchActive) return
                        setAllSinkingCatsExpanded(!allSinkingCatsExpanded)
                      }}
                      aria-expanded={
                        searchActive ? true : allSinkingCatsExpanded
                      }
                      aria-label={
                        searchActive || allSinkingCatsExpanded
                          ? `Collapse all sinking categories, ${formatRupiah(sinkingAvailableTotal)}`
                          : `Expand all sinking categories, ${formatRupiah(sinkingAvailableTotal)}`
                      }
                      className="mb-2 flex w-full items-center gap-1.5 text-left"
                    >
                      <CollapseChevron
                        expanded={
                          searchActive ? true : allSinkingCatsExpanded
                        }
                        size={14}
                        className="shrink-0 text-neutral-400"
                      />
                      <p className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-neutral-800 dark:text-white">
                        {BUCKET_KIND_LABELS[kind]}
                      </p>
                      <p className="shrink-0 text-xs font-semibold tabular-nums tracking-wide text-neutral-800 dark:text-white">
                        {formatRupiah(sinkingAvailableTotal)}
                      </p>
                    </button>
                    <SearchField
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder="Search sinking funds…"
                      aria-label="Search Sinking Funds"
                      className="mb-2 min-w-0"
                    />
                    {searchActive && filteredSinkingNodes.length === 0 ? (
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
                  </div>
                  )
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
                          efOwed.total,
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
    {emergency && investment ? (
      <SinkingAllocateSheet
        open={allocateBucket != null}
        bucket={
          allocateBucket
            ? {
                id: allocateBucket.id,
                name: allocateBucket.name,
                balance: allocateBucket.balance,
                target: allocateBucket.target_amount ?? 0,
                budget_group: allocateBucket.budget_group,
              }
            : null
        }
        emergencyId={emergency.id}
        investmentId={investment.id}
        onClose={() => setAllocateBucket(null)}
        onSaved={() => void reloadBuckets()}
      />
    ) : null}
    </>
  )
}
