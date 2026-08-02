import { supabase } from './supabase'
import type {
  Category,
  CategoryWithParent,
  NewTransactionInput,
  TransactionWithCategory,
} from './types'

export async function fetchTransactions(range: {
  start: string
  end: string
}): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, category:categories(*)')
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = data ?? []
  const parentIds = [
    ...new Set(
      rows
        .map((row) => {
          const category = row.category as Category | null | undefined
          return category?.parent_id ?? null
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const parentsById = new Map<string, Category>()
  if (parentIds.length > 0) {
    const { data: parents, error: parentError } = await supabase
      .from('categories')
      .select('*')
      .in('id', parentIds)
    if (parentError) throw parentError
    for (const parent of parents ?? []) {
      parentsById.set(parent.id, parent as Category)
    }
  }

  return rows.map((row) => {
    const category = row.category as Category | null
    const withParent: CategoryWithParent | null = category
      ? {
          ...category,
          parent: category.parent_id
            ? (parentsById.get(category.parent_id) ?? null)
            : null,
        }
      : null

    return {
      ...(row as Omit<TransactionWithCategory, 'category'>),
      category: withParent,
    }
  })
}

export async function createTransaction(
  input: NewTransactionInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      type: input.type,
      category_id: input.category_id,
      amount: input.amount,
      description: input.description || null,
      owner: input.owner,
      circle: input.circle,
      occurred_on: input.occurred_on,
      is_recurring: input.is_recurring,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
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
      circle: input.circle,
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

/** Catatan unik (terbaru dulu) untuk kategori/sub-kategori tertentu. */
export async function fetchNoteSuggestions(
  categoryId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('description')
    .eq('category_id', categoryId)
    .not('description', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error

  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const row of data ?? []) {
    const note = (row.description ?? '').trim()
    if (!note) continue
    const key = note.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(note)
    if (suggestions.length >= 15) break
  }
  return suggestions
}
