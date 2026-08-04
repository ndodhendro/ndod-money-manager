import { recurringOccurredOn, type MonthCursor } from './monthCursor'
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
  /** First YYYY-MM on checklist; null = no lower bound */
  starts_year_month: string | null
  /** Last YYYY-MM on checklist; null = ongoing */
  ends_year_month: string | null
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface RecurringBillLog {
  id: string
  bill_id: string
  year_month: string
  transaction_id: string | null
  completed_at: string
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

function compareRecurringByDueDay(a: RecurringBill, b: RecurringBill): number {
  if (a.due_day !== b.due_day) return b.due_day - a.due_day
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.created_at.localeCompare(b.created_at)
}

/** Settings list: due day descending. */
export function sortRecurringBillsForSettings(
  bills: RecurringBill[],
): RecurringBill[] {
  return [...bills].sort(compareRecurringByDueDay)
}

/** Plan checklist: unchecked first, then due date descending in the month. */
export function sortRecurringBillsForChecklist(
  bills: RecurringBill[],
  logByBillId: Map<string, RecurringBillLog>,
  cursor: MonthCursor,
): RecurringBill[] {
  return [...bills].sort((a, b) => {
    const aDone = logByBillId.has(a.id)
    const bDone = logByBillId.has(b.id)
    if (aDone !== bDone) return aDone ? 1 : -1

    const aDate = recurringOccurredOn(cursor, a.due_day)
    const bDate = recurringOccurredOn(cursor, b.due_day)
    if (aDate !== bDate) return bDate.localeCompare(aDate)

    return compareRecurringByDueDay(a, b)
  })
}

/** Unchecked checklist items due today or earlier in the given month. */
export function countDueOrOverdueUnchecked(
  bills: RecurringBill[],
  logByBillId: Map<string, RecurringBillLog>,
  cursor: MonthCursor,
  today: string,
): number {
  return bills.filter((bill) => {
    if (logByBillId.has(bill.id)) return false
    return recurringOccurredOn(cursor, bill.due_day) <= today
  }).length
}

/** Still appears on checklist for this YYYY-MM. */
export function isRecurringActiveInMonth(
  bill: RecurringBill,
  yearMonth: string,
): boolean {
  if (bill.starts_year_month && bill.starts_year_month > yearMonth) return false
  if (!bill.ends_year_month) return true
  return bill.ends_year_month >= yearMonth
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

/**
 * Settings list: "Due day 15 · Ongoing"
 * Plan checklist (with cursor): "Tue, 15 Aug 2026 · Ongoing"
 *
 * "X months left" counts remaining monthly occurrences through ends_year_month
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
        options?.currentMonthDone === true,
      )
    : null
  const left =
    remaining != null && remaining > 0
      ? `${formatMonthsLeftLabel(remaining)} left`
      : null
  const dueLabel = cursor
    ? formatRecurringDueDate(cursor, bill.due_day)
    : `Due day ${bill.due_day}`
  if (left) return `${dueLabel} · ${left}`
  if (bill.ends_year_month) return dueLabel
  return `${dueLabel} · Ongoing`
}

/** Inclusive remaining months from now (or start) through end; skip current if done. */
function remainingOccurrencesLeft(
  endsYearMonth: string,
  startsYearMonth: string | null,
  currentMonthDone: boolean,
): number {
  const [endYear, endMonth] = endsYearMonth.split('-').map(Number)
  if (!Number.isFinite(endYear) || !Number.isFinite(endMonth)) return 0

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentYm = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  let fromYear = currentYear
  let fromMonth = currentMonth
  let fromYm = currentYm
  if (startsYearMonth && startsYearMonth > currentYm) {
    const [startYear, startMonth] = startsYearMonth.split('-').map(Number)
    if (!Number.isFinite(startYear) || !Number.isFinite(startMonth)) return 0
    fromYear = startYear
    fromMonth = startMonth
    fromYm = startsYearMonth
  }

  if (endsYearMonth < fromYm) return 0

  let remaining = (endYear - fromYear) * 12 + (endMonth - fromMonth) + 1
  if (currentMonthDone && fromYm === currentYm) remaining -= 1
  return Math.max(0, remaining)
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
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapLog(row as Record<string, unknown>))
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
  starts_year_month: string | null
  ends_year_month: string | null
  icon: string
}

type InsertFlags = {
  includeTypeColumns: boolean
  includeDueDay: boolean
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
      includeStarts: true,
      includeEnds: true,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeStarts: false,
      includeEnds: true,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: true,
      includeStarts: false,
      includeEnds: false,
      includeOwner: true,
    },
    {
      includeTypeColumns: true,
      includeDueDay: false,
      includeStarts: false,
      includeEnds: false,
      includeOwner: true,
    },
    {
      includeTypeColumns: false,
      includeDueDay: false,
      includeStarts: false,
      includeEnds: false,
      includeOwner: true,
    },
  ]

  let lastError: { message: string } | null = null

  for (const flags of attempts) {
    if (input.type !== 'expense' && !flags.includeTypeColumns) continue
    if (input.starts_year_month && !flags.includeStarts) continue
    if (input.ends_year_month && !flags.includeEnds) continue

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
    starts_year_month: string | null
    ends_year_month: string | null
    icon: string
    is_active: boolean
  }>,
): Promise<RecurringBill> {
  const { data, error } = await supabase
    .from('recurring_bills')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    if (isMissingOwnerColumn(error.message) && 'owner' in patch) {
      throw new Error(
        'Run migrate_recurring_owner.sql in Supabase to enable profile',
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
  return mapLog(data as Record<string, unknown>)
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

  return {
    transactionId: (existing?.transaction_id as string | null) ?? null,
  }
}
