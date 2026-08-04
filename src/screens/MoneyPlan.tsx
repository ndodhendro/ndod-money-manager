import { MonthPager } from '../components/MonthPager'
import { PageTitle } from '../components/PageTitle'
import { SettingsNavRow } from '../components/SettingsNavRow'
import { useMonthCursor } from '../hooks/useMonthCursor'
import { useRecurringBills } from '../hooks/useRecurringBills'
import { useTransactions } from '../hooks/useTransactions'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatRupiah,
} from '../lib/format'
import { monthCursorKey } from '../lib/monthCursor'
import { NavIcon } from '../lib/navTabs'
import { PLAN_SECTIONS } from '../lib/planSections'

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
    bills,
    logByBillId,
    loading: billsLoading,
    available: billsAvailable,
  } = useRecurringBills(yearMonth)

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const net = totalIncome - totalExpense

  const doneCount = bills.filter((b) => logByBillId.has(b.id)).length
  const recurringSubtitle =
    !billsAvailable
      ? 'Setup required'
      : billsLoading
        ? 'Loading…'
        : bills.length === 0
          ? 'No items this month'
          : `${doneCount}/${bills.length} done`

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle icon={NavIcon.plan}>Money Plan</PageTitle>
      <MonthPager
        monthLabel={monthLabel}
        canGoNext={canGoNext}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
      />

      {loading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}

      {!loading && (
        <>
          <section className="mt-4">
            <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Monthly overview
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

          <div className="mt-6 space-y-2">
            {PLAN_SECTIONS.map((section) => (
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
        </>
      )}
    </div>
  )
}
