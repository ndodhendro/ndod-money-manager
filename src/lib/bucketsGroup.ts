import type { Bucket, BucketKind, BucketWithBalance, BudgetGroup } from './types'

export const BUCKET_KIND_ORDER: BucketKind[] = [
  'checking',
  'emergency',
  'investment',
  'sinking',
]

export function compareBucketNameAsc(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/** Needs before Wants; unknown/null last. */
function budgetGroupSortRank(group: BudgetGroup | null | undefined): number {
  if (group === 'needs') return 0
  if (group === 'wants') return 1
  return 2
}

type BucketSortFields = Pick<
  Bucket,
  'kind' | 'name' | 'budget_group' | 'target_amount'
>

/** Sinking only: Needs → Wants → name ascending. */
export function compareSinkingByGroupThenName(
  a: Pick<Bucket, 'budget_group' | 'name'>,
  b: Pick<Bucket, 'budget_group' | 'name'>,
): number {
  const byGroup =
    budgetGroupSortRank(a.budget_group) - budgetGroupSortRank(b.budget_group)
  if (byGroup !== 0) return byGroup
  return compareBucketNameAsc(a.name, b.name)
}

/**
 * Within a kind section:
 * - sinking: Needs → Wants, then target amount desc, then name asc
 * - other kinds: name ascending
 */
export function compareBucketsWithinKind(
  a: BucketSortFields,
  b: BucketSortFields,
): number {
  if (a.kind === 'sinking' && b.kind === 'sinking') {
    const byGroupThenName = compareSinkingByGroupThenName(a, b)
    // Same group: amount desc before name (compareSinking ends on name).
    if (
      budgetGroupSortRank(a.budget_group) ===
      budgetGroupSortRank(b.budget_group)
    ) {
      const amountA = a.target_amount ?? 0
      const amountB = b.target_amount ?? 0
      if (amountA !== amountB) return amountB - amountA
    }
    return byGroupThenName
  }
  return compareBucketNameAsc(a.name, b.name)
}

/**
 * Transfer From/To picker order: kind sections, then within sinking
 * Needs → Wants → name (no amount).
 */
export function compareBucketsForPicker(
  a: BucketSortFields,
  b: BucketSortFields,
): number {
  const ai = BUCKET_KIND_ORDER.indexOf(a.kind)
  const bi = BUCKET_KIND_ORDER.indexOf(b.kind)
  if (ai !== bi) return ai - bi
  if (a.kind === 'sinking' && b.kind === 'sinking') {
    return compareSinkingByGroupThenName(a, b)
  }
  return compareBucketNameAsc(a.name, b.name)
}

/** Group buckets by kind in Settings / Plan display order. Omits empty kinds. */
export function groupBucketsByKind(
  buckets: BucketWithBalance[],
): Array<[BucketKind, BucketWithBalance[]]> {
  const map = new Map<BucketKind, BucketWithBalance[]>()
  for (const kind of BUCKET_KIND_ORDER) map.set(kind, [])
  for (const b of buckets) {
    const list = map.get(b.kind) ?? []
    list.push(b)
    map.set(b.kind, list)
  }
  const groups: Array<[BucketKind, BucketWithBalance[]]> = []
  for (const kind of BUCKET_KIND_ORDER) {
    const items = [...(map.get(kind) ?? [])].sort(compareBucketsWithinKind)
    if (items.length > 0) groups.push([kind, items])
  }
  return groups
}
