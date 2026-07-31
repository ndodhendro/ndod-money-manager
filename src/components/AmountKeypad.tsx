import { formatNumber } from '../lib/format'

interface AmountKeypadProps {
  value: string
  onChange: (value: string) => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back']

export function AmountKeypad({ value, onChange }: AmountKeypadProps) {
  const amount = Number(value || '0')

  function press(key: string) {
    if (key === 'back') {
      onChange(value.slice(0, -1))
      return
    }
    if (value === '0' && key !== '000') {
      onChange(key)
      return
    }
    const next = value + key
    // Batasi supaya tidak overflow angka yang tidak masuk akal (99 miliar).
    if (next.replace(/^0+/, '').length > 11) return
    onChange(next.replace(/^0+(?=\d)/, ''))
  }

  return (
    <div>
      <div className="rounded-2xl bg-neutral-100 px-4 py-5 text-center dark:bg-neutral-800">
        <span className="text-sm text-neutral-500">Rp</span>
        <div className="text-4xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
          {formatNumber(amount)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="rounded-xl bg-white py-4 text-xl font-medium text-neutral-800 shadow-sm active:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 dark:active:bg-neutral-700"
          >
            {key === 'back' ? '⌫' : key}
          </button>
        ))}
      </div>
    </div>
  )
}
