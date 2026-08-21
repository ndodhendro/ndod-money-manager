import { PlanBudgetRow } from './PlanBudgetRow'
import type {
  BudgetTrackProgress,
  MonthBudgetProgress,
} from '../lib/freeGuiltyProgress'
import { makeMoneyPlanBucket } from '../lib/moneyPlan'

const INSET_SURFACE = 'ml-3 bg-white shadow-sm dark:bg-neutral-800'

function BudgetTrackRow({ track }: { track: BudgetTrackProgress }) {
  const upcoming = track.upcoming > 0 ? track.upcoming : 0
  const unscheduled = track.unscheduled > 0 ? track.unscheduled : 0
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

/** Plan-hub glance. */
export function FreeGuiltyRemainingGlance({
  progress,
}: {
  progress: MonthBudgetProgress
}) {
  return (
    <section className="mt-6">
      <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
        Month Budget
      </p>
      <FreeGuiltyRemainingBlock progress={progress} />
    </section>
  )
}
