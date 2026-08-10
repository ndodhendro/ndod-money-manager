import {
  type BucketBudgetRef,
  sumPlannedNeeds,
} from './freeWants'
import {
  effectiveAmount,
  isOccurrenceSkipped,
  isRecurringSkipped,
  occurrencesInMonth,
  type RecurringBill,
  type RecurringBillMonthOverride,
} from './recurringBillsApi'
import type { Bucket, Category } from './types'

/** Day-of-month from YYYY-MM-DD (1–31). */
function dayOfIso(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

export interface PaydayLineItem {
  billId: string
  name: string
  amount: number
  occurredOn: string
  icon: string
}

export interface PaydaySinkingBucketLine {
  bucketId: string
  name: string
  icon: string
  amount: number
}

export interface PaydayAllocation {
  income: number
  plannedNeeds: number
  freeGuilty: number
  /** Free Guilty / 2 */
  freeGuiltyEach: number
  undueRecurring: number
  undueItems: PaydayLineItem[]
  grandTotal: number
  /** Grand Total / 2 for Ndod and Devi */
  accountEach: number
  sinkingTotal: number
  sinkingByBucket: PaydaySinkingBucketLine[]
  sinkingItems: PaydayLineItem[]
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
}

/**
 * Payday ritual totals for a month.
 *
 * Free Guilty = income − planned needs (no EF%/Inv% subtraction).
 * Undue = recurring expense occurrences with day-of-month > 1.
 * Grand = undue + free guilty (split 50/50 externally).
 * Sinking = all recurring transfers into sinking buckets this month.
 */
export function buildPaydayAllocation(
  input: BuildPaydayAllocationInput,
): PaydayAllocation {
  const income = Math.max(0, input.income)
  const budgetBuckets = input.bucketsById as Map<string, BucketBudgetRef>
  const plannedNeeds = sumPlannedNeeds(
    input.bills,
    input.overridesByBillId,
    input.categoriesById,
    input.yearMonth,
    input.skippedOccurrenceKeys,
    budgetBuckets,
  )
  const freeGuilty = Math.max(0, income - plannedNeeds)
  const freeGuiltyEach = freeGuilty / 2

  const undueItems: PaydayLineItem[] = []
  const sinkingItems: PaydayLineItem[] = []
  const sinkingByBucketMap = new Map<string, PaydaySinkingBucketLine>()

  for (const bill of input.bills) {
    if (!bill.is_active) continue
    const override = input.overridesByBillId.get(bill.id)
    if (isRecurringSkipped(override)) continue

    const dates = occurrencesInMonth(bill, input.yearMonth, override)
    if (dates.length === 0) continue
    const unit = effectiveAmount(bill, override)

    if (bill.type === 'expense') {
      for (const occurredOn of dates) {
        if (
          isOccurrenceSkipped(
            bill.id,
            occurredOn,
            input.skippedOccurrenceKeys,
            override,
          )
        ) {
          continue
        }
        if (dayOfIso(occurredOn) <= 1) continue
        undueItems.push({
          billId: bill.id,
          name: bill.name,
          amount: unit,
          occurredOn,
          icon: bill.icon || '📆',
        })
      }
      continue
    }

    if (bill.type === 'transfer' && bill.to_bucket_id) {
      const bucket = input.bucketsById.get(bill.to_bucket_id)
      if (!bucket || bucket.kind !== 'sinking') continue
      for (const occurredOn of dates) {
        if (
          isOccurrenceSkipped(
            bill.id,
            occurredOn,
            input.skippedOccurrenceKeys,
            override,
          )
        ) {
          continue
        }
        sinkingItems.push({
          billId: bill.id,
          name: bill.name,
          amount: unit,
          occurredOn,
          icon: bill.icon || bucket.icon || '🪣',
        })
        const existing = sinkingByBucketMap.get(bucket.id)
        if (existing) {
          existing.amount += unit
        } else {
          sinkingByBucketMap.set(bucket.id, {
            bucketId: bucket.id,
            name: bucket.name,
            icon: bucket.icon || '🪣',
            amount: unit,
          })
        }
      }
    }
  }

  undueItems.sort((a, b) =>
    a.occurredOn === b.occurredOn
      ? a.name.localeCompare(b.name)
      : a.occurredOn.localeCompare(b.occurredOn),
  )
  sinkingItems.sort((a, b) =>
    a.occurredOn === b.occurredOn
      ? a.name.localeCompare(b.name)
      : a.occurredOn.localeCompare(b.occurredOn),
  )

  const undueRecurring = undueItems.reduce((sum, row) => sum + row.amount, 0)
  const sinkingByBucket = [...sinkingByBucketMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const sinkingTotal = sinkingByBucket.reduce((sum, row) => sum + row.amount, 0)
  const grandTotal = undueRecurring + freeGuilty

  return {
    income,
    plannedNeeds,
    freeGuilty,
    freeGuiltyEach,
    undueRecurring,
    undueItems,
    grandTotal,
    accountEach: grandTotal / 2,
    sinkingTotal,
    sinkingByBucket,
    sinkingItems,
  }
}
