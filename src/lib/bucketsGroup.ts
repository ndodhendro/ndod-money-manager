import type { BucketKind, BucketWithBalance } from './types'

export const BUCKET_KIND_ORDER: BucketKind[] = [
  'emergency',
  'investment',
  'sinking',
]

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
    const items = map.get(kind) ?? []
    if (items.length > 0) groups.push([kind, items])
  }
  return groups
}
