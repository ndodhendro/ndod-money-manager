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

function daysInMonth(year: number, month: number): number {
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
