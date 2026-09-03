import {
  CIRCLE_BADGE_CLASS,
  CIRCLE_LABELS,
  CIRCLE_TEXT_CLASS,
  type Circle,
} from '../lib/types'

interface CircleBadgeProps {
  circle: Circle
  /** Default chip kecil; pakai "md" untuk header halaman; "inline" untuk baris list sejajar teks. */
  size?: 'sm' | 'md' | 'inline'
  className?: string
}

export function CircleBadge({
  circle,
  size = 'sm',
  className = '',
}: CircleBadgeProps) {
  const sizeClass =
    size === 'md'
      ? 'px-2.5 py-1 text-xs'
      : size === 'inline'
        ? 'px-1.5 py-0 text-xs leading-none'
        : 'px-2 py-0.5 text-[10px]'
  const toneClass =
    size === 'inline'
      ? `bg-transparent dark:bg-transparent ${CIRCLE_TEXT_CLASS[circle]}`
      : CIRCLE_BADGE_CLASS[circle]

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${toneClass} ${sizeClass} ${className}`}
    >
      {CIRCLE_LABELS[circle]}
    </span>
  )
}
