import { supabase } from './supabase'
import type { Circle } from './types'

export interface RecurringBill {
  id: string
  name: string
  amount: number
  category_id: string | null
  circle: Circle
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface RecurringBillLog {
  id: string
  bill_id: string
  year_month: string
  transaction_id: string | null
  completed_at: string
}

function mapBill(row: Record<string, unknown>): RecurringBill {
  return {
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount),
    category_id: (row.category_id as string | null) ?? null,
    circle: row.circle as Circle,
    icon: String(row.icon ?? '📌'),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  }
}

function mapLog(row: Record<string, unknown>): RecurringBillLog {
  return {
    id: String(row.id),
    bill_id: String(row.bill_id),
    year_month: String(row.year_month),
    transaction_id: (row.transaction_id as string | null) ?? null,
    completed_at: String(row.completed_at),
  }
}

export function isMissingRecurringSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('recurring_bill') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  )
}

export async function fetchRecurringBills(options?: {
  includeInactive?: boolean
}): Promise<RecurringBill[]> {
  let query = supabase
    .from('recurring_bills')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapBill(row as Record<string, unknown>))
}

export async function fetchRecurringBillLogs(
  yearMonth: string,
): Promise<RecurringBillLog[]> {
  const { data, error } = await supabase
    .from('recurring_bill_logs')
    .select('*')
    .eq('year_month', yearMonth)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapLog(row as Record<string, unknown>))
}

export type NewRecurringBillInput = {
  name: string
  amount: number
  category_id: string | null
  circle: Circle
  icon: string
}

export async function createRecurringBill(
  input: NewRecurringBillInput,
): Promise<RecurringBill> {
  const { data: maxRow } = await supabase
    .from('recurring_bills')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = Number(maxRow?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from('recurring_bills')
    .insert({
      name: input.name.trim(),
      amount: input.amount,
      category_id: input.category_id,
      circle: input.circle,
      icon: input.icon || '📌',
      sort_order: sortOrder,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapBill(data as Record<string, unknown>)
}

export async function updateRecurringBill(
  id: string,
  patch: Partial<{
    name: string
    amount: number
    category_id: string | null
    circle: Circle
    icon: string
    is_active: boolean
  }>,
): Promise<RecurringBill> {
  const { data, error } = await supabase
    .from('recurring_bills')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapBill(data as Record<string, unknown>)
}

export async function deleteRecurringBill(id: string): Promise<void> {
  const { error } = await supabase.from('recurring_bills').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function markBillPaid(input: {
  billId: string
  yearMonth: string
  transactionId: string
}): Promise<RecurringBillLog> {
  const { data, error } = await supabase
    .from('recurring_bill_logs')
    .upsert(
      {
        bill_id: input.billId,
        year_month: input.yearMonth,
        transaction_id: input.transactionId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'bill_id,year_month' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapLog(data as Record<string, unknown>)
}

export async function unmarkBillPaid(
  billId: string,
  yearMonth: string,
): Promise<{ transactionId: string | null }> {
  const { data: existing, error: fetchError } = await supabase
    .from('recurring_bill_logs')
    .select('transaction_id')
    .eq('bill_id', billId)
    .eq('year_month', yearMonth)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)

  const { error } = await supabase
    .from('recurring_bill_logs')
    .delete()
    .eq('bill_id', billId)
    .eq('year_month', yearMonth)
  if (error) throw new Error(error.message)

  return {
    transactionId: (existing?.transaction_id as string | null) ?? null,
  }
}
