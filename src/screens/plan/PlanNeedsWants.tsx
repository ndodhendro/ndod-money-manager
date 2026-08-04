import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useTransactions } from '../../hooks/useTransactions'
import { formatRupiah } from '../../lib/format'
import { budgetGroupOfTx } from '../../lib/moneyPlan'

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

  const needsTotal = transactions
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'needs')
    .reduce((sum, t) => sum + t.amount, 0)
  const wantsTotal = transactions
    .filter((t) => t.type === 'expense' && budgetGroupOfTx(t) === 'wants')
    .reduce((sum, t) => sum + t.amount, 0)
  const hasSplit = needsTotal > 0 || wantsTotal > 0

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title="Needs vs Wants"
        description=""
      >
        <MonthPager
          monthLabel={monthLabel}
          canGoNext={canGoNext}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
        />

        {loading && (
          <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-red-500">{error}</p>
        )}

        {!loading && !hasSplit && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            No needs/wants spending logged this month yet.
          </p>
        )}

        {!loading && hasSplit && (
          <div className="mt-4">
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
      </PlanSubPage>
    </div>
  )
}
