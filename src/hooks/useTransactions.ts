import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchTransactions } from '../lib/transactionsApi'
import type { TransactionWithCategory } from '../lib/types'

type TxChangeListener = () => void

/**
 * One shared Realtime channel for `transactions` — multiple `useTransactions`
 * mounts (e.g. History + DueThisMonthChecklist) must not each call `.on()` on
 * the same topic after `subscribe()`, or Supabase throws and the screen goes blank.
 */
const txListeners = new Set<TxChangeListener>()
let txChannel: RealtimeChannel | null = null
let txChannelSeq = 0

function subscribeTransactionChanges(listener: TxChangeListener): () => void {
  txListeners.add(listener)
  if (!txChannel) {
    // Unique topic each create — avoids colliding with a channel still
    // tearing down after the last subscriber left.
    txChannel = supabase
      .channel(`transactions-changes:${++txChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          for (const l of txListeners) l()
        },
      )
      .subscribe()
  }
  return () => {
    txListeners.delete(listener)
    if (txListeners.size === 0 && txChannel) {
      const ch = txChannel
      txChannel = null
      void supabase.removeChannel(ch)
    }
  }
}

export function useTransactions(range: { start: string; end: string }) {
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      try {
        const data = await fetchTransactions(range)
        setTransactions(data)
        setError(null)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load transactions',
        )
      } finally {
        if (!options?.silent) setLoading(false)
      }
    },
    [range.start, range.end],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Realtime: kalau pasangan input transaksi baru dari device lain, layar ini auto-refresh.
  useEffect(() => {
    return subscribeTransactionChanges(() => {
      void load({ silent: true })
    })
  }, [load])

  const applyDaySortOrder = useCallback((date: string, orderedIds: string[]) => {
    const day = date.slice(0, 10)
    setTransactions((prev) =>
      prev.map((tx) => {
        if (String(tx.occurred_on).slice(0, 10) !== day) return tx
        const idx = orderedIds.indexOf(tx.id)
        if (idx < 0) return tx
        return { ...tx, sort_order: idx + 1 }
      }),
    )
  }, [])

  return { transactions, loading, error, reload: load, applyDaySortOrder }
}
