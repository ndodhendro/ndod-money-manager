import { useLocation, useNavigate } from 'react-router-dom'
import { dismissNumericKeyboard } from '../lib/keyboardFocus'

const TABS = [
  { to: '/riwayat', label: 'History', icon: '🧾' },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/rencana', label: 'Plan', icon: '🎯' },
  { to: '/pengaturan', label: 'Settings', icon: '⚙️' },
] as const

function isTabActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  // Sembunyikan di layar catat/edit — fokus ke form; keluar lewat menu lain tidak perlu.
  const hide =
    location.pathname === '/tambah' ||
    location.pathname.startsWith('/transaksi/')

  if (hide) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = isTabActive(location.pathname, tab.to)
          return (
            <button
              key={tab.to}
              type="button"
              onPointerDown={() => dismissNumericKeyboard()}
              onClick={() => {
                if (!active) navigate(tab.to, { replace: true })
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium sm:text-xs ${
                active
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-neutral-400'
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
