import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchTransactions } from '../lib/transactionsApi'
import type { TransactionWithCategory } from '../lib/types'

export function useTransactions(range: { start: string; end: string }) {
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTransactions(range)
      setTransactions(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat transaksi')
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: kalau pasangan input transaksi baru dari device lain, layar ini auto-refresh.
  useEffect(() => {
    const channel = supabase
      .channel('transactions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          load()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  return { transactions, loading, error, reload: load }
}
