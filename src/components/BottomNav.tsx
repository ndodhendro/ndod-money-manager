import { useLocation, useNavigate } from 'react-router-dom'
import {
  dismissNumericKeyboard,
  requestAmountFocus,
} from '../lib/keyboardFocus'

const TABS = [
  { to: '/', label: 'Tambah', icon: '➕', end: true, openKeyboard: true },
  { to: '/riwayat', label: 'Riwayat', icon: '🧾', end: false, openKeyboard: false },
  { to: '/ringkasan', label: 'Ringkasan', icon: '📊', end: false, openKeyboard: false },
  { to: '/pengaturan', label: 'Pengaturan', icon: '⚙️', end: false, openKeyboard: false },
]

function isTabActive(pathname: string, to: string, end: boolean): boolean {
  if (end) return pathname === to || pathname === ''
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = isTabActive(location.pathname, tab.to, tab.end)
          return (
            <button
              key={tab.to}
              type="button"
              onPointerDown={(e) => {
                // Harus di pointerdown (masih dalam user gesture) supaya keyboard
                // numerik HP ikut muncul, bukan cuma focus visual di input.
                if (tab.openKeyboard) {
                  requestAmountFocus()
                  // Cegah tombol nav mengambil fokus — kalau tidak, numpad
                  // muncul sebentar lalu hilang (focus steal).
                  e.preventDefault()
                } else {
                  dismissNumericKeyboard()
                }
              }}
              onClick={() => {
                if (!active) navigate(tab.to, { replace: true })
                else if (tab.openKeyboard) requestAmountFocus()
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                active
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-neutral-400'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
