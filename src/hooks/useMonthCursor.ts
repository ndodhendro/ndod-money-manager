import { useCallback, useRef, useState, type TouchEvent } from 'react'
import {
  currentMonthCursor,
  isAfterCurrentMonthCursor,
  isCurrentMonthCursor,
  monthCursorLabel,
  monthCursorRange,
  shiftMonthCursor,
  type MonthCursor,
} from '../lib/monthCursor'

export function useMonthCursor() {
  const [cursor, setCursor] = useState<MonthCursor>(currentMonthCursor)
  const touchStartX = useRef<number | null>(null)

  const canGoNext =
    !isCurrentMonthCursor(cursor) && !isAfterCurrentMonthCursor(cursor)

  const range = monthCursorRange(cursor)
  const monthLabel = monthCursorLabel(cursor)

  const goPrevMonth = useCallback(() => {
    setCursor((c) => shiftMonthCursor(c, -1))
  }, [])

  const goNextMonth = useCallback(() => {
    setCursor((c) => {
      const next = shiftMonthCursor(c, 1)
      return isAfterCurrentMonthCursor(next) ? c : next
    })
  }, [])

  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: TouchEvent) {
    const start = touchStartX.current
    touchStartX.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX
    if (end == null) return
    const dx = end - start
    if (Math.abs(dx) < 56) return
    if (dx > 0) goPrevMonth()
    else if (canGoNext) goNextMonth()
  }

  return {
    cursor,
    setCursor,
    range,
    monthLabel,
    canGoNext,
    goPrevMonth,
    goNextMonth,
    handleTouchStart,
    handleTouchEnd,
  }
}
