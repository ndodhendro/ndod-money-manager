import { BudgetGroupBadge } from './BudgetGroupBadge'
import { CircleBadge } from './CircleBadge'
import { OwnerBadge } from './OwnerBadge'
import { SinkingFundLabel } from './SinkingFundLabel'
import {
  AMOUNT_IN_CLASS,
  AMOUNT_OUT_CLASS,
  formatRupiah,
  noteOrDefault,
} from '../lib/format'
import {
  HISTORY_OVERSPEND_LABEL,
  HISTORY_PLAN_KIND_LABELS,
  type HistoryPlanKind,
} from '../lib/freeGuiltyProgress'
import { historyBudgetGroupOfTx } from '../lib/listSearch'
import {
  BUDGET_GROUP_TEXT_CLASS,
  categoryDisplayParts,
  CIRCLE_TEXT_CLASS,
  formatTransferLabel,
  formatTransferToLabel,
  isCircle,
  TRANSFER_TYPE_ICON,
  type TransactionWithCategory,
} from '../lib/types'

interface HistoryTxRowBodyProps {
  tx: TransactionWithCategory
  sinkingCategoryIds: Set<string>
  /** Planned / Unplanned label under the note (History list only). */
  planKind?: HistoryPlanKind
  /** Visible "Overspend" badge (History list only). */
  showOverspendLabel?: boolean
  /**
   * Replaces the transaction amount (e.g. Month Budget overspend detail shows
   * only the overspend portion, not the full transaction).
   */
  amountOverride?: number
}

/**
 * Inner content of a Transactions (History) row. Shared by History and the
 * Month Budget detail pages so both look identical.
 */
export function HistoryTxRowBody({
  tx,
  sinkingCategoryIds,
  planKind,
  showOverspendLabel = false,
  amountOverride,
}: HistoryTxRowBodyProps) {
  const isTransfer = tx.type === 'transfer'
  const { parentIcon, parentName, childIcon, childName } = isTransfer
    ? {
        parentIcon: TRANSFER_TYPE_ICON,
        parentName: formatTransferLabel(tx.from_bucket),
        childIcon: null as string | null,
        childName: formatTransferToLabel(tx.to_bucket),
      }
    : categoryDisplayParts(tx.category)
  const note = isTransfer
    ? noteOrDefault(tx.description)
    : tx.description?.trim() || null
  const transferToSinking = Boolean(
    isTransfer && tx.to_bucket?.kind === 'sinking',
  )
  const shownAmount = amountOverride ?? tx.amount
  const amountLabel =
    shownAmount > 0
      ? `${
          tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''
        }${formatRupiah(shownAmount)}`
      : '—'
  const amountClass = `truncate text-xs font-semibold leading-none whitespace-nowrap ${
    shownAmount <= 0
      ? 'text-neutral-400'
      : tx.type === 'expense'
        ? AMOUNT_OUT_CLASS
        : tx.type === 'income'
          ? AMOUNT_IN_CLASS
          : 'text-violet-600 dark:text-violet-300'
  }`
  const budgetGroup = historyBudgetGroupOfTx(tx)

  return (
    <>
      <span className="text-xl leading-none" aria-hidden>
        {parentIcon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          <p className="truncate text-xs font-semibold leading-none text-neutral-800 dark:text-white">
            {parentName}
          </p>
          <OwnerBadge owner={tx.owner} size="inline" />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          {childName ? (
            <p className="flex min-w-0 items-center gap-1 text-xs leading-none text-neutral-400">
              {childIcon ? (
                <span className="shrink-0" aria-hidden>
                  {childIcon}
                </span>
              ) : null}
              <span className="truncate">{childName}</span>
              {(tx.category_id && sinkingCategoryIds.has(tx.category_id)) ||
              transferToSinking ? (
                <SinkingFundLabel />
              ) : null}
            </p>
          ) : (
            <span className="invisible truncate text-xs leading-none">.</span>
          )}
          <CircleBadge
            circle={isCircle(tx.circle) ? tx.circle : 'hd_family'}
            size="inline"
          />
        </div>

        {tx.complete_later ? (
          <>
            {note ? (
              <p className="min-w-0 line-clamp-2 break-words text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                {note}
              </p>
            ) : null}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              {budgetGroup ? (
                <p className="truncate text-left text-xs leading-none">
                  <BudgetGroupBadge group={budgetGroup} />
                </p>
              ) : (
                <span className="invisible truncate text-xs leading-none">
                  .
                </span>
              )}
              <p className={amountClass}>{amountLabel}</p>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
              {note ? (
                <p className="truncate text-xs leading-none text-neutral-500 dark:text-neutral-400">
                  {note}
                </p>
              ) : (
                <span className="invisible truncate text-xs leading-none">
                  .
                </span>
              )}
              <p className={amountClass}>{amountLabel}</p>
            </div>
            {budgetGroup || planKind || showOverspendLabel ? (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                  {planKind ? (
                    <p
                      className={`truncate text-left text-xs font-medium leading-none ${
                        planKind === 'unplanned'
                          ? 'text-amber-600 dark:text-amber-400'
                          : CIRCLE_TEXT_CLASS.hd_family
                      }`}
                    >
                      {HISTORY_PLAN_KIND_LABELS[planKind]}
                    </p>
                  ) : (
                    <span className="invisible truncate text-xs leading-none">
                      .
                    </span>
                  )}
                  {budgetGroup ? (
                    <p className="truncate text-xs leading-none whitespace-nowrap">
                      <BudgetGroupBadge group={budgetGroup} />
                    </p>
                  ) : showOverspendLabel ? (
                    <p
                      className={`truncate text-xs font-medium leading-none whitespace-nowrap ${BUDGET_GROUP_TEXT_CLASS.needs}`}
                    >
                      {HISTORY_OVERSPEND_LABEL}
                    </p>
                  ) : null}
                </div>
                {budgetGroup && showOverspendLabel ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                    <span className="invisible truncate text-xs leading-none">
                      .
                    </span>
                    <p
                      className={`truncate text-xs font-medium leading-none whitespace-nowrap ${BUDGET_GROUP_TEXT_CLASS.needs}`}
                    >
                      {HISTORY_OVERSPEND_LABEL}
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
