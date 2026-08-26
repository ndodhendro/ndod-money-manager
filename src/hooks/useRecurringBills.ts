import { useCallback, useEffect, useMemo, useState } from 'react'
import { currentMonthCursor, monthCursorKey } from '../lib/monthCursor'
import {
  fetchRecurringBillLogs,
  fetchRecurringBillMonthOverrides,
  fetchRecurringBillOccurrenceSkips,
  fetchRecurringBills,
  isMissingRecurringSchema,
  isOccurrenceSkipped,
  isEstimateActiveInMonth,
  occurrenceLogKey,
  occurrencesInMonth,
  dueBillIdByTxIdFromLogs,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
} from '../lib/recurringBillsApi'
import { subscribeRecurringBillsChanged } from '../lib/recurringBillsEvents'

export function useRecurringBills(yearMonth: string) {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [allActiveBills, setAllActiveBills] = useState<RecurringBill[]>([])
  const [logs, setLogs] = useState<RecurringBillLog[]>([])
  const [overrides, setOverrides] = useState<RecurringBillMonthOverride[]>([])
  const [occurrenceSkips, setOccurrenceSkips] = useState<
    Array<{ bill_id: string; occurred_on: string }>
  >([])
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
      const [billRows, logRows, overrideRows, skipRows, currentLogRows] =
        await Promise.all([
          fetchRecurringBills(),
          fetchRecurringBillLogs(yearMonth),
          fetchRecurringBillMonthOverrides(yearMonth),
          fetchRecurringBillOccurrenceSkips(yearMonth),
          yearMonth === currentYm
            ? Promise.resolve(null)
            : fetchRecurringBillLogs(currentYm),
        ])
      setAllActiveBills(billRows)
      setBills(
        billRows.filter((b) => isEstimateActiveInMonth(b, yearMonth)),
      )
      setLogs(logRows)
      setOverrides(overrideRows)
      setOccurrenceSkips(skipRows)
      setCurrentMonthLogs(currentLogRows ?? logRows)
      setAvailable(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load checklist'
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
        setAllActiveBills([])
        setLogs([])
        setOverrides([])
        setOccurrenceSkips([])
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

  const dueBillIdByTxId = useMemo(
    () => dueBillIdByTxIdFromLogs(logs),
    [logs],
  )

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

  const skippedOccurrenceKeys = useMemo(() => {
    const set = new Set<string>()
    for (const row of occurrenceSkips) {
      set.add(occurrenceLogKey(row.bill_id, row.occurred_on))
    }
    return set
  }, [occurrenceSkips])

  const currentMonthDoneByBillId = useMemo(() => {
    const set = new Set<string>()
    for (const log of currentMonthLogs) set.add(log.bill_id)
    return set
  }, [currentMonthLogs])

  const occurrenceTotal = useMemo(() => {
    let total = 0
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
        if (
          isOccurrenceSkipped(
            bill.id,
            occurredOn,
            skippedOccurrenceKeys,
            override,
          )
        ) {
          continue
        }
        total += 1
      }
    }
    return total
  }, [bills, overrideByBillId, skippedOccurrenceKeys, yearMonth])

  const occurrenceDoneCount = useMemo(() => {
    let done = 0
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
        if (
          isOccurrenceSkipped(
            bill.id,
            occurredOn,
            skippedOccurrenceKeys,
            override,
          )
        ) {
          continue
        }
        if (logByOccurrenceKey.has(occurrenceLogKey(bill.id, occurredOn))) {
          done += 1
        }
      }
    }
    return done
  }, [
    bills,
    logByOccurrenceKey,
    overrideByBillId,
    skippedOccurrenceKeys,
    yearMonth,
  ])

  const unpaidCount = useMemo(() => {
    let count = 0
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
        if (
          isOccurrenceSkipped(
            bill.id,
            occurredOn,
            skippedOccurrenceKeys,
            override,
          )
        ) {
          continue
        }
        if (!logByOccurrenceKey.has(occurrenceLogKey(bill.id, occurredOn))) {
          count += 1
        }
      }
    }
    return count
  }, [
    bills,
    logByOccurrenceKey,
    overrideByBillId,
    skippedOccurrenceKeys,
    yearMonth,
  ])

  return {
    bills,
    allActiveBills,
    logs,
    logByBillId,
    logByOccurrenceKey,
    dueBillIdByTxId,
    overrideByBillId,
    skippedOccurrenceKeys,
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
