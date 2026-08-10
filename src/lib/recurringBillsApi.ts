import {
  addDaysIso,
  cursorFromYearMonth,
  daysBetweenIso,
  lastDayOfYearMonth,
  recurringOccurredOn,
  yearMonthFromIso,
  type MonthCursor,
} from './monthCursor'
import { notifyRecurringBillsChanged } from './recurringBillsEvents'
import { supabase } from './supabase'
import { isOwner, type Circle, type Owner, type TransactionType } from './types'

export type RecurringIntervalUnit = 'week' | 'month'

export interface RecurringBill {
  id: string
  name: string
  amount: number
  type: TransactionType
  category_id: string | null
  from_bucket_id: string | null
  to_bucket_id: string | null
  circle: Circle
  owner: Owner
  due_day: number
  /** month = every N months; week = every N weeks (N in interval_months). */
  interval_unit: RecurringIntervalUnit
  /**
   * Every N: months 1–12 or 24–120 (years); weeks 1 or 2.
   * Grid for months anchored on starts_year_month; weeks on starts_on.
   */
  interval_months: number
  /** First YYYY-MM on checklist; null = no lower bound */
  starts_year_month: string | null
  /** Last YYYY-MM on checklist; null = ongoing */
  ends_year_month: string | null
  /** First due / weekly grid anchor (required when interval_unit = week). */
  starts_on: string | null
  /**
   * When true, amount may differ each cycle — Plan checklist confirms
   * amount before check and shows a gold highlight while unchecked.
   */
  variable_amount: boolean
  /**
   * When false, this is a monthly amount estimate only (no schedule /
   * due dates / checklist). Still counts toward monthly totals & planned needs.
   */
  is_recurring: boolean
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export type RecurringEveryOption = {
  unit: RecurringIntervalUnit
  every: number
  /** Select value, e.g. "week:1" / "month:12" */
  key: string
}

const MIN_INTERVAL_MONTHS = 1
/** 10 years — dropdown offers 1–12 months plus 2–10 years. */
const MAX_INTERVAL_MONTHS = 120
const MAX_INTERVAL_WEEKS = 2

/** Settings Every dropdown: 1–2 weeks, then 1–12 months, then 2–10 years. */
export const RECURRING_EVERY_OPTIONS: RecurringEveryOption[] = [
  { unit: 'week', every: 1, key: 'week:1' },
  { unit: 'week', every: 2, key: 'week:2' },
  ...Array.from({ length: 12 }, (_, i) => {
    const every = i + 1
    return { unit: 'month' as const, every, key: `month:${every}` }
  }),
  ...Array.from({ length: 9 }, (_, i) => {
    const every = (i + 2) * 12
    return { unit: 'month' as const, every, key: `month:${every}` }
  }),
]

export function recurringEveryKey(
  unit: RecurringIntervalUnit,
  every: number,
): string {
  return `${unit}:${every}`
}

export function parseRecurringEveryKey(
  key: string,
): RecurringEveryOption | null {
  const match = /^(week|month):(\d+)$/.exec(key)
  if (!match) return null
  const unit = match[1] as RecurringIntervalUnit
  const every = Number(match[2])
  if (!Number.isFinite(every)) return null
  const found = RECURRING_EVERY_OPTIONS.find(
    (o) => o.unit === unit && o.every === every,
  )
  return found ?? null
}

function clampIntervalMonths(value: unknown): number {
  const n = Number(value ?? MIN_INTERVAL_MONTHS)
  if (!Number.isFinite(n)) return MIN_INTERVAL_MONTHS
  return Math.min(
    MAX_INTERVAL_MONTHS,
    Math.max(MIN_INTERVAL_MONTHS, Math.round(n)),
  )
}

function clampIntervalWeeks(value: unknown): number {
  const n = Number(value ?? 1)
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_INTERVAL_WEEKS, Math.max(1, Math.round(n)))
}

export function clampIntervalEvery(
  unit: RecurringIntervalUnit,
  every: unknown,
): number {
  return unit === 'week' ? clampIntervalWeeks(every) : clampIntervalMonths(every)
}

function parseIntervalUnit(value: unknown): RecurringIntervalUnit {
  return value === 'week' ? 'week' : 'month'
}

function parseStartsOn(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

/** "1 week" / "2 weeks" / "1 month" / "6 months" / "2 years". */
export function formatIntervalLabel(
  unit: RecurringIntervalUnit,
  every: number,
): string {
  if (unit === 'week') {
    const n = clampIntervalWeeks(every)
    return n === 1 ? '1 week' : `${n} weeks`
  }
  const interval = clampIntervalMonths(every)
  if (interval === 1) return '1 month'
  if (interval % 12 === 0 && interval >= 24) {
    const years = interval / 12
    return `${years} years`
  }
  return `${interval} months`
}

/** @deprecated Prefer formatIntervalLabel — kept for month-only call sites. */
export function formatIntervalMonthsLabel(intervalMonths: number): string {
  return formatIntervalLabel('month', intervalMonths)
}

/** Map key for checklist logs: one entry per bill occurrence date. */
export function occurrenceLogKey(billId: string, occurredOn: string): string {
  return `${billId}:${occurredOn}`
}

/** Month index for YYYY-MM arithmetic (Jan 0000 = 0). */
function yearMonthIndex(yearMonth: string): number | null {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month < 1 || month > 12) return null
  return year * 12 + (month - 1)
}

function indexToYearMonth(index: number): string {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * True when yearMonth sits on the every-N-months grid from starts.
 * interval ≤ 1 → always on grid. interval > 1 requires starts as anchor.
 */
export function isOnIntervalGrid(
  yearMonth: string,
  startsYearMonth: string | null,
  intervalMonths: number,
): boolean {
  const interval = clampIntervalMonths(intervalMonths)
  if (interval <= 1) return true
  if (!startsYearMonth) return false
  const startIdx = yearMonthIndex(startsYearMonth)
  const monthIdx = yearMonthIndex(yearMonth)
  if (startIdx == null || monthIdx == null) return false
  const diff = monthIdx - startIdx
  return diff >= 0 && diff % interval === 0
}

export interface RecurringBillLog {
  id: string
  bill_id: string
  year_month: string
  /** Due / paid date for this checklist row (YYYY-MM-DD). */
  occurred_on: string
  transaction_id: string | null
  completed_at: string
}

/** Per-month amount / due_day / skip override (null field = use template). */
export interface RecurringBillMonthOverride {
  id: string
  bill_id: string
  year_month: string
  amount: number | null
  due_day: number | null
  /** Soft-skip for this month only (legacy whole-bill); prefer occurrence skips. */
  skipped: boolean
}

export interface RecurringBillOccurrenceSkip {
  id: string
  bill_id: string
  year_month: string
  occurred_on: string
}

export function isRecurringSkipped(
  override?: RecurringBillMonthOverride | null,
): boolean {
  return override?.skipped === true
}

/** True when this occurrence is skipped (per-date or legacy whole-month). */
export function isOccurrenceSkipped(
  billId: string,
  occurredOn: string,
  skippedOccurrenceKeys?: Set<string> | Map<string, boolean> | null,
  override?: RecurringBillMonthOverride | null,
): boolean {
  if (isRecurringSkipped(override)) return true
  if (!skippedOccurrenceKeys) return false
  const key = occurrenceLogKey(billId, occurredOn)
  if (skippedOccurrenceKeys instanceof Map) {
    return skippedOccurrenceKeys.get(key) === true
  }
  return skippedOccurrenceKeys.has(key)
}

export function effectiveAmount(
  bill: RecurringBill,
  override?: RecurringBillMonthOverride | null,
): number {
  if (override?.amount != null && override.amount > 0) return override.amount
  return bill.amount
}

export function effectiveDueDay(
  bill: RecurringBill,
  override?: RecurringBillMonthOverride | null,
): number {
  if (
    override?.due_day != null &&
    override.due_day >= 1 &&
    override.due_day <= 31
  ) {
    return override.due_day
  }
  return bill.due_day
}

/**
 * Due dates (YYYY-MM-DD) for this bill in the given month.
 * Weekly: same weekday every N weeks from starts_on.
 * Monthly: single due day when on the month grid.
 */
export function occurrencesInMonth(
  bill: RecurringBill,
  yearMonth: string,
  override?: RecurringBillMonthOverride | null,
): string[] {
  // Estimate-only rows have no dated occurrences (not on Due checklist).
  if (!bill.is_recurring) return []
  if (bill.starts_year_month && bill.starts_year_month > yearMonth) return []
  if (bill.ends_year_month && bill.ends_year_month < yearMonth) return []

  if (bill.interval_unit === 'week') {
    const startsOn = bill.starts_on
    if (!startsOn) return []
    const stepDays = clampIntervalWeeks(bill.interval_months) * 7
    const monthStart = `${yearMonth}-01`
    const monthEnd = lastDayOfYearMonth(yearMonth)
    if (!monthEnd) return []

    let cursor = startsOn
    if (cursor < monthStart) {
      const diff = daysBetweenIso(startsOn, monthStart)
      const steps = Math.ceil(diff / stepDays)
      cursor = addDaysIso(startsOn, steps * stepDays)
    }

    const dates: string[] = []
    for (let d = cursor; d <= monthEnd; d = addDaysIso(d, stepDays)) {
      if (d < startsOn) continue
      if (yearMonthFromIso(d) !== yearMonth) break
      if (bill.ends_year_month && yearMonthFromIso(d) > bill.ends_year_month) {
        break
      }
      dates.push(d)
    }
    return dates
  }

  if (
    !isOnIntervalGrid(
      yearMonth,
      bill.starts_year_month,
      bill.interval_months,
    )
  ) {
    return []
  }
  const cursor = cursorFromYearMonth(yearMonth)
  if (!cursor) return []
  const dueDay = effectiveDueDay(bill, override)
  return [recurringOccurredOn(cursor, dueDay)]
}

function parseEndsYearMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

function parseStartsYearMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

function mapBill(row: Record<string, unknown>): RecurringBill {
  const rawType = row.type
  const type: TransactionType =
    rawType === 'income' || rawType === 'transfer' || rawType === 'expense'
      ? rawType
      : 'expense'

  const rawDueDay = Number(row.due_day ?? 1)
  const due_day =
    Number.isFinite(rawDueDay) && rawDueDay >= 1 && rawDueDay <= 31
      ? rawDueDay
      : 1

  const interval_unit = parseIntervalUnit(row.interval_unit)
  const interval_months = clampIntervalEvery(interval_unit, row.interval_months)

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    amount: Number(row.amount),
    type,
    category_id: (row.category_id as string | null) ?? null,
    from_bucket_id: (row.from_bucket_id as string | null) ?? null,
    to_bucket_id: (row.to_bucket_id as string | null) ?? null,
    circle: row.circle as Circle,
    owner: isOwner(row.owner) ? row.owner : 'suami',
    due_day,
    interval_unit,
    interval_months,
    starts_year_month: parseStartsYearMonth(row.starts_year_month),
    ends_year_month: parseEndsYearMonth(row.ends_year_month),
    starts_on: parseStartsOn(row.starts_on),
    variable_amount: Boolean(row.variable_amount),
    // Missing column (pre-migration) → treat as recurring templates.
    is_recurring: row.is_recurring === false ? false : true,
    icon: String(row.icon ?? '📌'),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  }
}

function mapLog(row: Record<string, unknown>): RecurringBillLog {
  const year_month = String(row.year_month)
  const rawOccurred = parseStartsOn(row.occurred_on)
  const occurred_on =
    rawOccurred ?? (year_month.length === 7 ? `${year_month}-01` : year_month)
  return {
    id: String(row.id),
    bill_id: String(row.bill_id),
    year_month,
    occurred_on,
    transaction_id: (row.transaction_id as string | null) ?? null,
    completed_at: String(row.completed_at),
  }
}

function mapOverride(row: Record<string, unknown>): RecurringBillMonthOverride {
  const rawAmount = row.amount
  const amount =
    rawAmount == null || rawAmount === '' ? null : Number(rawAmount)
  const parsedAmount =
    amount != null && Number.isFinite(amount) && amount > 0 ? amount : null

  const rawDueDay = row.due_day
  const dueNum =
    rawDueDay == null || rawDueDay === '' ? null : Number(rawDueDay)
  const due_day =
    dueNum != null &&
    Number.isFinite(dueNum) &&
    dueNum >= 1 &&
    dueNum <= 31
      ? dueNum
      : null

  return {
    id: String(row.id),
    bill_id: String(row.bill_id),
    year_month: String(row.year_month),
    amount: parsedAmount,
    due_day,
    skipped: Boolean(row.skipped),
  }
}

/** Unchecked checklist occurrences due today or earlier in the given month. */
export function countDueOrOverdueUnchecked(
  bills: RecurringBill[],
  logByOccurrenceKey: Map<string, RecurringBillLog>,
  _cursor: MonthCursor,
  today: string,
  yearMonth: string,
  overrideByBillId?: Map<string, RecurringBillMonthOverride>,
  skippedOccurrenceKeys?: Set<string>,
): number {
  let count = 0
  for (const bill of bills) {
    const override = overrideByBillId?.get(bill.id)
    for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
      if (
        isOccurrenceSkipped(
          bill.id,
          occurredOn,
          skippedOccurrenceKeys,
          override,
        )
      ) {
        continue
      }
      if (occurredOn > today) continue
      if (logByOccurrenceKey.has(occurrenceLogKey(bill.id, occurredOn))) {
        continue
      }
      count += 1
    }
  }
  return count
}

/** Still appears on checklist for this YYYY-MM (dated recurring only). */
export function isRecurringActiveInMonth(
  bill: RecurringBill,
  yearMonth: string,
): boolean {
  return occurrencesInMonth(bill, yearMonth).length > 0
}

/**
 * Counts toward monthly estimate totals / planned needs for YYYY-MM.
 * Non-recurring estimates always count while active; recurring need dates.
 */
export function isEstimateActiveInMonth(
  bill: RecurringBill,
  yearMonth: string,
  override?: RecurringBillMonthOverride | null,
): boolean {
  if (!bill.is_active) return false
  if (!bill.is_recurring) return true
  return occurrencesInMonth(bill, yearMonth, override).length > 0
}

/**
 * How many times this estimate applies in the month (for summing amounts).
 * Non-recurring → 1. Recurring → dated occurrence count (minus skips).
 */
export function estimateOccurrenceCount(
  bill: RecurringBill,
  yearMonth: string,
  override?: RecurringBillMonthOverride | null,
  skippedOccurrenceKeys?: Set<string>,
): number {
  if (!bill.is_active) return 0
  if (isRecurringSkipped(override)) return 0
  if (!bill.is_recurring) return 1
  let count = 0
  for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
    if (
      isOccurrenceSkipped(bill.id, occurredOn, skippedOccurrenceKeys, override)
    ) {
      continue
    }
    count += 1
  }
  return count
}

/** Due label for a specific ISO date, e.g. "Tue, 15 Aug 2026". */
export function formatOccurredOnLabel(occurredOn: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${occurredOn}T00:00:00`))
}

/** Due label for a specific plan month, e.g. "Tue, 15 Aug 2026". */
export function formatRecurringDueDate(
  cursor: MonthCursor,
  dueDay: number,
): string {
  return formatOccurredOnLabel(recurringOccurredOn(cursor, dueDay))
}

/** Anchor date for settings copy, e.g. "1 Jan 2026". */
export function formatRecurringAnchorDate(
  dueDay: number,
  yearMonth: string,
): string | null {
  const idx = yearMonthIndex(yearMonth)
  if (idx == null) return null
  const year = Math.floor(idx / 12)
  const monthIndex = idx % 12
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const day = Math.min(Math.max(1, Math.round(dueDay)), lastDay)
  const monthLabel = new Date(year, monthIndex, 1).toLocaleString('en-US', {
    month: 'short',
  })
  return `${day} ${monthLabel} ${year}`
}

function formatIsoAnchorDate(iso: string): string {
  const day = Number(iso.slice(8, 10))
  const year = Number(iso.slice(0, 4))
  const monthIndex = Number(iso.slice(5, 7)) - 1
  const monthLabel = new Date(year, monthIndex, 1).toLocaleString('en-US', {
    month: 'short',
  })
  return `${day} ${monthLabel} ${year}`
}

/**
 * Settings list/form cadence, e.g.
 * "Every 12 months, starts from 1 Jan 2026 to 1 Jan 2030"
 * "Every week, starts from 7 Aug 2026"
 */
export function formatRecurringSettingsDescription(input: {
  intervalUnit?: RecurringIntervalUnit
  intervalMonths: number
  dueDay: number
  startsYearMonth: string | null | undefined
  endsYearMonth: string | null | undefined
  startsOn?: string | null | undefined
}): string {
  const unit = input.intervalUnit ?? 'month'
  const every = clampIntervalEvery(unit, input.intervalMonths)
  const cadence =
    unit === 'month' && every === 1
      ? 'Every month'
      : unit === 'week' && every === 1
        ? 'Every week'
        : `Every ${formatIntervalLabel(unit, every)}`

  const starts =
    unit === 'week' && input.startsOn
      ? formatIsoAnchorDate(input.startsOn)
      : input.startsYearMonth
        ? formatRecurringAnchorDate(input.dueDay, input.startsYearMonth)
        : null
  const ends = input.endsYearMonth
    ? formatRecurringAnchorDate(
        unit === 'week' && input.startsOn
          ? Number(input.startsOn.slice(8, 10))
          : input.dueDay,
        input.endsYearMonth,
      )
    : null

  if (starts && ends) {
    return `${cadence}, starts from ${starts} to ${ends}`
  }
  if (starts) return `${cadence}, starts from ${starts}`
  if (ends) return `${cadence}, until ${ends}`
  return cadence
}

/**
 * Weekly / biweekly settings hint: how many times this estimate hits the
 * given month (matches planned-needs / This Month Totals weighting).
 * Returns null for non-weekly schedules.
 */
export function formatThisMonthFrequencyLabel(
  bill: RecurringBill,
  yearMonth: string,
  override?: RecurringBillMonthOverride | null,
  skippedOccurrenceKeys?: Set<string>,
): string | null {
  if (!bill.is_recurring || bill.interval_unit !== 'week') return null
  const count = estimateOccurrenceCount(
    bill,
    yearMonth,
    override,
    skippedOccurrenceKeys,
  )
  return `${count}× this month`
}

/**
 * Settings list / plan meta copy for a recurring bill.
 */
export function formatRecurringMeta(
  bill: RecurringBill,
  cursor?: MonthCursor,
  options?: {
    currentMonthDone?: boolean
    occurredOn?: string
    /** YYYY-MM — settings list: append "N× this month" for weekly/biweekly. */
    thisMonthYearMonth?: string
  },
): string {
  if (!bill.is_recurring) {
    return 'Monthly estimate'
  }

  const remaining = bill.ends_year_month
    ? remainingOccurrencesLeft(bill, options?.currentMonthDone === true)
    : null
  const left =
    remaining != null && remaining > 0
      ? `${formatOccurrencesLeftLabel(remaining, bill.interval_unit)} left`
      : null

  if (cursor) {
    const dueLabel = options?.occurredOn
      ? formatOccurredOnLabel(options.occurredOn)
      : formatRecurringDueDate(cursor, bill.due_day)
    if (left) return `${dueLabel} · ${left}`
    if (bill.ends_year_month) return dueLabel
    return `${dueLabel} · Ongoing`
  }

  const description = formatRecurringSettingsDescription({
    intervalUnit: bill.interval_unit,
    intervalMonths: bill.interval_months,
    dueDay: bill.due_day,
    startsYearMonth: bill.starts_year_month,
    endsYearMonth: bill.ends_year_month,
    startsOn: bill.starts_on,
  })
  const thisMonth = options?.thisMonthYearMonth
    ? formatThisMonthFrequencyLabel(bill, options.thisMonthYearMonth)
    : null
  return [description, thisMonth, left].filter(Boolean).join(' · ')
}

/** Inclusive remaining on-grid occurrences from now (or start) through end. */
function remainingOccurrencesLeft(
  bill: RecurringBill,
  currentMonthDone: boolean,
): number {
  const endsYearMonth = bill.ends_year_month
  if (!endsYearMonth) return 0
  const endIdx = yearMonthIndex(endsYearMonth)
  if (endIdx == null) return 0

  const now = new Date()
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let fromYm = currentYm
  if (bill.starts_year_month && bill.starts_year_month > currentYm) {
    fromYm = bill.starts_year_month
  }

  const fromIdx = yearMonthIndex(fromYm)
  if (fromIdx == null) return 0
  if (endIdx < fromIdx) return 0

  let remaining = 0
  for (let idx = fromIdx; idx <= endIdx; idx++) {
    const ym = indexToYearMonth(idx)
    const dates = occurrencesInMonth(bill, ym)
    if (currentMonthDone && ym === currentYm) continue
    remaining += dates.length
  }
  return remaining
}

function formatOccurrencesLeftLabel(
  count: number,
  unit: RecurringIntervalUnit,
): string {
  if (unit === 'week') {
    return `${count} ${count === 1 ? 'week' : 'weeks'}`
  }
  return formatMonthsLeftLabel(count)
}

function formatMonthsLeftLabel(monthsLeft: number): string {
  if (monthsLeft > 12) {
    const years = Math.floor(monthsLeft / 12)
    const months = monthsLeft % 12
    const yearLabel = years === 1 ? 'year' : 'years'
    if (months === 0) return `${years} ${yearLabel}`
    const monthLabel = months === 1 ? 'month' : 'months'
    return `${years} ${yearLabel} ${months} ${monthLabel}`
  }
  return `${monthsLeft} ${monthsLeft === 1 ? 'month' : 'months'}`
}

export function isMissingRecurringSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('recurring_bill') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  )
}

export function isMissingMonthOverridesSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('recurring_bill_month_overrides')
}

function isMissingRecurringTypeColumns(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("'type'") ||
    lower.includes('from_bucket_id') ||
    lower.includes('to_bucket_id') ||
    (lower.includes('column') && lower.includes('type'))
  )
}

function isMissingDueDayColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('due_day')
}

function isMissingIntervalMonthsColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('interval_months')
}

function isMissingIntervalUnitColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('interval_unit')
}

function isMissingStartsOnColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('starts_on')
}

function isMissingVariableAmountColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('variable_amount')
}

function isMissingIsRecurringColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('is_recurring')
}

function isMissingOccurredOnColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('occurred_on')
}

function isMissingEndsColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('ends_year_month')
}

function isMissingStartsColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('starts_year_month')
}

function isMissingOwnerColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('owner') && lower.includes('column')
}

export async function fetchRecurringBills(options?: {
  includeInactive?: boolean
}): Promise<RecurringBill[]> {
  let query = supabase
    .from('recurring_bills')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapBill(row as Record<string, unknown>))
}

export async function fetchRecurringBillLogs(
  yearMonth: string,
): Promise<RecurringBillLog[]> {
  const { data, error } = await supabase
    .from('recurring_bill_logs')
    .select('*')
    .eq('year_month', yearMonth)
    // Orphan rows (tx deleted with ON DELETE SET NULL) must not stay "checked".
    .not('transaction_id', 'is', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapLog(row as Record<string, unknown>))
}

export async function fetchRecurringBillMonthOverrides(
  yearMonth: string,
): Promise<RecurringBillMonthOverride[]> {
  const { data, error } = await supabase
    .from('recurring_bill_month_overrides')
    .select('*')
    .eq('year_month', yearMonth)
  if (error) {
    if (isMissingMonthOverridesSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((row) =>
    mapOverride(row as Record<string, unknown>),
  )
}

/** Overrides for YYYY-MM from `startYearMonth` through `endYearMonth` inclusive. */
export async function fetchRecurringBillMonthOverridesInRange(
  startYearMonth: string,
  endYearMonth: string,
): Promise<RecurringBillMonthOverride[]> {
  const { data, error } = await supabase
    .from('recurring_bill_month_overrides')
    .select('*')
    .gte('year_month', startYearMonth)
    .lte('year_month', endYearMonth)
  if (error) {
    if (isMissingMonthOverridesSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((row) =>
    mapOverride(row as Record<string, unknown>),
  )
}

export type UpsertMonthOverrideInput = {
  billId: string
  yearMonth: string
  /** Effective values for this month (compared to template to decide null/clear). */
  amount: number
  dueDay: number
  templateAmount: number
  templateDueDay: number
}

async function fetchMonthOverrideRow(
  billId: string,
  yearMonth: string,
): Promise<RecurringBillMonthOverride | null> {
  const { data, error } = await supabase
    .from('recurring_bill_month_overrides')
    .select('*')
    .eq('bill_id', billId)
    .eq('year_month', yearMonth)
    .maybeSingle()
  if (error) {
    if (isMissingMonthOverridesSchema(error.message)) return null
    throw new Error(error.message)
  }
  if (!data) return null
  return mapOverride(data as Record<string, unknown>)
}

function throwMonthOverrideMigrateHint(message: string): never {
  if (isMissingMonthOverridesSchema(message)) {
    throw new Error(
      'Run migrate_recurring_month_overrides.sql in Supabase to enable this-month edits',
    )
  }
  if (isMissingSkippedColumn(message)) {
    throw new Error(
      'Run migrate_recurring_month_skipped.sql in Supabase to enable skip for this month',
    )
  }
  throw new Error(message)
}

function isMissingSkippedColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('skipped') && lower.includes('column')
}

async function upsertMonthOverrideRow(
  row: Record<string, unknown>,
  options?: { requireSkipped?: boolean },
): Promise<RecurringBillMonthOverride> {
  const attempt = async (payload: Record<string, unknown>) =>
    supabase
      .from('recurring_bill_month_overrides')
      .upsert(payload, { onConflict: 'bill_id,year_month' })
      .select('*')
      .single()

  let { data, error } = await attempt(row)
  if (
    error &&
    'skipped' in row &&
    !options?.requireSkipped &&
    isMissingSkippedColumn(error.message)
  ) {
    const { skipped: _skipped, ...withoutSkipped } = row
    ;({ data, error } = await attempt(withoutSkipped))
  }
  if (error) throwMonthOverrideMigrateHint(error.message)
  return mapOverride(data as Record<string, unknown>)
}

/**
 * Upsert this-month amount/due_day. Clears the row when both match the template
 * and the item is not skipped.
 */
export async function upsertRecurringBillMonthOverride(
  input: UpsertMonthOverrideInput,
): Promise<RecurringBillMonthOverride | null> {
  if (input.amount <= 0) throw new Error('Amount must be greater than 0')
  if (input.dueDay < 1 || input.dueDay > 31) {
    throw new Error('Due day must be between 1 and 31')
  }
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    throw new Error('Month is invalid')
  }

  const amountMatches =
    Math.round(input.amount) === Math.round(input.templateAmount)
  const dueMatches = input.dueDay === input.templateDueDay
  const existing = await fetchMonthOverrideRow(input.billId, input.yearMonth)
  const skipped = existing?.skipped === true

  if (amountMatches && dueMatches) {
    if (!skipped) {
      await clearRecurringBillMonthOverride(input.billId, input.yearMonth)
      return null
    }
    const mapped = await upsertMonthOverrideRow(
      {
        bill_id: input.billId,
        year_month: input.yearMonth,
        amount: null,
        due_day: null,
        skipped: true,
      },
      { requireSkipped: true },
    )
    notifyRecurringBillsChanged()
    return mapped
  }

  const mapped = await upsertMonthOverrideRow({
    bill_id: input.billId,
    year_month: input.yearMonth,
    amount: amountMatches ? null : Math.round(input.amount),
    due_day: dueMatches ? null : input.dueDay,
    skipped,
  })
  notifyRecurringBillsChanged()
  return mapped
}

/**
 * Soft-skip (or revive) a checklist item for one month only (legacy whole-bill).
 * Prefer setRecurringBillOccurrenceSkipped for weekly multi-occurrence bills.
 * Does not create or delete transactions.
 */
export async function setRecurringBillMonthSkipped(
  billId: string,
  yearMonth: string,
  skipped: boolean,
): Promise<RecurringBillMonthOverride | null> {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error('Month is invalid')
  }

  const existing = await fetchMonthOverrideRow(billId, yearMonth)

  if (!skipped) {
    if (!existing) return null
    if (existing.amount == null && existing.due_day == null) {
      await clearRecurringBillMonthOverride(billId, yearMonth)
      return null
    }
    const mapped = await upsertMonthOverrideRow(
      {
        bill_id: billId,
        year_month: yearMonth,
        amount: existing.amount,
        due_day: existing.due_day,
        skipped: false,
      },
      { requireSkipped: true },
    )
    notifyRecurringBillsChanged()
    return mapped
  }

  const mapped = await upsertMonthOverrideRow(
    {
      bill_id: billId,
      year_month: yearMonth,
      amount: existing?.amount ?? null,
      due_day: existing?.due_day ?? null,
      skipped: true,
    },
    { requireSkipped: true },
  )
  notifyRecurringBillsChanged()
  return mapped
}

function isMissingOccurrenceSkipsSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('recurring_bill_occurrence_skips') ||
    (lower.includes('occurrence_skips') && lower.includes('does not exist')) ||
    (lower.includes('could not find') && lower.includes('occurrence_skips'))
  )
}

function mapOccurrenceSkip(
  row: Record<string, unknown>,
): RecurringBillOccurrenceSkip {
  return {
    id: String(row.id),
    bill_id: String(row.bill_id),
    year_month: String(row.year_month),
    occurred_on: String(row.occurred_on).slice(0, 10),
  }
}

export async function fetchRecurringBillOccurrenceSkips(
  yearMonth: string,
): Promise<RecurringBillOccurrenceSkip[]> {
  const { data, error } = await supabase
    .from('recurring_bill_occurrence_skips')
    .select('*')
    .eq('year_month', yearMonth)
  if (error) {
    if (isMissingOccurrenceSkipsSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((row) =>
    mapOccurrenceSkip(row as Record<string, unknown>),
  )
}

export async function fetchRecurringBillOccurrenceSkipsInRange(
  startYearMonth: string,
  endYearMonth: string,
): Promise<RecurringBillOccurrenceSkip[]> {
  const { data, error } = await supabase
    .from('recurring_bill_occurrence_skips')
    .select('*')
    .gte('year_month', startYearMonth)
    .lte('year_month', endYearMonth)
  if (error) {
    if (isMissingOccurrenceSkipsSchema(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((row) =>
    mapOccurrenceSkip(row as Record<string, unknown>),
  )
}

/**
 * Soft-skip (or restore) a single checklist occurrence.
 * Weekly bills: only that date moves to Skipped.
 * If a legacy whole-month skip is set, restore expands it to the other dates.
 */
export async function setRecurringBillOccurrenceSkipped(
  billId: string,
  yearMonth: string,
  occurredOn: string,
  skipped: boolean,
  monthOccurrenceDates: string[],
): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new Error('Month is invalid')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new Error('Date is invalid')
  }

  const existing = await fetchMonthOverrideRow(billId, yearMonth)
  const legacyMonthSkip = existing?.skipped === true

  if (skipped) {
    if (legacyMonthSkip) {
      // Already whole-month skipped — nothing to add.
      return
    }
    const { error } = await supabase.from('recurring_bill_occurrence_skips').upsert(
      {
        bill_id: billId,
        year_month: yearMonth,
        occurred_on: occurredOn,
      },
      { onConflict: 'bill_id,occurred_on' },
    )
    if (error) {
      if (isMissingOccurrenceSkipsSchema(error.message)) {
        throw new Error(
          'Run migrate_recurring_occurrence_skips.sql in Supabase to enable skip per occurrence',
        )
      }
      throw new Error(error.message)
    }
    notifyRecurringBillsChanged()
    return
  }

  // Restore this occurrence.
  if (legacyMonthSkip) {
    const others = monthOccurrenceDates.filter((d) => d !== occurredOn)
    if (others.length > 0) {
      const { error: insertError } = await supabase
        .from('recurring_bill_occurrence_skips')
        .upsert(
          others.map((d) => ({
            bill_id: billId,
            year_month: yearMonth,
            occurred_on: d,
          })),
          { onConflict: 'bill_id,occurred_on' },
        )
      if (insertError) {
        if (isMissingOccurrenceSkipsSchema(insertError.message)) {
          throw new Error(
            'Run migrate_recurring_occurrence_skips.sql in Supabase to enable skip per occurrence',
          )
        }
        throw new Error(insertError.message)
      }
    }
    if (existing.amount == null && existing.due_day == null) {
      await clearRecurringBillMonthOverride(billId, yearMonth)
    } else {
      await upsertMonthOverrideRow(
        {
          bill_id: billId,
          year_month: yearMonth,
          amount: existing.amount,
          due_day: existing.due_day,
          skipped: false,
        },
        { requireSkipped: true },
      )
    }
    notifyRecurringBillsChanged()
    return
  }

  const { error } = await supabase
    .from('recurring_bill_occurrence_skips')
    .delete()
    .eq('bill_id', billId)
    .eq('occurred_on', occurredOn)
  if (error) {
    if (isMissingOccurrenceSkipsSchema(error.message)) {
      throw new Error(
        'Run migrate_recurring_occurrence_skips.sql in Supabase to enable skip per occurrence',
      )
    }
    throw new Error(error.message)
  }
  notifyRecurringBillsChanged()
}

export async function clearRecurringBillMonthOverride(
  billId: string,
  yearMonth: string,
): Promise<void> {
  const { error } = await supabase
    .from('recurring_bill_month_overrides')
    .delete()
    .eq('bill_id', billId)
    .eq('year_month', yearMonth)
  if (error) {
    if (isMissingMonthOverridesSchema(error.message)) return
    throw new Error(error.message)
  }
  notifyRecurringBillsChanged()
}

export type NewRecurringBillInput = {
  name: string
  amount: number
  type: TransactionType
  category_id: string | null
  from_bucket_id: string | null
  to_bucket_id: string | null
  circle: Circle
  owner: Owner
  due_day: number
  interval_unit: RecurringIntervalUnit
  interval_months: number
  starts_year_month: string | null
  ends_year_month: string | null
  starts_on: string | null
  variable_amount: boolean
  is_recurring: boolean
  icon: string
}

type InsertFlags = {
  includeTypeColumns: boolean
  includeDueDay: boolean
  includeIntervalMonths: boolean
  includeIntervalUnit: boolean
  includeStarts: boolean
  includeStartsOn: boolean
  includeEnds: boolean
  includeOwner: boolean
  includeVariableAmount: boolean
  includeIsRecurring: boolean
}

function toInsertRow(
  input: NewRecurringBillInput,
  sortOrder: number,
  flags: InsertFlags,
): Record<string, unknown> {
  const isRecurring = input.is_recurring !== false
  const unit = isRecurring ? input.interval_unit : 'month'
  const every = isRecurring
    ? clampIntervalEvery(unit, input.interval_months)
    : 1
  const base: Record<string, unknown> = {
    name: input.name.trim(),
    amount: input.amount,
    category_id: input.type === 'transfer' ? null : input.category_id,
    circle: input.circle,
    icon: input.icon || '📌',
    sort_order: sortOrder,
    is_active: true,
  }
  if (flags.includeOwner) {
    base.owner = input.owner
  }
  if (flags.includeDueDay) {
    base.due_day = isRecurring ? input.due_day : 1
  }
  if (flags.includeIntervalMonths) {
    base.interval_months = every
  }
  if (flags.includeIntervalUnit) {
    base.interval_unit = unit
  }
  if (flags.includeStarts) {
    base.starts_year_month = isRecurring ? input.starts_year_month : null
  }
  if (flags.includeStartsOn) {
    base.starts_on = isRecurring ? input.starts_on : null
  }
  if (flags.includeEnds) {
    base.ends_year_month = isRecurring ? input.ends_year_month : null
  }
  if (flags.includeVariableAmount) {
    base.variable_amount = isRecurring && input.variable_amount === true
  }
  if (flags.includeIsRecurring) {
    base.is_recurring = isRecurring
  }
  if (!flags.includeTypeColumns) return base
  return {
    ...base,
    type: input.type,
    from_bucket_id: input.type === 'transfer' ? input.from_bucket_id : null,
    to_bucket_id: input.type === 'transfer' ? input.to_bucket_id : null,
  }
}

function validateRecurringInput(input: NewRecurringBillInput): void {
  if (input.amount <= 0) throw new Error('Amount must be greater than 0')

  if (input.type === 'transfer') {
    if (input.from_bucket_id === input.to_bucket_id) {
      throw new Error('Pick different from and to')
    }
    if (!input.from_bucket_id && !input.to_bucket_id) {
      throw new Error('Transfer needs at least one bucket')
    }
  } else if (!input.category_id) {
    throw new Error('Category is required')
  }

  if (input.is_recurring === false) return

  if (input.due_day < 1 || input.due_day > 31) {
    throw new Error('Due day must be between 1 and 31')
  }
  const unit = input.interval_unit === 'week' ? 'week' : 'month'
  const every = clampIntervalEvery(unit, input.interval_months)
  if (
    !Number.isFinite(Number(input.interval_months)) ||
    (unit === 'week' && (every < 1 || every > MAX_INTERVAL_WEEKS)) ||
    (unit === 'month' &&
      (input.interval_months < MIN_INTERVAL_MONTHS ||
        input.interval_months > MAX_INTERVAL_MONTHS))
  ) {
    throw new Error(
      unit === 'week'
        ? 'Every must be 1 week or 2 weeks'
        : `Every must be between ${MIN_INTERVAL_MONTHS} month and 10 years`,
    )
  }
  if (unit === 'week') {
    if (!input.starts_on || !/^\d{4}-\d{2}-\d{2}$/.test(input.starts_on)) {
      throw new Error('Starts date is required when Every is weekly')
    }
  } else if (every > 1 && !input.starts_year_month) {
    throw new Error('Starts month is required when Every is more than 1 month')
  }
  if (
    input.starts_year_month != null &&
    !/^\d{4}-\d{2}$/.test(input.starts_year_month)
  ) {
    throw new Error('Starts month is invalid')
  }
  if (
    input.ends_year_month != null &&
    !/^\d{4}-\d{2}$/.test(input.ends_year_month)
  ) {
    throw new Error('Ends month is invalid')
  }
  if (
    input.starts_year_month &&
    input.ends_year_month &&
    input.starts_year_month > input.ends_year_month
  ) {
    throw new Error('Starts month must be before or same as Ends month')
  }
}

async function insertRecurringBill(
  input: NewRecurringBillInput,
  sortOrder: number,
): Promise<{
  data: Record<string, unknown> | null
  error: { message: string } | null
}> {
  const isRecurring = input.is_recurring !== false
  const isWeek = isRecurring && input.interval_unit === 'week'
  const attempts: InsertFlags[] = [
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: true,
      includeIntervalUnit: true,
      includeStarts: true,
      includeStartsOn: true,
      includeEnds: true,
      includeOwner: true,
      includeVariableAmount: true,
      includeIsRecurring: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: true,
      includeIntervalUnit: true,
      includeStarts: true,
      includeStartsOn: true,
      includeEnds: true,
      includeOwner: true,
      includeVariableAmount: true,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: true,
      includeIntervalUnit: true,
      includeStarts: true,
      includeStartsOn: true,
      includeEnds: true,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: true,
      includeIntervalUnit: false,
      includeStarts: true,
      includeStartsOn: false,
      includeEnds: true,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: false,
      includeIntervalUnit: false,
      includeStarts: true,
      includeStartsOn: false,
      includeEnds: true,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: false,
      includeIntervalUnit: false,
      includeStarts: false,
      includeStartsOn: false,
      includeEnds: true,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: false,
      includeIntervalUnit: false,
      includeStarts: false,
      includeStartsOn: false,
      includeEnds: false,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: true,
      includeDueDay: false,
      includeIntervalMonths: false,
      includeIntervalUnit: false,
      includeStarts: false,
      includeStartsOn: false,
      includeEnds: false,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
    {
      includeTypeColumns: false,
      includeDueDay: false,
      includeIntervalMonths: false,
      includeIntervalUnit: false,
      includeStarts: false,
      includeStartsOn: false,
      includeEnds: false,
      includeOwner: true,
      includeVariableAmount: false,
      includeIsRecurring: false,
    },
  ]

  let lastError: { message: string } | null = null
  const needsInterval =
    isWeek ||
    (isRecurring && clampIntervalMonths(input.interval_months) > 1)

  for (const flags of attempts) {
    if (input.type !== 'expense' && !flags.includeTypeColumns) continue
    if (isRecurring && input.starts_year_month && !flags.includeStarts) continue
    if (isRecurring && input.ends_year_month && !flags.includeEnds) continue
    if (needsInterval && !flags.includeIntervalMonths) continue
    if (isWeek && (!flags.includeIntervalUnit || !flags.includeStartsOn)) {
      continue
    }
    if (input.variable_amount && !flags.includeVariableAmount) continue
    if (!isRecurring && !flags.includeIsRecurring) continue

    const result = await supabase
      .from('recurring_bills')
      .insert(toInsertRow(input, sortOrder, flags))
      .select('*')
      .single()

    if (!result.error) {
      return { data: result.data as Record<string, unknown>, error: null }
    }

    lastError = result.error
    const message = result.error.message

    if (flags.includeOwner && isMissingOwnerColumn(message)) break
    if (
      flags.includeIsRecurring &&
      isMissingIsRecurringColumn(message)
    ) {
      if (!isRecurring) break
      continue
    }
    if (
      flags.includeVariableAmount &&
      isMissingVariableAmountColumn(message)
    ) {
      if (input.variable_amount) break
      continue
    }
    if (
      (flags.includeIntervalUnit && isMissingIntervalUnitColumn(message)) ||
      (flags.includeStartsOn && isMissingStartsOnColumn(message))
    ) {
      if (isWeek) break
      continue
    }
    if (flags.includeIntervalMonths && isMissingIntervalMonthsColumn(message)) {
      continue
    }
    if (flags.includeStarts && isMissingStartsColumn(message)) continue
    if (flags.includeEnds && isMissingEndsColumn(message)) continue
    if (flags.includeDueDay && isMissingDueDayColumn(message)) continue
    if (
      flags.includeTypeColumns &&
      input.type === 'expense' &&
      isMissingRecurringTypeColumns(message)
    ) {
      continue
    }
    break
  }

  return { data: null, error: lastError }
}

export async function createRecurringBill(
  input: NewRecurringBillInput,
): Promise<RecurringBill> {
  validateRecurringInput(input)

  const { data: maxRow } = await supabase
    .from('recurring_bills')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = Number(maxRow?.sort_order ?? 0) + 1

  const result = await insertRecurringBill(input, sortOrder)

  if (result.error) {
    if (isMissingRecurringTypeColumns(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_types.sql in Supabase to enable income/transfer templates',
      )
    }
    if (isMissingDueDayColumn(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_due_day.sql in Supabase to enable due day',
      )
    }
    if (
      isMissingIntervalUnitColumn(result.error.message) ||
      isMissingStartsOnColumn(result.error.message) ||
      (input.interval_unit === 'week' &&
        isMissingIntervalMonthsColumn(result.error.message))
    ) {
      throw new Error(
        'Run migrate_recurring_interval_weeks.sql in Supabase to enable weekly Every',
      )
    }
    if (isMissingVariableAmountColumn(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_variable_amount.sql in Supabase to enable variable amount',
      )
    }
    if (
      input.is_recurring === false &&
      isMissingIsRecurringColumn(result.error.message)
    ) {
      throw new Error(
        'Run migrate_monthly_estimates_is_recurring.sql in Supabase to enable non-recurring estimates',
      )
    }
    if (isMissingIntervalMonthsColumn(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_interval_months.sql in Supabase to enable Every N months',
      )
    }
    if (isMissingEndsColumn(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_ends.sql in Supabase to enable Ends month',
      )
    }
    if (isMissingStartsColumn(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_starts.sql in Supabase to enable Starts month',
      )
    }
    if (isMissingOwnerColumn(result.error.message)) {
      throw new Error(
        'Run migrate_recurring_owner.sql in Supabase to enable profile',
      )
    }
    throw new Error(result.error.message)
  }
  return mapBill(result.data!)
}

export async function updateRecurringBill(
  id: string,
  patch: Partial<{
    name: string
    amount: number
    type: TransactionType
    category_id: string | null
    from_bucket_id: string | null
    to_bucket_id: string | null
    circle: Circle
    owner: Owner
    due_day: number
    interval_unit: RecurringIntervalUnit
    interval_months: number
    starts_year_month: string | null
    ends_year_month: string | null
    starts_on: string | null
    variable_amount: boolean
    is_recurring: boolean
    icon: string
    is_active: boolean
  }>,
): Promise<RecurringBill> {
  const nextPatch = { ...patch }
  const isRecurring = nextPatch.is_recurring !== false

  if (nextPatch.is_recurring === false) {
    nextPatch.interval_unit = 'month'
    nextPatch.interval_months = 1
    nextPatch.due_day = 1
    nextPatch.starts_year_month = null
    nextPatch.ends_year_month = null
    nextPatch.starts_on = null
    nextPatch.variable_amount = false
  } else if (isRecurring) {
    const unit = nextPatch.interval_unit ?? 'month'
    if (nextPatch.interval_months != null) {
      nextPatch.interval_months = clampIntervalEvery(
        unit,
        nextPatch.interval_months,
      )
      if (unit === 'week') {
        if ('starts_on' in nextPatch && !nextPatch.starts_on) {
          throw new Error('Starts date is required when Every is weekly')
        }
      } else if (
        nextPatch.interval_months > 1 &&
        'starts_year_month' in nextPatch &&
        !nextPatch.starts_year_month
      ) {
        throw new Error(
          'Starts month is required when Every is more than 1 month',
        )
      }
    }
  }

  const { data, error } = await supabase
    .from('recurring_bills')
    .update(nextPatch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    if (isMissingOwnerColumn(error.message) && 'owner' in nextPatch) {
      throw new Error(
        'Run migrate_recurring_owner.sql in Supabase to enable profile',
      )
    }
    if (
      isMissingIsRecurringColumn(error.message) &&
      'is_recurring' in nextPatch
    ) {
      throw new Error(
        'Run migrate_monthly_estimates_is_recurring.sql in Supabase to enable non-recurring estimates',
      )
    }
    if (
      (isMissingIntervalUnitColumn(error.message) &&
        'interval_unit' in nextPatch) ||
      (isMissingStartsOnColumn(error.message) && 'starts_on' in nextPatch)
    ) {
      throw new Error(
        'Run migrate_recurring_interval_weeks.sql in Supabase to enable weekly Every',
      )
    }
    if (
      isMissingVariableAmountColumn(error.message) &&
      'variable_amount' in nextPatch
    ) {
      throw new Error(
        'Run migrate_recurring_variable_amount.sql in Supabase to enable variable amount',
      )
    }
    if (
      isMissingIntervalMonthsColumn(error.message) &&
      'interval_months' in nextPatch
    ) {
      throw new Error(
        'Run migrate_recurring_interval_months.sql in Supabase to enable Every N months',
      )
    }
    throw new Error(error.message)
  }
  return mapBill(data as Record<string, unknown>)
}

export async function deleteRecurringBill(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_bills')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function markBillPaid(input: {
  billId: string
  yearMonth: string
  occurredOn: string
  transactionId: string
}): Promise<RecurringBillLog> {
  const withOccurred = await supabase
    .from('recurring_bill_logs')
    .upsert(
      {
        bill_id: input.billId,
        year_month: input.yearMonth,
        occurred_on: input.occurredOn,
        transaction_id: input.transactionId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'bill_id,occurred_on' },
    )
    .select('*')
    .single()

  if (
    withOccurred.error &&
    isMissingOccurredOnColumn(withOccurred.error.message)
  ) {
    throw new Error(
      'Run migrate_recurring_interval_weeks.sql in Supabase to enable weekly checklist logs',
    )
  }
  if (withOccurred.error) throw new Error(withOccurred.error.message)
  const log = mapLog(withOccurred.data as Record<string, unknown>)
  notifyRecurringBillsChanged()
  return log
}

export async function unmarkBillPaid(
  billId: string,
  yearMonth: string,
  occurredOn: string,
): Promise<{ transactionId: string | null }> {
  const { data: existing, error: fetchError } = await supabase
    .from('recurring_bill_logs')
    .select('transaction_id')
    .eq('bill_id', billId)
    .eq('occurred_on', occurredOn)
    .maybeSingle()

  if (fetchError && isMissingOccurredOnColumn(fetchError.message)) {
    // Pre-migration fallback: one log per month.
    const legacy = await supabase
      .from('recurring_bill_logs')
      .select('transaction_id')
      .eq('bill_id', billId)
      .eq('year_month', yearMonth)
      .maybeSingle()
    if (legacy.error) throw new Error(legacy.error.message)
    const { error } = await supabase
      .from('recurring_bill_logs')
      .delete()
      .eq('bill_id', billId)
      .eq('year_month', yearMonth)
    if (error) throw new Error(error.message)
    notifyRecurringBillsChanged()
    return {
      transactionId: (legacy.data?.transaction_id as string | null) ?? null,
    }
  }
  if (fetchError) throw new Error(fetchError.message)

  const { error } = await supabase
    .from('recurring_bill_logs')
    .delete()
    .eq('bill_id', billId)
    .eq('occurred_on', occurredOn)
  if (error) throw new Error(error.message)

  notifyRecurringBillsChanged()
  return {
    transactionId: (existing?.transaction_id as string | null) ?? null,
  }
}

/** Clear checklist "checked" state linked to a transaction (before tx delete). */
export async function clearBillLogsByTransactionId(
  transactionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('recurring_bill_logs')
    .delete()
    .eq('transaction_id', transactionId)
    .select('id')
  if (error) throw new Error(error.message)
  if ((data?.length ?? 0) > 0) notifyRecurringBillsChanged()
}
