import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import { fetchNoteSuggestions } from '../lib/transactionsApi'

interface NotesInputProps {
  value: string
  onChange: (value: string) => void
  categoryId: string | null
  inputRef?: Ref<HTMLInputElement>
  onFocus?: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
}

export function NotesInput({
  value,
  onChange,
  categoryId,
  inputRef,
  onFocus,
  onKeyDown,
  placeholder = 'Catatan (opsional)',
}: NotesInputProps) {
  const listId = useId()
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    if (!categoryId) {
      setSuggestions([])
      return
    }
    let cancelled = false
    fetchNoteSuggestions(categoryId)
      .then((notes) => {
        if (!cancelled) setSuggestions(notes)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
    return () => {
      cancelled = true
    }
  }, [categoryId])

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current)
    }
  }, [])

  const query = value.trim().toLowerCase()
  const filtered = suggestions.filter((note) => {
    const lower = note.toLowerCase()
    if (lower === query) return false
    if (!query) return true
    return lower.includes(query)
  })

  const showList = open && filtered.length > 0

  useOverlayBack(showList, () => {
    setOpen(false)
    setActiveIndex(-1)
    return true
  })

  function pick(note: string) {
    onChange(note)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleFocus() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current)
      blurTimer.current = null
    }
    setOpen(true)
    onFocus?.()
  }

  function handleBlur() {
    blurTimer.current = setTimeout(() => {
      setOpen(false)
      setActiveIndex(-1)
    }, 120)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showList && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setActiveIndex((prev) => {
        if (e.key === 'ArrowDown') {
          return prev < filtered.length - 1 ? prev + 1 : 0
        }
        return prev > 0 ? prev - 1 : filtered.length - 1
      })
      return
    }
    if (showList && e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      pick(filtered[activeIndex]!)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        enterKeyHint="done"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        className="w-full rounded-xl bg-white px-4 py-3 text-sm shadow-sm outline-none dark:bg-neutral-800 dark:text-neutral-100"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-48 w-full overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10"
        >
          {filtered.map((note, index) => (
            <li key={note} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(note)}
                className={`block w-full px-4 py-2.5 text-left text-sm ${
                  index === activeIndex
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {note}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
