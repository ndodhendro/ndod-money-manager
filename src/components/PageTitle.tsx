import type { ReactNode } from 'react'

interface PageTitleProps {
  icon: string
  children: ReactNode
}

export function PageTitle({ icon, children }: PageTitleProps) {
  return (
    <h1 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
      <span className="text-[1em] leading-none" aria-hidden>
        {icon}
      </span>
      {children}
    </h1>
  )
}
