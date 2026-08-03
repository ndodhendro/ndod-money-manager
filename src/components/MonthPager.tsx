interface MonthPagerProps {
  monthLabel: string
  canGoNext: boolean
  onPrev: () => void
  onNext: () => void
}

export function MonthPager({
  monthLabel,
  canGoNext,
  onPrev,
  onNext,
}: MonthPagerProps) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-neutral-700 active:bg-neutral-100 dark:text-neutral-200 dark:active:bg-neutral-800"
        aria-label="Previous month"
      >
        ◀️
      </button>
      <p className="text-sm font-medium capitalize text-neutral-700 dark:text-neutral-200">
        {monthLabel}
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl leading-none text-neutral-700 enabled:active:bg-neutral-100 disabled:opacity-25 dark:text-neutral-200 dark:enabled:active:bg-neutral-800"
        aria-label="Next month"
      >
        ▶️
      </button>
    </div>
  )
}
