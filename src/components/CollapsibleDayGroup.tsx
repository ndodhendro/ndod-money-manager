import { useEffect, useState, type ReactNode } from 'react'
import { getCollapseOpen, setCollapseOpen } from '../lib/collapseState'
import { CollapseChevron } from './CollapseChevron'

interface CollapsibleDayGroupProps {
  title: string
  trailing?: ReactNode
  defaultOpen?: boolean
  /** When set, open/closed state survives navigate-away + back. */
  persistKey?: string
  forceOpen?: boolean
  forceVersion?: number
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

/** Compact collapsible for date/day groups in History, Plan, Recurring lists. */
export function CollapsibleDayGroup({
  title,
  trailing,
  defaultOpen = true,
  persistKey,
  forceOpen,
  forceVersion,
  onOpenChange,
  children,
}: CollapsibleDayGroupProps) {
  const [open, setOpen] = useState(() =>
    persistKey ? getCollapseOpen(persistKey, defaultOpen) : defaultOpen,
  )

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      if (persistKey) setCollapseOpen(persistKey, next)
      onOpenChange?.(next)
      return next
    })
  }

  // Apply only when expand/collapse-all bumps forceVersion. Syncing the
  // parent "all open?" chevron changes forceOpen without a version bump and
  // must not re-force every sibling group.
  useEffect(() => {
    if (forceOpen == null || forceVersion == null || forceVersion === 0) return
    setOpen(forceOpen)
    if (persistKey) setCollapseOpen(persistKey, forceOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- forceVersion is the intentional trigger
  }, [forceVersion])

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-1.5 text-left"
      >
        <CollapseChevron expanded={open} size={14} className="shrink-0 text-neutral-400" />
        <p className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-neutral-400">
          {title}
        </p>
        {trailing != null && <div className="shrink-0">{trailing}</div>}
      </button>
      {open && children}
    </div>
  )
}
