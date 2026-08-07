import { formatMonthLabel, monthRange } from './format'

export type MonthCursor = { year: number; month: number }

export function currentMonthCursor(): MonthCursor {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

export function shiftMonthCursor(
  cursor: MonthCursor,
  delta: number,
): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function isCurrentMonthCursor(cursor: MonthCursor): boolean {
  const now = currentMonthCursor()
  return cursor.year === now.year && cursor.month === now.month
}

export function isAfterCurrentMonthCursor(cursor: MonthCursor): boolean {
  const now = currentMonthCursor()
  return (
    cursor.year > now.year ||
    (cursor.year === now.year && cursor.month > now.month)
  )
}

export function monthCursorRange(cursor: MonthCursor) {
  return monthRange(cursor.year, cursor.month)
}

export function monthCursorLabel(cursor: MonthCursor): string {
  return formatMonthLabel(cursor.year, cursor.month)
}

/** YYYY-MM for recurring bill logs */
export function monthCursorKey(cursor: MonthCursor): string {
  return `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
}

/** Complete calendar months before `from` (default: current month), oldest first. */
export function previousCompleteMonths(
  count: number,
  from: MonthCursor = currentMonthCursor(),
): MonthCursor[] {
  const n = Math.max(0, Math.floor(count))
  const months: MonthCursor[] = []
  for (let i = n; i >= 1; i--) {
    months.push(shiftMonthCursor(from, -i))
  }
  return months
}

/** Inclusive date range covering every day in the given months (oldest → newest). */
export function monthsSpanRange(months: MonthCursor[]): {
  start: string
  end: string
} {
  if (months.length === 0) {
    const empty = monthCursorRange(currentMonthCursor())
    return { start: empty.start, end: empty.start }
  }
  const first = monthCursorRange(months[0])
  const last = monthCursorRange(months[months.length - 1])
  return { start: first.start, end: last.end }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** occurred_on for a recurring checklist log (due day clamped to month length). */
export function recurringOccurredOn(
  cursor: MonthCursor,
  dueDay: number,
): string {
  const clamped = Math.min(Math.max(1, dueDay), daysInMonth(cursor.year, cursor.month))
  return `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysBetweenIso(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function yearMonthFromIso(iso: string): string {
  return iso.slice(0, 7)
}

export function lastDayOfYearMonth(yearMonth: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null
  const year = Number(yearMonth.slice(0, 4))
  const monthIndex = Number(yearMonth.slice(5, 7)) - 1
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null
  const last = daysInMonth(year, monthIndex)
  return `${yearMonth}-${String(last).padStart(2, '0')}`
}

export function cursorFromYearMonth(yearMonth: string): MonthCursor | null {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null
  const year = Number(yearMonth.slice(0, 4))
  const month = Number(yearMonth.slice(5, 7)) - 1
  if (!Number.isFinite(year) || month < 0 || month > 11) return null
  return { year, month }
}
