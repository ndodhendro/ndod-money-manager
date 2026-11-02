import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CollapsibleDayGroup } from '../../components/CollapsibleDayGroup'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { HistoryTxRowBody } from '../../components/HistoryTxRowBody'
import { HistoryTxSwipeRow } from '../../components/HistoryDaySortableList'
import { MonthPager } from '../../components/MonthPager'
import { PlanSubPage } from '../../components/PlanSubPage'
import { RecurringBillRowContent } from '../../components/RecurringBillRowContent'
import { useBuckets } from '../../hooks/useBuckets'
import { useFreeGuiltyProgress } from '../../hooks/useFreeGuiltyProgress'
import { useHistoryTxMeta } from '../../hooks/useHistoryTxMeta'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useTransactions } from '../../hooks/useTransactions'
import { ActionEmoji } from '../../lib/actionEmoji'
import { showAppToast } from '../../lib/appToast'
import { sinkingLinkedCategoryIds } from '../../lib/bucketsApi'
import { areAllCollapseOpen } from '../../lib/collapseState'
import {
  buildMonthBudgetEstimateRows,
  compareHistoryDayDisplay,
  listMonthBudgetUnscheduledItems,
  listMonthBudgetUpcomingItems,
  type MonthBudgetProjectionItem,
} from '../../lib/estimateProgress'
import {
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatDateLabel,
  formatRupiah,
  todayIso,
} from '../../lib/format'
import { estimatePlanBadgeGroup, estimatePlanTag } from '../../lib/freeWants'
import { monthCursorKey } from '../../lib/monthCursor'
import {
  isMonthBudgetDetailGroup,
  isMonthBudgetDetailKind,
  monthBudgetDetailDescription,
  monthBudgetDetailIcon,
  monthBudgetDetailTitle,
  monthBudgetOverspendAmountByTxId,
  type MonthBudgetDetailGroup,
  type MonthBudgetDetailKind,
} from '../../lib/monthBudgetDetail'
import { getRecurringBillDisplayParts } from '../../lib/recurringBillDisplay'
import { deleteTransaction } from '../../lib/transactionsApi'
import type { TransactionWithCategory } from '../../lib/types'

const NO_DATE_KEY = 'no-date'

export function PlanMonthBudgetDetail() {
  const { group, kind } = useParams()
  if (!isMonthBudgetDetailGroup(group) || !isMonthBudgetDetailKind(kind)) {
    return <Navigate to="/rencana" replace />
  }
  return <MonthBudgetDetailContent group={group} kind={kind} />
}

function MonthBudgetDetailContent({
  group,
  kind,
}: {
  group: MonthBudgetDetailGroup
  kind: MonthBudgetDetailKind
}) {
  const navigate = useNavigate()
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
  const { transactions, loading: txLoading, error, reload } =
    useTransactions(range)
  const {
    allocation,
    progress,
    bills,
    logByOccurrenceKey,
    dueBillIdByTxId,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    loading: progressLoading,
  } = useFreeGuiltyProgress(yearMonth, transactions)
  const { buckets, byId: bucketsById, movements } = useBuckets({
    includeInactive: true,
  })
  const sinkingCategoryIds = useMemo(
    () => sinkingLinkedCategoryIds(buckets),
    [buckets],
  )
  const { checkingIds, estimateCoverageKeys, overspendTxIds, planKindByTxId } =
    useHistoryTxMeta({
      transactions,
      bills,
      overrideByBillId,
      skippedOccurrenceKeys,
      dueBillIdByTxId,
      categoriesById,
      bucketsById,
      buckets,
      movements,
      yearMonth,
      allocation,
    })

  const isTxKind = kind === 'planned-overspend' || kind === 'unplanned-overspend'
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [collapseTick, setCollapseTick] = useState(0)
  const [force, setForce] = useState({ expanded: true, version: 0 })

  const title = monthBudgetDetailTitle(group, kind)
  const persistPrefix = `plan:month-budget:${group}:${kind}:day`

  // Transactions: only those adding to Buffer / Guilt-Free, newest day first.
  const txRows = useMemo(() => {
    if (!isTxKind) return []
    const amountById = monthBudgetOverspendAmountByTxId({
      group,
      kind,
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
      transactions,
      checkingBucketIds: checkingIds,
      estimateCoverageKeys,
      dueBillIdByTxId,
    })
    const rows: Array<{ tx: TransactionWithCategory; amount: number }> = []
    for (const tx of transactions) {
      const amount = Math.round(amountById.get(tx.id) ?? 0)
      if (amount > 0) rows.push({ tx, amount })
    }
    return rows
  }, [
    isTxKind,
    group,
    kind,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    bucketsById,
    yearMonth,
    transactions,
    checkingIds,
    estimateCoverageKeys,
    dueBillIdByTxId,
  ])

  // Estimates: projections that fill Upcoming / Unscheduled.
  const projectionItems = useMemo<MonthBudgetProjectionItem[]>(() => {
    if (isTxKind || !progress) return []
    const estimateRows = buildMonthBudgetEstimateRows({
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
      transactions,
      checkingBucketIds: checkingIds,
      dueBillIdByTxId,
    })
    const track =
      group === 'needs' ? progress.plannedNeeds : progress.plannedWants
    if (kind === 'upcoming') {
      return listMonthBudgetUpcomingItems({
        estimateRows,
        bills,
        overridesByBillId: overrideByBillId,
        skippedOccurrenceKeys,
        logByOccurrenceKey,
        yearMonth,
        today: todayIso(),
        group,
        limit: track.upcoming,
      })
    }
    return listMonthBudgetUnscheduledItems({
      estimateRows,
      bills,
      group,
      limit: track.unscheduled,
    })
  }, [
    isTxKind,
    progress,
    group,
    kind,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    logByOccurrenceKey,
    categoriesById,
    bucketsById,
    yearMonth,
    transactions,
    checkingIds,
    dueBillIdByTxId,
  ])

  const txGroups = useMemo(() => {
    const byDate = new Map<string, typeof txRows>()
    for (const row of txRows) {
      const list = byDate.get(row.tx.occurred_on) ?? []
      list.push(row)
      byDate.set(row.tx.occurred_on, list)
    }
    for (const list of byDate.values()) {
      list.sort((a, b) => compareHistoryDayDisplay(a.tx, b.tx))
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
  }, [txRows])

  const projectionGroups = useMemo(() => {
    const byDate = new Map<string, MonthBudgetProjectionItem[]>()
    for (const item of projectionItems) {
      const key = item.occurredOn ?? NO_DATE_KEY
      const list = byDate.get(key) ?? []
      list.push(item)
      byDate.set(key, list)
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  }, [projectionItems])

  const dayKeys = useMemo(
    () =>
      (isTxKind ? txGroups : projectionGroups).map(
        ([date]) => `${persistPrefix}:${date}`,
      ),
    [isTxKind, txGroups, projectionGroups, persistPrefix],
  )

  // Keep the frame chevron aligned with persisted day open state.
  useEffect(() => {
    setForce((prev) => {
      const expanded = areAllCollapseOpen(dayKeys, true)
      return prev.expanded === expanded ? prev : { ...prev, expanded }
    })
  }, [dayKeys, collapseTick, force.version])

  const total = isTxKind
    ? txRows.reduce((sum, row) => sum + row.amount, 0)
    : projectionItems.reduce((sum, item) => sum + item.amount, 0)
  const itemCount = isTxKind ? txRows.length : projectionItems.length
  const loading = txLoading || progressLoading || !progress

  async function confirmDelete() {
    if (!pendingDeleteId) return
    setDeleting(true)
    try {
      await deleteTransaction(pendingDeleteId)
      setPendingDeleteId(null)
      setOpenSwipeId(null)
      showAppToast(`Deleted ${ActionEmoji.delete}`)
      await reload({ silent: true })
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  function toggleAll(expanded: boolean) {
    setForce((prev) => ({ expanded, version: prev.version + 1 }))
  }

  function renderTxRows(rows: typeof txRows) {
    return rows.map(({ tx, amount }) => (
      <HistoryTxSwipeRow
        key={tx.id}
        id={tx.id}
        sortable={false}
        open={openSwipeId === tx.id}
        onOpenChange={(open) => setOpenSwipeId(open ? tx.id : null)}
        onDelete={() => {
          setOpenSwipeId(tx.id)
          setPendingDeleteId(tx.id)
        }}
        completeLater={tx.complete_later}
        onContentClick={() =>
          navigate(`/transaksi/${tx.id}`, { replace: true })
        }
      >
        <HistoryTxRowBody
          tx={tx}
          sinkingCategoryIds={sinkingCategoryIds}
          planKind={planKindByTxId.get(tx.id)}
          showOverspendLabel={overspendTxIds.has(tx.id)}
          amountOverride={amount}
        />
      </HistoryTxSwipeRow>
    ))
  }

  function renderProjectionRows(items: MonthBudgetProjectionItem[]) {
    return items.map((item) => {
      const { bill, occurredOn, amount } = item
      const display = getRecurringBillDisplayParts(
        bill,
        categoriesById,
        bucketsById,
      )
      const budgetGroup = estimatePlanBadgeGroup(
        estimatePlanTag(bill, categoriesById, bucketsById),
      )
      const linkedToSinkingFund = display.isTransfer
        ? Boolean(
            bill.to_bucket_id &&
              bucketsById.get(bill.to_bucket_id)?.kind === 'sinking',
          )
        : Boolean(
            display.childName &&
              bill.category_id &&
              sinkingCategoryIds.has(bill.category_id),
          )
      return (
        <button
          key={`${bill.id}:${occurredOn ?? NO_DATE_KEY}`}
          type="button"
          onClick={() => navigate(`/pengaturan/recurring/${bill.id}`)}
          className="flex w-full items-start gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm dark:bg-neutral-800"
        >
          <RecurringBillRowContent
            bill={{ ...bill, amount }}
            display={display}
            displayAmount={amount}
            linkedToSinkingFund={linkedToSinkingFund}
            showMeta={occurredOn != null}
            monthCursor={occurredOn != null ? cursor : undefined}
            occurredOn={occurredOn ?? undefined}
            budgetGroup={budgetGroup}
          />
        </button>
      )
    })
  }

  const hasContent = itemCount > 0

  return (
    <PlanSubPage
      title={title}
      icon={monthBudgetDetailIcon(kind)}
      description={monthBudgetDetailDescription(group, kind)}
    >
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <MonthPager
          monthLabel={monthLabel}
          canGoNext={canGoNext}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
        />

        {!loading && !error && (
          <div className="mt-2 rounded-lg bg-white px-2.5 py-1.5 shadow-sm dark:bg-neutral-800">
            <div className="min-w-0 text-center">
              <p className="text-[9px] leading-tight text-neutral-400">
                {title}
              </p>
              <p
                className={`truncate text-[11px] font-semibold leading-tight ${
                  isTxKind ? AMOUNT_OUT_CLASS : amountToneClass(true)
                }`}
              >
                {formatRupiah(total)}
              </p>
            </div>
          </div>
        )}

        {loading && (
          <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
        )}
        {error && (
          <p className="mt-6 text-center text-sm text-red-500">{error}</p>
        )}

        {!loading && !error && (
          <div className="mt-4">
            <GroupedListFrame
              label={isTxKind ? 'Transactions' : 'Estimates'}
              expanded={force.expanded}
              onToggle={toggleAll}
            >
              {!hasContent ? (
                <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                  {isTxKind
                    ? 'No transactions this month.'
                    : 'Nothing to show this month.'}
                </p>
              ) : (
                <div className="space-y-5">
                  {isTxKind
                    ? txGroups.map(([date, rows]) => {
                        const dayTotal = rows.reduce(
                          (sum, { tx, amount }) =>
                            tx.type === 'expense' ? sum - amount : sum,
                          0,
                        )
                        return (
                          <CollapsibleDayGroup
                            key={date}
                            title={formatDateLabel(date)}
                            persistKey={`${persistPrefix}:${date}`}
                            forceOpen={
                              force.version > 0 ? force.expanded : undefined
                            }
                            forceVersion={force.version}
                            onOpenChange={() => setCollapseTick((n) => n + 1)}
                            trailing={
                              <p
                                className={`text-xs font-medium ${amountToneClass(dayTotal >= 0)}`}
                              >
                                {dayTotal < 0 ? '-' : '+'}
                                {formatRupiah(Math.abs(dayTotal))}
                              </p>
                            }
                          >
                            <div className="space-y-2">
                              {renderTxRows(rows)}
                            </div>
                          </CollapsibleDayGroup>
                        )
                      })
                    : projectionGroups.map(([date, items]) => (
                        <CollapsibleDayGroup
                          key={date}
                          title={
                            date === NO_DATE_KEY ? 'No Date' : formatDateLabel(date)
                          }
                          persistKey={`${persistPrefix}:${date}`}
                          forceOpen={
                            force.version > 0 ? force.expanded : undefined
                          }
                          forceVersion={force.version}
                          onOpenChange={() => setCollapseTick((n) => n + 1)}
                        >
                          <div className="space-y-2">
                            {renderProjectionRows(items)}
                          </div>
                        </CollapsibleDayGroup>
                      ))}
                </div>
              )}
            </GroupedListFrame>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId != null}
        title="Delete transaction?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleting}
        onCancel={() => {
          if (deleting) return
          setPendingDeleteId(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </PlanSubPage>
  )
}
