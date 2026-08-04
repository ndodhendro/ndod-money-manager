import { useEffect, useState, type ReactNode } from 'react'
import { getCollapseOpen, setCollapseOpen } from '../lib/collapseState'
import { CollapseChevron } from './CollapseChevron'

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  className?: string
  /** When set, open/closed state survives navigate-away + back. */
  persistKey?: string
  forceOpen?: boolean
  forceVersion?: number
  children: ReactNode
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  className = '',
  persistKey,
  forceOpen,
  forceVersion,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() =>
    persistKey ? getCollapseOpen(persistKey, defaultOpen) : defaultOpen,
  )

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      if (persistKey) setCollapseOpen(persistKey, next)
      return next
    })
  }

  // Same as CollapsibleDayGroup: only re-apply on expand/collapse-all version bumps.
  useEffect(() => {
    if (forceOpen == null || forceVersion == null || forceVersion === 0) return
    setOpen(forceOpen)
    if (persistKey) setCollapseOpen(persistKey, forceOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- forceVersion is the intentional trigger
  }, [forceVersion])

  return (
    <section className={`mt-4 ${className}`.trim()}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-left dark:bg-neutral-800"
      >
        <CollapseChevron expanded={open} size={16} className="shrink-0 text-neutral-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            {title}
          </p>
          {subtitle && (
            <p className="truncate text-[11px] text-neutral-400">{subtitle}</p>
          )}
        </div>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  )
}
