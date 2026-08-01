import { useEffect, useMemo, useState } from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import { todayIso } from '../lib/format'
import { dismissNumericKeyboard } from '../lib/keyboardFocus'

interface DatePickerFieldProps {
  value: string
  onChange: (isoDate: string) => void
  /** Dipanggil setelah Cancel atau Set (sheet tutup). Reset tidak memanggil ini. */
  onFinished?: () => void
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

function toIso(y: number, m: number, d: number): string {
  const dt = new Date(y, m, d)
  const offset = dt.getTimezoneOffset()
  return new Date(dt.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

/** Senin = 0 … Minggu = 6 */
function mondayFirstIndex(y: number, m: number): number {
  const sundayBased = new Date(y, m, 1).getDay()
  return (sundayBased + 6) % 7
}

function monthTitle(y: number, m: number): string {
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m, 1))
}

/** Akhir bulan berjalan — batas maksimal tanggal yang boleh dipilih. */
function endOfCurrentMonthIso(): string {
  const now = new Date()
  return toIso(
    now.getFullYear(),
    now.getMonth(),
    daysInMonth(now.getFullYear(), now.getMonth()),
  )
}

function shortDateWithWeekday(iso: string): string {
  const formatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T00:00:00`))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function yesterdayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

/** Label datepicker: sertakan nama hari; "Hari ini"/"Kemarin" sebagai awalan. */
function datepickerLabel(isoDate: string): string {
  const withDay = shortDateWithWeekday(isoDate)
  if (isoDate === todayIso()) return `Hari ini · ${withDay}`
  if (isoDate === yesterdayIso()) return `Kemarin · ${withDay}`
  return withDay
}

export function DatePickerField({
  value,
  onChange,
  onFinished,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [{ y, m }, setView] = useState(() => {
    const p = parseIso(value || todayIso())
    return { y: p.y, m: p.m }
  })

  useEffect(() => {
    if (!open) return
    const initial = value || todayIso()
    setDraft(initial)
    const p = parseIso(initial)
    setView({ y: p.y, m: p.m })
  }, [open, value])

  const cells = useMemo(() => {
    const total = daysInMonth(y, m)
    const offset = mondayFirstIndex(y, m)
    const result: Array<number | null> = []
    for (let i = 0; i < offset; i++) result.push(null)
    for (let d = 1; d <= total; d++) result.push(d)
    // Selalu 6 baris (42 sel) supaya tinggi sheet & posisi panah bulan tetap.
    while (result.length < 42) result.push(null)
    return result
  }, [y, m])

  const maxIso = endOfCurrentMonthIso()
  const now = new Date()
  const canGoNextMonth =
    y < now.getFullYear() ||
    (y === now.getFullYear() && m < now.getMonth())

  function closeAndFinish(nextValue?: string) {
    setOpen(false)
    if (nextValue !== undefined) {
      const clamped = nextValue > maxIso ? maxIso : nextValue
      onChange(clamped)
    }
    // Tunggu sheet tutup dulu, baru pindah fokus.
    window.setTimeout(() => onFinished?.(), 50)
  }

  function handleReset() {
    const today = todayIso()
    setDraft(today)
    const p = parseIso(today)
    setView({ y: p.y, m: p.m })
    // Stay di sheet — jangan onFinished.
  }

  function handleCancel() {
    closeAndFinish()
  }

  function handleSet() {
    const next = draft || todayIso()
    closeAndFinish(next > maxIso ? maxIso : next)
  }

  useOverlayBack(open, () => {
    handleCancel()
    return true
  })

  function shiftMonth(delta: number) {
    setView((prev) => {
      const dt = new Date(prev.y, prev.m + delta, 1)
      const next = { y: dt.getFullYear(), m: dt.getMonth() }
      // Tidak boleh ke bulan setelah bulan berjalan.
      if (
        next.y > now.getFullYear() ||
        (next.y === now.getFullYear() && next.m > now.getMonth())
      ) {
        return prev
      }
      return next
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dismissNumericKeyboard()
          setOpen(true)
        }}
        className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-sm shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
      >
        <span className="font-medium text-neutral-900 dark:text-neutral-50">
          {datepickerLabel(value || todayIso())}
        </span>
        <span className="text-neutral-300">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 bg-black/40"
            onClick={handleCancel}
          />
          <div className="relative rounded-t-2xl bg-neutral-100 shadow-2xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                Tanggal
              </p>
              <p className="text-xs text-neutral-400">
                {datepickerLabel(draft || todayIso())}
              </p>
            </div>

            <div className="px-4 pt-3 pb-2">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-300"
                  aria-label="Bulan sebelumnya"
                >
                  ‹
                </button>
                <p className="text-sm font-semibold capitalize text-neutral-800 dark:text-neutral-100">
                  {monthTitle(y, m)}
                </p>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  disabled={!canGoNextMonth}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 enabled:active:bg-neutral-200/60 disabled:opacity-25 dark:text-neutral-300 dark:enabled:active:bg-neutral-800"
                  aria-label="Bulan berikutnya"
                >
                  ›
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="py-1 text-center text-[10px] font-medium text-neutral-400"
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                  if (day == null) {
                    return <div key={`e-${idx}`} className="aspect-square" />
                  }
                  const iso = toIso(y, m, day)
                  const selected = iso === draft
                  const isToday = iso === todayIso()
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setDraft(iso)}
                      className={`aspect-square rounded-full text-sm tabular-nums ${
                        selected
                          ? 'bg-emerald-600 font-semibold text-white'
                          : isToday
                            ? 'font-semibold text-emerald-600 ring-1 ring-emerald-500/40 dark:text-emerald-400'
                            : 'text-neutral-800 dark:text-neutral-100'
                      }`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-neutral-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-neutral-800">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl bg-white py-2.5 text-sm font-medium text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl bg-white py-2.5 text-sm font-medium text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSet}
                className="rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm active:bg-emerald-500"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
