import { useEffect, useRef, useState } from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import { ActionEmoji } from '../lib/actionEmoji'
import { FormattedAmountInput } from './FormattedAmountInput'
import { daysInMonth, type MonthCursor } from '../lib/monthCursor'
import type { RecurringBill } from '../lib/recurringBillsApi'

interface RecurringMonthOverrideSheetProps {
  open: boolean
  bill: RecurringBill | null
  cursor: MonthCursor
  /** Effective amount currently shown for this month. */
  initialAmount: number
  /** Effective due day currently shown for this month. */
  initialDueDay: number
  busy?: boolean
  /** Focus the amount field when the sheet opens. */
  autoFocusAmount?: boolean
  /** PYF Emergency/Investment: amount is from Money Plan (read-only). */
  amountLocked?: boolean
  onClose: () => void
  onSave: (input: { amount: number; dueDay: number }) => void
}

export function RecurringMonthOverrideSheet({
  open,
  bill,
  cursor,
  initialAmount,
  initialDueDay,
  busy = false,
  autoFocusAmount = false,
  amountLocked = false,
  onClose,
  onSave,
}: RecurringMonthOverrideSheetProps) {
  const maxDay = daysInMonth(cursor.year, cursor.month)
  const [amountDigits, setAmountDigits] = useState('')
  const [dueDay, setDueDay] = useState(1)
  const amountInputRef = useRef<HTMLInputElement>(null)

  useOverlayBack(open, () => {
    if (busy) return false
    onClose()
    return true
  })

  useEffect(() => {
    if (!open || !bill) return
    setAmountDigits(String(Math.round(initialAmount)))
    setDueDay(Math.min(Math.max(1, initialDueDay), maxDay))
  }, [open, bill, initialAmount, initialDueDay, maxDay])

  useEffect(() => {
    if (!open || !autoFocusAmount || amountLocked) return
    const t = window.setTimeout(() => {
      amountInputRef.current?.focus()
      amountInputRef.current?.select()
    }, 50)
    return () => window.clearTimeout(t)
  }, [open, autoFocusAmount, amountLocked, bill?.id])

  if (!open || !bill) return null

  const canSave =
    (amountLocked || Number(amountDigits) > 0) && !busy

  function handleSave() {
    const amount = amountLocked
      ? Math.max(0, Math.round(initialAmount))
      : Number(amountDigits)
    if (!canSave || (!amountLocked && amount <= 0)) return
    onSave({ amount: amountLocked ? Math.max(1, amount || 1) : amount, dueDay })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        disabled={busy}
        onClick={onClose}
      />
      <div
        className="relative rounded-t-2xl bg-neutral-100 shadow-2xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-override-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0">
            <p
              id="month-override-title"
              className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100"
            >
              Edit This Month
            </p>
            <p className="truncate text-xs text-neutral-400">This Month Only</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-base leading-none disabled:opacity-60"
            aria-label="Close"
            title="Close"
          >
            {ActionEmoji.close}
          </button>
        </div>

        <div className="space-y-4 bg-white px-4 py-4 dark:bg-neutral-950">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Amount
            </span>
            <div
              className={`flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-900 ${
                amountLocked ? 'opacity-80' : ''
              }`}
            >
              <span className="text-sm font-medium text-neutral-400">Rp</span>
              <FormattedAmountInput
                ref={amountInputRef}
                pattern="[0-9]*"
                autoComplete="off"
                digits={amountDigits}
                onDigitsChange={setAmountDigits}
                readOnly={amountLocked}
                disabled={busy || amountLocked}
                placeholder="0"
                className="w-full bg-transparent text-2xl font-semibold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-50"
              />
            </div>
            {amountLocked ? (
              <p className="mt-1.5 text-xs text-neutral-400">
                From Money Plan (% × this month&apos;s income).
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-neutral-400">Due Day</span>
            <select
              value={dueDay}
              disabled={busy}
              onChange={(e) => setDueDay(Number(e.target.value))}
              className="w-full rounded-xl bg-neutral-50 px-3 py-3 text-sm dark:bg-neutral-900 dark:text-neutral-100"
            >
              {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
          </label>

          <div className="pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white active:bg-emerald-600 disabled:opacity-60"
            >
              {busy ? 'Updating…' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
