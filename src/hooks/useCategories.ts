import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, CategoryType } from '../lib/types'

export interface CategoryTreeNode extends Category {
  children: Category[]
}

const EMPTY_CATEGORIES: Category[] = []

function bySortOrder(a: Category, b: Category): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.name.localeCompare(b.name)
}

export function useCategories(
  type?: CategoryType,
  options?: { includeInactive?: boolean },
) {
  const includeInactive = options?.includeInactive ?? false
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Track which request the cached rows belong to so consumers never see a
  // stale expense map while income is loading (that cleared selectedId on edit).
  const [fetchedKey, setFetchedKey] = useState<string | null>(null)
  const requestKey = `${type ?? 'all'}:${includeInactive ? 'all' : 'active'}`
  const dataMatchesRequest = fetchedKey === requestKey

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true)
      let query = supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

      if (!includeInactive) {
        query = query.eq('is_active', true)
      }
      if (type) {
        query = query.eq('type', type)
      }

      const { data, error: fetchError } = await query
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setError(null)
        setCategories((data ?? []) as Category[])
        setFetchedKey(`${type ?? 'all'}:${includeInactive ? 'all' : 'active'}`)
      }
      setLoading(false)
    },
    [type, includeInactive],
  )

  useEffect(() => {
    void load()
  }, [load])

  const visibleCategories = dataMatchesRequest ? categories : EMPTY_CATEGORIES

  const parents = useMemo(
    () =>
      visibleCategories.filter((c) => !c.parent_id).sort(bySortOrder),
    [visibleCategories],
  )

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>()
    for (const c of visibleCategories) {
      if (!c.parent_id) continue
      const list = map.get(c.parent_id) ?? []
      list.push(c)
      map.set(c.parent_id, list)
    }
    for (const list of map.values()) {
      list.sort(bySortOrder)
    }
    return map
  }, [visibleCategories])

  const tree: CategoryTreeNode[] = useMemo(
    () =>
      parents.map((p) => ({
        ...p,
        children: childrenByParent.get(p.id) ?? [],
      })),
    [parents, childrenByParent],
  )

  // Picker: visibilitas efektif = is_active AND (no parent OR parent is_active).
  // Parent inactive → hilang dari tree; anak ikut tidak tampil meski is_active sendiri true.
  // Order follows Settings sequence (sort_order), not usage frequency.
  const treeByUsage = useMemo(
    () =>
      tree
        .filter((p) => p.is_active)
        .map((p) => ({
          ...p,
          children: p.children.filter((c) => c.is_active),
        })),
    [tree],
  )

  const byId = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of visibleCategories) map.set(c.id, c)
    return map
  }, [visibleCategories])

  const reload = useCallback(() => load({ silent: true }), [load])

  return {
    categories: visibleCategories,
    parents,
    childrenByParent,
    tree,
    treeByUsage,
    byId,
    loading: loading || !dataMatchesRequest,
    error,
    reload,
  }
}
