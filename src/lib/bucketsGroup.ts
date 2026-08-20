import type {
  Bucket,
  BucketKind,
  BucketTreeNode,
  BucketWithBalance,
  BudgetGroup,
  Category,
} from './types'

export const BUCKET_KIND_ORDER: BucketKind[] = [
  'checking',
  'emergency',
  'investment',
  'sinking',
]

export type CategorySortRef = Pick<
  Category,
  'id' | 'name' | 'sort_order' | 'parent_id'
>

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
> &
  Partial<Pick<Bucket, 'category_id'>>

/**
 * Rank for sinking funds that mirror categories:
 * parent category sort_order, then subcategory sort_order (-1 for main-category buckets).
 */
function categorySequenceRank(
  bucket: Pick<Bucket, 'name'> & { category_id?: string | null },
  categoriesById: Map<string, CategorySortRef>,
): { parentOrder: number; childOrder: number; name: string } {
  const cat = bucket.category_id
    ? categoriesById.get(bucket.category_id)
    : undefined
  if (!cat) {
    return {
      parentOrder: Number.MAX_SAFE_INTEGER,
      childOrder: Number.MAX_SAFE_INTEGER,
      name: bucket.name,
    }
  }
  if (cat.parent_id) {
    const parent = categoriesById.get(cat.parent_id)
    return {
      parentOrder: parent?.sort_order ?? Number.MAX_SAFE_INTEGER,
      childOrder: cat.sort_order,
      name: bucket.name,
    }
  }
  return {
    parentOrder: cat.sort_order,
    childOrder: -1,
    name: bucket.name,
  }
}

/** Sinking order matching Settings category / subcategory sequence. */
export function compareSinkingByCategorySequence(
  a: Pick<Bucket, 'name'> & { category_id?: string | null },
  b: Pick<Bucket, 'name'> & { category_id?: string | null },
  categoriesById: Map<string, CategorySortRef>,
): number {
  const ra = categorySequenceRank(a, categoriesById)
  const rb = categorySequenceRank(b, categoriesById)
  if (ra.parentOrder !== rb.parentOrder) return ra.parentOrder - rb.parentOrder
  if (ra.childOrder !== rb.childOrder) return ra.childOrder - rb.childOrder
  return compareBucketNameAsc(ra.name, rb.name)
}

/** Sinking only: Needs → Wants → name ascending (legacy fallback). */
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
 *   (prefer compareSinkingByCategorySequence when categories are available)
 * - other kinds: name ascending
 */
export function compareBucketsWithinKind(
  a: BucketSortFields,
  b: BucketSortFields,
): number {
  if (a.kind === 'sinking' && b.kind === 'sinking') {
    const byGroupThenName = compareSinkingByGroupThenName(a, b)
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

export function compareBucketsWithinKindWithCategories(
  a: BucketSortFields,
  b: BucketSortFields,
  categoriesById?: Map<string, CategorySortRef> | null,
): number {
  if (
    categoriesById &&
    categoriesById.size > 0 &&
    a.kind === 'sinking' &&
    b.kind === 'sinking'
  ) {
    return compareSinkingByCategorySequence(a, b, categoriesById)
  }
  return compareBucketsWithinKind(a, b)
}

/**
 * Transfer From/To picker order: kind sections, then within sinking
 * Needs → Wants → name (no amount) — or category sequence when provided.
 */
export function compareBucketsForPicker(
  a: BucketSortFields,
  b: BucketSortFields,
  categoriesById?: Map<string, CategorySortRef> | null,
): number {
  const ai = BUCKET_KIND_ORDER.indexOf(a.kind)
  const bi = BUCKET_KIND_ORDER.indexOf(b.kind)
  if (ai !== bi) return ai - bi
  if (a.kind === 'sinking' && b.kind === 'sinking') {
    if (categoriesById && categoriesById.size > 0) {
      return compareSinkingByCategorySequence(a, b, categoriesById)
    }
    return compareSinkingByGroupThenName(a, b)
  }
  return compareBucketNameAsc(a.name, b.name)
}

/** Map of parent id → active children (any list of buckets). */
export function childrenByParentId<T extends Pick<Bucket, 'id' | 'parent_id'>>(
  buckets: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const b of buckets) {
    if (!b.parent_id) continue
    const list = map.get(b.parent_id) ?? []
    list.push(b)
    map.set(b.parent_id, list)
  }
  return map
}

/** True when the bucket has no active children (transfer target / leaf). */
export function isBucketLeaf(
  bucketId: string,
  childrenMap: Map<string, unknown[]>,
): boolean {
  const kids = childrenMap.get(bucketId)
  return !kids || kids.length === 0
}

/**
 * Leaves-only display balance: own ledger for leaves;
 * sum of children's own balances for parents with children.
 */
export function displayBucketBalance(
  bucket: Pick<Bucket, 'id' | 'kind'>,
  ownBalances: Map<string, number>,
  childrenMap: Map<string, Array<Pick<Bucket, 'id' | 'kind'>>>,
): number {
  const children = childrenMap.get(bucket.id)
  if (children && children.length > 0) {
    let sum = 0
    for (const child of children) {
      sum += displayBucketBalance(child, ownBalances, childrenMap)
    }
    return sum
  }
  const raw = ownBalances.get(bucket.id) ?? 0
  if (bucket.kind === 'sinking') return Math.max(0, raw)
  return raw
}

/**
 * Top-level buckets with nested sinking children.
 * Orphan children (missing parent in list) appear as top-level fallback.
 * When categoriesById is provided, order matches category / subcategory sequence.
 */
export function buildBucketTree(
  buckets: BucketWithBalance[],
  categoriesById?: Map<string, CategorySortRef> | null,
): BucketTreeNode[] {
  const byId = new Map(buckets.map((b) => [b.id, b]))
  const childrenMap = childrenByParentId(buckets)
  const compare = (a: BucketWithBalance, b: BucketWithBalance) =>
    compareBucketsWithinKindWithCategories(a, b, categoriesById)

  for (const [, kids] of childrenMap) {
    kids.sort(compare)
  }

  const roots: BucketWithBalance[] = []
  for (const b of buckets) {
    if (!b.parent_id) {
      roots.push(b)
      continue
    }
    if (!byId.has(b.parent_id)) {
      roots.push(b)
    }
  }
  roots.sort(compare)

  return roots.map((bucket) => ({
    bucket,
    children: [...(childrenMap.get(bucket.id) ?? [])],
  }))
}

/** Flat leaf buckets for transfer pickers (parents with children excluded). */
export function leafBuckets(
  buckets: BucketWithBalance[],
): BucketWithBalance[] {
  const childrenMap = childrenByParentId(buckets)
  return buckets.filter((b) => isBucketLeaf(b.id, childrenMap))
}

/**
 * Picker order: kind sections; within sinking, parents then their children
 * (leaves only — parents with children are already excluded by leafBuckets).
 */
export function sortLeavesForPicker(
  leaves: BucketWithBalance[],
  allBuckets: BucketWithBalance[],
  categoriesById?: Map<string, CategorySortRef> | null,
): BucketWithBalance[] {
  const byId = new Map(allBuckets.map((b) => [b.id, b]))
  const compare = (a: BucketWithBalance, b: BucketWithBalance) =>
    compareBucketsForPicker(a, b, categoriesById)
  const roots = allBuckets
    .filter((b) => !b.parent_id)
    .slice()
    .sort(compare)

  const result: BucketWithBalance[] = []
  const leafSet = new Set(leaves.map((b) => b.id))
  const placed = new Set<string>()

  for (const kind of BUCKET_KIND_ORDER) {
    const kindRoots = roots.filter((b) => b.kind === kind)
    for (const root of kindRoots) {
      if (leafSet.has(root.id) && !placed.has(root.id)) {
        result.push(root)
        placed.add(root.id)
      }
      const kids = allBuckets
        .filter((b) => b.parent_id === root.id && leafSet.has(b.id))
        .sort(compare)
      for (const kid of kids) {
        if (placed.has(kid.id)) continue
        result.push(kid)
        placed.add(kid.id)
      }
    }
  }

  for (const leaf of leaves.slice().sort(compare)) {
    if (placed.has(leaf.id)) continue
    if (leaf.parent_id && byId.has(leaf.parent_id)) {
      result.push(leaf)
      placed.add(leaf.id)
      continue
    }
    result.push(leaf)
    placed.add(leaf.id)
  }

  return result
}

/** Group buckets by kind in Settings / Plan display order. Omits empty kinds. */
export function groupBucketsByKind(
  buckets: BucketWithBalance[],
  categoriesById?: Map<string, CategorySortRef> | null,
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
    const items = [...(map.get(kind) ?? [])].sort((a, b) =>
      compareBucketsWithinKindWithCategories(a, b, categoriesById),
    )
    if (items.length > 0) groups.push([kind, items])
  }
  return groups
}

/**
 * Kind groups with sinking as a tree (top-level + children).
 * Non-sinking kinds stay flat lists of top-level rows only.
 */
export function groupBucketsByKindAsTree(
  buckets: BucketWithBalance[],
  categoriesById?: Map<string, CategorySortRef> | null,
): Array<[BucketKind, BucketTreeNode[]]> {
  const topLevel = buckets.filter((b) => !b.parent_id)
  const groups: Array<[BucketKind, BucketTreeNode[]]> = []
  for (const kind of BUCKET_KIND_ORDER) {
    if (kind === 'sinking') {
      const sinking = buckets.filter((b) => b.kind === 'sinking')
      const tree = buildBucketTree(sinking, categoriesById)
      if (tree.length > 0) groups.push([kind, tree])
      continue
    }
    const items = topLevel
      .filter((b) => b.kind === kind)
      .slice()
      .sort(compareBucketsWithinKind)
      .map((bucket) => ({ bucket, children: [] as BucketWithBalance[] }))
    if (items.length > 0) groups.push([kind, items])
  }
  return groups
}
