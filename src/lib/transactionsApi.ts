import { supabase } from './supabase'
import type { NewTransactionInput, TransactionWithCategory } from './types'

export async function fetchTransactions(range: {
  start: string
  end: string
}): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, category:categories(*, parent:categories!parent_id(*))')
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as TransactionWithCategory[]
}

export async function createTransaction(
  input: NewTransactionInput,
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    type: input.type,
    category_id: input.category_id,
    amount: input.amount,
    description: input.description || null,
    owner: input.owner,
    occurred_on: input.occurred_on,
    is_recurring: input.is_recurring,
  })
  if (error) throw error
}

export async function updateTransaction(
  id: string,
  input: NewTransactionInput,
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      type: input.type,
      category_id: input.category_id,
      amount: input.amount,
      description: input.description || null,
      owner: input.owner,
      occurred_on: input.occurred_on,
      is_recurring: input.is_recurring,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}
