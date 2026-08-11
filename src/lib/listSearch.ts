import { formatNumber, formatRupiah } from './format'
import {
  CIRCLE_LABELS,
  OWNER_LABELS,
  categoryDisplayParts,
  formatTransferLabel,
  formatTransferToLabel,
  isCircle,
  isOwner,
  type TransactionWithCategory,
} from './types'
import type { RecurringBillDisplayParts } from './recurringBillDisplay'

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function isBlankSearch(query: string): boolean {
  return normalizeSearchQuery(query).length === 0
}

function tokenMatches(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true
  const tokenDigits = token.replace(/\D/g, '')
  if (tokenDigits.length === 0) return false
  const hayDigits = haystack.replace(/\D/g, '')
  return hayDigits.includes(tokenDigits)
}

/**
 * Partial match: every whitespace-separated token must appear in the joined
 * haystack (substring), or as digits-only for amount-style queries.
 */
export function matchesSearchText(
  query: string,
  ...parts: Array<string | number | null | undefined | false>
): boolean {
  const q = normalizeSearchQuery(query)
  if (!q) return true

  const haystack = parts
    .flatMap((p) => {
      if (p == null || p === false) return []
      return [String(p)]
    })
    .join(' ')
    .toLowerCase()

  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((token) => tokenMatches(haystack, token))
}

function amountSearchParts(amount: number): Array<string | number> {
  if (!Number.isFinite(amount)) return []
  const rounded = Math.round(amount)
  return [rounded, formatNumber(rounded), formatRupiah(rounded)]
}

export function matchesTransactionSearch(
  query: string,
  tx: TransactionWithCategory,
): boolean {
  if (isBlankSearch(query)) return true

  const isTransfer = tx.type === 'transfer'
  const display = isTransfer
    ? {
        parentName: formatTransferLabel(tx.from_bucket),
        childName: null as string | null,
        note: formatTransferToLabel(tx.to_bucket),
      }
    : {
        ...categoryDisplayParts(tx.category),
        note: tx.description?.trim() || null,
      }

  const owner = isOwner(tx.owner) ? OWNER_LABELS[tx.owner] : tx.owner
  const circle = isCircle(tx.circle)
    ? CIRCLE_LABELS[tx.circle]
    : (tx.circle ?? '')

  return matchesSearchText(
    query,
    display.parentName,
    display.childName,
    display.note,
    tx.description,
    tx.type,
    isTransfer ? 'transfer' : null,
    owner,
    circle,
    tx.occurred_on,
    ...amountSearchParts(tx.amount),
  )
}

export function matchesRecurringBillSearch(
  query: string,
  bill: {
    name: string
    type: string
    amount: number
    owner: string
    circle: string
    due_day: number
    is_recurring: boolean
  },
  display: RecurringBillDisplayParts,
  extras?: {
    amount?: number
    planTag?: string | null
    meta?: string | null
    occurredOn?: string | null
    statusLabel?: string | null
  },
): boolean {
  if (isBlankSearch(query)) return true

  const amount = extras?.amount ?? bill.amount
  const owner = isOwner(bill.owner) ? OWNER_LABELS[bill.owner] : bill.owner
  const circle = isCircle(bill.circle)
    ? CIRCLE_LABELS[bill.circle]
    : bill.circle

  return matchesSearchText(
    query,
    bill.name,
    display.parentName,
    display.childName,
    display.transferToLabel,
    bill.type,
    bill.type === 'transfer' ? 'transfer' : null,
    owner,
    circle,
    bill.is_recurring ? `day ${bill.due_day}` : 'estimate',
    bill.due_day,
    extras?.planTag,
    extras?.meta,
    extras?.occurredOn,
    extras?.statusLabel,
    ...amountSearchParts(amount),
  )
}
