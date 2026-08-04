import { CIRCLE_BADGE_CLASS, CIRCLE_LABELS, type Circle } from '../lib/types'

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
  const inlineTextClass =
    circle === 'hd_family'
      ? 'text-emerald-700 dark:text-emerald-300'
      : circle === 'extended_family'
        ? 'text-sky-700 dark:text-sky-300'
        : 'text-pink-700 dark:text-pink-300'
  const toneClass =
    size === 'inline'
      ? `bg-transparent dark:bg-transparent ${inlineTextClass}`
      : CIRCLE_BADGE_CLASS[circle]

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${toneClass} ${sizeClass} ${className}`}
    >
      {CIRCLE_LABELS[circle]}
    </span>
  )
}
