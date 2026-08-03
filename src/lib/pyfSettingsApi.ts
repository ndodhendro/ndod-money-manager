import { supabase } from './supabase'

export interface PyfSettings {
  id: string
  emergency_fund_pct: number
  investment_pct: number
  planned_needs_amount: number
  emergency_fund_target_multiplier: number
  effective_from: string
  created_at: string
}

export type PyfSettingsUpdate = {
  emergency_fund_pct: number
  investment_pct: number
  planned_needs_amount: number
  emergency_fund_target_multiplier: number
}

const DEFAULTS = {
  emergency_fund_pct: 10,
  investment_pct: 15,
  emergency_fund_target_multiplier: 3,
}

const PLANNED_NEEDS_LS_KEY = 'ndod_planned_needs_amount'

function readLocalPlannedNeeds(): number {
  try {
    const raw = localStorage.getItem(PLANNED_NEEDS_LS_KEY)
    if (raw == null || raw === '') return 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function writeLocalPlannedNeeds(amount: number): void {
  try {
    localStorage.setItem(PLANNED_NEEDS_LS_KEY, String(Math.round(amount)))
  } catch {
    // ignore quota / private mode
  }
}

function mapRow(row: Record<string, unknown>): PyfSettings {
  const hasColumn = Object.prototype.hasOwnProperty.call(
    row,
    'planned_needs_amount',
  )
  const fromDb = hasColumn ? Number(row.planned_needs_amount ?? 0) : NaN
  const plannedNeeds = Number.isFinite(fromDb) ? fromDb : readLocalPlannedNeeds()

  return {
    id: String(row.id),
    emergency_fund_pct: Number(row.emergency_fund_pct),
    investment_pct: Number(row.investment_pct),
    planned_needs_amount: plannedNeeds,
    emergency_fund_target_multiplier: Number(
      row.emergency_fund_target_multiplier ?? 6,
    ),
    effective_from: String(row.effective_from),
    created_at: String(row.created_at),
  }
}

function isMissingPlannedNeedsColumn(message: string): boolean {
  return (
    message.includes('planned_needs_amount') ||
    message.includes('schema cache')
  )
}

/** Ambil settings terbaru; buat baris default jika belum ada. */
export async function getPyfSettings(): Promise<PyfSettings> {
  const { data, error } = await supabase
    .from('pyf_settings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data) return mapRow(data as Record<string, unknown>)

  const { data: created, error: insertError } = await supabase
    .from('pyf_settings')
    .insert({
      emergency_fund_pct: DEFAULTS.emergency_fund_pct,
      investment_pct: DEFAULTS.investment_pct,
    })
    .select('*')
    .single()

  if (insertError) throw new Error(insertError.message)
  const mapped = mapRow(created as Record<string, unknown>)
  mapped.planned_needs_amount = readLocalPlannedNeeds()
  return mapped
}

export async function updatePyfSettings(
  id: string,
  patch: PyfSettingsUpdate,
): Promise<PyfSettings> {
  if (patch.emergency_fund_pct < 0 || patch.investment_pct < 0) {
    throw new Error('Percentages cannot be negative')
  }
  if (patch.emergency_fund_pct + patch.investment_pct > 100) {
    throw new Error('Emergency + investment cannot exceed 100%')
  }
  if (patch.planned_needs_amount < 0) {
    throw new Error('Planned needs cannot be negative')
  }
  if (patch.emergency_fund_target_multiplier < 0) {
    throw new Error('Emergency multiplier cannot be negative')
  }

  const fullPatch = {
    emergency_fund_pct: patch.emergency_fund_pct,
    investment_pct: patch.investment_pct,
    planned_needs_amount: patch.planned_needs_amount,
    emergency_fund_target_multiplier: patch.emergency_fund_target_multiplier,
  }

  const { data, error } = await supabase
    .from('pyf_settings')
    .update(fullPatch)
    .eq('id', id)
    .select('*')
    .single()

  if (!error && data) {
    writeLocalPlannedNeeds(patch.planned_needs_amount)
    return mapRow(data as Record<string, unknown>)
  }

  if (error && isMissingPlannedNeedsColumn(error.message)) {
    // Column belum dimigrasi — simpan % ke DB, planned needs ke localStorage.
    writeLocalPlannedNeeds(patch.planned_needs_amount)
    const { data: partial, error: partialError } = await supabase
      .from('pyf_settings')
      .update({
        emergency_fund_pct: patch.emergency_fund_pct,
        investment_pct: patch.investment_pct,
        emergency_fund_target_multiplier:
          patch.emergency_fund_target_multiplier,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (partialError) throw new Error(partialError.message)
    const mapped = mapRow(partial as Record<string, unknown>)
    mapped.planned_needs_amount = patch.planned_needs_amount
    return mapped
  }

  throw new Error(error?.message ?? 'Failed to save money plan')
}
