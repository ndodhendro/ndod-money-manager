import { supabase } from './supabase'
import type { Bucket, BucketKind } from './types'

function mapBucket(row: Record<string, unknown>): Bucket {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as BucketKind,
    icon: String(row.icon ?? '🏦'),
    target_amount:
      row.target_amount == null ? null : Number(row.target_amount),
    opening_balance: Number(row.opening_balance ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    is_system: Boolean(row.is_system),
    created_at: String(row.created_at),
  }
}

export async function fetchBuckets(options?: {
  includeInactive?: boolean
}): Promise<Bucket[]> {
  let query = supabase
    .from('buckets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapBucket(row as Record<string, unknown>))
}

export async function ensureSystemBuckets(): Promise<void> {
  const existing = await fetchBuckets({ includeInactive: true })
  const hasEmergency = existing.some(
    (b) => b.kind === 'emergency' && b.is_system,
  )
  const hasInvestment = existing.some(
    (b) => b.kind === 'investment' && b.is_system,
  )
  const rows: Array<Record<string, unknown>> = []
  if (!hasEmergency) {
    rows.push({
      name: 'Emergency Fund',
      kind: 'emergency',
      icon: '🛟',
      sort_order: 1,
      is_system: true,
      opening_balance: 0,
    })
  }
  if (!hasInvestment) {
    rows.push({
      name: 'Investment',
      kind: 'investment',
      icon: '📈',
      sort_order: 2,
      is_system: true,
      opening_balance: 0,
    })
  }
  if (rows.length === 0) return
  const { error } = await supabase.from('buckets').insert(rows)
  if (error) throw new Error(error.message)
}

export type NewBucketInput = {
  name: string
  kind: BucketKind
  icon: string
  target_amount: number | null
  opening_balance: number
}

export async function createBucket(input: NewBucketInput): Promise<Bucket> {
  if (input.kind === 'emergency' || input.kind === 'investment') {
    throw new Error('System buckets already exist')
  }
  const { data: maxRow } = await supabase
    .from('buckets')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = Number(maxRow?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from('buckets')
    .insert({
      name: input.name.trim(),
      kind: input.kind,
      icon: input.icon || '🏦',
      target_amount: input.target_amount,
      opening_balance: input.opening_balance,
      sort_order: sortOrder,
      is_system: false,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapBucket(data as Record<string, unknown>)
}

export type UpdateBucketInput = {
  name?: string
  icon?: string
  target_amount?: number | null
  opening_balance?: number
  is_active?: boolean
}

export async function updateBucket(
  id: string,
  patch: UpdateBucketInput,
): Promise<Bucket> {
  const { data, error } = await supabase
    .from('buckets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapBucket(data as Record<string, unknown>)
}

/** Ledger movements for balance: all transfer rows. */
export async function fetchTransferMovements(): Promise<
  Array<{
    amount: number
    from_bucket_id: string | null
    to_bucket_id: string | null
    occurred_on: string
  }>
> {
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, from_bucket_id, to_bucket_id, occurred_on')
    .eq('type', 'transfer')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    amount: Number(row.amount),
    from_bucket_id: (row.from_bucket_id as string | null) ?? null,
    to_bucket_id: (row.to_bucket_id as string | null) ?? null,
    occurred_on: String(row.occurred_on),
  }))
}

export function computeBucketBalances(
  buckets: Bucket[],
  movements: Array<{
    amount: number
    from_bucket_id: string | null
    to_bucket_id: string | null
  }>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const b of buckets) {
    map.set(b.id, b.opening_balance)
  }
  for (const m of movements) {
    if (m.to_bucket_id && map.has(m.to_bucket_id)) {
      map.set(m.to_bucket_id, (map.get(m.to_bucket_id) ?? 0) + m.amount)
    }
    if (m.from_bucket_id && map.has(m.from_bucket_id)) {
      map.set(m.from_bucket_id, (map.get(m.from_bucket_id) ?? 0) - m.amount)
    }
  }
  return map
}

/** Sum of transfers into a bucket within an optional date range. */
export function sumTransfersInto(
  movements: Array<{
    amount: number
    to_bucket_id: string | null
    occurred_on: string
  }>,
  bucketId: string,
  range?: { start: string; end: string },
): number {
  let sum = 0
  for (const m of movements) {
    if (m.to_bucket_id !== bucketId) continue
    if (range) {
      if (m.occurred_on < range.start || m.occurred_on > range.end) continue
    }
    sum += m.amount
  }
  return sum
}
