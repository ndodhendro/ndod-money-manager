import {
  sumCommittedWants,
  sumPlannedNeeds,
} from './freeWants'
import {
  freeGuiltySplitAmounts,
  resolveEstimateAmount,
  type FreeGuiltySplit,
  type ResolveEstimateAmountCtx,
} from './moneyPlan'
import { sortRecurringBillsForSettings } from './recurringBillDisplay'
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

export interface PaydayAllocation {
  income: number
  plannedNeeds: number
  plannedWants: number
  freeGuilty: number
  /** Free Guilty for Ndod (floor of half). */
  freeGuiltySuami: number
  /** Free Guilty for Devi (ceiling of half). */
  freeGuiltyIstri: number
  sinkingTotal: number
  /** Transfer estimates (sinking + EF + Inv), Monthly Estimates order. */
  sinkingTransfers: PaydayTransferLine[]
}

export type PaydayBucketRef = Pick<
  Bucket,
  'id' | 'name' | 'kind' | 'icon' | 'budget_group'
>

export interface BuildPaydayAllocationInput {
  income: number
  bills: RecurringBill[]
  overridesByBillId: Map<string, RecurringBillMonthOverride>
  skippedOccurrenceKeys?: Set<string>
  categoriesById: Map<string, Category>
  bucketsById: Map<string, PaydayBucketRef>
  yearMonth: string
  emergencyPct: number
  investmentPct: number
}

function isSavingsTransferDestination(
  bill: RecurringBill,
  bucketsById: Map<string, PaydayBucketRef>,
): 'emergency' | 'investment' | 'sinking' | null {
  if (bill.type !== 'transfer' || !bill.to_bucket_id) return null
  const kind = bucketsById.get(bill.to_bucket_id)?.kind
  if (kind === 'emergency' || kind === 'investment' || kind === 'sinking') {
    return kind
  }
  return null
}

/**
 * Free Guilty + Ndod/Devi split for a month (excludes checking-account transfers
 * from sinking so amounts are not circular).
 */
export function computeFreeGuiltySplit(
  input: BuildPaydayAllocationInput,
): {
  income: number
  plannedNeeds: number
  plannedWants: number
  sinkingTotal: number
  freeGuilty: number
  split: FreeGuiltySplit
} {
  const income = Math.max(0, input.income)
  const plannedNeeds = sumPlannedNeeds(
    input.bills,
    input.overridesByBillId,
    input.categoriesById,
    input.yearMonth,
    input.skippedOccurrenceKeys,
  )
  const plannedWants = sumCommittedWants(
    input.bills,
    input.overridesByBillId,
    input.categoriesById,
    input.yearMonth,
    input.skippedOccurrenceKeys,
  )

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

  const freeGuilty = Math.max(
    0,
    income - plannedNeeds - plannedWants - sinkingTotal,
  )
  return {
    income,
    plannedNeeds,
    plannedWants,
    sinkingTotal,
    freeGuilty,
    split: freeGuiltySplitAmounts(freeGuilty),
  }
}

/**
 * Payday ritual totals for a month.
 *
 * Planned Needs / Wants = expense estimates only (sinking transfers live under
 * Sinking Funds to Transfer so they are not double-counted).
 * Free Guilty = income − planned needs − planned wants − sinking total.
 * Ndod = floor(Free Guilty / 2), Devi = ceil(Free Guilty / 2).
 * Sinking = Monthly Estimate transfers into sinking / EF / Inv
 * (EF & Inv amounts from Money Plan %), ordered like Settings Monthly Estimates.
 */
export function buildPaydayAllocation(
  input: BuildPaydayAllocationInput,
): PaydayAllocation {
  const base = computeFreeGuiltySplit(input)
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
  )

  const sinkingTransfers: PaydayTransferLine[] = []
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
  }

  return {
    income: base.income,
    plannedNeeds: base.plannedNeeds,
    plannedWants: base.plannedWants,
    freeGuilty: base.freeGuilty,
    freeGuiltySuami: base.split.suami,
    freeGuiltyIstri: base.split.istri,
    sinkingTotal: base.sinkingTotal,
    sinkingTransfers,
  }
}
