import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchRecurringBillLogs,
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
  type RecurringBillLog,
} from '../lib/recurringBillsApi'

export function useRecurringBills(yearMonth: string) {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [logs, setLogs] = useState<RecurringBillLog[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [billRows, logRows] = await Promise.all([
        fetchRecurringBills(),
        fetchRecurringBillLogs(yearMonth),
      ])
      setBills(billRows)
      setLogs(logRows)
      setAvailable(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load checklist'
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
        setLogs([])
        setError(null)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => {
    void reload()
  }, [reload])

  const logByBillId = useMemo(() => {
    const map = new Map<string, RecurringBillLog>()
    for (const log of logs) map.set(log.bill_id, log)
    return map
  }, [logs])

  const unpaidCount = useMemo(
    () => bills.filter((b) => !logByBillId.has(b.id)).length,
    [bills, logByBillId],
  )

  return {
    bills,
    logs,
    logByBillId,
    unpaidCount,
    loading,
    available,
    error,
    reload,
  }
}
