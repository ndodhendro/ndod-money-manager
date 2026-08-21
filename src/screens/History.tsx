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
  CIRCLE_LABELS,
  CIRCLES,
  BUDGET_GROUP_TEXT_CLASS,
  categoryDisplayParts,
  formatTransferLabel,
  formatTransferToLabel,
  isBudgetGroup,
  isCircle,
  TRANSFER_TYPE_ICON,
  type Category,
  type Circle,
  type TransactionWithCategory,
} from '../lib/types'

type MonthCursor = { year: number; month: number }
type HistoryLocationState = { highlightTxId?: string }
type AllFilter = 'all'

const SELECT_CLASS =
  'w-full rounded-lg border-0 bg-neutral-100 px-2 py-2 text-xs text-neutral-800 outline-none dark:bg-neutral-800 dark:text-neutral-100'

/** Income/expense parents can share a display name with different ids. */
function categoryNameKey(name: string): string {
  return name.trim().toLowerCase()
}

function resolveParentCategory(
  cat: Category | null | undefined,
  byId: Map<string, Category>,
): Category | null {
  if (!cat) return null
  if (!cat.parent_id) return cat
  return byId.get(cat.parent_id) ?? null
}

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
  const [circleFilter, setCircleFilter] = useState<Circle | AllFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string | AllFilter>('all')
  const [subcategoryFilter, setSubcategoryFilter] = useState<
    string | AllFilter
  >('all')
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

  const { parents, childrenByParent, byId } = useCategories()
  const { byId: categoriesById } = useCategories(undefined, {
    includeInactive: true,
  })
  const { buckets, byId: bucketsById } = useBuckets()
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

  const categoryOptions = useMemo(() => {
    const sorted = [...parents].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'expense' ? -1 : 1
      return a.sort_order - b.sort_order
    })
    // One option per display name so Business covers income + expense parents.
    const seen = new Set<string>()
    const unique: typeof sorted = []
    for (const parent of sorted) {
      const key = categoryNameKey(parent.name)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(parent)
    }
    return unique
  }, [parents])

  const parentIdsMatchingCategoryFilter = useMemo(() => {
    if (categoryFilter === 'all') return null
    const selected = byId.get(categoryFilter)
    if (!selected) return new Set<string>([categoryFilter])
    const key = categoryNameKey(selected.name)
    return new Set(
      parents
        .filter((p) => categoryNameKey(p.name) === key)
        .map((p) => p.id),
    )
  }, [categoryFilter, byId, parents])

  const subcategoryOptions = useMemo(() => {
    if (categoryFilter !== 'all' && parentIdsMatchingCategoryFilter) {
      const seen = new Set<string>()
      const options: Array<{ id: string; label: string }> = []
      for (const parentId of parentIdsMatchingCategoryFilter) {
        for (const child of childrenByParent.get(parentId) ?? []) {
          const key = categoryNameKey(child.name)
          if (seen.has(key)) continue
          seen.add(key)
          options.push({
            id: child.id,
            label: `${child.icon} ${child.name}${
              sinkingCategoryIds.has(child.id) ? ' SF' : ''
            }`,
          })
        }
      }
      return options
    }
    const seen = new Set<string>()
    const options: Array<{ id: string; label: string }> = []
    for (const parent of categoryOptions) {
      const parentIds = parents
        .filter((p) => categoryNameKey(p.name) === categoryNameKey(parent.name))
        .map((p) => p.id)
      for (const parentId of parentIds) {
        const parentRow = byId.get(parentId) ?? parent
        for (const child of childrenByParent.get(parentId) ?? []) {
          const key = `${categoryNameKey(parentRow.name)}/${categoryNameKey(child.name)}`
          if (seen.has(key)) continue
          seen.add(key)
          options.push({
            id: child.id,
            label: `${child.icon} ${parentRow.name} / ${child.name}${
              sinkingCategoryIds.has(child.id) ? ' SF' : ''
            }`,
          })
        }
      }
    }
    return options
  }, [
    categoryFilter,
    parentIdsMatchingCategoryFilter,
    childrenByParent,
    categoryOptions,
    parents,
    byId,
    sinkingCategoryIds,
  ])

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

  function handleCategoryFilterChange(value: string) {
    setCategoryFilter(value as string | AllFilter)
    setSubcategoryFilter('all')
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

  const filtered = transactions.filter((tx) => {
    const circle = isCircle(tx.circle) ? tx.circle : 'hd_family'
    if (circleFilter !== 'all' && circle !== circleFilter) return false

    // Transfers have no category — hide when a category filter is active.
    if (tx.type === 'transfer') {
      if (categoryFilter !== 'all' || subcategoryFilter !== 'all') return false
      return matchesTransactionSearch(searchQuery, tx)
    }

    if (subcategoryFilter !== 'all') {
      const selectedSub = byId.get(subcategoryFilter)
      const cat = tx.category
      if (!selectedSub || !cat) return false
      if (cat.id === subcategoryFilter) {
        return matchesTransactionSearch(searchQuery, tx)
      }
      // Same subcategory name under same parent name (income + expense ids differ).
      const selectedParent = resolveParentCategory(selectedSub, byId)
      const txParent = resolveParentCategory(cat, byId)
      if (!selectedParent || !txParent) return false
      if (
        categoryNameKey(cat.name) !== categoryNameKey(selectedSub.name) ||
        categoryNameKey(txParent.name) !== categoryNameKey(selectedParent.name)
      ) {
        return false
      }
      return matchesTransactionSearch(searchQuery, tx)
    }

    if (categoryFilter !== 'all' && parentIdsMatchingCategoryFilter) {
      const cat = tx.category
      if (!cat) return false
      if (parentIdsMatchingCategoryFilter.has(cat.id)) {
        return matchesTransactionSearch(searchQuery, tx)
      }
      if (cat.parent_id && parentIdsMatchingCategoryFilter.has(cat.parent_id)) {
        return matchesTransactionSearch(searchQuery, tx)
      }
      const parent = resolveParentCategory(cat, byId)
      if (parent == null || !parentIdsMatchingCategoryFilter.has(parent.id)) {
        return false
      }
      return matchesTransactionSearch(searchQuery, tx)
    }

    return matchesTransactionSearch(searchQuery, tx)
  })
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
  const dayReorderEnabled =
    !searchActive &&
    circleFilter === 'all' &&
    categoryFilter === 'all' &&
    subcategoryFilter === 'all'

  const overspendTxIds = useMemo(() => {
    if (!allocation) return new Set<string>()
    const checkingIds = checkingBucketIdSet(buckets)
    const isExpenseNeedsOrWantsEstimate = (bill: (typeof bills)[number]) => {
      if (!isPlannedNeedsSchedule(bill)) return false
      if (bill.type !== 'expense') return false
      const g = budgetGroupOfEstimate(bill, categoriesById)
      return g === 'needs' || g === 'wants'
    }
    const coverageKeys = estimateExpenseCoverageKeys(
      bills,
      categoriesById,
      isExpenseNeedsOrWantsEstimate,
    )
    return monthBudgetCeilingOverspendTransactionIds({
      bills,
      overridesByBillId: overrideByBillId,
      skippedOccurrenceKeys,
      categoriesById,
      bucketsById,
      yearMonth,
      transactions,
      checkingBucketIds: checkingIds,
      estimateCoverageKeys: coverageKeys,
      bufferAllowance: allocation.buffer,
      guiltFreeAllowance: allocation.guiltFree,
      dueBillIdByTxId,
    })
  }, [
    allocation,
    bills,
    overrideByBillId,
    skippedOccurrenceKeys,
    categoriesById,
    bucketsById,
    buckets,
    yearMonth,
    transactions,
    dueBillIdByTxId,
  ])

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
                    {budgetGroup ? (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                        <p className="truncate text-left text-xs leading-none">
                          <BudgetGroupBadge group={budgetGroup} />
                        </p>
                        {showOverspend && overspendTxIds.has(tx.id) ? (
                          <p
                            className={`truncate text-xs font-medium leading-none whitespace-nowrap ${BUDGET_GROUP_TEXT_CLASS.needs}`}
                          >
                            Overspend
                          </p>
                        ) : null}
                      </div>
                    ) : null}
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

      <SearchField
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search transactions…"
        aria-label="Search transactions"
        className="mt-3"
      />

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <label className="block min-w-0">
          <span className="mb-0.5 block truncate text-[10px] font-medium text-neutral-400">
            Circle
          </span>
          <select
            value={circleFilter}
            onChange={(e) =>
              setCircleFilter(e.target.value as Circle | AllFilter)
            }
            className={SELECT_CLASS}
            aria-label="Filter by circle"
          >
            <option value="all">All</option>
            {CIRCLES.map((c) => (
              <option key={c} value={c}>
                {CIRCLE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="mb-0.5 block truncate text-[10px] font-medium text-neutral-400">
            Category
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => handleCategoryFilterChange(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Filter by category"
          >
            <option value="all">All</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="mb-0.5 block truncate text-[10px] font-medium text-neutral-400">
            Subcategory
          </span>
          <select
            value={subcategoryFilter}
            onChange={(e) =>
              setSubcategoryFilter(e.target.value as string | AllFilter)
            }
            className={SELECT_CLASS}
            aria-label="Filter by subcategory"
          >
            <option value="all">All</option>
            {subcategoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

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
      {!loading && !hasListContent && (
        <p className="mt-10 text-center text-sm text-neutral-400">
          {searchActive ? 'No matches.' : 'No transactions this month.'}
        </p>
      )}

      {!loading && hasListContent && (
        <div className="mt-4">
          <GroupedListFrame
            label="Transactions"
            expanded={allExpanded}
            onToggle={toggleAllExpanded}
          >
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
