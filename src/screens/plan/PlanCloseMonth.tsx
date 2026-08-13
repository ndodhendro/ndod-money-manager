import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { PlanSubPage } from '../../components/PlanSubPage'
import { useBuckets } from '../../hooks/useBuckets'
import { useFreeGuiltyProgress } from '../../hooks/useFreeGuiltyProgress'
import { useMonthCursor } from '../../hooks/useMonthCursor'
import { useTransactions } from '../../hooks/useTransactions'
import { showAppToast } from '../../lib/appToast'
import { remainingFromProgress } from '../../lib/budgetSaveGate'
import {
  fetchOpenEfLoans,
  sumEfLoansBySource,
} from '../../lib/efLoansApi'
import { formatRupiah, formatYearMonthLabel } from '../../lib/format'
import {
  currentMonthCursor,
  monthCursorKey,
  shiftMonthCursor,
} from '../../lib/monthCursor'
import {
  fetchMonthClose,
  saveMonthClose,
} from '../../lib/monthClosesApi'
import { PlanIcon } from '../../lib/planSections'
import { getStoredProfile } from '../../lib/profile'
import { createTransaction } from '../../lib/transactionsApi'
import type { MonthCloseAllocation } from '../../lib/types'

type AllocMode = 'percent' | 'amount'

const ZERO_ALLOC: MonthCloseAllocation = {
  ef: 0,
  investment: 0,
  buffer: 0,
  guiltFree: 0,
}

function allocSum(a: MonthCloseAllocation): number {
  return Math.round(a.ef + a.investment + a.buffer + a.guiltFree)
}

function defaultRollover(
  remaining: number,
  kind: 'buffer' | 'guiltFree',
): MonthCloseAllocation {
  if (remaining <= 0) return { ...ZERO_ALLOC }
  if (kind === 'buffer') {
    return { ...ZERO_ALLOC, buffer: remaining }
  }
  return { ...ZERO_ALLOC, guiltFree: remaining }
}

function amountsFromPercents(
  remaining: number,
  pct: MonthCloseAllocation,
): MonthCloseAllocation {
  if (remaining <= 0) return { ...ZERO_ALLOC }
  const ef = Math.round((remaining * pct.ef) / 100)
  const investment = Math.round((remaining * pct.investment) / 100)
  const buffer = Math.round((remaining * pct.buffer) / 100)
  let guiltFree = remaining - ef - investment - buffer
  // Keep last bucket non-negative if rounding drifts.
  if (guiltFree < 0) {
    return {
      ef,
      investment,
      buffer: buffer + guiltFree,
      guiltFree: 0,
    }
  }
  return { ef, investment, buffer, guiltFree }
}

function percentsFromAmounts(
  remaining: number,
  amounts: MonthCloseAllocation,
): MonthCloseAllocation {
  if (remaining <= 0) return { ...ZERO_ALLOC }
  return {
    ef: Math.round((amounts.ef * 100) / remaining),
    investment: Math.round((amounts.investment * 100) / remaining),
    buffer: Math.round((amounts.buffer * 100) / remaining),
    guiltFree: Math.round((amounts.guiltFree * 100) / remaining),
  }
}

function FourWayFields({
  title,
  remaining,
  amounts,
  onAmountsChange,
  mode,
  onModeChange,
}: {
  title: string
  remaining: number
  amounts: MonthCloseAllocation
  onAmountsChange: (next: MonthCloseAllocation) => void
  mode: AllocMode
  onModeChange: (mode: AllocMode) => void
}) {
  const pct = percentsFromAmounts(remaining, amounts)
  const display = mode === 'percent' ? pct : amounts
  const total =
    mode === 'percent' ? allocSum(pct) : allocSum(amounts)
  const target = mode === 'percent' ? 100 : remaining
  const ok = remaining === 0 || total === target

  function setField(
    key: keyof MonthCloseAllocation,
    raw: string,
  ) {
    const n = Math.max(0, Math.round(Number(raw.replace(/\D/g, '')) || 0))
    if (mode === 'percent') {
      const nextPct = { ...pct, [key]: n }
      onAmountsChange(amountsFromPercents(remaining, nextPct))
    } else {
      onAmountsChange({ ...amounts, [key]: n })
    }
  }

  const fields: { key: keyof MonthCloseAllocation; label: string }[] = [
    { key: 'ef', label: 'Emergency Fund' },
    { key: 'investment', label: 'Investment Transit' },
    { key: 'buffer', label: 'Buffer' },
    { key: 'guiltFree', label: 'Guilt-Free Fund' },
  ]

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {title}
          </h2>
          <p className="text-xs text-neutral-400">
            Remaining {formatRupiah(remaining)}
          </p>
        </div>
        <div className="flex rounded-lg bg-neutral-100 p-0.5 text-xs dark:bg-neutral-900">
          <button
            type="button"
            className={`rounded-md px-2 py-1 ${
              mode === 'percent'
                ? 'bg-white font-semibold shadow-sm dark:bg-neutral-800'
                : 'text-neutral-500'
            }`}
            onClick={() => onModeChange('percent')}
          >
            %
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 ${
              mode === 'amount'
                ? 'bg-white font-semibold shadow-sm dark:bg-neutral-800'
                : 'text-neutral-500'
            }`}
            onClick={() => onModeChange('amount')}
          >
            Rp
          </button>
        </div>
      </div>

      {remaining <= 0 ? (
        <p className="mt-3 text-xs text-neutral-400">Nothing left to allocate.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {fields.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-600 dark:text-neutral-300">
                {label}
              </span>
              <input
                inputMode="numeric"
                className="w-28 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-right text-sm tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
                value={display[key] || ''}
                onChange={(e) => setField(key, e.target.value)}
              />
            </label>
          ))}
          <p
            className={`text-xs ${
              ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            Total {mode === 'percent' ? `${total}%` : formatRupiah(total)}
            {ok ? ' · OK' : ` · need ${mode === 'percent' ? '100%' : formatRupiah(remaining)}`}
          </p>
        </div>
      )}
    </section>
  )
}

export function PlanCloseMonth() {
  const navigate = useNavigate()
  const prior = shiftMonthCursor(currentMonthCursor(), -1)
  const {
    range,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
    cursor,
    setCursor,
  } = useMonthCursor()

  useEffect(() => {
    setCursor(prior)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeYm = monthCursorKey(cursor)
  const yearMonth = monthCursorKey(prior)
  const { transactions, loading, error } = useTransactions(range)
  const {
    allocation,
    progress,
    loading: budgetLoading,
    error: budgetError,
  } = useFreeGuiltyProgress(closeYm, transactions)
  const { emergency, investment, reload: reloadBuckets } = useBuckets()

  const [alreadyClosed, setAlreadyClosed] = useState(false)
  const [efOwed, setEfOwed] = useState({ buffer: 0, guiltFree: 0, total: 0 })
  const [bufferAlloc, setBufferAlloc] = useState<MonthCloseAllocation>({
    ...ZERO_ALLOC,
  })
  const [gfAlloc, setGfAlloc] = useState<MonthCloseAllocation>({
    ...ZERO_ALLOC,
  })
  const [bufferMode, setBufferMode] = useState<AllocMode>('percent')
  const [gfMode, setGfMode] = useState<AllocMode>('percent')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initedYm, setInitedYm] = useState<string | null>(null)

  const rem = useMemo(() => {
    if (!progress) return { bufferRemaining: 0, guiltFreeRemaining: 0 }
    return remainingFromProgress(progress)
  }, [progress])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const closed = await fetchMonthClose(closeYm)
      if (cancelled) return
      setAlreadyClosed(closed != null)
      const loans = await fetchOpenEfLoans()
      if (cancelled) return
      setEfOwed(sumEfLoansBySource(loans))
    })()
    return () => {
      cancelled = true
    }
  }, [closeYm])

  useEffect(() => {
    if (!progress) return
    if (initedYm === closeYm) return
    setBufferAlloc(defaultRollover(rem.bufferRemaining, 'buffer'))
    setGfAlloc(defaultRollover(rem.guiltFreeRemaining, 'guiltFree'))
    setInitedYm(closeYm)
  }, [progress, rem, closeYm, initedYm])

  const bufferOk =
    rem.bufferRemaining === 0 ||
    allocSum(bufferAlloc) === rem.bufferRemaining
  const gfOk =
    rem.guiltFreeRemaining === 0 || allocSum(gfAlloc) === rem.guiltFreeRemaining
  const canClose =
    !alreadyClosed &&
    allocation != null &&
    progress != null &&
    bufferOk &&
    gfOk

  async function runClose() {
    if (!allocation || !progress || !canClose) return
    setSaving(true)
    try {
      const owner = getStoredProfile() ?? 'suami'
      const toEf = bufferAlloc.ef + gfAlloc.ef
      const toInv = bufferAlloc.investment + gfAlloc.investment
      if (toEf > 0) {
        if (!emergency) throw new Error('Emergency Fund bucket missing')
        await createTransaction({
          type: 'transfer',
          category_id: null,
          from_bucket_id: null,
          to_bucket_id: emergency.id,
          amount: toEf,
          description: `Close Month ${formatYearMonthLabel(closeYm)} → Emergency Fund`,
          owner,
          circle: 'hd_family',
          occurred_on: range.end,
          is_recurring: false,
          complete_later: false,
        })
      }
      if (toInv > 0) {
        if (!investment) throw new Error('Investment bucket missing')
        await createTransaction({
          type: 'transfer',
          category_id: null,
          from_bucket_id: null,
          to_bucket_id: investment.id,
          amount: toInv,
          description: `Close Month ${formatYearMonthLabel(closeYm)} → Investment Transit`,
          owner,
          circle: 'hd_family',
          occurred_on: range.end,
          is_recurring: false,
          complete_later: false,
        })
      }

      await saveMonthClose({
        yearMonth: closeYm,
        income: allocation.income,
        plannedNeeds: allocation.plannedNeeds,
        plannedWants: allocation.plannedWants,
        bufferAllowance: allocation.buffer,
        bufferUsed: progress.buffer.used,
        bufferRemaining: rem.bufferRemaining,
        guiltFreeAllowance: allocation.guiltFree,
        guiltFreeUsed: progress.guiltFree.used,
        guiltFreeRemaining: rem.guiltFreeRemaining,
        bufferAllocation: bufferAlloc,
        guiltFreeAllocation: gfAlloc,
      })
      void reloadBuckets()
      setConfirmOpen(false)
      showAppToast('Month closed')
      navigate('/rencana')
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to close month')
    } finally {
      setSaving(false)
    }
  }

  const pageLoading = loading || budgetLoading
  const pageError = error || budgetError

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <PlanSubPage
        title="Close Month"
        icon={PlanIcon.closeMonth}
      >
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
          Allocate leftover Buffer and Guilt-Free Fund (100% each), then unlock
          the next month. Default month: {formatYearMonthLabel(yearMonth)}.
        </p>

        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-neutral-600 active:bg-neutral-100 dark:text-neutral-300"
            onClick={goPrevMonth}
          >
            ←
          </button>
          <p className="text-sm font-semibold">{monthLabel}</p>
          <button
            type="button"
            disabled={!canGoNext}
            className="rounded-lg px-2 py-1 text-sm text-neutral-600 enabled:active:bg-neutral-100 disabled:opacity-30 dark:text-neutral-300"
            onClick={goNextMonth}
          >
            →
          </button>
        </div>

        {pageLoading && (
          <p className="text-center text-sm text-neutral-400">Loading…</p>
        )}
        {pageError && (
          <p className="text-center text-sm text-red-500">{pageError}</p>
        )}

        {!pageLoading && allocation && progress && (
          <div className="space-y-4">
            {alreadyClosed && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                {formatYearMonthLabel(closeYm)} is already closed.
              </p>
            )}

            <section className="rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
              <h2 className="text-sm font-semibold">Month Summary</h2>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Buffer left</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(rem.bufferRemaining)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Guilt-Free left</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(rem.guiltFreeRemaining)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Owed to Emergency Fund</dt>
                  <dd className="tabular-nums text-amber-700 dark:text-amber-300">
                    {formatRupiah(efOwed.total)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-neutral-400">
                Repay EF anytime from Dashboard. Closing does not require full
                repayment.
              </p>
            </section>

            <FourWayFields
              title="Allocate Buffer Leftover"
              remaining={rem.bufferRemaining}
              amounts={bufferAlloc}
              onAmountsChange={setBufferAlloc}
              mode={bufferMode}
              onModeChange={setBufferMode}
            />
            <FourWayFields
              title="Allocate Guilt-Free Leftover"
              remaining={rem.guiltFreeRemaining}
              amounts={gfAlloc}
              onAmountsChange={setGfAlloc}
              mode={gfMode}
              onModeChange={setGfMode}
            />

            <button
              type="button"
              disabled={!canClose || saving}
              onClick={() => setConfirmOpen(true)}
              className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-md active:bg-emerald-600 disabled:opacity-50"
            >
              Close {formatYearMonthLabel(closeYm)}
            </button>
          </div>
        )}
      </PlanSubPage>

      <ConfirmDialog
        open={confirmOpen}
        title="Close This Month?"
        message={`This freezes ${formatYearMonthLabel(closeYm)} envelopes and applies leftover allocation. Late fixes will borrow from Emergency Fund only.`}
        confirmLabel="Close Month"
        cancelLabel="Cancel"
        danger={false}
        busy={saving}
        onCancel={() => {
          if (saving) return
          setConfirmOpen(false)
        }}
        onConfirm={() => void runClose()}
      />
    </div>
  )
}
