export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** TradingView candle green (#26a69a) — income / positive. */
export const AMOUNT_IN_CLASS = 'text-tv-green'

/** TradingView candle red (#ef5350) — expense / negative. */
export const AMOUNT_OUT_CLASS = 'text-tv-red'

export function amountToneClass(positive: boolean): string {
  return positive ? AMOUNT_IN_CLASS : AMOUNT_OUT_CLASS
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount)
}

/** User-facing percentage: always 2 decimal places (e.g. 12.50). */
export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '0.00'
  return value.toFixed(2)
}

/** User-facing percentage with a % suffix (e.g. 12.50%). */
export function formatPctLabel(value: number): string {
  return `${formatPct(value)}%`
}

/** Allow empty / in-progress typing, at most 2 fraction digits. */
export function isAllowedPctInput(raw: string): boolean {
  return raw === '' || /^\d*(?:\.\d{0,2})?$/.test(raw)
}

export function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 10)
}

export function formatDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  const today = todayIso()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayIso = new Date(
    yesterday.getTime() - yesterday.getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 10)

  const withDay = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  const capitalized = withDay.charAt(0).toUpperCase() + withDay.slice(1)

  if (isoDate === today) return `Today · ${capitalized}`
  if (isoDate === yesterdayIso) return `Yesterday · ${capitalized}`
  return capitalized
}

export function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  return monthRange(now.getFullYear(), now.getMonth())
}

export function currentMonthLabel(): string {
  const now = new Date()
  return formatMonthLabel(now.getFullYear(), now.getMonth())
}

/** monthIndex: 0 = Januari */
export function monthRange(
  year: number,
  monthIndex: number,
): { start: string; end: string } {
  const start = new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)
  const toIso = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10)
  return { start: toIso(start), end: toIso(end) }
}

export function formatMonthLabel(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1))
}

/** YYYY-MM → "August 2027" */
export function formatYearMonthLabel(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!match) return yearMonth
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return yearMonth
  return formatMonthLabel(year, monthIndex)
}
