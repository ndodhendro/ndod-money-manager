import { allocationSum, ZERO_CLOSE_ALLOC } from '../lib/closeMonthDefaults'
import { formatRupiah } from '../lib/format'
import type { MonthCloseAllocation } from '../lib/types'
import { FormattedAmountInput } from './FormattedAmountInput'

const ALLOC_INPUT_CLASS =
  'w-32 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-right text-sm tabular-nums text-neutral-800 outline-none placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500'

export type AllocMode = 'percent' | 'amount'

export function amountsFromPercents(
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

export function percentsFromAmounts(
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

export function FourWayAllocationFields({
  title,
  subtitle,
  remaining,
  amounts,
  onAmountsChange,
  mode,
  onModeChange,
  variant = 'card',
}: {
  title: string
  subtitle?: string
  remaining: number
  amounts: MonthCloseAllocation
  onAmountsChange: (next: MonthCloseAllocation) => void
  mode: AllocMode
  onModeChange: (mode: AllocMode) => void
  variant?: 'card' | 'plain'
}) {
  const pct = percentsFromAmounts(remaining, amounts)
  const display = mode === 'percent' ? pct : amounts
  const total = mode === 'percent' ? allocationSum(pct) : allocationSum(amounts)
  const target = mode === 'percent' ? 100 : remaining
  const ok = remaining === 0 || total === target

  function setField(key: keyof MonthCloseAllocation, digits: string) {
    const n = Math.max(0, Math.round(Number(digits) || 0))
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
    <section
      className={
        variant === 'card'
          ? 'rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800'
          : ''
      }
    >
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
                ? 'bg-white font-semibold text-neutral-800 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
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
                ? 'bg-white font-semibold text-neutral-800 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
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
              <FormattedAmountInput
                pattern="[0-9]*"
                autoComplete="off"
                digits={display[key] ? String(display[key]) : ''}
                onDigitsChange={(digits) => setField(key, digits)}
                placeholder="0"
                aria-label={label}
                className={ALLOC_INPUT_CLASS}
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
