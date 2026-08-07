import { useCallback, useEffect, useMemo, useState } from 'react'
import { currentMonthCursor, monthCursorKey } from '../lib/monthCursor'
import {
  fetchRecurringBillLogs,
  fetchRecurringBillMonthOverrides,
  fetchRecurringBills,
  isMissingRecurringSchema,
  isRecurringActiveInMonth,
  isRecurringSkipped,
  occurrenceLogKey,
  occurrencesInMonth,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
} from '../lib/recurringBillsApi'
import { subscribeRecurringBillsChanged } from '../lib/recurringBillsEvents'

export function useRecurringBills(yearMonth: string) {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [logs, setLogs] = useState<RecurringBillLog[]>([])
  const [overrides, setOverrides] = useState<RecurringBillMonthOverride[]>([])
  const [currentMonthLogs, setCurrentMonthLogs] = useState<RecurringBillLog[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    setError(null)
    const currentYm = monthCursorKey(currentMonthCursor())
    try {
      const [billRows, logRows, overrideRows, currentLogRows] =
        await Promise.all([
          fetchRecurringBills(),
          fetchRecurringBillLogs(yearMonth),
          fetchRecurringBillMonthOverrides(yearMonth),
          yearMonth === currentYm
            ? Promise.resolve(null)
            : fetchRecurringBillLogs(currentYm),
        ])
      setBills(billRows.filter((b) => isRecurringActiveInMonth(b, yearMonth)))
      setLogs(logRows)
      setOverrides(overrideRows)
      setCurrentMonthLogs(currentLogRows ?? logRows)
      setAvailable(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load checklist'
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
        setLogs([])
        setOverrides([])
        setCurrentMonthLogs([])
        setError(null)
      } else {
        setError(message)
      }
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [yearMonth])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return subscribeRecurringBillsChanged(() => {
      void reload({ silent: true })
    })
  }, [reload])

  const logByOccurrenceKey = useMemo(() => {
    const map = new Map<string, RecurringBillLog>()
    for (const log of logs) {
      map.set(occurrenceLogKey(log.bill_id, log.occurred_on), log)
    }
    return map
  }, [logs])

  /** @deprecated Prefer logByOccurrenceKey — last log wins per bill. */
  const logByBillId = useMemo(() => {
    const map = new Map<string, RecurringBillLog>()
    for (const log of logs) map.set(log.bill_id, log)
    return map
  }, [logs])

  const overrideByBillId = useMemo(() => {
    const map = new Map<string, RecurringBillMonthOverride>()
    for (const row of overrides) map.set(row.bill_id, row)
    return map
  }, [overrides])

  const currentMonthDoneByBillId = useMemo(() => {
    const set = new Set<string>()
    for (const log of currentMonthLogs) set.add(log.bill_id)
    return set
  }, [currentMonthLogs])

  const occurrenceTotal = useMemo(() => {
    let total = 0
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      if (isRecurringSkipped(override)) continue
      total += occurrencesInMonth(bill, yearMonth, override).length
    }
    return total
  }, [bills, overrideByBillId, yearMonth])

  const occurrenceDoneCount = useMemo(() => {
    let done = 0
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      if (isRecurringSkipped(override)) continue
      for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
        if (logByOccurrenceKey.has(occurrenceLogKey(bill.id, occurredOn))) {
          done += 1
        }
      }
    }
    return done
  }, [bills, logByOccurrenceKey, overrideByBillId, yearMonth])

  const unpaidCount = useMemo(() => {
    let count = 0
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      if (isRecurringSkipped(override)) continue
      for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
        if (!logByOccurrenceKey.has(occurrenceLogKey(bill.id, occurredOn))) {
          count += 1
        }
      }
    }
    return count
  }, [bills, logByOccurrenceKey, overrideByBillId, yearMonth])

  return {
    bills,
    logs,
    logByBillId,
    logByOccurrenceKey,
    overrideByBillId,
    currentMonthDoneByBillId,
    occurrenceTotal,
    occurrenceDoneCount,
    unpaidCount,
    loading,
    available,
    error,
    reload,
  }
}
