export type Owner = 'suami' | 'istri'

export const OWNERS: Owner[] = ['suami', 'istri']

export const OWNER_LABELS: Record<Owner, string> = {
  suami: 'Ndod',
  istri: 'Devi',
}

export function isOwner(value: unknown): value is Owner {
  return value === 'suami' || value === 'istri'
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

export type BudgetGroup = 'needs' | 'wants'

export const BUDGET_GROUP_LABELS: Record<BudgetGroup, string> = {
  needs: 'Needs',
  wants: 'Wants',
}

/**
 * Needs = rose (must-pay / obligatory), Wants = sky (flexible) —
 * text markers, Plan bars, and Dashboard donut share these tones.
 */
export const BUDGET_GROUP_TEXT_CLASS: Record<BudgetGroup, string> = {
  needs: 'text-rose-600 dark:text-rose-400',
  wants: 'text-sky-600 dark:text-sky-400',
}

export const BUDGET_GROUP_BAR_CLASS: Record<BudgetGroup, string> = {
  needs: 'bg-rose-500',
  wants: 'bg-sky-500',
}

/** Hex for charts (rose-500 / sky-500). */
export const BUDGET_GROUP_COLOR: Record<BudgetGroup, string> = {
  needs: '#f43f5e',
  wants: '#0ea5e9',
}

export type BucketKind = 'checking' | 'emergency' | 'investment' | 'sinking'

export const BUCKET_KIND_LABELS: Record<BucketKind, string> = {
  checking: 'Account',
  emergency: 'Emergency',
  investment: 'Investment Transit',
  sinking: 'Sinking Fund',
}

/** Sentinel: null bucket id = shared main account (checking / available money). */
export const CASHFLOW_LABEL = 'Main Account'

/** System personal checking account names (transfer From/To). */
export const OWNER_ACCOUNT_LABELS: Record<Owner, string> = {
  suami: `${OWNER_LABELS.suami} Account`,
  istri: `${OWNER_LABELS.istri} Account`,
}

export interface Bucket {
  id: string
  name: string
  kind: BucketKind
  icon: string
  target_amount: number | null
  opening_balance: number
  /**
   * Needs/Wants for sinking funds (Money Plan).
   * Null for emergency/investment system buckets.
   */
  budget_group: BudgetGroup | null
  /**
   * Optional parent sinking fund (max depth 2).
   * Null = top-level / bank-mirror bucket.
   */
  parent_id: string | null
  /**
   * Linked expense category for sinking funds.
   * Subcategory → leaf bucket; parent category → bank-mirror parent.
   */
  category_id: string | null
  sort_order: number
  is_active: boolean
  is_system: boolean
  created_at: string
}

export interface BucketWithBalance extends Bucket {
  /**
   * Leaves-only display balance: own ledger for leaves;
   * sum of active children for parents that have children.
   */
  balance: number
  /** Own ledger balance (opening + net transfers), never rolled up. */
  own_balance: number
}

export interface BucketTreeNode {
  bucket: BucketWithBalance
  children: BucketWithBalance[]
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
  /** Placeholder to finish later; note required, other fields optional. */
  complete_later: boolean
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
  complete_later: boolean
}

/** True when input meets normal (non–Complete Later) required fields. */
export function isTransactionFullySpecified(input: NewTransactionInput): boolean {
  if (input.amount <= 0) return false
  if (input.type === 'transfer') {
    if (input.from_bucket_id === input.to_bucket_id) return false
    if (!input.from_bucket_id && !input.to_bucket_id) return false
    return true
  }
  if (!input.category_id) return false
  return true
}

/** Single-side bucket label for transfer rows (Main Account when null). */
export function formatBucketSideLabel(
  bucket: Bucket | null | undefined,
): string {
  return bucket ? `${bucket.icon} ${bucket.name}` : CASHFLOW_LABEL
}

/** Transfer row title: source bucket only. */
export function formatTransferLabel(
  from: Bucket | null | undefined,
  _to?: Bucket | null | undefined,
): string {
  return formatBucketSideLabel(from)
}

/** Transfer row note line: destination bucket. */
export function formatTransferToLabel(
  to: Bucket | null | undefined,
): string {
  return formatBucketSideLabel(to)
}

/** Single-sourced glyph for transfer-type rows (History, estimates, etc.). */
export const TRANSFER_TYPE_ICON = '➡️'

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
