import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageTitle } from './PageTitle'
import { dismissNumericKeyboard } from '../lib/keyboardFocus'

interface SettingsSubPageProps {
  title: string
  icon: string
  description?: string
  /** Override default back-to-Settings when provided. */
  onBack?: () => void
  children: ReactNode
}

export function SettingsSubPage({
  title,
  icon,
  description,
  onBack,
  children,
}: SettingsSubPageProps) {
  const navigate = useNavigate()

  function goBack() {
    dismissNumericKeyboard()
    if (onBack) {
      onBack()
      return
    }
    navigate('/pengaturan', { replace: true })
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onPointerDown={() => dismissNumericKeyboard()}
          onClick={goBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-neutral-600 active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-neutral-800"
          aria-label="Back"
        >
          ←
        </button>
        <PageTitle icon={icon}>{title}</PageTitle>
      </div>

      {description && (
        <p className="mt-2 text-xs text-neutral-500">{description}</p>
      )}

      <div className="mt-4">{children}</div>
    </div>
  )
}
