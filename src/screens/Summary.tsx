import { useMemo } from 'react'
import { PageTitle } from '../components/PageTitle'
import { useTransactions } from '../hooks/useTransactions'
import { currentMonthLabel, currentMonthRange, formatRupiah } from '../lib/format'
import { categoryIcon } from '../lib/types'

export function Summary() {
  const range = useMemo(() => currentMonthRange(), [])
  const { transactions, loading, error } = useTransactions(range)

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const net = totalIncome - totalExpense

  // Roll-up ke parent category supaya ringkasan tetap compact.
  const expenseByCategory = useMemo(() => {
    const map = new Map<
      string,
      { name: string; icon: string; total: number }
    >()
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue
      const parent = tx.category?.parent
      const key = parent?.id ?? tx.category_id ?? 'lain'
      const name = parent?.name ?? tx.category?.name ?? 'Tanpa kategori'
      const icon = categoryIcon(tx.category)
      const existing = map.get(key)
      if (existing) {
        existing.total += tx.amount
      } else {
        map.set(key, { name, icon, total: tx.amount })
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [transactions])

  const needsTotal = transactions
    .filter((t) => {
      if (t.type !== 'expense') return false
      const group =
        t.category?.budget_group ?? t.category?.parent?.budget_group ?? null
      return group === 'needs'
    })
    .reduce((sum, t) => sum + t.amount, 0)
  const wantsTotal = transactions
    .filter((t) => {
      if (t.type !== 'expense') return false
      const group =
        t.category?.budget_group ?? t.category?.parent?.budget_group ?? null
      return group === 'wants'
    })
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <PageTitle>Ringkasan</PageTitle>
      <p className="text-sm text-neutral-500">{currentMonthLabel()}</p>

      {loading && (
        <p className="mt-6 text-center text-sm text-neutral-400">Memuat…</p>
      )}
      {error && (
        <p className="mt-6 text-center text-sm text-red-500">{error}</p>
      )}

      {!loading && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <p className="text-xs text-neutral-400">Pemasukan</p>
              <p className="mt-1 text-base font-semibold text-emerald-600">
                {formatRupiah(totalIncome)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <p className="text-xs text-neutral-400">Pengeluaran</p>
              <p className="mt-1 text-base font-semibold text-red-500">
                {formatRupiah(totalExpense)}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-neutral-900 p-3 text-white dark:bg-neutral-800">
            <p className="text-xs text-neutral-300">Selisih (Net)</p>
            <p
              className={`mt-1 text-lg font-semibold ${net < 0 ? 'text-red-400' : 'text-emerald-400'}`}
            >
              {net < 0 ? '-' : '+'}
              {formatRupiah(Math.abs(net))}
            </p>
          </div>

          {(needsTotal > 0 || wantsTotal > 0) && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Needs vs Wants (dari pengeluaran)
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="bg-sky-500"
                  style={{
                    width: `${totalExpense ? (needsTotal / totalExpense) * 100 : 0}%`,
                  }}
                />
                <div
                  className="bg-amber-400"
                  style={{
                    width: `${totalExpense ? (wantsTotal / totalExpense) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-neutral-500">
                <span>Needs {formatRupiah(needsTotal)}</span>
                <span>Wants {formatRupiah(wantsTotal)}</span>
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Pengeluaran per Kategori
            </p>
            {expenseByCategory.length === 0 ? (
              <p className="text-sm text-neutral-400">Belum ada data.</p>
            ) : (
              <div className="space-y-2">
                {expenseByCategory.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800"
                  >
                    <span className="text-xl">{cat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {cat.name}
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{
                            width: `${totalExpense ? (cat.total / totalExpense) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-sm font-semibold whitespace-nowrap text-neutral-700 dark:text-neutral-200">
                      {formatRupiah(cat.total)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
