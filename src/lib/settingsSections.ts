/** Settings section destinations — icons stay single-sourced with page titles. */
export const SETTINGS_SECTIONS = [
  {
    to: '/pengaturan/money-plan',
    icon: '🎯',
    title: 'Money Plan',
    subtitle: '',
  },
  {
    to: '/pengaturan/recurring',
    icon: '📆',
    title: 'Recurring',
    subtitle: '',
  },
  {
    to: '/pengaturan/buckets',
    icon: '💳',
    title: 'Savings Buckets',
    subtitle: '',
  },
  {
    to: '/pengaturan/categories',
    icon: '🏷️',
    title: 'Categories',
    subtitle: '',
  },
] as const

export const SettingsIcon = {
  moneyPlan: SETTINGS_SECTIONS[0].icon,
  recurring: SETTINGS_SECTIONS[1].icon,
  buckets: SETTINGS_SECTIONS[2].icon,
  categories: SETTINGS_SECTIONS[3].icon,
} as const
