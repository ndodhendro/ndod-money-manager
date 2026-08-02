import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CircleBadge } from '../components/CircleBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageTitle } from '../components/PageTitle'
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
import { deleteTransaction } from '../lib/transactionsApi'
import {
  CIRCLE_LABELS,
  CIRCLES,
  categoryDisplayParts,
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
  const touchStartX = useRef<number | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { parents, childrenByParent, byId } = useCategories()

  // Hanya di device ini, via location state — tidak disimpan ke DB.
  const navHighlightId =
    (location.state as HistoryLocationState | null)?.highlightTxId ?? null
  const [highlightId, setHighlightId] = useState<string | null>(navHighlightId)

  useEffect(() => {
    if (!navHighlightId) return
    // Hapus state navigasi agar refresh / back tidak mengulang highlight.
    navigate('.', { replace: true, state: null })
    const t = window.setTimeout(() => setHighlightId(null), 1800)
    return () => window.clearTimeout(t)
  }, [navHighlightId, navigate])

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
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: TouchEvent) {
    const start = touchStartX.current
    touchStartX.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX
    if (end == null) return
    const dx = end - start
    if (Math.abs(dx) < 56) return
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
      showAppToast(`Deleted ${ActionEmoji.delete}`)
      await reload()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = transactions.filter((tx) => {
    const circle = isCircle(tx.circle) ? tx.circle : 'hd_family'
    if (circleFilter !== 'all' && circle !== circleFilter) return false

    if (subcategoryFilter !== 'all') {
      return tx.category_id === subcategoryFilter
    }

    if (categoryFilter !== 'all') {
      const cat = tx.category
      if (!cat) return false
      if (cat.id === categoryFilter) return true
      if (cat.parent_id === categoryFilter) return true
      // Parent may not be hydrated on leaf; resolve via byId.
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

  return (
    <div
      className="mx-auto max-w-md px-4 pt-5 pb-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PageTitle>History</PageTitle>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-neutral-700 active:bg-neutral-100 dark:text-neutral-200 dark:active:bg-neutral-800"
          aria-label="Previous month"
        >
          ◀️
        </button>
        <p className="text-sm font-medium capitalize text-neutral-700 dark:text-neutral-200">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={goNextMonth}
          disabled={!canGoNext}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-neutral-700 enabled:active:bg-neutral-100 disabled:opacity-25 dark:text-neutral-200 dark:enabled:active:bg-neutral-800"
          aria-label="Next month"
        >
          ▶️
        </button>
      </div>

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

      <div className="mt-4 space-y-5">
        {dates.map((date) => {
          const items = grouped[date]!
          const dayTotal = items.reduce(
            (sum, tx) =>
              sum + (tx.type === 'expense' ? -tx.amount : tx.amount),
            0,
          )
          return (
            <div key={date}>
              {/* Header grouping per hari */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-neutral-400">
                  {formatDateLabel(date)}
                </p>
                <p
                  className={`text-xs font-medium ${amountToneClass(dayTotal >= 0)}`}
                >
                  {dayTotal < 0 ? '-' : '+'}
                  {formatRupiah(Math.abs(dayTotal))}
                </p>
              </div>
              <div className="space-y-2">
                {items.map((tx) => {
                  const {
                    parentIcon,
                    parentName,
                    childIcon,
                    childName,
                  } = categoryDisplayParts(tx.category)
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
                      <span className="mt-0.5 text-xl" aria-hidden>
                        {parentIcon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-800 dark:text-white">
                          {parentName}
                        </p>
                        {childName && (
                          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-neutral-400">
                            <span aria-hidden>{childIcon}</span>
                            <span className="truncate">{childName}</span>
                          </p>
                        )}
                        {note && (
                          <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {note}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <CircleBadge
                          circle={
                            isCircle(tx.circle) ? tx.circle : 'hd_family'
                          }
                        />
                        <p
                          className={`text-sm font-semibold whitespace-nowrap ${
                            tx.type === 'expense'
                              ? AMOUNT_OUT_CLASS
                              : AMOUNT_IN_CLASS
                          }`}
                        >
                          {tx.type === 'expense' ? '-' : '+'}
                          {formatRupiah(tx.amount)}
                        </p>
                      </div>
                    </SwipeDeleteRow>
                  )
                })}
              </div>
            </div>
          )
        })}
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
