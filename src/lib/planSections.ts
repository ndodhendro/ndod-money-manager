export const PLAN_PROGRESS_SECTIONS = [
  {
    to: '/rencana/recurring',
    icon: '📆',
    title: 'Upcoming & Skipped',
    subtitle: 'Bills not yet due and skipped this month',
  },
  {
    to: '/rencana/needs-wants',
    icon: '⚖️',
    title: 'Monthly Estimate Progress',
    subtitle: 'Planned vs Actual for This Month',
  },
  {
    to: '/rencana/emergency',
    icon: '🎯',
    title: 'Savings Goals',
    subtitle: 'Balances vs your goal amounts',
  },
  {
    to: '/rencana/pay-yourself-first',
    icon: '💰',
    title: 'Pay Yourself First',
    subtitle: 'Funding vs your monthly targets',
  },
  {
    to: '/rencana/payday',
    icon: '💵',
    title: 'Payday Allocation',
    subtitle: 'Sinking and Bonus Allocation',
  },
  {
    to: '/rencana/close-month',
    icon: '📒',
    title: 'Close Month',
    subtitle: 'Allocate leftovers and unlock the next month',
  },
] as const

/** Flat list for icons / section lookup. */
export const PLAN_SECTIONS = [...PLAN_PROGRESS_SECTIONS] as const

type PlanTo = (typeof PLAN_PROGRESS_SECTIONS)[number]['to']

function planSection<T extends PlanTo>(to: T) {
  const section = PLAN_PROGRESS_SECTIONS.find((s) => s.to === to)
  if (!section) throw new Error(`Unknown plan section: ${to}`)
  return section as Extract<(typeof PLAN_PROGRESS_SECTIONS)[number], { to: T }>
}

export const PlanIcon = {
  payday: planSection('/rencana/payday').icon,
  closeMonth: planSection('/rencana/close-month').icon,
  recurring: planSection('/rencana/recurring').icon,
  payYourselfFirst: planSection('/rencana/pay-yourself-first').icon,
  emergency: planSection('/rencana/emergency').icon,
  needsWants: planSection('/rencana/needs-wants').icon,
} as const

export const PlanTitle = {
  payday: planSection('/rencana/payday').title,
  closeMonth: planSection('/rencana/close-month').title,
  recurring: planSection('/rencana/recurring').title,
  payYourselfFirst: planSection('/rencana/pay-yourself-first').title,
  emergency: planSection('/rencana/emergency').title,
  needsWants: planSection('/rencana/needs-wants').title,
} as const
