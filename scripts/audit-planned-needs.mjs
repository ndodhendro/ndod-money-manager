import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const base = env.VITE_SUPABASE_URL.replace(/\/$/, '') + '/rest/v1'
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + env.VITE_SUPABASE_ANON_KEY,
  Accept: 'application/json',
}

async function get(path) {
  const res = await fetch(base + path, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(path + ' ' + res.status + ' ' + text)
  return JSON.parse(text)
}

function yearMonthIndex(yearMonth) {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!m) return null
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}

function lastDayOfYearMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${yearMonth}-${String(d).padStart(2, '0')}`
}

function clampDueDay(yearMonth, dueDay) {
  const [y, m] = yearMonth.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return Math.min(Math.max(1, dueDay), last)
}

function recurringOccurredOn(yearMonth, dueDay) {
  return `${yearMonth}-${String(clampDueDay(yearMonth, dueDay)).padStart(2, '0')}`
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function daysBetweenIso(from, to) {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return Math.round((b - a) / 86400000)
}

function yearMonthFromIso(iso) {
  return iso.slice(0, 7)
}

function isOnIntervalGrid(yearMonth, startsYearMonth, intervalMonths) {
  const interval = Math.max(1, Math.round(Number(intervalMonths) || 1))
  if (interval <= 1) return true
  if (!startsYearMonth) return false
  const startIdx = yearMonthIndex(startsYearMonth)
  const monthIdx = yearMonthIndex(yearMonth)
  if (startIdx == null || monthIdx == null) return false
  const diff = monthIdx - startIdx
  return diff >= 0 && diff % interval === 0
}

function occurrencesInMonth(bill, yearMonth, override) {
  if (!bill.is_recurring) return []
  if (bill.starts_year_month && bill.starts_year_month > yearMonth) return []
  if (bill.ends_year_month && bill.ends_year_month < yearMonth) return []

  if (bill.interval_unit === 'week') {
    const startsOn = bill.starts_on
    if (!startsOn) return []
    const stepDays = Math.max(1, Number(bill.interval_months) || 1) * 7
    const monthStart = `${yearMonth}-01`
    const monthEnd = lastDayOfYearMonth(yearMonth)
    let cursor = startsOn
    if (cursor < monthStart) {
      const diff = daysBetweenIso(startsOn, monthStart)
      const steps = Math.ceil(diff / stepDays)
      cursor = addDaysIso(startsOn, steps * stepDays)
    }
    const dates = []
    for (let d = cursor; d <= monthEnd; d = addDaysIso(d, stepDays)) {
      if (d < startsOn) continue
      if (yearMonthFromIso(d) !== yearMonth) break
      dates.push(d)
    }
    return dates
  }

  if (!isOnIntervalGrid(yearMonth, bill.starts_year_month, bill.interval_months)) {
    return []
  }
  const dueDay =
    override?.due_day != null && override.due_day >= 1 && override.due_day <= 31
      ? override.due_day
      : bill.due_day
  return [recurringOccurredOn(yearMonth, dueDay)]
}

function estimateOccurrenceCount(bill, yearMonth, override, skipKeys) {
  if (!bill.is_active) return 0
  if (override?.skipped === true) return 0
  if (!bill.is_recurring) return 1
  let count = 0
  for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
    if (skipKeys.has(`${bill.id}:${occurredOn}`)) continue
    count += 1
  }
  return count
}

function effectiveAmount(bill, override) {
  if (override?.amount != null && Number(override.amount) > 0) {
    return Number(override.amount)
  }
  return Number(bill.amount)
}

function budgetGroupOfCategory(categoryId, catById) {
  if (!categoryId) return null
  const cat = catById.get(categoryId)
  if (!cat) return null
  if (cat.budget_group) return cat.budget_group
  if (cat.parent_id) return catById.get(cat.parent_id)?.budget_group ?? null
  return null
}

function budgetGroupOfTransferTo(toId, bucketById) {
  if (!toId) return null
  const b = bucketById.get(toId)
  if (!b || b.kind !== 'sinking') return null
  if (b.budget_group === 'needs' || b.budget_group === 'wants') return b.budget_group
  return null
}

function mapBill(row) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    amount: Number(row.amount),
    type:
      row.type === 'income' || row.type === 'transfer' || row.type === 'expense'
        ? row.type
        : 'expense',
    category_id: row.category_id ?? null,
    from_bucket_id: row.from_bucket_id ?? null,
    to_bucket_id: row.to_bucket_id ?? null,
    due_day: Number(row.due_day ?? 1) || 1,
    interval_unit: row.interval_unit === 'week' ? 'week' : 'month',
    interval_months: Number(row.interval_months ?? 1) || 1,
    starts_year_month: typeof row.starts_year_month === 'string' ? row.starts_year_month : null,
    ends_year_month: typeof row.ends_year_month === 'string' ? row.ends_year_month : null,
    starts_on: typeof row.starts_on === 'string' ? row.starts_on : null,
    is_recurring: row.is_recurring === false ? false : true,
    is_active: Boolean(row.is_active),
  }
}

const ym = process.argv[2] && /^\d{4}-\d{2}$/.test(process.argv[2])
  ? process.argv[2]
  : new Date().toISOString().slice(0, 7)

const [billRows, cats, buckets, overrides, skips, settings] = await Promise.all([
  get('/recurring_bills?order=sort_order.asc&select=*'),
  get('/categories?select=id,name,type,budget_group,parent_id,is_active'),
  get('/buckets?select=id,name,kind,budget_group,is_active,is_system,target_amount'),
  get(`/recurring_bill_month_overrides?year_month=eq.${ym}&select=*`),
  get(`/recurring_bill_occurrence_skips?year_month=eq.${ym}&select=*`),
  get('/pyf_settings?select=*'),
])

const bills = billRows.map(mapBill)
const catById = new Map(cats.map((c) => [c.id, c]))
const bucketById = new Map(buckets.map((b) => [b.id, b]))
const overrideByBill = new Map(overrides.map((o) => [o.bill_id, o]))
const skipKeys = new Set(skips.map((s) => `${s.bill_id}:${s.occurred_on}`))

const lines = []
let plannedNeeds = 0
let committedWants = 0

for (const bill of bills) {
  const override = overrideByBill.get(bill.id) ?? null
  let group = null
  let label = ''
  if (bill.type === 'expense') {
    group = budgetGroupOfCategory(bill.category_id, catById)
    const cat = bill.category_id ? catById.get(bill.category_id) : null
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : null
    label = cat ? `${parent ? parent.name + '/' : ''}${cat.name}` : 'NO_CATEGORY'
  } else if (bill.type === 'transfer') {
    group = budgetGroupOfTransferTo(bill.to_bucket_id, bucketById)
    const from = bill.from_bucket_id
      ? bucketById.get(bill.from_bucket_id)?.name
      : 'Main Account'
    const toB = bill.to_bucket_id ? bucketById.get(bill.to_bucket_id) : null
    const to = toB?.name ?? 'Main Account'
    label = `${from} → ${to} [${toB?.kind ?? '?'}/${toB?.budget_group ?? 'null'}]`
  } else {
    label = 'income'
  }

  const count = estimateOccurrenceCount(bill, ym, override, skipKeys)
  const amount = effectiveAmount(bill, override)
  const contrib = amount * count
  const inNeeds = bill.is_active && group === 'needs' && count > 0
  const inWants = bill.is_active && group === 'wants' && count > 0
  if (inNeeds) plannedNeeds += contrib
  if (inWants) committedWants += contrib

  lines.push({
    bill,
    group,
    label,
    count,
    amount,
    contrib,
    inNeeds,
    inWants,
    override,
    occ: bill.is_recurring ? occurrencesInMonth(bill, ym, override) : ['(estimate-only → count 1)'],
  })
}

const out = []
function log(s = '') {
  console.log(s)
  out.push(s)
}

log(`Month: ${ym}`)
log('PYF settings: ' + JSON.stringify(settings))
log('')
log('Buckets:')
for (const b of buckets) {
  log(
    `  ${b.kind.padEnd(11)} ${String(b.budget_group ?? '-').padEnd(8)} active=${b.is_active} ${b.name}`,
  )
}

log(`\nBills (${bills.length}):`)
for (const r of lines) {
  const flag = !r.bill.is_active
    ? 'INACT'
    : r.inNeeds
      ? 'NEEDS'
      : r.inWants
        ? 'WANTS'
        : '---- '
  log(
    [
      flag,
      String(r.contrib).padStart(12),
      `x${r.count}`,
      String(r.amount).padStart(10),
      r.bill.type.padEnd(8),
      String(r.group ?? '-').padEnd(8),
      `rec=${r.bill.is_recurring}`,
      `every=${r.bill.interval_months}${r.bill.interval_unit[0]}`,
      `due=${r.bill.due_day}`,
      `start=${r.bill.starts_year_month ?? r.bill.starts_on ?? '-'}`,
      `end=${r.bill.ends_year_month ?? '-'}`,
      r.bill.name,
      '|',
      r.label,
      '| occ=' + JSON.stringify(r.occ),
    ].join(' '),
  )
}

log('\n=== PLANNED NEEDS included ===')
for (const r of lines.filter((r) => r.inNeeds)) {
  log(
    `  ${String(r.contrib).padStart(12)}  ${r.bill.name}  (${r.bill.type} x${r.count})  ${r.label}`,
  )
}
log(`TOTAL PLANNED NEEDS = ${plannedNeeds}`)

log('\n=== NEEDS-tagged but excluded this month ===')
for (const r of lines.filter(
  (r) => r.bill.is_active && r.group === 'needs' && !r.inNeeds,
)) {
  log(
    `  ${r.amount}  ${r.bill.name}  count=${r.count} rec=${r.bill.is_recurring} every=${r.bill.interval_months}${r.bill.interval_unit[0]} start=${r.bill.starts_year_month ?? r.bill.starts_on ?? '-'} end=${r.bill.ends_year_month ?? '-'} occ=${JSON.stringify(r.occ)} override=${JSON.stringify(r.override)}`,
  )
}

log('\n=== Transfers ===')
for (const r of lines.filter((r) => r.bill.type === 'transfer')) {
  log(
    `  active=${r.bill.is_active} group=${r.group ?? 'null'} amount=${r.amount} count=${r.count} inNeeds=${r.inNeeds} ${r.bill.name} | ${r.label}`,
  )
}

log(`\nCOMMITTED WANTS = ${committedWants}`)
log('\nOverrides: ' + JSON.stringify(overrides, null, 2))
log('Skips: ' + JSON.stringify(skips, null, 2))

// Naive sums people often expect
const naiveNeedsExpense = lines
  .filter((r) => r.bill.is_active && r.bill.type === 'expense' && r.group === 'needs')
  .reduce((s, r) => s + r.amount, 0)
const naiveNeedsTransfer = lines
  .filter((r) => r.bill.is_active && r.bill.type === 'transfer' && r.group === 'needs')
  .reduce((s, r) => s + r.amount, 0)
log('\n=== Naive sum (ignore schedule/count) ===')
log(`  needs expense amounts = ${naiveNeedsExpense}`)
log(`  needs transfer amounts = ${naiveNeedsTransfer}`)
log(`  naive total = ${naiveNeedsExpense + naiveNeedsTransfer}`)
log(`  app planned needs = ${plannedNeeds}`)
log(`  delta (naive - app) = ${naiveNeedsExpense + naiveNeedsTransfer - plannedNeeds}`)

writeFileSync('scripts/audit-planned-needs-out.txt', out.join('\n'), 'utf8')
console.log('\nWrote scripts/audit-planned-needs-out.txt')
