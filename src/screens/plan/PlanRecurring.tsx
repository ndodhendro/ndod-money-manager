import { DueThisMonthChecklist } from '../../components/DueThisMonthChecklist'
import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useRecurringBills } from '../../hooks/useRecurringBills'
import { monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'

export function PlanRecurring() {
  const {
    cursor,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()
  const yearMonth = monthCursorKey(cursor)
  const {
    bills,
    logByOccurrenceKey,
    overrideByBillId,
    skippedOccurrenceKeys,
    currentMonthDoneByBillId,
    loading: billsLoading,
    available: billsAvailable,
    reload: reloadBills,
  } = useRecurringBills(yearMonth)

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title={PlanTitle.recurring}
        icon={PlanIcon.recurring}
        description=""
      >
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
            logByOccurrenceKey={logByOccurrenceKey}
            overrideByBillId={overrideByBillId}
            skippedOccurrenceKeys={skippedOccurrenceKeys}
            currentMonthDoneByBillId={currentMonthDoneByBillId}
            loading={billsLoading}
            available={billsAvailable}
            variant="plan"
            showSearchField
            onChanged={() => {
              // Keep list mounted — non-silent reload flashes "Loading…".
              void reloadBills({ silent: true })
            }}
          />
        </div>
      </PlanSubPage>
    </div>
  )
}
