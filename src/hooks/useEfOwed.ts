import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_EF_OWED,
  fetchDerivedEfOwed,
  type EfOwedBySource,
} from '../lib/efOwed'
import { subscribeRecurringBillsChanged } from '../lib/recurringBillsEvents'
import { subscribeTransactionChanges } from './useTransactions'

export function useEfOwed() {
  const [owed, setOwed] = useState<EfOwedBySource>(EMPTY_EF_OWED)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    try {
      const derived = await fetchDerivedEfOwed()
      setOwed(derived.bySource)
    } catch {
      setOwed(EMPTY_EF_OWED)
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const unsubTx = subscribeTransactionChanges(() => {
      void reload({ silent: true })
    })
    const unsubBills = subscribeRecurringBillsChanged(() => {
      void reload({ silent: true })
    })
    return () => {
      unsubTx()
      unsubBills()
    }
  }, [reload])

  return { owed, loading, reload }
}
