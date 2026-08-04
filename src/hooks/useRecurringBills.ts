import { useCallback, useEffect, useMemo, useState } from 'react'
import { currentMonthCursor, monthCursorKey } from '../lib/monthCursor'
import {
  fetchRecurringBillLogs,
  fetchRecurringBills,
  isMissingRecurringSchema,
  isRecurringActiveInMonth,
  type RecurringBill,
  type RecurringBillLog,
} from '../lib/recurringBillsApi'

export function useRecurringBills(yearMonth: string) {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [logs, setLogs] = useState<RecurringBillLog[]>([])
  const [currentMonthLogs, setCurrentMonthLogs] = useState<RecurringBillLog[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const currentYm = monthCursorKey(currentMonthCursor())
    try {
      const [billRows, logRows, currentLogRows] = await Promise.all([
        fetchRecurringBills(),
        fetchRecurringBillLogs(yearMonth),
        yearMonth === currentYm
          ? Promise.resolve(null)
          : fetchRecurringBillLogs(currentYm),
      ])
      setBills(billRows.filter((b) => isRecurringActiveInMonth(b, yearMonth)))
      setLogs(logRows)
      setCurrentMonthLogs(currentLogRows ?? logRows)
      setAvailable(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load checklist'
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
        setLogs([])
        setCurrentMonthLogs([])
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

  const currentMonthDoneByBillId = useMemo(() => {
    const set = new Set<string>()
    for (const log of currentMonthLogs) set.add(log.bill_id)
    return set
  }, [currentMonthLogs])

  const unpaidCount = useMemo(
    () => bills.filter((b) => !logByBillId.has(b.id)).length,
    [bills, logByBillId],
  )

  return {
    bills,
    logs,
    logByBillId,
    currentMonthDoneByBillId,
    unpaidCount,
    loading,
    available,
    error,
    reload,
  }
}
