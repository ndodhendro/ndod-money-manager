import {
  budgetGroupOfTransferTo,
  plannedNeedsCeiling,
  plannedWantsCeiling,
} from './freeWants'
import {
  resolveEstimateAmount,
  type ResolveEstimateAmountCtx,
} from './moneyPlan'
import { sortRecurringBillsForSettings } from './recurringBillDisplay'
import { compareBucketsWithinKind } from './bucketsGroup'
import {
  estimateOccurrenceCount,
  type RecurringBill,
  type RecurringBillMonthOverride,
} from './recurringBillsApi'
import {
  TRANSFER_TYPE_ICON,
  type Bucket,
  type BucketWithBalance,
  type Category,
} from './types'

export interface PaydayTransferLine {
  billId: string
  name: string
  amount: number
  icon: string
  /** Destination bucket kind for display/debug. */
  bucketKind: 'emergency' | 'investment' | 'sinking'
}

export interface BonusAllocationLine {
  bucketId: string
  name: string
  icon: string
  kind: 'sinking' | 'emergency' | 'investment'
  amount: number
  /** Gap (target − balance) before applying this line; sinking only. */
  gapBefore?: number
}

export interface BonusAllocation {
  bonusIncome: number
  sinkingFilled: number
  emergency: number
  investment: number
  /** Remainder when Money Plan EF+Inv % are both 0. */
  unallocated: number
  lines: BonusAllocationLine[]
}

export interface PaydayAllocation {
  /** Regular monthly income (excludes THR / Performance Bonus). */
  income: number
  /** All completed income including bonus. */
  totalIncome: number
  /** THR + Performance Bonus for the month. */
  bonusIncome: number
  plannedNeeds: number
  plannedWants: number
  /** Buffer = round(Planned Needs × bufferPct / 100). */
  buffer: number
  bufferPct: number
  /** Guilt-Free Fund after Needs, Buffer, Wants, and sinking. */
  guiltFree: number
  /** EF + Inv + untagged sinking (Needs/Wants sinking lives in Planned). */
  sinkingTotal: number
  emergencyName: string
  emergencyAmount: number
  investmentName: string
  investmentAmount: number
  /**
   * Payday transfer checklist: Emergency, Investment, then all sinking
   * funds due this month (including Needs/Wants).
   */
  sinkingTransfers: PaydayTransferLine[]
  /** Sum of `sinkingTransfers` (operational total, not the Guilt-Free pool). */
  sinkingTransferTotal: number
  /** Bonus top-up plan; null when there is no bonus income. */
  bonusAllocation: BonusAllocation | null
}

export type PaydayBucketRef = Pick<
  BucketWithBalance,
  | 'id'
  | 'name'
  | 'kind'
  | 'icon'
  | 'budget_group'
  | 'balance'
  | 'target_amount'
  | 'sort_order'
  | 'is_active'
  | 'parent_id'
  | 'category_id'
>

export interface BuildPaydayAllocationInput {
  /** Regular monthly income (excludes THR / Performance Bonus). */
  income: number
  /** THR + Performance Bonus income for the month. */
  bonusIncome?: number
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, PaydayBucketRef>
  yearMonth: string
  emergencyPct: number
  investmentPct: number
  /** Buffer as % of Planned Needs (default 10). */
  bufferPct?: number
  /** Opening Buffer carry from prior month close (default 0). */
  openingBufferCarry?: number
  /** Opening Guilt-Free carry from prior month close (default 0). */
  openingGuiltFreeCarry?: number
}

function isSavingsTransferDestination(
  bill: RecurringBill,
  bucketsById: Map<string, PaydayBucketRef>,
): 'emergency' | 'investment' | 'sinking' | null {
  if (bill.type !== 'transfer' || !bill.to_bucket_id) return null
  const dest = bucketsById.get(bill.to_bucket_id)
  if (!dest || dest.is_active === false) return null
  if (dest.kind === 'emergency' || dest.kind === 'investment' || dest.kind === 'sinking') {
    return dest.kind
  }
  return null
}

function paydayTransferKindRank(
  kind: 'emergency' | 'investment' | 'sinking',
): number {
  if (kind === 'emergency') return 0
  if (kind === 'investment') return 1
  return 2
}

function activeBucketNameByKind(
  bucketsById: Map<string, PaydayBucketRef>,
  kind: 'emergency' | 'investment',
  fallback: string,
): string {
  for (const bucket of bucketsById.values()) {
    if (bucket.kind === kind && bucket.is_active !== false) {
      const name = bucket.name?.trim()
      if (name) return name
    }
  }
  return fallback
}

/**
 * Sinking transfers tagged Needs/Wants count under Planned Needs/Wants
 * (and History used), not under Payday Sinking — avoid double-count.
 */
function isPlannedNeedsOrWantsSinkingTransfer(
  bill: RecurringBill,
  bucketsById: Map<string, PaydayBucketRef>,
  categoriesById: Map<string, Category>,
): boolean {
  return (
    budgetGroupOfTransferTo(bill.to_bucket_id, bucketsById, categoriesById) !=
    null
  )
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function namesLooselyMatch(a: string, b: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

/**
 * Sinking funds for every-12-months obligations:
 * - active sinking with a target, funded by an active recurring transfer, and
 * - transfer itself is every 12 months, or
 * - a yearly (month:12) expense matches the bucket / transfer name.
 */
export function isTwelveMonthSinkingBucket(
  bucket: Pick<
    Bucket,
    'id' | 'name' | 'kind' | 'target_amount' | 'is_active'
  >,
  bills: RecurringBill[],
): boolean {
  if (!bucket.is_active || bucket.kind !== 'sinking') return false
  if (bucket.target_amount == null || bucket.target_amount <= 0) return false

  const transfersIn = bills.filter(
    (b) =>
      b.is_active &&
      b.type === 'transfer' &&
      b.is_recurring &&
      b.to_bucket_id === bucket.id,
  )
  if (transfersIn.length === 0) return false

  if (
    transfersIn.some(
      (b) => b.interval_unit === 'month' && b.interval_months === 12,
    )
  ) {
    return true
  }

  const yearlyExpenses = bills.filter(
    (b) =>
      b.is_active &&
      b.type === 'expense' &&
      b.is_recurring &&
      b.interval_unit === 'month' &&
      b.interval_months === 12,
  )
  for (const expense of yearlyExpenses) {
    if (namesLooselyMatch(bucket.name, expense.name)) return true
    if (transfersIn.some((t) => namesLooselyMatch(t.name, expense.name))) {
      return true
    }
  }
  return false
}

function sinkingGap(bucket: PaydayBucketRef): number {
  const target = bucket.target_amount
  if (target == null || target <= 0) return 0
  return Math.max(0, Math.round(target - bucket.balance))
}

/** Split leftover bonus across EF / Inv by Money Plan % ratio. */
export function splitBonusRemainderToPyf(
  remainder: number,
  emergencyPct: number,
  investmentPct: number,
): { emergency: number; investment: number; unallocated: number } {
  const amount = Math.max(0, Math.round(remainder))
  if (amount <= 0) return { emergency: 0, investment: 0, unallocated: 0 }
  const ef = Math.max(0, emergencyPct)
  const inv = Math.max(0, investmentPct)
  const totalPct = ef + inv
  if (totalPct <= 0) {
    return { emergency: 0, investment: 0, unallocated: amount }
  }
  const emergency = Math.round((amount * ef) / totalPct)
  const investment = amount - emergency
  return { emergency, investment, unallocated: 0 }
}

/**
 * Allocate bonus income: fill 12-month sinking gaps to target, then send
 * remainder to Emergency / Investment proportional to Money Plan %.
 * Does not change regular monthly transfers or Guilt-Free Fund.
 */
export function buildBonusAllocation(input: {
  bonusIncome: number
  bills: RecurringBill[]
  bucketsById: Map<string, PaydayBucketRef>
  emergencyPct: number
  investmentPct: number
}): BonusAllocation {
  let remaining = Math.max(0, Math.round(input.bonusIncome))
  const lines: BonusAllocationLine[] = []
  let sinkingFilled = 0

  const parentIdsWithChildren = new Set<string>()
  for (const b of input.bucketsById.values()) {
    if (b.parent_id) parentIdsWithChildren.add(b.parent_id)
  }

  const candidates = Array.from(input.bucketsById.values())
    .filter((b) => !parentIdsWithChildren.has(b.id))
    .filter((b) => isTwelveMonthSinkingBucket(b, input.bills))
    .map((b) => ({ bucket: b, gap: sinkingGap(b) }))
    .filter((row) => row.gap > 0)
    .sort((a, b) => compareBucketsWithinKind(a.bucket, b.bucket))

  for (const { bucket, gap } of candidates) {
    if (remaining <= 0) break
    const amount = Math.min(gap, remaining)
    if (amount <= 0) continue
    lines.push({
      bucketId: bucket.id,
      name: bucket.name,
      icon: bucket.icon || TRANSFER_TYPE_ICON,
      kind: 'sinking',
      amount,
      gapBefore: gap,
    })
    sinkingFilled += amount
    remaining -= amount
  }

  const pyf = splitBonusRemainderToPyf(
    remaining,
    input.emergencyPct,
    input.investmentPct,
  )
  remaining = pyf.unallocated

  const emergencyBucket = Array.from(input.bucketsById.values()).find(
    (b) => b.kind === 'emergency' && b.is_active,
  )
  const investmentBucket = Array.from(input.bucketsById.values()).find(
    (b) => b.kind === 'investment' && b.is_active,
  )

  if (pyf.emergency > 0) {
    lines.push({
      bucketId: emergencyBucket?.id ?? 'emergency',
      name: emergencyBucket?.name?.trim() || 'Emergency Fund',
      icon: emergencyBucket?.icon || '🛟',
      kind: 'emergency',
      amount: pyf.emergency,
    })
  }
  if (pyf.investment > 0) {
    lines.push({
      bucketId: investmentBucket?.id ?? 'investment',
      name: investmentBucket?.name?.trim() || 'Investment',
      icon: investmentBucket?.icon || '📈',
      kind: 'investment',
      amount: pyf.investment,
    })
  }

  return {
    bonusIncome: Math.max(0, Math.round(input.bonusIncome)),
    sinkingFilled,
    emergency: pyf.emergency,
    investment: pyf.investment,
    unallocated: remaining,
    lines,
  }
}

/**
 * Payday pools for a month (excludes checking-account transfers from sinking
 * so legacy rows do not affect the pool).
 * `income` must be regular monthly income (no THR / Performance Bonus).
 *
 * Planned Needs/Wants ceilings ignore skips so Close Month leftover stays
 * on those tracks (skipped due items are operational, not a smaller plan).
 * Buffer = round(Planned Needs × bufferPct / 100) + opening Buffer carry.
 * Guilt-Free = income − Needs − buffer − Wants − sinking
 *   + opening Guilt-Free carry.
 * Sinking = EF / Inv / untagged sinking only (Needs/Wants sinking is in Planned).
 */
export function computeGuiltFreePools(input: BuildPaydayAllocationInput): {
  income: number
  plannedNeeds: number
  plannedWants: number
  buffer: number
  bufferPct: number
  sinkingTotal: number
  guiltFree: number
} {
  const income = Math.max(0, input.income)
  const bufferPct = Math.max(0, input.bufferPct ?? 10)
  const openingBufferCarry = Math.max(0, Math.round(input.openingBufferCarry ?? 0))
  const openingGuiltFreeCarry = Math.max(
    0,
    Math.round(input.openingGuiltFreeCarry ?? 0),
  )

  const plannedNeeds = plannedNeedsCeiling({
    bills: input.bills,
    categoriesById: input.categoriesById,
    bucketsById: input.bucketsById,
    yearMonth: input.yearMonth,
  })
  const plannedWants = plannedWantsCeiling({
    bills: input.bills,
    categoriesById: input.categoriesById,
    bucketsById: input.bucketsById,
    yearMonth: input.yearMonth,
  })

  const amountCtx: ResolveEstimateAmountCtx = {
    monthIncome: income,
    emergencyPct: input.emergencyPct,
    investmentPct: input.investmentPct,
    bucketsById: input.bucketsById,
  }

  let sinkingTotal = 0
  for (const bill of input.bills) {
    if (!bill.is_active) continue
    if (!isSavingsTransferDestination(bill, input.bucketsById)) continue
    if (
      isPlannedNeedsOrWantsSinkingTransfer(
        bill,
        input.bucketsById,
        input.categoriesById,
      )
    )
      continue
    const override = input.overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      input.yearMonth,
      override,
      input.skippedOccurrenceKeys,
    )
    if (count === 0) continue
    const unit = resolveEstimateAmount(bill, override, amountCtx)
    sinkingTotal += unit * count
  }

  const baseBuffer = Math.round((plannedNeeds * bufferPct) / 100)
  const buffer = baseBuffer + openingBufferCarry
  const guiltFree =
    Math.max(
      0,
      income - plannedNeeds - buffer - plannedWants - sinkingTotal,
    ) + openingGuiltFreeCarry
  return {
    income,
    plannedNeeds,
    plannedWants,
    buffer,
    bufferPct,
    sinkingTotal,
    guiltFree,
  }
}

/** @deprecated Use computeGuiltFreePools. */
export function computeFreeGuilty(input: BuildPaydayAllocationInput) {
  const base = computeGuiltFreePools(input)
  return {
    income: base.income,
    plannedNeeds: base.plannedNeeds,
    plannedWants: base.plannedWants,
    sinkingTotal: base.sinkingTotal,
    freeGuilty: base.guiltFree,
  }
}

/**
 * Payday ritual totals for a month.
 *
 * Planned Needs / Wants = short-schedule expenses + transfers into sinking
 * funds tagged Needs/Wants (template ceilings).
 * Buffer = % of Planned Needs (overspend reserve).
 * Guilt-Free Fund = regular income − needs − buffer − wants − sinking
 * (THR / Performance Bonus excluded from Guilt-Free Fund).
 * Sinking = transfers into EF / Inv / sinking without Needs/Wants tag
 * (EF & Inv amounts from Money Plan % of regular income).
 * Bonus = fill 12-month sinking gaps, then remainder → EF/Inv by % ratio.
 */
export function buildPaydayAllocation(
  input: BuildPaydayAllocationInput,
): PaydayAllocation {
  const base = computeGuiltFreePools(input)
  const bonusIncome = Math.max(0, Math.round(input.bonusIncome ?? 0))
  const amountCtx: ResolveEstimateAmountCtx = {
    monthIncome: base.income,
    emergencyPct: input.emergencyPct,
    investmentPct: input.investmentPct,
    bucketsById: input.bucketsById,
  }

  const transferBills: RecurringBill[] = []
  for (const bill of input.bills) {
    if (!bill.is_active) continue
    if (!isSavingsTransferDestination(bill, input.bucketsById)) continue
    const override = input.overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      input.yearMonth,
      override,
      input.skippedOccurrenceKeys,
    )
    if (count === 0) continue
    transferBills.push(bill)
  }

  const ordered = sortRecurringBillsForSettings(
    transferBills,
    input.categoriesById,
    input.bucketsById as Map<string, BucketWithBalance>,
  ).sort((a, b) => {
    const kindA = isSavingsTransferDestination(a, input.bucketsById)
    const kindB = isSavingsTransferDestination(b, input.bucketsById)
    if (!kindA || !kindB) return 0
    return paydayTransferKindRank(kindA) - paydayTransferKindRank(kindB)
  })

  const sinkingTransfers: PaydayTransferLine[] = []
  let emergencyAmount = 0
  let investmentAmount = 0
  for (const bill of ordered) {
    const bucketKind = isSavingsTransferDestination(bill, input.bucketsById)
    if (!bucketKind) continue
    const override = input.overridesByBillId.get(bill.id)
    const count = estimateOccurrenceCount(
      bill,
      input.yearMonth,
      override,
      input.skippedOccurrenceKeys,
    )
    const unit = resolveEstimateAmount(bill, override, amountCtx)
    const amount = unit * count
    if (amount <= 0) continue
    const bucket = bill.to_bucket_id
      ? input.bucketsById.get(bill.to_bucket_id)
      : undefined
    const label =
      bucket?.name?.trim() || bill.name.trim() || 'Transfer'
    sinkingTransfers.push({
      billId: bill.id,
      name: label,
      amount,
      icon: bucket?.icon || TRANSFER_TYPE_ICON,
      bucketKind,
    })
    if (bucketKind === 'emergency') emergencyAmount += amount
    if (bucketKind === 'investment') investmentAmount += amount
  }

  const emergencyName = activeBucketNameByKind(
    input.bucketsById,
    'emergency',
    'Emergency Fund',
  )
  const investmentName = activeBucketNameByKind(
    input.bucketsById,
    'investment',
    'Investment',
  )
  const sinkingTransferTotal = sinkingTransfers.reduce(
    (sum, row) => sum + row.amount,
    0,
  )

  const bonusAllocation =
    bonusIncome > 0
      ? buildBonusAllocation({
          bonusIncome,
          bills: input.bills,
          bucketsById: input.bucketsById,
          emergencyPct: input.emergencyPct,
          investmentPct: input.investmentPct,
        })
      : null

  return {
    income: base.income,
    totalIncome: base.income + bonusIncome,
    bonusIncome,
    plannedNeeds: base.plannedNeeds,
    plannedWants: base.plannedWants,
    buffer: base.buffer,
    bufferPct: base.bufferPct,
    guiltFree: base.guiltFree,
    sinkingTotal: base.sinkingTotal,
    emergencyName,
    emergencyAmount,
    investmentName,
    investmentAmount,
    sinkingTransfers,
    sinkingTransferTotal,
    bonusAllocation,
  }
}
