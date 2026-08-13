/**
 * Close Month smart defaults for 2×4 allocation (Needs Side / Wants Side).
 */

import type { MonthCloseAllocation } from './types'

export const ZERO_CLOSE_ALLOC: MonthCloseAllocation = {
  ef: 0,
  investment: 0,
  buffer: 0,
  guiltFree: 0,
}

export function allocationSum(a: MonthCloseAllocation): number {
  return Math.round(a.ef + a.investment + a.buffer + a.guiltFree)
}

/**
 * Needs Side = Planned Needs remaining + Buffer remaining.
 * If owedToEf > 0: fill EF first (up to debt), rest → Buffer carry.
 * Else: 100% Buffer carry.
 */
export function defaultNeedsSideAllocation(
  needsSideRemaining: number,
  owedToEf: number,
): MonthCloseAllocation {
  const remaining = Math.max(0, Math.round(needsSideRemaining))
  if (remaining <= 0) return { ...ZERO_CLOSE_ALLOC }
  const debt = Math.max(0, Math.round(owedToEf))
  const toEf = Math.min(remaining, debt)
  const toBuffer = remaining - toEf
  return {
    ef: toEf,
    investment: 0,
    buffer: toBuffer,
    guiltFree: 0,
  }
}

/**
 * Wants Side = Planned Wants remaining + Guilt-Free remaining.
 * Default: 100% Guilt-Free rollover.
 */
export function defaultWantsSideAllocation(
  wantsSideRemaining: number,
): MonthCloseAllocation {
  const remaining = Math.max(0, Math.round(wantsSideRemaining))
  if (remaining <= 0) return { ...ZERO_CLOSE_ALLOC }
  return {
    ef: 0,
    investment: 0,
    buffer: 0,
    guiltFree: remaining,
  }
}
