import { formatRupiah, todayIso } from './format'
import { currentMonthCursor, monthCursorKey } from './monthCursor'
import { MISSED_TRANSFER_LABEL } from './types'
import {
  estimateOccurrenceCount,
  occurrencesInMonth,
  type RecurringBill,
} from './recurringBillsApi'

type InflowMovement = {
  amount: number
  to_bucket_id: string | null
  occurred_on: string
}

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

function minYearMonth(a: string, b: string): string {
  return a <= b ? a : b
}

function billScheduleStartYm(bill: RecurringBill): string | null {
  if (bill.starts_year_month) return bill.starts_year_month
  if (bill.starts_on) return bill.starts_on.slice(0, 7)
  return null
}

function fundingTransfersTo(
  destinationIds: Set<string>,
  bills: RecurringBill[],
): RecurringBill[] {
  return bills.filter(
    (bill) =>
      bill.is_active &&
      bill.is_recurring &&
      bill.type === 'transfer' &&
      bill.to_bucket_id != null &&
      destinationIds.has(bill.to_bucket_id),
  )
}

function scheduledAmountThrough(input: {
  bills: RecurringBill[]
  throughYearMonth: string
  today: string
  currentYm: string
}): number {
  const todayYm = input.today.slice(0, 7)
  let scheduled = 0
  for (const bill of input.bills) {
    const startYm = billScheduleStartYm(bill) ?? input.throughYearMonth
    const startIdx = yearMonthIndex(startYm)
    const endIdx = yearMonthIndex(input.throughYearMonth)
    if (startIdx == null || endIdx == null || endIdx < startIdx) continue

    for (let idx = startIdx; idx <= endIdx; idx++) {
      const ym = indexToYearMonth(idx)
      const dates = occurrencesInMonth(bill, ym)
      for (const occurredOn of dates) {
        if (ym === input.currentYm && ym === todayYm && occurredOn > input.today) {
          continue
        }
        scheduled += bill.amount
      }
    }
  }
  return Math.max(0, Math.round(scheduled))
}

function inflowThrough(
  destinationIds: Set<string>,
  movements: InflowMovement[],
  throughYearMonth: string,
): number {
  let sum = 0
  for (const m of movements) {
    if (!m.to_bucket_id || !destinationIds.has(m.to_bucket_id)) continue
    const ym = m.occurred_on.slice(0, 7)
    if (ym > throughYearMonth) continue
    sum += m.amount
  }
  return Math.max(0, Math.round(sum))
}

function openingTransferCredit(
  bills: RecurringBill[],
  openingTransfers: number,
): number {
  const n = Math.max(0, Math.round(openingTransfers))
  if (n <= 0) return 0
  if (bills.length !== 1) return 0
  const bill = bills[0]
  if (bill.interval_unit !== 'month') return 0
  return n * Math.max(0, Math.round(bill.amount))
}

/**
 * Scheduled sinking transfers that were due through `throughYearMonth`
 * minus actual inflows into the bucket. Ignores expenses.
 * Current-month occurrences only count after their due date.
 */
export function sinkingMissedTransferAmount(input: {
  destinationIds: string[]
  bills: RecurringBill[]
  movements: InflowMovement[]
  throughYearMonth: string
  openingTransfers?: number
}): number {
  const destinations = new Set(
    input.destinationIds.filter((id) => id.length > 0),
  )
  if (destinations.size === 0) return 0

  const currentYm = monthCursorKey(currentMonthCursor())
  const through = minYearMonth(input.throughYearMonth, currentYm)
  const transfers = fundingTransfersTo(destinations, input.bills)
  if (transfers.length === 0) return 0

  const scheduled = scheduledAmountThrough({
    bills: transfers,
    throughYearMonth: through,
    today: todayIso(),
    currentYm,
  })
  const actual =
    inflowThrough(destinations, input.movements, through) +
    openingTransferCredit(transfers, input.openingTransfers ?? 0)
  return Math.max(0, scheduled - actual)
}

export function missedTransferHint(amount: number): string | null {
  const n = Math.max(0, Math.round(amount))
  if (n <= 0) return null
  return `${MISSED_TRANSFER_LABEL} ${formatRupiah(n)}`
}

/** Sum of scheduled transfer amounts into sinking buckets for one month. */
export function sinkingMonthTransferTarget(input: {
  destinationIds: string[]
  bills: RecurringBill[]
  yearMonth: string
}): number {
  const destinations = new Set(
    input.destinationIds.filter((id) => id.length > 0),
  )
  if (destinations.size === 0) return 0

  let total = 0
  for (const bill of fundingTransfersTo(destinations, input.bills)) {
    const count = estimateOccurrenceCount(bill, input.yearMonth)
    if (count <= 0) continue
    total += bill.amount * count
  }
  return Math.max(0, Math.round(total))
}
