import { useMemo } from 'react'
import { DueThisMonthChecklist } from '../components/DueThisMonthChecklist'
import { MonthPager } from '../components/MonthPager'
import { PageTitle } from '../components/PageTitle'
import { useBuckets } from '../hooks/useBuckets'
import { useMonthCursor } from '../hooks/useMonthCursor'
import { usePyfSettings } from '../hooks/usePyfSettings'
import { useRecurringBills } from '../hooks/useRecurringBills'
import { useTransactions } from '../hooks/useTransactions'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatRupiah,
} from '../lib/format'
import { monthCursorKey } from '../lib/monthCursor'
import {
  buildMoneyPlan,
  budgetGroupOfTx,
  emergencyFundTarget,
  sumSavingsActuals,
  type MoneyPlanBucket,
} from '../lib/moneyPlan'
import { BUCKET_KIND_LABELS } from '../lib/types'

export function MoneyPlanScreen() {
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
  const { transactions, loading, error, reload: reloadTx } =
    useTransactions(range)
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
  const yearMonth = monthCursorKey(cursor)
  const {
    bills,
    logByBillId,
    loading: billsLoading,
    available: billsAvailable,
    reload: reloadBills,
  } = useRecurringBills(yearMonth)

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const net = totalIncome - totalExpense

  const needsTotal = transactions
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'needs')
    .reduce((sum, t) => sum + t.amount, 0)
  const wantsTotal = transactions
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'wants')
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
      needsActual: needsTotal,
      wantsActual: wantsTotal,
      emergencyActual: savingsActuals.emergency,
      investmentActual: savingsActuals.investment,
    })
  }, [settings, totalIncome, needsTotal, wantsTotal, savingsActuals])

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

  const pageLoading = loading || planLoading || bucketsLoading

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle>Money Plan</PageTitle>
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
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}
      {planError && (
        <p className="mt-2 text-center text-sm text-red-500">{planError}</p>
      )}
      {bucketsError && (
        <p className="mt-2 text-center text-sm text-red-500">{bucketsError}</p>
      )}

      {!pageLoading && (
        <>
          <DueThisMonthChecklist
            cursor={cursor}
            bills={bills}
            logByBillId={logByBillId}
            loading={billsLoading}
            available={billsAvailable}
            onChanged={() => {
              void reloadBills()
              void reloadTx()
            }}
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <p className="text-xs text-neutral-400">Income</p>
              <p className={`mt-1 text-base font-semibold ${AMOUNT_IN_CLASS}`}>
                {formatRupiah(totalIncome)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <p className="text-xs text-neutral-400">Expense</p>
              <p className={`mt-1 text-base font-semibold ${AMOUNT_OUT_CLASS}`}>
                {formatRupiah(totalExpense)}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-neutral-900 p-3 text-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-300">Net</p>
            <p
              className={`mt-1 text-lg font-semibold ${amountToneClass(net >= 0)}`}
            >
              {net < 0 ? '-' : '+'}
              {formatRupiah(Math.abs(net))}
            </p>
          </div>

          {moneyPlan && (
            <section className="mt-6">
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Pay yourself first
              </p>
              {totalIncome <= 0 ? (
                <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                  Log this month&apos;s income to see targets. Fund buckets with
                  Transfer.
                </p>
              ) : (
                <div className="space-y-2">
                  <PlanRow
                    bucket={moneyPlan.emergency}
                    hint={`${settings?.emergency_fund_pct ?? 0}% · via Transfer`}
                    barClass="bg-teal-500"
                    mode="floor"
                  />
                  <PlanRow
                    bucket={moneyPlan.investment}
                    hint={`${settings?.investment_pct ?? 0}% · via Transfer`}
                    barClass="bg-indigo-500"
                    mode="floor"
                  />
                  <PlanRow
                    bucket={moneyPlan.needs}
                    hint="Planned essentials"
                    barClass="bg-sky-500"
                    mode="floor"
                  />
                  <PlanRow
                    bucket={moneyPlan.wants}
                    hint="Leftover after savings & needs"
                    barClass="bg-amber-400"
                    mode="ceiling"
                  />
                  {moneyPlan.wantsWarning && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Wants spending is at{' '}
                      {Math.round(moneyPlan.wants.ratio * 100)}% of this
                      month&apos;s budget.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {efGoal && efGoal.target > 0 && (
            <section className="mt-6">
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Emergency fund goal
              </p>
              <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800">
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
                    {formatRupiah(Math.max(0, efGoal.target - efGoal.balance))}{' '}
                    to go
                  </p>
                )}
              </div>
            </section>
          )}

          {buckets.length > 0 && (
            <section className="mt-6">
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Bucket balances
              </p>
              <div className="space-y-2">
                {buckets.map((b) => {
                  const target = b.target_amount ?? 0
                  const pct =
                    target > 0
                      ? Math.min(100, Math.round((b.balance / target) * 100))
                      : 0
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{b.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                            {b.name}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            {BUCKET_KIND_LABELS[b.kind]}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                          {formatRupiah(b.balance)}
                        </p>
                      </div>
                      {target > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {(needsTotal > 0 || wantsTotal > 0) && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Needs vs Wants (spending)
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="bg-sky-500"
                  style={{
                    width: `${
                      needsTotal + wantsTotal
                        ? (needsTotal / (needsTotal + wantsTotal)) * 100
                        : 0
                    }%`,
                  }}
                />
                <div
                  className="bg-amber-400"
                  style={{
                    width: `${
                      needsTotal + wantsTotal
                        ? (wantsTotal / (needsTotal + wantsTotal)) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-neutral-500">
                <span>Needs {formatRupiah(needsTotal)}</span>
                <span>Wants {formatRupiah(wantsTotal)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PlanRow({
  bucket,
  hint,
  barClass,
  mode,
}: {
  bucket: MoneyPlanBucket
  hint: string
  barClass: string
  mode: 'floor' | 'ceiling'
}) {
  const pct =
    bucket.target > 0
      ? Math.min(100, Math.round(bucket.ratio * 100))
      : bucket.actual > 0
        ? 100
        : 0
  const over =
    mode === 'ceiling' && bucket.actual > bucket.target && bucket.target > 0
  const fillClass = over ? 'bg-red-500' : barClass

  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {bucket.label}
          </p>
          <p className="text-[11px] text-neutral-400">{hint}</p>
        </div>
        <p className="shrink-0 text-right text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">
            {formatRupiah(bucket.actual)}
          </span>
          {bucket.target > 0 && (
            <span> / {formatRupiah(bucket.target)}</span>
          )}
        </p>
      </div>
      {bucket.target > 0 || bucket.actual > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
          <div
            className={`h-full rounded-full ${fillClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-neutral-400">
          Transfer into this bucket to track progress
        </p>
      )}
      {mode === 'ceiling' && bucket.target > 0 && (
        <p className="mt-1 text-[11px] text-neutral-400">
          {over
            ? `Over by ${formatRupiah(bucket.actual - bucket.target)}`
            : `${formatRupiah(Math.max(0, bucket.remaining))} left`}
        </p>
      )}
      {mode === 'floor' && bucket.target > 0 && bucket.remaining > 0 && (
        <p className="mt-1 text-[11px] text-neutral-400">
          {formatRupiah(bucket.remaining)} to go
        </p>
      )}
    </div>
  )
}
