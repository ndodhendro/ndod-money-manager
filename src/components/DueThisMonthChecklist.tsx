import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { areAllCollapseOpen, setCollapseOpen } from '../lib/collapseState'
import { formatDateLabel, todayIso } from '../lib/format'
import {
  getRecurringBillDisplayParts,
  sortRecurringBillsForChecklist,
} from '../lib/recurringBillDisplay'
import {
  currentMonthCursor,
  monthCursorKey,
  recurringOccurredOn,
  type MonthCursor,
} from '../lib/monthCursor'
import { getStoredProfile } from '../lib/profile'
import {
  effectiveAmount,
  effectiveDueDay,
  markBillPaid,
  unmarkBillPaid,
  upsertRecurringBillMonthOverride,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
} from '../lib/recurringBillsApi'
import { createTransaction, deleteTransaction } from '../lib/transactionsApi'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { GroupedListFrame } from './GroupedListFrame'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
import { CollapsibleSection } from './CollapsibleSection'
import { RecurringBillRowContent } from './RecurringBillRowContent'
import { RecurringMonthOverrideSheet } from './RecurringMonthOverrideSheet'

export type RecurringFocusState = { focusDue?: boolean }

const EMPTY_OVERRIDE_BY_BILL_ID = new Map<string, RecurringBillMonthOverride>()

interface DueThisMonthChecklistProps {
  cursor: MonthCursor
  bills: RecurringBill[]
  logByBillId: Map<string, RecurringBillLog>
  overrideByBillId?: Map<string, RecurringBillMonthOverride>
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
  overrideByBillId: Map<string, RecurringBillMonthOverride>,
): Array<[string, RecurringBill[]]> {
  const map = new Map<string, RecurringBill[]>()
  for (const bill of bills) {
    const date = recurringOccurredOn(
      cursor,
      effectiveDueDay(bill, overrideByBillId.get(bill.id)),
    )
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
  overrideByBillId: Map<string, RecurringBillMonthOverride>,
): string | null {
  const today = todayIso()
  for (const bill of bills) {
    if (logByBillId.has(bill.id)) continue
    if (
      recurringOccurredOn(
        cursor,
        effectiveDueDay(bill, overrideByBillId.get(bill.id)),
      ) <= today
    ) {
      return bill.id
    }
  }
  return null
}

export function DueThisMonthChecklist({
  cursor,
  bills,
  logByBillId,
  overrideByBillId: overrideByBillIdProp,
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
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null)
  const [savingOverride, setSavingOverride] = useState(false)
  const yearMonth = monthCursorKey(cursor)
  const overrideByBillId = overrideByBillIdProp ?? EMPTY_OVERRIDE_BY_BILL_ID
  const { byId } = useCategories(undefined, { includeInactive: true })
  const { buckets } = useBuckets()
  const bucketsById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b])),
    [buckets],
  )

  const sortedBills = useMemo(
    () =>
      sortRecurringBillsForChecklist(
        bills,
        logByBillId,
        cursor,
        byId,
        overrideByBillId,
      ),
    [bills, logByBillId, cursor, byId, overrideByBillId],
  )
  const groupedBills = useMemo(
    () => groupByOccurredOn(sortedBills, cursor, overrideByBillId),
    [sortedBills, cursor, overrideByBillId],
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

    const targetId = firstDueUncheckedId(
      sortedBills,
      logByBillId,
      cursor,
      overrideByBillId,
    )
    navigate('.', { replace: true, state: null })
    if (!targetId) return

    const target = sortedBills.find((b) => b.id === targetId)
    if (!target) return
    const date = recurringOccurredOn(
      cursor,
      effectiveDueDay(target, overrideByBillId.get(target.id)),
    )
    setCollapseOpen(`plan:recurring:day:${date}`, true)
    setDayGroupsExpanded(true)
    setDayGroupsVersion((v) => v + 1)
    setFocusBillId(targetId)
  }, [
    location.state,
    loading,
    sortedBills,
    logByBillId,
    overrideByBillId,
    cursor,
    navigate,
  ])

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

        const override = overrideByBillId.get(bill.id)
        const amount = effectiveAmount(bill, override)
        const dueDay = effectiveDueDay(bill, override)
        const occurredOn = recurringOccurredOn(cursor, dueDay)
        const owner = bill.owner ?? getStoredProfile() ?? 'suami'
        const circle = bill.type === 'income' ? 'hd_family' : bill.circle
        const txId = await createTransaction(
          bill.type === 'transfer'
            ? {
                type: 'transfer',
                category_id: null,
                from_bucket_id: bill.from_bucket_id,
                to_bucket_id: bill.to_bucket_id,
                amount,
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
                amount,
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

  async function handleSaveOverride(input: {
    amount: number
    dueDay: number
  }) {
    if (!editingBill || savingOverride) return
    setSavingOverride(true)
    try {
      await upsertRecurringBillMonthOverride({
        billId: editingBill.id,
        yearMonth,
        amount: input.amount,
        dueDay: input.dueDay,
        templateAmount: editingBill.amount,
        templateDueDay: editingBill.due_day,
      })
      setEditingBill(null)
      showAppToast(`Saved ${ActionEmoji.save}`)
      onChanged()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingOverride(false)
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

  const editingOverride = editingBill
    ? overrideByBillId.get(editingBill.id)
    : undefined

  const content = (
    <>
      <GroupedListFrame
        label={embedded ? 'Recurring Checklist' : 'Recurring this month'}
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
                  const override = overrideByBillId.get(bill.id)
                  const amount = effectiveAmount(bill, override)
                  const dueDay = effectiveDueDay(bill, override)
                  const dueOrOverdue =
                    !done && recurringOccurredOn(cursor, dueDay) <= todayIso()
                  const justChecked = justCheckedId === bill.id
                  const displayBill = { ...bill, amount, due_day: dueDay }
                  const display = getRecurringBillDisplayParts(
                    bill,
                    byId,
                    bucketsById,
                  )
                  const label =
                    bill.name.trim() || display.parentName || 'recurring item'
                  return (
                    <div
                      key={bill.id}
                      id={`recurring-bill-${bill.id}`}
                      className={`relative flex w-full items-center gap-1 rounded-xl border-2 shadow-sm transition-colors ${
                        justChecked
                          ? 'border-transparent tx-row-highlight'
                          : dueOrOverdue
                            ? 'recurring-due-highlight bg-white dark:bg-neutral-800'
                            : 'border-transparent bg-white dark:bg-neutral-800'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggle(bill, done)}
                        aria-label={
                          done ? `Uncheck ${label}` : `Check ${label}`
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left disabled:opacity-60"
                      >
                        <ChecklistCheckbox checked={done} />
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <RecurringBillRowContent
                            bill={displayBill}
                            display={display}
                            done={done}
                            monthCursor={cursor}
                            currentMonthDone={
                              currentMonthDoneByBillId?.has(bill.id) ?? done
                            }
                          />
                        </div>
                      </button>
                      {!done ? (
                        <button
                          type="button"
                          disabled={busy || savingOverride}
                          onClick={() => setEditingBill(bill)}
                          aria-label={`Edit ${label} for this month`}
                          title="Edit This Month"
                          className="mr-2 shrink-0 rounded-lg px-2 py-2 text-base leading-none disabled:opacity-60"
                        >
                          {ActionEmoji.edit}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </CollapsibleDayGroup>
          ))}
        </div>
      </GroupedListFrame>

      <RecurringMonthOverrideSheet
        open={editingBill != null}
        bill={editingBill}
        cursor={cursor}
        initialAmount={
          editingBill
            ? effectiveAmount(editingBill, editingOverride)
            : 0
        }
        initialDueDay={
          editingBill
            ? effectiveDueDay(editingBill, editingOverride)
            : 1
        }
        busy={savingOverride}
        onClose={() => {
          if (savingOverride) return
          setEditingBill(null)
        }}
        onSave={(input) => void handleSaveOverride(input)}
      />
    </>
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
