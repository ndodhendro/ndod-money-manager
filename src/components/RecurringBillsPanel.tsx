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
import { usePyfSettings } from '../hooks/usePyfSettings'
import { useTransactions } from '../hooks/useTransactions'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { areAllCollapseOpen } from '../lib/collapseState'
import { formatNumber, formatRupiah, todayIso } from '../lib/format'
import {
  getRecurringBillDisplayParts,
  sortRecurringBillsForSettings,
} from '../lib/recurringBillDisplay'
import { getStoredCircle, getStoredProfile, setStoredCircle } from '../lib/profile'
import {
  currentMonthCursor,
  monthCursorKey,
  monthCursorRange,
  yearMonthFromIso,
} from '../lib/monthCursor'
import {
  pyfAutoAmountPlaceholder,
  pyfAutoTransferKind,
  pyfTransferTargetAmount,
  resolveEstimateAmount,
  sumMonthIncome,
} from '../lib/moneyPlan'
import {
  createRecurringBill,
  deleteRecurringBill,
  fetchRecurringBillLogs,
  fetchRecurringBills,
  formatIntervalLabel,
  formatRecurringSettingsDescription,
  isMissingRecurringSchema,
  RECURRING_EVERY_OPTIONS,
  recurringEveryKey,
  updateRecurringBill,
  type RecurringBill,
  type RecurringIntervalUnit,
} from '../lib/recurringBillsApi'
import {
  estimatePlanBadgeGroup,
  estimatePlanTag,
  sumEstimateTotalsByType,
} from '../lib/freeWants'
import {
  TRANSFER_TYPE_ICON,
  type Circle,
  type Owner,
  type TransactionType,
} from '../lib/types'
import {
  BucketPicker,
  type BucketSelection,
} from './BucketPicker'
import { CategoryPicker } from './CategoryPicker'
import { CirclePicker } from './CirclePicker'
import { DatePickerField } from './DatePickerField'
import { GroupedListFrame } from './GroupedListFrame'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
import { ConfirmDialog } from './ConfirmDialog'
import { NotesInput } from './NotesInput'
import { OwnerPicker } from './OwnerPicker'
import { RecurringBillRowContent } from './RecurringBillRowContent'
import { SwipeDeleteRow } from './SwipeDeleteRow'

function groupEstimatesForSettings(
  bills: RecurringBill[],
): Array<{ key: string; title: string; items: RecurringBill[] }> {
  const estimates: RecurringBill[] = []
  const byDay = new Map<number, RecurringBill[]>()
  for (const bill of bills) {
    if (!bill.is_recurring) {
      estimates.push(bill)
      continue
    }
    const list = byDay.get(bill.due_day) ?? []
    list.push(bill)
    byDay.set(bill.due_day, list)
  }
  const groups: Array<{ key: string; title: string; items: RecurringBill[] }> =
    []
  if (estimates.length > 0) {
    groups.push({
      key: 'estimate',
      title: 'Estimates',
      items: estimates,
    })
  }
  for (const [day, items] of [...byDay.entries()].sort(([a], [b]) => b - a)) {
    groups.push({
      key: `day:${day}`,
      title: `Day ${day}`,
      items,
    })
  }
  return groups
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
  const minYear = 2026
  const years: number[] = []
  // Starts/Ends: from 2026 through a long forward range for installments/plans.
  for (let year = minYear; year <= Math.max(nowYear, minYear) + 80; year++) {
    years.push(year)
  }
  return years
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
  const [type, setType] = useState<TransactionType>('expense')
  const categoryType = type === 'transfer' ? undefined : type
  const { treeByUsage, byId, loading: catsLoading, reload } =
    useCategories(categoryType)
  const { byId: allById } = useCategories(undefined, { includeInactive: true })
  const { buckets, loading: bucketsLoading } = useBuckets()
  const { settings: pyfSettings } = usePyfSettings()
  const settingsMonthRange = useMemo(
    () => monthCursorRange(currentMonthCursor()),
    [],
  )
  const { transactions: monthTransactions } = useTransactions(settingsMonthRange)
  const monthIncome = useMemo(
    () => sumMonthIncome(monthTransactions),
    [monthTransactions],
  )

  const [bills, setBills] = useState<RecurringBill[]>([])
  const [currentMonthDoneByBillId, setCurrentMonthDoneByBillId] = useState(
    () => new Set<string>(),
  )
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
  const [circle, setCircle] = useState<Circle | null>(null)
  const [owner, setOwner] = useState<Owner | null>(null)
  const [dueDay, setDueDay] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<RecurringIntervalUnit>('month')
  const [intervalMonths, setIntervalMonths] = useState(1)
  const [startsYearMonth, setStartsYearMonth] = useState(() =>
    currentYearMonthValue(),
  )
  const [startsOn, setStartsOn] = useState(() => todayIso())
  const [endsYearMonth, setEndsYearMonth] = useState('')
  const [variableAmount, setVariableAmount] = useState(false)
  const [isRecurring, setIsRecurring] = useState(true)
  const yearOptions = useMemo(() => {
    const base = buildYearOptions()
    const minYear = base[0] ?? 2026
    const extras = new Set<number>()
    const starts = parseYearMonth(startsYearMonth)
    const ends = endsYearMonth ? parseYearMonth(endsYearMonth) : null
    if (starts && starts.year < minYear) extras.add(starts.year)
    if (ends && ends.year < minYear) extras.add(ends.year)
    if (extras.size === 0) return base
    return [...extras, ...base].sort((a, b) => a - b)
  }, [startsYearMonth, endsYearMonth])
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
  const intervalMonthsRef = useRef<HTMLSelectElement>(null)
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
  const isIncome = type === 'income'
  const bucketsById = useMemo(
    () => new Map(buckets.map((b) => [b.id, b])),
    [buckets],
  )
  const emergencyPct = pyfSettings?.emergency_fund_pct ?? 10
  const investmentPct = pyfSettings?.investment_pct ?? 15
  const amountCtx = useMemo(
    () => ({
      monthIncome,
      emergencyPct,
      investmentPct,
      bucketsById,
    }),
    [monthIncome, emergencyPct, investmentPct, bucketsById],
  )
  const formPyfKind =
    isTransfer && toBucket
      ? pyfAutoTransferKind(
          { type: 'transfer', to_bucket_id: toBucket },
          bucketsById,
        )
      : null
  const isFormPyfAuto = formPyfKind != null
  const formPyfAmount = formPyfKind
    ? pyfTransferTargetAmount(
        formPyfKind,
        monthIncome,
        emergencyPct,
        investmentPct,
      )
    : 0
  const sortedBills = useMemo(
    () => sortRecurringBillsForSettings(bills, allById, bucketsById),
    [bills, allById, bucketsById],
  )
  const groupedBills = useMemo(
    () => groupEstimatesForSettings(sortedBills),
    [sortedBills],
  )
  const monthTotals = useMemo(
    () =>
      sumEstimateTotalsByType(
        bills,
        new Map(),
        monthCursorKey(currentMonthCursor()),
        undefined,
        amountCtx,
      ),
    [bills, amountCtx],
  )
  const dayPersistKeys = useMemo(
    () =>
      groupedBills.map((g) =>
        g.key === 'estimate'
          ? 'settings:estimates:nodate'
          : `settings:recurring:day:${g.key.replace('day:', '')}`,
      ),
    [groupedBills],
  )

  useEffect(() => {
    if (dayGroupsVersion > 0) return
    setDayGroupsExpanded(areAllCollapseOpen(dayPersistKeys, true))
  }, [dayPersistKeys, dayGroupsVersion])

  useEffect(() => {
    if (!isFormPyfAuto) return
    setVariableAmount(false)
    setAmountDigits(
      formPyfAmount > 0 ? String(Math.round(formPyfAmount)) : '',
    )
  }, [isFormPyfAuto, formPyfAmount])

  async function reloadBills(options?: { silent?: boolean }) {
    if (!options?.silent) setLoading(true)
    try {
      const currentYm = monthCursorKey(currentMonthCursor())
      const [rows, currentLogs] = await Promise.all([
        fetchRecurringBills(),
        fetchRecurringBillLogs(currentYm),
      ])
      setBills(rows)
      setCurrentMonthDoneByBillId(new Set(currentLogs.map((l) => l.bill_id)))
      setAvailable(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (isMissingRecurringSchema(message)) {
        setAvailable(false)
        setBills([])
        setCurrentMonthDoneByBillId(new Set())
      } else {
        showAppToast(message || 'Failed to load')
      }
    } finally {
      if (!options?.silent) setLoading(false)
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
    if (isFormPyfAuto) return true
    return Number(amountDigits) > 0
  }

  function focusNoteField() {
    closePickers()
    noteRef.current?.focus()
  }

  function focusIntervalField() {
    closePickers()
    intervalMonthsRef.current?.focus()
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
      if (!circle) {
        focusCircleField()
        return
      }
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
    if (type === 'income') {
      if (!categoryId) {
        focusCategoryField()
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
    } else if (next === 'income') {
      setFromBucket(undefined)
      setToBucket(undefined)
      setCircle('hd_family')
    } else {
      setFromBucket(undefined)
      setToBucket(undefined)
      setCircle(null)
    }
  }

  function resetForm() {
    setType('expense')
    setNote('')
    setAmountDigits('')
    setCategoryId(null)
    setFromBucket(undefined)
    setToBucket(undefined)
    setCircle(null)
    setOwner(null)
    setDueDay(1)
    setIntervalUnit('month')
    setIntervalMonths(1)
    setStartsYearMonth(currentYearMonthValue())
    setStartsOn(todayIso())
    setEndsYearMonth('')
    setVariableAmount(false)
    setIsRecurring(true)
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
    setIntervalUnit(bill.interval_unit ?? 'month')
    setIntervalMonths(bill.interval_months ?? 1)
    setStartsYearMonth(bill.starts_year_month ?? currentYearMonthValue())
    setStartsOn(
      bill.starts_on ??
        (bill.starts_year_month
          ? `${bill.starts_year_month}-${String(bill.due_day).padStart(2, '0')}`
          : todayIso()),
    )
    setEndsYearMonth(bill.ends_year_month ?? '')
    setVariableAmount(bill.variable_amount === true)
    setIsRecurring(bill.is_recurring !== false)
    setOpenSwipeId(null)
    closePickers()

    if (bill.type === 'transfer') {
      setCategoryId(null)
      setCircle(bill.circle ?? getStoredCircle())
      setFromBucket(bill.from_bucket_id)
      setToBucket(bill.to_bucket_id)
    } else if (bill.type === 'income') {
      setCategoryId(bill.category_id)
      setCircle('hd_family')
      setFromBucket(undefined)
      setToBucket(undefined)
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
    if (type === 'transfer') return TRANSFER_TYPE_ICON
    const cat = categoryId ? byId.get(categoryId) : null
    return cat?.icon ?? '📌'
  }

  function buildIntervalFields() {
    const lockedVariable = isFormPyfAuto ? false : variableAmount
    if (!isRecurring) {
      return {
        interval_unit: 'month' as const,
        interval_months: 1,
        starts_on: null as string | null,
        starts_year_month: null as string | null,
        due_day: 1,
        ends_year_month: null as string | null,
        variable_amount: false,
        is_recurring: false,
      }
    }
    if (intervalUnit === 'week') {
      const day = Number(startsOn.slice(8, 10))
      return {
        interval_unit: 'week' as const,
        interval_months: intervalMonths,
        starts_on: startsOn,
        starts_year_month: yearMonthFromIso(startsOn),
        due_day: Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1,
        ends_year_month: endsYearMonth || null,
        variable_amount: lockedVariable,
        is_recurring: true,
      }
    }
    return {
      interval_unit: 'month' as const,
      interval_months: intervalMonths,
      starts_on: null as string | null,
      starts_year_month: startsYearMonth || null,
      due_day: dueDay,
      ends_year_month: endsYearMonth || null,
      variable_amount: lockedVariable,
      is_recurring: true,
    }
  }

  function resolveSaveAmount(): number | null {
    if (isFormPyfAuto) {
      return pyfAutoAmountPlaceholder(formPyfAmount)
    }
    const amount = Number(amountDigits)
    if (!amount || amount <= 0) return null
    return amount
  }

  async function handleAdd() {
    const amount = resolveSaveAmount()
    if (amount == null) {
      focusAmountField('Enter an amount')
      return
    }

    if (!owner) {
      focusOwnerField('Pick a profile')
      return
    }

    if (type === 'transfer') {
      if (!circle) {
        focusCircleField('Pick a circle')
        return
      }
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
    } else if (type === 'income') {
      if (!categoryId) {
        focusCategoryField('Pick a category')
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

    const resolvedCircle = type === 'income' ? 'hd_family' : circle!
    const intervalFields = buildIntervalFields()

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
              circle: resolvedCircle,
              owner,
              icon: resolveIcon(),
              ...intervalFields,
            }
          : {
              name: note.trim(),
              amount,
              type,
              category_id: categoryId!,
              from_bucket_id: null,
              to_bucket_id: null,
              circle: resolvedCircle,
              owner,
              icon: resolveIcon(),
              ...intervalFields,
            },
      )
      if (type !== 'income') setStoredCircle(resolvedCircle)
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

    const amount = resolveSaveAmount()
    if (amount == null) {
      focusAmountField('Enter an amount')
      return
    }

    if (!owner) {
      focusOwnerField('Pick a profile')
      return
    }

    if (type === 'transfer') {
      if (!circle) {
        focusCircleField('Pick a circle')
        return
      }
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
    } else if (type === 'income') {
      if (!categoryId) {
        focusCategoryField('Pick a category')
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

    const resolvedCircle = type === 'income' ? 'hd_family' : circle!
    const updatedId = editingId
    const intervalFields = buildIntervalFields()
    setSaving(true)
    try {
      await updateRecurringBill(updatedId, {
        name: note.trim(),
        amount,
        type,
        category_id: type === 'transfer' ? null : categoryId,
        from_bucket_id: type === 'transfer' ? (fromBucket ?? null) : null,
        to_bucket_id: type === 'transfer' ? (toBucket ?? null) : null,
        circle: resolvedCircle,
        owner,
        icon: resolveIcon(),
        ...intervalFields,
      })
      if (type !== 'income') setStoredCircle(resolvedCircle)
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
      if (isRecurring) focusIntervalField()
      else void (editingId ? handleUpdate() : handleAdd())
    }
  }

  function handleIntervalKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (intervalUnit === 'week') focusStartsField()
      else focusDueDayField()
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
      setHighlightId(null)
      if (editingId === deletedId) {
        resetForm()
        setView('list')
      }
      showAppToast('Deleted')
      await reloadBills({ silent: true })
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
        Supabase SQL Editor to enable monthly estimates.
      </p>
    )
  }

  const displayAmount = isFormPyfAuto
    ? formPyfAmount > 0
      ? formatNumber(formPyfAmount)
      : '0'
    : amountDigits
      ? formatNumber(Number(amountDigits))
      : ''
  const settingsDescription = isRecurring
    ? formatRecurringSettingsDescription({
        intervalUnit,
        intervalMonths,
        dueDay:
          intervalUnit === 'week'
            ? Number(startsOn.slice(8, 10)) || dueDay
            : dueDay,
        startsYearMonth:
          intervalUnit === 'week'
            ? yearMonthFromIso(startsOn)
            : startsYearMonth || null,
        endsYearMonth: endsYearMonth || null,
        startsOn: intervalUnit === 'week' ? startsOn : null,
      })
    : 'One-time monthly amount estimate (no due date)'
  const everySelectValue = recurringEveryKey(intervalUnit, intervalMonths)
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
          <div className="flex items-center justify-end">
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
              No estimates yet. Tap Add New to create one.
            </p>
          ) : (
            <>
              <div className="rounded-xl bg-white px-3 py-2.5 text-xs shadow-sm dark:bg-neutral-800">
                <p className="mb-1.5 font-medium text-neutral-500 dark:text-neutral-400">
                  This Month Totals
                </p>
                <div className="grid grid-cols-3 gap-2 tabular-nums">
                  <div>
                    <p className="text-[10px] text-neutral-400">Expense</p>
                    <p className="font-semibold text-rose-600 dark:text-rose-400">
                      {formatRupiah(monthTotals.expense)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-400">Income</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatRupiah(monthTotals.income)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-400">Transfer</p>
                    <p className="font-semibold text-violet-600 dark:text-violet-400">
                      {formatRupiah(monthTotals.transfer)}
                    </p>
                  </div>
                </div>
              </div>
              <GroupedListFrame
                label="Monthly Estimates"
                expanded={dayGroupsExpanded}
                onToggle={(expanded) => {
                  setDayGroupsExpanded(expanded)
                  setDayGroupsVersion((v) => v + 1)
                }}
              >
                <div className="space-y-5">
                  {groupedBills.map((group) => (
                    <CollapsibleDayGroup
                      key={group.key}
                      title={group.title}
                      persistKey={
                        group.key === 'estimate'
                          ? 'settings:estimates:nodate'
                          : `settings:recurring:day:${group.key.replace('day:', '')}`
                      }
                      forceOpen={
                        dayGroupsVersion > 0 ? dayGroupsExpanded : undefined
                      }
                      forceVersion={dayGroupsVersion}
                    >
                      <div className="space-y-2">
                        {group.items.map((bill) => {
                          const display = getRecurringBillDisplayParts(
                            bill,
                            allById,
                            bucketsById,
                          )
                          const planTag = estimatePlanTag(
                            bill,
                            allById,
                            bucketsById,
                          )
                          const budgetGroup = estimatePlanBadgeGroup(planTag)
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
                              contentRef={
                                isHighlighted ? highlightRef : undefined
                              }
                              highlighted={isHighlighted}
                              onContentClick={() => openEditForm(bill)}
                            >
                              <RecurringBillRowContent
                                bill={bill}
                                display={display}
                                displayAmount={resolveEstimateAmount(
                                  bill,
                                  null,
                                  amountCtx,
                                )}
                                currentMonthDone={currentMonthDoneByBillId.has(
                                  bill.id,
                                )}
                                budgetGroup={budgetGroup}
                              />
                            </SwipeDeleteRow>
                          )
                        })}
                      </div>
                    </CollapsibleDayGroup>
                  ))}
                </div>
              </GroupedListFrame>
            </>
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
          <div
            className={`flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-800 ${
              isFormPyfAuto ? 'opacity-80' : ''
            }`}
          >
            <span className="text-sm font-medium text-neutral-400">Rp</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
              autoComplete="off"
              value={displayAmount}
              readOnly={isFormPyfAuto}
              disabled={isFormPyfAuto}
              onChange={(e) => {
                if (isFormPyfAuto) return
                const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                setAmountDigits(digits)
              }}
              onKeyDown={handleAmountKeyDown}
              placeholder="0"
              className="w-full bg-transparent text-2xl font-semibold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300 disabled:cursor-not-allowed dark:text-neutral-50"
            />
          </div>
          {isFormPyfAuto ? (
            <p className="mt-1.5 text-xs text-neutral-400">
              From Money Plan ({formPyfKind === 'emergency' ? emergencyPct : investmentPct}%
              × this month&apos;s income).
            </p>
          ) : null}
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-800">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-emerald-600 accent-emerald-500"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              Recurring
            </span>
            <span className="mt-0.5 block text-xs text-neutral-400">
              Has a due schedule and appears on the Due Checklist. Turn off for
              estimates without a fixed date (e.g. fuel).
            </span>
          </span>
        </label>

        {isRecurring && !isFormPyfAuto ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-800">
            <input
              type="checkbox"
              checked={variableAmount}
              onChange={(e) => setVariableAmount(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-amber-600 accent-amber-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
                Variable Amount
              </span>
              <span className="mt-0.5 block text-xs text-neutral-400">
                Amount may change each cycle. Plan will confirm before checking.
              </span>
            </span>
          </label>
        ) : null}

        <div className="space-y-3">
          <OwnerPicker
            value={owner}
            onChange={(next) => {
              setOwner(next)
              setOwnerOpen(false)
              if (isTransfer) {
                if (!circle) setCircleOpen(true)
                else if (fromBucket === undefined) setFromOpen(true)
                else if (toBucket === undefined) setToOpen(true)
                else focusNoteField()
              } else if (isIncome) {
                if (!categoryId) setCategoryOpen(true)
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
                <CirclePicker
                  value={circle}
                  onChange={(next) => {
                    setCircle(next)
                    setCircleOpen(false)
                    if (fromBucket === undefined) setFromOpen(true)
                    else if (toBucket === undefined) setToOpen(true)
                    else focusNoteField()
                  }}
                  open={circleOpen}
                  onOpenChange={(open) => {
                    setCircleOpen(open)
                    if (open) {
                      setCategoryOpen(false)
                      setOwnerOpen(false)
                      setFromOpen(false)
                      setToOpen(false)
                    }
                  }}
                  highlighted={circleOpen}
                />
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
                      setCircleOpen(false)
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
                      setCircleOpen(false)
                      setOwnerOpen(false)
                    }
                  }}
                  onChange={(next) => {
                    setToBucket(next)
                    setToOpen(false)
                    focusNoteField()
                  }}
                  highlighted={toOpen}
                  showBudgetGroup
                />
              </>
            )
          ) : (
            <>
              <CirclePicker
                value={isIncome ? 'hd_family' : circle}
                onChange={(next) => {
                  setCircle(next)
                  setCircleOpen(false)
                  if (!categoryId) setCategoryOpen(true)
                  else focusNoteField()
                }}
                open={circleOpen}
                onOpenChange={(open) => {
                  if (isIncome) return
                  setCircleOpen(open)
                  if (open) {
                    setCategoryOpen(false)
                    setOwnerOpen(false)
                  }
                }}
                highlighted={circleOpen}
                locked={isIncome}
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
                  showBudgetGroup={!isIncome}
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
            enterKeyHint={isRecurring ? 'next' : 'done'}
            placeholder="Note (optional)"
          />
        </div>

        {isRecurring ? (
          <>
        <div
          className={`grid gap-2 ${intervalUnit === 'week' ? 'grid-cols-1' : 'grid-cols-2'}`}
        >
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs text-neutral-400">Every</span>
            <select
              ref={intervalMonthsRef}
              value={everySelectValue}
              onChange={(e) => {
                const next = RECURRING_EVERY_OPTIONS.find(
                  (o) => o.key === e.target.value,
                )
                if (!next) return
                setIntervalUnit(next.unit)
                setIntervalMonths(next.every)
                if (next.unit === 'week' && !startsOn) setStartsOn(todayIso())
              }}
              onKeyDown={handleIntervalKeyDown}
              className="w-full rounded-xl bg-white px-3 py-3 text-sm shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
            >
              {RECURRING_EVERY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {formatIntervalLabel(o.unit, o.every)}
                </option>
              ))}
            </select>
          </label>

          {intervalUnit === 'month' ? (
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs text-neutral-400">
                Due day
              </span>
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
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-xs text-neutral-400">Starts</span>
            {intervalUnit === 'week' ? (
              <DatePickerField
                value={startsOn}
                allowFuture
                onChange={(iso) => {
                  setStartsOn(iso)
                  const nextYm = yearMonthFromIso(iso)
                  setStartsYearMonth(nextYm)
                  if (endsYearMonth && nextYm > endsYearMonth) {
                    setEndsYearMonth(nextYm)
                  }
                }}
                onFinished={() => focusEndsField()}
              />
            ) : (
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
            )}
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
        <p className="text-[11px] text-neutral-400">{settingsDescription}</p>
          </>
        ) : (
          <p className="text-[11px] text-neutral-400">{settingsDescription}</p>
        )}

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
        title="Delete estimate?"
        message={`“${deleteLabel}” will be removed from Monthly Estimates. Past checklist logs stay linked.`}
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
