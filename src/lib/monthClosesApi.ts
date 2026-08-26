import { supabase } from './supabase'
import { allocationSum } from './closeMonthDefaults'
import type { MonthClose, MonthCloseAllocation } from './types'

function isMissingMonthClosesSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('month_closes') ||
    (lower.includes('schema cache') && lower.includes('month_close'))
  )
}

function migrateHint(): Error {
  return new Error(
    'Run migrate_month_closes.sql and migrate_month_closes_sides.sql in Supabase to enable Close Month',
  )
}

function num(row: Record<string, unknown>, key: string, fallback = 0): number {
  const v = row[key]
  if (v == null) return fallback
  return Number(v)
}

function mapClose(row: Record<string, unknown>): MonthClose {
  const needsEf = num(row, 'needs_side_to_ef', num(row, 'buffer_to_ef'))
  const needsInv = num(
    row,
    'needs_side_to_investment',
    num(row, 'buffer_to_investment'),
  )
  const needsBuf = num(
    row,
    'needs_side_to_buffer',
    num(row, 'buffer_to_buffer'),
  )
  const needsGf = num(
    row,
    'needs_side_to_guilt_free',
    num(row, 'buffer_to_guilt_free'),
  )
  const wantsEf = num(row, 'wants_side_to_ef', num(row, 'guilt_free_to_ef'))
  const wantsInv = num(
    row,
    'wants_side_to_investment',
    num(row, 'guilt_free_to_investment'),
  )
  const wantsBuf = num(
    row,
    'wants_side_to_buffer',
    num(row, 'guilt_free_to_buffer'),
  )
  const wantsGf = num(
    row,
    'wants_side_to_guilt_free',
    num(row, 'guilt_free_to_guilt_free'),
  )

  return {
    id: String(row.id),
    year_month: String(row.year_month),
    income: num(row, 'income'),
    planned_needs: num(row, 'planned_needs'),
    planned_wants: num(row, 'planned_wants'),
    buffer_allowance: num(row, 'buffer_allowance'),
    buffer_used: num(row, 'buffer_used'),
    buffer_remaining: num(row, 'buffer_remaining'),
    guilt_free_allowance: num(row, 'guilt_free_allowance'),
    guilt_free_used: num(row, 'guilt_free_used'),
    guilt_free_remaining: num(row, 'guilt_free_remaining'),
    planned_needs_remaining: num(row, 'planned_needs_remaining'),
    planned_wants_remaining: num(row, 'planned_wants_remaining'),
    needs_side_to_ef: needsEf,
    needs_side_to_investment: needsInv,
    needs_side_to_buffer: needsBuf,
    needs_side_to_guilt_free: needsGf,
    wants_side_to_ef: wantsEf,
    wants_side_to_investment: wantsInv,
    wants_side_to_buffer: wantsBuf,
    wants_side_to_guilt_free: wantsGf,
    buffer_to_ef: needsEf,
    buffer_to_investment: needsInv,
    buffer_to_buffer: needsBuf,
    buffer_to_guilt_free: needsGf,
    guilt_free_to_ef: wantsEf,
    guilt_free_to_investment: wantsInv,
    guilt_free_to_buffer: wantsBuf,
    guilt_free_to_guilt_free: wantsGf,
    opening_buffer_next: num(row, 'opening_buffer_next'),
    opening_guilt_free_next: num(row, 'opening_guilt_free_next'),
    closed_at: String(row.closed_at),
    reopened_at: row.reopened_at == null ? null : String(row.reopened_at),
  }
}

export async function fetchMonthClose(
  yearMonth: string,
): Promise<MonthClose | null> {
  const { data, error } = await supabase
    .from('month_closes')
    .select('*')
    .eq('year_month', yearMonth)
    .is('reopened_at', null)
    .maybeSingle()

  if (error) {
    if (isMissingMonthClosesSchema(error.message)) return null
    throw error
  }
  if (!data) return null
  return mapClose(data as Record<string, unknown>)
}

export async function fetchAllMonthCloses(): Promise<MonthClose[]> {
  const { data, error } = await supabase
    .from('month_closes')
    .select('*')
    .is('reopened_at', null)
    .order('year_month', { ascending: true })
  if (error) {
    if (isMissingMonthClosesSchema(error.message)) return []
    throw error
  }
  return (data ?? []).map((row) => mapClose(row as Record<string, unknown>))
}

export async function hasAnyMonthClose(): Promise<boolean> {
  const { count, error } = await supabase
    .from('month_closes')
    .select('id', { count: 'exact', head: true })
    .is('reopened_at', null)
  if (error) {
    if (isMissingMonthClosesSchema(error.message)) return false
    throw error
  }
  return (count ?? 0) > 0
}

export async function isMonthClosed(yearMonth: string): Promise<boolean> {
  const row = await fetchMonthClose(yearMonth)
  return row != null
}

/** Opening Buffer / Guilt-Free carry into `yearMonth` from the prior close. */
export async function fetchOpeningCarryForMonth(yearMonth: string): Promise<{
  openingBufferCarry: number
  openingGuiltFreeCarry: number
}> {
  const [y, m] = yearMonth.split('-').map(Number)
  if (!y || !m) {
    return { openingBufferCarry: 0, openingGuiltFreeCarry: 0 }
  }
  const prev = new Date(y, m - 2, 1)
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  const prior = await fetchMonthClose(prevYm)
  if (!prior) {
    return { openingBufferCarry: 0, openingGuiltFreeCarry: 0 }
  }
  return {
    openingBufferCarry: Math.max(0, Math.round(prior.opening_buffer_next)),
    openingGuiltFreeCarry: Math.max(
      0,
      Math.round(prior.opening_guilt_free_next),
    ),
  }
}

/** @deprecated Use allocationSum from closeMonthDefaults. */
export function allocationTotals(alloc: MonthCloseAllocation): number {
  return allocationSum(alloc)
}

export async function saveMonthClose(input: {
  yearMonth: string
  income: number
  plannedNeeds: number
  plannedWants: number
  bufferAllowance: number
  bufferUsed: number
  bufferRemaining: number
  guiltFreeAllowance: number
  guiltFreeUsed: number
  guiltFreeRemaining: number
  plannedNeedsRemaining: number
  plannedWantsRemaining: number
  needsSideRemaining: number
  wantsSideRemaining: number
  needsSideAllocation: MonthCloseAllocation
  wantsSideAllocation: MonthCloseAllocation
}): Promise<MonthClose> {
  const needsSum = allocationSum(input.needsSideAllocation)
  const wantsSum = allocationSum(input.wantsSideAllocation)
  if (needsSum !== Math.round(input.needsSideRemaining)) {
    throw new Error('Needs Side allocation must total 100% of remaining')
  }
  if (wantsSum !== Math.round(input.wantsSideRemaining)) {
    throw new Error('Wants Side allocation must total 100% of remaining')
  }

  const n = input.needsSideAllocation
  const w = input.wantsSideAllocation
  const opening_buffer_next = Math.round(n.buffer) + Math.round(w.buffer)
  const opening_guilt_free_next =
    Math.round(n.guiltFree) + Math.round(w.guiltFree)

  const row = {
    year_month: input.yearMonth,
    income: input.income,
    planned_needs: input.plannedNeeds,
    planned_wants: input.plannedWants,
    buffer_allowance: input.bufferAllowance,
    buffer_used: input.bufferUsed,
    buffer_remaining: input.bufferRemaining,
    guilt_free_allowance: input.guiltFreeAllowance,
    guilt_free_used: input.guiltFreeUsed,
    guilt_free_remaining: input.guiltFreeRemaining,
    planned_needs_remaining: input.plannedNeedsRemaining,
    planned_wants_remaining: input.plannedWantsRemaining,
    needs_side_to_ef: n.ef,
    needs_side_to_investment: n.investment,
    needs_side_to_buffer: n.buffer,
    needs_side_to_guilt_free: n.guiltFree,
    wants_side_to_ef: w.ef,
    wants_side_to_investment: w.investment,
    wants_side_to_buffer: w.buffer,
    wants_side_to_guilt_free: w.guiltFree,
    // Legacy mirror
    buffer_to_ef: n.ef,
    buffer_to_investment: n.investment,
    buffer_to_buffer: n.buffer,
    buffer_to_guilt_free: n.guiltFree,
    guilt_free_to_ef: w.ef,
    guilt_free_to_investment: w.investment,
    guilt_free_to_buffer: w.buffer,
    guilt_free_to_guilt_free: w.guiltFree,
    opening_buffer_next,
    opening_guilt_free_next,
    closed_at: new Date().toISOString(),
    reopened_at: null,
  }

  const existing = await fetchMonthClose(input.yearMonth)
  if (existing) {
    const { data, error } = await supabase
      .from('month_closes')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) {
      if (isMissingMonthClosesSchema(error.message)) throw migrateHint()
      throw error
    }
    return mapClose(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('month_closes')
    .insert(row)
    .select('*')
    .single()
  if (error) {
    if (isMissingMonthClosesSchema(error.message)) throw migrateHint()
    throw error
  }
  return mapClose(data as Record<string, unknown>)
}
