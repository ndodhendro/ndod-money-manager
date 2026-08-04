import { useMemo } from 'react'
import { MonthPager } from '../../components/MonthPager'
import { PlanBudgetRow } from '../../components/PlanBudgetRow'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { useTransactions } from '../../hooks/useTransactions'
import {
  buildMoneyPlan,
  budgetGroupOfTx,
} from '../../lib/moneyPlan'
import { PlanIcon } from '../../lib/planSections'

export function PlanNeedsWants() {
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

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const needsTotal = transactions
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'needs')
    .reduce((sum, t) => sum + t.amount, 0)
  const wantsTotal = transactions
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'wants')
    .reduce((sum, t) => sum + t.amount, 0)

  const moneyPlan = useMemo(() => {
    if (!settings) return null
    return buildMoneyPlan({
      income: totalIncome,
      emergencyPct: settings.emergency_fund_pct,
      investmentPct: settings.investment_pct,
      plannedNeeds: settings.planned_needs_amount,
      needsActual: needsTotal,
      wantsActual: wantsTotal,
      emergencyActual: 0,
      investmentActual: 0,
    })
  }, [settings, totalIncome, needsTotal, wantsTotal])

  const pageLoading = loading || planLoading
  const hasSplit = needsTotal > 0 || wantsTotal > 0

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title="Needs vs Wants"
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

        {!pageLoading && !moneyPlan && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Set planned needs in Settings → Money Plan to see targets.
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
              barClass="bg-sky-500"
              mode="floor"
            />
            <PlanBudgetRow
              bucket={moneyPlan.wants}
              hint="Leftover after savings & needs"
              barClass="bg-amber-400"
              mode="ceiling"
            />
            {moneyPlan.wantsWarning && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Wants spending is at{' '}
                {Math.round(moneyPlan.wants.ratio * 100)}% of this month&apos;s
                budget.
              </p>
            )}
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
