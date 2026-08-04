import { type ReactNode } from 'react'
import { CollapseChevron } from './CollapseChevron'

interface GroupedListFrameProps {
  expanded: boolean
  onToggle: (expanded: boolean) => void
  /** Optional legend on the top border (section / group name). */
  label?: string
  /**
   * When true, unmount children while collapsed (section boxes).
   * Default false keeps list content mounted so day/kind headers stay visible.
   */
  collapseContent?: boolean
  className?: string
  children: ReactNode
}

/** Rounded grouping frame with collapse/expand toggle on the top border. */
export function GroupedListFrame({
  expanded,
  onToggle,
  label,
  collapseContent = false,
  className = '',
  children,
}: GroupedListFrameProps) {
  const showContent = !collapseContent || expanded

  return (
    <div className={`relative ${className}`}>
      <div
        className={
          showContent
            ? 'rounded-2xl border border-neutral-200/80 px-3 pt-4 pb-3 dark:border-neutral-700/80'
            : 'h-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80'
        }
      >
        {showContent ? children : null}
      </div>
      <button
        type="button"
        onClick={() => onToggle(!expanded)}
        aria-label={
          label
            ? expanded
              ? `Collapse ${label}`
              : `Expand ${label}`
            : expanded
              ? 'Collapse all'
              : 'Expand all'
        }
        aria-expanded={expanded}
        className="absolute top-0 left-2 z-10 flex h-7 -translate-y-1/2 items-center gap-1 bg-neutral-50 px-1.5 text-neutral-400 active:opacity-70 dark:bg-neutral-950"
      >
        <CollapseChevron expanded={expanded} size={16} />
        {label ? (
          <span className="text-xs font-semibold tracking-wide text-neutral-500 dark:text-neutral-400">
            {label}
          </span>
        ) : null}
      </button>
    </div>
  )
}
