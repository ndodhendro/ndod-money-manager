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

const STORAGE_KEY = 'mm:monthCursor'

function readStoredCursor(): MonthCursor {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return currentMonthCursor()
    const parsed = JSON.parse(raw) as Partial<MonthCursor>
    if (
      typeof parsed.year === 'number' &&
      typeof parsed.month === 'number' &&
      parsed.month >= 0 &&
      parsed.month <= 11
    ) {
      return { year: parsed.year, month: parsed.month }
    }
  } catch {
    // private mode / blocked storage
  }
  return currentMonthCursor()
}

function writeStoredCursor(cursor: MonthCursor): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cursor))
  } catch {
    // private mode / blocked storage
  }
}

export function useMonthCursor() {
  const [cursor, setCursorState] = useState<MonthCursor>(readStoredCursor)
  const touchStartX = useRef<number | null>(null)

  const setCursor = useCallback(
    (updater: MonthCursor | ((prev: MonthCursor) => MonthCursor)) => {
      setCursorState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        writeStoredCursor(next)
        return next
      })
    },
    [],
  )

  const canGoNext =
    !isCurrentMonthCursor(cursor) && !isAfterCurrentMonthCursor(cursor)

  const range = monthCursorRange(cursor)
  const monthLabel = monthCursorLabel(cursor)

  const goPrevMonth = useCallback(() => {
    setCursor((c) => shiftMonthCursor(c, -1))
  }, [setCursor])

  const goNextMonth = useCallback(() => {
    setCursor((c) => {
      const next = shiftMonthCursor(c, 1)
      return isAfterCurrentMonthCursor(next) ? c : next
    })
  }, [setCursor])

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
