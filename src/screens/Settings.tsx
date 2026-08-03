import { useEffect, useState } from 'react'
import { RecurringBillsPanel } from '../components/RecurringBillsPanel'
import { BucketManagePanel } from '../components/BucketManagePanel'
import { CategoryManagePanel } from '../components/CategoryManagePanel'
import { OwnerBadge } from '../components/OwnerBadge'
import { PageTitle } from '../components/PageTitle'
import { usePyfSettings } from '../hooks/usePyfSettings'
import { showAppToast } from '../lib/appToast'
import { APP_VERSION } from '../lib/branding'
import { formatNumber, formatRupiah } from '../lib/format'
import { clearStoredProfile, getStoredProfile } from '../lib/profile'
import type { CategoryType } from '../lib/types'

interface SettingsProps {
  onProfileReset: () => void
}

export function Settings({ onProfileReset }: SettingsProps) {
  const profile = getStoredProfile()
  const [manageType, setManageType] = useState<CategoryType>('expense')
  const { settings, loading: planLoading, error: planError, save } =
    usePyfSettings()

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

  function handleChangeProfile() {
    if (!confirm('Change profile on this phone?')) return
    clearStoredProfile()
    onProfileReset()
  }

  async function handleSaveMoneyPlan() {
    const emergency = Number(emergencyPct)
    const investment = Number(investmentPct)
    const plannedNeeds = plannedNeedsDigits
      ? Number(plannedNeedsDigits)
      : 0
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
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <PageTitle>Settings</PageTitle>

      <div className="mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          This phone&apos;s profile
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {profile ? <OwnerBadge owner={profile} size="md" /> : 'Not selected'}
        </p>
        <button
          type="button"
          onClick={handleChangeProfile}
          className="mt-3 w-full rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100"
        >
          Change Profile
        </button>
      </div>

      <div className="mt-6 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Money Plan
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Pay yourself first via Transfer into buckets. Wants budget is income
          minus savings % and planned needs.
        </p>

        {planLoading && (
          <p className="mt-3 text-sm text-neutral-400">Loading…</p>
        )}
        {planError && (
          <p className="mt-3 text-sm text-red-500">{planError}</p>
        )}

        {!planLoading && settings && (
          <div className="mt-3 space-y-3">
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
              {savingPlan ? 'Saving…' : 'Save Money Plan'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Recurring bills
        </p>
        <p className="mb-2 text-xs text-neutral-500">
          Templates for the Due this month checklist on Plan (mortgage, parents,
          insurance, etc.).
        </p>
        <RecurringBillsPanel />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Savings buckets
        </p>
        <p className="mb-2 text-xs text-neutral-500">
          Emergency, Investment, and sinking funds. Move money with Transfer in
          Quick Add. Set opening balance if you already have savings.
        </p>
        <BucketManagePanel />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Manage categories
        </p>
        <CategoryManagePanel
          type={manageType}
          allowTypeChange
          onTypeChange={setManageType}
          onChanged={() => {}}
        />
      </div>

      <div className="mt-10 pb-2 text-center text-xs text-neutral-400 dark:text-neutral-500">
        <p>Made by Ndod ❤️</p>
        <p className="mt-1">v{APP_VERSION}</p>
      </div>
    </div>
  )
}
