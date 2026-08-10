import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRecurringBills } from '../hooks/useRecurringBills'
import { todayIso } from '../lib/format'
import {
  currentMonthCursor,
  monthCursorKey,
} from '../lib/monthCursor'
import { PLAN_SECTIONS } from '../lib/planSections'
import { countDueOrOverdueUnchecked } from '../lib/recurringBillsApi'

const RECURRING_SECTION = PLAN_SECTIONS.find(
  (s) => s.to === '/rencana/recurring',
)!

export function RecurringChecklistFab() {
  const navigate = useNavigate()
  const location = useLocation()
  const yearMonth = monthCursorKey(currentMonthCursor())
  const { bills, logByOccurrenceKey, overrideByBillId, skippedOccurrenceKeys, loading, available, reload } =
    useRecurringBills(yearMonth)
  const skipPathReload = useRef(true)

  useEffect(() => {
    if (skipPathReload.current) {
      skipPathReload.current = false
      return
    }
    void reload({ silent: true })
  }, [location.pathname, reload])

  const dueCount = useMemo(
    () =>
      countDueOrOverdueUnchecked(
        bills,
        logByOccurrenceKey,
        currentMonthCursor(),
        todayIso(),
        yearMonth,
        overrideByBillId,
        skippedOccurrenceKeys,
      ),
    [bills, logByOccurrenceKey, overrideByBillId, skippedOccurrenceKeys, yearMonth],
  )

  const hide =
    location.pathname === '/tambah' ||
    location.pathname.startsWith('/transaksi/')

  if (hide || loading || !available || dueCount === 0) return null

  return (
    <button
      type="button"
      onClick={() =>
        navigate('/riwayat', {
          replace: true,
          state: { focusDue: true },
        })
      }
      className="recurring-checklist-fab fixed right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm leading-none text-white shadow-md transition-transform duration-200 active:scale-95"
      style={{
        top: 'calc(0.5rem + env(safe-area-inset-top))',
      }}
      aria-label={`Due checklist, ${dueCount} due`}
      title="Due Checklist"
    >
      <span aria-hidden>{RECURRING_SECTION.icon}</span>
      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-semibold leading-none text-white">
        {dueCount > 9 ? '9+' : dueCount}
      </span>
    </button>
  )
}
