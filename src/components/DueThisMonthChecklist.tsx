import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { areAllCollapseOpen } from '../lib/collapseState'
import { formatDateLabel, formatRupiah, todayIso } from '../lib/format'
import {
  getRecurringBillDisplayParts,
  sortRecurringOccurrencesForChecklist,
  type RecurringChecklistOccurrence,
} from '../lib/recurringBillDisplay'
import {
  currentMonthCursor,
  monthCursorKey,
  monthCursorRange,
  type MonthCursor,
} from '../lib/monthCursor'
import { getStoredProfile } from '../lib/profile'
import {
  effectiveDueDay,
  isOccurrenceSkipped,
  markBillPaid,
  occurrenceLogKey,
  occurrencesInMonth,
  setRecurringBillOccurrenceSkipped,
  unmarkBillPaid,
  upsertRecurringBillMonthOverride,
  type RecurringBill,
  type RecurringBillLog,
  type RecurringBillMonthOverride,
} from '../lib/recurringBillsApi'
import { createTransaction, deleteTransaction } from '../lib/transactionsApi'
import { resolveExpenseFromBucketId } from '../lib/bucketsApi'
import {
  efLoanConfirmMessage,
  evaluateExpenseEfLoan,
  resolveMonthWritePolicy,
} from '../lib/budgetSaveGate'
import { upsertEfLoanForTransaction } from '../lib/efLoansApi'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { useFreeGuiltyProgress } from '../hooks/useFreeGuiltyProgress'
import { usePyfSettings } from '../hooks/usePyfSettings'
import { useTransactions } from '../hooks/useTransactions'
import {
  isPyfAutoAmountTransfer,
  resolveEstimateAmount,
  sumMonthRegularIncome,
} from '../lib/moneyPlan'
import { isBlankSearch, matchesRecurringBillSearch } from '../lib/listSearch'
import {
  estimatePlanBadgeGroup,
  estimatePlanTag,
} from '../lib/freeWants'
import type { EfLoanSource, NewTransactionInput } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { GroupedListFrame } from './GroupedListFrame'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
import { CollapsibleSection } from './CollapsibleSection'
import { RecurringBillRowContent } from './RecurringBillRowContent'
import { RecurringMonthOverrideSheet } from './RecurringMonthOverrideSheet'
import { SearchField } from './SearchField'
import { SwipeDeleteRow } from './SwipeDeleteRow'

const EMPTY_OVERRIDE_BY_BILL_ID = new Map<string, RecurringBillMonthOverride>()
const EMPTY_LOG_BY_OCCURRENCE = new Map<string, RecurringBillLog>()
const EMPTY_SKIPPED_OCCURRENCE_KEYS = new Set<string>()

type ChecklistStatus = 'due' | 'unchecked' | 'checked' | 'skipped'

/** plan = skipped only; dueInbox = due/overdue only (Transactions). */
export type RecurringChecklistVariant = 'plan' | 'dueInbox'

interface DueThisMonthChecklistProps {
  cursor: MonthCursor
  bills: RecurringBill[]
  /** Preferred: one log entry per bill occurrence date. */
  logByOccurrenceKey?: Map<string, RecurringBillLog>
  /** @deprecated Prefer logByOccurrenceKey. */
  logByBillId?: Map<string, RecurringBillLog>
  overrideByBillId?: Map<string, RecurringBillMonthOverride>
  /** Occurrence keys (`billId:occurredOn`) soft-skipped this month. */
  skippedOccurrenceKeys?: Set<string>
  /** Bills already checked in the calendar current month (for "X left"). */
  currentMonthDoneByBillId?: Set<string>
  loading: boolean
  available: boolean
  onChanged: () => void
  embedded?: boolean
  variant?: RecurringChecklistVariant
  /** Partial-match filter across name, category, amount, owner, etc. */
  searchQuery?: string
  /**
   * When set (typically Transactions dueInbox + active search), shown if the
   * filtered checklist has no rows instead of returning null.
   */
  emptySearchMessage?: string
  /**
   * When true (Plan Skipped Items), render the search field above the list.
   * Parent-owned search via `searchQuery` / `onSearchQueryChange` can omit this.
   */
  showSearchField?: boolean
  onSearchQueryChange?: (value: string) => void
  /**
   * Parent expand/collapse-all (Transactions outer frame). Version bump forces
   * Due section + day groups open/closed together.
   */
  expandAll?: { expanded: boolean; version: number }
  /** Fired when a Due day group is toggled (parent syncs outer chevron). */
  onDayOpenChange?: () => void
}

function dayPersistKey(status: ChecklistStatus, date: string): string {
  if (status === 'due') return `transactions:due:day:${date}`
  return `plan:recurring:${status}:day:${date}`
}

function groupOccurrencesByDate(
  items: RecurringChecklistOccurrence[],
  dateOrder: 'asc' | 'desc' = 'desc',
): Array<[string, RecurringChecklistOccurrence[]]> {
  const map = new Map<string, RecurringChecklistOccurrence[]>()
  for (const item of items) {
    const list = map.get(item.occurredOn) ?? []
    list.push(item)
    map.set(item.occurredOn, list)
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

function resolveLogMap(
  logByOccurrenceKey: Map<string, RecurringBillLog> | undefined,
  logByBillId: Map<string, RecurringBillLog> | undefined,
  bills: RecurringBill[],
  yearMonth: string,
  overrideByBillId: Map<string, RecurringBillMonthOverride>,
): Map<string, RecurringBillLog> {
  if (logByOccurrenceKey) return logByOccurrenceKey
  if (!logByBillId) return EMPTY_LOG_BY_OCCURRENCE
  const map = new Map<string, RecurringBillLog>()
  for (const bill of bills) {
    const log = logByBillId.get(bill.id)
    if (!log) continue
    const dates = occurrencesInMonth(
      bill,
      yearMonth,
      overrideByBillId.get(bill.id),
    )
    const occurredOn = log.occurred_on || dates[0]
    if (!occurredOn) continue
    map.set(occurrenceLogKey(bill.id, occurredOn), {
      ...log,
      occurred_on: occurredOn,
    })
  }
  return map
}

export function DueThisMonthChecklist({
  cursor,
  bills,
  logByOccurrenceKey: logByOccurrenceKeyProp,
  logByBillId,
  overrideByBillId: overrideByBillIdProp,
  skippedOccurrenceKeys: skippedOccurrenceKeysProp,
  currentMonthDoneByBillId,
  loading,
  available,
  onChanged,
  embedded = false,
  variant = 'plan',
  searchQuery: searchQueryProp,
  emptySearchMessage,
  showSearchField = false,
  onSearchQueryChange,
  expandAll,
  onDayOpenChange,
}: DueThisMonthChecklistProps) {
  const navigate = useNavigate()
  const [internalSearchQuery, setInternalSearchQuery] = useState('')
  const searchQuery = searchQueryProp ?? internalSearchQuery
  const searchActive = !isBlankSearch(searchQuery)

  function handleSearchChange(value: string) {
    if (onSearchQueryChange) onSearchQueryChange(value)
    if (searchQueryProp === undefined) setInternalSearchQuery(value)
  }
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [justCheckedKey, setJustCheckedKey] = useState<string | null>(null)
  /** Per-status expand-all for date groups inside Due / Unchecked / Checked / Skipped. */
  const [sectionDayForce, setSectionDayForce] = useState<
    Record<ChecklistStatus, { expanded: boolean; version: number }>
  >({
    due: { expanded: true, version: 0 },
    unchecked: { expanded: true, version: 0 },
    checked: { expanded: true, version: 0 },
    skipped: { expanded: true, version: 0 },
  })
  const [allExpanded, setAllExpanded] = useState(true)
  /** Bumps when a single day group toggles so section chevrons re-sync. */
  const [collapseTick, setCollapseTick] = useState(0)
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null)
  const [editingOccurredOn, setEditingOccurredOn] = useState<string | null>(null)
  const [autoFocusAmount, setAutoFocusAmount] = useState(false)
  const [checkAfterEdit, setCheckAfterEdit] = useState(false)
  const [pendingAmountConfirm, setPendingAmountConfirm] = useState<{
    bill: RecurringBill
    occurredOn: string
  } | null>(null)
  const [pendingDoneConfirm, setPendingDoneConfirm] = useState<{
    bill: RecurringBill
    occurredOn: string
  } | null>(null)
  const [pendingEfConfirm, setPendingEfConfirm] = useState<{
    bill: RecurringBill
    occurredOn: string
    draft: NewTransactionInput
    borrowAmount: number
    source: EfLoanSource
    yearMonth: string
    amountOverride?: number
  } | null>(null)
  const [savingOverride, setSavingOverride] = useState(false)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [pendingSkip, setPendingSkip] = useState<{
    bill: RecurringBill
    occurredOn: string
  } | null>(null)
  const [pendingRestore, setPendingRestore] = useState<{
    bill: RecurringBill
    occurredOn: string
  } | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [restoring, setRestoring] = useState(false)
  /** Local check state while the server catch-up reload is in flight. */
  const [pendingDone, setPendingDone] = useState<Map<string, boolean>>(
    () => new Map(),
  )
  /** Local skip state while reload catches up (occurrence keys). */
  const [pendingSkipped, setPendingSkipped] = useState<Map<string, boolean>>(
    () => new Map(),
  )
  const yearMonth = monthCursorKey(cursor)
  const overrideByBillId = overrideByBillIdProp ?? EMPTY_OVERRIDE_BY_BILL_ID
  const skippedOccurrenceKeys =
    skippedOccurrenceKeysProp ?? EMPTY_SKIPPED_OCCURRENCE_KEYS
  const baseLogByOccurrenceKey = useMemo(
    () =>
      resolveLogMap(
        logByOccurrenceKeyProp,
        logByBillId,
        bills,
        yearMonth,
        overrideByBillId,
      ),
    [logByOccurrenceKeyProp, logByBillId, bills, yearMonth, overrideByBillId],
  )
  const { byId } = useCategories(undefined, { includeInactive: true })
  const { buckets, loading: bucketsLoading } = useBuckets()
  const bucketsById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b])),
    [buckets],
  )
  const { settings: pyfSettings, loading: pyfLoading } = usePyfSettings()
  const monthRange = useMemo(() => monthCursorRange(cursor), [cursor])
  const { transactions: monthTransactions, loading: monthTxLoading } =
    useTransactions(monthRange)
  const {
    allocation,
    categoriesById: expenseCatsById,
    bucketsById: progressBucketsById,
    buckets: progressBuckets,
  } = useFreeGuiltyProgress(yearMonth, monthTransactions)
  const monthIncome = useMemo(
    () => sumMonthRegularIncome(monthTransactions),
    [monthTransactions],
  )
  // Buckets + income + Money Plan % must be ready before PYF
  // transfer rows show note/amount — otherwise users see Main Account / stored
  // placeholder flash into the real destination + computed amount.
  const amountDepsReady =
    !bucketsLoading && !pyfLoading && !monthTxLoading
  const displayLoading = loading || !amountDepsReady
  const amountCtx = useMemo(
    () => ({
      monthIncome,
      emergencyPct: pyfSettings?.emergency_fund_pct ?? 10,
      investmentPct: pyfSettings?.investment_pct ?? 15,
      bucketsById,
    }),
    [monthIncome, pyfSettings, bucketsById],
  )

  function resolvedAmount(
    bill: RecurringBill,
    override?: RecurringBillMonthOverride | null,
  ) {
    return resolveEstimateAmount(bill, override, amountCtx)
  }

  function isAutoAmount(bill: RecurringBill) {
    return isPyfAutoAmountTransfer(bill, bucketsById)
  }

  // Drop optimistic entries once props match (silent reload finished).
  useEffect(() => {
    setPendingDone((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const [key, done] of prev) {
        if (baseLogByOccurrenceKey.has(key) === done) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [baseLogByOccurrenceKey])

  useEffect(() => {
    setPendingSkipped((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      let changed = false
      for (const [key, skipped] of prev) {
        const sep = key.indexOf(':')
        if (sep < 0) continue
        const billId = key.slice(0, sep)
        const occurredOn = key.slice(sep + 1)
        const serverSkipped = isOccurrenceSkipped(
          billId,
          occurredOn,
          skippedOccurrenceKeys,
          overrideByBillId.get(billId),
        )
        if (serverSkipped === skipped) {
          next.delete(key)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [overrideByBillId, skippedOccurrenceKeys])

  const effectiveLogByOccurrenceKey = useMemo(() => {
    if (pendingDone.size === 0) return baseLogByOccurrenceKey
    const map = new Map(baseLogByOccurrenceKey)
    for (const [key, done] of pendingDone) {
      if (done) {
        if (!map.has(key)) {
          const occurredOn = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
          const billId = key.includes(':') ? key.slice(0, key.indexOf(':')) : key
          map.set(key, {
            id: `pending-${key}`,
            bill_id: billId,
            year_month: yearMonth,
            occurred_on: occurredOn,
            transaction_id: 'pending',
            completed_at: new Date().toISOString(),
          })
        }
      } else {
        map.delete(key)
      }
    }
    return map
  }, [baseLogByOccurrenceKey, pendingDone, yearMonth])

  function isSkipped(billId: string, occurredOn: string): boolean {
    const key = occurrenceLogKey(billId, occurredOn)
    if (pendingSkipped.has(key)) return pendingSkipped.get(key) === true
    return isOccurrenceSkipped(
      billId,
      occurredOn,
      skippedOccurrenceKeys,
      overrideByBillId.get(billId),
    )
  }

  const occurrenceItems = useMemo(() => {
    const items: RecurringChecklistOccurrence[] = []
    for (const bill of bills) {
      const override = overrideByBillId.get(bill.id)
      for (const occurredOn of occurrencesInMonth(bill, yearMonth, override)) {
        items.push({
          bill,
          occurredOn,
          key: occurrenceLogKey(bill.id, occurredOn),
        })
      }
    }
    return sortRecurringOccurrencesForChecklist(
      items,
      effectiveLogByOccurrenceKey,
      byId,
      bucketsById,
    )
  }, [bills, yearMonth, overrideByBillId, effectiveLogByOccurrenceKey, byId, bucketsById])

  const filteredOccurrenceItems = useMemo(() => {
    if (!searchActive) return occurrenceItems
    return occurrenceItems.filter((item) => {
      const display = getRecurringBillDisplayParts(
        item.bill,
        byId,
        bucketsById,
      )
      const amount = resolveEstimateAmount(
        item.bill,
        overrideByBillId.get(item.bill.id),
        amountCtx,
      )
      let statusLabel: string | null = null
      if (isSkipped(item.bill.id, item.occurredOn)) statusLabel = 'skipped'
      else if (effectiveLogByOccurrenceKey.has(item.key)) statusLabel = 'checked'
      else if (item.occurredOn <= todayIso()) statusLabel = 'due'
      else statusLabel = 'unchecked'

      return matchesRecurringBillSearch(searchQuery, item.bill, display, {
        amount,
        occurredOn: item.occurredOn,
        statusLabel,
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSkipped/pendingSkipped via deps below
  }, [
    occurrenceItems,
    searchActive,
    searchQuery,
    byId,
    bucketsById,
    overrideByBillId,
    amountCtx,
    effectiveLogByOccurrenceKey,
    pendingSkipped,
    skippedOccurrenceKeys,
  ])

  const statusSections = useMemo(() => {
    const due: RecurringChecklistOccurrence[] = []
    const skipped: RecurringChecklistOccurrence[] = []
    const today = todayIso()
    for (const item of filteredOccurrenceItems) {
      if (isSkipped(item.bill.id, item.occurredOn)) {
        skipped.push(item)
        continue
      }
      if (effectiveLogByOccurrenceKey.has(item.key)) continue
      if (item.occurredOn <= today) due.push(item)
    }
    const sections: Array<{
      status: ChecklistStatus
      label: string
      groups: Array<[string, RecurringChecklistOccurrence[]]>
    }> = []
    if (variant === 'dueInbox') {
      if (due.length > 0) {
        sections.push({
          status: 'due',
          label: 'Due',
          groups: groupOccurrencesByDate(due, 'asc'),
        })
      }
      return sections
    }
    // Plan Skipped Items: Skipped only (due lives on Transactions).
    if (skipped.length > 0) {
      sections.push({
        status: 'skipped',
        label: 'Skipped',
        groups: groupOccurrencesByDate(skipped),
      })
    }
    return sections
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingSkipped intentional
  }, [
    filteredOccurrenceItems,
    effectiveLogByOccurrenceKey,
    overrideByBillId,
    pendingSkipped,
    skippedOccurrenceKeys,
    variant,
  ])

  const dayPersistKeysByStatus = useMemo(() => {
    const map: Record<ChecklistStatus, string[]> = {
      due: [],
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
      ...dayPersistKeysByStatus.due,
      ...dayPersistKeysByStatus.unchecked,
      ...dayPersistKeysByStatus.checked,
      ...dayPersistKeysByStatus.skipped,
    ],
    [dayPersistKeysByStatus],
  )

  const sectionDayForceKey = `${sectionDayForce.due.version}:${sectionDayForce.unchecked.version}:${sectionDayForce.checked.version}:${sectionDayForce.skipped.version}`

  useEffect(() => {
    setSectionDayForce((prev) => {
      let changed = false
      const next = { ...prev }
      for (const status of [
        'due',
        'unchecked',
        'checked',
        'skipped',
      ] as const) {
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
    if (!justCheckedKey) return
    const t = window.setTimeout(() => setJustCheckedKey(null), 1600)
    return () => window.clearTimeout(t)
  }, [justCheckedKey])

  function toggleSectionDays(status: ChecklistStatus, expanded: boolean) {
    setSectionDayForce((prev) => ({
      ...prev,
      [status]: { expanded, version: prev[status].version + 1 },
    }))
  }

  function toggleAllExpanded(expanded: boolean) {
    setAllExpanded(expanded)
    setSectionDayForce((prev) => ({
      due: { expanded, version: prev.due.version + 1 },
      unchecked: { expanded, version: prev.unchecked.version + 1 },
      checked: { expanded, version: prev.checked.version + 1 },
      skipped: { expanded, version: prev.skipped.version + 1 },
    }))
  }

  // Parent Transactions outer frame → expand/collapse Due days.
  useEffect(() => {
    if (variant !== 'dueInbox') return
    if (!expandAll || expandAll.version === 0) return
    setSectionDayForce((prev) => ({
      ...prev,
      due: {
        expanded: expandAll.expanded,
        version: prev.due.version + 1,
      },
    }))
  }, [variant, expandAll?.version, expandAll?.expanded])

  // After Due section/day force settles, let parent re-sync outer chevron.
  useEffect(() => {
    if (variant !== 'dueInbox') return
    if (sectionDayForce.due.version === 0) return
    onDayOpenChange?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the intentional trigger
  }, [variant, sectionDayForce.due.version])

  const doneCount = useMemo(
    () =>
      occurrenceItems.filter(
        (item) =>
          effectiveLogByOccurrenceKey.has(item.key) &&
          !isSkipped(item.bill.id, item.occurredOn),
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSkipped via pendingSkipped
    [
      occurrenceItems,
      effectiveLogByOccurrenceKey,
      pendingSkipped,
      overrideByBillId,
      skippedOccurrenceKeys,
    ],
  )

  const activeCount = useMemo(
    () =>
      occurrenceItems.filter(
        (item) => !isSkipped(item.bill.id, item.occurredOn),
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isSkipped via pendingSkipped
    [occurrenceItems, pendingSkipped, overrideByBillId, skippedOccurrenceKeys],
  )

  async function handleToggle(
    bill: RecurringBill,
    occurredOn: string,
    done: boolean,
    amountOverride?: number,
  ) {
    const key = occurrenceLogKey(bill.id, occurredOn)
    if (busyKey) return
    if (isSkipped(bill.id, occurredOn)) return
    setBusyKey(key)
    setPendingDone((prev) => {
      const next = new Map(prev)
      next.set(key, !done)
      return next
    })
    try {
      if (done) {
        const { transactionId } = await unmarkBillPaid(
          bill.id,
          yearMonth,
          occurredOn,
        )
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
              next.delete(key)
              return next
            })
            return
          }
        } else if (!bill.category_id) {
          showAppToast('Set a category for this item in Settings')
          setPendingDone((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
          return
        }

        const override = overrideByBillId.get(bill.id)
        const amount =
          amountOverride != null && amountOverride > 0 && !isAutoAmount(bill)
            ? amountOverride
            : resolvedAmount(bill, override)
        if (amount <= 0) {
          showAppToast(
            isAutoAmount(bill)
              ? 'No income this month'
              : 'Enter an amount greater than zero',
          )
          setPendingDone((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
          return
        }
        const owner = bill.owner ?? getStoredProfile() ?? 'suami'
        const circle = bill.type === 'income' ? 'hd_family' : bill.circle
        const draft: NewTransactionInput =
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
                complete_later: false,
                budget_group: null,
              }
            : {
                type: bill.type,
                category_id: bill.category_id,
                from_bucket_id:
                  bill.type === 'expense'
                    ? resolveExpenseFromBucketId(bill.category_id, buckets)
                    : null,
                to_bucket_id: null,
                amount,
                description: bill.name,
                owner,
                circle,
                occurred_on: occurredOn,
                is_recurring: true,
                complete_later: false,
                budget_group:
                  bill.type === 'expense'
                    ? (bill.budget_group === 'needs' ||
                      bill.budget_group === 'wants'
                        ? bill.budget_group
                        : null)
                    : null,
              }

        const policy = await resolveMonthWritePolicy(occurredOn)
        if (!policy.allowed) {
          showAppToast(policy.message)
          navigate('/rencana/close-month')
          setPendingDone((prev) => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
          return
        }

        if (draft.type === 'expense' && allocation) {
          const evalResult = evaluateExpenseEfLoan({
            draft,
            monthClosed: policy.monthClosed,
            transactions: monthTransactions,
            bills,
            overridesByBillId: overrideByBillId,
            skippedOccurrenceKeys,
            categoriesById: expenseCatsById,
            bucketsById: progressBucketsById,
            buckets: progressBuckets,
            yearMonth: policy.yearMonth,
            bufferAllowance: allocation.buffer,
            guiltFreeAllowance: allocation.guiltFree,
          })
          if (evalResult.borrowAmount > 0 && evalResult.source) {
            setPendingDone((prev) => {
              const next = new Map(prev)
              next.delete(key)
              return next
            })
            setPendingEfConfirm({
              bill,
              occurredOn,
              draft,
              borrowAmount: evalResult.borrowAmount,
              source: evalResult.source,
              yearMonth: policy.yearMonth,
              amountOverride,
            })
            return
          }
        }

        const txId = await createTransaction(draft)
        await markBillPaid({
          billId: bill.id,
          yearMonth,
          occurredOn,
          transactionId: txId,
        })
        setJustCheckedKey(key)
        showAppToast(`Saved ${ActionEmoji.save}`)
      }
      onChanged()
    } catch (err) {
      setPendingDone((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyKey(null)
    }
  }

  function proceedCheck(bill: RecurringBill, occurredOn: string) {
    if (bill.variable_amount && !isAutoAmount(bill)) {
      setPendingAmountConfirm({ bill, occurredOn })
      return
    }
    void handleToggle(bill, occurredOn, false)
  }

  async function confirmEfBorrow() {
    if (!pendingEfConfirm) return
    const { bill, occurredOn, draft, borrowAmount, source, yearMonth: loanYm } =
      pendingEfConfirm
    const key = occurrenceLogKey(bill.id, occurredOn)
    setPendingEfConfirm(null)
    setBusyKey(key)
    setPendingDone((prev) => {
      const next = new Map(prev)
      next.set(key, true)
      return next
    })
    try {
      const txId = await createTransaction(draft)
      await upsertEfLoanForTransaction({
        transactionId: txId,
        yearMonth: loanYm,
        amount: borrowAmount,
        source,
      })
      await markBillPaid({
        billId: bill.id,
        yearMonth,
        occurredOn,
        transactionId: txId,
      })
      setJustCheckedKey(key)
      showAppToast(`Saved ${ActionEmoji.save}`)
      onChanged()
    } catch (err) {
      setPendingDone((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusyKey(null)
    }
  }

  function requestCheck(bill: RecurringBill, occurredOn: string) {
    if (variant === 'plan') return
    if (variant === 'dueInbox') {
      setPendingDoneConfirm({ bill, occurredOn })
      return
    }
    proceedCheck(bill, occurredOn)
  }

  function openAmountEdit(
    bill: RecurringBill,
    occurredOn: string,
    options?: { checkAfterSave?: boolean; focusAmount?: boolean },
  ) {
    setPendingAmountConfirm(null)
    setEditingBill(bill)
    setEditingOccurredOn(occurredOn)
    setCheckAfterEdit(options?.checkAfterSave === true)
    setAutoFocusAmount(
      options?.focusAmount === true && !isAutoAmount(bill),
    )
    setOpenSwipeId(null)
  }

  async function handleSaveOverride(input: {
    amount: number
    dueDay: number
  }) {
    if (!editingBill || savingOverride) return
    const bill = editingBill
    const occurredOn = editingOccurredOn
    const shouldCheck = checkAfterEdit && occurredOn != null
    const amount = isAutoAmount(bill)
      ? resolvedAmount(bill, overrideByBillId.get(bill.id))
      : input.amount
    setSavingOverride(true)
    try {
      await upsertRecurringBillMonthOverride({
        billId: bill.id,
        yearMonth,
        amount,
        dueDay: input.dueDay,
        templateAmount: bill.amount,
        templateDueDay: bill.due_day,
      })
      setEditingBill(null)
      setEditingOccurredOn(null)
      setAutoFocusAmount(false)
      setCheckAfterEdit(false)
      showAppToast(`Saved ${ActionEmoji.save}`)
      if (shouldCheck && occurredOn) {
        await handleToggle(bill, occurredOn, false, amount)
      } else {
        onChanged()
      }
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingOverride(false)
    }
  }

  async function confirmSkip() {
    const pending = pendingSkip
    if (!pending || skipping) return
    const { bill, occurredOn } = pending
    const key = occurrenceLogKey(bill.id, occurredOn)
    const monthDates = occurrencesInMonth(
      bill,
      yearMonth,
      overrideByBillId.get(bill.id),
    )
    setSkipping(true)
    setPendingSkipped((prev) => {
      const next = new Map(prev)
      next.set(key, true)
      return next
    })
    try {
      await setRecurringBillOccurrenceSkipped(
        bill.id,
        yearMonth,
        occurredOn,
        true,
        monthDates,
      )
      setPendingSkip(null)
      setOpenSwipeId(null)
      showAppToast(`Skipped ${ActionEmoji.delete}`)
      onChanged()
    } catch (err) {
      setPendingSkipped((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to skip')
    } finally {
      setSkipping(false)
    }
  }

  async function confirmRestore() {
    const pending = pendingRestore
    if (!pending || restoring) return
    const { bill, occurredOn } = pending
    const key = occurrenceLogKey(bill.id, occurredOn)
    const monthDates = occurrencesInMonth(
      bill,
      yearMonth,
      overrideByBillId.get(bill.id),
    )
    setRestoring(true)
    setPendingSkipped((prev) => {
      const next = new Map(prev)
      next.set(key, false)
      return next
    })
    try {
      await setRecurringBillOccurrenceSkipped(
        bill.id,
        yearMonth,
        occurredOn,
        false,
        monthDates,
      )
      setPendingRestore(null)
      showAppToast(`Restored ${ActionEmoji.restore}`)
      onChanged()
    } catch (err) {
      setPendingSkipped((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      showAppToast(err instanceof Error ? err.message : 'Failed to restore')
    } finally {
      setRestoring(false)
    }
  }

  if (!available) {
    if (variant === 'dueInbox') return null
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
          Supabase, then add items in Settings → Monthly Estimates.
        </p>
      </section>
    )
  }

  if (displayLoading && (bills.length === 0 || !amountDepsReady)) {
    if (variant === 'dueInbox') return null
    return (
      <section className={embedded ? '' : 'mt-6'}>
        <p className="text-sm text-neutral-400">Loading…</p>
      </section>
    )
  }

  if (occurrenceItems.length === 0 || statusSections.length === 0) {
    if (variant === 'dueInbox') {
      if (emptySearchMessage && searchActive) {
        return (
          <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            {emptySearchMessage}
          </p>
        )
      }
      return null
    }

    const searchFieldEl =
      showSearchField ? (
        <SearchField
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search skipped items…"
          aria-label="Search skipped items"
          className="mb-3"
        />
      ) : null

    if (occurrenceItems.length === 0) {
      return (
        <section className={embedded ? '' : 'mt-6'}>
          {searchFieldEl}
          {!embedded && (
            <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              This month
            </p>
          )}
          <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            No due items yet. Add recurring estimates in Settings → Monthly
            Estimates.
          </p>
        </section>
      )
    }

    if (searchActive) {
      return (
        <section className={embedded ? '' : 'mt-6'}>
          {searchFieldEl}
          <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
            No matches.
          </p>
        </section>
      )
    }

    // No skipped items — due bills live on Transactions.
    const onlyDuesNote = (
      <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
        No skipped items. Due bills are on Transactions.
      </p>
    )
    if (embedded) {
      return (
        <>
          {searchFieldEl}
          {onlyDuesNote}
        </>
      )
    }
    return (
      <section className="mt-6">
        {searchFieldEl}
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          This month
        </p>
        {onlyDuesNote}
      </section>
    )
  }

  const editingOverride = editingBill
    ? overrideByBillId.get(editingBill.id)
    : undefined

  function renderStatusSections() {
    return statusSections.map((section) => {
      const force = sectionDayForce[section.status]
      const dayGroups = (
        <div className="space-y-5">
          {section.groups.map(([date, items]) => (
            <CollapsibleDayGroup
              key={`${section.status}-${date}`}
              title={formatDateLabel(date)}
              persistKey={dayPersistKey(section.status, date)}
              forceOpen={force.version > 0 ? force.expanded : undefined}
              forceVersion={force.version}
              onOpenChange={() => {
                setCollapseTick((n) => n + 1)
                onDayOpenChange?.()
              }}
            >
              <div className="space-y-2">
                {items.map((item) => {
                  const { bill, occurredOn, key } = item
                  const skipped = section.status === 'skipped'
                  const done =
                    !skipped && effectiveLogByOccurrenceKey.has(key)
                  const busy = busyKey === key
                  const override = overrideByBillId.get(bill.id)
                  const amount = resolvedAmount(bill, override)
                  const dueDay = effectiveDueDay(bill, override)
                  const dueOrOverdue =
                    (section.status === 'due' ||
                      section.status === 'unchecked') &&
                    occurredOn <= todayIso()
                  const autoAmount = isAutoAmount(bill)
                  const variableDue =
                    dueOrOverdue &&
                    bill.variable_amount === true &&
                    !autoAmount
                  const justChecked = justCheckedKey === key
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
                  const budgetGroup = estimatePlanBadgeGroup(
                    estimatePlanTag(bill, byId, bucketsById),
                  )
                  const label =
                    bill.name.trim() ||
                    display.parentName ||
                    'recurring item'
                  const currentMonthDone =
                    yearMonth === monthCursorKey(currentMonthCursor())
                      ? done
                      : (currentMonthDoneByBillId?.has(bill.id) ?? false)
                  const rowId = `recurring-bill-${key}`
                  const showCheckbox = variant !== 'plan' && !skipped
                  const canToggleCheck = variant !== 'plan'
                  const rowInner = (
                    <>
                      {showCheckbox ? (
                        <span className="shrink-0">
                          <ChecklistCheckbox checked={done} />
                        </span>
                      ) : null}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <RecurringBillRowContent
                          bill={displayBill}
                          display={display}
                          displayAmount={amount}
                          done={done}
                          inactive={skipped}
                          showMeta={variant !== 'plan'}
                          monthCursor={
                            variant === 'plan' ? undefined : cursor
                          }
                          occurredOn={
                            variant === 'plan' ? undefined : occurredOn
                          }
                          currentMonthDone={currentMonthDone}
                          budgetGroup={budgetGroup}
                        />
                      </div>
                    </>
                  )

                  if (skipped) {
                    return (
                      <div
                        key={key}
                        id={rowId}
                        className="relative flex w-full items-center gap-1 rounded-xl border-2 border-transparent bg-white shadow-sm dark:bg-neutral-800"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
                          {rowInner}
                        </div>
                        <button
                          type="button"
                          disabled={busy || restoring}
                          onClick={() =>
                            setPendingRestore({ bill, occurredOn })
                          }
                          aria-label={`Restore ${label}`}
                          title="Restore"
                          className="mr-2 shrink-0 rounded-lg px-2 py-2 text-base leading-none disabled:opacity-60"
                        >
                          {ActionEmoji.restore}
                        </button>
                      </div>
                    )
                  }

                  if (
                    section.status === 'unchecked' ||
                    section.status === 'due'
                  ) {
                    return (
                      <div
                        key={key}
                        id={rowId}
                        className={`rounded-xl border-2 transition-colors ${
                          justChecked
                            ? 'border-transparent'
                            : variableDue
                              ? 'recurring-variable-highlight'
                              : dueOrOverdue
                                ? 'recurring-due-highlight'
                                : 'border-transparent'
                        }`}
                      >
                        <SwipeDeleteRow
                          open={openSwipeId === key}
                          onOpenChange={(open) =>
                            setOpenSwipeId(open ? key : null)
                          }
                          onDelete={() => {
                            setOpenSwipeId(key)
                            setPendingSkip({ bill, occurredOn })
                          }}
                          deleteAriaLabel={`Skip ${label} for this month`}
                          highlighted={justChecked}
                          onContentClick={() => {
                            if (busy || !canToggleCheck) return
                            if (done) {
                              void handleToggle(bill, occurredOn, true)
                            } else {
                              requestCheck(bill, occurredOn)
                            }
                          }}
                          trailing={
                            <button
                              type="button"
                              disabled={busy || savingOverride}
                              onClick={() => {
                                openAmountEdit(bill, occurredOn, {
                                  focusAmount: false,
                                  checkAfterSave: false,
                                })
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

                  if (!canToggleCheck) {
                    return (
                      <div
                        key={key}
                        id={rowId}
                        className="relative flex w-full items-center gap-1 rounded-xl border-2 border-transparent bg-white shadow-sm dark:bg-neutral-800"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
                          {rowInner}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={key}
                      id={rowId}
                      className={`relative flex w-full items-center gap-1 rounded-xl border-2 shadow-sm transition-colors ${
                        justChecked
                          ? 'border-transparent tx-row-highlight'
                          : 'border-transparent bg-white dark:bg-neutral-800'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (done) {
                            void handleToggle(bill, occurredOn, true)
                          } else {
                            requestCheck(bill, occurredOn)
                          }
                        }}
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
      )

      // Plan: flat list under Skipped Items — no nested "Skipped" status group.
      if (variant === 'plan') {
        return <div key={section.status}>{dayGroups}</div>
      }

      return (
        <GroupedListFrame
          key={section.status}
          label={section.label}
          expanded={force.expanded}
          onToggle={(expanded) => toggleSectionDays(section.status, expanded)}
        >
          {dayGroups}
        </GroupedListFrame>
      )
    })
  }

  const dialogs = (
    <>
      <RecurringMonthOverrideSheet
        open={editingBill != null}
        bill={editingBill}
        cursor={cursor}
        initialAmount={
          editingBill ? resolvedAmount(editingBill, editingOverride) : 0
        }
        initialDueDay={
          editingBill ? effectiveDueDay(editingBill, editingOverride) : 1
        }
        amountLocked={editingBill ? isAutoAmount(editingBill) : false}
        busy={savingOverride}
        autoFocusAmount={autoFocusAmount}
        onClose={() => {
          if (savingOverride) return
          setEditingBill(null)
          setEditingOccurredOn(null)
          setAutoFocusAmount(false)
          setCheckAfterEdit(false)
        }}
        onSave={(input) => void handleSaveOverride(input)}
      />

      <ConfirmDialog
        open={pendingEfConfirm != null}
        title="Borrow from Emergency Fund?"
        message={
          pendingEfConfirm
            ? efLoanConfirmMessage(
                pendingEfConfirm.borrowAmount,
                pendingEfConfirm.source,
              )
            : ''
        }
        confirmLabel="Borrow & Save"
        cancelLabel="Cancel"
        busyLabel="Saving…"
        danger={false}
        busy={
          pendingEfConfirm != null &&
          busyKey ===
            occurrenceLogKey(
              pendingEfConfirm.bill.id,
              pendingEfConfirm.occurredOn,
            )
        }
        onCancel={() => {
          if (busyKey) return
          setPendingEfConfirm(null)
        }}
        onConfirm={() => void confirmEfBorrow()}
      />

      <ConfirmDialog
        open={pendingDoneConfirm != null}
        title="Has This Transaction Been Done?"
        message={
          pendingDoneConfirm
            ? `Confirm that ${
                pendingDoneConfirm.bill.name.trim() || 'this item'
              } has already been completed.`
            : ''
        }
        confirmLabel="Yes"
        cancelLabel="Cancel"
        busyLabel="Logging…"
        danger={false}
        busy={
          pendingDoneConfirm != null &&
          busyKey ===
            occurrenceLogKey(
              pendingDoneConfirm.bill.id,
              pendingDoneConfirm.occurredOn,
            )
        }
        onCancel={() => {
          if (
            pendingDoneConfirm != null &&
            busyKey ===
              occurrenceLogKey(
                pendingDoneConfirm.bill.id,
                pendingDoneConfirm.occurredOn,
              )
          ) {
            return
          }
          setPendingDoneConfirm(null)
        }}
        onConfirm={() => {
          if (!pendingDoneConfirm) return
          const { bill, occurredOn } = pendingDoneConfirm
          setPendingDoneConfirm(null)
          proceedCheck(bill, occurredOn)
        }}
      />

      <ConfirmDialog
        open={pendingAmountConfirm != null}
        title="Confirm Amount?"
        message={
          pendingAmountConfirm
            ? `Is ${formatRupiah(
                resolvedAmount(
                  pendingAmountConfirm.bill,
                  overrideByBillId.get(pendingAmountConfirm.bill.id),
                ),
              )} correct for this bill?`
            : ''
        }
        confirmLabel="Yes"
        alternateLabel="Edit Amount"
        busyLabel="Logging…"
        danger={false}
        busy={
          pendingAmountConfirm != null &&
          busyKey ===
            occurrenceLogKey(
              pendingAmountConfirm.bill.id,
              pendingAmountConfirm.occurredOn,
            )
        }
        onCancel={() => setPendingAmountConfirm(null)}
        onAlternate={() => {
          if (!pendingAmountConfirm) return
          openAmountEdit(
            pendingAmountConfirm.bill,
            pendingAmountConfirm.occurredOn,
            { checkAfterSave: true, focusAmount: true },
          )
        }}
        onConfirm={() => {
          if (!pendingAmountConfirm) return
          const { bill, occurredOn } = pendingAmountConfirm
          setPendingAmountConfirm(null)
          void handleToggle(bill, occurredOn, false)
        }}
      />

      <ConfirmDialog
        open={pendingSkip != null}
        title="Skip This Occurrence?"
        message="Only this date moves to Skipped. Other dates for this bill stay on the checklist."
        confirmLabel="Skip"
        cancelLabel="Cancel"
        busyLabel="Skipping…"
        busy={skipping}
        onCancel={() => {
          if (skipping) return
          setPendingSkip(null)
        }}
        onConfirm={() => void confirmSkip()}
      />

      <ConfirmDialog
        open={pendingRestore != null}
        title="Restore This Occurrence?"
        message="It returns to Due on Transactions if already due."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        busyLabel="Restoring…"
        danger={false}
        busy={restoring}
        onCancel={() => {
          if (restoring) return
          setPendingRestore(null)
        }}
        onConfirm={() => void confirmRestore()}
      />
    </>
  )

  if (variant === 'dueInbox') {
    if (statusSections.length === 0) return null
    return (
      <>
        {renderStatusSections()}
        {dialogs}
      </>
    )
  }

  const searchFieldEl = showSearchField ? (
    <SearchField
      value={searchQuery}
      onChange={handleSearchChange}
      placeholder="Search skipped items…"
      aria-label="Search skipped items"
      className="mb-3"
    />
  ) : null

  const content = (
    <>
      {searchFieldEl}
      <GroupedListFrame
        label={embedded ? 'Skipped Items' : 'Due This Month'}
        expanded={allExpanded}
        onToggle={toggleAllExpanded}
      >
        <div className="space-y-5">{renderStatusSections()}</div>
      </GroupedListFrame>

      {dialogs}
    </>
  )

  if (embedded) return content

  return (
    <CollapsibleSection
      title="Due This Month"
      subtitle={`${doneCount}/${activeCount} done`}
      defaultOpen
      className="mt-6"
      persistKey="plan:recurring:section"
    >
      {content}
    </CollapsibleSection>
  )
}
