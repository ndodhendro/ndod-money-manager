import { BUCKET_KIND_ORDER, compareBucketNameAsc } from './bucketsGroup'
import { supabase } from './supabase'
import type { BudgetGroup, Bucket, BucketKind } from './types'
import { OWNER_ACCOUNT_LABELS } from './types'

const CHECKING_SYSTEM_ACCOUNTS: Array<{
  name: string
  icon: string
  sort_order: number
}> = [
  { name: OWNER_ACCOUNT_LABELS.suami, icon: '💙', sort_order: 0 },
  { name: OWNER_ACCOUNT_LABELS.istri, icon: '💗', sort_order: 0 },
]

function mapBudgetGroup(value: unknown): BudgetGroup | null {
  if (value === 'needs' || value === 'wants') {
    return value
  }
  return null
}

function mapBucket(row: Record<string, unknown>): Bucket {
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as BucketKind,
    icon: String(row.icon ?? '🏦'),
    target_amount:
      row.target_amount == null ? null : Number(row.target_amount),
    opening_balance: Number(row.opening_balance ?? 0),
    budget_group: mapBudgetGroup(row.budget_group),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    is_system: Boolean(row.is_system),
    created_at: String(row.created_at),
  }
}

function isMissingBudgetGroupColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('budget_group') ||
    (lower.includes('schema cache') && lower.includes('budget'))
  )
}

function migrateBudgetGroupHint(): Error {
  return new Error(
    'Run migrate_buckets_budget_group.sql in Supabase to enable Needs/Wants on sinking funds',
  )
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
  for (const account of CHECKING_SYSTEM_ACCOUNTS) {
    const hasAccount = existing.some(
      (b) =>
        b.kind === 'checking' &&
        b.is_system &&
        b.name === account.name,
    )
    if (hasAccount) continue
    rows.push({
      name: account.name,
      kind: 'checking',
      icon: account.icon,
      sort_order: account.sort_order,
      is_system: true,
      opening_balance: 0,
    })
  }
  if (rows.length === 0) return
  const { error } = await supabase.from('buckets').insert(rows)
  if (error) {
    // checking enum / index may be missing until migrate_buckets_checking_accounts.sql
    const lower = error.message.toLowerCase()
    if (
      lower.includes('checking') ||
      lower.includes('bucket_kind') ||
      lower.includes('invalid input value')
    ) {
      const withoutChecking = rows.filter((r) => r.kind !== 'checking')
      if (withoutChecking.length === 0) return
      const retry = await supabase.from('buckets').insert(withoutChecking)
      if (retry.error) throw new Error(retry.error.message)
      return
    }
    throw new Error(error.message)
  }
}

export type NewBucketInput = {
  name: string
  kind: BucketKind
  icon: string
  target_amount: number
  opening_balance: number
  /** Required for sinking funds: needs or wants. */
  budget_group: 'needs' | 'wants'
}

/**
 * Persist sort_order: kind section order, then name ascending within each kind.
 * Active buckets only (inactive keep their last sort_order).
 */
export async function reorderBucketsByNameWithinKinds(): Promise<void> {
  const buckets = await fetchBuckets()
  const byKind = new Map<BucketKind, Bucket[]>()
  for (const kind of BUCKET_KIND_ORDER) byKind.set(kind, [])
  for (const b of buckets) {
    const list = byKind.get(b.kind) ?? []
    list.push(b)
    byKind.set(b.kind, list)
  }

  let order = 1
  const pending: Array<PromiseLike<{ error: { message: string } | null }>> =
    []
  for (const kind of BUCKET_KIND_ORDER) {
    const items = [...(byKind.get(kind) ?? [])].sort((a, b) =>
      compareBucketNameAsc(a.name, b.name),
    )
    for (const b of items) {
      if (b.sort_order !== order) {
        pending.push(
          supabase.from('buckets').update({ sort_order: order }).eq('id', b.id),
        )
      }
      order += 1
    }
  }
  if (pending.length === 0) return
  const results = await Promise.all(pending)
  for (const result of results) {
    if (result.error) throw new Error(result.error.message)
  }
}

/** Inactive sinking funds matching name + icon (revive candidates). */
async function findInactiveBucketMatches(input: {
  name: string
  icon: string
}): Promise<Bucket[]> {
  const { data, error } = await supabase
    .from('buckets')
    .select('*')
    .eq('is_active', false)
    .eq('is_system', false)
    .eq('kind', 'sinking')
    .eq('name', input.name)
    .eq('icon', input.icon)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => mapBucket(row as Record<string, unknown>))
}

/**
 * Add sinking fund. Revives one exact name+icon inactive row when found.
 * On revive, target_amount and opening_balance come from current input
 * (not from the soft-deleted history values).
 * After save, active buckets are reordered by name within each kind section.
 */
export async function createBucket(input: NewBucketInput): Promise<Bucket> {
  if (input.kind === 'emergency' || input.kind === 'investment') {
    throw new Error('System buckets already exist')
  }
  if (input.kind === 'checking') {
    throw new Error('Personal accounts are system buckets')
  }
  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  const icon = input.icon || '🏦'
  const target_amount = Number(input.target_amount)
  if (!Number.isFinite(target_amount) || target_amount <= 0) {
    throw new Error('Target amount is required')
  }
  if (input.budget_group !== 'needs' && input.budget_group !== 'wants') {
    throw new Error('Pick Needs or Wants for this sinking fund')
  }
  const opening_balance = Number.isFinite(input.opening_balance)
    ? Math.max(0, input.opening_balance)
    : 0
  const budget_group = input.budget_group

  let createdId: string
  const matches = await findInactiveBucketMatches({ name, icon })
  if (matches.length === 1) {
    const match = matches[0]
    const { data, error } = await supabase
      .from('buckets')
      .update({
        is_active: true,
        target_amount,
        opening_balance,
        budget_group,
      })
      .eq('id', match.id)
      .select('*')
      .single()
    if (error) {
      if (isMissingBudgetGroupColumn(error.message)) throw migrateBudgetGroupHint()
      throw new Error(error.message)
    }
    createdId = String((data as Record<string, unknown>).id)
  } else {
    const { data, error } = await supabase
      .from('buckets')
      .insert({
        name,
        kind: input.kind,
        icon,
        target_amount,
        opening_balance,
        budget_group,
        sort_order: 0,
        is_system: false,
        is_active: true,
      })
      .select('*')
      .single()
    if (error) {
      if (isMissingBudgetGroupColumn(error.message)) throw migrateBudgetGroupHint()
      throw new Error(error.message)
    }
    createdId = String((data as Record<string, unknown>).id)
  }

  await reorderBucketsByNameWithinKinds()
  const refreshed = await fetchBuckets({ includeInactive: true })
  const row = refreshed.find((b) => b.id === createdId)
  if (!row) throw new Error('Bucket not found after save')
  return row
}

export type UpdateBucketInput = {
  name?: string
  icon?: string
  target_amount?: number | null
  opening_balance?: number
  budget_group?: 'needs' | 'wants' | null
  is_active?: boolean
}

export async function updateBucket(
  id: string,
  patch: UpdateBucketInput,
): Promise<Bucket> {
  if (
    patch.budget_group != null &&
    patch.budget_group !== 'needs' &&
    patch.budget_group !== 'wants'
  ) {
    throw new Error('Pick Needs or Wants for this sinking fund')
  }

  // Emergency target is derived from Money Plan; Investment has no overall target.
  const nextPatch: UpdateBucketInput = { ...patch }
  if (nextPatch.target_amount !== undefined) {
    const { data: existing, error: existingError } = await supabase
      .from('buckets')
      .select('kind')
      .eq('id', id)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (existing?.kind === 'emergency' || existing?.kind === 'investment') {
      delete nextPatch.target_amount
    }
    if (existing?.kind === 'checking') {
      delete nextPatch.target_amount
      delete nextPatch.budget_group
    }
  }

  const { data, error } = await supabase
    .from('buckets')
    .update(nextPatch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    if (isMissingBudgetGroupColumn(error.message)) throw migrateBudgetGroupHint()
    throw new Error(error.message)
  }

  if (patch.name != null || patch.is_active != null) {
    await reorderBucketsByNameWithinKinds()
    const refreshed = await fetchBuckets({ includeInactive: true })
    const row = refreshed.find((b) => b.id === id)
    if (row) return row
  }

  return mapBucket(data as Record<string, unknown>)
}

/** Soft-delete: sets is_active=false. System buckets cannot be deleted. */
export async function deleteBucket(id: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from('buckets')
    .select('is_system')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)
  if (row?.is_system) throw new Error('System buckets cannot be deleted')

  const { error } = await supabase
    .from('buckets')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await reorderBucketsByNameWithinKinds()
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
