import {
  effectiveAmount,
  estimateOccurrenceCount,
  type RecurringBill,
  type RecurringBillMonthOverride,
} from './recurringBillsApi'
import {
  buildMoneyPlan,
  budgetGroupOfTx,
  resolveEstimateAmount,
  type ResolveEstimateAmountCtx,
} from './moneyPlan'
import {
  monthCursorKey,
  shiftMonthCursor,
  type MonthCursor,
} from './monthCursor'
import type {
  BudgetGroup,
  Bucket,
  Category,
  TransactionWithCategory,
} from './types'

/** Minimal bucket fields for Needs/Wants transfer classification. */
export type BucketBudgetRef = Pick<Bucket, 'kind' | 'budget_group'>

/**
 * Needs/Wants for a transfer into a sinking fund.
 * Emergency/investment (and unset sinking) return null.
 */
export function budgetGroupOfTransferTo(
  toBucketId: string | null,
  bucketsById: Map<string, BucketBudgetRef>,
): 'needs' | 'wants' | null {
  if (!toBucketId) return null
  const bucket = bucketsById.get(toBucketId)
  if (!bucket || bucket.kind !== 'sinking') return null
  if (bucket.budget_group === 'needs' || bucket.budget_group === 'wants') {
    return bucket.budget_group
  }
  return null
}

/**
 * Schedule allowed in Planned Needs (avoids double-count with sinking funds).
 * - Non-recurring estimates
 * - Weekly / every 2 weeks
 * - Monthly (every 1 month)
 * Multi-month recurring expenses (2m, 6m, yearly, …) are excluded — those
 * are funded via Needs sinking-fund transfers instead.
 * Transfers always pass (caller still requires Needs sinking destination).
 */
export function isPlannedNeedsSchedule(bill: RecurringBill): boolean {
  if (bill.type === 'transfer') return true
  if (bill.type !== 'expense') return false
  if (!bill.is_recurring) return true
  if (bill.interval_unit === 'week') {
    return bill.interval_months === 1 || bill.interval_months === 2
  }
  return bill.interval_months <= 1
}

/** YYYY-MM-DD of the Monday that starts the week containing `isoDate`. */
export function mondayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // JS: 0=Sun … 6=Sat → days since Monday
  const day = date.getDay()
  const sinceMonday = day === 0 ? 6 : day - 1
  date.setDate(date.getDate() - sinceMonday)
  return toIsoDate(date)
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Month that funds this Mon–Sun week (month containing the Monday). */
export function fundingMonthOfWeek(weekMonday: string): MonthCursor {
  const [y, m] = weekMonday.split('-').map(Number)
  return { year: y, month: m - 1 }
}

/** Mondays whose date falls inside the calendar month (one full share each). */
export function listMonthFundedWeekMondays(cursor: MonthCursor): string[] {
  const ym = monthCursorKey(cursor)
  const first = `${ym}-01`
  const lastDay = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const last = `${ym}-${String(lastDay).padStart(2, '0')}`
  const mondays: string[] = []
  let monday = mondayOf(first)
  // Walk until past month end; keep Mondays that fall inside the month.
  while (monday <= last) {
    if (monday >= first && monday <= last) mondays.push(monday)
    monday = addDaysIso(monday, 7)
  }
  return mondays
}

/** Inclusive chain of week Mondays from `fromMonday` through `toMonday`. */
export function iterWeekMondays(
  fromMonday: string,
  toMonday: string,
): string[] {
  if (fromMonday > toMonday) return []
  const out: string[] = []
  let cur = fromMonday
  while (cur <= toMonday) {
    out.push(cur)
    cur = addDaysIso(cur, 7)
  }
  return out
}

export function budgetGroupOfCategory(
  categoryId: string | null,
  byId: Map<string, Category>,
): BudgetGroup | null {
  if (!categoryId) return null
  const cat = byId.get(categoryId)
  if (!cat) return null
  if (cat.budget_group) return cat.budget_group
  if (cat.parent_id) {
    const parent = byId.get(cat.parent_id)
    return parent?.budget_group ?? null
  }
  return null
}

/**
 * Needs/Wants (or Savings) for a Monthly Estimate row:
 * expense → category budget group; transfer → destination sinking fund.
 */
export function budgetGroupOfEstimate(
  bill: Pick<RecurringBill, 'type' | 'category_id' | 'to_bucket_id'>,
  categoriesById: Map<string, Category>,
  bucketsById?: Map<string, BucketBudgetRef>,
): BudgetGroup | null {
  if (bill.type === 'expense') {
    return budgetGroupOfCategory(bill.category_id, categoriesById)
  }
  if (bill.type === 'transfer' && bucketsById) {
    return budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById)
  }
  return null
}

/** Row tag for Settings Monthly Estimates sort order. */
export type EstimatePlanTag =
  | 'emergency'
  | 'investment'
  | 'needs'
  | 'wants'

/** Sort: Emergency → Investment → Needs → Wants → other. */
export function estimatePlanTagSortRank(tag: EstimatePlanTag | null): number {
  if (tag === 'emergency') return 0
  if (tag === 'investment') return 1
  if (tag === 'needs') return 2
  if (tag === 'wants') return 3
  return 4
}

/**
 * Visible badge group: Emergency / Investment show as Needs;
 * Needs / Wants keep their own labels.
 */
export function estimatePlanBadgeGroup(
  tag: EstimatePlanTag | null,
): BudgetGroup | null {
  if (!tag) return null
  if (tag === 'wants') return 'wants'
  return 'needs'
}

/**
 * Tag for Settings Monthly Estimates list sorting.
 * Transfer → destination bucket kind / sinking budget group;
 * expense → category Needs/Wants.
 */
export function estimatePlanTag(
  bill: Pick<RecurringBill, 'type' | 'category_id' | 'to_bucket_id'>,
  categoriesById: Map<string, Category>,
  bucketsById?: Map<string, BucketBudgetRef>,
): EstimatePlanTag | null {
  if (bill.type === 'transfer' && bucketsById && bill.to_bucket_id) {
    const bucket = bucketsById.get(bill.to_bucket_id)
    if (!bucket) return null
    if (bucket.kind === 'emergency') return 'emergency'
    if (bucket.kind === 'investment') return 'investment'
    if (bucket.kind === 'sinking') {
      if (bucket.budget_group === 'needs' || bucket.budget_group === 'wants') {
        return bucket.budget_group
      }
    }
    return null
  }
  if (bill.type === 'expense') {
    return budgetGroupOfCategory(bill.category_id, categoriesById)
  }
  return null
}

export function sumCommittedWants(
  bills: RecurringBill[],
  overridesByBillId: Map<string, RecurringBillMonthOverride>,
  categoriesById: Map<string, Category>,
  yearMonth: string,
  skippedOccurrenceKeys?: Set<string>,
  bucketsById?: Map<string, BucketBudgetRef>,
): number {
  let sum = 0
  for (const bill of bills) {
    if (!bill.is_active) continue
    let matches = false
    if (bill.type === 'expense') {
      matches =
        budgetGroupOfCategory(bill.category_id, categoriesById) === 'wants'
    } else if (bill.type === 'transfer' && bucketsById) {
      matches =
        budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById) === 'wants'
    }
    if (!matches) continue
    const override = overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      yearMonth,
      override,
      skippedOccurrenceKeys,
    )
    if (count === 0) continue
    sum += effectiveAmount(bill, override) * count
  }
  return sum
}

/**
 * Planned needs for a YYYY-MM from Monthly Estimates only:
 * - Needs expense: non-recurring, or recurring weekly / every 2 weeks / monthly
 * - Needs transfer into a sinking fund tagged Needs (any schedule)
 *
 * Multi-month recurring Needs expenses (every 2+ months) are excluded —
 * those are covered by sinking-fund transfer estimates.
 * Amount × occurrence count in the month (weekly/biweekly = due dates in month).
 * Income, Wants, and PYF (emergency/investment) transfers are excluded
 * (those are handled via Money Plan % separately).
 */
export function sumPlannedNeeds(
  bills: RecurringBill[],
  overridesByBillId: Map<string, RecurringBillMonthOverride>,
  categoriesById: Map<string, Category>,
  yearMonth: string,
  skippedOccurrenceKeys?: Set<string>,
  bucketsById?: Map<string, BucketBudgetRef>,
): number {
  let sum = 0
  for (const bill of bills) {
    if (!bill.is_active) continue
    if (!isPlannedNeedsSchedule(bill)) continue
    let matches = false
    if (bill.type === 'expense') {
      matches =
        budgetGroupOfCategory(bill.category_id, categoriesById) === 'needs'
    } else if (bill.type === 'transfer' && bucketsById) {
      matches =
        budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById) === 'needs'
    }
    if (!matches) continue
    const override = overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      yearMonth,
      override,
      skippedOccurrenceKeys,
    )
    if (count === 0) continue
    sum += effectiveAmount(bill, override) * count
  }
  return sum
}

/** Actual transfers into sinking funds tagged Needs or Wants. */
export function sumTransferActualsByBudgetGroup(
  transactions: TransactionWithCategory[],
  bucketsById: Map<string, BucketBudgetRef>,
  group: 'needs' | 'wants',
): number {
  let sum = 0
  for (const tx of transactions) {
    if (tx.type !== 'transfer' || tx.complete_later) continue
    if (budgetGroupOfTransferTo(tx.to_bucket_id, bucketsById) !== group) {
      continue
    }
    sum += tx.amount
  }
  return sum
}

export type EstimateMonthTotals = {
  expense: number
  income: number
  transfer: number
}

/** Monthly estimate totals by transaction type (occurrence-weighted). */
export function sumEstimateTotalsByType(
  bills: RecurringBill[],
  overridesByBillId: Map<string, RecurringBillMonthOverride>,
  yearMonth: string,
  skippedOccurrenceKeys?: Set<string>,
  amountCtx?: ResolveEstimateAmountCtx,
): EstimateMonthTotals {
  const totals: EstimateMonthTotals = {
    expense: 0,
    income: 0,
    transfer: 0,
  }
  for (const bill of bills) {
    if (!bill.is_active) continue
    const override = overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      yearMonth,
      override,
      skippedOccurrenceKeys,
    )
    if (count === 0) continue
    const unit = amountCtx
      ? resolveEstimateAmount(bill, override, amountCtx)
      : effectiveAmount(bill, override)
    const amount = unit * count
    if (bill.type === 'expense') totals.expense += amount
    else if (bill.type === 'income') totals.income += amount
    else totals.transfer += amount
  }
  return totals
}

export function isFreeWantsExpense(tx: TransactionWithCategory): boolean {
  if (tx.type !== 'expense') return false
  if (tx.complete_later) return false
  if (tx.is_recurring) return false
  return budgetGroupOfTx(tx) === 'wants'
}

export function wantsBudgetForMonth(
  income: number,
  emergencyPct: number,
  investmentPct: number,
  plannedNeeds: number,
): number {
  return buildMoneyPlan({
    income,
    emergencyPct,
    investmentPct,
    plannedNeeds,
    needsActual: 0,
    wantsActual: 0,
    emergencyActual: 0,
    investmentActual: 0,
  }).wantsBudget
}

export interface FreeWantsWeek {
  weekMonday: string
  weekSunday: string
  fundingYearMonth: string
  base: number
  carryIn: number
  available: number
  spent: number
  carryOut: number
}

export interface FreeWantsMonthSummary {
  yearMonth: string
  wantsBudget: number
  committed: number
  freeBudget: number
  freeSpent: number
  /** Carry into the first week funded by this month (may be from prior month). */
  carryIntoMonth: number
  /** Week to highlight for the pager month. */
  focusWeek: FreeWantsWeek | null
  weeks: FreeWantsWeek[]
}

export interface BuildFreeWantsPaceInput {
  /** Months from lookback start through viewed month (inclusive), oldest first. */
  months: MonthCursor[]
  /** Income totals keyed by YYYY-MM. */
  incomeByMonth: Map<string, number>
  /** Committed wants keyed by YYYY-MM. */
  committedByMonth: Map<string, number>
  freeSpendTxs: TransactionWithCategory[]
  emergencyPct: number
  investmentPct: number
  plannedNeeds: number
  /** Month the UI is viewing. */
  viewMonth: MonthCursor
  /** Today YYYY-MM-DD — used when viewMonth is current. */
  today: string
}

function spentInWeek(
  txs: TransactionWithCategory[],
  weekMonday: string,
  weekSunday: string,
): number {
  let sum = 0
  for (const tx of txs) {
    if (!isFreeWantsExpense(tx)) continue
    if (tx.occurred_on < weekMonday || tx.occurred_on > weekSunday) continue
    sum += tx.amount
  }
  return sum
}

/**
 * Continuous Mon–Sun free-wants pace with surplus/deficit carry across weeks
 * and months. Opening carry at the first week is 0.
 */
export function buildFreeWantsPace(
  input: BuildFreeWantsPaceInput,
): FreeWantsMonthSummary | null {
  const { months } = input
  if (months.length === 0) return null

  const freeBudgetByMonth = new Map<string, number>()
  const weekCountByMonth = new Map<string, number>()
  const baseByMonday = new Map<string, number>()

  for (const cursor of months) {
    const ym = monthCursorKey(cursor)
    const income = input.incomeByMonth.get(ym) ?? 0
    const wantsBudget = wantsBudgetForMonth(
      income,
      input.emergencyPct,
      input.investmentPct,
      input.plannedNeeds,
    )
    const committed = input.committedByMonth.get(ym) ?? 0
    const freeBudget = Math.max(0, wantsBudget - committed)
    freeBudgetByMonth.set(ym, freeBudget)

    const mondays = listMonthFundedWeekMondays(cursor)
    weekCountByMonth.set(ym, mondays.length)
    const n = mondays.length
    const base = n > 0 ? freeBudget / n : 0
    for (const monday of mondays) {
      baseByMonday.set(monday, base)
    }
  }

  const firstCursor = months[0]
  const lastCursor = months[months.length - 1]
  const firstYm = monthCursorKey(firstCursor)
  const lastYm = monthCursorKey(lastCursor)
  const firstMonday = listMonthFundedWeekMondays(firstCursor)[0]
    ?? mondayOf(`${firstYm}-01`)
  const lastMonthMondays = listMonthFundedWeekMondays(lastCursor)
  const lastMonday =
    lastMonthMondays[lastMonthMondays.length - 1]
    ?? mondayOf(`${lastYm}-28`)

  // Also include any week that has free spend before first funded Monday.
  let chainStart = firstMonday
  for (const tx of input.freeSpendTxs) {
    if (!isFreeWantsExpense(tx)) continue
    const m = mondayOf(tx.occurred_on)
    if (m < chainStart) chainStart = m
  }

  const weekMondays = iterWeekMondays(chainStart, lastMonday)
  const weeks: FreeWantsWeek[] = []
  let carry = 0

  for (const weekMonday of weekMondays) {
    const weekSunday = addDaysIso(weekMonday, 6)
    const funding = fundingMonthOfWeek(weekMonday)
    const fundingYearMonth = monthCursorKey(funding)
    const base = baseByMonday.get(weekMonday) ?? 0
    const carryIn = carry
    const available = base + carryIn
    const spent = spentInWeek(input.freeSpendTxs, weekMonday, weekSunday)
    const carryOut = available - spent
    weeks.push({
      weekMonday,
      weekSunday,
      fundingYearMonth,
      base,
      carryIn,
      available,
      spent,
      carryOut,
    })
    carry = carryOut
  }

  const viewYm = monthCursorKey(input.viewMonth)
  const viewWeeks = weeks.filter((w) => w.fundingYearMonth === viewYm)
  const income = input.incomeByMonth.get(viewYm) ?? 0
  const wantsBudget = wantsBudgetForMonth(
    income,
    input.emergencyPct,
    input.investmentPct,
    input.plannedNeeds,
  )
  const committed = input.committedByMonth.get(viewYm) ?? 0
  const freeBudget = freeBudgetByMonth.get(viewYm) ?? 0
  // Free spend in view month can also fall on a week funded by prior month
  // (Sun still in view month but Monday previous). Count all free spend in month.
  let freeSpentInCalendarMonth = 0
  const monthStart = `${viewYm}-01`
  const lastDay = new Date(
    input.viewMonth.year,
    input.viewMonth.month + 1,
    0,
  ).getDate()
  const monthEnd = `${viewYm}-${String(lastDay).padStart(2, '0')}`
  for (const tx of input.freeSpendTxs) {
    if (!isFreeWantsExpense(tx)) continue
    if (tx.occurred_on < monthStart || tx.occurred_on > monthEnd) continue
    freeSpentInCalendarMonth += tx.amount
  }

  const carryIntoMonth =
    viewWeeks.length > 0 ? viewWeeks[0].carryIn : 0

  const isViewCurrent =
    monthCursorKey(input.viewMonth) ===
    monthCursorKey({
      year: Number(input.today.slice(0, 4)),
      month: Number(input.today.slice(5, 7)) - 1,
    })

  let focusWeek: FreeWantsWeek | null = null
  if (isViewCurrent) {
    const todayMonday = mondayOf(input.today)
    focusWeek =
      weeks.find((w) => w.weekMonday === todayMonday)
      ?? viewWeeks[viewWeeks.length - 1]
      ?? null
  } else {
    focusWeek = viewWeeks[viewWeeks.length - 1] ?? null
  }

  return {
    yearMonth: viewYm,
    wantsBudget,
    committed,
    freeBudget,
    freeSpent: freeSpentInCalendarMonth,
    carryIntoMonth,
    focusWeek,
    weeks: viewWeeks,
  }
}

/** Lookback start: 24 months before `cursor`, oldest first through `cursor`. */
export function freeWantsLookbackMonths(cursor: MonthCursor): MonthCursor[] {
  const months: MonthCursor[] = []
  for (let i = 24; i >= 0; i--) {
    months.push(shiftMonthCursor(cursor, -i))
  }
  return months
}

/** Group overrides by year_month → bill_id. */
export function groupOverridesByMonth(
  overrides: RecurringBillMonthOverride[],
): Map<string, Map<string, RecurringBillMonthOverride>> {
  const byMonth = new Map<string, Map<string, RecurringBillMonthOverride>>()
  for (const o of overrides) {
    let byBill = byMonth.get(o.year_month)
    if (!byBill) {
      byBill = new Map()
      byMonth.set(o.year_month, byBill)
    }
    byBill.set(o.bill_id, o)
  }
  return byMonth
}
