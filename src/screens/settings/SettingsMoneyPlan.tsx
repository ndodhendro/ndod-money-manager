import { useEffect, useMemo, useState } from 'react'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { SettingsSubPage } from '../../components/SettingsSubPage'
import { SettingsIcon } from '../../lib/settingsSections'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { useTransactions } from '../../hooks/useTransactions'
import { showAppToast } from '../../lib/appToast'
import {
  areAllCollapseOpen,
  getCollapseOpen,
  setCollapseOpen,
} from '../../lib/collapseState'
import { formatNumber, formatRupiah } from '../../lib/format'
import { sumPlannedNeeds } from '../../lib/freeWants'
import {
  currentMonthCursor,
  monthCursorKey,
  monthCursorRange,
} from '../../lib/monthCursor'
import {
  pyfTransferTargetAmount,
  sumMonthRegularIncome,
} from '../../lib/moneyPlan'
import {
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
} from '../../lib/recurringBillsApi'

const EF_COLLAPSE_KEY = 'settings:money-plan:emergency'
const INV_COLLAPSE_KEY = 'settings:money-plan:investment'
const BUFFER_COLLAPSE_KEY = 'settings:money-plan:buffer'
const SECTION_KEYS = [EF_COLLAPSE_KEY, INV_COLLAPSE_KEY, BUFFER_COLLAPSE_KEY]
/** Matches disabled auto-calc fields in BucketManagePanel (no native input:disabled UA overrides). */
const DISABLED_FIELD_CLASS =
  'mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm tabular-nums text-neutral-500 opacity-80 dark:bg-neutral-700 dark:text-neutral-400'

const INPUT_CLASS =
  'mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100'

type AllocationMode = 'pct' | 'amount'
type AllocationKind = 'emergency' | 'investment' | 'buffer'

function amountToPctString(amount: number, base: number): string {
  if (base <= 0) return '0'
  const pct = Math.round((Math.max(0, amount) / base) * 10000) / 100
  return String(pct)
}

function bufferTargetAmount(plannedNeeds: number, bufferPct: number): number {
  return Math.round(
    (Math.max(0, plannedNeeds) * Math.max(0, bufferPct)) / 100,
  )
}

function AllocationModeToggle({
  mode,
  amountDisabled,
  onSelect,
}: {
  mode: AllocationMode
  amountDisabled: boolean
  onSelect: (mode: AllocationMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Allocation input mode"
      className="inline-flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-700"
    >
      <button
        type="button"
        aria-pressed={mode === 'pct'}
        onClick={() => onSelect('pct')}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
          mode === 'pct'
            ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-neutral-50'
            : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        %
      </button>
      <button
        type="button"
        aria-pressed={mode === 'amount'}
        disabled={amountDisabled}
        onClick={() => onSelect('amount')}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
          mode === 'amount'
            ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-neutral-50'
            : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        Amount
      </button>
    </div>
  )
}

function MonthlyAllocationField({
  kind,
  mode,
  pct,
  amountDigits,
  monthIncome,
  plannedNeeds,
  emergencyPct,
  investmentPct,
  onModeSelect,
  onPctChange,
  onAmountDigitsChange,
}: {
  kind: AllocationKind
  mode: AllocationMode
  pct: string
  amountDigits: string
  monthIncome: number
  plannedNeeds: number
  emergencyPct: string
  investmentPct: string
  onModeSelect: (mode: AllocationMode) => void
  onPctChange: (value: string) => void
  onAmountDigitsChange: (digits: string) => void
}) {
  const isBuffer = kind === 'buffer'
  const baseAmount = isBuffer ? plannedNeeds : monthIncome
  const amountDisabled = baseAmount <= 0
  const label = isBuffer
    ? mode === 'pct'
      ? 'Buffer (% of Planned Needs)'
      : 'Buffer (Amount)'
    : mode === 'pct'
      ? 'Monthly Allocation (% of Income)'
      : 'Monthly Allocation (Amount)'

  const resolvedAmount = isBuffer
    ? bufferTargetAmount(plannedNeeds, Number(pct) || 0)
    : pyfTransferTargetAmount(
        kind === 'emergency' ? 'emergency' : 'investment',
        monthIncome,
        Number(emergencyPct) || 0,
        Number(investmentPct) || 0,
      )

  return (
    <div className="block space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">{label}</span>
        <AllocationModeToggle
          mode={mode}
          amountDisabled={amountDisabled}
          onSelect={onModeSelect}
        />
      </div>
      {mode === 'pct' ? (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={isBuffer ? 1 : 0.5}
          value={pct}
          onChange={(e) => onPctChange(e.target.value)}
          className={INPUT_CLASS}
          aria-label={label}
        />
      ) : (
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={amountDigits ? formatNumber(Number(amountDigits)) : ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
            onAmountDigitsChange(digits)
          }}
          className={INPUT_CLASS}
          aria-label={label}
        />
      )}
      <span className="block text-[11px] text-neutral-400">
        {amountDisabled
          ? isBuffer
            ? 'Add planned needs to use Amount mode.'
            : 'Add income this month to use Amount mode.'
          : mode === 'amount'
            ? isBuffer
              ? `Based on planned needs (${formatRupiah(plannedNeeds)}). Saves as ${pct || '0'}%.`
              : `Based on this month's income (${formatRupiah(monthIncome)}). Saves as ${pct || '0'}%.`
            : isBuffer
              ? `Planned needs: ${formatRupiah(plannedNeeds)}${
                  Number(pct) > 0 ? ` → ${formatRupiah(resolvedAmount)}` : ''
                }. Monthly overspend reserve before Guilt-Free Fund.`
              : `This month's income: ${formatRupiah(monthIncome)}${
                  Number(pct) > 0 ? ` → ${formatRupiah(resolvedAmount)}` : ''
                }`}
      </span>
    </div>
  )
}

export function SettingsMoneyPlan() {
  const { settings, loading, error, save } = usePyfSettings()
  const {
    byId: categoriesById,
    loading: categoriesLoading,
  } = useCategories('expense', { includeInactive: true })
  const {
    byId: bucketsById,
    loading: bucketsLoading,
  } = useBuckets()

  const monthRange = useMemo(
    () => monthCursorRange(currentMonthCursor()),
    [],
  )
  const {
    transactions: monthTransactions,
    loading: transactionsLoading,
  } = useTransactions(monthRange)
  const monthIncome = useMemo(
    () => sumMonthRegularIncome(monthTransactions),
    [monthTransactions],
  )

  const [emergencyPct, setEmergencyPct] = useState('10')
  const [investmentPct, setInvestmentPct] = useState('15')
  const [bufferPct, setBufferPct] = useState('10')
  const [efMultiplier, setEfMultiplier] = useState('3')
  const [efMode, setEfMode] = useState<AllocationMode>('pct')
  const [invMode, setInvMode] = useState<AllocationMode>('pct')
  const [bufferMode, setBufferMode] = useState<AllocationMode>('pct')
  const [efAmountDigits, setEfAmountDigits] = useState('')
  const [invAmountDigits, setInvAmountDigits] = useState('')
  const [bufferAmountDigits, setBufferAmountDigits] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [billsLoading, setBillsLoading] = useState(true)
  const [efOpen, setEfOpen] = useState(() =>
    getCollapseOpen(EF_COLLAPSE_KEY, true),
  )
  const [invOpen, setInvOpen] = useState(() =>
    getCollapseOpen(INV_COLLAPSE_KEY, true),
  )
  const [bufferOpen, setBufferOpen] = useState(() =>
    getCollapseOpen(BUFFER_COLLAPSE_KEY, true),
  )
  const [allOpen, setAllOpen] = useState(() =>
    areAllCollapseOpen(SECTION_KEYS, true),
  )

  useEffect(() => {
    setAllOpen(efOpen && invOpen && bufferOpen)
  }, [efOpen, invOpen, bufferOpen])

  useEffect(() => {
    if (!settings) return
    setEmergencyPct(String(settings.emergency_fund_pct))
    setInvestmentPct(String(settings.investment_pct))
    setBufferPct(String(settings.buffer_pct ?? 10))
    setEfMultiplier(String(settings.emergency_fund_target_multiplier || 3))
  }, [settings])

  useEffect(() => {
    if (monthIncome > 0) return
    if (efMode === 'amount') setEfMode('pct')
    if (invMode === 'amount') setInvMode('pct')
  }, [monthIncome, efMode, invMode])

  useEffect(() => {
    let cancelled = false
    setBillsLoading(true)
    void (async () => {
      try {
        const rows = await fetchRecurringBills()
        if (!cancelled) setBills(rows)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        if (isMissingRecurringSchema(message)) {
          setBills([])
        }
      } finally {
        if (!cancelled) setBillsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const viewYm = monthCursorKey(currentMonthCursor())
  const plannedNeeds = useMemo(
    () =>
      sumPlannedNeeds(
        bills,
        new Map(),
        categoriesById,
        viewYm,
        undefined,
        bucketsById,
      ),
    [bills, categoriesById, bucketsById, viewYm],
  )

  useEffect(() => {
    if (plannedNeeds > 0) return
    if (bufferMode === 'amount') setBufferMode('pct')
  }, [plannedNeeds, bufferMode])

  function setSectionOpen(key: string, open: boolean) {
    setCollapseOpen(key, open)
    if (key === EF_COLLAPSE_KEY) setEfOpen(open)
    if (key === INV_COLLAPSE_KEY) setInvOpen(open)
    if (key === BUFFER_COLLAPSE_KEY) setBufferOpen(open)
  }

  function toggleAll(open: boolean) {
    setAllOpen(open)
    setSectionOpen(EF_COLLAPSE_KEY, open)
    setSectionOpen(INV_COLLAPSE_KEY, open)
    setSectionOpen(BUFFER_COLLAPSE_KEY, open)
  }

  function selectAllocationMode(kind: AllocationKind, mode: AllocationMode) {
    if (kind === 'buffer') {
      if (mode === 'amount' && plannedNeeds <= 0) {
        showAppToast('Add planned needs to use Amount')
        return
      }
      if (mode === 'amount') {
        const amount = bufferTargetAmount(plannedNeeds, Number(bufferPct) || 0)
        setBufferAmountDigits(amount > 0 ? String(amount) : '')
      }
      setBufferMode(mode)
      return
    }

    if (mode === 'amount' && monthIncome <= 0) {
      showAppToast('Add income this month to use Amount')
      return
    }
    if (mode === 'amount') {
      const amount = pyfTransferTargetAmount(
        kind,
        monthIncome,
        Number(emergencyPct) || 0,
        Number(investmentPct) || 0,
      )
      const digits = amount > 0 ? String(amount) : ''
      if (kind === 'emergency') setEfAmountDigits(digits)
      else setInvAmountDigits(digits)
    }
    if (kind === 'emergency') setEfMode(mode)
    else setInvMode(mode)
  }

  function handleAmountDigitsChange(kind: AllocationKind, digits: string) {
    if (kind === 'buffer') {
      setBufferAmountDigits(digits)
      setBufferPct(amountToPctString(Number(digits) || 0, plannedNeeds))
      return
    }
    if (kind === 'emergency') setEfAmountDigits(digits)
    else setInvAmountDigits(digits)
    const nextPct = amountToPctString(Number(digits) || 0, monthIncome)
    if (kind === 'emergency') setEmergencyPct(nextPct)
    else setInvestmentPct(nextPct)
  }

  async function handleSaveMoneyPlan() {
    const emergency = Number(emergencyPct)
    const investment = Number(investmentPct)
    const buffer = Number(bufferPct)
    const multiplier = Number(efMultiplier)

    if (
      Number.isNaN(emergency) ||
      Number.isNaN(investment) ||
      Number.isNaN(buffer)
    ) {
      showAppToast('Enter valid percentages')
      return
    }
    if (emergency < 0 || investment < 0 || buffer < 0) {
      showAppToast('Percentages cannot be negative')
      return
    }
    if (emergency + investment > 100) {
      showAppToast('Emergency + investment cannot exceed 100%')
      return
    }
    if (Number.isNaN(multiplier) || multiplier < 0) {
      showAppToast('Enter a valid emergency multiplier')
      return
    }

    setSavingPlan(true)
    try {
      await save({
        emergency_fund_pct: emergency,
        investment_pct: investment,
        buffer_pct: buffer,
        planned_needs_amount: plannedNeeds,
        emergency_fund_target_multiplier: multiplier,
      })
      showAppToast('Money plan saved')
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingPlan(false)
    }
  }

  const pageLoading =
    loading ||
    billsLoading ||
    categoriesLoading ||
    bucketsLoading ||
    transactionsLoading

  return (
    <SettingsSubPage
      title="Money Plan"
      icon={SettingsIcon.moneyPlan}
      description=""
    >
      {pageLoading && (
        <p className="text-sm text-neutral-400">Loading…</p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!pageLoading && settings && (
        <div className="space-y-5">
          <GroupedListFrame
            label="Money Plan"
            expanded={allOpen}
            onToggle={toggleAll}
          >
            <div className="space-y-5">
              <GroupedListFrame
                label="Emergency Fund"
                collapseContent
                expanded={efOpen}
                onToggle={(open) => setSectionOpen(EF_COLLAPSE_KEY, open)}
              >
                <div className="space-y-3">
                  <MonthlyAllocationField
                    kind="emergency"
                    mode={efMode}
                    pct={emergencyPct}
                    amountDigits={efAmountDigits}
                    monthIncome={monthIncome}
                    plannedNeeds={plannedNeeds}
                    emergencyPct={emergencyPct}
                    investmentPct={investmentPct}
                    onModeSelect={(mode) =>
                      selectAllocationMode('emergency', mode)
                    }
                    onPctChange={setEmergencyPct}
                    onAmountDigitsChange={(digits) =>
                      handleAmountDigitsChange('emergency', digits)
                    }
                  />
                  <div className="block">
                    <span className="text-xs text-neutral-500">
                      Planned Needs (Monthly)
                    </span>
                    <div
                      aria-label="Planned Needs (Monthly) (auto-calculated)"
                      className={DISABLED_FIELD_CLASS}
                    >
                      {formatRupiah(plannedNeeds)}
                    </div>
                    <span className="mt-1 block text-[11px] text-neutral-400">
                      Includes both Needs expenses (non-recurring, weekly /
                      every 2 weeks, or monthly) and transfers into Needs
                      sinking funds. Multi-month Needs expenses (e.g. yearly
                      tax) are excluded — covered by sinking transfers.
                      Emergency Fund and Investment transfers use Money Plan %
                      separately and are not included here.
                    </span>
                  </div>
                  <label className="block">
                    <span className="text-xs text-neutral-500">
                      Emergency Fund Target (× Monthly Needs)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={24}
                      step={0.5}
                      value={efMultiplier}
                      onChange={(e) => setEfMultiplier(e.target.value)}
                      className={INPUT_CLASS}
                    />
                    <span className="mt-1 block text-[11px] text-neutral-400">
                      Common range: 3–6×. When the Emergency bucket reaches
                      this, consider lowering the monthly %.
                    </span>
                  </label>
                  <div className="block">
                    <span className="text-xs text-neutral-500">
                      Emergency Fund Goal
                    </span>
                    <div
                      aria-label="Emergency Fund Goal (auto-calculated)"
                      className={DISABLED_FIELD_CLASS}
                    >
                      {formatRupiah(
                        Math.max(0, plannedNeeds) *
                          Math.max(0, Number(efMultiplier) || 0),
                      )}
                    </div>
                    <span className="mt-1 block text-[11px] text-neutral-400">
                      Auto-set as the Emergency Fund bucket target (planned
                      needs × multiplier).
                    </span>
                  </div>
                </div>
              </GroupedListFrame>

              <GroupedListFrame
                label="Buffer"
                collapseContent
                expanded={bufferOpen}
                onToggle={(open) => setSectionOpen(BUFFER_COLLAPSE_KEY, open)}
              >
                <MonthlyAllocationField
                  kind="buffer"
                  mode={bufferMode}
                  pct={bufferPct}
                  amountDigits={bufferAmountDigits}
                  monthIncome={monthIncome}
                  plannedNeeds={plannedNeeds}
                  emergencyPct={emergencyPct}
                  investmentPct={investmentPct}
                  onModeSelect={(mode) =>
                    selectAllocationMode('buffer', mode)
                  }
                  onPctChange={setBufferPct}
                  onAmountDigitsChange={(digits) =>
                    handleAmountDigitsChange('buffer', digits)
                  }
                />
              </GroupedListFrame>

              <GroupedListFrame
                label="Investment"
                collapseContent
                expanded={invOpen}
                onToggle={(open) => setSectionOpen(INV_COLLAPSE_KEY, open)}
              >
                <MonthlyAllocationField
                  kind="investment"
                  mode={invMode}
                  pct={investmentPct}
                  amountDigits={invAmountDigits}
                  monthIncome={monthIncome}
                  plannedNeeds={plannedNeeds}
                  emergencyPct={emergencyPct}
                  investmentPct={investmentPct}
                  onModeSelect={(mode) =>
                    selectAllocationMode('investment', mode)
                  }
                  onPctChange={setInvestmentPct}
                  onAmountDigitsChange={(digits) =>
                    handleAmountDigitsChange('investment', digits)
                  }
                />
              </GroupedListFrame>
            </div>
          </GroupedListFrame>

          <button
            type="button"
            onClick={() => void handleSaveMoneyPlan()}
            disabled={savingPlan}
            className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {savingPlan ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SettingsSubPage>
  )
}
