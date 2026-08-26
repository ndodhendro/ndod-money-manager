import { clearBillLogsByTransactionId } from './recurringBillsApi'
import { deleteEfLoanForTransaction } from './efLoansApi'
import {
  fetchBucketMovements,
  fetchBuckets,
  sinkingInflowDeleteBlockReason,
} from './bucketsApi'
import { supabase } from './supabase'
import type {
  Bucket,
  Category,
  CategoryWithParent,
  NewTransactionInput,
  Owner,
  TransactionWithCategory,
} from './types'
import { isBudgetGroup } from './types'

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
      budget_group: isBudgetGroup(row.budget_group) ? row.budget_group : null,
      sort_order: Number(row.sort_order ?? 0),
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

type TxQueryResult = {
  data: unknown[] | null
  error: { message: string } | null
}

async function fetchTransactionRows(
  select: string,
  range: { start: string; end: string },
  useSortOrder: boolean,
): Promise<TxQueryResult> {
  let query = supabase
    .from('transactions')
    .select(select)
    .gte('occurred_on', range.start)
    .lte('occurred_on', range.end)
    .order('occurred_on', { ascending: false })
  if (useSortOrder) {
    query = query.order('sort_order', { ascending: false })
  }
  const result = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10000)
  return { data: result.data, error: result.error }
}

async function fetchTransactionRowsWithSortFallback(
  select: string,
  range: { start: string; end: string },
): Promise<TxQueryResult> {
  const withSort = await fetchTransactionRows(select, range, true)
  if (withSort.error && isMissingTxSortOrderColumn(withSort.error.message)) {
    return fetchTransactionRows(select, range, false)
  }
  return withSort
}

export async function fetchTransactions(range: {
  start: string
  end: string
}): Promise<TransactionWithCategory[]> {
  const withBuckets =
    '*, category:categories(*), from_bucket:buckets!from_bucket_id(*), to_bucket:buckets!to_bucket_id(*)'
  const withoutBuckets = '*, category:categories(*)'

  let result = await fetchTransactionRowsWithSortFallback(withBuckets, range)
  if (result.error && isMissingBucketsSchema(result.error.message)) {
    // Migrasi buckets belum dijalankan — History tetap bisa load.
    result = await fetchTransactionRowsWithSortFallback(withoutBuckets, range)
  }

  if (result.error) throw result.error

  const rows = (result.data ?? []) as Array<Record<string, unknown>>
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

function isMissingTxBudgetGroupColumn(message: string): boolean {
  return message.toLowerCase().includes('budget_group')
}

function isMissingTxSortOrderColumn(message: string): boolean {
  return message.toLowerCase().includes('sort_order')
}

function migrateTxBudgetGroupHint(): Error {
  return new Error(
    'Run migrate_tx_estimate_budget_group.sql in Supabase to enable Needs/Wants on transactions',
  )
}

function migrateTxSortOrderHint(): Error {
  return new Error(
    'Run migrate_tx_sort_order.sql in Supabase to enable History reorder',
  )
}

function omitSortOrder(row: Record<string, unknown>): Record<string, unknown> {
  const { sort_order: _, ...rest } = row
  return rest
}

async function nextSortOrderForDate(occurredOn: string): Promise<number> {
  const { data, error } = await supabase
    .from('transactions')
    .select('sort_order')
    .eq('occurred_on', occurredOn)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isMissingTxSortOrderColumn(error.message)) return 1
    throw error
  }
  return Number(data?.sort_order ?? 0) + 1
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
  const budget_group =
    input.type === 'expense' && isBudgetGroup(input.budget_group)
      ? input.budget_group
      : null
  const recurring_bill_id = input.recurring_bill_id ?? null
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
      recurring_bill_id,
      complete_later: input.complete_later,
      budget_group,
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
    recurring_bill_id,
    complete_later: input.complete_later,
    budget_group,
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
  // Expense may spend from a sinking bucket (no app-side transfer to Main).
  if (input.type === 'expense') {
    return {
      ...base,
      from_bucket_id: input.from_bucket_id,
      to_bucket_id: null,
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
  if (isMissingTxBudgetGroupColumn(error.message)) {
    throw migrateTxBudgetGroupHint()
  }
  if (isMissingTxSortOrderColumn(error.message)) {
    throw migrateTxSortOrderHint()
  }
  if (isMissingBucketsSchema(error.message) && input.type === 'transfer') {
    throw new Error(
      'Run migrate_buckets_transfer.sql in Supabase to enable transfers',
    )
  }
  throw new Error(error.message)
}

type TxWriteResult = {
  data: { id: string } | null
  error: { message: string } | null
}

async function insertTransactionRow(
  row: Record<string, unknown>,
): Promise<TxWriteResult> {
  const result = await supabase
    .from('transactions')
    .insert(row)
    .select('id')
    .single()
  if (result.error && isMissingTxSortOrderColumn(result.error.message)) {
    const retry = await supabase
      .from('transactions')
      .insert(omitSortOrder(row))
      .select('id')
      .single()
    return { data: retry.data, error: retry.error }
  }
  return { data: result.data, error: result.error }
}

async function updateTransactionRow(
  id: string,
  row: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const result = await supabase.from('transactions').update(row).eq('id', id)
  if (result.error && isMissingTxSortOrderColumn(result.error.message)) {
    const retry = await supabase
      .from('transactions')
      .update(omitSortOrder(row))
      .eq('id', id)
    return { error: retry.error }
  }
  return { error: result.error }
}

export async function createTransaction(
  input: NewTransactionInput,
): Promise<string> {
  validateInput(input)

  const sortOrder = await nextSortOrderForDate(input.occurred_on)
  const withBuckets = { ...toRow(input), sort_order: sortOrder }
  let result = await insertTransactionRow(withBuckets)

  // Expense/income still work before buckets migration (omit unknown columns).
  if (
    result.error &&
    input.type !== 'transfer' &&
    isMissingBucketsSchema(result.error.message)
  ) {
    result = await insertTransactionRow({
      ...toBaseRow(input),
      sort_order: sortOrder,
    })
  }

  if (result.error) throwWriteError(result.error, input)
  return result.data!.id as string
}

export async function updateTransaction(
  id: string,
  input: NewTransactionInput,
): Promise<void> {
  validateInput(input)

  const row = toRow(input)
  const existing = await supabase
    .from('transactions')
    .select('occurred_on')
    .eq('id', id)
    .single()
  if (
    !existing.error &&
    existing.data &&
    String(existing.data.occurred_on) !== input.occurred_on
  ) {
    row.sort_order = await nextSortOrderForDate(input.occurred_on)
  }

  let { error } = await updateTransactionRow(id, row)

  if (
    error &&
    input.type !== 'transfer' &&
    isMissingBucketsSchema(error.message)
  ) {
    const base = toBaseRow(input)
    if (row.sort_order != null) base.sort_order = row.sort_order
    ;({ error } = await updateTransactionRow(id, base))
  }

  if (error) throwWriteError(error, input)
}

/** Persist intra-day order (1-based) for the given ids. */
export async function reorderTransactions(
  orderedIds: string[],
): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('transactions')
      .update({ sort_order: index + 1 })
      .eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    if (isMissingTxSortOrderColumn(failed.error.message)) {
      throw migrateTxSortOrderHint()
    }
    throw failed.error
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const { data: row, error: loadError } = await supabase
    .from('transactions')
    .select('id, type, to_bucket_id')
    .eq('id', id)
    .maybeSingle()
  if (loadError) throw new Error(loadError.message)
  if (!row) throw new Error('Transaction not found')

  if (row.type === 'transfer' && row.to_bucket_id) {
    const [buckets, movements] = await Promise.all([
      fetchBuckets({ includeInactive: true }),
      fetchBucketMovements(),
    ])
    const block = sinkingInflowDeleteBlockReason({
      transaction: {
        id: String(row.id),
        type: String(row.type),
        to_bucket_id: (row.to_bucket_id as string | null) ?? null,
      },
      buckets,
      movements,
    })
    if (block) throw new Error(block)
  }

  // Remove checklist "checked" state before the tx row goes away
  // (FK is ON DELETE SET NULL, which would leave the item checked).
  await clearBillLogsByTransactionId(id)
  await deleteEfLoanForTransaction(id)

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
