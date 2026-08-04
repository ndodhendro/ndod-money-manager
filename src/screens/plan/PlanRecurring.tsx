import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  DueThisMonthChecklist,
  type RecurringFocusState,
} from '../../components/DueThisMonthChecklist'
import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useRecurringBills } from '../../hooks/useRecurringBills'
import { useTransactions } from '../../hooks/useTransactions'
import {
  currentMonthCursor,
  monthCursorKey,
} from '../../lib/monthCursor'

export function PlanRecurring() {
  const location = useLocation()
  const {
    cursor,
    setCursor,
    range,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()
  const yearMonth = monthCursorKey(cursor)
  const { reload: reloadTx } = useTransactions(range)
  const {
    bills,
    logByBillId,
    loading: billsLoading,
    available: billsAvailable,
    reload: reloadBills,
  } = useRecurringBills(yearMonth)

  // FAB opens current-month dues — snap month pager back if user was browsing elsewhere.
  useEffect(() => {
    const focusDue = (location.state as RecurringFocusState | null)?.focusDue
    if (!focusDue) return
    setCursor(currentMonthCursor())
  }, [location.state, setCursor])

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage title="Recurring Checklist" description="">
        <MonthPager
          monthLabel={monthLabel}
          canGoNext={canGoNext}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
        />
        <div className="mt-4">
          <DueThisMonthChecklist
            cursor={cursor}
            bills={bills}
            logByBillId={logByBillId}
            loading={billsLoading}
            available={billsAvailable}
            embedded
            onChanged={() => {
              void reloadBills()
              void reloadTx()
            }}
          />
        </div>
      </PlanSubPage>
    </div>
  )
}
