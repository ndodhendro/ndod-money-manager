import type {
  Bucket,
  Category,
  TransactionWithCategory,
} from './types'
import type { RecurringBill } from './recurringBillsApi'
import { budgetGroupOfEstimate } from './freeWants'
import { budgetGroupOfTx } from './moneyPlan'

export type CheckingBucketRef = Pick<Bucket, 'id' | 'name' | 'kind'>

/** Title Case labels for payday budget tracks. */
export const BUDGET_TRACK_LABELS = {
  plannedNeeds: 'Planned Needs',
  buffer: 'Buffer',
  plannedWants: 'Planned Wants',
  guiltFree: 'Guilt-Free Fund',
} as const

/**
 * Guilt-Free Fund spent this month: completed expenses from Main Account
 * (from_bucket null) or a checking bucket, excluding categories already
 * tracked on Needs/Wants estimate lines (those use Buffer / Guilt-Free borrow).
 */
export function sumGuiltFreeSpent(input: {
  transactions: TransactionWithCategory[]
  estimateCoverageKeys: Set<string>
  checkingBucketIds: Set<string>
}): number {
  let sum = 0
  for (const tx of input.transactions) {
    if (tx.type !== 'expense' || tx.complete_later) continue
    const from = tx.from_bucket_id
    if (from != null && !input.checkingBucketIds.has(from)) continue
    const group = budgetGroupOfTx(tx)
    if (
      tx.category_id &&
      group &&
      input.estimateCoverageKeys.has(`${tx.category_id}:${group}`)
    ) {
      continue
    }
    sum += tx.amount
  }
  return sum
}

/** @deprecated Use sumGuiltFreeSpent. */
export const sumFreeGuiltySpent = sumGuiltFreeSpent

/** Category+group keys covered by active Needs/Wants expense estimates (incl. children). */
export function estimateExpenseCoverageKeys(
  bills: RecurringBill[],
  categoriesById: Map<string, Category>,
  isNeedsOrWantsEstimate: (bill: RecurringBill) => boolean,
): Set<string> {
  const keys = new Set<string>()
  for (const bill of bills) {
    if (!bill.is_active || bill.type !== 'expense' || !bill.category_id) {
      continue
    }
    if (!isNeedsOrWantsEstimate(bill)) continue
    const group = budgetGroupOfEstimate(bill, categoriesById)
    if (group !== 'needs' && group !== 'wants') continue
    keys.add(`${bill.category_id}:${group}`)
    for (const cat of categoriesById.values()) {
      if (cat.parent_id === bill.category_id) {
        keys.add(`${cat.id}:${group}`)
      }
    }
  }
  return keys
}

export function checkingBucketIdSet(
  buckets: CheckingBucketRef[],
): Set<string> {
  const ids = new Set<string>()
  for (const b of buckets) {
    if (b.kind === 'checking') ids.add(b.id)
  }
  return ids
}

export interface BudgetTrackProgress {
  label: string
  allowance: number
  used: number
  remaining: number
  /** Inset + lighter gray surface (Buffer, Guilt-Free Fund). */
  emphasize: boolean
  barClass: string
}

export interface MonthBudgetProgress {
  plannedNeeds: BudgetTrackProgress
  buffer: BudgetTrackProgress
  plannedWants: BudgetTrackProgress
  guiltFree: BudgetTrackProgress
  /** Total estimate overspend this month. */
  overspendTotal: number
  /** Estimate overspend absorbed by Buffer. */
  bufferUsed: number
  /**
   * Estimate overspend beyond Buffer (needs EF loan — no longer borrows
   * Guilt-Free Fund).
   */
  bufferOverEfLoan: number
  /** Guilt-Free spend beyond allowance (needs EF loan). */
  guiltFreeOverEfLoan: number
  /** @deprecated Prefer bufferOverEfLoan — no longer borrows Guilt-Free. */
  guiltFreeBorrowed: number
}

/**
 * Four payday tracks in display order:
 * Planned Needs → Buffer → Planned Wants → Guilt-Free Fund.
 *
 * Estimate overspend eats Buffer first; beyond Buffer → EF loan need.
 * Guilt-Free track uses only direct Guilt-Free spend (not estimate overspend).
 */
export function buildMonthBudgetProgress(input: {
  plannedNeeds: number
  needsActual: number
  plannedWants: number
  wantsActual: number
  buffer: number
  guiltFree: number
  guiltFreeSpent: number
  estimateOverspend: number
}): MonthBudgetProgress {
  const plannedNeeds = Math.max(0, Math.round(input.plannedNeeds))
  const needsActual = Math.max(0, Math.round(input.needsActual))
  const plannedWants = Math.max(0, Math.round(input.plannedWants))
  const wantsActual = Math.max(0, Math.round(input.wantsActual))
  const buffer = Math.max(0, Math.round(input.buffer))
  const guiltFree = Math.max(0, Math.round(input.guiltFree))
  const spent = Math.max(0, Math.round(input.guiltFreeSpent))
  const overspend = Math.max(0, Math.round(input.estimateOverspend))

  const bufferUsed = Math.min(buffer, overspend)
  const bufferOverEfLoan = Math.max(0, overspend - buffer)
  const guiltFreeUsed = spent
  const guiltFreeOverEfLoan = Math.max(0, spent - guiltFree)

  return {
    overspendTotal: overspend,
    bufferUsed,
    bufferOverEfLoan,
    guiltFreeOverEfLoan,
    guiltFreeBorrowed: bufferOverEfLoan,
    plannedNeeds: {
      label: BUDGET_TRACK_LABELS.plannedNeeds,
      allowance: plannedNeeds,
      used: needsActual,
      remaining: Math.max(0, plannedNeeds - needsActual),
      emphasize: false,
      barClass: 'bg-rose-500',
    },
    buffer: {
      label: BUDGET_TRACK_LABELS.buffer,
      allowance: buffer,
      used: bufferUsed,
      remaining: Math.max(0, buffer - bufferUsed),
      emphasize: true,
      barClass: 'bg-amber-500',
    },
    plannedWants: {
      label: BUDGET_TRACK_LABELS.plannedWants,
      allowance: plannedWants,
      used: wantsActual,
      remaining: Math.max(0, plannedWants - wantsActual),
      emphasize: false,
      barClass: 'bg-sky-500',
    },
    guiltFree: {
      label: BUDGET_TRACK_LABELS.guiltFree,
      allowance: guiltFree,
      used: guiltFreeUsed,
      remaining: Math.max(0, guiltFree - guiltFreeUsed),
      emphasize: true,
      barClass: 'bg-emerald-500',
    },
  }
}

/** @deprecated Prefer MonthBudgetProgress.guiltFree */
export type FreeGuiltyProgress = {
  allowance: number
  spent: number
  borrowed: number
  remaining: number
}

/** @deprecated Use buildMonthBudgetProgress. */
export function buildFreeGuiltyProgress(input: {
  allowance: number
  spent: number
  borrowed?: number
}): FreeGuiltyProgress {
  const allowance = Math.max(0, input.allowance)
  const spent = Math.max(0, input.spent)
  const borrowed = Math.max(0, Math.round(input.borrowed ?? 0))
  return {
    allowance,
    spent,
    borrowed,
    remaining: Math.max(0, allowance - spent - borrowed),
  }
}
