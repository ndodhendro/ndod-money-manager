import { useMemo, useState } from 'react'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { MonthPager } from '../../components/MonthPager'
import { OwnerBadge } from '../../components/OwnerBadge'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useRecurringBills } from '../../hooks/useRecurringBills'
import { useTransactions } from '../../hooks/useTransactions'
import { formatRupiah } from '../../lib/format'
import { monthCursorKey } from '../../lib/monthCursor'
import {
  buildPaydayAllocation,
  type PaydayLineItem,
} from '../../lib/paydayAllocation'
import { PlanIcon, PlanTitle } from '../../lib/planSections'
import { OWNER_LABELS, type Owner } from '../../lib/types'

function AmountRow({
  label,
  amount,
  emphasize,
}: {
  label: string
  amount: number
  emphasize?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={
          emphasize
            ? 'text-sm font-semibold text-neutral-800 dark:text-neutral-100'
            : 'text-sm text-neutral-600 dark:text-neutral-300'
        }
      >
        {label}
      </span>
      <span
        className={
          emphasize
            ? 'text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-50'
            : 'text-sm tabular-nums text-neutral-800 dark:text-neutral-100'
        }
      >
        {formatRupiah(amount)}
      </span>
    </div>
  )
}

function SplitRow({
  owner,
  amount,
}: {
  owner: Owner
  amount: number
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <OwnerBadge owner={owner} size="inline" />
      <span className="text-sm tabular-nums text-neutral-800 dark:text-neutral-100">
        {formatRupiah(amount)}
      </span>
    </div>
  )
}

function LineItemList({ items }: { items: PaydayLineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-neutral-400">No items this month</p>
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.billId}:${item.occurredOn}`}
          className="flex items-center gap-2"
        >
          <span className="text-base leading-none" aria-hidden>
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-neutral-800 dark:text-neutral-100">
              {item.name}
            </p>
            <p className="text-[11px] text-neutral-400">
              Due {item.occurredOn.slice(8)}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-neutral-700 dark:text-neutral-200">
            {formatRupiah(item.amount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PlanPayday() {
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
  const yearMonth = monthCursorKey(cursor)
  const { transactions, loading, error } = useTransactions(range)
  const {
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    loading: billsLoading,
    available: billsAvailable,
    error: billsError,
  } = useRecurringBills(yearMonth)
  const {
    byId: categoriesById,
    loading: categoriesLoading,
    error: categoriesError,
  } = useCategories('expense', { includeInactive: true })
  const {
    byId: bucketsById,
    loading: bucketsLoading,
    error: bucketsError,
  } = useBuckets({ includeInactive: true })

  const [undueOpen, setUndueOpen] = useState(true)
  const [sinkingOpen, setSinkingOpen] = useState(true)

  const income = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'income' && !t.complete_later)
        .reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  )

  const allocation = useMemo(
    () =>
      buildPaydayAllocation({
        income,
        bills,
        overridesByBillId: overrideByBillId,
        skippedOccurrenceKeys,
        categoriesById,
        bucketsById,
        yearMonth,
      }),
    [
      income,
      bills,
      overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
    ],
  )

  const pageLoading =
    loading || billsLoading || categoriesLoading || bucketsLoading
  const pageError =
    error || billsError || categoriesError || bucketsError

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PlanSubPage
        title={PlanTitle.payday}
        icon={PlanIcon.payday}
        description="Split payday money for Free Guilty, undue bills, and sinking transfers."
      >
        <MonthPager
          monthLabel={monthLabel}
          canGoNext={canGoNext}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
        />

        {pageLoading && (
          <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
        )}
        {pageError && (
          <p className="mt-6 text-center text-sm text-red-500">{pageError}</p>
        )}
        {!billsAvailable && !pageLoading && (
          <p className="mt-6 text-center text-sm text-neutral-400">
            Recurring setup required
          </p>
        )}

        {!pageLoading && !pageError && billsAvailable && (
          <div className="mt-5 space-y-5">
            <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-800">
              <AmountRow label="Income" amount={allocation.income} />
              <AmountRow
                label="Planned Needs"
                amount={allocation.plannedNeeds}
              />
              <div className="border-t border-neutral-100 pt-2 dark:border-neutral-700">
                <AmountRow
                  label="Free Guilty"
                  amount={allocation.freeGuilty}
                  emphasize
                />
              </div>
              <div className="mt-1 space-y-1.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-900/60">
                <p className="text-[11px] font-medium text-neutral-500">
                  Free Guilty Split (50/50)
                </p>
                <SplitRow owner="suami" amount={allocation.freeGuiltyEach} />
                <SplitRow owner="istri" amount={allocation.freeGuiltyEach} />
              </div>
            </section>

            <GroupedListFrame
              label="Undue Recurring"
              collapseContent
              expanded={undueOpen}
              onToggle={setUndueOpen}
            >
              <div className="mb-3">
                <AmountRow
                  label="Total After Day 1"
                  amount={allocation.undueRecurring}
                  emphasize
                />
              </div>
              <LineItemList items={allocation.undueItems} />
            </GroupedListFrame>

            <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-800">
              <AmountRow
                label="Grand Total"
                amount={allocation.grandTotal}
                emphasize
              />
              <p className="text-[11px] text-neutral-400">
                Undue Recurring + Free Guilty
              </p>
              <div className="space-y-1.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-900/60">
                <p className="text-[11px] font-medium text-neutral-500">
                  Transfer to Accounts (50/50)
                </p>
                <SplitRow owner="suami" amount={allocation.accountEach} />
                <SplitRow owner="istri" amount={allocation.accountEach} />
                <p className="pt-0.5 text-[11px] text-neutral-400">
                  {OWNER_LABELS.suami} and {OWNER_LABELS.istri} each receive
                  half.
                </p>
              </div>
            </section>

            <GroupedListFrame
              label="Sinking Funds to Transfer"
              collapseContent
              expanded={sinkingOpen}
              onToggle={setSinkingOpen}
            >
              <div className="mb-3">
                <AmountRow
                  label="Total Sinking"
                  amount={allocation.sinkingTotal}
                  emphasize
                />
              </div>
              {allocation.sinkingByBucket.length > 0 && (
                <ul className="mb-3 space-y-2 border-b border-neutral-100 pb-3 dark:border-neutral-700">
                  {allocation.sinkingByBucket.map((row) => (
                    <li
                      key={row.bucketId}
                      className="flex items-center gap-2"
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {row.icon}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm text-neutral-800 dark:text-neutral-100">
                        {row.name}
                      </p>
                      <span className="shrink-0 text-sm tabular-nums text-neutral-700 dark:text-neutral-200">
                        {formatRupiah(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <LineItemList items={allocation.sinkingItems} />
            </GroupedListFrame>
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
