import {
  BUCKET_KIND_ORDER,
  childrenByParentId,
  compareBucketsWithinKindWithCategories,
  displayBucketBalance,
  type CategorySortRef,
} from './bucketsGroup'
import { supabase } from './supabase'
import type { BudgetGroup, Bucket, BucketKind, Category } from './types'

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
    opening_transfers: Number(row.opening_transfers ?? 0),
    budget_group: mapBudgetGroup(row.budget_group),
    parent_id:
      row.parent_id == null || row.parent_id === ''
        ? null
        : String(row.parent_id),
    category_id:
      row.category_id == null || row.category_id === ''
        ? null
        : String(row.category_id),
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

function isMissingParentColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('parent_id') ||
    (lower.includes('schema cache') && lower.includes('parent'))
  )
}

function isMissingCategoryColumn(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('category_id') ||
    (lower.includes('schema cache') && lower.includes('category'))
  )
}

function migrateBudgetGroupHint(): Error {
  return new Error(
    'Run migrate_buckets_budget_group.sql in Supabase to enable Needs/Wants on sinking funds',
  )
}

function migrateParentHint(): Error {
  return new Error(
    'Run migrate_buckets_parent.sql in Supabase to enable nested savings buckets',
  )
}

function migrateCategoryHint(): Error {
  return new Error(
    'Run migrate_buckets_category.sql in Supabase to link sinking funds to categories',
  )
}

function throwMappedBucketError(message: string): never {
  if (isMissingBudgetGroupColumn(message)) throw migrateBudgetGroupHint()
  if (isMissingParentColumn(message)) throw migrateParentHint()
  if (isMissingCategoryColumn(message)) throw migrateCategoryHint()
  throw new Error(message)
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
  if (error) throwMappedBucketError(error.message)
  return (data ?? []).map((row) => mapBucket(row as Record<string, unknown>))
}

/**
 * Soft-deactivate legacy Ndod/Devi system checking accounts and any Monthly
 * Estimates that transfer into them. Guilt-Free Fund is a single shared pool.
 */
async function retireSystemCheckingAccounts(
  existing: Bucket[],
): Promise<void> {
  const activeChecking = existing.filter(
    (b) => b.kind === 'checking' && b.is_system && b.is_active,
  )
  if (activeChecking.length === 0) return

  const ids = activeChecking.map((b) => b.id)
  const { error: bucketError } = await supabase
    .from('buckets')
    .update({ is_active: false })
    .in('id', ids)
  if (bucketError) throw new Error(bucketError.message)

  const { error: billError } = await supabase
    .from('recurring_bills')
    .update({ is_active: false })
    .eq('type', 'transfer')
    .eq('is_active', true)
    .in('to_bucket_id', ids)
  if (billError) {
    // Recurring schema may be missing on fresh installs.
    const lower = billError.message.toLowerCase()
    if (
      !lower.includes('recurring') &&
      !lower.includes('schema cache') &&
      !lower.includes('does not exist')
    ) {
      throw new Error(billError.message)
    }
  }
}

export async function ensureSystemBuckets(): Promise<void> {
  const existing = await fetchBuckets({ includeInactive: true })
  await retireSystemCheckingAccounts(existing)

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

/** Active sinking bucket for a category, if any. */
export function findActiveBucketForCategory(
  buckets: Bucket[],
  categoryId: string,
): Bucket | undefined {
  return buckets.find(
    (b) =>
      b.is_active &&
      b.kind === 'sinking' &&
      b.category_id === categoryId,
  )
}

/** Category ids that currently have an active linked sinking fund. */
export function sinkingLinkedCategoryIds(
  buckets: Array<Pick<Bucket, 'kind' | 'category_id' | 'is_active'>>,
): Set<string> {
  const ids = new Set<string>()
  for (const b of buckets) {
    if (b.is_active && b.kind === 'sinking' && b.category_id) {
      ids.add(b.category_id)
    }
  }
  return ids
}

/** Active sinking bucket id for an expense category (spend-from-bucket). */
export function resolveExpenseFromBucketId(
  categoryId: string | null | undefined,
  buckets: Array<
    Pick<Bucket, 'id' | 'kind' | 'category_id' | 'is_active'>
  >,
): string | null {
  if (!categoryId) return null
  const match = findActiveBucketForCategory(
    buckets as Bucket[],
    categoryId,
  )
  return match?.id ?? null
}

async function fetchCategory(id: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Category not found')
  const row = data as Record<string, unknown>
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as Category['type'],
    budget_group: mapBudgetGroup(row.budget_group),
    icon: String(row.icon ?? '🏷️'),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    parent_id:
      row.parent_id == null || row.parent_id === ''
        ? null
        : String(row.parent_id),
  }
}

/**
 * Persist sort_order: kind section order, then within each kind.
 * Sinking funds follow expense category / subcategory sequence when available.
 * Active buckets only (inactive keep their last sort_order).
 */
export async function reorderBucketsByNameWithinKinds(): Promise<void> {
  const buckets = await fetchBuckets()

  let categoriesById: Map<string, CategorySortRef> | null = null
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, sort_order, parent_id')
      .eq('type', 'expense')
    if (!error && data) {
      categoriesById = new Map(
        data.map((row) => {
          const r = row as Record<string, unknown>
          return [
            String(r.id),
            {
              id: String(r.id),
              name: String(r.name),
              sort_order: Number(r.sort_order ?? 0),
              parent_id:
                r.parent_id == null || r.parent_id === ''
                  ? null
                  : String(r.parent_id),
            } satisfies CategorySortRef,
          ]
        }),
      )
    }
  } catch {
    categoriesById = null
  }

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
      compareBucketsWithinKindWithCategories(a, b, categoriesById),
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

/** Own ledger balance for a single bucket id. */
export async function fetchOwnBucketBalance(bucketId: string): Promise<number> {
  const { data: bucketRow, error: bucketError } = await supabase
    .from('buckets')
    .select('opening_balance')
    .eq('id', bucketId)
    .maybeSingle()
  if (bucketError) throw new Error(bucketError.message)
  if (!bucketRow) throw new Error('Bucket not found')

  let opening = Number(
    (bucketRow as Record<string, unknown>).opening_balance ?? 0,
  )
  if (!Number.isFinite(opening)) opening = 0

  const movements = await fetchBucketMovements()
  let balance = opening
  for (const m of movements) {
    if (m.to_bucket_id === bucketId) balance += m.amount
    if (m.from_bucket_id === bucketId) balance -= m.amount
  }
  return balance
}

async function findInactiveByCategoryId(
  categoryId: string,
): Promise<Bucket | null> {
  const { data, error } = await supabase
    .from('buckets')
    .select('*')
    .eq('is_active', false)
    .eq('is_system', false)
    .eq('kind', 'sinking')
    .eq('category_id', categoryId)
    .limit(1)
  if (error) {
    if (isMissingCategoryColumn(error.message)) return null
    throwMappedBucketError(error.message)
  }
  const row = data?.[0]
  return row ? mapBucket(row as Record<string, unknown>) : null
}

/**
 * Ensure a top-level sinking bucket exists for a main expense category
 * (bank-mirror parent). Creates or revives if needed.
 */
export async function ensureParentSinkingBucketForCategory(
  parentCategoryId: string,
): Promise<Bucket> {
  const cat = await fetchCategory(parentCategoryId)
  if (cat.parent_id) {
    throw new Error('Parent bucket requires a main category')
  }
  if (cat.type !== 'expense') {
    throw new Error('Sinking funds link to expense categories only')
  }

  const active = await fetchBuckets()
  const existing = findActiveBucketForCategory(active, parentCategoryId)
  if (existing) {
    if (existing.parent_id) {
      throw new Error('Category already linked to a child sinking fund')
    }
    return existing
  }

  const group =
    cat.budget_group === 'wants' || cat.budget_group === 'needs'
      ? cat.budget_group
      : 'needs'

  const inactive = await findInactiveByCategoryId(parentCategoryId)
  if (inactive) {
    const { data, error } = await supabase
      .from('buckets')
      .update({
        is_active: true,
        name: cat.name,
        icon: cat.icon || '🎯',
        budget_group: group,
        parent_id: null,
        category_id: parentCategoryId,
        opening_balance: 0,
      })
      .eq('id', inactive.id)
      .select('*')
      .single()
    if (error) throwMappedBucketError(error.message)
    await reorderBucketsByNameWithinKinds()
    return mapBucket(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('buckets')
    .insert({
      name: cat.name,
      kind: 'sinking',
      icon: cat.icon || '🎯',
      target_amount: null,
      opening_balance: 0,
      budget_group: group,
      parent_id: null,
      category_id: parentCategoryId,
      sort_order: 0,
      is_system: false,
      is_active: true,
    })
    .select('*')
    .single()
  if (error) throwMappedBucketError(error.message)
  await reorderBucketsByNameWithinKinds()
  return mapBucket(data as Record<string, unknown>)
}

export type NewSinkingFromCategoryInput = {
  /** Expense subcategory id (must have a parent). */
  category_id: string
  target_amount: number
  opening_balance: number
  opening_transfers?: number
}

/**
 * Add sinking fund for an expense subcategory.
 * Auto-creates the parent-category bank-mirror bucket when missing.
 */
export async function createSinkingBucketFromCategory(
  input: NewSinkingFromCategoryInput,
): Promise<Bucket> {
  const cat = await fetchCategory(input.category_id)
  if (cat.type !== 'expense') {
    throw new Error('Sinking funds link to expense categories only')
  }
  if (!cat.parent_id) {
    throw new Error('Pick a subcategory (not a main category)')
  }
  if (!cat.is_active) {
    throw new Error('Category is inactive')
  }

  const target_amount = Number(input.target_amount)
  if (!Number.isFinite(target_amount) || target_amount <= 0) {
    throw new Error('Target amount is required')
  }
  const opening_balance = Number.isFinite(input.opening_balance)
    ? Math.max(0, input.opening_balance)
    : 0

  const opening_transfers = Number.isFinite(
    input.opening_transfers,
  )
    ? Math.max(0, Math.round(input.opening_transfers ?? 0))
    : 0

  const group =
    cat.budget_group === 'wants' || cat.budget_group === 'needs'
      ? cat.budget_group
      : 'needs'

  const active = await fetchBuckets()
  if (findActiveBucketForCategory(active, cat.id)) {
    throw new Error('This subcategory already has a sinking fund')
  }

  const parentBucket = await ensureParentSinkingBucketForCategory(cat.parent_id)
  const siblings = active.filter(
    (b) => b.parent_id === parentBucket.id && b.id !== parentBucket.id,
  )
  // First child: parent own ledger must be empty (leaves-only).
  if (siblings.length === 0) {
    const own = await fetchOwnBucketBalance(parentBucket.id)
    if (Math.abs(own) >= 0.005) {
      throw new Error(
        'Transfer balance out of parent first before adding a child',
      )
    }
  }

  const inactive = await findInactiveByCategoryId(cat.id)
  let createdId: string
  if (inactive) {
    const { data, error } = await supabase
      .from('buckets')
      .update({
        is_active: true,
        name: cat.name,
        icon: cat.icon || '🎯',
        target_amount,
        opening_balance,
        opening_transfers,
        budget_group: group,
        parent_id: parentBucket.id,
        category_id: cat.id,
      })
      .eq('id', inactive.id)
      .select('*')
      .single()
    if (error) throwMappedBucketError(error.message)
    createdId = String((data as Record<string, unknown>).id)
  } else {
    const { data, error } = await supabase
      .from('buckets')
      .insert({
        name: cat.name,
        kind: 'sinking',
        icon: cat.icon || '🎯',
        target_amount,
        opening_balance,
        opening_transfers,
        budget_group: group,
        parent_id: parentBucket.id,
        category_id: cat.id,
        sort_order: 0,
        is_system: false,
        is_active: true,
      })
      .select('*')
      .single()
    if (error) throwMappedBucketError(error.message)
    createdId = String((data as Record<string, unknown>).id)
  }

  await reorderBucketsByNameWithinKinds()
  const refreshed = await fetchBuckets({ includeInactive: true })
  const row = refreshed.find((b) => b.id === createdId)
  if (!row) throw new Error('Bucket not found after save')
  return row
}

/** @deprecated Prefer createSinkingBucketFromCategory for sinking funds. */
export type NewBucketInput = {
  name: string
  kind: BucketKind
  icon: string
  target_amount: number
  opening_balance: number
  budget_group: 'needs' | 'wants'
  parent_id?: string | null
  category_id?: string | null
}

export async function createBucket(input: NewBucketInput): Promise<Bucket> {
  if (input.kind === 'sinking' && input.category_id) {
    return createSinkingBucketFromCategory({
      category_id: input.category_id,
      target_amount: input.target_amount,
      opening_balance: input.opening_balance,
    })
  }
  throw new Error('Add sinking funds via subcategory')
}

export type UpdateBucketInput = {
  name?: string
  icon?: string
  target_amount?: number | null
  opening_balance?: number
  opening_transfers?: number
  budget_group?: 'needs' | 'wants' | null
  parent_id?: string | null
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

  const { data: existing, error: existingError } = await supabase
    .from('buckets')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (existingError) throwMappedBucketError(existingError.message)
  if (!existing) throw new Error('Bucket not found')
  const current = mapBucket(existing as Record<string, unknown>)

  const nextPatch: Record<string, unknown> = { ...patch }
  if (nextPatch.target_amount !== undefined) {
    if (current.kind === 'emergency' || current.kind === 'investment') {
      delete nextPatch.target_amount
    }
    if (current.kind === 'checking') {
      delete nextPatch.target_amount
      delete nextPatch.budget_group
    }
  }

  // Category-linked sinking: name/icon/budget_group come from category.
  if (current.kind === 'sinking' && current.category_id) {
    delete nextPatch.name
    delete nextPatch.icon
    delete nextPatch.budget_group
    delete nextPatch.parent_id
  }

  if (current.kind !== 'sinking') {
    delete nextPatch.parent_id
  }

  if (nextPatch.opening_balance !== undefined) {
    const active = await fetchBuckets()
    const kids = active.filter((b) => b.parent_id === id)
    if (kids.length > 0) {
      delete nextPatch.opening_balance
    }
  }

  if (nextPatch.opening_transfers !== undefined) {
    const active = await fetchBuckets()
    const kids = active.filter((b) => b.parent_id === id)
    if (kids.length > 0) {
      delete nextPatch.opening_transfers
    }
  }

  const { data, error } = await supabase
    .from('buckets')
    .update(nextPatch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throwMappedBucketError(error.message)

  const updated = mapBucket(data as Record<string, unknown>)

  if (patch.name != null || patch.is_active != null) {
    await reorderBucketsByNameWithinKinds()
    const refreshed = await fetchBuckets({ includeInactive: true })
    const row = refreshed.find((b) => b.id === id)
    if (row) return row
  }

  return updated
}

/** Soft-delete: sets is_active=false. Cascades to children. */
export async function deleteBucket(id: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from('buckets')
    .select('is_system')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)
  if (row?.is_system) throw new Error('System buckets cannot be deleted')

  const { error: childError } = await supabase
    .from('buckets')
    .update({ is_active: false })
    .eq('parent_id', id)
    .eq('is_active', true)
  if (childError) {
    if (!isMissingParentColumn(childError.message)) {
      throwMappedBucketError(childError.message)
    }
  }

  const { error } = await supabase
    .from('buckets')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await reorderBucketsByNameWithinKinds()
}

/** Soft-delete sinking linked to a category (and children if parent). */
export async function softDeleteBucketsForCategory(
  categoryId: string,
): Promise<void> {
  const active = await fetchBuckets({ includeInactive: true })
  const linked = active.filter(
    (b) => b.category_id === categoryId && b.kind === 'sinking',
  )
  for (const b of linked) {
    if (!b.is_active) continue
    await deleteBucket(b.id)
  }
}

/**
 * Sync bucket name/icon/budget_group from its linked category.
 */
export async function syncBucketFromCategory(
  categoryId: string,
  fields: {
    name?: string
    icon?: string
    budget_group?: BudgetGroup | null
  },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (fields.name != null) patch.name = fields.name.trim()
  if (fields.icon != null) patch.icon = fields.icon
  if (fields.budget_group !== undefined) {
    patch.budget_group =
      fields.budget_group === 'needs' || fields.budget_group === 'wants'
        ? fields.budget_group
        : 'needs'
  }
  if (Object.keys(patch).length === 0) return

  const { error } = await supabase
    .from('buckets')
    .update(patch)
    .eq('category_id', categoryId)
    .eq('kind', 'sinking')
    .eq('is_active', true)
  if (error) {
    if (isMissingCategoryColumn(error.message)) return
    throwMappedBucketError(error.message)
  }
}

/**
 * When a subcategory moves to a new parent category, reparent its sinking
 * bucket under the new parent-category bank-mirror bucket.
 */
export async function reparentSinkingForSubcategoryMove(
  subcategoryId: string,
  nextParentCategoryId: string | null,
): Promise<void> {
  if (!nextParentCategoryId) {
    const active = await fetchBuckets()
    if (findActiveBucketForCategory(active, subcategoryId)) {
      throw new Error(
        'Remove the sinking fund before promoting this subcategory to a main category',
      )
    }
    return
  }

  const active = await fetchBuckets()
  const childBucket = findActiveBucketForCategory(active, subcategoryId)
  if (!childBucket) return

  const parentBucket =
    await ensureParentSinkingBucketForCategory(nextParentCategoryId)

  if (childBucket.parent_id === parentBucket.id) return

  const siblings = active.filter(
    (b) =>
      b.parent_id === parentBucket.id &&
      b.id !== childBucket.id &&
      b.is_active,
  )
  if (siblings.length === 0) {
    const own = await fetchOwnBucketBalance(parentBucket.id)
    if (Math.abs(own) >= 0.005) {
      throw new Error(
        'Transfer balance out of the destination parent bucket first',
      )
    }
  }

  const { error } = await supabase
    .from('buckets')
    .update({ parent_id: parentBucket.id })
    .eq('id', childBucket.id)
  if (error) throwMappedBucketError(error.message)
  await reorderBucketsByNameWithinKinds()
}

/**
 * Relink an existing sinking bucket (preserving its id + ledger/history)
 * from one expense subcategory to another.
 *
 * Intended for "leaf" sinking funds:
 * - bucket must be sinking
 * - bucket must be linked to a category_id (subcategory)
 * - bucket must not be a bank-mirror parent bucket (parent_id == null)
 */
export async function relinkSinkingBucketToSubcategory(
  bucketId: string,
  nextSubcategoryId: string,
): Promise<Bucket> {
  const { data: existing, error: existingError } = await supabase
    .from('buckets')
    .select('*')
    .eq('id', bucketId)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error('Bucket not found')

  const current = mapBucket(existing as Record<string, unknown>)
  if (current.kind !== 'sinking') {
    throw new Error('Only sinking funds can be relinked')
  }
  if (!current.category_id) {
    throw new Error('Bucket is not linked to a subcategory')
  }
  if (current.parent_id == null) {
    // Bank mirror parent buckets are intentionally non-editable in UI.
    throw new Error('Bank mirror bucket cannot be relinked')
  }

  const nextCat = await fetchCategory(nextSubcategoryId)
  if (nextCat.type !== 'expense' || !nextCat.parent_id) {
    throw new Error('Sinking funds link to expense subcategories only')
  }
  if (!nextCat.is_active) {
    throw new Error('Selected subcategory is inactive')
  }

  const active = await fetchBuckets()
  const destination = findActiveBucketForCategory(active, nextSubcategoryId)
  if (destination && destination.id !== bucketId) {
    throw new Error('This subcategory already has an active sinking fund')
  }

  const parentBucket = await ensureParentSinkingBucketForCategory(
    nextCat.parent_id,
  )

  const group =
    nextCat.budget_group === 'wants' || nextCat.budget_group === 'needs'
      ? nextCat.budget_group
      : 'needs'

  const { data, error } = await supabase
    .from('buckets')
    .update({
      category_id: nextSubcategoryId,
      parent_id: parentBucket.id,
      name: nextCat.name,
      icon: nextCat.icon || '🎯',
      budget_group: group,
    })
    .eq('id', bucketId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await reorderBucketsByNameWithinKinds()

  return mapBucket(data as Record<string, unknown>)
}

export type BucketMovement = {
  amount: number
  from_bucket_id: string | null
  to_bucket_id: string | null
  occurred_on: string
}

/**
 * Ledger movements: transfers (both sides) + completed expenses that spend
 * from a bucket (from_bucket_id only).
 */
export async function fetchBucketMovements(): Promise<BucketMovement[]> {
  const { data: transfers, error: transferError } = await supabase
    .from('transactions')
    .select('amount, from_bucket_id, to_bucket_id, occurred_on')
    .eq('type', 'transfer')
  if (transferError) throw new Error(transferError.message)

  const { data: expenses, error: expenseError } = await supabase
    .from('transactions')
    .select('amount, from_bucket_id, to_bucket_id, occurred_on, complete_later')
    .eq('type', 'expense')
    .not('from_bucket_id', 'is', null)

  const expenseRows = expenseError ? [] : (expenses ?? [])

  const movements: BucketMovement[] = [
    ...(transfers ?? []).map((row) => ({
      amount: Number(row.amount),
      from_bucket_id: (row.from_bucket_id as string | null) ?? null,
      to_bucket_id: (row.to_bucket_id as string | null) ?? null,
      occurred_on: String(row.occurred_on),
    })),
  ]

  for (const row of expenseRows) {
    if (row.complete_later) continue
    const fromId = (row.from_bucket_id as string | null) ?? null
    if (!fromId) continue
    movements.push({
      amount: Number(row.amount),
      from_bucket_id: fromId,
      to_bucket_id: null,
      occurred_on: String(row.occurred_on),
    })
  }

  return movements
}

/** @deprecated use fetchBucketMovements */
export async function fetchTransferMovements(): Promise<BucketMovement[]> {
  return fetchBucketMovements()
}

/** Own ledger per bucket (opening + net movements). */
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

/** Leaves-only display balances (parent with children = sum of children). */
export function computeDisplayBalances(
  buckets: Bucket[],
  ownBalances: Map<string, number>,
): Map<string, number> {
  const childrenMap = childrenByParentId(buckets)
  const map = new Map<string, number>()
  for (const b of buckets) {
    map.set(b.id, displayBucketBalance(b, ownBalances, childrenMap))
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
