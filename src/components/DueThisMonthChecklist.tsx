import { useState } from 'react'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { formatRupiah, todayIso } from '../lib/format'
import {
  isCurrentMonthCursor,
  monthCursorKey,
  type MonthCursor,
} from '../lib/monthCursor'
import { getStoredProfile } from '../lib/profile'
import {
  markBillPaid,
  unmarkBillPaid,
  type RecurringBill,
  type RecurringBillLog,
} from '../lib/recurringBillsApi'
import { createTransaction, deleteTransaction } from '../lib/transactionsApi'

interface DueThisMonthChecklistProps {
  cursor: MonthCursor
  bills: RecurringBill[]
  logByBillId: Map<string, RecurringBillLog>
  loading: boolean
  available: boolean
  onChanged: () => void
}

export function DueThisMonthChecklist({
  cursor,
  bills,
  logByBillId,
  loading,
  available,
  onChanged,
}: DueThisMonthChecklistProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const yearMonth = monthCursorKey(cursor)
  const occurredOn = isCurrentMonthCursor(cursor)
    ? todayIso()
    : `${yearMonth}-01`

  async function handleToggle(bill: RecurringBill, paid: boolean) {
    if (busyId) return
    setBusyId(bill.id)
    try {
      if (paid) {
        const { transactionId } = await unmarkBillPaid(bill.id, yearMonth)
        if (transactionId) {
          try {
            await deleteTransaction(transactionId)
          } catch {
            // Log cleared even if tx already gone
          }
        }
        showAppToast('Marked unpaid')
      } else {
        if (!bill.category_id) {
          showAppToast('Set a category for this bill in Settings')
          return
        }
        const owner = getStoredProfile() ?? 'suami'
        const txId = await createTransaction({
          type: 'expense',
          category_id: bill.category_id,
          from_bucket_id: null,
          to_bucket_id: null,
          amount: bill.amount,
          description: bill.name,
          owner,
          circle: bill.circle,
          occurred_on: occurredOn,
          is_recurring: true,
        })
        await markBillPaid({
          billId: bill.id,
          yearMonth,
          transactionId: txId,
        })
        showAppToast(`Logged ${ActionEmoji.save}`)
      }
      onChanged()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  if (!available) {
    return (
      <section className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Due this month
        </p>
        <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
          Run migration{' '}
          <code className="text-xs">migrate_recurring_bills.sql</code> in
          Supabase, then add bills in Settings.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-6">
      <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
        Due this month
      </p>
      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : bills.length === 0 ? (
        <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
          No recurring bills yet. Add them in Settings → Recurring bills.
        </p>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => {
            const log = logByBillId.get(bill.id)
            const paid = Boolean(log)
            const busy = busyId === bill.id
            return (
              <button
                key={bill.id}
                type="button"
                disabled={busy}
                onClick={() => void handleToggle(bill, paid)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left shadow-sm transition-colors disabled:opacity-60 ${
                  paid
                    ? 'bg-emerald-50 dark:bg-emerald-950/30'
                    : 'bg-white dark:bg-neutral-800'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${
                    paid
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-700'
                  }`}
                  aria-hidden
                >
                  {paid ? ActionEmoji.save : '○'}
                </span>
                <span className="text-xl" aria-hidden>
                  {bill.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      paid
                        ? 'text-neutral-500 line-through dark:text-neutral-400'
                        : 'text-neutral-800 dark:text-neutral-100'
                    }`}
                  >
                    {bill.name}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {paid ? 'Paid' : 'Tap to log as paid'}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    paid
                      ? 'text-neutral-400'
                      : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                >
                  {formatRupiah(bill.amount)}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
