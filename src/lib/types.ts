export type Owner = 'suami' | 'istri'

// 'suami'/'istri' tetap dipakai sebagai identifier teknis (cocok dengan enum
// owner_type di database), tapi ditampilkan ke user dengan nama panggilan.
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
  category: Category | null
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
