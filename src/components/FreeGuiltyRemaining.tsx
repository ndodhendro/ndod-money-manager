import { useNavigate } from 'react-router-dom'
import { PlanBudgetRow } from './PlanBudgetRow'
import type {
  BudgetTrackProgress,
  MonthBudgetProgress,
} from '../lib/freeGuiltyProgress'
import { makeMoneyPlanBucket } from '../lib/moneyPlan'
import { PlanIcon } from '../lib/planSections'

const INSET_SURFACE = 'ml-3 bg-white shadow-sm dark:bg-neutral-800'

function BudgetTrackRow({ track }: { track: BudgetTrackProgress }) {
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
    />
  )
}

/** Shared tracks (Payday detail & Plan hub). */
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

/** Plan-hub glance; header opens Payday Allocation for full detail. */
export function FreeGuiltyRemainingGlance({
  progress,
}: {
  progress: MonthBudgetProgress
}) {
  const navigate = useNavigate()

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => navigate('/rencana/payday')}
        className="mb-2 flex w-full items-center gap-2 px-0.5 text-left active:opacity-70"
        aria-label="Open Payday Allocation for budget details"
      >
        <span className="text-base leading-none" aria-hidden>
          {PlanIcon.payday}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Month Budget
        </p>
        <Chevron />
      </button>
      <FreeGuiltyRemainingBlock progress={progress} />
    </section>
  )
}

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-neutral-400"
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
