import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { areAllCollapseOpen } from '../lib/collapseState'
import { formatNumber } from '../lib/format'
import { getRecurringBillDisplayParts } from '../lib/recurringBillDisplay'
import { getStoredCircle, getStoredProfile, setStoredCircle } from '../lib/profile'
import {
  createRecurringBill,
  deleteRecurringBill,
  fetchRecurringBills,
  isMissingRecurringSchema,
  sortRecurringBillsForSettings,
  updateRecurringBill,
  type RecurringBill,
} from '../lib/recurringBillsApi'
import type { Circle, Owner, TransactionType } from '../lib/types'
import {
  BucketPicker,
  type BucketSelection,
} from './BucketPicker'
import { CategoryPicker } from './CategoryPicker'
import { CirclePicker } from './CirclePicker'
import { GroupedListFrame } from './GroupedListFrame'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
import { ConfirmDialog } from './ConfirmDialog'
import { NotesInput } from './NotesInput'
import { OwnerPicker } from './OwnerPicker'
import { RecurringBillRowContent } from './RecurringBillRowContent'
import { SwipeDeleteRow } from './SwipeDeleteRow'

function groupByDueDay(bills: RecurringBill[]): Array<[number, RecurringBill[]]> {
  const map = new Map<number, RecurringBill[]>()
  for (const bill of bills) {
    const list = map.get(bill.due_day) ?? []
    list.push(bill)
    map.set(bill.due_day, list)
  }
  return [...map.entries()].sort(([a], [b]) => b - a)
}

function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function parseYearMonth(value: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month < 1 || month > 12) return null
  return { year, month }
}

function buildYearOptions(): number[] {
  const nowYear = new Date().getFullYear()
  const years: number[] = []
  // Long range for recurring installments/plans.
  for (let year = nowYear - 30; year <= nowYear + 80; year++) {
    years.push(year)
  }
  return years
}

function formatRecurringPoint(day: number, yearMonth: string): string {
  const parsed = parseYearMonth(yearMonth)
  if (!parsed) return `${day}`
  const monthLabel = new Date(parsed.year, parsed.month - 1, 1).toLocaleString(
    'en-US',
    { month: 'short' },
  )
  return `${day} ${monthLabel} ${parsed.year}`
}

function currentYearMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

interface RecurringBillsPanelProps {
  onViewChange?: (info: {
    view: 'list' | 'form'
    editing: boolean
    editingId: string | null
  }) => void
  /** Parent can call this to leave the form and return to the list. */
  backToListRef?: MutableRefObject<(() => void) | null>
  /** When set by the route, keep the panel form in sync with the URL. */
  routeWantForm?: boolean
  routeEditId?: string | null
}

export function RecurringBillsPanel({
  onViewChange,
  backToListRef,
  routeWantForm,
  routeEditId = null,
}: RecurringBillsPanelProps = {}) {
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'short' }),
      })),
    [],
  )
  const yearOptions = useMemo(() => buildYearOptions(), [])
  const [type, setType] = useState<TransactionType>('expense')
  const categoryType = type === 'transfer' ? undefined : type
  const { treeByUsage, byId, loading: catsLoading, reload } =
    useCategories(categoryType)
  const { byId: allById } = useCategories(undefined, { includeInactive: true })
  const { buckets, loading: bucketsLoading } = useBuckets()

  const [bills, setBills] = useState<RecurringBill[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [saving, setSaving] = useState(false)

  const [note, setNote] = useState('')
  const [amountDigits, setAmountDigits] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [fromBucket, setFromBucket] = useState<BucketSelection | undefined>(
    undefined,
  )
  const [toBucket, setToBucket] = useState<BucketSelection | undefined>(
    undefined,
  )
  const [circle, setCircle] = useState<Circle | null>(() => getStoredCircle())
  const [owner, setOwner] = useState<Owner>(
    () => getStoredProfile() ?? 'suami',
  )
  const [dueDay, setDueDay] = useState(1)
  const [startsYearMonth, setStartsYearMonth] = useState(() =>
    currentYearMonthValue(),
  )
  const [endsYearMonth, setEndsYearMonth] = useState('')
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [circleOpen, setCircleOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringBill | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Seed from route so remount on /recurring/:id does not report view=list
  // while the URL still wants the form (that caused list↔edit redirect loops).
  const [editingId, setEditingId] = useState<string | null>(
    () => routeEditId ?? null,
  )
  const [view, setView] = useState<'list' | 'form'>(() =>
    routeWantForm ? 'form' : 'list',
  )
  const [dayGroupsExpanded, setDayGroupsExpanded] = useState(true)
  const [dayGroupsVersion, setDayGroupsVersion] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const hydratedEditIdRef = useRef<string | null>(null)
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange

  // Only notify when view/editingId change — not when the parent callback
  // identity changes (e.g. after phone Back). Re-firing with a stale form
  // view would navigate back to the edit URL and loop.
  useEffect(() => {
    onViewChangeRef.current?.({
      view,
      editing: editingId != null,
      editingId,
    })
  }, [view, editingId])

  // Sync form open/close from the route (phone Back / deep link).
  useEffect(() => {
    if (routeWantForm == null) return
    if (!routeWantForm) {
      hydratedEditIdRef.current = null
      if (view !== 'list') {
        resetForm()
        setView('list')
      }
      return
    }
    if (routeEditId) {
      const bill = bills.find((b) => b.id === routeEditId)
      if (!bill) return
      if (
        editingId === routeEditId &&
        view === 'form' &&
        hydratedEditIdRef.current === routeEditId
      ) {
        return
      }
      startEdit(bill)
      hydratedEditIdRef.current = routeEditId
      setView('form')
      return
    }
    hydratedEditIdRef.current = null
    if (view !== 'form' || editingId != null) {
      resetForm()
      setView('form')
    }
  }, [routeWantForm, routeEditId, bills])

  useEffect(() => {
    if (!backToListRef) return
    backToListRef.current = () => {
      resetForm()
      setView('list')
    }
    return () => {
      backToListRef.current = null
    }
  })

  const amountRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const dueDayRef = useRef<HTMLSelectElement>(null)
  const startsRef = useRef<HTMLSelectElement>(null)
  const endsRef = useRef<HTMLSelectElement>(null)

  const startsParts =
    parseYearMonth(startsYearMonth) ?? parseYearMonth(currentYearMonthValue())!
  const endsParts = endsYearMonth ? parseYearMonth(endsYearMonth) : null
  const startsYearOptions = endsParts
    ? yearOptions.filter((year) => year <= endsParts.year)
    : yearOptions
  const startsMonthOptions = monthOptions.filter((month) => {
    if (!endsParts) return true
    if (startsParts.year < endsParts.year) return true
    return month.value <= endsParts.month
  })
  const endsYearOptions = yearOptions.filter(
    (year) => year >= startsParts.year,
  )
  const endsMonthOptions = monthOptions.filter((month) => {
    if (!endsParts) return true
    if (endsParts.year > startsParts.year) return true
    return month.value >= startsParts.month
  })
  const isTransfer = type === 'transfer'
  const bucketsById = new Map(buckets.map((b) => [b.id, b]))
  const sortedBills = sortRecurringBillsForSettings(bills)
  const groupedBills = groupByDueDay(sortedBills)
  const dayPersistKeys = useMemo(
    () => groupedBills.map(([day]) => `settings:recurring:day:${day}`),
    [groupedBills],
  )

  useEffect(() => {
    if (dayGroupsVersion > 0) return
    setDayGroupsExpanded(areAllCollapseOpen(dayPersistKeys, true))
  }, [dayPersistKeys, dayGroupsVersion])

  async function reloadBills() {
    setLoading(true)
    try {
      const rows = await fetchRecurringBills()
      setBills(sortRecurringBillsForSettings(rows))
      setAvailable(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
      } else {
        showAppToast(message || 'Failed to load')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadBills()
  }, [])

  useEffect(() => {
    if (!highlightId) return
    const t = window.setTimeout(() => setHighlightId(null), 1800)
    return () => window.clearTimeout(t)
  }, [highlightId])

  useEffect(() => {
    if (!highlightId || loading || view !== 'list') return
    highlightRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlightId, loading, view, bills])

  useEffect(() => {
    if (type === 'transfer') return
    if (catsLoading || !categoryId) return
    if (!byId.has(categoryId)) setCategoryId(null)
  }, [type, catsLoading, byId, categoryId])

  function closePickers() {
    setOwnerOpen(false)
    setCircleOpen(false)
    setCategoryOpen(false)
    setFromOpen(false)
    setToOpen(false)
  }

  function isAmountFilled() {
    return Number(amountDigits) > 0
  }

  function focusNoteField() {
    closePickers()
    noteRef.current?.focus()
  }

  function focusDueDayField() {
    closePickers()
    dueDayRef.current?.focus()
  }

  function focusEndsField() {
    closePickers()
    endsRef.current?.focus()
  }

  function focusStartsField() {
    closePickers()
    startsRef.current?.focus()
  }

  function focusAmountField(message?: string) {
    closePickers()
    if (message) showAppToast(message)
    amountRef.current?.focus()
  }

  function focusOwnerField(message?: string) {
    closePickers()
    if (message) showAppToast(message)
    setOwnerOpen(true)
  }

  function focusCircleField(message?: string) {
    closePickers()
    if (message) showAppToast(message)
    setCircleOpen(true)
  }

  function focusCategoryField(message?: string) {
    closePickers()
    if (message) showAppToast(message)
    setCategoryOpen(true)
  }

  function focusFromField(message?: string) {
    closePickers()
    if (message) showAppToast(message)
    setFromOpen(true)
  }

  function focusToField(message?: string) {
    closePickers()
    if (message) showAppToast(message)
    setToOpen(true)
  }

  function advanceAfterAmount() {
    if (!isAmountFilled()) {
      focusAmountField('Enter an amount')
      return
    }
    if (!owner) {
      focusOwnerField('Pick a profile')
      return
    }
    if (isTransfer) {
      if (fromBucket === undefined) {
        focusFromField()
        return
      }
      if (toBucket === undefined) {
        focusToField()
        return
      }
      focusNoteField()
      return
    }
    if (!circle) {
      focusCircleField()
      return
    }
    if (!categoryId) {
      focusCategoryField()
      return
    }
    focusNoteField()
  }

  function handleTypeChange(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    closePickers()
    if (next === 'transfer') {
      setFromBucket(null)
      setToBucket(undefined)
      setCircle(null)
    } else {
      setFromBucket(undefined)
      setToBucket(undefined)
      if (!circle) setCircle(getStoredCircle())
    }
  }

  function resetForm() {
    setType('expense')
    setNote('')
    setAmountDigits('')
    setCategoryId(null)
    setFromBucket(undefined)
    setToBucket(undefined)
    setCircle(getStoredCircle())
    setOwner(getStoredProfile() ?? 'suami')
    setDueDay(1)
    setStartsYearMonth(currentYearMonthValue())
    setEndsYearMonth('')
    setEditingId(null)
    hydratedEditIdRef.current = null
    closePickers()
  }

  function startEdit(bill: RecurringBill) {
    setEditingId(bill.id)
    hydratedEditIdRef.current = bill.id
    setType(bill.type)
    setNote(bill.name)
    setAmountDigits(String(Math.round(bill.amount)))
    setOwner(bill.owner ?? getStoredProfile() ?? 'suami')
    setDueDay(bill.due_day)
    setStartsYearMonth(bill.starts_year_month ?? currentYearMonthValue())
    setEndsYearMonth(bill.ends_year_month ?? '')
    setOpenSwipeId(null)
    closePickers()

    if (bill.type === 'transfer') {
      setCategoryId(null)
      setCircle(null)
      setFromBucket(bill.from_bucket_id)
      setToBucket(bill.to_bucket_id)
    } else {
      setCategoryId(bill.category_id)
      setCircle(bill.circle ?? getStoredCircle())
      setFromBucket(undefined)
      setToBucket(undefined)
    }

    amountRef.current?.focus()
  }

  function openAddForm() {
    resetForm()
    setView('form')
  }

  function openEditForm(bill: RecurringBill) {
    startEdit(bill)
    setView('form')
  }

  function resolveIcon(): string {
    if (type === 'transfer') return '🔄'
    const cat = categoryId ? byId.get(categoryId) : null
    return cat?.icon ?? '📌'
  }

  async function handleAdd() {
    const amount = Number(amountDigits)
    if (!amount || amount <= 0) {
      focusAmountField('Enter an amount')
      return
    }

    if (type === 'transfer') {
      if (fromBucket === undefined) {
        focusFromField('Pick a source')
        return
      }
      if (toBucket === undefined) {
        focusToField('Pick a destination')
        return
      }
      if (fromBucket === toBucket) {
        showAppToast('Pick different from and to')
        return
      }
      if (fromBucket == null && toBucket == null) {
        showAppToast('Transfer needs at least one bucket')
        return
      }
    } else {
      if (!circle) {
        focusCircleField('Pick a circle')
        return
      }
      if (!categoryId) {
        focusCategoryField('Pick a category')
        return
      }
    }

    setSaving(true)
    try {
      const created = await createRecurringBill(
        type === 'transfer'
          ? {
              name: note.trim(),
              amount,
              type: 'transfer',
              category_id: null,
              from_bucket_id: fromBucket ?? null,
              to_bucket_id: toBucket ?? null,
              circle: 'hd_family',
              owner,
              due_day: dueDay,
              starts_year_month: startsYearMonth || null,
              ends_year_month: endsYearMonth || null,
              icon: resolveIcon(),
            }
          : {
              name: note.trim(),
              amount,
              type,
              category_id: categoryId!,
              from_bucket_id: null,
              to_bucket_id: null,
              circle: circle!,
              owner,
              due_day: dueDay,
              starts_year_month: startsYearMonth || null,
              ends_year_month: endsYearMonth || null,
              icon: resolveIcon(),
            },
      )
      if (type !== 'transfer' && circle) setStoredCircle(circle)
      resetForm()
      setDayGroupsExpanded(true)
      setDayGroupsVersion((v) => v + 1)
      showAppToast(`Saved ${ActionEmoji.save}`)
      setView('list')
      await reloadBills()
      setHighlightId(created.id)
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!editingId) return

    const amount = Number(amountDigits)
    if (!amount || amount <= 0) {
      focusAmountField('Enter an amount')
      return
    }

    if (type === 'transfer') {
      if (fromBucket === undefined) {
        focusFromField('Pick a source')
        return
      }
      if (toBucket === undefined) {
        focusToField('Pick a destination')
        return
      }
      if (fromBucket === toBucket) {
        showAppToast('Pick different from and to')
        return
      }
      if (fromBucket == null && toBucket == null) {
        showAppToast('Transfer needs at least one bucket')
        return
      }
    } else {
      if (!circle) {
        focusCircleField('Pick a circle')
        return
      }
      if (!categoryId) {
        focusCategoryField('Pick a category')
        return
      }
    }

    const updatedId = editingId
    setSaving(true)
    try {
      await updateRecurringBill(updatedId, {
        name: note.trim(),
        amount,
        type,
        category_id: type === 'transfer' ? null : categoryId,
        from_bucket_id: type === 'transfer' ? (fromBucket ?? null) : null,
        to_bucket_id: type === 'transfer' ? (toBucket ?? null) : null,
        circle: type === 'transfer' ? 'hd_family' : circle!,
        owner,
        due_day: dueDay,
        starts_year_month: startsYearMonth || null,
        ends_year_month: endsYearMonth || null,
        icon: resolveIcon(),
      })
      if (type !== 'transfer' && circle) setStoredCircle(circle)
      resetForm()
      setDayGroupsExpanded(true)
      setDayGroupsVersion((v) => v + 1)
      showAppToast(`Updated ${ActionEmoji.edit}`)
      setView('list')
      await reloadBills()
      setHighlightId(updatedId)
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  function handleAmountKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      amountRef.current?.blur()
      advanceAfterAmount()
    }
  }

  function handleNoteKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      focusDueDayField()
    }
  }

  function handleDueDayKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      focusStartsField()
    }
  }

  function handleStartsKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      focusEndsField()
    }
  }

  function handleEndsKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void (editingId ? handleUpdate() : handleAdd())
    }
  }

  useEffect(() => {
    if (!endsParts) return
    if (startsYearMonth <= endsYearMonth) return
    setEndsYearMonth(startsYearMonth)
  }, [startsYearMonth, endsYearMonth, endsParts])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const deletedId = deleteTarget.id
      await deleteRecurringBill(deleteTarget.id)
      setDeleteTarget(null)
      setOpenSwipeId(null)
      if (editingId === deletedId) {
        resetForm()
        setView('list')
      }
      showAppToast('Deleted')
      await reloadBills()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  if (!available) {
    return (
      <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
        Run <code className="text-xs">migrate_recurring_bills.sql</code> in
        Supabase SQL Editor to enable recurring templates.
      </p>
    )
  }

  const displayAmount = amountDigits ? formatNumber(Number(amountDigits)) : ''
  const startsPoint = formatRecurringPoint(dueDay, startsYearMonth)
  const endsPoint =
    endsYearMonth && endsParts
      ? formatRecurringPoint(dueDay, endsYearMonth)
      : null
  const deleteLabel =
    deleteTarget?.name.trim() ||
    (deleteTarget
      ? getRecurringBillDisplayParts(deleteTarget, allById, bucketsById)
          .parentName
      : 'this item')
  const editingBill = editingId ? bills.find((b) => b.id === editingId) ?? null : null

  return (
    <div className="space-y-3">
      {(loading || catsLoading) && (
        <p className="text-sm text-neutral-400">Loading…</p>
      )}
      {view === 'list' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500">
              Recurring list
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white active:bg-emerald-600"
            >
              {ActionEmoji.add} Add New
            </button>
          </div>
          {sortedBills.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
              No recurring items yet. Tap Add New to create one.
            </p>
          ) : (
            <GroupedListFrame
              expanded={dayGroupsExpanded}
              onToggle={(expanded) => {
                setDayGroupsExpanded(expanded)
                setDayGroupsVersion((v) => v + 1)
              }}
            >
              <div className="space-y-5">
              {groupedBills.map(([day, items]) => (
                <CollapsibleDayGroup
                  key={day}
                  title={`Day ${day}`}
                  persistKey={`settings:recurring:day:${day}`}
                  forceOpen={dayGroupsVersion > 0 ? dayGroupsExpanded : undefined}
                  forceVersion={dayGroupsVersion}
                >
                  <div className="space-y-2">
                    {items.map((bill) => {
                      const display = getRecurringBillDisplayParts(
                        bill,
                        allById,
                        bucketsById,
                      )
                      const isHighlighted = highlightId === bill.id
                      return (
                        <SwipeDeleteRow
                          key={bill.id}
                          open={openSwipeId === bill.id}
                          onOpenChange={(open) =>
                            setOpenSwipeId(open ? bill.id : null)
                          }
                          onDelete={() => {
                            setOpenSwipeId(bill.id)
                            setDeleteTarget(bill)
                          }}
                          contentRef={isHighlighted ? highlightRef : undefined}
                          highlighted={isHighlighted}
                          onContentClick={() => openEditForm(bill)}
                        >
                          <RecurringBillRowContent bill={bill} display={display} />
                        </SwipeDeleteRow>
                      )
                    })}
                  </div>
                </CollapsibleDayGroup>
              ))}
              </div>
            </GroupedListFrame>
          )}
        </div>
      ) : (
        <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                type === t
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50'
                  : 'text-neutral-500'
              }`}
            >
              {t === 'expense' ? 'Expense' : t === 'income' ? 'Income' : 'Transfer'}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Amount
          </span>
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-800">
            <span className="text-sm font-medium text-neutral-400">Rp</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
              autoComplete="off"
              value={displayAmount}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                setAmountDigits(digits)
              }}
              onKeyDown={handleAmountKeyDown}
              placeholder="0"
              className="w-full bg-transparent text-2xl font-semibold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300 dark:text-neutral-50"
            />
          </div>
        </label>

        <div className="space-y-3">
          <OwnerPicker
            value={owner}
            onChange={(next) => {
              setOwner(next)
              setOwnerOpen(false)
              if (isTransfer) {
                if (fromBucket === undefined) setFromOpen(true)
                else if (toBucket === undefined) setToOpen(true)
                else focusNoteField()
              } else if (!circle) {
                setCircleOpen(true)
              } else if (!categoryId) {
                setCategoryOpen(true)
              } else {
                focusNoteField()
              }
            }}
            open={ownerOpen}
            onOpenChange={(open) => {
              setOwnerOpen(open)
              if (open) {
                setCircleOpen(false)
                setCategoryOpen(false)
                setFromOpen(false)
                setToOpen(false)
              }
            }}
            highlighted={ownerOpen}
          />
          {isTransfer ? (
            bucketsLoading && buckets.length === 0 ? (
              <p className="text-sm text-neutral-400">Loading buckets…</p>
            ) : (
              <>
                <BucketPicker
                  label="From"
                  value={fromBucket}
                  buckets={buckets}
                  excludeId={toBucket ?? undefined}
                  open={fromOpen}
                  onOpenChange={(open) => {
                    setFromOpen(open)
                    if (open) {
                      setToOpen(false)
                      setOwnerOpen(false)
                    }
                  }}
                  onChange={(next) => {
                    setFromBucket(next)
                    setFromOpen(false)
                    if (toBucket === undefined) setToOpen(true)
                    else focusNoteField()
                  }}
                  highlighted={fromOpen}
                />
                <BucketPicker
                  label="To"
                  value={toBucket}
                  buckets={buckets}
                  excludeId={fromBucket ?? undefined}
                  open={toOpen}
                  onOpenChange={(open) => {
                    setToOpen(open)
                    if (open) {
                      setFromOpen(false)
                      setOwnerOpen(false)
                    }
                  }}
                  onChange={(next) => {
                    setToBucket(next)
                    setToOpen(false)
                    focusNoteField()
                  }}
                  highlighted={toOpen}
                />
              </>
            )
          ) : (
            <>
              <CirclePicker
                value={circle}
                onChange={(next) => {
                  setCircle(next)
                  setCircleOpen(false)
                  if (!categoryId) setCategoryOpen(true)
                  else focusNoteField()
                }}
                open={circleOpen}
                onOpenChange={(open) => {
                  setCircleOpen(open)
                  if (open) {
                    setCategoryOpen(false)
                    setOwnerOpen(false)
                  }
                }}
                highlighted={circleOpen}
              />
              {catsLoading && treeByUsage.length === 0 ? (
                <p className="text-sm text-neutral-400">Loading categories…</p>
              ) : (
                <CategoryPicker
                  tree={treeByUsage}
                  selectedId={categoryId}
                  byId={byId}
                  open={categoryOpen}
                  onOpenChange={(open) => {
                    setCategoryOpen(open)
                    if (open) {
                      setCircleOpen(false)
                      setOwnerOpen(false)
                    }
                  }}
                  onSelect={(id) => {
                    setCategoryId(id)
                    setCategoryOpen(false)
                    focusNoteField()
                  }}
                  transactionType={type}
                  onCategoriesChanged={reload}
                  highlighted={categoryOpen}
                />
              )}
            </>
          )}
        </div>

        <div>
          <NotesInput
            inputRef={noteRef}
            value={note}
            onChange={setNote}
            categoryId={isTransfer ? null : categoryId}
            owner={owner}
            onKeyDown={handleNoteKeyDown}
            enterKeyHint="next"
            placeholder="Note (optional)"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs text-neutral-400">Due day</span>
            <select
              ref={dueDayRef}
              value={dueDay}
              onChange={(e) => setDueDay(Number(e.target.value))}
              onKeyDown={handleDueDayKeyDown}
              className="w-full rounded-xl bg-white px-3 py-3 text-sm shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs text-neutral-400">Starts</span>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={startsParts.month}
                onChange={(e) => {
                  const nextMonth = Number(e.target.value)
                  const nextStarts = toYearMonth(startsParts.year, nextMonth)
                  setStartsYearMonth(nextStarts)
                  if (endsYearMonth && nextStarts > endsYearMonth) {
                    setEndsYearMonth(nextStarts)
                  }
                }}
                className="w-full rounded-xl bg-white px-2 py-3 text-sm shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
              >
                {startsMonthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                ref={startsRef}
                value={startsParts.year}
                onChange={(e) => {
                  const nextYear = Number(e.target.value)
                  let nextMonth = startsParts.month
                  if (
                    endsParts &&
                    nextYear === endsParts.year &&
                    nextMonth > endsParts.month
                  ) {
                    nextMonth = endsParts.month
                  }
                  const nextStarts = toYearMonth(nextYear, nextMonth)
                  setStartsYearMonth(nextStarts)
                  if (endsYearMonth && nextStarts > endsYearMonth) {
                    setEndsYearMonth(nextStarts)
                  }
                }}
                onKeyDown={handleStartsKeyDown}
                className="w-full rounded-xl bg-white px-2 py-3 text-sm shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
              >
                {startsYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs text-neutral-400">Ends</span>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                ref={endsRef}
                value={endsParts ? String(endsParts.month) : 'ongoing'}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === 'ongoing') {
                    setEndsYearMonth('')
                    return
                  }
                  const nextMonth = Number(raw)
                  const nextYear = endsParts
                    ? endsParts.year
                    : nextMonth < startsParts.month
                      ? startsParts.year + 1
                      : startsParts.year
                  const safeMonth =
                    nextYear === startsParts.year && nextMonth < startsParts.month
                      ? startsParts.month
                      : nextMonth
                  setEndsYearMonth(toYearMonth(nextYear, safeMonth))
                }}
                onKeyDown={handleEndsKeyDown}
                className="w-full rounded-xl bg-white px-2 py-3 text-sm shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="ongoing">Ongoing</option>
                {endsMonthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                value={endsParts?.year ?? startsParts.year}
                disabled={!endsParts}
                onChange={(e) => {
                  if (!endsParts) return
                  const nextYear = Number(e.target.value)
                  let nextMonth = endsParts.month
                  if (
                    nextYear === startsParts.year &&
                    nextMonth < startsParts.month
                  ) {
                    nextMonth = startsParts.month
                  }
                  setEndsYearMonth(toYearMonth(nextYear, nextMonth))
                }}
                className="w-full rounded-xl bg-white px-2 py-3 text-sm shadow-sm disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {endsYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <p className="text-[11px] text-neutral-400">
          {endsPoint
            ? `Runs monthly on day ${dueDay}. Starts from ${startsPoint} until ${endsPoint}.`
            : `Runs monthly on day ${dueDay}. Starts from ${startsPoint} with no end date.`}
        </p>

        <button
          type="button"
          onClick={() => void (editingId ? handleUpdate() : handleAdd())}
          disabled={saving}
          className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-md active:bg-emerald-600 disabled:opacity-60"
        >
          {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
        </button>
        {editingId ? (
          <button
            type="button"
            onClick={() => {
              if (!editingBill) return
              setDeleteTarget(editingBill)
            }}
            disabled={saving}
            className="w-full rounded-xl bg-red-100 py-3 text-sm font-semibold text-red-700 active:bg-red-200 disabled:opacity-60 dark:bg-red-900/50 dark:text-red-200 dark:active:bg-red-900"
          >
            Delete
          </button>
        ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete recurring item?"
        message={`“${deleteLabel}” will be removed from Plan. Past checklist logs stay linked.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleting}
        onCancel={() => {
          if (deleting) return
          setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
