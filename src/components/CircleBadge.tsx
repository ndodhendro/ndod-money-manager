import { CIRCLE_BADGE_CLASS, CIRCLE_LABELS, type Circle } from '../lib/types'

interface CircleBadgeProps {
  circle: Circle
  /** Default chip kecil; pakai "md" untuk header halaman. */
  size?: 'sm' | 'md'
  className?: string
}

export function CircleBadge({
  circle,
  size = 'sm',
  className = '',
}: CircleBadgeProps) {
  const sizeClass =
    size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${CIRCLE_BADGE_CLASS[circle]} ${sizeClass} ${className}`}
    >
      {CIRCLE_LABELS[circle]}
    </span>
  )
}
