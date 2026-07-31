import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, TransactionType } from '../lib/types'
import { getCategoryUsage } from '../lib/profile'

export function useCategories(type?: TransactionType) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

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
  }, [type])

  useEffect(() => {
    load()
  }, [load])

  const sortedByUsage = [...categories].sort(
    (a, b) => getCategoryUsage(b.id) - getCategoryUsage(a.id),
  )

  return { categories, sortedByUsage, loading, error, reload: load }
}
