import { sumTransfersInto } from './bucketsApi'
import type { Bucket, TransactionWithCategory } from './types'

/** Minimal bucket fields for PYF auto-amount transfer detection. */
export type PyfAutoBucketRef = Pick<Bucket, 'kind' | 'name'>

export type ResolveEstimateAmountCtx = {
  monthIncome: number
  emergencyPct: number
  investmentPct: number
  bucketsById: Map<string, PyfAutoBucketRef>
}

type EstimateAmountBill = {
  type: string
  to_bucket_id: string | null
  amount: number
}

/** Transfer estimates into Emergency Fund / Investment use Money Plan %. */
export function isPyfAutoAmountTransfer(
  bill: Pick<EstimateAmountBill, 'type' | 'to_bucket_id'>,
  bucketsById: Map<string, PyfAutoBucketRef>,
): boolean {
  return pyfAutoTransferKind(bill, bucketsById) != null
}

export function pyfAutoTransferKind(
  bill: Pick<EstimateAmountBill, 'type' | 'to_bucket_id'>,
  bucketsById: Map<string, PyfAutoBucketRef>,
): 'emergency' | 'investment' | null {
  if (bill.type !== 'transfer' || !bill.to_bucket_id) return null
  const kind = bucketsById.get(bill.to_bucket_id)?.kind
  if (kind === 'emergency' || kind === 'investment') return kind
  return null
}

/** Monthly PYF transfer target: round(income × pct / 100). */
export function pyfTransferTargetAmount(
  kind: 'emergency' | 'investment',
  income: number,
  emergencyPct: number,
  investmentPct: number,
): number {
  const pct = kind === 'emergency' ? emergencyPct : investmentPct
  return Math.round((Math.max(0, income) * Math.max(0, pct)) / 100)
}

/** DB placeholder when computed is 0 (constraint amount > 0). */
export function pyfAutoAmountPlaceholder(computed: number): number {
  return Math.max(1, Math.round(computed))
}

/**
 * Effective estimate amount for a month.
 * PYF auto transfers ignore stored / override amounts and use income × %.
 */
export function resolveEstimateAmount(
  bill: EstimateAmountBill,
  override: { amount?: number | null } | null | undefined,
  ctx: ResolveEstimateAmountCtx,
): number {
  const kind = pyfAutoTransferKind(bill, ctx.bucketsById)
  if (kind) {
    return pyfTransferTargetAmount(
      kind,
      ctx.monthIncome,
      ctx.emergencyPct,
      ctx.investmentPct,
    )
  }
  if (override?.amount != null && override.amount > 0) return override.amount
  return bill.amount
}

/**
 * Leaf income category names treated as bonus (excluded from Guilt-Free Fund /
 * monthly PYF % base). English seed + legacy Indonesian names.
 */
export const BONUS_INCOME_LEAF_NAMES = new Set([
  'Holiday Bonus (THR)',
  'Performance Bonus',
  'THR',
  'Bonus Kinerja',
])

type IncomeCategoryRef = {
  name?: string | null
  parent?: { name?: string | null } | null
} | null

/** THR / Performance Bonus income (by leaf category name). */
export function isBonusIncomeCategory(category: IncomeCategoryRef): boolean {
  const leaf = category?.name?.trim() ?? ''
  return leaf.length > 0 && BONUS_INCOME_LEAF_NAMES.has(leaf)
}

type MonthIncomeTx = {
  type: string
  amount: number
  complete_later?: boolean
  category?: IncomeCategoryRef
}

export type MonthIncomeParts = {
  /** All completed income. */
  total: number
  /** Income excluding THR / Performance Bonus. */
  regular: number
  /** THR + Performance Bonus only. */
  bonus: number
}

/** Split completed month income into regular vs bonus. */
export function sumMonthIncomeParts(
  transactions: MonthIncomeTx[],
): MonthIncomeParts {
  let total = 0
  let bonus = 0
  for (const tx of transactions) {
    if (tx.type !== 'income' || tx.complete_later) continue
    total += tx.amount
    if (isBonusIncomeCategory(tx.category ?? null)) bonus += tx.amount
  }
  return {
    total,
    regular: Math.max(0, total - bonus),
    bonus: Math.max(0, bonus),
  }
}

/** Sum of completed income txs for the month (excludes complete_later). */
export function sumMonthIncome(transactions: MonthIncomeTx[]): number {
  return sumMonthIncomeParts(transactions).total
}

/** Completed income excluding THR / Performance Bonus. */
export function sumMonthRegularIncome(transactions: MonthIncomeTx[]): number {
  return sumMonthIncomeParts(transactions).regular
}

/** Completed THR + Performance Bonus income for the month. */
export function sumMonthBonusIncome(transactions: MonthIncomeTx[]): number {
  return sumMonthIncomeParts(transactions).bonus
}

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

/** Build a progress row for Plan budget / bucket displays. */
export function makeMoneyPlanBucket(
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

  const wants = makeMoneyPlanBucket(
    'Wants',
    wantsBudget,
    input.wantsActual,
    'ceiling',
  )

  return {
    income,
    emergency: makeMoneyPlanBucket(
      'Emergency fund',
      emergencyTarget,
      input.emergencyActual,
      'floor',
    ),
    investment: makeMoneyPlanBucket(
      'Investment',
      investmentTarget,
      input.investmentActual,
      'floor',
    ),
    needs: makeMoneyPlanBucket(
      'Needs',
      plannedNeeds,
      input.needsActual,
      'floor',
    ),
    wants,
    wantsBudget,
    wantsWarning: wantsBudget > 0 && input.wantsActual / wantsBudget >= 0.8,
  }
}

function budgetGroupOf(tx: TransactionWithCategory) {
  const live =
    tx.category?.budget_group === 'needs' ||
    tx.category?.budget_group === 'wants'
      ? tx.category.budget_group
      : tx.category?.parent?.budget_group === 'needs' ||
          tx.category?.parent?.budget_group === 'wants'
        ? tx.category.parent.budget_group
        : null
  if (live) return live
  if (tx.budget_group === 'needs' || tx.budget_group === 'wants') {
    return tx.budget_group
  }
  return null
}

export function budgetGroupOfTx(tx: TransactionWithCategory) {
  return budgetGroupOf(tx)
}

/**
 * Average monthly needs over the given months.
 * Only months with needs > 0 count (fallback when history is shorter than the window).
 */
export function averageMonthlyNeeds(
  transactions: TransactionWithCategory[],
  months: Array<{ year: number; month: number }>,
): { average: number; monthsUsed: number } | null {
  if (months.length === 0) return null

  const totals = new Map<string, number>()
  for (const m of months) {
    const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`
    totals.set(key, 0)
  }

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    if (budgetGroupOf(tx) !== 'needs') continue
    const key = tx.occurred_on.slice(0, 7)
    if (!totals.has(key)) continue
    totals.set(key, (totals.get(key) ?? 0) + tx.amount)
  }

  let sum = 0
  let monthsUsed = 0
  for (const amount of totals.values()) {
    if (amount <= 0) continue
    sum += amount
    monthsUsed += 1
  }
  if (monthsUsed === 0) return null
  return { average: sum / monthsUsed, monthsUsed }
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
