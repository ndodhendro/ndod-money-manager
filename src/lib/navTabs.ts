/** Bottom nav destinations — icons stay single-sourced with page titles. */
export const NAV_TABS = [
  { to: '/riwayat', label: 'History', icon: '🧾' },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/rencana', label: 'Plan', icon: '🎯' },
  { to: '/pengaturan', label: 'Settings', icon: '⚙️' },
] as const

export const NavIcon = {
  history: NAV_TABS[0].icon,
  dashboard: NAV_TABS[1].icon,
  plan: NAV_TABS[2].icon,
  settings: NAV_TABS[3].icon,
} as const
