import { ActionEmoji } from '../lib/actionEmoji'

const INPUT_CLASS =
  'w-full rounded-lg border-0 bg-neutral-100 py-2 pl-8 pr-8 text-xs text-neutral-800 outline-none placeholder:text-neutral-400 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Accessible name; defaults to placeholder or "Search". */
  'aria-label'?: string
  className?: string
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  'aria-label': ariaLabel,
  className = '',
}: SearchFieldProps) {
  const hasValue = value.length > 0

  return (
    <label className={`relative block min-w-0 ${className}`.trim()}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400" aria-hidden>
        🔍
      </span>
      <input
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? (placeholder.replace(/…$/, '') || 'Search')}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={INPUT_CLASS}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-xs text-neutral-400 active:bg-neutral-200 dark:active:bg-neutral-700"
          aria-label="Clear search"
          title="Clear search"
        >
          {ActionEmoji.close}
        </button>
      )}
    </label>
  )
}
