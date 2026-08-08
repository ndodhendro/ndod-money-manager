import { clearBillLogsByTransactionId } from './recurringBillsApi'
import { supabase } from './supabase'
import type {
  Bucket,
  Category,
  CategoryWithParent,
  NewTransactionInput,
  Owner,
  TransactionWithCategory,
} from './types'

function attachCategoryParents(
  rows: Array<Record<string, unknown>>,
  parentsById: Map<string, Category>,
): TransactionWithCategory[] {
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

    const fromBucket = (row.from_bucket as Bucket | null | undefined) ?? null
    const toBucket = (row.to_bucket as Bucket | null | undefined) ?? null

    return {
      ...(row as Omit<
        TransactionWithCategory,
        'category' | 'from_bucket' | 'to_bucket' | 'complete_later'
      >),
      category_id: (row.category_id as string | null) ?? null,
      from_bucket_id: (row.from_bucket_id as string | null) ?? null,
      to_bucket_id: (row.to_bucket_id as string | null) ?? null,
      complete_later: row.complete_later === true,
      category: withParent,
      from_bucket: fromBucket,
      to_bucket: toBucket,
    }
  })
}

async function loadParentMap(
  rows: Array<Record<string, unknown>>,
): Promise<Map<string, Category>> {
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
  return parentsById
}

export async function fetchTransactions(range: {
  start: string
  end: string
}): Promise<TransactionWithCategory[]> {
  const withBuckets =
    '*, category:categories(*), from_bucket:buckets!from_bucket_id(*), to_bucket:buckets!to_bucket_id(*)'
  const withoutBuckets = '*, category:categories(*)'

  let data: unknown[] | null = null
  let error: { message: string } | null = null

  const primary = await supabase
    .from('transactions')
    .select(withBuckets)
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (primary.error && isMissingBucketsSchema(primary.error.message)) {
    // Migrasi buckets belum dijalankan — History tetap bisa load.
    const fallback = await supabase
      .from('transactions')
      .select(withoutBuckets)
      .gte('occurred_on', range.start)
      .lte('occurred_on', range.end)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
    data = fallback.data
    error = fallback.error
  } else {
    data = primary.data
    error = primary.error
  }

  if (error) throw error

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const parentsById = await loadParentMap(rows)
  return attachCategoryParents(rows, parentsById)
}

function isMissingBucketsSchema(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('buckets') ||
    lower.includes('from_bucket_id') ||
    lower.includes('to_bucket_id') ||
    lower.includes('could not find a relationship') ||
    lower.includes('schema cache')
  )
}

function validateInput(input: NewTransactionInput): void {
  if (input.complete_later) {
    if (!input.description.trim()) {
      throw new Error('Note is required for Complete Later')
    }
    if (input.amount < 0) throw new Error('Amount cannot be negative')
    if (
      input.type === 'transfer' &&
      input.from_bucket_id != null &&
      input.to_bucket_id != null &&
      input.from_bucket_id === input.to_bucket_id
    ) {
      throw new Error('Pick different from and to')
    }
    return
  }

  if (input.amount <= 0) throw new Error('Amount must be greater than 0')

  if (input.type === 'transfer') {
    if (input.from_bucket_id === input.to_bucket_id) {
      throw new Error('Pick different from and to')
    }
    if (!input.from_bucket_id && !input.to_bucket_id) {
      throw new Error('Transfer needs at least one bucket')
    }
    return
  }

  if (!input.category_id) {
    throw new Error('Category is required')
  }
}

function toBaseRow(input: NewTransactionInput): Record<string, unknown> {
  if (input.type === 'transfer') {
    return {
      type: input.type,
      category_id: null,
      amount: input.amount,
      description: input.description || null,
      owner: input.owner,
      circle: input.circle,
      occurred_on: input.occurred_on,
      is_recurring: input.is_recurring,
      complete_later: input.complete_later,
    }
  }
  return {
    type: input.type,
    category_id: input.category_id,
    amount: input.amount,
    description: input.description || null,
    owner: input.owner,
    circle: input.circle,
    occurred_on: input.occurred_on,
    is_recurring: input.is_recurring,
    complete_later: input.complete_later,
  }
}

/** Include bucket FKs when schema has them (migrate_buckets_transfer.sql). */
function toRow(input: NewTransactionInput): Record<string, unknown> {
  const base = toBaseRow(input)
  if (input.type === 'transfer') {
    return {
      ...base,
      from_bucket_id: input.from_bucket_id,
      to_bucket_id: input.to_bucket_id,
    }
  }
  return {
    ...base,
    from_bucket_id: null,
    to_bucket_id: null,
  }
}

function throwWriteError(
  error: { message: string },
  input: NewTransactionInput,
): never {
  if (isMissingBucketsSchema(error.message) && input.type === 'transfer') {
    throw new Error(
      'Run migrate_buckets_transfer.sql in Supabase to enable transfers',
    )
  }
  throw new Error(error.message)
}

export async function createTransaction(
  input: NewTransactionInput,
): Promise<string> {
  validateInput(input)

  const withBuckets = toRow(input)
  let result = await supabase
    .from('transactions')
    .insert(withBuckets)
    .select('id')
    .single()

  // Expense/income still work before buckets migration (omit unknown columns).
  if (
    result.error &&
    input.type !== 'transfer' &&
    isMissingBucketsSchema(result.error.message)
  ) {
    result = await supabase
      .from('transactions')
      .insert(toBaseRow(input))
      .select('id')
      .single()
  }

  if (result.error) throwWriteError(result.error, input)
  return result.data.id as string
}

export async function updateTransaction(
  id: string,
  input: NewTransactionInput,
): Promise<void> {
  validateInput(input)

  let { error } = await supabase
    .from('transactions')
    .update(toRow(input))
    .eq('id', id)

  if (
    error &&
    input.type !== 'transfer' &&
    isMissingBucketsSchema(error.message)
  ) {
    ;({ error } = await supabase
      .from('transactions')
      .update(toBaseRow(input))
      .eq('id', id))
  }

  if (error) throwWriteError(error, input)
}

export async function deleteTransaction(id: string): Promise<void> {
  // Remove checklist "checked" state before the tx row goes away
  // (FK is ON DELETE SET NULL, which would leave the item checked).
  await clearBillLogsByTransactionId(id)

  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Unique recent notes for a category, scoped to the active profile. */
export async function fetchNoteSuggestions(
  categoryId: string,
  owner: Owner,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('description')
    .eq('category_id', categoryId)
    .eq('owner', owner)
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
