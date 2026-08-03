import { sumTransfersInto } from './bucketsApi'
import type { Bucket, TransactionWithCategory } from './types'

export interface MoneyPlanInput {
  income: number
  emergencyPct: number
  investmentPct: number
  plannedNeeds: number
  needsActual: number
  wantsActual: number
  emergencyActual: number
  investmentActual: number
}

export interface MoneyPlanBucket {
  label: string
  target: number
  actual: number
  /** actual / target (0 if target is 0) */
  ratio: number
  remaining: number
  status: 'empty' | 'under' | 'on_track' | 'over'
}

export interface MoneyPlan {
  income: number
  emergency: MoneyPlanBucket
  investment: MoneyPlanBucket
  needs: MoneyPlanBucket
  wants: MoneyPlanBucket
  /** Income left after PYF targets + planned needs (wants ceiling). */
  wantsBudget: number
  /** Soft warning when wants actual ≥ 80% of budget. */
  wantsWarning: boolean
}

function bucketStatus(
  actual: number,
  target: number,
  mode: 'ceiling' | 'floor',
): MoneyPlanBucket['status'] {
  if (target <= 0 && actual <= 0) return 'empty'
  if (target <= 0) return actual > 0 ? 'over' : 'empty'
  const ratio = actual / target
  if (mode === 'ceiling') {
    if (ratio >= 1) return 'over'
    if (ratio >= 0.8) return 'on_track'
    if (ratio > 0) return 'under'
    return 'empty'
  }
  if (ratio >= 1) return 'on_track'
  if (ratio >= 0.8) return 'under'
  if (ratio > 0) return 'under'
  return 'empty'
}

function makeBucket(
  label: string,
  target: number,
  actual: number,
  mode: 'ceiling' | 'floor',
): MoneyPlanBucket {
  const safeTarget = Math.max(0, target)
  const ratio = safeTarget > 0 ? actual / safeTarget : 0
  return {
    label,
    target: safeTarget,
    actual,
    ratio,
    remaining: safeTarget - actual,
    status: bucketStatus(actual, safeTarget, mode),
  }
}

export function buildMoneyPlan(input: MoneyPlanInput): MoneyPlan {
  const income = Math.max(0, input.income)
  const emergencyTarget = (income * input.emergencyPct) / 100
  const investmentTarget = (income * input.investmentPct) / 100
  const plannedNeeds = Math.max(0, input.plannedNeeds)
  const wantsBudget = Math.max(
    0,
    income - emergencyTarget - investmentTarget - plannedNeeds,
  )

  const wants = makeBucket('Wants', wantsBudget, input.wantsActual, 'ceiling')

  return {
    income,
    emergency: makeBucket(
      'Emergency fund',
      emergencyTarget,
      input.emergencyActual,
      'floor',
    ),
    investment: makeBucket(
      'Investment',
      investmentTarget,
      input.investmentActual,
      'floor',
    ),
    needs: makeBucket('Needs', plannedNeeds, input.needsActual, 'floor'),
    wants,
    wantsBudget,
    wantsWarning: wantsBudget > 0 && input.wantsActual / wantsBudget >= 0.8,
  }
}

function budgetGroupOf(tx: TransactionWithCategory) {
  return tx.category?.budget_group ?? tx.category?.parent?.budget_group ?? null
}

export function budgetGroupOfTx(tx: TransactionWithCategory) {
  return budgetGroupOf(tx)
}

/** Monthly PYF funding from transfers into system buckets (+ legacy expense categories). */
export function sumSavingsActuals(
  transactions: TransactionWithCategory[],
  emergencyBucketId: string | null,
  investmentBucketId: string | null,
): {
  emergency: number
  investment: number
} {
  let emergency = 0
  let investment = 0
  for (const tx of transactions) {
    if (tx.type === 'transfer') {
      if (emergencyBucketId && tx.to_bucket_id === emergencyBucketId) {
        emergency += tx.amount
      }
      if (investmentBucketId && tx.to_bucket_id === investmentBucketId) {
        investment += tx.amount
      }
      continue
    }
    // Legacy: expense categorized as Emergency Fund / Investment
    if (tx.type !== 'expense') continue
    const leaf = tx.category?.name ?? ''
    if (leaf === 'Emergency Fund') emergency += tx.amount
    else if (leaf === 'Investment') investment += tx.amount
  }
  return { emergency, investment }
}

export function emergencyFundTarget(
  plannedNeeds: number,
  multiplier: number,
): number {
  return Math.max(0, plannedNeeds) * Math.max(0, multiplier)
}

export function monthlyInflowsByBucket(
  movements: Array<{
    amount: number
    to_bucket_id: string | null
    occurred_on: string
  }>,
  buckets: Bucket[],
  range: { start: string; end: string },
): Map<string, number> {
  const map = new Map<string, number>()
  for (const b of buckets) {
    map.set(b.id, sumTransfersInto(movements, b.id, range))
  }
  return map
}
