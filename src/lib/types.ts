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

export type Circle = 'hd_family' | 'extended_family' | 'friends'

export const CIRCLES: Circle[] = ['hd_family', 'extended_family', 'friends']

export const CIRCLE_LABELS: Record<Circle, string> = {
  hd_family: 'HD Family',
  extended_family: 'Extended Family',
  friends: 'Friends',
}

/** Warna chip circle — soft, konsisten di seluruh app. */
export const CIRCLE_BADGE_CLASS: Record<Circle, string> = {
  hd_family:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  extended_family:
    'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  friends:
    'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
}

export function isCircle(value: unknown): value is Circle {
  return (
    value === 'hd_family' ||
    value === 'extended_family' ||
    value === 'friends'
  )
}

/** Categories only use income/expense. */
export type CategoryType = 'income' | 'expense'

export type TransactionType = 'income' | 'expense' | 'transfer'

export type BudgetGroup = 'needs' | 'wants' | 'savings'

export type BucketKind = 'emergency' | 'investment' | 'sinking'

export const BUCKET_KIND_LABELS: Record<BucketKind, string> = {
  emergency: 'Emergency',
  investment: 'Investment',
  sinking: 'Sinking fund',
}

/** Sentinel: null bucket id = household cashflow (checking). */
export const CASHFLOW_LABEL = 'Cashflow'

export interface Bucket {
  id: string
  name: string
  kind: BucketKind
  icon: string
  target_amount: number | null
  opening_balance: number
  sort_order: number
  is_active: boolean
  is_system: boolean
  created_at: string
}

export interface BucketWithBalance extends Bucket {
  balance: number
}

export interface Category {
  id: string
  name: string
  type: CategoryType
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
  from_bucket_id: string | null
  to_bucket_id: string | null
  amount: number
  description: string | null
  owner: Owner
  circle: Circle
  occurred_on: string
  is_recurring: boolean
  created_at: string
  updated_at: string
}

export interface TransactionWithCategory extends Transaction {
  category: CategoryWithParent | null
  from_bucket?: Bucket | null
  to_bucket?: Bucket | null
}

export interface NewTransactionInput {
  type: TransactionType
  category_id: string | null
  from_bucket_id: string | null
  to_bucket_id: string | null
  amount: number
  description: string
  owner: Owner
  circle: Circle
  occurred_on: string
  is_recurring: boolean
}

export function formatTransferLabel(
  from: Bucket | null | undefined,
  to: Bucket | null | undefined,
): string {
  const fromLabel = from ? `${from.icon} ${from.name}` : CASHFLOW_LABEL
  const toLabel = to ? `${to.icon} ${to.name}` : CASHFLOW_LABEL
  return `${fromLabel} → ${toLabel}`
}

/** Label tampilan: "🚗 Transportasi/Parkir" atau "🏠 Tempat Tinggal" */
export function formatCategoryLabel(
  category: CategoryWithParent | null | undefined,
): string {
  if (!category) return 'Uncategorized'
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
      parentName: 'Uncategorized',
      childIcon: null,
      childName: null,
    }
  }
  const parent = normalizeParent(category.parent)
  if (category.parent_id) {
    return {
      parentIcon: parent?.icon ?? '📂',
      parentName: parent?.name ?? 'Category',
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
