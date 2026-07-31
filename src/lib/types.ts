export type Owner = 'suami' | 'istri'

export const OWNER_LABELS: Record<Owner, string> = {
  suami: 'Ndod',
  istri: 'Devi',
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
  if (category.parent) {
    return `${category.parent.icon} ${category.parent.name}/${category.name}`
  }
  return `${category.icon} ${category.name}`
}

export function categoryIcon(category: CategoryWithParent | null | undefined): string {
  if (!category) return '💸'
  return category.parent?.icon ?? category.icon
}
