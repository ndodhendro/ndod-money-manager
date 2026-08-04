import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { areAllCollapseOpen, setCollapseOpen } from '../lib/collapseState'
import { formatDateLabel, todayIso } from '../lib/format'
import { getRecurringBillDisplayParts } from '../lib/recurringBillDisplay'
import {
  currentMonthCursor,
  monthCursorKey,
  recurringOccurredOn,
  type MonthCursor,
} from '../lib/monthCursor'
import { getStoredProfile } from '../lib/profile'
import {
  markBillPaid,
  sortRecurringBillsForChecklist,
  unmarkBillPaid,
  type RecurringBill,
  type RecurringBillLog,
} from '../lib/recurringBillsApi'
import { createTransaction, deleteTransaction } from '../lib/transactionsApi'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { GroupedListFrame } from './GroupedListFrame'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
import { CollapsibleSection } from './CollapsibleSection'
import { RecurringBillRowContent } from './RecurringBillRowContent'

export type RecurringFocusState = { focusDue?: boolean }

interface DueThisMonthChecklistProps {
  cursor: MonthCursor
  bills: RecurringBill[]
  logByBillId: Map<string, RecurringBillLog>
  /** Bills already checked in the calendar current month (for "X months left"). */
  currentMonthDoneByBillId?: Set<string>
  loading: boolean
  available: boolean
  onChanged: () => void
  embedded?: boolean
}

function groupByOccurredOn(
  bills: RecurringBill[],
  cursor: MonthCursor,
): Array<[string, RecurringBill[]]> {
  const map = new Map<string, RecurringBill[]>()
  for (const bill of bills) {
    const date = recurringOccurredOn(cursor, bill.due_day)
    const list = map.get(date) ?? []
    list.push(bill)
    map.set(date, list)
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
}

function ChecklistCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
        checked
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
      }`}
      aria-hidden
    >
      {checked ? (
        <svg
          viewBox="0 0 12 12"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6l2.5 2.5 4.5-5" />
        </svg>
      ) : null}
    </span>
  )
}

function firstDueUncheckedId(
  bills: RecurringBill[],
  logByBillId: Map<string, RecurringBillLog>,
  cursor: MonthCursor,
): string | null {
  const today = todayIso()
  for (const bill of bills) {
    if (logByBillId.has(bill.id)) continue
    if (recurringOccurredOn(cursor, bill.due_day) <= today) return bill.id
  }
  return null
}

export function DueThisMonthChecklist({
  cursor,
  bills,
  logByBillId,
  currentMonthDoneByBillId,
  loading,
  available,
  onChanged,
  embedded = false,
}: DueThisMonthChecklistProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [justCheckedId, setJustCheckedId] = useState<string | null>(null)
  const [focusBillId, setFocusBillId] = useState<string | null>(null)
  const [dayGroupsExpanded, setDayGroupsExpanded] = useState(true)
  const [dayGroupsVersion, setDayGroupsVersion] = useState(0)
  const yearMonth = monthCursorKey(cursor)
  const { byId } = useCategories(undefined, { includeInactive: true })
  const { buckets } = useBuckets()
  const bucketsById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b])),
    [buckets],
  )

  const sortedBills = useMemo(
    () => sortRecurringBillsForChecklist(bills, logByBillId, cursor),
    [bills, logByBillId, cursor],
  )
  const groupedBills = useMemo(
    () => groupByOccurredOn(sortedBills, cursor),
    [sortedBills, cursor],
  )
  const dayPersistKeys = useMemo(
    () => groupedBills.map(([date]) => `plan:recurring:day:${date}`),
    [groupedBills],
  )

  useEffect(() => {
    if (dayGroupsVersion > 0) return
    setDayGroupsExpanded(areAllCollapseOpen(dayPersistKeys, true))
  }, [dayPersistKeys, dayGroupsVersion])

  useEffect(() => {
    if (!justCheckedId) return
    const t = window.setTimeout(() => setJustCheckedId(null), 1600)
    return () => window.clearTimeout(t)
  }, [justCheckedId])

  // FAB → scroll to first due/overdue unchecked item (current month only).
  useEffect(() => {
    const focusDue = (location.state as RecurringFocusState | null)?.focusDue
    if (!focusDue || loading) return
    if (monthCursorKey(cursor) !== monthCursorKey(currentMonthCursor())) return

    const targetId = firstDueUncheckedId(sortedBills, logByBillId, cursor)
    navigate('.', { replace: true, state: null })
    if (!targetId) return

    const target = sortedBills.find((b) => b.id === targetId)
    if (!target) return
    const date = recurringOccurredOn(cursor, target.due_day)
    setCollapseOpen(`plan:recurring:day:${date}`, true)
    setDayGroupsExpanded(true)
    setDayGroupsVersion((v) => v + 1)
    setFocusBillId(targetId)
  }, [location.state, loading, sortedBills, logByBillId, cursor, navigate])

  useEffect(() => {
    if (!focusBillId || loading) return
    const t = window.setTimeout(() => {
      document
        .getElementById(`recurring-bill-${focusBillId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [focusBillId, loading, dayGroupsVersion, groupedBills])

  const doneCount = useMemo(
    () => sortedBills.filter((b) => logByBillId.has(b.id)).length,
    [sortedBills, logByBillId],
  )

  async function handleToggle(bill: RecurringBill, done: boolean) {
    if (busyId) return
    setBusyId(bill.id)
    try {
      if (done) {
        const { transactionId } = await unmarkBillPaid(bill.id, yearMonth)
        if (transactionId) {
          try {
            await deleteTransaction(transactionId)
          } catch {
            // Log cleared even if tx already gone
          }
        }
        showAppToast('Marked undone')
      } else {
        if (bill.type === 'transfer') {
          if (
            bill.from_bucket_id === bill.to_bucket_id ||
            (!bill.from_bucket_id && !bill.to_bucket_id)
          ) {
            showAppToast('Fix From/To for this transfer in Settings')
            return
          }
        } else if (!bill.category_id) {
          showAppToast('Set a category for this item in Settings')
          return
        }

        const occurredOn = recurringOccurredOn(cursor, bill.due_day)
        const owner = bill.owner ?? getStoredProfile() ?? 'suami'
        const circle = bill.type === 'income' ? 'hd_family' : bill.circle
        const txId = await createTransaction(
          bill.type === 'transfer'
            ? {
                type: 'transfer',
                category_id: null,
                from_bucket_id: bill.from_bucket_id,
                to_bucket_id: bill.to_bucket_id,
                amount: bill.amount,
                description: bill.name,
                owner,
                circle,
                occurred_on: occurredOn,
                is_recurring: true,
              }
            : {
                type: bill.type,
                category_id: bill.category_id,
                from_bucket_id: null,
                to_bucket_id: null,
                amount: bill.amount,
                description: bill.name,
                owner,
                circle,
                occurred_on: occurredOn,
                is_recurring: true,
              },
        )
        await markBillPaid({
          billId: bill.id,
          yearMonth,
          transactionId: txId,
        })
        setJustCheckedId(bill.id)
        showAppToast(`Logged ${ActionEmoji.save}`)
      }
      onChanged()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  if (!available) {
    return (
      <section className={embedded ? '' : 'mt-6'}>
        {!embedded && (
          <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            This month
          </p>
        )}
        <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
          Run migration{' '}
          <code className="text-xs">migrate_recurring_bills.sql</code> in
          Supabase, then add items in Settings → Recurring.
        </p>
      </section>
    )
  }

  if (loading) {
    return (
      <section className={embedded ? '' : 'mt-6'}>
        <p className="text-sm text-neutral-400">Loading…</p>
      </section>
    )
  }

  if (sortedBills.length === 0) {
    return (
      <section className={embedded ? '' : 'mt-6'}>
        {!embedded && (
          <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            This month
          </p>
        )}
        <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
          No recurring items yet. Add them in Settings → Recurring.
        </p>
      </section>
    )
  }

  const content = (
    <GroupedListFrame
      expanded={dayGroupsExpanded}
      onToggle={(expanded) => {
        setDayGroupsExpanded(expanded)
        setDayGroupsVersion((v) => v + 1)
      }}
    >
      <div className="space-y-5">
        {groupedBills.map(([date, items]) => (
          <CollapsibleDayGroup
            key={date}
            title={formatDateLabel(date)}
            persistKey={`plan:recurring:day:${date}`}
            forceOpen={dayGroupsVersion > 0 ? dayGroupsExpanded : undefined}
            forceVersion={dayGroupsVersion}
          >
            <div className="space-y-2">
              {items.map((bill) => {
                const done = logByBillId.has(bill.id)
                const busy = busyId === bill.id
                const dueOrOverdue =
                  !done &&
                  recurringOccurredOn(cursor, bill.due_day) <= todayIso()
                const justChecked = justCheckedId === bill.id
                const display = getRecurringBillDisplayParts(
                  bill,
                  byId,
                  bucketsById,
                )
                const label =
                  bill.name.trim() || display.parentName || 'recurring item'
                return (
                  <button
                    key={bill.id}
                    id={`recurring-bill-${bill.id}`}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggle(bill, done)}
                    aria-label={done ? `Uncheck ${label}` : `Check ${label}`}
                    className={`relative flex w-full items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left shadow-sm transition-colors disabled:opacity-60 ${
                      justChecked
                        ? 'border-transparent tx-row-highlight'
                        : dueOrOverdue
                          ? 'recurring-due-highlight bg-white dark:bg-neutral-800'
                          : 'border-transparent bg-white dark:bg-neutral-800'
                    }`}
                  >
                    <ChecklistCheckbox checked={done} />
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <RecurringBillRowContent
                        bill={bill}
                        display={display}
                        done={done}
                        monthCursor={cursor}
                        currentMonthDone={
                          currentMonthDoneByBillId?.has(bill.id) ?? done
                        }
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </CollapsibleDayGroup>
        ))}
      </div>
    </GroupedListFrame>
  )

  if (embedded) return content

  return (
    <CollapsibleSection
      title="Recurring this month"
      subtitle={`${doneCount}/${sortedBills.length} done`}
      defaultOpen
      className="mt-6"
      persistKey="plan:recurring:section"
    >
      {content}
    </CollapsibleSection>
  )
}
