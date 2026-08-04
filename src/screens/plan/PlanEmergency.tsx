import { useMemo } from 'react'
import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { formatRupiah } from '../../lib/format'
import { emergencyFundTarget } from '../../lib/moneyPlan'

export function PlanEmergency() {
  const {
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()
  const {
    settings,
    loading: planLoading,
    error: planError,
  } = usePyfSettings()
  const {
    emergency,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets()

  const efGoal = useMemo(() => {
    if (!settings || !emergency) return null
    const target = emergencyFundTarget(
      settings.planned_needs_amount,
      settings.emergency_fund_target_multiplier,
    )
    const balance = emergency.balance
    const ratio = target > 0 ? balance / target : 0
    return { target, balance, ratio, funded: target > 0 && balance >= target }
  }, [settings, emergency])

  const pageLoading = planLoading || bucketsLoading

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title="Emergency Fund Goal"
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
        {planError && (
          <p className="mt-4 text-center text-sm text-red-500">{planError}</p>
        )}
        {bucketsError && (
          <p className="mt-2 text-center text-sm text-red-500">{bucketsError}</p>
        )}

        {!pageLoading && (!efGoal || efGoal.target <= 0) && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            Set planned needs and emergency target multiplier in Settings → Money
            Plan.
          </p>
        )}

        {!pageLoading && efGoal && efGoal.target > 0 && (
          <div className="mt-4 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {settings?.emergency_fund_target_multiplier ?? 3}× needs
              </p>
              <p className="text-xs text-neutral-500">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {formatRupiah(efGoal.balance)}
                </span>
                {' / '}
                {formatRupiah(efGoal.target)}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
              <div
                className={`h-full rounded-full ${efGoal.funded ? 'bg-teal-500' : 'bg-teal-400'}`}
                style={{
                  width: `${Math.min(100, Math.round(efGoal.ratio * 100))}%`,
                }}
              />
            </div>
            {efGoal.funded ? (
              <p className="mt-1 text-[11px] text-teal-700 dark:text-teal-300">
                Target reached — consider lowering the monthly emergency %.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-neutral-400">
                {formatRupiah(Math.max(0, efGoal.target - efGoal.balance))} to
                go
              </p>
            )}
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
