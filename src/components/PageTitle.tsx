import type { ReactNode } from 'react'

interface PageTitleProps {
  icon: string
  children: ReactNode
  /** Short one-liner under the title (body copy, not Title Case). */
  description?: string
}

export function PageTitle({ icon, children, description }: PageTitleProps) {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        <span className="text-[1em] leading-none" aria-hidden>
          {icon}
        </span>
        {children}
      </h1>
      {description ? (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
    </div>
  )
}
