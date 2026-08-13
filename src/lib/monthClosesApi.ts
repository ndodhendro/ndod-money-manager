import { supabase } from './supabase'
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
    'Run migrate_month_closes.sql in Supabase to enable Close Month',
  )
}

function mapClose(row: Record<string, unknown>): MonthClose {
  return {
    id: String(row.id),
    year_month: String(row.year_month),
    income: Number(row.income ?? 0),
    planned_needs: Number(row.planned_needs ?? 0),
    planned_wants: Number(row.planned_wants ?? 0),
    buffer_allowance: Number(row.buffer_allowance ?? 0),
    buffer_used: Number(row.buffer_used ?? 0),
    buffer_remaining: Number(row.buffer_remaining ?? 0),
    guilt_free_allowance: Number(row.guilt_free_allowance ?? 0),
    guilt_free_used: Number(row.guilt_free_used ?? 0),
    guilt_free_remaining: Number(row.guilt_free_remaining ?? 0),
    buffer_to_ef: Number(row.buffer_to_ef ?? 0),
    buffer_to_investment: Number(row.buffer_to_investment ?? 0),
    buffer_to_buffer: Number(row.buffer_to_buffer ?? 0),
    buffer_to_guilt_free: Number(row.buffer_to_guilt_free ?? 0),
    guilt_free_to_ef: Number(row.guilt_free_to_ef ?? 0),
    guilt_free_to_investment: Number(row.guilt_free_to_investment ?? 0),
    guilt_free_to_buffer: Number(row.guilt_free_to_buffer ?? 0),
    guilt_free_to_guilt_free: Number(row.guilt_free_to_guilt_free ?? 0),
    opening_buffer_next: Number(row.opening_buffer_next ?? 0),
    opening_guilt_free_next: Number(row.opening_guilt_free_next ?? 0),
    closed_at: String(row.closed_at),
    reopened_at:
      row.reopened_at == null ? null : String(row.reopened_at),
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

export function allocationTotals(alloc: MonthCloseAllocation): number {
  return (
    Math.round(alloc.ef) +
    Math.round(alloc.investment) +
    Math.round(alloc.buffer) +
    Math.round(alloc.guiltFree)
  )
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
  bufferAllocation: MonthCloseAllocation
  guiltFreeAllocation: MonthCloseAllocation
}): Promise<MonthClose> {
  const bufferSum = allocationTotals(input.bufferAllocation)
  const gfSum = allocationTotals(input.guiltFreeAllocation)
  if (bufferSum !== Math.round(input.bufferRemaining)) {
    throw new Error('Buffer allocation must total 100% of remaining')
  }
  if (gfSum !== Math.round(input.guiltFreeRemaining)) {
    throw new Error('Guilt-Free allocation must total 100% of remaining')
  }

  const opening_buffer_next =
    Math.round(input.bufferAllocation.buffer) +
    Math.round(input.guiltFreeAllocation.buffer)
  const opening_guilt_free_next =
    Math.round(input.bufferAllocation.guiltFree) +
    Math.round(input.guiltFreeAllocation.guiltFree)

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
    buffer_to_ef: input.bufferAllocation.ef,
    buffer_to_investment: input.bufferAllocation.investment,
    buffer_to_buffer: input.bufferAllocation.buffer,
    buffer_to_guilt_free: input.bufferAllocation.guiltFree,
    guilt_free_to_ef: input.guiltFreeAllocation.ef,
    guilt_free_to_investment: input.guiltFreeAllocation.investment,
    guilt_free_to_buffer: input.guiltFreeAllocation.buffer,
    guilt_free_to_guilt_free: input.guiltFreeAllocation.guiltFree,
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
