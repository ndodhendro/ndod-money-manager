import {
  formatRupiah,
} from '../lib/format'
import type { MoneyPlanBucket } from '../lib/moneyPlan'

export function PlanBudgetRow({
  bucket,
  hint,
  barClass,
  mode,
  icon,
}: {
  bucket: MoneyPlanBucket
  hint: string
  barClass: string
  mode: 'floor' | 'ceiling'
  icon?: string
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
      <div className="flex items-start gap-2">
        {icon != null && (
          <span className="mt-0.5 text-xl leading-none" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
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
        </div>
      </div>
      {bucket.target > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
          <div
            className={`h-full rounded-full ${fillClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : bucket.actual <= 0 ? (
        <p className="mt-1 text-[11px] text-neutral-400">
          Transfer into this bucket to track progress
        </p>
      ) : null}
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
