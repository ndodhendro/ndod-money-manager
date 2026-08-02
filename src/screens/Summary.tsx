import { useMemo, useState } from 'react'
import { PageTitle } from '../components/PageTitle'
import { usePyfSettings } from '../hooks/usePyfSettings'
import { useTransactions } from '../hooks/useTransactions'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  currentMonthLabel,
  currentMonthRange,
  formatRupiah,
} from '../lib/format'
import {
  buildMoneyPlan,
  budgetGroupOfTx,
  sumSavingsActuals,
  type MoneyPlanBucket,
} from '../lib/moneyPlan'
import {
  CIRCLE_BADGE_CLASS,
  CIRCLE_LABELS,
  CIRCLES,
  categoryIcon,
  isCircle,
  type Circle,
} from '../lib/types'

export function Summary() {
  const range = useMemo(() => currentMonthRange(), [])
  const { transactions, loading, error } = useTransactions(range)
  const {
    settings,
    loading: planLoading,
    error: planError,
  } = usePyfSettings()
  const [circleFilter, setCircleFilter] = useState<Circle | 'semua'>('semua')

  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        const circle = isCircle(t.circle) ? t.circle : 'hd_family'
        return circleFilter === 'semua' || circle === circleFilter
      }),
    [transactions, circleFilter],
  )

  const totalIncome = filtered
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = filtered
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const net = totalIncome - totalExpense

  const needsTotal = filtered
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'needs')
    .reduce((sum, t) => sum + t.amount, 0)
  const wantsTotal = filtered
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'wants')
    .reduce((sum, t) => sum + t.amount, 0)

  const savingsActuals = useMemo(
    () => sumSavingsActuals(filtered),
    [filtered],
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

  // Roll-up ke parent category supaya ringkasan tetap compact.
  const expenseByCategory = useMemo(() => {
    const map = new Map<
      string,
      { name: string; icon: string; total: number }
    >()
    for (const tx of filtered) {
      if (tx.type !== 'expense') continue
      const parent = tx.category?.parent
      const key = parent?.id ?? tx.category_id ?? 'lain'
      const name = parent?.name ?? tx.category?.name ?? 'Uncategorized'
      const icon = categoryIcon(tx.category)
      const existing = map.get(key)
      if (existing) {
        existing.total += tx.amount
      } else {
        map.set(key, { name, icon, total: tx.amount })
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  const spendingTotal = needsTotal + wantsTotal

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <PageTitle>Summary</PageTitle>
      <p className="text-sm text-neutral-500">{currentMonthLabel()}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(['semua', ...CIRCLES] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setCircleFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              circleFilter === f
                ? f === 'semua'
                  ? 'bg-emerald-500 text-white'
                  : CIRCLE_BADGE_CLASS[f]
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
            } ${
              circleFilter === f && f !== 'semua'
                ? 'ring-2 ring-offset-1 ring-current dark:ring-offset-neutral-950'
                : ''
            }`}
          >
            {f === 'semua' ? 'All circles' : CIRCLE_LABELS[f]}
          </button>
        ))}
      </div>

      {(loading || planLoading) && (
        <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}
      {planError && (
        <p className="mt-2 text-center text-sm text-red-500">{planError}</p>
      )}

      {!loading && !planLoading && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
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
                Money Plan
              </p>
              {totalIncome <= 0 ? (
                <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                  Log this month&apos;s income to see your pay-yourself-first
                  targets.
                </p>
              ) : (
                <div className="space-y-2">
                  <PlanRow
                    bucket={moneyPlan.emergency}
                    hint={`${settings?.emergency_fund_pct ?? 0}% of income`}
                    barClass="bg-teal-500"
                    mode="floor"
                  />
                  <PlanRow
                    bucket={moneyPlan.investment}
                    hint={`${settings?.investment_pct ?? 0}% of income`}
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

          {spendingTotal > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Needs vs Wants (spending)
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="bg-sky-500"
                  style={{
                    width: `${(needsTotal / spendingTotal) * 100}%`,
                  }}
                />
                <div
                  className="bg-amber-400"
                  style={{
                    width: `${(wantsTotal / spendingTotal) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-neutral-500">
                <span>Needs {formatRupiah(needsTotal)}</span>
                <span>Wants {formatRupiah(wantsTotal)}</span>
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Expense by Category
            </p>
            {expenseByCategory.length === 0 ? (
              <p className="text-sm text-neutral-400">No data yet.</p>
            ) : (
              <div className="space-y-2">
                {expenseByCategory.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800"
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {cat.name}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{
                            width: `${totalExpense ? (cat.total / totalExpense) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-sm font-semibold whitespace-nowrap text-neutral-700 dark:text-neutral-200">
                      {formatRupiah(cat.total)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
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
  const over = mode === 'ceiling' && bucket.actual > bucket.target && bucket.target > 0
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
          Set a planned amount in Settings
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
