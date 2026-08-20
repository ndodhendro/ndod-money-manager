import { useMemo } from 'react'
import { FreeGuiltyRemainingGlance } from '../components/FreeGuiltyRemaining'
import { MonthPager } from '../components/MonthPager'
import { PageTitle } from '../components/PageTitle'
import { SettingsNavRow } from '../components/SettingsNavRow'
import { useFreeGuiltyProgress } from '../hooks/useFreeGuiltyProgress'
import { useMonthCursor } from '../hooks/useMonthCursor'
import { useTransactions } from '../hooks/useTransactions'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatRupiah,
  todayIso,
} from '../lib/format'
import { monthCursorKey } from '../lib/monthCursor'
import { NavIcon } from '../lib/navTabs'
import { PLAN_PROGRESS_SECTIONS } from '../lib/planSections'
import { countUpcomingUnchecked } from '../lib/recurringBillsApi'

function formatUpcomingSkippedSubtitle(
  upcoming: number,
  skipped: number,
): string {
  if (upcoming === 0 && skipped === 0) return 'Nothing upcoming or skipped'
  const parts: string[] = []
  if (upcoming > 0) parts.push(`${upcoming} upcoming`)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  return parts.join(' · ')
}

export function MoneyPlanScreen() {
  const {
    cursor,
    range,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  } = useMonthCursor()
  const { transactions, loading, error } = useTransactions(range)
  const yearMonth = monthCursorKey(cursor)
  const {
    progress: freeGuiltyProgress,
    skippedOccurrenceKeys,
    bills,
    logByOccurrenceKey,
    overrideByBillId,
    loading: freeGuiltyLoading,
    available: billsAvailable,
  } = useFreeGuiltyProgress(yearMonth, transactions)

  const totalIncome = transactions
    .filter((t) => t.type === 'income' && !t.complete_later)
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions
    .filter((t) => t.type === 'expense' && !t.complete_later)
    .reduce((sum, t) => sum + t.amount, 0)
  const net = totalIncome - totalExpense

  const upcomingCount = useMemo(
    () =>
      countUpcomingUnchecked(
        bills,
        logByOccurrenceKey,
        cursor,
        todayIso(),
        yearMonth,
        overrideByBillId,
        skippedOccurrenceKeys,
      ),
    [
      bills,
      logByOccurrenceKey,
      cursor,
      yearMonth,
      overrideByBillId,
      skippedOccurrenceKeys,
    ],
  )

  const skippedCount = skippedOccurrenceKeys.size
  const recurringSubtitle =
    !billsAvailable
      ? 'Setup required'
      : freeGuiltyLoading
        ? 'Loading…'
        : formatUpcomingSkippedSubtitle(upcomingCount, skippedCount)

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle
        icon={NavIcon.plan}
        description="Follow your plan for this month."
      >
        Money Plan
      </PageTitle>
      <MonthPager
        monthLabel={monthLabel}
        canGoNext={canGoNext}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
      />

      {freeGuiltyProgress && (
        <FreeGuiltyRemainingGlance progress={freeGuiltyProgress} />
      )}

      {loading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}

      {!loading && (
        <>
          <section className="mt-6">
            <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Track Progress
            </p>
            <div className="space-y-2">
              {PLAN_PROGRESS_SECTIONS.map((section) => (
                <SettingsNavRow
                  key={section.to}
                  to={section.to}
                  icon={section.icon}
                  title={section.title}
                  subtitle={
                    section.to === '/rencana/recurring'
                      ? recurringSubtitle
                      : section.subtitle
                  }
                />
              ))}
            </div>
          </section>

          <section className="mt-6">
            <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              This Month&apos;s Cashflow
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                <p className="text-xs text-neutral-400">Income</p>
                <p className={`mt-1 text-base font-semibold ${AMOUNT_IN_CLASS}`}>
                  {formatRupiah(totalIncome)}
                </p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                <p className="text-xs text-neutral-400">Expense</p>
                <p className={`mt-1 text-base font-semibold ${AMOUNT_OUT_CLASS}`}>
                  {formatRupiah(totalExpense)}
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-neutral-900 p-3 text-white dark:bg-neutral-800">
              <p className="text-xs text-neutral-300">Net</p>
              <p
                className={`mt-1 text-lg font-semibold ${amountToneClass(net >= 0)}`}
              >
                {net < 0 ? '-' : '+'}
                {formatRupiah(Math.abs(net))}
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
