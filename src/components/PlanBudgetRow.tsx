import {
  formatRupiah,
} from '../lib/format'
import type { MoneyPlanBucket } from '../lib/moneyPlan'
import type { ReactNode } from 'react'

export type PlanBudgetPaceMeta = {
  expected: number
  monthsElapsed: number
  monthsTotal: number
  deltaText: string
  deltaClassName: string
}

/** Ceiling fill: accent while safe, amber near limit, red when over. */
function ceilingFillClass(
  barPct: number,
  over: boolean,
  barClass: string,
): string {
  if (over) return 'bg-red-500'
  if (barPct >= 80) return 'bg-amber-500'
  return barClass
}

function monthsLeftLabel(monthsLeft: number): string {
  const n = Math.max(0, Math.round(monthsLeft))
  return n === 1 ? '1 month left' : `${n} months left`
}

export function PlanBudgetRow({
  bucket,
  hint,
  barClass,
  mode,
  icon,
  surfaceClassName,
  leading,
  badge,
  showMetrics = true,
  paceMeta,
  ceilingStatusPlacement = 'below-bar',
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
  /** Status label on the right of the remaining/to-go line. */
  badge?: { label: string; className: string } | null
  /**
   * When false, only show the title row (category header).
   * Hides amounts, hint, bar, %, to-go, and pace label.
   */
  showMetrics?: boolean
  /** Sinking pace: expected + over/under vs expected. */
  paceMeta?: PlanBudgetPaceMeta | null
  /**
   * Ceiling remaining/over line: under title (hint slot) or below the bar.
   * Month Budget uses under-title; Needs vs Wants keeps below-bar + separate hint.
   */
  ceilingStatusPlacement?: 'under-title' | 'below-bar'
}) {
  const rawPct =
    bucket.target > 0
      ? Math.round(bucket.ratio * 100)
      : bucket.actual > 0
        ? 100
        : 0
  /** Bar width always 0–100; % label shows actual used/progress (may exceed 100). */
  const barPct = Math.min(100, Math.max(0, rawPct))
  const displayPct = Math.max(0, rawPct)
  const ceilingOver =
    mode === 'ceiling' && bucket.actual > bucket.target && bucket.target > 0
  const floorOver =
    mode === 'floor' && bucket.actual > bucket.target && bucket.target > 0
  const fillClass =
    mode === 'ceiling'
      ? ceilingFillClass(barPct, ceilingOver, barClass)
      : barClass
  const pctLabelClass = ceilingOver
    ? 'text-red-600 dark:text-red-400'
    : floorOver
      ? 'text-emerald-600 dark:text-emerald-400'
      : mode === 'ceiling' && barPct >= 80
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-neutral-500 dark:text-neutral-400'
  const showFloorFooter =
    showMetrics && mode === 'floor' && bucket.target > 0
  const ceilingStatusText =
    mode === 'ceiling' && bucket.target > 0
      ? ceilingOver
        ? `Over by ${formatRupiah(bucket.actual - bucket.target)}`
        : `${formatRupiah(Math.max(0, bucket.remaining))} left`
      : null
  const underTitleLine =
    showMetrics && paceMeta
      ? null
      : showMetrics &&
          mode === 'ceiling' &&
          ceilingStatusPlacement === 'under-title' &&
          ceilingStatusText
        ? ceilingStatusText
        : showMetrics && hint
          ? hint
          : null
  const showCeilingBelowBar =
    showMetrics &&
    mode === 'ceiling' &&
    bucket.target > 0 &&
    ceilingStatusPlacement === 'below-bar' &&
    ceilingStatusText != null

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
            </div>
            {showMetrics ? (
              <p className="shrink-0 text-right text-xs text-neutral-500">
                <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                  {formatRupiah(bucket.actual)}
                </span>
                {bucket.target > 0 && (
                  <span> / {formatRupiah(bucket.target)}</span>
                )}
              </p>
            ) : (
              <p className="shrink-0 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                {formatRupiah(bucket.actual)}
              </p>
            )}
          </div>
          {showMetrics && paceMeta ? (
            <div className="mt-0.5 space-y-0.5">
              <div className="flex items-baseline justify-between gap-2 text-[11px] text-neutral-400">
                <span className="min-w-0 truncate">
                  Expected {formatRupiah(paceMeta.expected)}
                </span>
                <span className="shrink-0 tabular-nums">
                  {paceMeta.monthsElapsed}/{paceMeta.monthsTotal} months
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span
                  className={`min-w-0 truncate ${paceMeta.deltaClassName}`}
                >
                  {paceMeta.deltaText}
                </span>
                <span className="shrink-0 text-neutral-400 tabular-nums">
                  {monthsLeftLabel(
                    paceMeta.monthsTotal - paceMeta.monthsElapsed,
                  )}
                </span>
              </div>
            </div>
          ) : underTitleLine ? (
            <p
              className={`mt-0.5 text-[11px] text-neutral-400 ${
                mode === 'ceiling' &&
                ceilingStatusPlacement === 'under-title'
                  ? 'text-right tabular-nums'
                  : ''
              }`}
            >
              {underTitleLine}
            </p>
          ) : null}
        </div>
      </div>
      {showMetrics && bucket.target > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div
              className={`h-full rounded-full ${fillClass}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <span
            className={`shrink-0 text-[11px] font-semibold tabular-nums ${pctLabelClass}`}
            aria-label={
              mode === 'ceiling'
                ? `${displayPct}% used`
                : `${displayPct}% progress`
            }
          >
            {mode === 'ceiling' ? `${displayPct}% used` : `${displayPct}%`}
          </span>
        </div>
      ) : null}
      {showCeilingBelowBar ? (
        <p className="mt-1 text-[11px] text-neutral-400">{ceilingStatusText}</p>
      ) : null}
      {showFloorFooter ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] text-neutral-400">
            {bucket.remaining > 0
              ? `${formatRupiah(bucket.remaining)} to go`
              : 'Target reached'}
          </p>
          {badge ? (
            <span
              className={`shrink-0 text-[11px] font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
