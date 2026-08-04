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
    subtitle: 'Savings & spending targets',
  },
  {
    to: '/rencana/emergency',
    icon: '🛟',
    title: 'Emergency Fund Goal',
    subtitle: 'Safety buffer progress',
  },
  {
    to: '/rencana/buckets',
    icon: '🪣',
    title: 'Bucket Balances',
    subtitle: 'Emergency, investment & sinking',
  },
  {
    to: '/rencana/needs-wants',
    icon: '⚖️',
    title: 'Needs vs Wants',
    subtitle: 'Spending split this month',
  },
] as const
