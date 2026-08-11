import { freeGuiltySplitAmounts } from './moneyPlan'
import {
  OWNER_ACCOUNT_LABELS,
  type Bucket,
  type Owner,
  type TransactionWithCategory,
} from './types'

export type CheckingBucketRef = Pick<Bucket, 'id' | 'name' | 'kind' | 'is_system'>

/** System checking bucket id for Ndod / Devi Account, if present. */
export function checkingBucketIdForOwner(
  buckets: CheckingBucketRef[],
  owner: Owner,
): string | null {
  const name = OWNER_ACCOUNT_LABELS[owner]
  const match = buckets.find(
    (b) => b.kind === 'checking' && b.is_system && b.name === name,
  )
  return match?.id ?? null
}

export function checkingBucketIdsByOwner(
  buckets: CheckingBucketRef[],
): Record<Owner, string | null> {
  return {
    suami: checkingBucketIdForOwner(buckets, 'suami'),
    istri: checkingBucketIdForOwner(buckets, 'istri'),
  }
}

/**
 * Free Guilty spent for a profile this month:
 * completed expenses with that owner whose from_bucket is their Account.
 */
export function sumFreeGuiltySpentFromAccount(
  transactions: TransactionWithCategory[],
  accountBucketId: string | null,
  owner: Owner,
): number {
  if (!accountBucketId) return 0
  let sum = 0
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.complete_later) continue
    if (tx.owner !== owner) continue
    if (tx.from_bucket_id !== accountBucketId) continue
    sum += tx.amount
  }
  return sum
}

export interface FreeGuiltyOwnerProgress {
  owner: Owner
  allowance: number
  spent: number
  /** Share of Needs/Wants estimate overspend borrowed from Free Guilty. */
  borrowed: number
  /** allowance − spent − borrowed (floored at 0). */
  remaining: number
}

export interface FreeGuiltyProgress {
  suami: FreeGuiltyOwnerProgress
  istri: FreeGuiltyOwnerProgress
  /** Total estimate-line overspend assigned to Free Guilty. */
  borrowedTotal: number
}

/**
 * Remaining Free Guilty per profile.
 * borrowedTotal (estimate overspend) is split 50/50 like Free Guilty itself.
 */
export function buildFreeGuiltyProgress(input: {
  allowanceSuami: number
  allowanceIstri: number
  spentSuami: number
  spentIstri: number
  borrowedTotal?: number
}): FreeGuiltyProgress {
  const borrowedTotal = Math.max(0, Math.round(input.borrowedTotal ?? 0))
  const borrowSplit = freeGuiltySplitAmounts(borrowedTotal)

  function row(
    owner: Owner,
    allowance: number,
    spent: number,
    borrowed: number,
  ): FreeGuiltyOwnerProgress {
    const safeAllowance = Math.max(0, allowance)
    const safeSpent = Math.max(0, spent)
    const safeBorrowed = Math.max(0, borrowed)
    return {
      owner,
      allowance: safeAllowance,
      spent: safeSpent,
      borrowed: safeBorrowed,
      remaining: Math.max(0, safeAllowance - safeSpent - safeBorrowed),
    }
  }

  return {
    suami: row(
      'suami',
      input.allowanceSuami,
      input.spentSuami,
      borrowSplit.suami,
    ),
    istri: row(
      'istri',
      input.allowanceIstri,
      input.spentIstri,
      borrowSplit.istri,
    ),
    borrowedTotal,
  }
}
