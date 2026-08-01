import { OWNER_BADGE_CLASS, OWNER_LABELS, type Owner } from '../lib/types'

interface OwnerBadgeProps {
  owner: Owner
  /** Default chip kecil; pakai "md" untuk header halaman. */
  size?: 'sm' | 'md'
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
      : 'px-2 py-0.5 text-[10px]'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${OWNER_BADGE_CLASS[owner]} ${sizeClass} ${className}`}
    >
      {OWNER_LABELS[owner]}
    </span>
  )
}
