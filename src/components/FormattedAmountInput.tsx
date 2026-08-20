import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
} from 'react'
import {
  AMOUNT_DIGITS_MAX,
  applyFormattedAmountKeyDown,
  extractAmountDigits,
  formatAmountDigits,
  readAmountInputCursor,
  restoreAmountInputCursor,
} from '../lib/amountInput'

type FormattedAmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  digits: string
  onDigitsChange: (digits: string) => void
  maxDigits?: number
}

export const FormattedAmountInput = forwardRef<
  HTMLInputElement,
  FormattedAmountInputProps
>(function FormattedAmountInput(
  {
    digits,
    onDigitsChange,
    maxDigits = AMOUNT_DIGITS_MAX,
    inputMode = 'numeric',
    onKeyDown,
    ...rest
  },
  ref,
) {
  const localRef = useRef<HTMLInputElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const display = formatAmountDigits(digits)

  useLayoutEffect(() => {
    const el =
      (typeof ref === 'object' && ref?.current) || localRef.current
    if (pendingCursor.current !== null && el) {
      restoreAmountInputCursor(el, digits, pendingCursor.current)
      pendingCursor.current = null
    }
  }, [digits, ref])

  function setRef(el: HTMLInputElement | null) {
    localRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  return (
    <input
      {...rest}
      ref={setRef}
      type="text"
      inputMode={inputMode}
      value={display}
      onChange={(e) => {
        pendingCursor.current = readAmountInputCursor(e)
        onDigitsChange(extractAmountDigits(e.target.value, maxDigits))
      }}
      onKeyDown={(e) => {
        const handled = applyFormattedAmountKeyDown(
          e,
          digits,
          onDigitsChange,
          (digitsBefore) => {
            pendingCursor.current = digitsBefore
          },
          maxDigits,
        )
        if (!handled) onKeyDown?.(e)
      }}
    />
  )
})
