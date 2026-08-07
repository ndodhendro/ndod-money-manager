import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CircleBadge } from '../components/CircleBadge'
import { GroupedListFrame } from '../components/GroupedListFrame'
import { CollapsibleDayGroup } from '../components/CollapsibleDayGroup'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MonthPager } from '../components/MonthPager'
import { OwnerBadge } from '../components/OwnerBadge'
import { PageTitle } from '../components/PageTitle'
import { NavIcon } from '../lib/navTabs'
import { SwipeDeleteRow } from '../components/SwipeDeleteRow'
import { useCategories } from '../hooks/useCategories'
import { useTransactions } from '../hooks/useTransactions'
import { showAppToast } from '../lib/appToast'
import { ActionEmoji } from '../lib/actionEmoji'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  amountToneClass,
  formatDateLabel,
  formatMonthLabel,
  formatRupiah,
  monthRange,
} from '../lib/format'
import { requestAmountFocus } from '../lib/keyboardFocus'
import { areAllCollapseOpen } from '../lib/collapseState'
import { deleteTransaction } from '../lib/transactionsApi'
import {
  CIRCLE_LABELS,
  CIRCLES,
  categoryDisplayParts,
  formatTransferLabel,
  isCircle,
  type Circle,
} from '../lib/types'

type MonthCursor = { year: number; month: number }
type HistoryLocationState = { highlightTxId?: string }
type AllFilter = 'all'

const SELECT_CLASS =
  'w-full rounded-lg border-0 bg-neutral-100 px-2 py-2 text-xs text-neutral-800 outline-none dark:bg-neutral-800 dark:text-neutral-100'

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
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dayGroupsExpanded, setDayGroupsExpanded] = useState(true)
  const [dayGroupsVersion, setDayGroupsVersion] = useState(0)

  const { parents, childrenByParent, byId } = useCategories()

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
  const { transactions, loading, error, reload } = useTransactions(range)

  useEffect(() => {
    if (!highlightId || loading) return
    highlightRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlightId, loading, transactions])

  const categoryOptions = useMemo(
    () =>
      [...parents].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'expense' ? -1 : 1
        return a.sort_order - b.sort_order
      }),
    [parents],
  )

  const subcategoryOptions = useMemo(() => {
    if (categoryFilter !== 'all') {
      return (childrenByParent.get(categoryFilter) ?? []).map((child) => ({
        id: child.id,
        label: `${child.icon} ${child.name}`,
      }))
    }
    return categoryOptions.flatMap((parent) =>
      (childrenByParent.get(parent.id) ?? []).map((child) => ({
        id: child.id,
        label: `${child.icon} ${parent.name} / ${child.name}`,
      })),
    )
  }, [categoryFilter, childrenByParent, categoryOptions])

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

  const filtered = transactions.filter((tx) => {
    const circle = isCircle(tx.circle) ? tx.circle : 'hd_family'
    if (circleFilter !== 'all' && circle !== circleFilter) return false

    // Transfers have no category — hide when a category filter is active.
    if (tx.type === 'transfer') {
      return categoryFilter === 'all' && subcategoryFilter === 'all'
    }

    if (subcategoryFilter !== 'all') {
      return tx.category_id === subcategoryFilter
    }

    if (categoryFilter !== 'all') {
      const cat = tx.category
      if (!cat) return false
      if (cat.id === categoryFilter) return true
      if (cat.parent_id === categoryFilter) return true
      const parent = cat.parent_id ? byId.get(cat.parent_id) : null
      return parent?.id === categoryFilter
    }

    return true
  })

  const monthIncome = filtered
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const monthExpense = filtered
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const monthNet = monthIncome - monthExpense

  const grouped = filtered.reduce<Record<string, typeof filtered>>(
    (acc, tx) => {
      acc[tx.occurred_on] = acc[tx.occurred_on] ?? []
      acc[tx.occurred_on].push(tx)
      return acc
    },
    {},
  )
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1))
  const dayPersistKeys = useMemo(
    () => dates.map((date) => `history:day:${date}`),
    [dates],
  )

  useEffect(() => {
    if (dayGroupsVersion > 0) return
    setDayGroupsExpanded(areAllCollapseOpen(dayPersistKeys, true))
  }, [dayPersistKeys, dayGroupsVersion])

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle icon={NavIcon.history}>History</PageTitle>

      <MonthPager
        monthLabel={monthLabel}
        canGoNext={canGoNext}
        onPrev={goPrevMonth}
        onNext={goNextMonth}
      />

      <div className="mt-3 grid grid-cols-3 gap-1.5">
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
      {!loading && filtered.length === 0 && (
        <p className="mt-10 text-center text-sm text-neutral-400">
          No transactions this month.
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <GroupedListFrame
          className="mt-4"
          label="History"
          expanded={dayGroupsExpanded}
          onToggle={(expanded) => {
            setDayGroupsExpanded(expanded)
            setDayGroupsVersion((v) => v + 1)
          }}
        >
          <div className="space-y-5">
            {dates.map((date) => {
          const items = grouped[date]!
          const dayTotal = items.reduce((sum, tx) => {
            if (tx.type === 'expense') return sum - tx.amount
            if (tx.type === 'income') return sum + tx.amount
            return sum
          }, 0)
          return (
            <CollapsibleDayGroup
              key={date}
              title={formatDateLabel(date)}
              persistKey={`history:day:${date}`}
              forceOpen={dayGroupsVersion > 0 ? dayGroupsExpanded : undefined}
              forceVersion={dayGroupsVersion}
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
                {items.map((tx) => {
                  const isTransfer = tx.type === 'transfer'
                  const {
                    parentIcon,
                    parentName,
                    childIcon,
                    childName,
                  } = isTransfer
                    ? {
                        parentIcon: '🔄',
                        parentName: formatTransferLabel(
                          tx.from_bucket,
                          tx.to_bucket,
                        ),
                        childIcon: null as string | null,
                        childName: null as string | null,
                      }
                    : categoryDisplayParts(tx.category)
                  const note = tx.description?.trim() || null
                  const isHighlighted = highlightId === tx.id

                  return (
                    <SwipeDeleteRow
                      key={tx.id}
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
                            <p className="flex min-w-0 items-center gap-1 truncate text-xs leading-none text-neutral-400">
                              <span aria-hidden>{childIcon}</span>
                              <span className="truncate">{childName}</span>
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
                              tx.type === 'expense'
                                ? AMOUNT_OUT_CLASS
                                : tx.type === 'income'
                                  ? AMOUNT_IN_CLASS
                                  : 'text-violet-600 dark:text-violet-300'
                            }`}
                          >
                            {tx.type === 'expense'
                              ? '-'
                              : tx.type === 'income'
                                ? '+'
                                : ''}
                            {formatRupiah(tx.amount)}
                          </p>
                        </div>
                      </div>
                    </SwipeDeleteRow>
                  )
                })}
              </div>
            </CollapsibleDayGroup>
          )
        })}
          </div>
        </GroupedListFrame>
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
          // Cegah tombol mencuri fokus dari ghost — kalau tidak, numpad
          // open → close → open lagi saat claim ke field nominal.
          e.preventDefault()
          requestAmountFocus()
        }}
        onClick={() =>
          navigate({ pathname: '/tambah', search: '' }, { replace: true })
        }
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-3xl leading-none text-white shadow-lg active:scale-95 active:bg-emerald-600"
        aria-label="Add transaction"
      >
        +
      </button>
    </div>
  )
}
