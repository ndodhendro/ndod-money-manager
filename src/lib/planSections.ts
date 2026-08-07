/** Plan destinations — icons stay single-sourced with Settings where purpose matches. */

export const PLAN_ACTION_SECTIONS = [
  {
    to: '/rencana/recurring',
    icon: '📆',
    title: 'Recurring Checklist',
    subtitle: 'Check off dues as you pay them',
  },
] as const

export const PLAN_PROGRESS_SECTIONS = [
  {
    to: '/rencana/pay-yourself-first',
    icon: '💸',
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

/** Flat list (action first, then progress) for icons / FAB lookup. */
export const PLAN_SECTIONS = [
  ...PLAN_ACTION_SECTIONS,
  ...PLAN_PROGRESS_SECTIONS,
] as const

export const PlanIcon = {
  recurring: PLAN_ACTION_SECTIONS[0].icon,
  payYourselfFirst: PLAN_PROGRESS_SECTIONS[0].icon,
  emergency: PLAN_PROGRESS_SECTIONS[1].icon,
  needsWants: PLAN_PROGRESS_SECTIONS[2].icon,
} as const

export const PlanTitle = {
  recurring: PLAN_ACTION_SECTIONS[0].title,
  payYourselfFirst: PLAN_PROGRESS_SECTIONS[0].title,
  emergency: PLAN_PROGRESS_SECTIONS[1].title,
  needsWants: PLAN_PROGRESS_SECTIONS[2].title,
} as const
