/** Plan section destinations — icons stay single-sourced with Settings where purpose matches. */
export const PLAN_SECTIONS = [
  {
    to: '/rencana/recurring',
    icon: '📆',
    title: 'Recurring Checklist',
    subtitle: 'Due items for this month',
  },
  {
    to: '/rencana/pay-yourself-first',
    icon: '💸',
    title: 'Pay Yourself First',
    subtitle: 'Monthly funding progress',
  },
  {
    to: '/rencana/emergency',
    icon: '🎯',
    title: 'Savings Goals',
    subtitle: 'Overall progress vs targets',
  },
  {
    to: '/rencana/needs-wants',
    icon: '⚖️',
    title: 'Needs vs Wants',
    subtitle: 'Spending targets this month',
  },
] as const

export const PlanIcon = {
  recurring: PLAN_SECTIONS[0].icon,
  payYourselfFirst: PLAN_SECTIONS[1].icon,
  emergency: PLAN_SECTIONS[2].icon,
  needsWants: PLAN_SECTIONS[3].icon,
} as const
