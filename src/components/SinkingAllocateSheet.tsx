import { useEffect, useState } from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { allocationSum } from '../lib/closeMonthDefaults'
import { applyEfLoanRepayment } from '../lib/efLoansApi'
import { FormattedAmountInput } from './FormattedAmountInput'
import { formatRupiah, todayIso } from '../lib/format'
import { getStoredProfile } from '../lib/profile'
import {
  defaultSinkingAllocation,
  executeSinkingAllocation,
  sinkingSurplus,
} from '../lib/sinkingAllocate'
import type { BudgetGroup, MonthCloseAllocation } from '../lib/types'
import {
  FourWayAllocationFields,
  type AllocMode,
} from './FourWayAllocationFields'

type AllocateBucket = {
  id: string
  name: string
  balance: number
  target: number
  budget_group: BudgetGroup | null
}

export function SinkingAllocateSheet({
  open,
  bucket,
  emergencyId,
  investmentId,
  onClose,
  onSaved,
}: {
  open: boolean
  bucket: AllocateBucket | null
  emergencyId: string
  investmentId: string
  onClose: () => void
  onSaved: () => void
}) {
  const available = Math.max(0, Math.round(bucket?.balance ?? 0))
  const surplus = bucket ? sinkingSurplus(bucket.balance, bucket.target) : 0

  const [amountDigits, setAmountDigits] = useState('')
  const [alloc, setAlloc] = useState<MonthCloseAllocation>(
    defaultSinkingAllocation(0, null),
  )
  const [mode, setMode] = useState<AllocMode>('amount')
  const [busy, setBusy] = useState(false)

  useOverlayBack(open, () => {
    if (busy) return false
    onClose()
    return true
  })

  useEffect(() => {
    if (!open || !bucket) return
    const start = surplus > 0 ? surplus : 0
    setAmountDigits(start > 0 ? String(start) : '')
    setAlloc(defaultSinkingAllocation(start, bucket.budget_group))
    setMode('amount')
  }, [open, bucket, surplus])

  if (!open || !bucket) return null

  const amount = Math.max(0, Math.round(Number(amountDigits) || 0))
  const ok = amount > 0 && amount <= available && allocationSum(alloc) === amount

  function handleAmountDigitsChange(digits: string) {
    setAmountDigits(digits)
    const next = Math.max(0, Math.round(Number(digits) || 0))
    setAlloc(defaultSinkingAllocation(next, bucket?.budget_group))
  }

  async function handleSave() {
    if (!bucket || !ok || busy) return
    setBusy(true)
    try {
      const owner = getStoredProfile() ?? 'suami'
      const { toEf } = await executeSinkingAllocation({
        bucketId: bucket.id,
        bucketName: bucket.name,
        allocation: alloc,
        occurredOn: todayIso(),
        owner,
        emergencyId,
        investmentId,
      })
      if (toEf > 0) await applyEfLoanRepayment(toEf)
      showAppToast(`Allocated ${ActionEmoji.save}`)
      onSaved()
      onClose()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to allocate')
    } finally {
      setBusy(false)
    }
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
        className="relative max-h-[90vh] overflow-y-auto rounded-t-2xl bg-neutral-100 shadow-2xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sinking-allocate-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0">
            <p
              id="sinking-allocate-title"
              className="truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100"
            >
              Allocate Surplus
            </p>
            <p className="truncate text-xs text-neutral-400">{bucket.name}</p>
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
          <p className="text-xs text-neutral-400">
            Available {formatRupiah(available)}
            {surplus > 0 ? ` · Over target ${formatRupiah(surplus)}` : ''}
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
              Amount
            </span>
            <div className="flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-900">
              <span className="text-sm font-medium text-neutral-400">Rp</span>
              <FormattedAmountInput
                pattern="[0-9]*"
                autoComplete="off"
                digits={amountDigits}
                onDigitsChange={handleAmountDigitsChange}
                disabled={busy}
                placeholder="0"
                className="w-full bg-transparent text-2xl font-semibold tabular-nums text-neutral-800 outline-none placeholder:text-neutral-400 disabled:opacity-60 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            </div>
          </label>

          <FourWayAllocationFields
            title="Split"
            remaining={amount}
            amounts={alloc}
            onAmountsChange={setAlloc}
            mode={mode}
            onModeChange={setMode}
            variant="plain"
          />

          <div className="pb-[env(safe-area-inset-bottom)]">
            <button
              type="button"
              disabled={!ok || busy}
              onClick={() => void handleSave()}
              className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white active:bg-emerald-600 disabled:opacity-60"
            >
              {busy ? 'Allocating…' : 'Allocate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
