import { supabase } from './supabase'

export type AllocationInputMode = 'pct' | 'amount'

export interface PyfSettings {
  id: string
  emergency_fund_pct: number
  investment_pct: number
  /** Buffer as % of Planned Needs (monthly overspend reserve). */
  buffer_pct: number
  planned_needs_amount: number
  emergency_fund_target_multiplier: number
  emergency_mode: AllocationInputMode
  investment_mode: AllocationInputMode
  buffer_mode: AllocationInputMode
  /** Last Amount-mode value; null when that bucket is in % mode. */
  emergency_amount: number | null
  investment_amount: number | null
  buffer_amount: number | null
  effective_from: string
  created_at: string
}

export type PyfSettingsUpdate = {
  emergency_fund_pct: number
  investment_pct: number
  buffer_pct: number
  planned_needs_amount: number
  emergency_fund_target_multiplier: number
  emergency_mode: AllocationInputMode
  investment_mode: AllocationInputMode
  buffer_mode: AllocationInputMode
  emergency_amount: number | null
  investment_amount: number | null
  buffer_amount: number | null
}

const DEFAULTS = {
  emergency_fund_pct: 10,
  investment_pct: 15,
  buffer_pct: 10,
  emergency_fund_target_multiplier: 3,
}

const PLANNED_NEEDS_LS_KEY = 'ndod_planned_needs_amount'
const BUFFER_PCT_LS_KEY = 'ndod_buffer_pct'
/** Precise % + input mode. DB numeric(5,2) rounds; this keeps Amount (e.g. 250000) exact. */
const ALLOC_LS_KEY = 'ndod_money_plan_alloc'

type LocalAlloc = {
  emergency_fund_pct?: number
  investment_pct?: number
  buffer_pct?: number
  emergency_mode?: AllocationInputMode
  investment_mode?: AllocationInputMode
  buffer_mode?: AllocationInputMode
  emergency_amount?: number | null
  investment_amount?: number | null
  buffer_amount?: number | null
}

function isAllocMode(value: unknown): value is AllocationInputMode {
  return value === 'pct' || value === 'amount'
}

function readLocalAlloc(): LocalAlloc {
  try {
    const raw = localStorage.getItem(ALLOC_LS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as LocalAlloc
  } catch {
    return {}
  }
}

function writeLocalAlloc(patch: LocalAlloc): void {
  try {
    const prev = readLocalAlloc()
    localStorage.setItem(ALLOC_LS_KEY, JSON.stringify({ ...prev, ...patch }))
  } catch {
    // ignore quota / private mode
  }
}

function pickPct(local: number | undefined, fromDb: number): number {
  if (local == null || !Number.isFinite(local) || local < 0) return fromDb
  return local
}

function pickMode(local: unknown): AllocationInputMode {
  return isAllocMode(local) ? local : 'pct'
}

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

function readLocalBufferPct(): number {
  try {
    const raw = localStorage.getItem(BUFFER_PCT_LS_KEY)
    if (raw == null || raw === '') return DEFAULTS.buffer_pct
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : DEFAULTS.buffer_pct
  } catch {
    return DEFAULTS.buffer_pct
  }
}

function writeLocalBufferPct(pct: number): void {
  try {
    localStorage.setItem(BUFFER_PCT_LS_KEY, String(pct))
  } catch {
    // ignore
  }
}

function persistAllocFromPatch(patch: PyfSettingsUpdate): void {
  writeLocalAlloc({
    emergency_fund_pct: patch.emergency_fund_pct,
    investment_pct: patch.investment_pct,
    buffer_pct: patch.buffer_pct,
    emergency_mode: patch.emergency_mode,
    investment_mode: patch.investment_mode,
    buffer_mode: patch.buffer_mode,
    emergency_amount: patch.emergency_amount,
    investment_amount: patch.investment_amount,
    buffer_amount: patch.buffer_amount,
  })
}

function pickAmount(local: number | null | undefined): number | null {
  if (local == null) return null
  if (!Number.isFinite(local) || local < 0) return null
  return Math.round(local)
}

function mapRow(row: Record<string, unknown>): PyfSettings {
  const hasPlannedNeeds = Object.prototype.hasOwnProperty.call(
    row,
    'planned_needs_amount',
  )
  const fromDbNeeds = hasPlannedNeeds
    ? Number(row.planned_needs_amount ?? 0)
    : NaN
  const plannedNeeds = Number.isFinite(fromDbNeeds)
    ? fromDbNeeds
    : readLocalPlannedNeeds()

  const hasBuffer = Object.prototype.hasOwnProperty.call(row, 'buffer_pct')
  const fromDbBuffer = hasBuffer ? Number(row.buffer_pct ?? NaN) : NaN
  const fallbackBuffer = Number.isFinite(fromDbBuffer)
    ? fromDbBuffer
    : readLocalBufferPct()
  const local = readLocalAlloc()

  return {
    id: String(row.id),
    emergency_fund_pct: pickPct(
      local.emergency_fund_pct,
      Number(row.emergency_fund_pct),
    ),
    investment_pct: pickPct(local.investment_pct, Number(row.investment_pct)),
    buffer_pct: pickPct(local.buffer_pct, fallbackBuffer),
    planned_needs_amount: plannedNeeds,
    emergency_fund_target_multiplier: Number(
      row.emergency_fund_target_multiplier ?? 6,
    ),
    emergency_mode: pickMode(local.emergency_mode),
    investment_mode: pickMode(local.investment_mode),
    buffer_mode: pickMode(local.buffer_mode),
    emergency_amount: pickAmount(local.emergency_amount),
    investment_amount: pickAmount(local.investment_amount),
    buffer_amount: pickAmount(local.buffer_amount),
    effective_from: String(row.effective_from),
    created_at: String(row.created_at),
  }
}

function isMissingColumn(message: string, column: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes(column) || lower.includes('schema cache')
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
      buffer_pct: DEFAULTS.buffer_pct,
    })
    .select('*')
    .single()

  if (insertError) {
    // Older DB without buffer_pct — insert without it.
    if (isMissingColumn(insertError.message, 'buffer_pct')) {
      const retry = await supabase
        .from('pyf_settings')
        .insert({
          emergency_fund_pct: DEFAULTS.emergency_fund_pct,
          investment_pct: DEFAULTS.investment_pct,
        })
        .select('*')
        .single()
      if (retry.error) throw new Error(retry.error.message)
      const mapped = mapRow(retry.data as Record<string, unknown>)
      mapped.planned_needs_amount = readLocalPlannedNeeds()
      mapped.buffer_pct = readLocalBufferPct()
      return mapped
    }
    throw new Error(insertError.message)
  }
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
  if (patch.buffer_pct < 0) {
    throw new Error('Buffer percentage cannot be negative')
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
    buffer_pct: patch.buffer_pct,
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
    persistAllocFromPatch(patch)
    writeLocalPlannedNeeds(patch.planned_needs_amount)
    writeLocalBufferPct(patch.buffer_pct)
    return mapRow(data as Record<string, unknown>)
  }

  if (error && isMissingColumn(error.message, 'buffer_pct')) {
    persistAllocFromPatch(patch)
    writeLocalBufferPct(patch.buffer_pct)
    writeLocalPlannedNeeds(patch.planned_needs_amount)
    const withoutBuffer = {
      emergency_fund_pct: patch.emergency_fund_pct,
      investment_pct: patch.investment_pct,
      planned_needs_amount: patch.planned_needs_amount,
      emergency_fund_target_multiplier:
        patch.emergency_fund_target_multiplier,
    }
    const { data: partial, error: partialError } = await supabase
      .from('pyf_settings')
      .update(withoutBuffer)
      .eq('id', id)
      .select('*')
      .single()

    if (
      partialError &&
      isMissingColumn(partialError.message, 'planned_needs_amount')
    ) {
      const { data: pctOnly, error: pctError } = await supabase
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
      if (pctError) throw new Error(pctError.message)
      persistAllocFromPatch(patch)
      const mapped = mapRow(pctOnly as Record<string, unknown>)
      mapped.planned_needs_amount = patch.planned_needs_amount
      mapped.buffer_pct = patch.buffer_pct
      return mapped
    }

    if (partialError) throw new Error(partialError.message)
    persistAllocFromPatch(patch)
    const mapped = mapRow(partial as Record<string, unknown>)
    mapped.planned_needs_amount = patch.planned_needs_amount
    mapped.buffer_pct = patch.buffer_pct
    return mapped
  }

  if (error && isMissingColumn(error.message, 'planned_needs_amount')) {
    persistAllocFromPatch(patch)
    writeLocalPlannedNeeds(patch.planned_needs_amount)
    writeLocalBufferPct(patch.buffer_pct)
    const { data: partial, error: partialError } = await supabase
      .from('pyf_settings')
      .update({
        emergency_fund_pct: patch.emergency_fund_pct,
        investment_pct: patch.investment_pct,
        buffer_pct: patch.buffer_pct,
        emergency_fund_target_multiplier:
          patch.emergency_fund_target_multiplier,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (partialError) {
      // buffer column may also be missing
      if (isMissingColumn(partialError.message, 'buffer_pct')) {
        const { data: pctOnly, error: pctError } = await supabase
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
        if (pctError) throw new Error(pctError.message)
        const mapped = mapRow(pctOnly as Record<string, unknown>)
        mapped.planned_needs_amount = patch.planned_needs_amount
        mapped.buffer_pct = patch.buffer_pct
        return mapped
      }
      throw new Error(partialError.message)
    }
    const mapped = mapRow(partial as Record<string, unknown>)
    mapped.planned_needs_amount = patch.planned_needs_amount
    mapped.buffer_pct = patch.buffer_pct
    return mapped
  }

  throw new Error(error?.message ?? 'Failed to save money plan')
}
