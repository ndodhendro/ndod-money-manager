import { PlanBudgetAmount } from './PlanBudgetRow'
import {
  BUDGET_USED_SOURCE_LABELS,
  budgetUsedGrandTotal,
  budgetUsedGroupTotal,
  budgetUsedSinkingTotal,
  budgetUsedSpendGroupTotal,
  budgetUsedSpendTotal,
  type BudgetUsedBySource,
} from '../lib/estimateProgress'
import { formatRupiah } from '../lib/format'
import {
  BUDGET_GROUP_BAR_CLASS,
  BUDGET_GROUP_LABELS,
  BUDGET_GROUP_TEXT_CLASS,
  type BudgetGroup,
} from '../lib/types'

function AmountRow({
  label,
  actual,
  tone = 'muted',
  className = '',
}: {
  label: string
  actual: number
  tone?: 'emphasis' | 'muted'
  className?: string
}) {
  return (
    <li className={`flex items-center justify-between gap-2 ${className}`.trim()}>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <PlanBudgetAmount actual={actual} tone={tone} />
    </li>
  )
}

function GroupCard({
  group,
  source,
}: {
  group: BudgetGroup
  source: BudgetUsedBySource
}) {
  const total = budgetUsedGroupTotal(source, group)
  const spend = budgetUsedSpendGroupTotal(source, group)
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold tracking-wide ${BUDGET_GROUP_TEXT_CLASS[group]}`}
        >
          {BUDGET_GROUP_LABELS[group]}
        </p>
        <PlanBudgetAmount actual={total} tone="emphasis" />
      </div>
      <ul className="space-y-1.5">
        <AmountRow
          label={BUDGET_USED_SOURCE_LABELS.estimates}
          actual={source.estimates[group]}
        />
        <AmountRow
          label={BUDGET_USED_SOURCE_LABELS.unplanned}
          actual={source.unplanned[group]}
        />
        <AmountRow
          label={BUDGET_USED_SOURCE_LABELS.spend}
          actual={spend}
          tone="emphasis"
          className="border-t border-neutral-200 pt-1.5 dark:border-neutral-700"
        />
        <AmountRow
          label={BUDGET_USED_SOURCE_LABELS.sinking}
          actual={source.sinking[group]}
        />
      </ul>
    </div>
  )
}

/** Monthly Progress headline: Month Budget used, split Needs/Wants × source. */
export function BudgetUsedSummary({
  source,
}: {
  source: BudgetUsedBySource
}) {
  const used = budgetUsedGrandTotal(source)
  const spend = budgetUsedSpendTotal(source)
  const sinking = budgetUsedSinkingTotal(source)
  const needs = budgetUsedGroupTotal(source, 'needs')
  const wants = budgetUsedGroupTotal(source, 'wants')
  const needsPct = used > 0 ? (needs / used) * 100 : 0
  const wantsPct = used > 0 ? (wants / used) * 100 : 0

  return (
    <section aria-label="Budget Used">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Budget Used
        </p>
        <p className="text-sm font-semibold text-neutral-800 dark:text-white">
          {formatRupiah(used)}
        </p>
      </div>
      <div
        className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
        aria-hidden
      >
        <div
          className={`h-full ${BUDGET_GROUP_BAR_CLASS.needs}`}
          style={{ width: `${needsPct}%` }}
        />
        <div
          className={`h-full ${BUDGET_GROUP_BAR_CLASS.wants}`}
          style={{ width: `${wantsPct}%` }}
        />
      </div>
      <ul className="mb-3 space-y-1">
        <AmountRow
          label={BUDGET_USED_SOURCE_LABELS.spend}
          actual={spend}
          tone="emphasis"
        />
        <AmountRow
          label={BUDGET_USED_SOURCE_LABELS.sinking}
          actual={sinking}
        />
      </ul>
      <div className="space-y-2">
        <GroupCard group="needs" source={source} />
        <GroupCard group="wants" source={source} />
      </div>
    </section>
  )
}
