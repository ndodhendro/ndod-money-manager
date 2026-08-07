import { supabase } from './supabase'
import type { BudgetGroup, Category, CategoryType } from './types'

export interface AddCategoryInput {
  name: string
  type: CategoryType
  icon?: string
  budget_group?: BudgetGroup | null
  parent_id?: string | null
  sort_order?: number
}

function normalizeBudgetGroup(
  type: CategoryType,
  budgetGroup: BudgetGroup | null | undefined,
): BudgetGroup | null {
  return type === 'expense' ? (budgetGroup ?? null) : null
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as CategoryType,
    budget_group: (row.budget_group as BudgetGroup | null) ?? null,
    icon: String(row.icon ?? '🏷️'),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    parent_id: (row.parent_id as string | null) ?? null,
  }
}

function isDuplicateActiveError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('duplicate') ||
    lower.includes('unique') ||
    lower.includes('categories_name_parent_active')
  )
}

async function nextCategorySortOrder(): Promise<number> {
  const { data: maxRow } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Number(maxRow?.sort_order ?? 0) + 1
}

async function findInactiveCategoryMatches(input: {
  type: CategoryType
  name: string
  icon: string
  budget_group: BudgetGroup | null
  parent_id: string | null
}): Promise<Category[]> {
  let query = supabase
    .from('categories')
    .select('*')
    .eq('is_active', false)
    .eq('type', input.type)
    .eq('name', input.name)
    .eq('icon', input.icon)

  if (input.parent_id) {
    query = query.eq('parent_id', input.parent_id)
  } else {
    query = query.is('parent_id', null)
  }

  if (input.type === 'expense') {
    if (input.budget_group) {
      query = query.eq('budget_group', input.budget_group)
    } else {
      query = query.is('budget_group', null)
    }
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => mapCategory(row as Record<string, unknown>))
}

async function reviveCategory(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ is_active: true, sort_order: sortOrder })
    .eq('id', id)
  if (error) throw error
}

/**
 * Add category or subcategory. Revives one exact-match inactive row when found.
 */
export async function addCategory(input: AddCategoryInput): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required')

  const icon = input.icon || '🏷️'
  const parent_id = input.parent_id || null
  const budget_group = normalizeBudgetGroup(input.type, input.budget_group)
  const sortOrder = input.sort_order ?? (await nextCategorySortOrder())

  if (parent_id) {
    const { data: parent, error: parentError } = await supabase
      .from('categories')
      .select('id, is_active, budget_group')
      .eq('id', parent_id)
      .maybeSingle()
    if (parentError) throw parentError
    if (!parent) throw new Error('Parent category not found')
    if (!parent.is_active) {
      await showCategory(parent_id)
    }
  }

  const matches = await findInactiveCategoryMatches({
    type: input.type,
    name,
    icon,
    budget_group,
    parent_id,
  })

  if (matches.length === 1) {
    const match = matches[0]
    await reviveCategory(match.id, sortOrder)
    if (parent_id) {
      await showCategory(match.id, parent_id)
    }
    return
  }

  const { error } = await supabase.from('categories').insert({
    name,
    type: input.type,
    budget_group,
    icon,
    sort_order: sortOrder,
    parent_id,
  })
  if (error) {
    if (isDuplicateActiveError(error.message)) {
      throw new Error('An active category with this name already exists')
    }
    throw error
  }
}

/** Soft delete — row stays for history mapping. */
export async function deleteCategory(id: string): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('categories')
    .select('parent_id')
    .eq('id', id)
    .maybeSingle()
  if (currentError) throw currentError

  const { error } = await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error

  await ensureLeafParentBudgetGroup(current?.parent_id)
}

/** @deprecated use deleteCategory */
export async function hideCategory(id: string): Promise<void> {
  await deleteCategory(id)
}

/**
 * Ensure category is active. If sub, parent is activated too.
 */
export async function showCategory(
  id: string,
  parentId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ is_active: true })
    .eq('id', id)
  if (error) throw error

  if (parentId) {
    await supabase
      .from('categories')
      .update({ is_active: true })
      .eq('id', parentId)
  }
}

/** @deprecated use deleteCategory */
export async function archiveCategory(id: string): Promise<void> {
  await deleteCategory(id)
}

export async function renameCategory(
  id: string,
  patch: {
    name?: string
    icon?: string
    budget_group?: BudgetGroup | null
    /** Move subcategory under another main parent, or `null` to promote to main. */
    parent_id?: string | null
  },
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('categories')
    .select('id, type, parent_id')
    .eq('id', id)
    .maybeSingle()
  if (currentError) throw currentError
  if (!current) throw new Error('Category not found')

  const update: Record<string, unknown> = {
    ...(patch.name != null ? { name: patch.name.trim() } : {}),
    ...(patch.icon != null ? { icon: patch.icon } : {}),
  }
  if (patch.budget_group !== undefined) {
    update.budget_group = patch.budget_group
  }

  if (patch.parent_id !== undefined) {
    const nextParentId = patch.parent_id
    if (nextParentId === id) {
      throw new Error('A category cannot be its own parent')
    }

    if (nextParentId) {
      const { data: parent, error: parentError } = await supabase
        .from('categories')
        .select('id, type, parent_id, is_active, budget_group')
        .eq('id', nextParentId)
        .maybeSingle()
      if (parentError) throw parentError
      if (!parent) throw new Error('Parent category not found')
      if (parent.parent_id) {
        throw new Error('Parent must be a main category')
      }
      if (parent.type !== current.type) {
        throw new Error('Parent must match category type')
      }
      if (!parent.is_active) {
        await showCategory(nextParentId)
      }
    }

    if (nextParentId !== current.parent_id) {
      update.parent_id = nextParentId
      update.sort_order = await nextSortOrderUnderParent(nextParentId)
    }
  }

  if (Object.keys(update).length === 0) return

  const previousParentId = (current.parent_id as string | null) ?? null
  const parentMoved =
    patch.parent_id !== undefined &&
    patch.parent_id !== current.parent_id

  const { error } = await supabase
    .from('categories')
    .update(update)
    .eq('id', id)
  if (error) {
    if (isDuplicateActiveError(error.message)) {
      throw new Error('An active category with this name already exists')
    }
    throw error
  }

  if (parentMoved) {
    await ensureLeafParentBudgetGroup(previousParentId)
  }
}

/**
 * Keep Needs/Wants/Savings visible on an expense main category once it has
 * no active children. Preserves an existing budget_group; only fills null.
 */
async function ensureLeafParentBudgetGroup(
  parentId: string | null | undefined,
): Promise<void> {
  if (!parentId) return

  const { data: parent, error } = await supabase
    .from('categories')
    .select('id, type, parent_id, budget_group')
    .eq('id', parentId)
    .maybeSingle()
  if (error) throw error
  if (!parent || parent.parent_id) return
  if (parent.type !== 'expense') return

  const { count, error: countError } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parentId)
    .eq('is_active', true)
  if (countError) throw countError
  if ((count ?? 0) > 0) return

  // Already has a group — list UI will show it now that there are no children.
  if (parent.budget_group != null) return

  const { error: updateError } = await supabase
    .from('categories')
    .update({ budget_group: 'needs' })
    .eq('id', parentId)
  if (updateError) throw updateError
}

async function nextSortOrderUnderParent(
  parentId: string | null,
): Promise<number> {
  let query = supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  query = parentId
    ? query.eq('parent_id', parentId)
    : query.is('parent_id', null)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return Number(data?.sort_order ?? 0) + 1
}

/** Update sort_order berurutan sesuai array id. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabase.from('categories').update({ sort_order: index + 1 }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
