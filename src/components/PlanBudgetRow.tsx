import {
  formatRupiah,
} from '../lib/format'
import type { MoneyPlanBucket } from '../lib/moneyPlan'
import type { BudgetGroup, Circle, Owner } from '../lib/types'
import { isCircle, isOwner } from '../lib/types'
import type { ReactNode } from 'react'
import { BudgetGroupBadge } from './BudgetGroupBadge'
import { CircleBadge } from './CircleBadge'
import { OwnerBadge } from './OwnerBadge'

/** Ceiling fill: green at/under 100%, red when over. */
function ceilingFillClass(displayPct: number): string {
  if (displayPct > 100) return 'bg-red-500'
  return 'bg-emerald-500'
}

/** Same hue as the ceiling fill (text variant of the bar color). */
function ceilingStatusColorClass(displayPct: number): string {
  if (displayPct > 100) return 'text-red-500'
  return 'text-emerald-500'
}

export type PlanBudgetDetailStack = {
  childIcon?: string | null
  childName?: string | null
  note?: string | null
  budgetGroup?: BudgetGroup | null
  owner?: Owner | null
  circle?: Circle | null
  isTransfer?: boolean
}

export function PlanBudgetRow({
  bucket,
  hint,
  barClass,
  mode,
  icon,
  surfaceClassName,
  leading,
  trailing,
  badge,
  showMetrics = true,
  alertHint,
  showToGo = true,
  ceilingStatusPlacement = 'below-bar',
  floorStatusPlacement = 'below-bar',
  detailStack = null,
  upcoming = 0,
  unscheduled = 0,
}: {
  bucket: MoneyPlanBucket
  hint?: ReactNode
  barClass: string
  mode: 'floor' | 'ceiling'
  icon?: string
  /** Override card background (default white / dark neutral-800). */
  surfaceClassName?: string
  /** Optional control before the icon (e.g. collapse chevron). */
  leading?: ReactNode
  /** Optional row action after the amounts (emoji-only). */
  trailing?: ReactNode
  /** Status label on the right of the remaining/to-go line. */
  badge?: { label: string; className: string } | null
  /**
   * When false, only show the title row (category header).
   * Hides amounts, hint, bar, %, to-go, and pace label.
   */
  showMetrics?: boolean
  /** Amber note (e.g. missed sinking transfers). */
  alertHint?: string | null
  /** Floor status line (“Rp X to go” / “Target reached”). Savings sinking hides this. */
  showToGo?: boolean
  /**
   * Ceiling remaining/over line: under title (hint slot) or above the % label.
   * Month Budget uses under-title; Needs vs Wants keeps above-% + separate hint.
   */
  ceilingStatusPlacement?: 'under-title' | 'below-bar'
  /**
   * Floor “Rp X to go”: under title (right-aligned) or below the bar.
   * Pay Yourself First uses under-title.
   */
  floorStatusPlacement?: 'under-title' | 'below-bar'
  /**
   * History-like vertical meta (child → note → Needs/Wants) with tight gaps.
   * When set, replaces the single hint line under the title.
   */
  detailStack?: PlanBudgetDetailStack | null
  /**
   * Tentative upcoming amount on a ceiling track (Month Budget Planned
   * Needs/Wants). Recorded used / “X left” stay actual; the lighter bar
   * segment and a second leftover line show the projection.
   */
  upcoming?: number
  /** Remaining room on non-recurring Monthly Estimate lines. */
  unscheduled?: number
}) {
  const upcomingSafe = Math.max(0, Math.round(upcoming))
  const unscheduledSafe = Math.max(0, Math.round(unscheduled))
  const projectedAdd = upcomingSafe + unscheduledSafe
  const projectedRemaining = Math.max(
    0,
    bucket.target - bucket.actual - projectedAdd,
  )
  const rawPct =
    bucket.target > 0
      ? Math.round(bucket.ratio * 100)
      : bucket.actual > 0
        ? 100
        : 0
  const actualPct =
    bucket.target > 0
      ? Math.min(100, Math.max(0, (bucket.actual / bucket.target) * 100))
      : bucket.actual > 0
        ? 100
        : 0
  const upcomingPct =
    bucket.target > 0 && upcomingSafe > 0
      ? Math.min(100 - actualPct, (upcomingSafe / bucket.target) * 100)
      : 0
  const unscheduledPct =
    bucket.target > 0 && unscheduledSafe > 0
      ? Math.min(
          100 - actualPct - upcomingPct,
          (unscheduledSafe / bucket.target) * 100,
        )
      : 0
  const hasProjectedFill = upcomingPct > 0 || unscheduledPct > 0
  /** Bar width always 0–100; % label shows actual used/progress (may exceed 100). */
  const barPct = Math.min(100, Math.max(0, rawPct))
  const displayPct = Math.max(0, rawPct)
  const ceilingOver =
    mode === 'ceiling' && bucket.actual > bucket.target && bucket.target > 0
  const floorOver =
    mode === 'floor' && bucket.actual > bucket.target && bucket.target > 0
  const fillClass =
    mode === 'ceiling' ? ceilingFillClass(displayPct) : barClass
  const ceilingStatusColor =
    mode === 'ceiling' ? ceilingStatusColorClass(displayPct) : null
  const pctLabelClass =
    ceilingStatusColor ??
    (floorOver
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-neutral-500 dark:text-neutral-400')
  const showFloorFooter =
    showMetrics && mode === 'floor' && bucket.target > 0
  const ceilingStatusText =
    mode === 'ceiling' && bucket.target > 0
      ? ceilingOver
        ? `Over by ${formatRupiah(bucket.actual - bucket.target)}`
        : `${formatRupiah(Math.max(0, bucket.remaining))} left`
      : null
  const projectedAfterLabel =
    upcomingSafe > 0 && unscheduledSafe > 0
      ? 'expected'
      : upcomingSafe > 0
        ? 'upcoming'
        : 'unscheduled'
  const projectedStatusText =
    mode === 'ceiling' &&
    projectedAdd > 0 &&
    bucket.target > 0 &&
    !ceilingOver
      ? `${formatRupiah(projectedRemaining)} left after ${projectedAfterLabel}`
      : null
  const primaryCeilingStatusText = projectedStatusText ?? ceilingStatusText
  const secondaryCeilingStatusText = projectedStatusText
    ? ceilingStatusText
    : null
  const overTarget = Math.max(0, Math.round(bucket.actual - bucket.target))
  const toGo = Math.max(0, Math.round(bucket.target - bucket.actual))
  const floorStatusText =
    mode === 'floor' && bucket.target > 0
      ? floorOver
        ? `Over target ${formatRupiah(overTarget)}`
        : toGo > 0
          ? showToGo
            ? `${formatRupiah(toGo)} to go`
            : null
          : showToGo
            ? 'Target reached'
            : null
      : null
  const floorStatusUnderTitle =
    showMetrics &&
    mode === 'floor' &&
    floorStatusPlacement === 'under-title' &&
    floorStatusText != null
  const useDetailStack = detailStack != null
  const ceilingStatusUnderTitle =
    !useDetailStack &&
    showMetrics &&
    mode === 'ceiling' &&
    ceilingStatusPlacement === 'under-title' &&
    ceilingStatusText != null
  const upcomingLabel =
    upcomingSafe > 0 ? `Upcoming ${formatRupiah(upcomingSafe)}` : null
  const unscheduledLabel =
    unscheduledSafe > 0
      ? `Unscheduled ${formatRupiah(unscheduledSafe)}`
      : null
  const splitProjectionRows = upcomingLabel != null && unscheduledLabel != null
  const hintUnderTitle =
    !useDetailStack &&
    showMetrics &&
    !splitProjectionRows &&
    (hint || upcomingLabel || unscheduledLabel)
      ? (hint ?? upcomingLabel ?? unscheduledLabel)
      : null
  const showUnderTitleRow =
    ceilingStatusUnderTitle ||
    hintUnderTitle != null ||
    floorStatusUnderTitle
  const showCeilingBelowBar =
    !useDetailStack &&
    showMetrics &&
    mode === 'ceiling' &&
    bucket.target > 0 &&
    ceilingStatusPlacement === 'below-bar' &&
    ceilingStatusText != null
  const showCeilingOnGroupRow =
    useDetailStack &&
    showMetrics &&
    mode === 'ceiling' &&
    bucket.target > 0 &&
    ceilingStatusText != null

  const floorFooterText =
    floorStatusPlacement === 'below-bar' ? floorStatusText : null
  const showFloorFooterRow =
    showFloorFooter && (floorFooterText != null || badge)

  const amountNode = showMetrics ? (
    <p className="shrink-0 text-right text-xs leading-none text-neutral-500">
      <span className="font-semibold text-neutral-700 dark:text-neutral-200">
        {formatRupiah(bucket.actual)}
      </span>
      {bucket.target > 0 && <span> / {formatRupiah(bucket.target)}</span>}
    </p>
  ) : (
    <p className="shrink-0 text-right text-xs font-semibold leading-none text-neutral-700 dark:text-neutral-200">
      {formatRupiah(bucket.actual)}
    </p>
  )

  const stackChild = detailStack?.childName?.trim() || null
  const stackNote = detailStack?.note?.trim() || null
  const stackGroup = detailStack?.budgetGroup ?? null
  const stackOwner = isOwner(detailStack?.owner) ? detailStack.owner : 'suami'
  const stackCircle = isCircle(detailStack?.circle)
    ? detailStack.circle
    : 'hd_family'
  const stackIsTransfer = detailStack?.isTransfer ?? false

  return (
    <div
      className={`rounded-xl px-3 py-2.5 shadow-sm ${
        surfaceClassName ?? 'bg-white dark:bg-neutral-800'
      }`}
    >
      <div className="flex items-start gap-2">
        {leading}
        {icon != null && (
          <span className="text-xl leading-none" aria-hidden>
            {icon}
          </span>
        )}
        {useDetailStack ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              <p className="truncate text-xs font-semibold leading-none text-neutral-800 dark:text-white">
                {bucket.label}
              </p>
              {amountNode}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              {stackChild ? (
                <p className="flex min-w-0 items-center gap-1 text-xs leading-none text-neutral-400">
                  {detailStack?.childIcon ? (
                    <span className="shrink-0" aria-hidden>
                      {detailStack.childIcon}
                    </span>
                  ) : null}
                  <span className="truncate">{stackChild}</span>
                </p>
              ) : stackIsTransfer ? (
                <p className="truncate text-xs leading-none text-neutral-400">
                  Transfer
                </p>
              ) : (
                <span className="invisible truncate text-xs leading-none">
                  .
                </span>
              )}
              <OwnerBadge owner={stackOwner} size="inline" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              {stackNote ? (
                <p className="truncate text-xs leading-none text-neutral-500 dark:text-neutral-400">
                  {stackNote}
                </p>
              ) : (
                <span className="invisible truncate text-xs leading-none">
                  .
                </span>
              )}
              {!stackIsTransfer ? (
                <CircleBadge circle={stackCircle} size="inline" />
              ) : (
                <span className="invisible text-xs leading-none">.</span>
              )}
            </div>
            {stackGroup || showCeilingOnGroupRow ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                {stackGroup ? (
                  <p className="truncate text-left text-xs leading-none">
                    <BudgetGroupBadge group={stackGroup} />
                  </p>
                ) : (
                  <span className="invisible truncate text-xs leading-none">
                    .
                  </span>
                )}
                {showCeilingOnGroupRow ? (
                  <p
                    className={`shrink-0 text-right text-xs font-semibold tabular-nums whitespace-nowrap ${ceilingStatusColor}`}
                  >
                    {ceilingStatusText}
                  </p>
                ) : null}
              </div>
            ) : null}
            {alertHint ? (
              <p className="text-[11px] font-medium leading-none text-amber-700 dark:text-amber-300">
                {alertHint}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  {bucket.label}
                </p>
              </div>
              {amountNode}
            </div>
            {splitProjectionRows && ceilingStatusUnderTitle ? (
              <div className="mt-0.5 space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-[11px] text-neutral-400">
                    {upcomingLabel}
                  </p>
                  {ceilingOver ? (
                    <p
                      className={`shrink-0 text-right text-[11px] font-semibold tabular-nums ${ceilingStatusColor}`}
                    >
                      {ceilingStatusText}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-[11px] text-neutral-400">
                    {unscheduledLabel}
                  </p>
                  {projectedStatusText ? (
                    <p className="shrink-0 text-right text-[11px] tabular-nums text-neutral-400">
                      {projectedStatusText}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : showUnderTitleRow ? (
              <div className="mt-0.5 space-y-0.5">
                <div
                  className={`flex items-baseline gap-2 ${
                    hintUnderTitle &&
                    (ceilingStatusUnderTitle || floorStatusUnderTitle)
                      ? 'justify-between'
                      : ceilingStatusUnderTitle || floorStatusUnderTitle
                        ? 'justify-end'
                        : ''
                  }`}
                >
                  {hintUnderTitle ? (
                    <div className="min-w-0 text-[11px] text-neutral-400">
                      {hintUnderTitle}
                    </div>
                  ) : null}
                  {ceilingStatusUnderTitle ? (
                    <p
                      className={`shrink-0 text-right tabular-nums ${
                        projectedStatusText
                          ? 'text-[11px] text-neutral-400'
                          : `text-xs font-semibold ${ceilingStatusColor}`
                      }`}
                    >
                      {primaryCeilingStatusText}
                    </p>
                  ) : null}
                  {floorStatusUnderTitle ? (
                    <p
                      className={`shrink-0 text-right text-[11px] tabular-nums ${
                        floorOver
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-neutral-400'
                      }`}
                    >
                      {floorStatusText}
                    </p>
                  ) : null}
                </div>
                {ceilingStatusUnderTitle &&
                secondaryCeilingStatusText &&
                !projectedStatusText ? (
                  <p
                    className={`text-right text-[11px] font-semibold tabular-nums ${ceilingStatusColor}`}
                  >
                    {secondaryCeilingStatusText}
                  </p>
                ) : null}
              </div>
            ) : null}
            {alertHint ? (
              <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {alertHint}
              </p>
            ) : null}
          </div>
        )}
        {trailing}
      </div>
      {showMetrics && bucket.target > 0 ? (
        <div className="mt-2">
          {showCeilingBelowBar ? (
            <div className="mb-0.5 space-y-0.5">
              <p
                className={`text-right tabular-nums ${
                  projectedStatusText
                    ? 'text-[11px] text-neutral-400'
                    : `text-xs font-semibold ${ceilingStatusColor}`
                }`}
              >
                {primaryCeilingStatusText}
              </p>
              {secondaryCeilingStatusText && !projectedStatusText ? (
                <p
                  className={`text-right text-[11px] font-semibold tabular-nums ${ceilingStatusColor}`}
                >
                  {secondaryCeilingStatusText}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
              {hasProjectedFill ? (
                <div className="flex h-full w-full">
                  {actualPct > 0 ? (
                    <div
                      className={`h-full shrink-0 ${fillClass}`}
                      style={{ width: `${actualPct}%` }}
                    />
                  ) : null}
                  {upcomingPct > 0 ? (
                    <div
                      className={`h-full shrink-0 ${fillClass} opacity-40`}
                      style={{ width: `${upcomingPct}%` }}
                    />
                  ) : null}
                  {unscheduledPct > 0 ? (
                    <div
                      className={`h-full shrink-0 ${fillClass} opacity-25`}
                      style={{ width: `${unscheduledPct}%` }}
                    />
                  ) : null}
                </div>
              ) : (
                <div
                  className={`h-full rounded-full ${fillClass}`}
                  style={{ width: `${barPct}%` }}
                />
              )}
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
        </div>
      ) : null}
      {showFloorFooterRow ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <p
            className={`min-w-0 text-[11px] ${
              floorOver
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-neutral-400'
            }`}
          >
            {floorFooterText}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {badge ? (
              <span
                className={`text-[11px] font-semibold ${badge.className}`}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
