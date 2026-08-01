import { useMemo, useRef, useState, type TouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { OwnerBadge } from '../components/OwnerBadge'
import { PageTitle } from '../components/PageTitle'
import { useTransactions } from '../hooks/useTransactions'
import {
  formatDateLabel,
  formatMonthLabel,
  formatRupiah,
  monthRange,
} from '../lib/format'
import {
  OWNER_BADGE_CLASS,
  OWNER_LABELS,
  categoryDisplayParts,
  type Owner,
} from '../lib/types'

type MonthCursor = { year: number; month: number }

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
  const [cursor, setCursor] = useState<MonthCursor>(currentCursor)
  const [ownerFilter, setOwnerFilter] = useState<Owner | 'semua'>('semua')
  const touchStartX = useRef<number | null>(null)

  const range = useMemo(
    () => monthRange(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )
  const monthLabel = useMemo(
    () => formatMonthLabel(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )
  const { transactions, loading, error } = useTransactions(range)

  const canGoNext = !isCurrentMonth(cursor) && !isAfterCurrentMonth(cursor)

  function goPrevMonth() {
    setCursor((c) => shiftCursor(c, -1))
  }

  function goNextMonth() {
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

  const filtered = transactions.filter(
    (tx) => ownerFilter === 'semua' || tx.owner === ownerFilter,
  )

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
      <PageTitle>Riwayat</PageTitle>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-neutral-700 active:bg-neutral-100 dark:text-neutral-200 dark:active:bg-neutral-800"
          aria-label="Bulan sebelumnya"
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
          aria-label="Bulan berikutnya"
        >
          ▶️
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {(['semua', 'suami', 'istri'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setOwnerFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              ownerFilter === f
                ? f === 'semua'
                  ? 'bg-emerald-500 text-white'
                  : OWNER_BADGE_CLASS[f]
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
            } ${
              ownerFilter === f && f !== 'semua'
                ? 'ring-2 ring-offset-1 ring-current dark:ring-offset-neutral-950'
                : ''
            }`}
          >
            {f === 'semua' ? 'Semua' : OWNER_LABELS[f]}
          </button>
        ))}
      </div>

      {!loading && !error && (
        <div className="mt-4 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-neutral-400">Pemasukan</p>
              <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                {formatRupiah(monthIncome)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400">Pengeluaran</p>
              <p className="mt-0.5 text-xs font-semibold text-red-500">
                {formatRupiah(monthExpense)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400">Total</p>
              <p
                className={`mt-0.5 text-xs font-semibold ${
                  monthNet < 0 ? 'text-red-500' : 'text-emerald-600'
                }`}
              >
                {monthNet < 0 ? '-' : '+'}
                {formatRupiah(Math.abs(monthNet))}
              </p>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Memuat…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}
      {!loading && filtered.length === 0 && (
        <p className="mt-10 text-center text-sm text-neutral-400">
          Belum ada transaksi di bulan ini.
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
                  className={`text-xs font-medium ${dayTotal < 0 ? 'text-red-500' : 'text-emerald-600'}`}
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

                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() =>
                        navigate(`/transaksi/${tx.id}`, { replace: true })
                      }
                      className="flex w-full items-start gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm dark:bg-neutral-800"
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
                        <OwnerBadge owner={tx.owner} />
                        <p
                          className={`text-sm font-semibold whitespace-nowrap ${
                            tx.type === 'expense'
                              ? 'text-red-500'
                              : 'text-emerald-600'
                          }`}
                        >
                          {tx.type === 'expense' ? '-' : '+'}
                          {formatRupiah(tx.amount)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
