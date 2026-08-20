import { formatNumber } from './format'

export const AMOUNT_DIGITS_MAX = 11

export function extractAmountDigits(
  raw: string,
  max = AMOUNT_DIGITS_MAX,
): string {
  return raw.replace(/\D/g, '').slice(0, max)
}

export function formatAmountDigits(digits: string): string {
  return digits ? formatNumber(Number(digits)) : ''
}

/** Count numeric digits before `cursorPos` in a formatted (or raw) string. */
export function countDigitsBefore(str: string, cursorPos: number): number {
  let count = 0
  const end = Math.min(cursorPos, str.length)
  for (let i = 0; i < end; i++) {
    const ch = str[i]
    if (ch >= '0' && ch <= '9') count++
  }
  return count
}

/** Map a digit index back to a caret position in a formatted string. */
export function selectionAfterDigits(
  formatted: string,
  digitsBefore: number,
): number {
  if (digitsBefore <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i]
    if (ch >= '0' && ch <= '9') {
      seen++
      if (seen >= digitsBefore) return i + 1
    }
  }
  return formatted.length
}

export function readAmountInputCursor(
  e: React.ChangeEvent<HTMLInputElement>,
): number {
  return countDigitsBefore(
    e.target.value,
    e.target.selectionStart ?? e.target.value.length,
  )
}

export function restoreAmountInputCursor(
  input: HTMLInputElement | null,
  digits: string,
  digitsBefore: number,
): void {
  if (!input) return
  const formatted = formatAmountDigits(digits)
  const pos = selectionAfterDigits(formatted, digitsBefore)
  try {
    input.setSelectionRange(pos, pos)
  } catch {
    // readOnly/disabled inputs may reject selection changes
  }
}

function isDigit(ch: string | undefined): boolean {
  return ch != null && ch >= '0' && ch <= '9'
}

/**
 * When the caret is next to a thousand separator, Backspace/Delete only removes
 * the dot — digit string unchanged and the caret jumps. Map those keys to the
 * adjacent digit instead.
 */
export function deleteDigitAtSeparator(
  digits: string,
  formatted: string,
  cursorPos: number,
  direction: 'backspace' | 'delete',
): { nextDigits: string; digitsBefore: number } | null {
  if (direction === 'backspace') {
    if (cursorPos <= 0) return null
    if (isDigit(formatted[cursorPos - 1])) return null

    const digitIndex = countDigitsBefore(formatted, cursorPos) - 1
    if (digitIndex < 0) return { nextDigits: digits, digitsBefore: 0 }

    return {
      nextDigits: digits.slice(0, digitIndex) + digits.slice(digitIndex + 1),
      digitsBefore: digitIndex,
    }
  }

  if (cursorPos >= formatted.length) return null
  if (isDigit(formatted[cursorPos])) return null

  const digitIndex = countDigitsBefore(formatted, cursorPos)
  if (digitIndex >= digits.length) return null

  return {
    nextDigits: digits.slice(0, digitIndex) + digits.slice(digitIndex + 1),
    digitsBefore: countDigitsBefore(formatted, cursorPos),
  }
}

export function applyFormattedAmountKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  digits: string,
  onDigitsChange: (digits: string) => void,
  setPendingCursor: (digitsBefore: number) => void,
  max = AMOUNT_DIGITS_MAX,
): boolean {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false
  if (e.currentTarget.readOnly || e.currentTarget.disabled) return false

  const selStart = e.currentTarget.selectionStart ?? 0
  const selEnd = e.currentTarget.selectionEnd ?? selStart
  if (selStart !== selEnd) return false

  const formatted = formatAmountDigits(digits)
  const direction = e.key === 'Backspace' ? 'backspace' : 'delete'
  const result = deleteDigitAtSeparator(digits, formatted, selStart, direction)
  if (!result) return false

  e.preventDefault()
  setPendingCursor(result.digitsBefore)
  onDigitsChange(extractAmountDigits(result.nextDigits, max))
  return true
}
