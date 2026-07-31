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

/** Sembunyikan kategori (preferensi manual baris ini saja; anak tidak diubah). */
export async function hideCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

/**
 * Tampilkan lagi kategori.
 * Jika sub, parent ikut ditampilkan agar sub bisa terlihat di picker.
 * Anak-anak parent tidak di-unhide massal (yang di-hide manual tetap hide).
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

export async function setCategoryVisibility(
  id: string,
  visible: boolean,
  parentId?: string | null,
): Promise<void> {
  if (visible) {
    await showCategory(id, parentId)
  } else {
    await hideCategory(id)
  }
}

/** @deprecated pakai hideCategory */
export async function archiveCategory(id: string): Promise<void> {
  await hideCategory(id)
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

/** Update sort_order berurutan sesuai array id. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabase.from('categories').update({ sort_order: index + 1 }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
