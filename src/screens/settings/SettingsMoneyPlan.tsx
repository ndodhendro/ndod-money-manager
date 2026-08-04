import { useEffect, useState } from 'react'
import { SettingsSubPage } from '../../components/SettingsSubPage'
import { usePyfSettings } from '../../hooks/usePyfSettings'
import { showAppToast } from '../../lib/appToast'
import { formatNumber, formatRupiah } from '../../lib/format'

export function SettingsMoneyPlan() {
  const { settings, loading, error, save } = usePyfSettings()

  const [emergencyPct, setEmergencyPct] = useState('10')
  const [investmentPct, setInvestmentPct] = useState('15')
  const [plannedNeedsDigits, setPlannedNeedsDigits] = useState('')
  const [efMultiplier, setEfMultiplier] = useState('3')
  const [savingPlan, setSavingPlan] = useState(false)

  useEffect(() => {
    if (!settings) return
    setEmergencyPct(String(settings.emergency_fund_pct))
    setInvestmentPct(String(settings.investment_pct))
    setPlannedNeedsDigits(
      settings.planned_needs_amount > 0
        ? String(Math.round(settings.planned_needs_amount))
        : '',
    )
    setEfMultiplier(String(settings.emergency_fund_target_multiplier || 3))
  }, [settings])

  async function handleSaveMoneyPlan() {
    const emergency = Number(emergencyPct)
    const investment = Number(investmentPct)
    const plannedNeeds = plannedNeedsDigits ? Number(plannedNeedsDigits) : 0
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

  const plannedNeedsPreview = plannedNeedsDigits
    ? Number(plannedNeedsDigits)
    : 0

  return (
    <SettingsSubPage
      title="Money Plan"
      description=""
    >
      <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
        {loading && (
          <p className="text-sm text-neutral-400">Loading…</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && settings && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-neutral-500">
                Emergency fund (% of income each month)
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
            <label className="block">
              <span className="text-xs text-neutral-500">
                Investment (% of income each month)
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
            <label className="block">
              <span className="text-xs text-neutral-500">
                Planned needs (monthly)
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 15000000"
                value={
                  plannedNeedsDigits
                    ? formatNumber(Number(plannedNeedsDigits))
                    : ''
                }
                onChange={(e) =>
                  setPlannedNeedsDigits(e.target.value.replace(/\D/g, ''))
                }
                className="mt-1 w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
              />
              {plannedNeedsPreview > 0 && (
                <span className="mt-1 block text-[11px] text-neutral-400">
                  {formatRupiah(plannedNeedsPreview)}
                </span>
              )}
            </label>
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
                Common range: 3–6×. When the Emergency bucket reaches this,
                consider lowering the monthly %.
              </span>
            </label>
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
      </div>
    </SettingsSubPage>
  )
}
