import { useMemo, useState } from 'react'
import { CollapsibleDayGroup } from '../../components/CollapsibleDayGroup'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { groupBucketsByKind } from '../../lib/bucketsGroup'
import {
  emergencyFundTarget,
  makeMoneyPlanBucket,
  type MoneyPlanBucket,
} from '../../lib/moneyPlan'
import { PlanIcon } from '../../lib/planSections'
import {
  BUCKET_KIND_LABELS,
  type BucketKind,
  type BucketWithBalance,
} from '../../lib/types'

const KIND_BAR: Record<BucketKind, string> = {
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
    emergency,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets()

  const [kindGroupsExpanded, setKindGroupsExpanded] = useState(true)
  const [kindGroupsVersion, setKindGroupsVersion] = useState(0)

  const efTarget = useMemo(() => {
    if (!settings) return 0
    return emergencyFundTarget(
      settings.planned_needs_amount,
      settings.emergency_fund_target_multiplier,
    )
  }, [settings])

  const efMultiplier = settings?.emergency_fund_target_multiplier ?? 3
  const groupedBuckets = useMemo(() => groupBucketsByKind(buckets), [buckets])
  const pageLoading = planLoading || bucketsLoading

  const systemEmergencyFunded =
    emergency != null && efTarget > 0 && emergency.balance >= efTarget

  return (
    <PlanSubPage
      title="Savings Goals"
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
            Set planned needs and emergency multiplier in Settings → Money Plan
            for the emergency overall target.
          </p>
        )}

      {!pageLoading && buckets.length > 0 && (
        <div className="mt-4">
          <GroupedListFrame
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
