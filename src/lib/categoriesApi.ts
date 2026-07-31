import { supabase } from './supabase'
import type { BudgetGroup, TransactionType } from './types'

export interface AddCategoryInput {
  name: string
  type: TransactionType
  icon?: string
  budget_group?: BudgetGroup | null
  parent_id?: string | null
  sort_order?: number
}

export async function addCategory(input: AddCategoryInput): Promise<void> {
  const { error } = await supabase.from('categories').insert({
    name: input.name.trim(),
    type: input.type,
    budget_group: input.type === 'expense' ? (input.budget_group ?? null) : null,
    icon: input.icon || '🏷️',
    sort_order: input.sort_order ?? 99,
    parent_id: input.parent_id || null,
  })
  if (error) throw error
}

export async function archiveCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error

  // Arsipkan juga anak-anaknya.
  await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('parent_id', id)
}

export async function renameCategory(
  id: string,
  patch: { name?: string; icon?: string },
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.icon != null ? { icon: patch.icon } : {}),
    })
    .eq('id', id)
  if (error) throw error
}
