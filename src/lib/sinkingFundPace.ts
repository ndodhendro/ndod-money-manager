import { formatRupiah } from './format'
import type { RecurringBill } from './recurringBillsApi'

/** Pace vs linear path from transfer start → end toward target. */
export type SinkingPaceStatus = 'safe' | 'on_track' | 'at_risk'

export type SinkingPace = {
  status: SinkingPaceStatus
  expected: number
  balance: number
  target: number
  startsYearMonth: string
  endsYearMonth: string
  monthsElapsed: number
  monthsTotal: number
}

export function sinkingPaceLabel(status: SinkingPaceStatus): string {
  if (status === 'safe') return 'Safe'
  if (status === 'at_risk') return 'At Risk'
  return 'On Track'
}

/** Balance vs linear expected: over / under / on expected. */
export function sinkingPaceDeltaLabel(
  balance: number,
  expected: number,
): { text: string; tone: 'over' | 'under' | 'even' } {
  const delta = Math.round(balance) - Math.round(expected)
  if (delta > 0) {
    return { text: `Over by ${formatRupiah(delta)}`, tone: 'over' }
  }
  if (delta < 0) {
    return { text: `Under by ${formatRupiah(-delta)}`, tone: 'under' }
  }
  return { text: 'On expected', tone: 'even' }
}

export const SINKING_PACE_DELTA_CLASS: Record<
  'over' | 'under' | 'even',
  string
> = {
  over: 'text-emerald-600 dark:text-emerald-400',
  under: 'text-red-600 dark:text-red-400',
  even: 'text-neutral-400',
}

/** Text color for the pace label (right of “to go”). */
export const SINKING_PACE_BADGE_CLASS: Record<SinkingPaceStatus, string> = {
  safe: 'text-emerald-600 dark:text-emerald-400',
  on_track: 'text-sky-600 dark:text-sky-400',
  at_risk: 'text-red-600 dark:text-red-400',
}

/** Progress bar fill for pace status. */
export const SINKING_PACE_BAR_CLASS: Record<SinkingPaceStatus, string> = {
  safe: 'bg-emerald-500',
  on_track: 'bg-sky-500',
  at_risk: 'bg-red-500',
}

type TransferScheduleBill = Pick<
  RecurringBill,
  | 'is_active'
  | 'type'
  | 'to_bucket_id'
  | 'starts_year_month'
  | 'ends_year_month'
  | 'amount'
  | 'interval_unit'
  | 'interval_months'
>

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

/** Approximate monthly contribution from a transfer estimate. */
export function monthlyTransferRate(bill: TransferScheduleBill): number {
  const amount = Math.max(0, Number(bill.amount) || 0)
  if (amount <= 0) return 0
  if (bill.interval_unit === 'week') {
    const every = Math.max(1, Number(bill.interval_months) || 1)
    return (amount * (52 / 12)) / every
  }
  const every = Math.max(1, Number(bill.interval_months) || 1)
  return amount / every
}

function fundingTransfers(
  destinationIds: Set<string>,
  bills: TransferScheduleBill[],
): TransferScheduleBill[] {
  return bills.filter(
    (bill) =>
      bill.is_active &&
      bill.type === 'transfer' &&
      bill.to_bucket_id != null &&
      destinationIds.has(bill.to_bucket_id),
  )
}

/**
 * Funding window for a sinking fund (self + optional child destinations).
 * Uses start+end when both set; otherwise derives the missing side from
 * target ÷ monthly transfer rate so ongoing (no Ends) plans still get pace.
 */
export function sinkingFundingWindow(
  destinationIds: Set<string>,
  bills: TransferScheduleBill[],
  target: number,
): { startsYearMonth: string; endsYearMonth: string } | null {
  const transfers = fundingTransfers(destinationIds, bills)
  if (transfers.length === 0) return null

  let starts: string | null = null
  let ends: string | null = null
  for (const bill of transfers) {
    if (bill.starts_year_month) {
      if (!starts || bill.starts_year_month < starts) {
        starts = bill.starts_year_month
      }
    }
    if (bill.ends_year_month) {
      if (!ends || bill.ends_year_month > ends) {
        ends = bill.ends_year_month
      }
    }
  }

  if (starts && ends && starts <= ends) {
    return { startsYearMonth: starts, endsYearMonth: ends }
  }

  const monthlyRate = transfers.reduce(
    (sum, bill) => sum + monthlyTransferRate(bill),
    0,
  )
  const monthsFromRate =
    target > 0 && monthlyRate > 0
      ? Math.max(1, Math.ceil(target / monthlyRate))
      : null

  if (starts && monthsFromRate != null) {
    const startIdx = yearMonthIndex(starts)
    if (startIdx == null) return null
    return {
      startsYearMonth: starts,
      endsYearMonth: indexToYearMonth(startIdx + monthsFromRate - 1),
    }
  }

  if (ends && monthsFromRate != null) {
    const endIdx = yearMonthIndex(ends)
    if (endIdx == null) return null
    return {
      startsYearMonth: indexToYearMonth(endIdx - monthsFromRate + 1),
      endsYearMonth: ends,
    }
  }

  return null
}

/**
 * Linear expected balance by `yearMonth` given transfer funding window.
 * `destinationIds` = this bucket plus any child leaf ids that receive transfers.
 * Already at/above target → Safe (even without a schedule).
 */
export function computeSinkingFundPace(input: {
  destinationIds: string[]
  target: number
  balance: number
  /** As-of YYYY-MM (usually current month). */
  yearMonth: string
  bills: TransferScheduleBill[]
}): SinkingPace | null {
  const target = Math.max(0, Math.round(input.target))
  const balance = Math.round(input.balance)
  if (target <= 0) return null

  const destinations = new Set(
    input.destinationIds.filter((id) => id.length > 0),
  )
  if (destinations.size === 0) return null

  if (balance >= target) {
    const window = sinkingFundingWindow(destinations, input.bills, target)
    const startsYearMonth = window?.startsYearMonth ?? input.yearMonth
    const endsYearMonth = window?.endsYearMonth ?? input.yearMonth
    const startIdx = yearMonthIndex(startsYearMonth)
    const endIdx = yearMonthIndex(endsYearMonth)
    const monthsTotal =
      startIdx != null && endIdx != null
        ? Math.max(1, endIdx - startIdx + 1)
        : 1
    return {
      status: 'safe',
      expected: target,
      balance,
      target,
      startsYearMonth,
      endsYearMonth,
      monthsElapsed: monthsTotal,
      monthsTotal,
    }
  }

  const window = sinkingFundingWindow(destinations, input.bills, target)
  if (!window) return null

  const startIdx = yearMonthIndex(window.startsYearMonth)
  const endIdx = yearMonthIndex(window.endsYearMonth)
  const nowIdx = yearMonthIndex(input.yearMonth)
  if (startIdx == null || endIdx == null || nowIdx == null) return null

  const monthsTotal = endIdx - startIdx + 1
  if (monthsTotal <= 0) return null

  let monthsElapsed: number
  if (nowIdx < startIdx) monthsElapsed = 0
  else if (nowIdx > endIdx) monthsElapsed = monthsTotal
  else monthsElapsed = nowIdx - startIdx + 1

  const expected = Math.round((target * monthsElapsed) / monthsTotal)
  /** Slack ≈ 2% of target or one quarter of a monthly slice (min Rp10k). */
  const monthlySlice = target / monthsTotal
  const band = Math.max(
    10_000,
    Math.round(Math.min(target * 0.02, monthlySlice * 0.25)),
  )

  let status: SinkingPaceStatus
  if (balance > expected + band) status = 'safe'
  else if (balance < expected - band) status = 'at_risk'
  else status = 'on_track'

  return {
    status,
    expected,
    balance,
    target,
    startsYearMonth: window.startsYearMonth,
    endsYearMonth: window.endsYearMonth,
    monthsElapsed,
    monthsTotal,
  }
}
