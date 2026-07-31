import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTransactions } from '../hooks/useTransactions'
import {
  currentMonthLabel,
  currentMonthRange,
  formatDateLabel,
  formatRupiah,
} from '../lib/format'
import type { Owner } from '../lib/types'

export function History() {
  const navigate = useNavigate()
  const range = useMemo(() => currentMonthRange(), [])
  const { transactions, loading, error } = useTransactions(range)
  const [ownerFilter, setOwnerFilter] = useState<Owner | 'semua'>('semua')

  const filtered = transactions.filter(
    (tx) => ownerFilter === 'semua' || tx.owner === ownerFilter,
  )

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
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Riwayat
      </h1>
      <p className="text-sm text-neutral-500">{currentMonthLabel()}</p>

      <div className="mt-4 flex gap-2">
        {(['semua', 'suami', 'istri'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setOwnerFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
              ownerFilter === f
                ? 'bg-emerald-500 text-white'
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Memuat…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}
      {!loading && filtered.length === 0 && (
        <p className="mt-10 text-center text-sm text-neutral-400">
          Belum ada transaksi bulan ini.
        </p>
      )}

      <div className="mt-4 space-y-5">
        {dates.map((date) => {
          const items = grouped[date]
          const dayTotal = items.reduce(
            (sum, tx) =>
              sum + (tx.type === 'expense' ? -tx.amount : tx.amount),
            0,
          )
          return (
            <div key={date}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
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
                {items.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => navigate(`/transaksi/${tx.id}`)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm dark:bg-neutral-800"
                  >
                    <span className="text-xl">
                      {tx.category?.icon ?? '💸'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {tx.category?.name ?? 'Tanpa kategori'}
                      </p>
                      <p className="truncate text-xs text-neutral-400">
                        {tx.description || '—'} · {tx.owner}
                      </p>
                    </div>
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
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
