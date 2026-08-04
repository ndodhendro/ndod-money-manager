import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { formatRupiah } from '../../lib/format'
import { BUCKET_KIND_LABELS } from '../../lib/types'

export function PlanBuckets() {
  const {
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()
  const { buckets, loading, error } = useBuckets()

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title="Bucket Balances"
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

        {!loading && buckets.length === 0 && (
          <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            No buckets yet. Add them in Settings → Savings Buckets.
          </p>
        )}

        {!loading && buckets.length > 0 && (
          <div className="mt-4 space-y-2">
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
        )}
      </PlanSubPage>
    </div>
  )
}
