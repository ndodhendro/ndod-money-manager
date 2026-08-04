import { OWNER_BADGE_CLASS, OWNER_LABELS, type Owner } from '../lib/types'

interface OwnerBadgeProps {
  owner: Owner
  /** Default chip kecil; pakai "md" untuk header halaman; "inline" untuk baris list sejajar teks. */
  size?: 'sm' | 'md' | 'inline'
  className?: string
}

export function OwnerBadge({
  owner,
  size = 'sm',
  className = '',
}: OwnerBadgeProps) {
  const sizeClass =
    size === 'md'
      ? 'px-2.5 py-1 text-xs'
      : size === 'inline'
        ? 'px-1.5 py-0 text-xs leading-none'
        : 'px-2 py-0.5 text-[10px]'
  const inlineTextClass =
    owner === 'suami'
      ? 'text-blue-700 dark:text-blue-300'
      : 'text-pink-700 dark:text-pink-300'
  const toneClass =
    size === 'inline'
      ? `bg-transparent dark:bg-transparent ${inlineTextClass}`
      : OWNER_BADGE_CLASS[owner]

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${toneClass} ${sizeClass} ${className}`}
    >
      {OWNER_LABELS[owner]}
    </span>
  )
}
