import { useEffect, useMemo, useState } from 'react'
import { useCategories } from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { formatNumber, formatRupiah } from '../lib/format'
import {
  createRecurringBill,
  deleteRecurringBill,
  fetchRecurringBills,
  isMissingRecurringSchema,
  updateRecurringBill,
  type RecurringBill,
} from '../lib/recurringBillsApi'
import {
  CIRCLE_LABELS,
  CIRCLES,
  formatCategoryLabel,
  type Circle,
} from '../lib/types'

export function RecurringBillsPanel() {
  const { tree, byId, loading: catsLoading } = useCategories('expense')
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📌')
  const [amountDigits, setAmountDigits] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [circle, setCircle] = useState<Circle>('hd_family')

  const categoryOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = []
    for (const parent of tree) {
      if (parent.children.length === 0) {
        opts.push({
          id: parent.id,
          label: formatCategoryLabel(parent),
        })
      } else {
        for (const child of parent.children) {
          opts.push({
            id: child.id,
            label: formatCategoryLabel({
              ...child,
              parent,
            }),
          })
        }
      }
    }
    return opts
  }, [tree])

  async function reload() {
    setLoading(true)
    try {
      const rows = await fetchRecurringBills({ includeInactive: true })
      setBills(rows)
      setAvailable(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
      } else {
        showAppToast(message || 'Failed to load bills')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleAdd() {
    if (!name.trim()) {
      showAppToast('Name is required')
      return
    }
    const amount = Number(amountDigits)
    if (!amount || amount <= 0) {
      showAppToast('Enter an amount')
      return
    }
    if (!categoryId) {
      showAppToast('Pick a category')
      return
    }
    setSaving(true)
    try {
      await createRecurringBill({
        name: name.trim(),
        amount,
        category_id: categoryId,
        circle,
        icon: icon || '📌',
      })
      setName('')
      setIcon('📌')
      setAmountDigits('')
      setCategoryId('')
      showAppToast('Bill added')
      await reload()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(bill: RecurringBill) {
    try {
      await updateRecurringBill(bill.id, { is_active: !bill.is_active })
      await reload()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  async function handleDelete(bill: RecurringBill) {
    if (!confirm(`Delete “${bill.name}”?`)) return
    try {
      await deleteRecurringBill(bill.id)
      showAppToast('Bill deleted')
      await reload()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (!available) {
    return (
      <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
        Run <code className="text-xs">migrate_recurring_bills.sql</code> in
        Supabase SQL Editor to enable recurring bills.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {(loading || catsLoading) && (
        <p className="text-sm text-neutral-400">Loading…</p>
      )}

      <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
        <p className="text-xs font-medium text-neutral-500">Add recurring bill</p>
        <div className="flex gap-2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-sm dark:bg-neutral-700"
            aria-label="Icon"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mortgage"
            className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
          />
        </div>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Amount"
          value={amountDigits ? formatNumber(Number(amountDigits)) : ''}
          onChange={(e) =>
            setAmountDigits(e.target.value.replace(/\D/g, ''))
          }
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
        >
          <option value="">Category…</option>
          {categoryOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={circle}
          onChange={(e) => setCircle(e.target.value as Circle)}
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
        >
          {CIRCLES.map((c) => (
            <option key={c} value={c}>
              {CIRCLE_LABELS[c]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving}
          className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : `Add ${ActionEmoji.add}`}
        </button>
      </div>

      <div className="space-y-2">
        {bills.map((bill) => {
          const cat = bill.category_id ? byId.get(bill.category_id) : null
          return (
            <div
              key={bill.id}
              className={`flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800 ${
                bill.is_active ? '' : 'opacity-50'
              }`}
            >
              <span className="text-xl">{bill.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  {bill.name}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {formatRupiah(bill.amount)}
                  {cat ? ` · ${cat.icon} ${cat.name}` : ''}
                  {` · ${CIRCLE_LABELS[bill.circle]}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => void handleToggleActive(bill)}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-[10px] dark:bg-neutral-700"
                >
                  {bill.is_active ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(bill)}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-700"
                  aria-label="Delete"
                >
                  {ActionEmoji.delete}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
