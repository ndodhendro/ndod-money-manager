import { CircleBadge } from './CircleBadge'
import { OwnerBadge } from './OwnerBadge'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  formatRupiah,
} from '../lib/format'
import type { RecurringBillDisplayParts } from '../lib/recurringBillDisplay'
import {
  formatRecurringMeta,
  type RecurringBill,
} from '../lib/recurringBillsApi'
import { isCircle, isOwner } from '../lib/types'

interface RecurringBillRowContentProps {
  bill: RecurringBill
  display: RecurringBillDisplayParts
  note?: string | null
  done?: boolean
  inactive?: boolean
  showMeta?: boolean
}

export function RecurringBillRowContent({
  bill,
  display,
  note,
  done = false,
  inactive = false,
  showMeta = true,
}: RecurringBillRowContentProps) {
  const noteText = note ?? (bill.name.trim() || null)
  const dim = inactive ? 'opacity-50' : done ? 'opacity-60' : ''
  const titleClass = done
    ? 'text-neutral-500 dark:text-neutral-400'
    : 'text-neutral-800 dark:text-white'
  const noteClass = done
    ? 'text-neutral-500 dark:text-neutral-500'
    : 'text-neutral-500 dark:text-neutral-400'
  const owner = isOwner(bill.owner) ? bill.owner : 'suami'

  return (
    <>
      <span className={`text-xl leading-none ${dim}`} aria-hidden>
        {display.parentIcon}
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${dim}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          <p
            className={`truncate text-xs font-semibold leading-none ${titleClass}`}
          >
            {display.parentName}
          </p>
          <OwnerBadge owner={owner} size="inline" />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          {display.childName ? (
            <p className="flex min-w-0 items-center gap-1 truncate text-xs leading-none text-neutral-400">
              <span aria-hidden>{display.childIcon}</span>
              <span className="truncate">{display.childName}</span>
            </p>
          ) : display.isTransfer ? (
            <p className="truncate text-xs leading-none text-neutral-400">
              Transfer
            </p>
          ) : (
            <span className="invisible truncate text-xs leading-none">.</span>
          )}
          {!display.isTransfer ? (
            <CircleBadge
              circle={isCircle(display.circle) ? display.circle : 'hd_family'}
              size="inline"
            />
          ) : (
            <span className="invisible text-xs leading-none">.</span>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          {noteText ? (
            <p className={`truncate text-xs leading-none ${noteClass}`}>
              {noteText}
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
            {formatRupiah(bill.amount)}
          </p>
        </div>
        {showMeta && (
          <p className="text-xs leading-tight text-neutral-400">
            {formatRecurringMeta(bill)}
          </p>
        )}
      </div>
    </>
  )
}
