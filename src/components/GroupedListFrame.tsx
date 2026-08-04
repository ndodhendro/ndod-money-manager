import { type ReactNode } from 'react'
import { CollapseChevron } from './CollapseChevron'

interface GroupedListFrameProps {
  expanded: boolean
  onToggle: (expanded: boolean) => void
  className?: string
  children: ReactNode
}

/** Rounded grouping frame with collapse/expand toggle on the top border. */
export function GroupedListFrame({
  expanded,
  onToggle,
  className = '',
  children,
}: GroupedListFrameProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="rounded-2xl border border-neutral-200/80 px-3 pt-4 pb-3 dark:border-neutral-700/80">
        {children}
      </div>
      <button
        type="button"
        onClick={() => onToggle(!expanded)}
        aria-label={expanded ? 'Collapse all' : 'Expand all'}
        aria-expanded={expanded}
        className="absolute top-0 left-2 z-10 flex h-7 -translate-y-1/2 items-center bg-neutral-50 px-1.5 text-neutral-400 active:opacity-70 dark:bg-neutral-950"
      >
        <CollapseChevron expanded={expanded} size={16} />
      </button>
    </div>
  )
}
