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
  allocationSum,
  defaultNeedsSideAllocation,
  defaultWantsSideAllocation,
  ZERO_CLOSE_ALLOC,
} from '../../lib/closeMonthDefaults'
import {
  applyEfLoanRepayment,
  fetchOpenEfLoans,
  sumEfLoansBySource,
} from '../../lib/efLoansApi'
import { formatRupiah, formatYearMonthLabel } from '../../lib/format'
import {
  currentMonthCursor,
  monthCursorKey,
  shiftMonthCursor,
} from '../../lib/monthCursor'
import { fetchMonthClose, saveMonthClose } from '../../lib/monthClosesApi'
import { PlanIcon } from '../../lib/planSections'
import { getStoredProfile } from '../../lib/profile'
import { createTransaction } from '../../lib/transactionsApi'
import type { MonthCloseAllocation } from '../../lib/types'

type AllocMode = 'percent' | 'amount'

function amountsFromPercents(
  remaining: number,
  pct: MonthCloseAllocation,
): MonthCloseAllocation {
  if (remaining <= 0) return { ...ZERO_CLOSE_ALLOC }
  const ef = Math.round((remaining * pct.ef) / 100)
  const investment = Math.round((remaining * pct.investment) / 100)
  const buffer = Math.round((remaining * pct.buffer) / 100)
  let guiltFree = remaining - ef - investment - buffer
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
  if (remaining <= 0) return { ...ZERO_CLOSE_ALLOC }
  return {
    ef: Math.round((amounts.ef * 100) / remaining),
    investment: Math.round((amounts.investment * 100) / remaining),
    buffer: Math.round((amounts.buffer * 100) / remaining),
    guiltFree: Math.round((amounts.guiltFree * 100) / remaining),
  }
}

function FourWayFields({
  title,
  subtitle,
  remaining,
  amounts,
  onAmountsChange,
  mode,
  onModeChange,
}: {
  title: string
  subtitle?: string
  remaining: number
  amounts: MonthCloseAllocation
  onAmountsChange: (next: MonthCloseAllocation) => void
  mode: AllocMode
  onModeChange: (mode: AllocMode) => void
}) {
  const pct = percentsFromAmounts(remaining, amounts)
  const display = mode === 'percent' ? pct : amounts
  const total = mode === 'percent' ? allocationSum(pct) : allocationSum(amounts)
  const target = mode === 'percent' ? 100 : remaining
  const ok = remaining === 0 || total === target

  function setField(key: keyof MonthCloseAllocation, raw: string) {
    const n = Math.max(0, Math.round(Number(raw.replace(/\D/g, '')) || 0))
    if (mode === 'percent') {
      onAmountsChange(amountsFromPercents(remaining, { ...pct, [key]: n }))
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
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {title}
          </h2>
          <p className="text-xs text-neutral-400">
            Remaining {formatRupiah(remaining)}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-neutral-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 rounded-lg bg-neutral-100 p-0.5 text-xs dark:bg-neutral-900">
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
            {ok
              ? ' · OK'
              : ` · need ${mode === 'percent' ? '100%' : formatRupiah(remaining)}`}
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
  const [needsAlloc, setNeedsAlloc] = useState<MonthCloseAllocation>({
    ...ZERO_CLOSE_ALLOC,
  })
  const [wantsAlloc, setWantsAlloc] = useState<MonthCloseAllocation>({
    ...ZERO_CLOSE_ALLOC,
  })
  const [needsMode, setNeedsMode] = useState<AllocMode>('amount')
  const [wantsMode, setWantsMode] = useState<AllocMode>('amount')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [initedKey, setInitedKey] = useState<string | null>(null)

  const rem = useMemo(() => {
    if (!progress) {
      return {
        plannedNeedsRemaining: 0,
        bufferRemaining: 0,
        plannedWantsRemaining: 0,
        guiltFreeRemaining: 0,
        needsSideRemaining: 0,
        wantsSideRemaining: 0,
      }
    }
    const track = remainingFromProgress(progress)
    const plannedNeedsRemaining = Math.max(
      0,
      Math.round(progress.plannedNeeds.remaining),
    )
    const plannedWantsRemaining = Math.max(
      0,
      Math.round(progress.plannedWants.remaining),
    )
    return {
      plannedNeedsRemaining,
      bufferRemaining: track.bufferRemaining,
      plannedWantsRemaining,
      guiltFreeRemaining: track.guiltFreeRemaining,
      needsSideRemaining: plannedNeedsRemaining + track.bufferRemaining,
      wantsSideRemaining: plannedWantsRemaining + track.guiltFreeRemaining,
    }
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
    const key = `${closeYm}:${efOwed.total}:${rem.needsSideRemaining}:${rem.wantsSideRemaining}`
    if (initedKey === key) return
    setNeedsAlloc(
      defaultNeedsSideAllocation(rem.needsSideRemaining, efOwed.total),
    )
    setWantsAlloc(defaultWantsSideAllocation(rem.wantsSideRemaining))
    setInitedKey(key)
  }, [progress, rem, closeYm, efOwed.total, initedKey])

  const needsOk =
    rem.needsSideRemaining === 0 ||
    allocationSum(needsAlloc) === rem.needsSideRemaining
  const wantsOk =
    rem.wantsSideRemaining === 0 ||
    allocationSum(wantsAlloc) === rem.wantsSideRemaining
  const canClose =
    !alreadyClosed &&
    allocation != null &&
    progress != null &&
    needsOk &&
    wantsOk

  async function runClose() {
    if (!allocation || !progress || !canClose) return
    setSaving(true)
    try {
      const owner = getStoredProfile() ?? 'suami'
      const toEf = needsAlloc.ef + wantsAlloc.ef
      const toInv = needsAlloc.investment + wantsAlloc.investment
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
        await applyEfLoanRepayment(toEf)
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
        plannedNeedsRemaining: rem.plannedNeedsRemaining,
        plannedWantsRemaining: rem.plannedWantsRemaining,
        needsSideRemaining: rem.needsSideRemaining,
        wantsSideRemaining: rem.wantsSideRemaining,
        needsSideAllocation: needsAlloc,
        wantsSideAllocation: wantsAlloc,
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
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PlanSubPage title="Close Month" icon={PlanIcon.closeMonth}>
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
          Allocate Needs Side and Wants Side leftovers (100% each), then unlock
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
                  <dt className="text-neutral-500">Needs Side leftover</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(rem.needsSideRemaining)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 text-xs text-neutral-400">
                  <dt className="pl-2">Planned Needs + Buffer</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(rem.plannedNeedsRemaining)} +{' '}
                    {formatRupiah(rem.bufferRemaining)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-500">Wants Side leftover</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(rem.wantsSideRemaining)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 text-xs text-neutral-400">
                  <dt className="pl-2">Planned Wants + Guilt-Free</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(rem.plannedWantsRemaining)} +{' '}
                    {formatRupiah(rem.guiltFreeRemaining)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <dt className="text-neutral-500">Owed to Emergency Fund</dt>
                  <dd className="tabular-nums text-amber-700 dark:text-amber-300">
                    {formatRupiah(efOwed.total)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-neutral-400">
                Defaults repay EF from Needs Side first, then Buffer carry.
                Wants Side defaults to Guilt-Free rollover. You can edit before
                closing.
              </p>
            </section>

            <FourWayFields
              title="Allocate Needs Side Leftover"
              subtitle={`Planned Needs ${formatRupiah(rem.plannedNeedsRemaining)} + Buffer ${formatRupiah(rem.bufferRemaining)}`}
              remaining={rem.needsSideRemaining}
              amounts={needsAlloc}
              onAmountsChange={setNeedsAlloc}
              mode={needsMode}
              onModeChange={setNeedsMode}
            />
            <FourWayFields
              title="Allocate Wants Side Leftover"
              subtitle={`Planned Wants ${formatRupiah(rem.plannedWantsRemaining)} + Guilt-Free ${formatRupiah(rem.guiltFreeRemaining)}`}
              remaining={rem.wantsSideRemaining}
              amounts={wantsAlloc}
              onAmountsChange={setWantsAlloc}
              mode={wantsMode}
              onModeChange={setWantsMode}
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
