import { useMemo, useState } from 'react'
import { CollapsibleDayGroup } from '../../components/CollapsibleDayGroup'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { MonthPager } from '../../components/MonthPager'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { useTransactions } from '../../hooks/useTransactions'
import { groupBucketsByKind } from '../../lib/bucketsGroup'
import { formatRupiah } from '../../lib/format'
import {
  buildMoneyPlan,
  makeMoneyPlanBucket,
  sumSavingsActuals,
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

function monthInflowByBucketId(
  transactions: Array<{
    type: string
    amount: number
    to_bucket_id?: string | null
  }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of transactions) {
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
    emergency,
    investment,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets()

  const [kindGroupsExpanded, setKindGroupsExpanded] = useState(true)
  const [kindGroupsVersion, setKindGroupsVersion] = useState(0)

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const savingsActuals = useMemo(
    () =>
      sumSavingsActuals(
        transactions,
        emergency?.id ?? null,
        investment?.id ?? null,
      ),
    [transactions, emergency?.id, investment?.id],
  )

  const moneyPlan = useMemo(() => {
    if (!settings) return null
    return buildMoneyPlan({
      income: totalIncome,
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      plannedNeeds: settings.planned_needs_amount,
      needsActual: 0,
      wantsActual: 0,
      emergencyActual: savingsActuals.emergency,
      investmentActual: savingsActuals.investment,
    })
  }, [settings, totalIncome, savingsActuals])

  const groupedBuckets = useMemo(() => groupBucketsByKind(buckets), [buckets])
  const inflowsByBucket = useMemo(
    () => monthInflowByBucketId(transactions),
    [transactions],
  )

  const pageLoading = loading || planLoading || bucketsLoading

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title="Pay Yourself First"
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
                    persistKey={`plan:pyf:kind:${kind}`}
                    forceOpen={
                      kindGroupsVersion > 0 ? kindGroupsExpanded : undefined
                    }
                    forceVersion={kindGroupsVersion}
                  >
                    <div className="space-y-2">
                      {items.map((b) => {
                        const isPyfSystem =
                          (kind === 'emergency' && b.id === emergency?.id) ||
                          (kind === 'investment' && b.id === investment?.id)
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
                          inflowsByBucket.get(b.id) ?? 0,
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
                ))}
              </div>
            </GroupedListFrame>
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
