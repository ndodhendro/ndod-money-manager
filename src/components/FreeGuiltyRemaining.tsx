import { PlanBudgetRow } from './PlanBudgetRow'
import {
  BUDGET_TRACK_LABELS,
  EMPTY_MONTH_BUDGET_PROGRESS,
  type BudgetTrackProgress,
  type MonthBudgetProgress,
} from '../lib/freeGuiltyProgress'
import { makeMoneyPlanBucket } from '../lib/moneyPlan'
import {
  monthBudgetDetailPath,
  monthBudgetDetailTitle,
  type MonthBudgetDetailGroup,
} from '../lib/monthBudgetDetail'

const INSET_SURFACE = 'ml-3 bg-white shadow-sm dark:bg-neutral-800'

function isPlannedProjectionTrack(track: BudgetTrackProgress): boolean {
  return (
    track.label === BUDGET_TRACK_LABELS.plannedNeeds ||
    track.label === BUDGET_TRACK_LABELS.plannedWants
  )
}

/** Planned Needs and Buffer use Needs; Planned Wants and Guilt-Free Fund use Wants. */
function trackGroup(track: BudgetTrackProgress): MonthBudgetDetailGroup {
  return track.label === BUDGET_TRACK_LABELS.buffer ||
    track.label === BUDGET_TRACK_LABELS.plannedNeeds
    ? 'needs'
    : 'wants'
}

function overspendDetailRows(
  track: BudgetTrackProgress,
  overspend: { planned: number; unplanned: number },
): { label: string; amount: number; to: string }[] {
  const group = trackGroup(track)
  return [
    {
      label: monthBudgetDetailTitle(group, 'planned-overspend'),
      amount: overspend.planned,
      to: monthBudgetDetailPath(group, 'planned-overspend'),
    },
    {
      label: monthBudgetDetailTitle(group, 'unplanned-overspend'),
      amount: overspend.unplanned,
      to: monthBudgetDetailPath(group, 'unplanned-overspend'),
    },
  ]
}

function BudgetTrackRow({ track }: { track: BudgetTrackProgress }) {
  const showProjectionSlots = isPlannedProjectionTrack(track)
  const upcoming = track.upcoming > 0 ? track.upcoming : 0
  const unscheduled = track.unscheduled > 0 ? track.unscheduled : 0
  const detailRows = track.overspend
    ? overspendDetailRows(track, track.overspend)
    : undefined
  return (
    <PlanBudgetRow
      bucket={makeMoneyPlanBucket(
        track.label,
        track.allowance,
        track.used,
        'ceiling',
      )}
      barClass={track.barClass}
      mode="ceiling"
      ceilingStatusPlacement="under-title"
      surfaceClassName={track.emphasize ? INSET_SURFACE : undefined}
      upcoming={upcoming}
      unscheduled={unscheduled}
      showZeroTarget
      alwaysShowProjection={showProjectionSlots}
      detailRows={detailRows}
      upcomingTo={
        showProjectionSlots
          ? monthBudgetDetailPath(trackGroup(track), 'upcoming')
          : undefined
      }
      unscheduledTo={
        showProjectionSlots
          ? monthBudgetDetailPath(trackGroup(track), 'unscheduled')
          : undefined
      }
    />
  )
}

/** Shared tracks on the Plan hub. */
export function FreeGuiltyRemainingBlock({
  progress,
}: {
  progress: MonthBudgetProgress
}) {
  return (
    <div className="space-y-2">
      <BudgetTrackRow track={progress.plannedNeeds} />
      <BudgetTrackRow track={progress.buffer} />
      <BudgetTrackRow track={progress.plannedWants} />
      <BudgetTrackRow track={progress.guiltFree} />
    </div>
  )
}

/** Plan-hub glance. Always rendered so Track Progress does not jump. */
export function FreeGuiltyRemainingGlance({
  progress,
}: {
  progress: MonthBudgetProgress | null
}) {
  return (
    <section className="mt-6" aria-busy={progress == null}>
      <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
        Month Budget
      </p>
      <FreeGuiltyRemainingBlock
        progress={progress ?? EMPTY_MONTH_BUDGET_PROGRESS}
      />
    </section>
  )
}
