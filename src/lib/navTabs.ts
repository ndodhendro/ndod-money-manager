/** Bottom nav destinations — icons stay single-sourced with page titles. */
export const NAV_TABS = [
  { to: '/riwayat', label: 'Transactions', icon: '🧾' },
  { to: '/rencana', label: 'Plan', icon: '🎯' },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/pengaturan', label: 'Settings', icon: '⚙️' },
] as const

const navIconByTo = Object.fromEntries(
  NAV_TABS.map((tab) => [tab.to, tab.icon]),
) as Record<(typeof NAV_TABS)[number]['to'], (typeof NAV_TABS)[number]['icon']>

export const NavIcon = {
  history: navIconByTo['/riwayat'],
  plan: navIconByTo['/rencana'],
  dashboard: navIconByTo['/dashboard'],
  settings: navIconByTo['/pengaturan'],
} as const
