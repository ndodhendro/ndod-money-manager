import { useEffect, useMemo, useState } from 'react'
import { CollapsibleDayGroup } from '../../components/CollapsibleDayGroup'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { groupBucketsByKind } from '../../lib/bucketsGroup'
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
  BUCKET_KIND_LABELS,
  type BucketKind,
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
): { bucket: MoneyPlanBucket; hint: string } {
  const isSystemEmergency = emergencyId != null && b.id === emergencyId
  if (isSystemEmergency && efTarget > 0) {
    const row = makeMoneyPlanBucket(b.name, efTarget, b.balance, 'floor')
    return {
      bucket: row,
      hint: `${efMultiplier}× planned needs`,
    }
  }
  if (b.kind === 'investment') {
    return {
      bucket: makeMoneyPlanBucket(b.name, 0, b.balance, 'floor'),
      hint: 'Funded from monthly investment %',
    }
  }
  const target = b.target_amount ?? 0
  return {
    bucket: makeMoneyPlanBucket(b.name, target, b.balance, 'floor'),
    hint: target > 0 ? 'Balance vs target' : 'No overall target set',
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
  const [kindGroupsVersion, setKindGroupsVersion] = useState(0)
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
  const groupedBuckets = useMemo(() => groupBucketsByKind(buckets), [buckets])
  const pageLoading = planLoading || bucketsLoading || billsLoading || categoriesLoading

  const systemEmergencyFunded =
    emergency != null && efTarget > 0 && emergency.balance >= efTarget

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
              setKindGroupsVersion((v) => v + 1)
            }}
          >
            <div className="space-y-5">
              {groupedBuckets.map(([kind, items]) => (
                <CollapsibleDayGroup
                  key={kind}
                  title={BUCKET_KIND_LABELS[kind]}
                  persistKey={`plan:goals:kind:${kind}`}
                  forceOpen={
                    kindGroupsVersion > 0 ? kindGroupsExpanded : undefined
                  }
                  forceVersion={kindGroupsVersion}
                >
                  <div className="space-y-2">
                    {items.map((b) => {
                      const { bucket, hint } = overallRowForBucket(
                        b,
                        emergency?.id ?? null,
                        efTarget,
                        efMultiplier,
                      )
                      const isSystemEmergency =
                        emergency != null && b.id === emergency.id
                      return (
                        <div key={b.id}>
                          <PlanBudgetRow
                            icon={b.icon}
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
                </CollapsibleDayGroup>
              ))}
            </div>
          </GroupedListFrame>
        </div>
      )}
    </PlanSubPage>
  )
}
