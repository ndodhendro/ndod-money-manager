import { recurringOccurredOn, type MonthCursor } from './monthCursor'
import { notifyRecurringBillsChanged } from './recurringBillsEvents'
import { supabase } from './supabase'
import { isOwner, type Circle, type Owner, type TransactionType } from './types'

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
  /** Every N months (1–12). Grid anchored on starts_year_month. */
  interval_months: number
  /** First YYYY-MM on checklist; null = no lower bound */
  starts_year_month: string | null
  /** Last YYYY-MM on checklist; null = ongoing */
  ends_year_month: string | null
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

const MIN_INTERVAL_MONTHS = 1
const MAX_INTERVAL_MONTHS = 12

function clampIntervalMonths(value: unknown): number {
  const n = Number(value ?? MIN_INTERVAL_MONTHS)
  if (!Number.isFinite(n)) return MIN_INTERVAL_MONTHS
  return Math.min(
    MAX_INTERVAL_MONTHS,
    Math.max(MIN_INTERVAL_MONTHS, Math.round(n)),
  )
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
  transaction_id: string | null
  completed_at: string
}

/** Per-month amount / due_day override (null field = use template). */
export interface RecurringBillMonthOverride {
  id: string
  bill_id: string
  year_month: string
  amount: number | null
  due_day: number | null
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
    interval_months: clampIntervalMonths(row.interval_months),
    starts_year_month: parseStartsYearMonth(row.starts_year_month),
    ends_year_month: parseEndsYearMonth(row.ends_year_month),
    icon: String(row.icon ?? '📌'),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  }
}

function mapLog(row: Record<string, unknown>): RecurringBillLog {
  return {
    id: String(row.id),
    bill_id: String(row.bill_id),
    year_month: String(row.year_month),
    transaction_id: (row.transaction_id as string | null) ?? null,
    completed_at: String(row.completed_at),
  }
}

function mapOverride(row: Record<string, unknown>): RecurringBillMonthOverride {
  const rawAmount = row.amount
  const amount =
    rawAmount == null || rawAmount === ''
      ? null
      : Number(rawAmount)
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
  }
}

/** Unchecked checklist items due today or earlier in the given month. */
export function countDueOrOverdueUnchecked(
  bills: RecurringBill[],
  logByBillId: Map<string, RecurringBillLog>,
  cursor: MonthCursor,
  today: string,
  overrideByBillId?: Map<string, RecurringBillMonthOverride>,
): number {
  return bills.filter((bill) => {
    if (logByBillId.has(bill.id)) return false
    const dueDay = effectiveDueDay(bill, overrideByBillId?.get(bill.id))
    return recurringOccurredOn(cursor, dueDay) <= today
  }).length
}

/** Still appears on checklist for this YYYY-MM. */
export function isRecurringActiveInMonth(
  bill: RecurringBill,
  yearMonth: string,
): boolean {
  if (bill.starts_year_month && bill.starts_year_month > yearMonth) return false
  if (bill.ends_year_month && bill.ends_year_month < yearMonth) return false
  return isOnIntervalGrid(
    yearMonth,
    bill.starts_year_month,
    bill.interval_months,
  )
}

/** Due label for a specific plan month, e.g. "Tue, 15 Aug 2026". */
export function formatRecurringDueDate(
  cursor: MonthCursor,
  dueDay: number,
): string {
  const iso = recurringOccurredOn(cursor, dueDay)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00`))
}

function formatIntervalCadence(intervalMonths: number, dueDay: number): string {
  const interval = clampIntervalMonths(intervalMonths)
  if (interval === 1) return `Every month on day ${dueDay}`
  return `Every ${interval} months on day ${dueDay}`
}

/** YYYY-MM → "Nov 2026" for compact list meta. */
function formatYearMonthShort(yearMonth: string): string | null {
  const idx = yearMonthIndex(yearMonth)
  if (idx == null) return null
  const year = Math.floor(idx / 12)
  const monthIndex = idx % 12
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1))
}

/**
 * Settings list: "Every 12 months on day 3 · From Nov 2026 · Ongoing"
 * Plan checklist (with cursor): "Tue, 15 Aug 2026 · Ongoing"
 *
 * "X months left" counts remaining on-grid occurrences through ends_year_month
 * (inclusive), including the current calendar month unless it is already checked.
 */
export function formatRecurringMeta(
  bill: RecurringBill,
  cursor?: MonthCursor,
  options?: { currentMonthDone?: boolean },
): string {
  const remaining = bill.ends_year_month
    ? remainingOccurrencesLeft(
        bill.ends_year_month,
        bill.starts_year_month,
        bill.interval_months,
        options?.currentMonthDone === true,
      )
    : null
  const left =
    remaining != null && remaining > 0
      ? `${formatMonthsLeftLabel(remaining)} left`
      : null

  if (cursor) {
    const dueLabel = formatRecurringDueDate(cursor, bill.due_day)
    if (left) return `${dueLabel} · ${left}`
    if (bill.ends_year_month) return dueLabel
    return `${dueLabel} · Ongoing`
  }

  const parts: string[] = [
    formatIntervalCadence(bill.interval_months, bill.due_day),
  ]

  const startsLabel = bill.starts_year_month
    ? formatYearMonthShort(bill.starts_year_month)
    : null
  const endsLabel = bill.ends_year_month
    ? formatYearMonthShort(bill.ends_year_month)
    : null

  if (startsLabel && endsLabel) {
    parts.push(`${startsLabel} – ${endsLabel}`)
  } else if (startsLabel) {
    parts.push(`From ${startsLabel}`)
  } else if (endsLabel) {
    parts.push(`Until ${endsLabel}`)
  }

  if (left) {
    parts.push(left)
  } else if (!bill.ends_year_month) {
    parts.push('Ongoing')
  }

  return parts.join(' · ')
}

/** Inclusive remaining on-grid months from now (or start) through end; skip current if done. */
function remainingOccurrencesLeft(
  endsYearMonth: string,
  startsYearMonth: string | null,
  intervalMonths: number,
  currentMonthDone: boolean,
): number {
  const endIdx = yearMonthIndex(endsYearMonth)
  if (endIdx == null) return 0

  const now = new Date()
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let fromYm = currentYm
  if (startsYearMonth && startsYearMonth > currentYm) {
    fromYm = startsYearMonth
  }

  const fromIdx = yearMonthIndex(fromYm)
  if (fromIdx == null) return 0
  if (endIdx < fromIdx) return 0

  const interval = clampIntervalMonths(intervalMonths)
  let remaining = 0
  for (let idx = fromIdx; idx <= endIdx; idx++) {
    const ym = indexToYearMonth(idx)
    if (!isOnIntervalGrid(ym, startsYearMonth, interval)) continue
    if (currentMonthDone && ym === currentYm) continue
    remaining += 1
  }
  return remaining
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

export type UpsertMonthOverrideInput = {
  billId: string
  yearMonth: string
  /** Effective values for this month (compared to template to decide null/clear). */
  amount: number
  dueDay: number
  templateAmount: number
  templateDueDay: number
}

/**
 * Upsert this-month amount/due_day. Clears the row when both match the template.
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

  if (amountMatches && dueMatches) {
    await clearRecurringBillMonthOverride(input.billId, input.yearMonth)
    return null
  }

  const row = {
    bill_id: input.billId,
    year_month: input.yearMonth,
    amount: amountMatches ? null : Math.round(input.amount),
    due_day: dueMatches ? null : input.dueDay,
  }

  const { data, error } = await supabase
    .from('recurring_bill_month_overrides')
    .upsert(row, { onConflict: 'bill_id,year_month' })
    .select('*')
    .single()

  if (error) {
    if (isMissingMonthOverridesSchema(error.message)) {
      throw new Error(
        'Run migrate_recurring_month_overrides.sql in Supabase to enable this-month edits',
      )
    }
    throw new Error(error.message)
  }

  notifyRecurringBillsChanged()
  return mapOverride(data as Record<string, unknown>)
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
  interval_months: number
  starts_year_month: string | null
  ends_year_month: string | null
  icon: string
}

type InsertFlags = {
  includeTypeColumns: boolean
  includeDueDay: boolean
  includeIntervalMonths: boolean
  includeStarts: boolean
  includeEnds: boolean
  includeOwner: boolean
}

function toInsertRow(
  input: NewRecurringBillInput,
  sortOrder: number,
  flags: InsertFlags,
): Record<string, unknown> {
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
    base.due_day = input.due_day
  }
  if (flags.includeIntervalMonths) {
    base.interval_months = clampIntervalMonths(input.interval_months)
  }
  if (flags.includeStarts) {
    base.starts_year_month = input.starts_year_month
  }
  if (flags.includeEnds) {
    base.ends_year_month = input.ends_year_month
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
  if (input.due_day < 1 || input.due_day > 31) {
    throw new Error('Due day must be between 1 and 31')
  }
  const interval = clampIntervalMonths(input.interval_months)
  if (
    input.interval_months < MIN_INTERVAL_MONTHS ||
    input.interval_months > MAX_INTERVAL_MONTHS ||
    !Number.isFinite(Number(input.interval_months))
  ) {
    throw new Error(
      `Every must be between ${MIN_INTERVAL_MONTHS} and ${MAX_INTERVAL_MONTHS} months`,
    )
  }
  if (interval > 1 && !input.starts_year_month) {
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

  if (input.type === 'transfer') {
    if (input.from_bucket_id === input.to_bucket_id) {
      throw new Error('Pick different from and to')
    }
    if (!input.from_bucket_id && !input.to_bucket_id) {
      throw new Error('Transfer needs at least one bucket')
    }
    return
  }

  if (!input.category_id) throw new Error('Category is required')
}

async function insertRecurringBill(
  input: NewRecurringBillInput,
  sortOrder: number,
): Promise<{
  data: Record<string, unknown> | null
  error: { message: string } | null
}> {
  const attempts: InsertFlags[] = [
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: true,
      includeStarts: true,
      includeEnds: true,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: false,
      includeStarts: true,
      includeEnds: true,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: false,
      includeStarts: false,
      includeEnds: true,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeIntervalMonths: false,
      includeStarts: false,
      includeEnds: false,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: false,
      includeIntervalMonths: false,
      includeStarts: false,
      includeEnds: false,
      includeOwner: true,
    },
    {
      includeTypeColumns: false,
      includeDueDay: false,
      includeIntervalMonths: false,
      includeStarts: false,
      includeEnds: false,
      includeOwner: true,
    },
  ]

  let lastError: { message: string } | null = null
  const needsInterval = clampIntervalMonths(input.interval_months) > 1

  for (const flags of attempts) {
    if (input.type !== 'expense' && !flags.includeTypeColumns) continue
    if (input.starts_year_month && !flags.includeStarts) continue
    if (input.ends_year_month && !flags.includeEnds) continue
    if (needsInterval && !flags.includeIntervalMonths) continue

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
    interval_months: number
    starts_year_month: string | null
    ends_year_month: string | null
    icon: string
    is_active: boolean
  }>,
): Promise<RecurringBill> {
  const nextPatch = { ...patch }
  if (nextPatch.interval_months != null) {
    nextPatch.interval_months = clampIntervalMonths(nextPatch.interval_months)
    if (
      nextPatch.interval_months > 1 &&
      'starts_year_month' in nextPatch &&
      !nextPatch.starts_year_month
    ) {
      throw new Error('Starts month is required when Every is more than 1 month')
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
  transactionId: string
}): Promise<RecurringBillLog> {
  const { data, error } = await supabase
    .from('recurring_bill_logs')
    .upsert(
      {
        bill_id: input.billId,
        year_month: input.yearMonth,
        transaction_id: input.transactionId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'bill_id,year_month' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const log = mapLog(data as Record<string, unknown>)
  notifyRecurringBillsChanged()
  return log
}

export async function unmarkBillPaid(
  billId: string,
  yearMonth: string,
): Promise<{ transactionId: string | null }> {
  const { data: existing, error: fetchError } = await supabase
    .from('recurring_bill_logs')
    .select('transaction_id')
    .eq('bill_id', billId)
    .eq('year_month', yearMonth)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)

  const { error } = await supabase
    .from('recurring_bill_logs')
    .delete()
    .eq('bill_id', billId)
    .eq('year_month', yearMonth)
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
