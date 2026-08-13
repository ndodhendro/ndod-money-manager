import { useState } from 'react'
import { FreeGuiltyRemainingBlock } from '../../components/FreeGuiltyRemaining'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useFreeGuiltyProgress } from '../../hooks/useFreeGuiltyProgress'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useTransactions } from '../../hooks/useTransactions'
import { formatRupiah } from '../../lib/format'
import { monthCursorKey } from '../../lib/monthCursor'
import { PlanIcon, PlanTitle } from '../../lib/planSections'

function AmountRow({
  label,
  amount,
  emphasize,
  inset,
}: {
  label: string
  amount: number
  emphasize?: boolean
  inset?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        inset
          ? 'rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-900/70'
          : ''
      }`}
    >
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
    allocation,
    progress: budgetProgress,
    loading: budgetLoading,
    error: budgetError,
    available: billsAvailable,
  } = useFreeGuiltyProgress(yearMonth, transactions)

  const [sinkingOpen, setSinkingOpen] = useState(true)
  const [bonusOpen, setBonusOpen] = useState(true)

  const pageLoading = loading || budgetLoading
  const pageError = error || budgetError

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage
        title={PlanTitle.payday}
        icon={PlanIcon.payday}
        description="Month budget, sinking transfers, and bonus allocation."
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

        {!pageLoading && !pageError && billsAvailable && allocation && (
          <div className="mt-5 space-y-5">
            <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-800">
              <AmountRow label="Income" amount={allocation.income} />
              {allocation.bonusIncome > 0 && (
                <AmountRow label="Bonus" amount={allocation.bonusIncome} />
              )}
              <AmountRow
                label="Sinking Funds"
                amount={allocation.sinkingTotal}
              />
              <div className="space-y-1.5 border-t border-neutral-100 pt-2 dark:border-neutral-700">
                <AmountRow
                  label="Planned Needs"
                  amount={allocation.plannedNeeds}
                />
                <AmountRow
                  label={`Buffer (${allocation.bufferPct}%)`}
                  amount={allocation.buffer}
                />
                <AmountRow
                  label="Planned Wants"
                  amount={allocation.plannedWants}
                />
                <AmountRow
                  label="Guilt-Free Fund"
                  amount={allocation.guiltFree}
                  emphasize
                />
              </div>
            </section>

            {budgetProgress && (
              <section className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Month Budget
                </p>
                <FreeGuiltyRemainingBlock progress={budgetProgress} />
              </section>
            )}

            {allocation.bonusAllocation && (
              <GroupedListFrame
                label="Bonus Allocation"
                collapseContent
                expanded={bonusOpen}
                onToggle={setBonusOpen}
              >
                <div className="mb-3 space-y-2">
                  <AmountRow
                    label="Bonus Income"
                    amount={allocation.bonusAllocation.bonusIncome}
                    emphasize
                  />
                  <AmountRow
                    label="To 12-Month Sinking"
                    amount={allocation.bonusAllocation.sinkingFilled}
                  />
                  <AmountRow
                    label="To Emergency"
                    amount={allocation.bonusAllocation.emergency}
                  />
                  <AmountRow
                    label="To Investment"
                    amount={allocation.bonusAllocation.investment}
                  />
                  {allocation.bonusAllocation.unallocated > 0 && (
                    <AmountRow
                      label="Unallocated"
                      amount={allocation.bonusAllocation.unallocated}
                    />
                  )}
                </div>
                {allocation.bonusAllocation.lines.length === 0 ? (
                  <p className="text-xs text-neutral-400">
                    No 12-month sinking gaps; remainder goes to Emergency &amp;
                    Investment
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {allocation.bonusAllocation.lines.map((row) => (
                      <li
                        key={`${row.kind}:${row.bucketId}`}
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
              </GroupedListFrame>
            )}

            <GroupedListFrame
              label="Sinking Funds to Transfer"
              collapseContent
              expanded={sinkingOpen}
              onToggle={setSinkingOpen}
            >
              <div className="mb-3">
                <AmountRow
                  label="Total"
                  amount={allocation.sinkingTotal}
                  emphasize
                />
              </div>
              {allocation.sinkingTransfers.length === 0 ? (
                <p className="text-xs text-neutral-400">No items this month</p>
              ) : (
                <ul className="space-y-2">
                  {allocation.sinkingTransfers.map((row) => (
                    <li
                      key={row.billId}
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
            </GroupedListFrame>
          </div>
        )}
      </PlanSubPage>
    </div>
  )
}
