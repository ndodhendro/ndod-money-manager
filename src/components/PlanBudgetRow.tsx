import {
  formatRupiah,
} from '../lib/format'
import type { MoneyPlanBucket } from '../lib/moneyPlan'
import type { ReactNode } from 'react'

/** Red (0%) → yellow (50%) → green (100%) for savings progress. */
function progressHeatColor(pct: number): string {
  const t = Math.min(100, Math.max(0, pct)) / 100
  return `hsl(${Math.round(t * 120)} 72% 42%)`
}

export function PlanBudgetRow({
  bucket,
  hint,
  barClass,
  mode,
  icon,
  surfaceClassName,
  leading,
}: {
  bucket: MoneyPlanBucket
  hint?: string
  barClass: string
  mode: 'floor' | 'ceiling'
  icon?: string
  /** Override card background (default white / dark neutral-800). */
  surfaceClassName?: string
  /** Optional control before the icon (e.g. collapse chevron). */
  leading?: ReactNode
}) {
  const pct =
    bucket.target > 0
      ? Math.min(100, Math.round(bucket.ratio * 100))
      : bucket.actual > 0
        ? 100
        : 0
  const over =
    mode === 'ceiling' && bucket.actual > bucket.target && bucket.target > 0
  const useHeat = mode === 'floor'
  const heatColor = progressHeatColor(pct)
  const fillClass = over ? 'bg-red-500' : useHeat ? undefined : barClass
  const fillStyle = useHeat
    ? { width: `${pct}%`, backgroundColor: heatColor }
    : { width: `${pct}%` }

  return (
    <div
      className={`rounded-xl px-3 py-2.5 shadow-sm ${
        surfaceClassName ?? 'bg-white dark:bg-neutral-800'
      }`}
    >
      <div className="flex items-start gap-2">
        {leading}
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
              {hint ? (
                <p className="text-[11px] text-neutral-400">{hint}</p>
              ) : null}
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
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div
              className={`h-full rounded-full ${fillClass ?? ''}`}
              style={fillStyle}
            />
          </div>
          <span
            className={`shrink-0 text-[11px] font-semibold tabular-nums ${
              over
                ? 'text-red-600 dark:text-red-400'
                : useHeat
                  ? ''
                  : 'text-neutral-500 dark:text-neutral-400'
            }`}
            style={useHeat && !over ? { color: heatColor } : undefined}
            aria-label={`${pct}% progress`}
          >
            {pct}%
          </span>
        </div>
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
