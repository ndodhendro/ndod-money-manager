import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, TransactionType } from '../lib/types'
import { getCategoryUsage } from '../lib/profile'

export interface CategoryTreeNode extends Category {
  children: Category[]
}

export function useCategories(
  type?: TransactionType,
  options?: { includeInactive?: boolean },
) {
  const includeInactive = options?.includeInactive ?? false
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      }
      setLoading(false)
    },
    [type, includeInactive],
  )

  useEffect(() => {
    void load()
  }, [load])

  const parents = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  )

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const list = map.get(c.parent_id) ?? []
      list.push(c)
      map.set(c.parent_id, list)
    }
    return map
  }, [categories])

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
  const treeByUsage = useMemo(() => {
    const activeTree = tree
      .filter((p) => p.is_active)
      .map((p) => ({
        ...p,
        children: p.children.filter((c) => c.is_active),
      }))
    return [...activeTree].sort((a, b) => {
      const usageA =
        getCategoryUsage(a.id) +
        a.children.reduce((s, c) => s + getCategoryUsage(c.id), 0)
      const usageB =
        getCategoryUsage(b.id) +
        b.children.reduce((s, c) => s + getCategoryUsage(c.id), 0)
      return usageB - usageA
    })
  }, [tree])

  const byId = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const reload = useCallback(() => load({ silent: true }), [load])

  return {
    categories,
    parents,
    childrenByParent,
    tree,
    treeByUsage,
    byId,
    loading,
    error,
    reload,
  }
}
