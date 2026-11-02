import {
  monthBudgetFlexibleTrackDemandByTxId,
  type EstimateBucketRef,
} from './estimateProgress'
import {
  unplannedNeedsTransactionIds,
  unplannedWantsTransactionIds,
} from './freeGuiltyProgress'
import type {
  RecurringBill,
  RecurringBillMonthOverride,
} from './recurringBillsApi'
import type { Category, TransactionWithCategory } from './types'

/** Needs feeds Planned Needs + Buffer; Wants feeds Planned Wants + Guilt-Free. */
export type MonthBudgetDetailGroup = 'needs' | 'wants'

/**
 * `upcoming` / `unscheduled` list estimate lines (projections, no transaction
 * yet). `planned-overspend` / `unplanned-overspend` list transactions.
 */
export type MonthBudgetDetailKind =
  | 'upcoming'
  | 'unscheduled'
  | 'planned-overspend'
  | 'unplanned-overspend'

export const MONTH_BUDGET_DETAIL_BASE_PATH = '/rencana/month-budget'

export const MONTH_BUDGET_DETAIL_ROUTE = `${MONTH_BUDGET_DETAIL_BASE_PATH}/:group/:kind`

export function monthBudgetDetailPath(
  group: MonthBudgetDetailGroup,
  kind: MonthBudgetDetailKind,
): string {
  return `${MONTH_BUDGET_DETAIL_BASE_PATH}/${group}/${kind}`
}

export function isMonthBudgetDetailGroup(
  value: string | undefined,
): value is MonthBudgetDetailGroup {
  return value === 'needs' || value === 'wants'
}

export function isMonthBudgetDetailKind(
  value: string | undefined,
): value is MonthBudgetDetailKind {
  return (
    value === 'upcoming' ||
    value === 'unscheduled' ||
    value === 'planned-overspend' ||
    value === 'unplanned-overspend'
  )
}

const GROUP_LABEL: Record<MonthBudgetDetailGroup, string> = {
  needs: 'Needs',
  wants: 'Wants',
}

/** Title Case page title and row label, e.g. "Planned Needs Overspend". */
export function monthBudgetDetailTitle(
  group: MonthBudgetDetailGroup,
  kind: MonthBudgetDetailKind,
): string {
  const label = GROUP_LABEL[group]
  switch (kind) {
    case 'upcoming':
      return `Planned ${label} Upcoming`
    case 'unscheduled':
      return `Planned ${label} Unscheduled`
    case 'planned-overspend':
      return `Planned ${label} Overspend`
    case 'unplanned-overspend':
      return `Unplanned ${label} Overspend`
  }
}

export function monthBudgetDetailIcon(kind: MonthBudgetDetailKind): string {
  switch (kind) {
    case 'upcoming':
      return '📆'
    case 'unscheduled':
      return '🗓️'
    case 'planned-overspend':
    case 'unplanned-overspend':
      return '⚠️'
  }
}

export function monthBudgetDetailDescription(
  group: MonthBudgetDetailGroup,
  kind: MonthBudgetDetailKind,
): string {
  const label = GROUP_LABEL[group]
  const track = group === 'needs' ? 'Buffer' : 'Guilt-Free Fund'
  switch (kind) {
    case 'upcoming':
      return `Unchecked future ${label} estimates that still fit on Planned ${label}.`
    case 'unscheduled':
      return `Remaining room on ${label} estimates without a due date.`
    case 'planned-overspend':
      return `Amounts above the estimate on Planned ${label} lines, charged to ${track}.`
    case 'unplanned-overspend':
      return `${label} spending outside any estimate, charged to ${track}.`
  }
}

/**
 * Amount each transaction adds to Month Budget Buffer (Needs) or Guilt-Free
 * Fund (Wants), split by source. Sums match the Overspend rows on Money Plan:
 * - planned: only the part of a transaction above its estimate line
 *   (planned is consumed oldest-first).
 * - unplanned: the full amount of spend outside estimates.
 */
export function monthBudgetOverspendAmountByTxId(input: {
  group: MonthBudgetDetailGroup
  kind: 'planned-overspend' | 'unplanned-overspend'
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, EstimateBucketRef>
  yearMonth: string
  transactions: TransactionWithCategory[]
  checkingBucketIds: Set<string>
  estimateCoverageKeys: Set<string>
  dueBillIdByTxId?: Map<string, string>
}): Map<string, number> {
  if (input.kind === 'planned-overspend') {
    const { bufferByTxId, guiltFreeByTxId } =
      monthBudgetFlexibleTrackDemandByTxId({
        bills: input.bills,
        overridesByBillId: input.overridesByBillId,
        skippedOccurrenceKeys: input.skippedOccurrenceKeys,
        categoriesById: input.categoriesById,
        bucketsById: input.bucketsById,
        yearMonth: input.yearMonth,
        transactions: input.transactions,
        checkingBucketIds: input.checkingBucketIds,
        dueBillIdByTxId: input.dueBillIdByTxId,
      })
    return input.group === 'needs' ? bufferByTxId : guiltFreeByTxId
  }

  const unplannedInput = {
    transactions: input.transactions,
    estimateCoverageKeys: input.estimateCoverageKeys,
    checkingBucketIds: input.checkingBucketIds,
    dueBillIdByTxId: input.dueBillIdByTxId,
    bucketsById: input.bucketsById,
    categoriesById: input.categoriesById,
  }
  const ids =
    input.group === 'needs'
      ? unplannedNeedsTransactionIds(unplannedInput)
      : unplannedWantsTransactionIds(unplannedInput)
  const amountById = new Map<string, number>()
  for (const tx of input.transactions) {
    if (ids.has(tx.id)) amountById.set(tx.id, tx.amount)
  }
  return amountById
}
