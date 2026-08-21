export const PLAN_PROGRESS_SECTIONS = [
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
  {
    to: '/rencana/recurring',
    icon: '📆',
    title: 'Upcoming & Skipped',
    subtitle: 'Bills not yet due and skipped this month',
  },
  {
    to: '/rencana/pay-yourself-first',
    icon: '💰',
    title: 'Pay Yourself First',
    subtitle: 'Funding vs your monthly targets',
  },
  {
    to: '/rencana/emergency',
    icon: '🎯',
    title: 'Savings Goals',
    subtitle: 'Balances vs your goal amounts',
  },
  {
    to: '/rencana/needs-wants',
    icon: '⚖️',
    title: 'Needs vs Wants Budget',
    subtitle: 'Actual Spending, Estimates, and Free Wants Pace',
  },
] as const

/** Flat list for icons / section lookup. */
export const PLAN_SECTIONS = [...PLAN_PROGRESS_SECTIONS] as const

export const PlanIcon = {
  payday: PLAN_PROGRESS_SECTIONS[0].icon,
  closeMonth: PLAN_PROGRESS_SECTIONS[1].icon,
  recurring: PLAN_PROGRESS_SECTIONS[2].icon,
  payYourselfFirst: PLAN_PROGRESS_SECTIONS[3].icon,
  emergency: PLAN_PROGRESS_SECTIONS[4].icon,
  needsWants: PLAN_PROGRESS_SECTIONS[5].icon,
} as const

export const PlanTitle = {
  payday: PLAN_PROGRESS_SECTIONS[0].title,
  closeMonth: PLAN_PROGRESS_SECTIONS[1].title,
  recurring: PLAN_PROGRESS_SECTIONS[2].title,
  payYourselfFirst: PLAN_PROGRESS_SECTIONS[3].title,
  emergency: PLAN_PROGRESS_SECTIONS[4].title,
  needsWants: PLAN_PROGRESS_SECTIONS[5].title,
} as const
