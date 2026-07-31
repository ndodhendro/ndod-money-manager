import type { ReactNode } from 'react'
import { APP_LOGO_URL } from '../lib/branding'

interface PageTitleProps {
  children: ReactNode
}

export function PageTitle({ children }: PageTitleProps) {
  return (
    <h1 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
      <img
        src={APP_LOGO_URL}
        alt=""
        className="h-[1em] w-[1em] shrink-0 object-contain"
        aria-hidden
      />
      {children}
    </h1>
  )
}
