/** Plan destinations — icons stay single-sourced with Settings where purpose matches. */

export const PLAN_PROGRESS_SECTIONS = [
  {
    to: '/rencana/payday',
    icon: '💵',
    title: 'Payday Allocation',
    subtitle: 'Free Guilty split and sinking transfers',
  },
  {
    to: '/rencana/recurring',
    icon: '📆',
    title: 'Due Checklist',
    subtitle: 'Upcoming, checked, and skipped this month',
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
    subtitle: 'Actual spending vs your budget',
  },
] as const

/** Flat list for icons / FAB lookup. */
export const PLAN_SECTIONS = [...PLAN_PROGRESS_SECTIONS] as const

export const PlanIcon = {
  payday: PLAN_PROGRESS_SECTIONS[0].icon,
  recurring: PLAN_PROGRESS_SECTIONS[1].icon,
  payYourselfFirst: PLAN_PROGRESS_SECTIONS[2].icon,
  emergency: PLAN_PROGRESS_SECTIONS[3].icon,
  needsWants: PLAN_PROGRESS_SECTIONS[4].icon,
} as const

export const PlanTitle = {
  payday: PLAN_PROGRESS_SECTIONS[0].title,
  recurring: PLAN_PROGRESS_SECTIONS[1].title,
  payYourselfFirst: PLAN_PROGRESS_SECTIONS[2].title,
  emergency: PLAN_PROGRESS_SECTIONS[3].title,
  needsWants: PLAN_PROGRESS_SECTIONS[4].title,
} as const
