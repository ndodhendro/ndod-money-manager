export type Owner = 'suami' | 'istri'

export const OWNER_LABELS: Record<Owner, string> = {
  suami: 'Ndod',
  istri: 'Devi',
}

/** Warna chip profil — konsisten di seluruh app. */
export const OWNER_BADGE_CLASS: Record<Owner, string> = {
  suami:
    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  istri:
    'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
}

export type TransactionType = 'income' | 'expense'

export type BudgetGroup = 'needs' | 'wants'

export interface Category {
  id: string
  name: string
  type: TransactionType
  budget_group: BudgetGroup | null
  icon: string
  sort_order: number
  is_active: boolean
  parent_id: string | null
}

export interface CategoryWithParent extends Category {
  parent?: Category | null
}

export interface Transaction {
  id: string
  type: TransactionType
  category_id: string | null
  amount: number
  description: string | null
  owner: Owner
  occurred_on: string
  is_recurring: boolean
  created_at: string
  updated_at: string
}

export interface TransactionWithCategory extends Transaction {
  category: CategoryWithParent | null
}

export interface NewTransactionInput {
  type: TransactionType
  category_id: string
  amount: number
  description: string
  owner: Owner
  occurred_on: string
  is_recurring: boolean
}

/** Label tampilan: "🚗 Transportasi/Parkir" atau "🏠 Tempat Tinggal" */
export function formatCategoryLabel(
  category: CategoryWithParent | null | undefined,
): string {
  if (!category) return 'Tanpa kategori'
  const parent = normalizeParent(category.parent)
  if (parent) {
    return `${parent.icon} ${parent.name}/${category.name}`
  }
  return `${category.icon} ${category.name}`
}

export function categoryIcon(category: CategoryWithParent | null | undefined): string {
  if (!category) return '💸'
  const parent = normalizeParent(category.parent)
  return parent?.icon ?? category.icon
}

function normalizeParent(
  parent: Category | Category[] | null | undefined,
): Category | null {
  if (!parent) return null
  if (Array.isArray(parent)) return parent[0] ?? null
  return parent
}

/** Pecah kategori induk vs sub untuk tampilan list/riwayat. */
export function categoryDisplayParts(
  category: CategoryWithParent | null | undefined,
): {
  parentIcon: string
  parentName: string
  childIcon: string | null
  childName: string | null
} {
  if (!category) {
    return {
      parentIcon: '📂',
      parentName: 'Tanpa kategori',
      childIcon: null,
      childName: null,
    }
  }
  const parent = normalizeParent(category.parent)
  if (category.parent_id) {
    return {
      parentIcon: parent?.icon ?? '📂',
      parentName: parent?.name ?? 'Kategori',
      childIcon: category.icon,
      childName: category.name,
    }
  }
  return {
    parentIcon: category.icon,
    parentName: category.name,
    childIcon: null,
    childName: null,
  }
}
