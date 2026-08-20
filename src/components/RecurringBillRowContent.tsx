import { BudgetGroupBadge } from './BudgetGroupBadge'
import { CircleBadge } from './CircleBadge'
import { OwnerBadge } from './OwnerBadge'
import { SinkingFundLabel } from './SinkingFundLabel'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  formatRupiah,
} from '../lib/format'
import type { RecurringBillDisplayParts } from '../lib/recurringBillDisplay'
import type { MonthCursor } from '../lib/monthCursor'
import {
  formatRecurringMeta,
  type RecurringBill,
} from '../lib/recurringBillsApi'
import { isCircle, isOwner, type BudgetGroup } from '../lib/types'

interface RecurringBillRowContentProps {
  bill: RecurringBill
  display: RecurringBillDisplayParts
  note?: string | null
  done?: boolean
  inactive?: boolean
  showMeta?: boolean
  /** When set (Plan checklist), meta shows the date in that month. */
  monthCursor?: MonthCursor
  /** Specific occurrence date for weekly (and monthly) checklist rows. */
  occurredOn?: string
  /** Calendar current month already logged — drives "X months left". */
  currentMonthDone?: boolean
  /**
   * Settings Monthly Estimates: YYYY-MM for "N× this month" on weekly /
   * biweekly rows (aligned with planned-needs weighting).
   */
  thisMonthYearMonth?: string
  /** Settings Monthly Estimates: Needs / Wants (Emergency & Investment show as Needs). */
  budgetGroup?: BudgetGroup | null
  /** When set, show this instead of bill.amount (e.g. PYF auto from Money Plan). */
  displayAmount?: number
  /** Subcategory is linked to an active sinking fund. */
  linkedToSinkingFund?: boolean
}

export function RecurringBillRowContent({
  bill,
  display,
  note,
  done = false,
  inactive = false,
  showMeta = true,
  monthCursor,
  occurredOn,
  currentMonthDone = false,
  thisMonthYearMonth,
  budgetGroup = null,
  displayAmount,
  linkedToSinkingFund = false,
}: RecurringBillRowContentProps) {
  const amount = displayAmount ?? bill.amount
  const noteText = display.isTransfer
    ? display.transferToLabel
    : (note ?? (bill.name.trim() || null))
  const dim = inactive ? 'opacity-50' : done ? 'opacity-60' : ''
  const titleClass = done
    ? 'text-neutral-500 dark:text-neutral-400'
    : 'text-neutral-800 dark:text-white'
  const noteClass = done
    ? 'text-neutral-500 dark:text-neutral-500'
    : 'text-neutral-500 dark:text-neutral-400'
  const owner = isOwner(bill.owner) ? bill.owner : 'suami'
  const meta = formatRecurringMeta(bill, monthCursor, {
    currentMonthDone,
    occurredOn,
    thisMonthYearMonth,
  })

  return (
    <>
      <span className={`text-xl leading-none ${dim}`} aria-hidden>
        {display.parentIcon}
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${dim}`}>
        <p
          className={`truncate text-xs font-semibold leading-none ${titleClass}`}
        >
          {display.parentName}
        </p>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          {display.childName ? (
            <p className="flex min-w-0 items-center gap-1 text-xs leading-none text-neutral-400">
              <span className="shrink-0" aria-hidden>
                {display.childIcon}
              </span>
              <span className="truncate">{display.childName}</span>
              {linkedToSinkingFund ? <SinkingFundLabel /> : null}
            </p>
          ) : display.isTransfer ? (
            <p className="truncate text-xs leading-none text-neutral-400">
              Transfer
            </p>
          ) : (
            <span className="invisible truncate text-xs leading-none">.</span>
          )}
          <OwnerBadge owner={owner} size="inline" />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          {noteText ? (
            <p className={`truncate text-xs leading-none ${noteClass}`}>
              {noteText}
            </p>
          ) : (
            <span className="invisible truncate text-xs leading-none">.</span>
          )}
          <CircleBadge
            circle={isCircle(display.circle) ? display.circle : 'hd_family'}
            size="inline"
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          {budgetGroup ? (
            <p className="truncate text-left text-xs leading-none">
              <BudgetGroupBadge group={budgetGroup} />
            </p>
          ) : (
            <span className="invisible truncate text-xs leading-none">.</span>
          )}
          <p
            className={`truncate text-xs font-semibold leading-none whitespace-nowrap ${
              bill.type === 'expense'
                ? AMOUNT_OUT_CLASS
                : bill.type === 'income'
                  ? AMOUNT_IN_CLASS
                  : 'text-violet-600 dark:text-violet-300'
            }`}
          >
            {bill.type === 'expense'
              ? '-'
              : bill.type === 'income'
                ? '+'
                : ''}
            {formatRupiah(amount)}
          </p>
        </div>
        {showMeta ? (
          <p className="min-w-0 truncate text-xs leading-tight text-neutral-400">
            {meta}
          </p>
        ) : null}
      </div>
    </>
  )
}
