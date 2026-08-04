import type { BucketWithBalance, Category } from './types'
import {
  categoryDisplayParts,
  formatTransferLabel,
  type CategoryWithParent,
} from './types'
import type { RecurringBill } from './recurringBillsApi'

export type RecurringBillDisplayParts = {
  parentIcon: string
  parentName: string
  childIcon: string | null
  childName: string | null
  isTransfer: boolean
  circle: RecurringBill['circle']
}

export function getRecurringBillDisplayParts(
  bill: RecurringBill,
  byId: Map<string, Category>,
  bucketsById: Map<string, BucketWithBalance>,
): RecurringBillDisplayParts {
  if (bill.type === 'transfer') {
    return {
      parentIcon: '🔄',
      parentName: formatTransferLabel(
        bill.from_bucket_id ? bucketsById.get(bill.from_bucket_id) : null,
        bill.to_bucket_id ? bucketsById.get(bill.to_bucket_id) : null,
      ),
      childIcon: null,
      childName: null,
      isTransfer: true,
      circle: bill.circle,
    }
  }

  const cat = bill.category_id ? byId.get(bill.category_id) : null
  const withParent: CategoryWithParent | null = cat
    ? {
        ...cat,
        parent: cat.parent_id ? (byId.get(cat.parent_id) ?? null) : null,
      }
    : null
  const parts = categoryDisplayParts(withParent)

  return {
    ...parts,
    isTransfer: false,
    circle: bill.circle,
  }
}
