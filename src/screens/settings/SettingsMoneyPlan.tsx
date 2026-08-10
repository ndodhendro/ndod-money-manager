import { useEffect, useMemo, useState } from 'react'
import { GroupedListFrame } from '../../components/GroupedListFrame'
import { SettingsSubPage } from '../../components/SettingsSubPage'
import { SettingsIcon } from '../../lib/settingsSections'
import { useBuckets } from '../../hooks/useBuckets'
import { useCategories } from '../../hooks/useCategories'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { showAppToast } from '../../lib/appToast'
import {
  areAllCollapseOpen,
  getCollapseOpen,
  setCollapseOpen,
} from '../../lib/collapseState'
import { formatRupiah } from '../../lib/format'
import { sumPlannedNeeds } from '../../lib/freeWants'
import { currentMonthCursor, monthCursorKey } from '../../lib/monthCursor'
import {
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
} from '../../lib/recurringBillsApi'

const EF_COLLAPSE_KEY = 'settings:money-plan:emergency'
const INV_COLLAPSE_KEY = 'settings:money-plan:investment'
const SECTION_KEYS = [EF_COLLAPSE_KEY, INV_COLLAPSE_KEY]
/** Matches disabled auto-calc fields in BucketManagePanel (no native input:disabled UA overrides). */
const DISABLED_FIELD_CLASS =
  'mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm tabular-nums text-neutral-500 opacity-80 dark:bg-neutral-700 dark:text-neutral-400'

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

  const [emergencyPct, setEmergencyPct] = useState('10')
  const [investmentPct, setInvestmentPct] = useState('15')
  const [efMultiplier, setEfMultiplier] = useState('3')
  const [savingPlan, setSavingPlan] = useState(false)
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [billsLoading, setBillsLoading] = useState(true)
  const [efOpen, setEfOpen] = useState(() =>
    getCollapseOpen(EF_COLLAPSE_KEY, true),
  )
  const [invOpen, setInvOpen] = useState(() =>
    getCollapseOpen(INV_COLLAPSE_KEY, true),
  )
  const [allOpen, setAllOpen] = useState(() =>
    areAllCollapseOpen(SECTION_KEYS, true),
  )

  useEffect(() => {
    setAllOpen(efOpen && invOpen)
  }, [efOpen, invOpen])

  useEffect(() => {
    if (!settings) return
    setEmergencyPct(String(settings.emergency_fund_pct))
    setInvestmentPct(String(settings.investment_pct))
    setEfMultiplier(String(settings.emergency_fund_target_multiplier || 3))
  }, [settings])

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

  function setSectionOpen(key: string, open: boolean) {
    setCollapseOpen(key, open)
    if (key === EF_COLLAPSE_KEY) setEfOpen(open)
    if (key === INV_COLLAPSE_KEY) setInvOpen(open)
  }

  function toggleAll(open: boolean) {
    setAllOpen(open)
    setSectionOpen(EF_COLLAPSE_KEY, open)
    setSectionOpen(INV_COLLAPSE_KEY, open)
  }

  async function handleSaveMoneyPlan() {
    const emergency = Number(emergencyPct)
    const investment = Number(investmentPct)
    const multiplier = Number(efMultiplier)

    if (Number.isNaN(emergency) || Number.isNaN(investment)) {
      showAppToast('Enter valid percentages')
      return
    }
    if (emergency < 0 || investment < 0) {
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

  const pageLoading = loading || billsLoading || categoriesLoading || bucketsLoading

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
                  <label className="block">
                    <span className="text-xs text-neutral-500">
                      Monthly allocation (% of income)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.5}
                      value={emergencyPct}
                      onChange={(e) => setEmergencyPct(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
                    />
                  </label>
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
                      Emergency fund target (× monthly needs)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={24}
                      step={0.5}
                      value={efMultiplier}
                      onChange={(e) => setEfMultiplier(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
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
                label="Investment"
                collapseContent
                expanded={invOpen}
                onToggle={(open) => setSectionOpen(INV_COLLAPSE_KEY, open)}
              >
                <label className="block">
                  <span className="text-xs text-neutral-500">
                    Monthly allocation (% of income)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.5}
                    value={investmentPct}
                    onChange={(e) => setInvestmentPct(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
                  />
                </label>
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
