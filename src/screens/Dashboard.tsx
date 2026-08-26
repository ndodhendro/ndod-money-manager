import { useMemo, useState } from 'react'
import { CircleFilterChips } from '../components/CircleFilterChips'
import { MonthPager } from '../components/MonthPager'
import { PageTitle } from '../components/PageTitle'
import { NavIcon } from '../lib/navTabs'
import {
  chartColorAt,
  DonutChart,
  HorizontalBars,
  type ChartSlice,
} from '../components/SimpleCharts'
import { useMonthCursor } from '../hooks/useMonthCursor'
import { useTransactions } from '../hooks/useTransactions'
import { useEfOwed } from '../hooks/useEfOwed'
import { useBuckets } from '../hooks/useBuckets'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatRupiah,
} from '../lib/format'
import { budgetGroupOfTx } from '../lib/moneyPlan'
import {
  BUDGET_GROUP_COLOR,
  categoryIcon,
  isCircle,
  type Circle,
} from '../lib/types'

export function Dashboard() {
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
  const { owed: efOwed } = useEfOwed()
  const { emergency } = useBuckets()
  const [circleFilter, setCircleFilter] = useState<Circle | 'semua'>('semua')

  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        if (t.complete_later) return false
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

  const categorySlices: ChartSlice[] = useMemo(() => {
    const top = expenseByCategory.slice(0, 7)
    const rest = expenseByCategory.slice(7)
    const restTotal = rest.reduce((s, c) => s + c.total, 0)
    const slices = top.map((c, i) => ({
      key: c.name,
      label: c.name,
      value: c.total,
      color: chartColorAt(i),
      icon: c.icon,
    }))
    if (restTotal > 0) {
      slices.push({
        key: 'other',
        label: 'Other',
        value: restTotal,
        color: chartColorAt(7),
        icon: '📦',
      })
    }
    return slices
  }, [expenseByCategory])

  const needsWantsSlices: ChartSlice[] = useMemo(
    () =>
      [
        {
          key: 'needs',
          label: 'Needs',
          value: needsTotal,
          color: BUDGET_GROUP_COLOR.needs,
        },
        {
          key: 'wants',
          label: 'Wants',
          value: wantsTotal,
          color: BUDGET_GROUP_COLOR.wants,
        },
      ].filter((s) => s.value > 0),
    [needsTotal, wantsTotal],
  )

  const topBars = categorySlices.slice(0, 5)

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle
        icon={NavIcon.dashboard}
        description="See where your money went."
      >
        Dashboard
      </PageTitle>
      <MonthPager
        monthLabel={monthLabel}
        canGoNext={canGoNext}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
      />

      <CircleFilterChips value={circleFilter} onChange={setCircleFilter} />

      {loading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}

      {!loading && (
        <>
          {efOwed.total > 0 && (
            <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Owed to Emergency Fund
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-amber-950 dark:text-amber-50">
                {formatRupiah(efOwed.total)}
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Buffer {formatRupiah(efOwed.buffer)} · Guilt-Free{' '}
                {formatRupiah(efOwed.guiltFree)}
                {efOwed.sinkingFund > 0
                  ? ` · Sinking ${formatRupiah(efOwed.sinkingFund)}`
                  : ''}
              </p>
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                Available{' '}
                {formatRupiah(
                  Math.max(
                    0,
                    Math.round(emergency?.balance ?? 0) - efOwed.total,
                  ),
                )}{' '}
                of Emergency Fund cash
              </p>
            </section>
          )}

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

          <section className="mt-6 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
            <p className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Expense by Category
            </p>
            <DonutChart
              slices={categorySlices}
              centerLabel="Spent"
              centerSub={formatRupiah(totalExpense)}
            />
          </section>

          {needsWantsSlices.length > 0 && (
            <section className="mt-4 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
              <p className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Spending Split
              </p>
              <DonutChart slices={needsWantsSlices} />
            </section>
          )}

          <section className="mt-4 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
            <p className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Top Categories
            </p>
            <HorizontalBars slices={topBars} />
          </section>
        </>
      )}
    </div>
  )
}
