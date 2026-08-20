import { createTransaction } from './transactionsApi'
import type { BudgetGroup, MonthCloseAllocation, Owner } from './types'

/** Default split for a manual sinking surplus move. */
export function defaultSinkingAllocation(
  amount: number,
  budgetGroup: BudgetGroup | null | undefined,
): MonthCloseAllocation {
  const n = Math.max(0, Math.round(amount))
  if (n <= 0) return { ef: 0, investment: 0, buffer: 0, guiltFree: 0 }
  if (budgetGroup === 'wants') {
    return { ef: 0, investment: 0, buffer: 0, guiltFree: n }
  }
  return { ef: 0, investment: 0, buffer: n, guiltFree: 0 }
}

/** Surplus above target (display balance is already floored at 0). */
export function sinkingSurplus(balance: number, target: number): number {
  return Math.max(0, Math.round(balance) - Math.max(0, Math.round(target)))
}

/** Move part of a sinking bucket into the four Close Month destinations. */
export async function executeSinkingAllocation(input: {
  bucketId: string
  bucketName: string
  allocation: MonthCloseAllocation
  occurredOn: string
  owner: Owner
  emergencyId: string
  investmentId: string
}): Promise<{ toEf: number }> {
  const baseDesc = `Allocate · ${input.bucketName}`
  let toEf = 0

  if (input.allocation.ef > 0) {
    await createTransaction({
      type: 'transfer',
      category_id: null,
      from_bucket_id: input.bucketId,
      to_bucket_id: input.emergencyId,
      amount: input.allocation.ef,
      description: `${baseDesc} → Emergency Fund`,
      owner: input.owner,
      circle: 'hd_family',
      occurred_on: input.occurredOn,
      is_recurring: false,
      complete_later: false,
      budget_group: null,
    })
    toEf = input.allocation.ef
  }
  if (input.allocation.investment > 0) {
    await createTransaction({
      type: 'transfer',
      category_id: null,
      from_bucket_id: input.bucketId,
      to_bucket_id: input.investmentId,
      amount: input.allocation.investment,
      description: `${baseDesc} → Investment Transit`,
      owner: input.owner,
      circle: 'hd_family',
      occurred_on: input.occurredOn,
      is_recurring: false,
      complete_later: false,
      budget_group: null,
    })
  }
  for (const [amount, label] of [
    [input.allocation.buffer, 'Buffer carry'],
    [input.allocation.guiltFree, 'Guilt-Free carry'],
  ] as const) {
    if (amount <= 0) continue
    await createTransaction({
      type: 'transfer',
      category_id: null,
      from_bucket_id: input.bucketId,
      to_bucket_id: null,
      amount,
      description: `${baseDesc} → ${label}`,
      owner: input.owner,
      circle: 'hd_family',
      occurred_on: input.occurredOn,
      is_recurring: false,
      complete_later: false,
      budget_group: null,
    })
  }
  return { toEf }
}
