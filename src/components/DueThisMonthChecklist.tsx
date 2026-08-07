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
  isRecurringSkipped,
  markBillPaid,
  setRecurringBillMonthSkipped,
  unmarkBillPaid,
  upsertRecurringBillMonthOverride,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
} from '../lib/recurringBillsApi'
import { createTransaction, deleteTransaction } from '../lib/transactionsApi'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { ConfirmDialog } from './ConfirmDialog'
import { GroupedListFrame } from './GroupedListFrame'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
import { CollapsibleSection } from './CollapsibleSection'
import { RecurringBillRowContent } from './RecurringBillRowContent'
import { RecurringMonthOverrideSheet } from './RecurringMonthOverrideSheet'
import { SwipeDeleteRow } from './SwipeDeleteRow'

export type RecurringFocusState = { focusDue?: boolean }

const EMPTY_OVERRIDE_BY_BILL_ID = new Map<string, RecurringBillMonthOverride>()

type ChecklistStatus = 'unchecked' | 'checked' | 'skipped'

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

function dayPersistKey(status: ChecklistStatus, date: string): string {
  return `plan:recurring:${status}:day:${date}`
}

function groupByOccurredOn(
  bills: RecurringBill[],
  cursor: MonthCursor,
  overrideByBillId: Map<string, RecurringBillMonthOverride>,
  dateOrder: 'asc' | 'desc' = 'desc',
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
  return [...map.entries()].sort(([a], [b]) =>
    dateOrder === 'asc' ? (a < b ? -1 : 1) : a < b ? 1 : -1,
  )
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
  isSkipped: (billId: string) => boolean,
): string | null {
  const today = todayIso()
  for (const bill of bills) {
    if (logByBillId.has(bill.id)) continue
    if (isSkipped(bill.id)) continue
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
  /** Per-status expand-all for date groups inside Unchecked / Checked / Skipped. */
  const [sectionDayForce, setSectionDayForce] = useState<
    Record<ChecklistStatus, { expanded: boolean; version: number }>
  >({
    unchecked: { expanded: true, version: 0 },
    checked: { expanded: true, version: 0 },
    skipped: { expanded: true, version: 0 },
  })
  const [allExpanded, setAllExpanded] = useState(true)
  /** Bumps when a single day group toggles so section chevrons re-sync. */
  const [collapseTick, setCollapseTick] = useState(0)
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null)
  const [savingOverride, setSavingOverride] = useState(false)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingSkipBill, setPendingSkipBill] = useState<RecurringBill | null>(
    null,
  )
  const [pendingRestoreBill, setPendingRestoreBill] =
    useState<RecurringBill | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [restoring, setRestoring] = useState(false)
  /** Local check state while the server catch-up reload is in flight. */
  const [pendingDone, setPendingDone] = useState<Map<string, boolean>>(
    () => new Map(),
  )
  /** Local skip state while reload catches up. */
  const [pendingSkipped, setPendingSkipped] = useState<Map<string, boolean>>(
    () => new Map(),
  )
  const yearMonth = monthCursorKey(cursor)
  const overrideByBillId = overrideByBillIdProp ?? EMPTY_OVERRIDE_BY_BILL_ID
  const { byId } = useCategories(undefined, { includeInactive: true })
  const { buckets } = useBuckets()
  const bucketsById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b])),
    [buckets],
  )

  // Drop optimistic entries once props match (silent reload finished).
  useEffect(() => {
    setPendingDone((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const [id, done] of prev) {
        if (logByBillId.has(id) === done) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [logByBillId])

  useEffect(() => {
    setPendingSkipped((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const [id, skipped] of prev) {
        if (isRecurringSkipped(overrideByBillId.get(id)) === skipped) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [overrideByBillId])

  const effectiveLogByBillId = useMemo(() => {
    if (pendingDone.size === 0) return logByBillId
    const map = new Map(logByBillId)
    for (const [id, done] of pendingDone) {
      if (done) {
        if (!map.has(id)) {
          map.set(id, {
            id: `pending-${id}`,
            bill_id: id,
            year_month: yearMonth,
            transaction_id: 'pending',
            completed_at: new Date().toISOString(),
          })
        }
      } else {
        map.delete(id)
      }
    }
    return map
  }, [logByBillId, pendingDone, yearMonth])

  function isSkipped(billId: string): boolean {
    if (pendingSkipped.has(billId)) return pendingSkipped.get(billId) === true
    return isRecurringSkipped(overrideByBillId.get(billId))
  }

  const sortedBills = useMemo(
    () =>
      sortRecurringBillsForChecklist(
        bills,
        effectiveLogByBillId,
        cursor,
        byId,
        overrideByBillId,
      ),
    [bills, effectiveLogByBillId, cursor, byId, overrideByBillId],
  )
  const statusSections = useMemo(() => {
    const unchecked: RecurringBill[] = []
    const checked: RecurringBill[] = []
    const skipped: RecurringBill[] = []
    for (const bill of sortedBills) {
      if (isSkipped(bill.id)) {
        skipped.push(bill)
        continue
      }
      if (effectiveLogByBillId.has(bill.id)) checked.push(bill)
      else unchecked.push(bill)
    }
    const sections: Array<{
      status: ChecklistStatus
      label: string
      groups: Array<[string, RecurringBill[]]>
    }> = []
    if (unchecked.length > 0) {
      sections.push({
        status: 'unchecked',
        label: 'Unchecked',
        groups: groupByOccurredOn(unchecked, cursor, overrideByBillId, 'asc'),
      })
    }
    if (checked.length > 0) {
      sections.push({
        status: 'checked',
        label: 'Checked',
        groups: groupByOccurredOn(checked, cursor, overrideByBillId),
      })
    }
    if (skipped.length > 0) {
      sections.push({
        status: 'skipped',
        label: 'Skipped',
        groups: groupByOccurredOn(skipped, cursor, overrideByBillId),
      })
    }
    return sections
    // isSkipped reads pendingSkipped + overrideByBillId
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingSkipped intentional
  }, [
    sortedBills,
    effectiveLogByBillId,
    cursor,
    overrideByBillId,
    pendingSkipped,
  ])

  const dayPersistKeysByStatus = useMemo(() => {
    const map: Record<ChecklistStatus, string[]> = {
      unchecked: [],
      checked: [],
      skipped: [],
    }
    for (const section of statusSections) {
      map[section.status] = section.groups.map(([date]) =>
        dayPersistKey(section.status, date),
      )
    }
    return map
  }, [statusSections])

  const dayPersistKeys = useMemo(
    () => [
      ...dayPersistKeysByStatus.unchecked,
      ...dayPersistKeysByStatus.checked,
      ...dayPersistKeysByStatus.skipped,
    ],
    [dayPersistKeysByStatus],
  )

  const sectionDayForceKey = `${sectionDayForce.unchecked.version}:${sectionDayForce.checked.version}:${sectionDayForce.skipped.version}`

  useEffect(() => {
    setSectionDayForce((prev) => {
      let changed = false
      const next = { ...prev }
      for (const status of ['unchecked', 'checked', 'skipped'] as const) {
        const expanded = areAllCollapseOpen(
          dayPersistKeysByStatus[status],
          true,
        )
        if (prev[status].expanded !== expanded) {
          next[status] = { ...prev[status], expanded }
          changed = true
        }
      }
      return changed ? next : prev
    })
    setAllExpanded(areAllCollapseOpen(dayPersistKeys, true))
  }, [
    dayPersistKeys,
    dayPersistKeysByStatus,
    sectionDayForceKey,
    collapseTick,
  ])

  useEffect(() => {
    if (!justCheckedId) return
    const t = window.setTimeout(() => setJustCheckedId(null), 1600)
    return () => window.clearTimeout(t)
  }, [justCheckedId])

  function toggleSectionDays(status: ChecklistStatus, expanded: boolean) {
    setSectionDayForce((prev) => ({
      ...prev,
      [status]: { expanded, version: prev[status].version + 1 },
    }))
  }

  function toggleAllExpanded(expanded: boolean) {
    setAllExpanded(expanded)
    setSectionDayForce((prev) => ({
      unchecked: { expanded, version: prev.unchecked.version + 1 },
      checked: { expanded, version: prev.checked.version + 1 },
      skipped: { expanded, version: prev.skipped.version + 1 },
    }))
  }

  // FAB → scroll to first due/overdue unchecked item (current month only).
  useEffect(() => {
    const focusDue = (location.state as RecurringFocusState | null)?.focusDue
    if (!focusDue || loading) return
    if (monthCursorKey(cursor) !== monthCursorKey(currentMonthCursor())) return

    const targetId = firstDueUncheckedId(
      sortedBills,
      effectiveLogByBillId,
      cursor,
      overrideByBillId,
      isSkipped,
    )
    navigate('.', { replace: true, state: null })
    if (!targetId) return

    const target = sortedBills.find((b) => b.id === targetId)
    if (!target) return
    const date = recurringOccurredOn(
      cursor,
      effectiveDueDay(target, overrideByBillId.get(target.id)),
    )
    setCollapseOpen(dayPersistKey('unchecked', date), true)
    setSectionDayForce((prev) => ({
      ...prev,
      unchecked: { expanded: true, version: prev.unchecked.version + 1 },
    }))
    setFocusBillId(targetId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSkipped via pendingSkipped
  }, [
    location.state,
    loading,
    sortedBills,
    effectiveLogByBillId,
    overrideByBillId,
    pendingSkipped,
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
  }, [focusBillId, loading, sectionDayForceKey, statusSections])

  const doneCount = useMemo(
    () =>
      sortedBills.filter(
        (b) => effectiveLogByBillId.has(b.id) && !isSkipped(b.id),
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSkipped via pendingSkipped
    [sortedBills, effectiveLogByBillId, pendingSkipped, overrideByBillId],
  )

  const activeCount = useMemo(
    () => sortedBills.filter((b) => !isSkipped(b.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSkipped via pendingSkipped
    [sortedBills, pendingSkipped, overrideByBillId],
  )

  async function handleToggle(bill: RecurringBill, done: boolean) {
    if (busyId) return
    if (isSkipped(bill.id)) return
    setBusyId(bill.id)
    setPendingDone((prev) => {
      const next = new Map(prev)
      next.set(bill.id, !done)
      return next
    })
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
            setPendingDone((prev) => {
              const next = new Map(prev)
              next.delete(bill.id)
              return next
            })
            return
          }
        } else if (!bill.category_id) {
          showAppToast('Set a category for this item in Settings')
          setPendingDone((prev) => {
            const next = new Map(prev)
            next.delete(bill.id)
            return next
          })
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
      setPendingDone((prev) => {
        const next = new Map(prev)
        next.delete(bill.id)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmSkip() {
    const bill = pendingSkipBill
    if (!bill || skipping) return
    setSkipping(true)
    setPendingSkipped((prev) => {
      const next = new Map(prev)
      next.set(bill.id, true)
      return next
    })
    try {
      await setRecurringBillMonthSkipped(bill.id, yearMonth, true)
      setPendingSkipBill(null)
      setOpenSwipeId(null)
      showAppToast(`Skipped ${ActionEmoji.delete}`)
      onChanged()
    } catch (err) {
      setPendingSkipped((prev) => {
        const next = new Map(prev)
        next.delete(bill.id)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to skip')
    } finally {
      setSkipping(false)
    }
  }

  async function confirmRestore() {
    const bill = pendingRestoreBill
    if (!bill || restoring) return
    setRestoring(true)
    setPendingSkipped((prev) => {
      const next = new Map(prev)
      next.set(bill.id, false)
      return next
    })
    try {
      await setRecurringBillMonthSkipped(bill.id, yearMonth, false)
      setPendingRestoreBill(null)
      showAppToast(`Restored ${ActionEmoji.restore}`)
      onChanged()
    } catch (err) {
      setPendingSkipped((prev) => {
        const next = new Map(prev)
        next.delete(bill.id)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to restore')
    } finally {
      setRestoring(false)
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

  if (loading && bills.length === 0) {
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
        expanded={allExpanded}
        onToggle={toggleAllExpanded}
      >
        <div className="space-y-5">
          {statusSections.map((section) => {
            const force = sectionDayForce[section.status]
            return (
              <GroupedListFrame
                key={section.status}
                label={section.label}
                expanded={force.expanded}
                onToggle={(expanded) =>
                  toggleSectionDays(section.status, expanded)
                }
              >
                <div className="space-y-5">
                  {section.groups.map(([date, items]) => (
                    <CollapsibleDayGroup
                      key={`${section.status}-${date}`}
                      title={formatDateLabel(date)}
                      persistKey={dayPersistKey(section.status, date)}
                      forceOpen={
                        force.version > 0 ? force.expanded : undefined
                      }
                      forceVersion={force.version}
                      onOpenChange={() => {
                        setCollapseTick((n) => n + 1)
                      }}
                    >
                      <div className="space-y-2">
                        {items.map((bill) => {
                          const skipped = section.status === 'skipped'
                          const done =
                            !skipped && effectiveLogByBillId.has(bill.id)
                          const busy = busyId === bill.id
                          const override = overrideByBillId.get(bill.id)
                          const amount = effectiveAmount(bill, override)
                          const dueDay = effectiveDueDay(bill, override)
                          const dueOrOverdue =
                            section.status === 'unchecked' &&
                            recurringOccurredOn(cursor, dueDay) <= todayIso()
                          const justChecked = justCheckedId === bill.id
                          const displayBill = {
                            ...bill,
                            amount,
                            due_day: dueDay,
                          }
                          const display = getRecurringBillDisplayParts(
                            bill,
                            byId,
                            bucketsById,
                          )
                          const label =
                            bill.name.trim() ||
                            display.parentName ||
                            'recurring item'
                          const currentMonthDone =
                            yearMonth === monthCursorKey(currentMonthCursor())
                              ? done
                              : (currentMonthDoneByBillId?.has(bill.id) ??
                                false)
                          const rowInner = (
                            <>
                              {!skipped ? (
                                <span className="shrink-0">
                                  <ChecklistCheckbox checked={done} />
                                </span>
                              ) : null}
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <RecurringBillRowContent
                                  bill={displayBill}
                                  display={display}
                                  done={done}
                                  inactive={skipped}
                                  monthCursor={cursor}
                                  currentMonthDone={currentMonthDone}
                                />
                              </div>
                            </>
                          )

                          if (skipped) {
                            return (
                              <div
                                key={bill.id}
                                id={`recurring-bill-${bill.id}`}
                                className="relative flex w-full items-center gap-1 rounded-xl border-2 border-transparent bg-white shadow-sm dark:bg-neutral-800"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
                                  {rowInner}
                                </div>
                                <button
                                  type="button"
                                  disabled={busy || restoring}
                                  onClick={() => setPendingRestoreBill(bill)}
                                  aria-label={`Restore ${label}`}
                                  title="Restore"
                                  className="mr-2 shrink-0 rounded-lg px-2 py-2 text-base leading-none disabled:opacity-60"
                                >
                                  {ActionEmoji.restore}
                                </button>
                              </div>
                            )
                          }

                          if (section.status === 'unchecked') {
                            return (
                              <div
                                key={bill.id}
                                id={`recurring-bill-${bill.id}`}
                                className={`rounded-xl border-2 transition-colors ${
                                  justChecked
                                    ? 'border-transparent'
                                    : dueOrOverdue
                                      ? 'recurring-due-highlight'
                                      : 'border-transparent'
                                }`}
                              >
                                <SwipeDeleteRow
                                  open={openSwipeId === bill.id}
                                  onOpenChange={(open) =>
                                    setOpenSwipeId(open ? bill.id : null)
                                  }
                                  onDelete={() => {
                                    setOpenSwipeId(bill.id)
                                    setPendingSkipBill(bill)
                                  }}
                                  deleteAriaLabel={`Skip ${label} for this month`}
                                  highlighted={justChecked}
                                  onContentClick={() => {
                                    if (busy) return
                                    void handleToggle(bill, done)
                                  }}
                                  trailing={
                                    <button
                                      type="button"
                                      disabled={busy || savingOverride}
                                      onClick={() => {
                                        setOpenSwipeId(null)
                                        setEditingBill(bill)
                                      }}
                                      aria-label={`Edit ${label} for this month`}
                                      title="Edit This Month"
                                      className="rounded-lg px-2 py-2 text-base leading-none disabled:opacity-60"
                                    >
                                      {ActionEmoji.edit}
                                    </button>
                                  }
                                >
                                  {rowInner}
                                </SwipeDeleteRow>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={bill.id}
                              id={`recurring-bill-${bill.id}`}
                              className={`relative flex w-full items-center gap-1 rounded-xl border-2 shadow-sm transition-colors ${
                                justChecked
                                  ? 'border-transparent tx-row-highlight'
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
                                {rowInner}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </CollapsibleDayGroup>
                  ))}
                </div>
              </GroupedListFrame>
            )
          })}
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

      <ConfirmDialog
        open={pendingSkipBill != null}
        title="Skip for This Month?"
        message="It moves to Skipped. You can restore it anytime this month."
        confirmLabel="Skip"
        cancelLabel="Cancel"
        busyLabel="Skipping…"
        busy={skipping}
        onCancel={() => {
          if (skipping) return
          setPendingSkipBill(null)
        }}
        onConfirm={() => void confirmSkip()}
      />

      <ConfirmDialog
        open={pendingRestoreBill != null}
        title="Restore for This Month?"
        message="It moves back to Unchecked."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        busyLabel="Restoring…"
        danger={false}
        busy={restoring}
        onCancel={() => {
          if (restoring) return
          setPendingRestoreBill(null)
        }}
        onConfirm={() => void confirmRestore()}
      />
    </>
  )

  if (embedded) return content

  return (
    <CollapsibleSection
      title="Recurring this month"
      subtitle={`${doneCount}/${activeCount} done`}
      defaultOpen
      className="mt-6"
      persistKey="plan:recurring:section"
    >
      {content}
    </CollapsibleSection>
  )
}
