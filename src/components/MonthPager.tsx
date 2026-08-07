import { useRef, type PointerEvent, type ReactNode } from 'react'

interface MonthPagerProps {
  monthLabel: string
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
}

const navBtnClass =
  'flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-neutral-700 enabled:active:bg-neutral-100 disabled:opacity-25 dark:text-neutral-200 dark:enabled:active:bg-neutral-800'

function isPointerInside(el: HTMLElement, e: PointerEvent) {
  const rect = el.getBoundingClientRect()
  return (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  )
}

function MonthNavButton({
  onPress,
  disabled,
  'aria-label': ariaLabel,
  children,
}: {
  onPress: () => void
  disabled?: boolean
  'aria-label': string
  children: ReactNode
}) {
  const armedRef = useRef(false)

  function arm(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || e.button !== 0) return
    armedRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    // Page-level month swipe listens on touch/pointer bubble — keep button presses local.
    e.stopPropagation()
  }

  function release(e: PointerEvent<HTMLButtonElement>) {
    if (!armedRef.current) return
    armedRef.current = false
    e.stopPropagation()
    if (disabled) return
    if (isPointerInside(e.currentTarget, e)) onPress()
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      className={navBtnClass}
      onPointerDown={arm}
      onPointerUp={release}
      onPointerCancel={() => {
        armedRef.current = false
      }}
      onLostPointerCapture={() => {
        armedRef.current = false
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onClick={(e) => {
        // Pointer path already committed or cancelled; only keyboard (detail 0) uses click.
        if (e.detail !== 0) {
          e.preventDefault()
          return
        }
        if (!disabled) onPress()
      }}
    >
      {children}
    </button>
  )
}

export function MonthPager({
  monthLabel,
  canGoNext,
  onPrev,
  onNext,
}: MonthPagerProps) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <MonthNavButton onPress={onPrev} aria-label="Previous month">
        ◀️
      </MonthNavButton>
      <p className="text-sm font-medium capitalize text-neutral-700 dark:text-neutral-200">
        {monthLabel}
      </p>
      <MonthNavButton
        onPress={onNext}
        disabled={!canGoNext}
        aria-label="Next month"
      >
        ▶️
      </MonthNavButton>
    </div>
  )
}
