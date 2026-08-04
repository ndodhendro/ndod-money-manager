/** Shared collapse/expand chevron — same glyph everywhere (categories, groupings, sections). */
export function CollapseChevron({
  expanded,
  size = 18,
  className = '',
}: {
  expanded: boolean
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${className}`.trim()}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
