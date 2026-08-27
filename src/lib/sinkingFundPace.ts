import { formatRupiah } from './format'
import type { RecurringBill } from './recurringBillsApi'
import { formatIntervalLabel } from './recurringBillsApi'

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
  /**
   * Optional transfer-based progress when recurring interval is based on
   * months > 1 (e.g. every 12 months). This is separate from monthsElapsed
   * which is calendar-based.
   */
  transfersElapsed?: number
  transfersTotal?: number
  recurringLabel?: string
  /**
   * Funding progress this cycle: ledger + cash taken from the jar in the
   * funding window. Envelope spends do not look underfunded; EF overlay
   * (expense above cash on hand) is not counted as extra savings.
   */
  funded: number
  /** Cash taken from the bucket during the funding window through `yearMonth`. */
  spentThisCycle: number
}

export function sinkingPaceLabel(status: SinkingPaceStatus): string {
  if (status === 'safe') return 'Safe'
  if (status === 'at_risk') return 'At Risk'
  return 'On Track'
}

/** Funded vs linear expected: ahead / behind / on expected. */
export function sinkingPaceDeltaLabel(
  funded: number,
  expected: number,
): { text: string; tone: 'over' | 'under' | 'even' } {
  const delta = Math.round(funded) - Math.round(expected)
  if (delta > 0) {
    return { text: `Ahead by ${formatRupiah(delta)}`, tone: 'over' }
  }
  if (delta < 0) {
    return { text: `Behind by ${formatRupiah(-delta)}`, tone: 'under' }
  }
  return { text: 'On expected', tone: 'even' }
}

type BucketOutflow = {
  id?: string
  amount: number
  from_bucket_id: string | null
  occurred_on: string
}

/** Cash that actually left the jar (expense minus EF overlay borrow). */
function outflowCashTaken(
  movement: BucketOutflow,
  sinkingBorrowByTxId?: Map<string, number>,
): number {
  const amount = Math.max(0, Math.round(movement.amount))
  if (!movement.id || !sinkingBorrowByTxId) return amount
  const borrow = Math.max(
    0,
    Math.round(sinkingBorrowByTxId.get(movement.id) ?? 0),
  )
  return Math.max(0, amount - borrow)
}

/** Outflows from `bucketIds` with occurred_on in [fromYm, toYm] inclusive. */
export function spentFromBucketsInYearMonthRange(
  bucketIds: Set<string>,
  movements: BucketOutflow[],
  fromYearMonth: string,
  toYearMonth: string,
  sinkingBorrowByTxId?: Map<string, number>,
): number {
  if (bucketIds.size === 0 || fromYearMonth > toYearMonth) return 0
  let sum = 0
  for (const m of movements) {
    if (!m.from_bucket_id || !bucketIds.has(m.from_bucket_id)) continue
    const ym = m.occurred_on.slice(0, 7)
    if (ym < fromYearMonth || ym > toYearMonth) continue
    sum += outflowCashTaken(m, sinkingBorrowByTxId)
  }
  return Math.max(0, Math.round(sum))
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

export type SinkingGoalsRow = {
  progress: number
  available: number
  badge: { label: string; className: string }
  barClass: string
  footerText: string
  footerClass: string
}

/**
 * Savings Goals row: bar = funded this cycle (spends do not look underfunded).
 * Remaining cash is “Available” (title-row right), not the progress metric.
 * Funded / target sits under the title, right-aligned.
 */
export function buildSinkingGoalsRow(input: {
  pace: SinkingPace
  onHand: number
}): SinkingGoalsRow {
  const { pace, onHand } = input
  const delta = sinkingPaceDeltaLabel(pace.funded, pace.expected)
  return {
    progress: Math.max(0, Math.round(pace.funded)),
    available: Math.max(0, Math.round(onHand)),
    badge: {
      label: sinkingPaceLabel(pace.status),
      className: SINKING_PACE_BADGE_CLASS[pace.status],
    },
    barClass: SINKING_PACE_BAR_CLASS[pace.status],
    footerText: delta.text,
    footerClass: SINKING_PACE_DELTA_CLASS[delta.tone],
  }
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

function fundingWindowHasHardEnd(
  destinationIds: Set<string>,
  bills: TransferScheduleBill[],
): boolean {
  return fundingTransfers(destinationIds, bills).some((bill) =>
    Boolean(bill.ends_year_month),
  )
}

/**
 * Ongoing (no Ends) windows last one cycle (from rate). After that month,
 * repeat the same length so the next month is a new Safe/On Track/At Risk
 * cycle — not a leftover label from the previous cycle.
 * Bills with Ends keep the closed window.
 */
export function rollOngoingFundingWindow(input: {
  startsYearMonth: string
  endsYearMonth: string
  yearMonth: string
  hasHardEnd: boolean
}): { startsYearMonth: string; endsYearMonth: string } {
  if (input.hasHardEnd) {
    return {
      startsYearMonth: input.startsYearMonth,
      endsYearMonth: input.endsYearMonth,
    }
  }
  const startIdx = yearMonthIndex(input.startsYearMonth)
  const endIdx = yearMonthIndex(input.endsYearMonth)
  const nowIdx = yearMonthIndex(input.yearMonth)
  if (startIdx == null || endIdx == null || nowIdx == null) {
    return {
      startsYearMonth: input.startsYearMonth,
      endsYearMonth: input.endsYearMonth,
    }
  }
  const length = endIdx - startIdx + 1
  if (length <= 0 || nowIdx <= endIdx) {
    return {
      startsYearMonth: input.startsYearMonth,
      endsYearMonth: input.endsYearMonth,
    }
  }
  const cycleIndex = Math.floor((nowIdx - startIdx) / length)
  const nextStart = startIdx + cycleIndex * length
  return {
    startsYearMonth: indexToYearMonth(nextStart),
    endsYearMonth: indexToYearMonth(nextStart + length - 1),
  }
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
  /**
   * When entering a bucket mid-plan, user can optionally tell how many
   * recurring transfers already happened before `opening_balance`.
   * This shifts the pacing window so expected/elapsed align to real state.
   */
  openingTransfers?: number
  /** Expense outflows from this bucket in `yearMonth` (YYYY-MM). */
  spentFromBucketInYearMonth?: number
  /**
   * Ledger movements (transfers + expenses). Used to rebuild funding after
   * envelope spends inside the window.
   */
  movements?: BucketOutflow[]
  /**
   * Own ledger (sinking expenses are capped at cash on hand). Prefer this
   * over display `balance` when computing `funded`.
   */
  ledgerBalance?: number
  /**
   * Sinking expense amount not covered by cash in the jar (EF overlay).
   * Subtracted from spent so borrow is not counted as extra funding.
   */
  sinkingBorrowByTxId?: Map<string, number>
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

  const openingTransfers = Math.max(0, Math.round(Number(input.openingTransfers ?? 0)))

  const ledger = Math.round(input.ledgerBalance ?? balance)

  const window = sinkingFundingWindow(destinations, input.bills, target)
  if (!window) {
    if (balance >= target) {
      return {
        status: 'safe',
        expected: target,
        balance,
        target,
        funded: ledger,
        spentThisCycle: 0,
        startsYearMonth: input.yearMonth,
        endsYearMonth: input.yearMonth,
        monthsElapsed: 1,
        monthsTotal: 1,
      }
    }
    return null
  }

  let startsYearMonth = window.startsYearMonth
  let endsYearMonth = window.endsYearMonth
  const shifted = applyOpeningTransfersShift({
    openingTransfers,
    destinations,
    bills: input.bills,
    startsYearMonth,
    endsYearMonth,
  })
  if (shifted) {
    startsYearMonth = shifted.startsYearMonth
    endsYearMonth = shifted.endsYearMonth
  }
  const rolled = rollOngoingFundingWindow({
    startsYearMonth,
    endsYearMonth,
    yearMonth: input.yearMonth,
    hasHardEnd: fundingWindowHasHardEnd(destinations, input.bills),
  })
  startsYearMonth = rolled.startsYearMonth
  endsYearMonth = rolled.endsYearMonth

  const startIdx = yearMonthIndex(startsYearMonth)
  const endIdx = yearMonthIndex(endsYearMonth)
  const nowIdx = yearMonthIndex(input.yearMonth)
  if (startIdx == null || endIdx == null || nowIdx == null) return null

  const monthsTotal = endIdx - startIdx + 1
  if (monthsTotal <= 0) return null

  const fundingThroughYm =
    nowIdx < startIdx
      ? startsYearMonth
      : nowIdx > endIdx
        ? endsYearMonth
        : input.yearMonth
  const spentThisCycle = input.movements
    ? spentFromBucketsInYearMonthRange(
        destinations,
        input.movements,
        startsYearMonth,
        fundingThroughYm,
        input.sinkingBorrowByTxId,
      )
    : Math.max(0, Math.round(Number(input.spentFromBucketInYearMonth ?? 0)))
  const funded = ledger + spentThisCycle

  const transfersMeta = computeTransfersMeta({
    destinations,
    bills: input.bills,
    yearMonth: input.yearMonth,
    startsYearMonth,
    endsYearMonth,
  })

  if (balance >= target) {
    return {
      status: 'safe',
      expected: target,
      balance,
      target,
      funded,
      spentThisCycle,
      startsYearMonth,
      endsYearMonth,
      monthsElapsed: monthsTotal,
      monthsTotal,
      ...transfersMeta,
    }
  }

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
  if (funded > expected + band) status = 'safe'
  else if (funded < expected - band) status = 'at_risk'
  else status = 'on_track'

  return {
    status,
    expected,
    balance,
    target,
    funded,
    spentThisCycle,
    startsYearMonth,
    endsYearMonth,
    monthsElapsed,
    monthsTotal,
    ...transfersMeta,
  }
}

function shiftYearMonth(yearMonth: string, deltaMonths: number): string | null {
  const idx = yearMonthIndex(yearMonth)
  if (idx == null) return null
  return indexToYearMonth(idx + deltaMonths)
}

function applyOpeningTransfersShift(input: {
  openingTransfers: number
  destinations: Set<string>
  bills: TransferScheduleBill[]
  startsYearMonth: string
  endsYearMonth: string
}): { startsYearMonth: string; endsYearMonth: string } | null {
  const { openingTransfers, destinations, bills, startsYearMonth, endsYearMonth } =
    input
  if (openingTransfers <= 0) return null

  const transfers = fundingTransfers(destinations, bills)
  if (transfers.length !== 1) return null
  const bill = transfers[0]
  if (bill.interval_unit !== 'month') return null

  const every = Math.max(1, Math.round(Number(bill.interval_months) || 1))

  const offsetMonths = openingTransfers * every
  const shiftedStarts = shiftYearMonth(startsYearMonth, -offsetMonths)
  const shiftedEnds = shiftYearMonth(endsYearMonth, -offsetMonths)
  if (!shiftedStarts || !shiftedEnds) return null
  return { startsYearMonth: shiftedStarts, endsYearMonth: shiftedEnds }
}

function computeTransfersMeta(input: {
  destinations: Set<string>
  bills: TransferScheduleBill[]
  yearMonth: string
  startsYearMonth: string
  endsYearMonth: string
}): Pick<SinkingPace, 'transfersElapsed' | 'transfersTotal' | 'recurringLabel'> {
  const transfers = fundingTransfers(input.destinations, input.bills)
  if (transfers.length !== 1) {
    // Avoid ambiguous counting when multiple bills feed the same bucket.
    return {}
  }

  const bill = transfers[0]
  if (bill.interval_unit !== 'month') return {}

  const every = Math.max(1, Math.round(Number(bill.interval_months) || 1))
  const recurringLabel = formatIntervalLabel('month', every)

  const startIdx = yearMonthIndex(input.startsYearMonth)
  const endIdx = yearMonthIndex(input.endsYearMonth)
  const nowIdx = yearMonthIndex(input.yearMonth)
  if (startIdx == null || endIdx == null || nowIdx == null) return {}
  if (endIdx < startIdx) return {}

  const transfersTotal = Math.floor((endIdx - startIdx) / every) + 1
  const transfersElapsed =
    nowIdx < startIdx
      ? 0
      : nowIdx > endIdx
        ? transfersTotal
        : Math.floor((nowIdx - startIdx) / every) + 1

  return {
    transfersElapsed: Math.max(0, Math.min(transfersElapsed, transfersTotal)),
    transfersTotal,
    recurringLabel,
  }
}
