import { formatRupiah } from '../lib/format'

export interface ChartSlice {
  key: string
  label: string
  value: number
  color: string
  icon?: string
}

const CHART_PALETTE = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
  '#84cc16', // lime
  '#06b6d4', // cyan
]

export function chartColorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]!
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const large = endAngle - startAngle > 180 ? 1 : 0
  const o1 = polar(cx, cy, rOuter, startAngle)
  const o2 = polar(cx, cy, rOuter, endAngle)
  const i1 = polar(cx, cy, rInner, endAngle)
  const i2 = polar(cx, cy, rInner, startAngle)
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z',
  ].join(' ')
}

interface DonutChartProps {
  slices: ChartSlice[]
  centerLabel?: string
  centerSub?: string
}

export function DonutChart({ slices, centerLabel, centerSub }: DonutChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const rOuter = 78
  const rInner = 48

  if (total <= 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-neutral-400">
        No data yet.
      </div>
    )
  }

  let angle = 0
  const paths = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const sweep = (slice.value / total) * 360
      // Full circle edge case
      const start = angle
      const end = angle + Math.min(sweep, 359.999)
      angle += sweep
      return (
        <path
          key={slice.key}
          d={arcPath(cx, cy, rOuter, rInner, start, end)}
          fill={slice.color}
        />
      )
    })

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        {paths}
        {(centerLabel || centerSub) && (
          <>
            {centerLabel && (
              <text
                x={cx}
                y={cy - (centerSub ? 6 : 0)}
                textAnchor="middle"
                fill="currentColor"
                fontSize="11"
                fontWeight="600"
                className="text-neutral-800 dark:text-neutral-100"
              >
                {centerLabel}
              </text>
            )}
            {centerSub && (
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                fill="currentColor"
                fontSize="10"
                className="text-neutral-400"
              >
                {centerSub}
              </text>
            )}
          </>
        )}
      </svg>
      <ul className="w-full space-y-1.5">
        {slices.map((slice) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0
          return (
            <li
              key={slice.key}
              className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              {slice.icon && <span aria-hidden>{slice.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="shrink-0 tabular-nums text-neutral-500">
                {pct}%
              </span>
              <span className="shrink-0 font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
                {formatRupiah(slice.value)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface HorizontalBarsProps {
  slices: ChartSlice[]
}

export function HorizontalBars({ slices }: HorizontalBarsProps) {
  const max = Math.max(...slices.map((s) => s.value), 1)
  if (slices.length === 0) {
    return (
      <p className="text-sm text-neutral-400">No data yet.</p>
    )
  }
  return (
    <div className="space-y-2.5">
      {slices.map((slice) => (
        <div key={slice.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium text-neutral-700 dark:text-neutral-200">
              {slice.icon ? `${slice.icon} ` : ''}
              {slice.label}
            </span>
            <span className="shrink-0 tabular-nums text-neutral-500">
              {formatRupiah(slice.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(slice.value / max) * 100}%`,
                backgroundColor: slice.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
