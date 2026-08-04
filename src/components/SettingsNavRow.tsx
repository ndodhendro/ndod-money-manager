import { useNavigate } from 'react-router-dom'

interface SettingsNavRowProps {
  to: string
  icon: string
  title: string
  subtitle: string
}

export function SettingsNavRow({
  to,
  icon,
  title,
  subtitle,
}: SettingsNavRowProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm active:bg-neutral-50 dark:bg-neutral-800 dark:active:bg-neutral-700/80"
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-neutral-500">{subtitle}</span>
      </span>
      <Chevron />
    </button>
  )
}

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-neutral-400"
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
