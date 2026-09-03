import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CircleBadge } from '../components/CircleBadge'
import { BudgetGroupBadge } from '../components/BudgetGroupBadge'
import { DueThisMonthChecklist } from '../components/DueThisMonthChecklist'
import { GroupedListFrame } from '../components/GroupedListFrame'
import { CollapsibleDayGroup } from '../components/CollapsibleDayGroup'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  HistoryDaySortableList,
  HistoryTxSwipeRow,
} from '../components/HistoryDaySortableList'
import { MonthPager } from '../components/MonthPager'
import { OwnerBadge } from '../components/OwnerBadge'
import { PageTitle } from '../components/PageTitle'
import { SearchField } from '../components/SearchField'
import { SinkingFundLabel } from '../components/SinkingFundLabel'
import { NavIcon } from '../lib/navTabs'
import { isBlankSearch, matchesTransactionSearch } from '../lib/listSearch'
import { useCategories } from '../hooks/useCategories'
import { useBuckets } from '../hooks/useBuckets'
import { useRecurringBills } from '../hooks/useRecurringBills'
import { useTransactions } from '../hooks/useTransactions'
import { sinkingFundOverspendTransactionIds } from '../lib/budgetSaveGate'
import { showAppToast } from '../lib/appToast'
import { ActionEmoji } from '../lib/actionEmoji'
import { areAllCollapseOpen } from '../lib/collapseState'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatDateLabel,
  formatMonthLabel,
  formatRupiah,
  monthRange,
  todayIso,
} from '../lib/format'
import { requestAmountFocus } from '../lib/keyboardFocus'
import { monthCursorKey } from '../lib/monthCursor'
import { budgetGroupOfTx } from '../lib/moneyPlan'
import { compareHistoryDayDisplay } from '../lib/estimateProgress'
import {
  checkingBucketIdSet,
  estimateExpenseCoverageKeys,
  HISTORY_PLAN_KIND_LABELS,
  historyPlanKindByTxId,
  monthBudgetCeilingOverspendTransactionIds,
} from '../lib/freeGuiltyProgress'
import {
  budgetGroupOfEstimate,
  isPlannedNeedsSchedule,
} from '../lib/freeWants'
import { useFreeGuiltyProgress } from '../hooks/useFreeGuiltyProgress'
import {
  countDueOrOverdueUnchecked,
  isOccurrenceSkipped,
  occurrenceLogKey,
  occurrencesInMonth,
} from '../lib/recurringBillsApi'
import { deleteTransaction, reorderTransactions } from '../lib/transactionsApi'
import { sinkingLinkedCategoryIds } from '../lib/bucketsApi'
import {
  BUDGET_GROUP_TEXT_CLASS,
  categoryDisplayParts,
  CIRCLE_TEXT_CLASS,
  formatTransferLabel,
  formatTransferToLabel,
  isBudgetGroup,
  isCircle,
  TRANSFER_TYPE_ICON,
  type TransactionWithCategory,
} from '../lib/types'

type MonthCursor = { year: number; month: number }
type HistoryLocationState = { highlightTxId?: string }

function currentCursor(): MonthCursor {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

function shiftCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

function isCurrentMonth(cursor: MonthCursor): boolean {
  const now = currentCursor()
  return cursor.year === now.year && cursor.month === now.month
}

function isAfterCurrentMonth(cursor: MonthCursor): boolean {
  const now = currentCursor()
  return (
    cursor.year > now.year ||
    (cursor.year === now.year && cursor.month > now.month)
  )
}

export function History() {
  const navigate = useNavigate()
  const location = useLocation()
  const [cursor, setCursor] = useState<MonthCursor>(currentCursor)
  const [searchQuery, setSearchQuery] = useState('')
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [collapseTick, setCollapseTick] = useState(0)
  const [allExpanded, setAllExpanded] = useState(true)
  const [completeLaterForce, setCompleteLaterForce] = useState({
    expanded: true,
    version: 0,
  })
  const [historyForce, setHistoryForce] = useState({
    expanded: true,
    version: 0,
  })
  /** Bumps when outer Transactions frame expand/collapses Due days. */
  const [dueExpandAll, setDueExpandAll] = useState({
    expanded: true,
    version: 0,
  })

  const { byId: categoriesById } = useCategories(undefined, {
    includeInactive: true,
  })
  const { buckets, byId: bucketsById, movements } = useBuckets()
  const sinkingCategoryIds = useMemo(
    () => sinkingLinkedCategoryIds(buckets),
    [buckets],
  )

  // Hanya di device ini, via location state — tidak disimpan ke DB.
  const navHighlightId =
    (location.state as HistoryLocationState | null)?.highlightTxId ?? null
  const [highlightId, setHighlightId] = useState<string | null>(navHighlightId)

  // Clear nav state separately from the highlight timer — clearing state must
  // not cancel the timeout (that left highlightId stuck and re-glowed on remount).
  useEffect(() => {
    if (!navHighlightId) return
    setHighlightId(navHighlightId)
    navigate('.', { replace: true, state: null })
  }, [navHighlightId, navigate])

  useEffect(() => {
    if (!highlightId) return
    const t = window.setTimeout(() => setHighlightId(null), 1800)
    return () => window.clearTimeout(t)
  }, [highlightId])

  const range = useMemo(
    () => monthRange(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )
  const monthLabel = useMemo(
    () => formatMonthLabel(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )
  const { transactions, loading, error, reload, applyDaySortOrder } =
    useTransactions(range)
  const yearMonth = monthCursorKey(cursor)
  const {
    bills,
    logByOccurrenceKey,
    dueBillIdByTxId,
    overrideByBillId,
    skippedOccurrenceKeys,
    currentMonthDoneByBillId,
    loading: billsLoading,
    available: billsAvailable,
    reload: reloadBills,
  } = useRecurringBills(yearMonth)
  const { allocation } = useFreeGuiltyProgress(yearMonth, transactions)

  const dueCount = useMemo(
    () =>
      countDueOrOverdueUnchecked(
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

  useEffect(() => {
    if (!highlightId || loading) return
    highlightRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlightId, loading, transactions])

  const canGoNext = !isCurrentMonth(cursor) && !isAfterCurrentMonth(cursor)

  function goPrevMonth() {
    setOpenSwipeId(null)
    setCursor((c) => shiftCursor(c, -1))
  }

  function goNextMonth() {
    setOpenSwipeId(null)
    setCursor((c) => {
      const next = shiftCursor(c, 1)
      return isAfterCurrentMonth(next) ? c : next
    })
  }

  function handleTouchStart(e: TouchEvent) {
    const t = e.changedTouches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }

  function handleTouchEnd(e: TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const end = e.changedTouches[0]
    if (!end) return
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) < 56) return
    // Vertical list scroll often has horizontal drift — ignore non-horizontal swipes.
    if (Math.abs(dy) >= Math.abs(dx)) return
    if (dx > 0) goPrevMonth()
    else goNextMonth()
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return
    setDeleting(true)
    try {
      await deleteTransaction(pendingDeleteId)
      setPendingDeleteId(null)
      setOpenSwipeId(null)
      setHighlightId(null)
      showAppToast(`Deleted ${ActionEmoji.delete}`)
      await reload({ silent: true })
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  async function handleDayReorder(date: string, orderedIds: string[]) {
    setOpenSwipeId(null)
    // Visual list is newest-first; persist oldest-first so sort_order 1 = earlier that day.
    const persistIds = [...orderedIds].reverse()
    applyDaySortOrder(date, persistIds)
    try {
      await reorderTransactions(persistIds)
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to reorder')
      await reload({ silent: true })
    }
  }

  const checkingIds = useMemo(() => checkingBucketIdSet(buckets), [buckets])

  const estimateCoverageKeys = useMemo(() => {
    const isExpenseNeedsOrWantsEstimate = (bill: (typeof bills)[number]) => {
      if (!isPlannedNeedsSchedule(bill)) return false
      if (bill.type !== 'expense') return false
      const g = budgetGroupOfEstimate(bill, categoriesById)
      return g === 'needs' || g === 'wants'
    }
    return estimateExpenseCoverageKeys(
      bills,
      categoriesById,
      isExpenseNeedsOrWantsEstimate,
      bucketsById,
    )
  }, [bills, categoriesById, bucketsById])

  const overspendTxIds = useMemo(() => {
    const ids = new Set<string>()
    if (allocation) {
      for (const id of monthBudgetCeilingOverspendTransactionIds({
        bills,
        overridesByBillId: overrideByBillId,
        skippedOccurrenceKeys,
        categoriesById,
        bucketsById,
        yearMonth,
        transactions,
        checkingBucketIds: checkingIds,
        estimateCoverageKeys,
        bufferAllowance: allocation.buffer,
        guiltFreeAllowance: allocation.guiltFree,
        dueBillIdByTxId,
      })) {
        ids.add(id)
      }
    }
    for (const id of sinkingFundOverspendTransactionIds({
      buckets,
      movements,
      transactions,
      yearMonth,
    })) {
      ids.add(id)
    }
    return ids
  }, [
    allocation,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    bucketsById,
    buckets,
    movements,
    yearMonth,
    transactions,
    checkingIds,
    estimateCoverageKeys,
    dueBillIdByTxId,
  ])

  const planKindByTxId = useMemo(
    () =>
      historyPlanKindByTxId({
        transactions,
        estimateCoverageKeys,
        checkingBucketIds: checkingIds,
        dueBillIdByTxId,
        bucketsById,
        categoriesById,
      }),
    [
      transactions,
      estimateCoverageKeys,
      checkingIds,
      dueBillIdByTxId,
      bucketsById,
      categoriesById,
    ],
  )

  const filtered = transactions.filter((tx) =>
    matchesTransactionSearch(searchQuery, tx, {
      planKind: planKindByTxId.get(tx.id),
    }),
  )
  const searchActive = !isBlankSearch(searchQuery)

  const monthIncome = filtered
    .filter((tx) => tx.type === 'income' && !tx.complete_later)
    .reduce((sum, tx) => sum + tx.amount, 0)
  const monthExpense = filtered
    .filter((tx) => tx.type === 'expense' && !tx.complete_later)
    .reduce((sum, tx) => sum + tx.amount, 0)
  const monthNet = monthIncome - monthExpense

  const completeLaterTxs = filtered.filter((tx) => tx.complete_later)
  const historyTxs = filtered.filter((tx) => !tx.complete_later)
  const dayReorderEnabled = !searchActive

  function groupByDate(items: TransactionWithCategory[]) {
    const grouped = items.reduce<Record<string, TransactionWithCategory[]>>(
      (acc, tx) => {
        acc[tx.occurred_on] = acc[tx.occurred_on] ?? []
        acc[tx.occurred_on].push(tx)
        return acc
      },
      {},
    )
    for (const date of Object.keys(grouped)) {
      grouped[date]!.sort(compareHistoryDayDisplay)
    }
    const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1))
    return { grouped, dates }
  }

  const completeLaterGrouped = groupByDate(completeLaterTxs)
  const historyGrouped = groupByDate(historyTxs)

  const completeLaterPersistKeys = useMemo(
    () =>
      completeLaterGrouped.dates.map(
        (date) => `history:complete-later:day:${date}`,
      ),
    [completeLaterGrouped.dates],
  )
  const historyPersistKeys = useMemo(
    () => historyGrouped.dates.map((date) => `history:day:${date}`),
    [historyGrouped.dates],
  )
  const duePersistKeys = useMemo(() => {
    const today = todayIso()
    const dates = new Set<string>()
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
          continue
        }
        if (occurredOn > today) continue
        dates.add(occurredOn)
      }
    }
    return [...dates]
      .sort((a, b) => (a < b ? -1 : 1))
      .map((date) => `transactions:due:day:${date}`)
  }, [
    bills,
    yearMonth,
    overrideByBillId,
    skippedOccurrenceKeys,
    logByOccurrenceKey,
  ])

  const allPersistKeys = useMemo(
    () => [
      ...completeLaterPersistKeys,
      ...duePersistKeys,
      ...historyPersistKeys,
    ],
    [completeLaterPersistKeys, duePersistKeys, historyPersistKeys],
  )

  const sectionForceKey = `${completeLaterForce.version}:${historyForce.version}:${dueExpandAll.version}`

  // Keep section / outer chevrons aligned with persisted day open state.
  useEffect(() => {
    setCompleteLaterForce((prev) => {
      const expanded = areAllCollapseOpen(completeLaterPersistKeys, true)
      return prev.expanded === expanded ? prev : { ...prev, expanded }
    })
    setHistoryForce((prev) => {
      const expanded = areAllCollapseOpen(historyPersistKeys, true)
      return prev.expanded === expanded ? prev : { ...prev, expanded }
    })
    setAllExpanded(areAllCollapseOpen(allPersistKeys, true))
  }, [
    completeLaterPersistKeys,
    historyPersistKeys,
    allPersistKeys,
    sectionForceKey,
    collapseTick,
  ])

  const hasListContent =
    completeLaterTxs.length > 0 ||
    historyTxs.length > 0 ||
    dueCount > 0 ||
    (billsAvailable && billsLoading)

  function toggleCompleteLater(expanded: boolean) {
    setCompleteLaterForce((prev) => ({
      expanded,
      version: prev.version + 1,
    }))
  }

  function toggleHistory(expanded: boolean) {
    setHistoryForce((prev) => ({
      expanded,
      version: prev.version + 1,
    }))
  }

  function toggleAllExpanded(expanded: boolean) {
    setAllExpanded(expanded)
    setCompleteLaterForce((prev) => ({
      expanded,
      version: prev.version + 1,
    }))
    setHistoryForce((prev) => ({
      expanded,
      version: prev.version + 1,
    }))
    setDueExpandAll((prev) => ({
      expanded,
      version: prev.version + 1,
    }))
  }

  function renderDayGroups(
    dates: string[],
    grouped: Record<string, TransactionWithCategory[]>,
    persistPrefix: string,
    forceOpen: boolean | undefined,
    forceVersion: number,
    showOverspend = false,
    reorderEnabled = false,
  ) {
    return dates.map((date) => {
      const items = grouped[date]!
      const canReorder = reorderEnabled && items.length > 1
      const dayTotal = items.reduce((sum, tx) => {
        if (tx.complete_later) return sum
        if (tx.type === 'expense') return sum - tx.amount
        if (tx.type === 'income') return sum + tx.amount
        return sum
      }, 0)
      const showDayTotal = items.some((tx) => !tx.complete_later)
      const rows = items.map((tx) => {
              const isTransfer = tx.type === 'transfer'
              const { parentIcon, parentName, childIcon, childName } =
                isTransfer
                  ? {
                      parentIcon: TRANSFER_TYPE_ICON,
                      parentName: formatTransferLabel(tx.from_bucket),
                      childIcon: null as string | null,
                      childName: null as string | null,
                    }
                  : categoryDisplayParts(tx.category)
              const note = isTransfer
                ? formatTransferToLabel(tx.to_bucket)
                : tx.description?.trim() || null
              const isHighlighted = highlightId === tx.id
              const amountLabel =
                tx.amount > 0
                  ? `${
                      tx.type === 'expense'
                        ? '-'
                        : tx.type === 'income'
                          ? '+'
                          : ''
                    }${formatRupiah(tx.amount)}`
                  : '—'
              const budgetGroup =
                tx.type === 'expense'
                  ? budgetGroupOfTx(tx)
                  : tx.type === 'transfer' &&
                      tx.to_bucket?.kind === 'sinking' &&
                      isBudgetGroup(tx.to_bucket.budget_group)
                    ? tx.to_bucket.budget_group
                    : null
              const planKind = showOverspend
                ? planKindByTxId.get(tx.id)
                : undefined
              const showOverspendLabel =
                showOverspend && overspendTxIds.has(tx.id)

              return (
                <HistoryTxSwipeRow
                  key={tx.id}
                  id={tx.id}
                  sortable={canReorder}
                  open={openSwipeId === tx.id}
                  onOpenChange={(open) =>
                    setOpenSwipeId(open ? tx.id : null)
                  }
                  onDelete={() => {
                    setOpenSwipeId(tx.id)
                    setPendingDeleteId(tx.id)
                  }}
                  contentRef={isHighlighted ? highlightRef : undefined}
                  highlighted={isHighlighted}
                  completeLater={tx.complete_later}
                  onContentClick={() =>
                    navigate(`/transaksi/${tx.id}`, { replace: true })
                  }
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {parentIcon}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                      <p className="truncate text-xs font-semibold leading-none text-neutral-800 dark:text-white">
                        {parentName}
                      </p>
                      <OwnerBadge owner={tx.owner} size="inline" />
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                      {childName ? (
                        <p className="flex min-w-0 items-center gap-1 text-xs leading-none text-neutral-400">
                          <span className="shrink-0" aria-hidden>
                            {childIcon}
                          </span>
                          <span className="truncate">{childName}</span>
                          {tx.category_id &&
                          sinkingCategoryIds.has(tx.category_id) ? (
                            <SinkingFundLabel />
                          ) : null}
                        </p>
                      ) : isTransfer ? (
                        <p className="truncate text-xs leading-none text-neutral-400">
                          Transfer
                        </p>
                      ) : (
                        <span className="invisible truncate text-xs leading-none">
                          .
                        </span>
                      )}
                      {!isTransfer ? (
                        <CircleBadge
                          circle={
                            isCircle(tx.circle) ? tx.circle : 'hd_family'
                          }
                          size="inline"
                        />
                      ) : (
                        <span className="invisible text-xs leading-none">
                          .
                        </span>
                      )}
                    </div>

                    {tx.complete_later ? (
                      <>
                        {note ? (
                          <p className="line-clamp-2 min-w-0 break-words text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                            {note}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                          {budgetGroup ? (
                            <p className="truncate text-left text-xs leading-none">
                              <BudgetGroupBadge group={budgetGroup} />
                            </p>
                          ) : (
                            <span className="invisible truncate text-xs leading-none">
                              .
                            </span>
                          )}
                          <p
                            className={`truncate text-xs font-semibold leading-none whitespace-nowrap ${
                              tx.amount <= 0
                                ? 'text-neutral-400'
                                : tx.type === 'expense'
                                  ? AMOUNT_OUT_CLASS
                                  : tx.type === 'income'
                                    ? AMOUNT_IN_CLASS
                                    : 'text-violet-600 dark:text-violet-300'
                            }`}
                          >
                            {amountLabel}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                          {note ? (
                            <p className="truncate text-xs leading-none text-neutral-500 dark:text-neutral-400">
                              {note}
                            </p>
                          ) : (
                            <span className="invisible truncate text-xs leading-none">
                              .
                            </span>
                          )}
                          <p
                            className={`truncate text-xs font-semibold leading-none whitespace-nowrap ${
                              tx.amount <= 0
                                ? 'text-neutral-400'
                                : tx.type === 'expense'
                                  ? AMOUNT_OUT_CLASS
                                  : tx.type === 'income'
                                    ? AMOUNT_IN_CLASS
                                    : 'text-violet-600 dark:text-violet-300'
                            }`}
                          >
                            {amountLabel}
                          </p>
                        </div>
                        {budgetGroup || planKind || showOverspendLabel ? (
                          <>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                              {planKind ? (
                                <p
                                  className={`truncate text-left text-xs font-medium leading-none ${
                                    planKind === 'unplanned'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : CIRCLE_TEXT_CLASS.hd_family
                                  }`}
                                >
                                  {HISTORY_PLAN_KIND_LABELS[planKind]}
                                </p>
                              ) : (
                                <span className="invisible truncate text-xs leading-none">
                                  .
                                </span>
                              )}
                              {budgetGroup ? (
                                <p className="truncate text-xs leading-none whitespace-nowrap">
                                  <BudgetGroupBadge group={budgetGroup} />
                                </p>
                              ) : showOverspendLabel ? (
                                <p
                                  className={`truncate text-xs font-medium leading-none whitespace-nowrap ${BUDGET_GROUP_TEXT_CLASS.needs}`}
                                >
                                  Overspend
                                </p>
                              ) : null}
                            </div>
                            {budgetGroup && showOverspendLabel ? (
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                                <span className="invisible truncate text-xs leading-none">
                                  .
                                </span>
                                <p
                                  className={`truncate text-xs font-medium leading-none whitespace-nowrap ${BUDGET_GROUP_TEXT_CLASS.needs}`}
                                >
                                  Overspend
                                </p>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </HistoryTxSwipeRow>
              )
            })
      return (
        <CollapsibleDayGroup
          key={`${persistPrefix}:${date}`}
          title={formatDateLabel(date)}
          persistKey={`${persistPrefix}:${date}`}
          forceOpen={forceOpen}
          forceVersion={forceVersion}
          onOpenChange={() => setCollapseTick((n) => n + 1)}
          trailing={
            showDayTotal ? (
              <p
                className={`text-xs font-medium ${amountToneClass(dayTotal >= 0)}`}
              >
                {dayTotal < 0 ? '-' : '+'}
                {formatRupiah(Math.abs(dayTotal))}
              </p>
            ) : undefined
          }
        >
          {canReorder ? (
            <HistoryDaySortableList
              ids={items.map((tx) => tx.id)}
              onReorder={(orderedIds) => {
                void handleDayReorder(date, orderedIds)
              }}
            >
              {rows}
            </HistoryDaySortableList>
          ) : (
            <div className="space-y-2">{rows}</div>
          )}
        </CollapsibleDayGroup>
      )
    })
  }

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle icon={NavIcon.history}>Transactions</PageTitle>

      <MonthPager
        monthLabel={monthLabel}
        canGoNext={canGoNext}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
      />

      {!loading && !error && (
        <div className="mt-2 rounded-lg bg-white px-2.5 py-1.5 shadow-sm dark:bg-neutral-800">
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="min-w-0">
              <p className="text-[9px] leading-tight text-neutral-400">Income</p>
              <p
                className={`truncate text-[11px] font-semibold leading-tight ${AMOUNT_IN_CLASS}`}
              >
                {formatRupiah(monthIncome)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] leading-tight text-neutral-400">Expense</p>
              <p
                className={`truncate text-[11px] font-semibold leading-tight ${AMOUNT_OUT_CLASS}`}
              >
                {formatRupiah(monthExpense)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] leading-tight text-neutral-400">Total</p>
              <p
                className={`truncate text-[11px] font-semibold leading-tight ${amountToneClass(monthNet >= 0)}`}
              >
                {monthNet < 0 ? '-' : '+'}
                {formatRupiah(Math.abs(monthNet))}
              </p>
            </div>
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
            label="Transactions"
            expanded={allExpanded}
            onToggle={toggleAllExpanded}
          >
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search transactions…"
              aria-label="Search transactions"
              className="mb-3 min-w-0"
            />
            {!hasListContent ? (
              <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                {searchActive ? 'No matches.' : 'No transactions this month.'}
              </p>
            ) : (
            <div className="space-y-5">
              {completeLaterTxs.length > 0 && (
                <GroupedListFrame
                  label="Complete Later"
                  expanded={completeLaterForce.expanded}
                  onToggle={toggleCompleteLater}
                >
                  <div className="space-y-5">
                    {renderDayGroups(
                      completeLaterGrouped.dates,
                      completeLaterGrouped.grouped,
                      'history:complete-later:day',
                      completeLaterForce.version > 0
                        ? completeLaterForce.expanded
                        : undefined,
                      completeLaterForce.version,
                    )}
                  </div>
                </GroupedListFrame>
              )}

              <DueThisMonthChecklist
                cursor={cursor}
                bills={bills}
                logByOccurrenceKey={logByOccurrenceKey}
                overrideByBillId={overrideByBillId}
                skippedOccurrenceKeys={skippedOccurrenceKeys}
                currentMonthDoneByBillId={currentMonthDoneByBillId}
                loading={billsLoading}
                available={billsAvailable}
                variant="dueInbox"
                searchQuery={searchQuery}
                emptySearchMessage={
                  searchActive &&
                  completeLaterTxs.length === 0 &&
                  historyTxs.length === 0
                    ? 'No matches.'
                    : undefined
                }
                expandAll={dueExpandAll}
                onDayOpenChange={() => setCollapseTick((n) => n + 1)}
                onChanged={() => {
                  void reloadBills({ silent: true })
                  void reload({ silent: true })
                }}
              />

              {historyTxs.length > 0 && (
                <GroupedListFrame
                  label="History"
                  expanded={historyForce.expanded}
                  onToggle={toggleHistory}
                >
                  <div className="space-y-5">
                    {dayReorderEnabled &&
                    historyGrouped.dates.some(
                      (d) => (historyGrouped.grouped[d]?.length ?? 0) > 1,
                    ) ? (
                      <p className="text-[11px] text-neutral-400">
                        Hold & drag {ActionEmoji.drag} to reorder within a
                        day.
                      </p>
                    ) : null}
                    {renderDayGroups(
                      historyGrouped.dates,
                      historyGrouped.grouped,
                      'history:day',
                      historyForce.version > 0
                        ? historyForce.expanded
                        : undefined,
                      historyForce.version,
                      true,
                      dayReorderEnabled,
                    )}
                  </div>
                </GroupedListFrame>
              )}
            </div>
            )}
          </GroupedListFrame>
        </div>
      )}

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

      <button
        type="button"
        onPointerDown={(e) => {
          // Cegah tombol mencuri fokus dari ghost/amount saat gesture selesai.
          // Jangan buka numpad di sini — hold masih di History, layar Tambah
          // belum terlihat; buka di click (release) bersama navigate.
          e.preventDefault()
        }}
        onClick={() => {
          // Masih dalam user gesture → IME boleh muncul; ghost ditahan sampai
          // Quick Add visible lalu di-claim ke field nominal.
          requestAmountFocus()
          navigate({ pathname: '/tambah', search: '' }, { replace: true })
        }}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-3xl leading-none text-white shadow-lg active:scale-95 active:bg-emerald-600"
        aria-label="Add transaction"
      >
        +
      </button>
    </div>
  )
}
