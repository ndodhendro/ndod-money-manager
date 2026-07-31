import { NavLink } from 'react-router-dom'
import { requestAmountFocus } from '../lib/keyboardFocus'

const TABS = [
  { to: '/', label: 'Tambah', icon: '➕', end: true, openKeyboard: true },
  { to: '/riwayat', label: 'Riwayat', icon: '🧾', end: false, openKeyboard: false },
  { to: '/ringkasan', label: 'Ringkasan', icon: '📊', end: false, openKeyboard: false },
  { to: '/pengaturan', label: 'Pengaturan', icon: '⚙️', end: false, openKeyboard: false },
]

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            onPointerDown={() => {
              // Harus di pointerdown (masih dalam user gesture) supaya keyboard
              // numerik HP ikut muncul, bukan cuma focus visual di input.
              if (tab.openKeyboard) requestAmountFocus()
            }}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-neutral-400'
              }`
            }
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
