import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BucketPicker,
  type BucketSelection,
} from '../components/BucketPicker'
import { CategoryPicker } from '../components/CategoryPicker'
import { CirclePicker } from '../components/CirclePicker'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DatePickerField } from '../components/DatePickerField'
import { NotesInput } from '../components/NotesInput'
import { OwnerBadge } from '../components/OwnerBadge'
import { OwnerPicker } from '../components/OwnerPicker'
import { PageTitle } from '../components/PageTitle'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import {
  bumpCategoryUsage,
  getStoredCircle,
  getStoredProfile,
  setStoredCircle,
} from '../lib/profile'
import { formatNumber, todayIso } from '../lib/format'
import { showAppToast } from '../lib/appToast'
import {
  claimNumericKeyboard,
  dismissNumericKeyboard,
  focusAmountOnTambahReady,
  openNumericKeyboard,
  registerAmountInput,
} from '../lib/keyboardFocus'
import { supabase } from '../lib/supabase'
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '../lib/transactionsApi'
import {
  isCircle,
  isTransactionFullySpecified,
  type CategoryType,
  type Circle,
  type NewTransactionInput,
  type Owner,
  type TransactionType,
} from '../lib/types'

interface QuickAddProps {
  /** False saat layar Tambah di-park (opacity-0). Jangan register/claim input tersembunyi. */
  isActive?: boolean
}

export function QuickAdd({ isActive = true }: QuickAddProps) {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const profileOwner: Owner = getStoredProfile() ?? 'suami'

  // Default always Expense (most common capture). Income only via ?type=income.
  const [type, setType] = useState<TransactionType>('expense')
  const [amountDigits, setAmountDigits] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [fromBucket, setFromBucket] = useState<BucketSelection | undefined>(
    undefined,
  )
  const [toBucket, setToBucket] = useState<BucketSelection | undefined>(
    undefined,
  )
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [owner, setOwner] = useState<Owner>(profileOwner)
  const [circle, setCircle] = useState<Circle | null>(null)
  const [completeLater, setCompleteLater] = useState(false)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(isEditing)
  const [circleOpen, setCircleOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const amountRef = useRef<HTMLInputElement | null>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const wasActiveRef = useRef(false)
  /** True if this edit session opened an existing Complete Later placeholder. */
  const loadedAsCompleteLaterRef = useRef(false)

  const amountCallbackRef = useCallback(
    (el: HTMLInputElement | null) => {
      amountRef.current = el
      if (!isEditing && isActive) registerAmountInput(el)
    },
    [isEditing, isActive],
  )

  useEffect(() => {
    if (isEditing) return
    if (isActive) {
      registerAmountInput(amountRef.current)
      return () => {
        registerAmountInput(null)
      }
    }
    registerAmountInput(null)
    dismissNumericKeyboard()
  }, [isActive, isEditing])

  const categoryType: CategoryType | undefined =
    type === 'transfer' ? undefined : type
  const { treeByUsage, byId, loading: loadingCategories, reload } =
    useCategories(categoryType)
  const { buckets, loading: loadingBuckets, reload: reloadBuckets } =
    useBuckets()

  useEffect(() => {
    if (!isEditing || !id) return
    let cancelled = false
    async function loadExisting() {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single()
      if (cancelled) return
      if (!error && data) {
        setType(data.type as TransactionType)
        const amt = Number(data.amount)
        setAmountDigits(amt > 0 ? String(Math.round(amt)) : '')
        setCategoryId(data.category_id)
        setFromBucket(
          data.type === 'transfer'
            ? ((data.from_bucket_id as string | null) ?? null)
            : undefined,
        )
        setToBucket(
          data.type === 'transfer'
            ? ((data.to_bucket_id as string | null) ?? null)
            : undefined,
        )
        setDescription(data.description ?? '')
        setOccurredOn(data.occurred_on)
        setOwner(data.owner)
        const wasCompleteLater = data.complete_later === true
        loadedAsCompleteLaterRef.current = wasCompleteLater
        setCompleteLater(wasCompleteLater)
        if ((data.type as TransactionType) === 'income') {
          setCircle('hd_family')
        } else if (isCircle(data.circle)) {
          setCircle(data.circle)
        }
      }
      setLoadingExisting(false)
    }
    loadExisting()
    return () => {
      cancelled = true
    }
  }, [id, isEditing])

  function resetForm() {
    const param = searchParams.get('type')
    const nextType: TransactionType =
      param === 'income'
        ? 'income'
        : param === 'transfer'
          ? 'transfer'
          : 'expense'
    setType(nextType)
    setAmountDigits('')
    setCategoryId(null)
    setFromBucket(param === 'transfer' ? null : undefined)
    setToBucket(undefined)
    setDescription('')
    setOccurredOn(todayIso())
    setOwner(getStoredProfile() ?? 'suami')
    setCircle(nextType === 'income' ? 'hd_family' : null)
    setCompleteLater(false)
    loadedAsCompleteLaterRef.current = false
    setOwnerOpen(false)
    setCircleOpen(false)
    setCategoryOpen(false)
    setFromOpen(false)
    setToOpen(false)
    setSaving(false)
  }

  useEffect(() => {
    if (isEditing) {
      wasActiveRef.current = isActive
      return
    }
    if (isActive && !wasActiveRef.current) {
      resetForm()
    }
    wasActiveRef.current = isActive
  }, [isActive, isEditing, searchParams])

  useLayoutEffect(() => {
    if (isEditing || !isActive || loadingExisting) return
    focusAmountOnTambahReady(amountRef.current)
  }, [isEditing, isActive, loadingExisting])

  useEffect(() => {
    if (type === 'transfer') return
    if (loadingCategories || !categoryId) return
    if (!byId.has(categoryId)) setCategoryId(null)
  }, [type, loadingCategories, byId, categoryId])

  useEffect(() => {
    if (type !== 'transfer') return
    // Default: from Main Account → pick destination bucket (common funding path).
    setFromBucket((prev) => (prev === undefined ? null : prev))
  }, [type])

  const goBackToHistory = useCallback(() => {
    dismissNumericKeyboard()
    navigate('/riwayat', { replace: true })
  }, [navigate])

  function isAmountFilled() {
    return Number(amountDigits) > 0
  }

  function isTransferReady() {
    return fromBucket !== undefined && toBucket !== undefined
  }

  function findIncompleteAbove(
    from: 'circle' | 'category' | 'description' | 'save' | 'from' | 'to',
  ): 'amount' | 'circle' | 'category' | 'from' | 'to' | null {
    if (completeLater) return null
    if (!isAmountFilled()) return 'amount'
    if (type === 'transfer') {
      if (from !== 'circle' && !circle) return 'circle'
      if (from !== 'from' && from !== 'circle' && fromBucket === undefined) {
        return 'from'
      }
      if (
        from !== 'to' &&
        from !== 'from' &&
        from !== 'circle' &&
        toBucket === undefined
      ) {
        return 'to'
      }
      return null
    }
    if (type === 'income') {
      if (from !== 'category' && !categoryId) return 'category'
      return null
    }
    if (from !== 'circle' && !circle) return 'circle'
    if (from !== 'category' && from !== 'circle' && !categoryId) return 'category'
    return null
  }

  function findNextEmpty(
    from: 'amount' | 'circle' | 'category' | 'from' | 'to',
  ): 'circle' | 'category' | 'from' | 'to' | null {
    if (type === 'transfer') {
      if (from === 'amount') {
        if (!circle) return 'circle'
        if (fromBucket === undefined) return 'from'
        if (toBucket === undefined) return 'to'
        return null
      }
      if (from === 'circle') {
        if (fromBucket === undefined) return 'from'
        if (toBucket === undefined) return 'to'
        return null
      }
      if (from === 'from') {
        if (toBucket === undefined) return 'to'
        return null
      }
      return null
    }
    if (type === 'income') {
      if (from === 'amount' && !categoryId) return 'category'
      return null
    }
    if (from === 'amount') {
      if (!circle) return 'circle'
      if (!categoryId) return 'category'
      return null
    }
    if (from === 'circle') {
      if (!categoryId) return 'category'
      return null
    }
    return null
  }

  function focusAmountField(message?: string) {
    setCircleOpen(false)
    setCategoryOpen(false)
    setFromOpen(false)
    setToOpen(false)
    if (message) showAppToast(message)
    openNumericKeyboard()
    if (!claimNumericKeyboard(amountRef.current)) {
      amountRef.current?.focus()
    }
  }

  function focusCircleField(message?: string) {
    setCategoryOpen(false)
    setFromOpen(false)
    setToOpen(false)
    if (message) showAppToast(message)
    setCircleOpen(true)
  }

  function focusCategoryField(message?: string) {
    setCircleOpen(false)
    setFromOpen(false)
    setToOpen(false)
    if (message) showAppToast(message)
    setCategoryOpen(true)
  }

  function focusFromField(message?: string) {
    setCircleOpen(false)
    setCategoryOpen(false)
    setToOpen(false)
    if (message) showAppToast(message)
    setFromOpen(true)
  }

  function focusToField(message?: string) {
    setCircleOpen(false)
    setCategoryOpen(false)
    setFromOpen(false)
    if (message) showAppToast(message)
    setToOpen(true)
  }

  function focusNextEmptyField(
    from: 'amount' | 'circle' | 'category' | 'from' | 'to',
  ) {
    const next = findNextEmpty(from)
    if (next === 'circle') {
      focusCircleField()
      return
    }
    if (next === 'category') {
      focusCategoryField()
      return
    }
    if (next === 'from') {
      focusFromField()
      return
    }
    if (next === 'to') {
      focusToField()
    }
  }

  function focusNextAfterDate() {
    if (completeLater) return
    if (!isAmountFilled()) {
      focusAmountField()
      return
    }
    focusNextEmptyField('amount')
  }

  function focusIncompleteField(
    field: 'amount' | 'circle' | 'category' | 'from' | 'to',
  ) {
    if (field === 'amount') {
      focusAmountField('Enter the amount first')
      return
    }
    if (field === 'circle') {
      focusCircleField('Pick a circle first')
      return
    }
    if (field === 'from') {
      focusFromField('Pick a source first')
      return
    }
    if (field === 'to') {
      focusToField('Pick a destination first')
      return
    }
    focusCategoryField('Pick a category first')
  }

  function advanceOrFixAbove(
    from: 'amount' | 'circle' | 'category' | 'description' | 'save' | 'from' | 'to',
  ): boolean {
    if (completeLater) {
      if (from === 'amount') {
        focusNextEmptyField('amount')
        return true
      }
      return true
    }
    if (from === 'amount') {
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return false
      }
      focusNextEmptyField('amount')
      return true
    }

    if (type === 'transfer') {
      if (from === 'circle') {
        if (!isAmountFilled()) {
          focusAmountField('Enter the amount first')
          return false
        }
        if (!circle) {
          focusCircleField('Pick a circle first')
          return false
        }
        focusNextEmptyField('circle')
        return true
      }
      if (from === 'from') {
        if (!isAmountFilled()) {
          focusAmountField('Enter the amount first')
          return false
        }
        if (!circle) {
          focusCircleField('Pick a circle first')
          return false
        }
        if (fromBucket === undefined) {
          focusFromField('Pick a source first')
          return false
        }
        focusNextEmptyField('from')
        return true
      }
      if (from === 'to') {
        if (!isAmountFilled()) {
          focusAmountField('Enter the amount first')
          return false
        }
        if (!circle) {
          focusCircleField('Pick a circle first')
          return false
        }
        if (fromBucket === undefined) {
          focusFromField('Pick a source first')
          return false
        }
        if (toBucket === undefined) {
          focusToField('Pick a destination first')
          return false
        }
        return true
      }
      const incomplete = findIncompleteAbove(
        from === 'description' ? 'description' : 'save',
      )
      if (incomplete) {
        focusIncompleteField(incomplete)
        return false
      }
      return true
    }

    if (from === 'circle') {
      if (type === 'income') return true
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return false
      }
      if (!circle) {
        focusCircleField('Pick a circle first')
        return false
      }
      focusNextEmptyField('circle')
      return true
    }

    const incomplete = findIncompleteAbove(
      from === 'category'
        ? 'category'
        : from === 'description'
          ? 'description'
          : 'save',
    )
    if (incomplete) {
      focusIncompleteField(incomplete)
      return false
    }
    return true
  }

  function handleCircleOpenChange(open: boolean) {
    if (type === 'income') return
    if (open) {
      if (!completeLater && !isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      if (type === 'transfer') {
        setFromOpen(false)
        setToOpen(false)
      } else {
        setCategoryOpen(false)
      }
    }
    setCircleOpen(open)
  }

  function handleCategoryOpenChange(open: boolean) {
    if (open) {
      if (!completeLater && !isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      if (!completeLater && type !== 'income' && !circle) {
        focusCircleField('Pick a circle first')
        return
      }
      setCircleOpen(false)
    }
    setCategoryOpen(open)
  }

  function handleFromOpenChange(open: boolean) {
    if (open) {
      if (!completeLater && !isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      if (!completeLater && !circle) {
        focusCircleField('Pick a circle first')
        return
      }
      setCircleOpen(false)
      setToOpen(false)
    }
    setFromOpen(open)
  }

  function handleToOpenChange(open: boolean) {
    if (open) {
      if (!completeLater && !isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      if (!completeLater && !circle) {
        focusCircleField('Pick a circle first')
        return
      }
      if (!completeLater && fromBucket === undefined) {
        focusFromField('Pick a source first')
        return
      }
      setCircleOpen(false)
      setFromOpen(false)
    }
    setToOpen(open)
  }

  function handleCircleSelect(next: Circle) {
    setCircle(next)
    setCircleOpen(false)
    if (!completeLater && !isAmountFilled()) {
      focusAmountField('Enter the amount first')
      return
    }
    if (type === 'transfer') {
      if (fromBucket === undefined) {
        focusFromField()
      } else if (toBucket === undefined) {
        focusToField()
      }
      return
    }
    if (!categoryId) {
      focusCategoryField()
    }
  }

  function handleFromSelect(next: BucketSelection) {
    setFromBucket(next)
    setFromOpen(false)
    if (toBucket !== undefined && toBucket === next) {
      setToBucket(undefined)
    }
    if (!completeLater && !isAmountFilled()) {
      focusAmountField('Enter the amount first')
      return
    }
    if (!completeLater && !circle) {
      focusCircleField('Pick a circle first')
      return
    }
    if (toBucket === undefined || toBucket === next) {
      focusToField()
    }
  }

  function handleToSelect(next: BucketSelection) {
    setToBucket(next)
    setToOpen(false)
    if (!completeLater && !isAmountFilled()) {
      focusAmountField('Enter the amount first')
      return
    }
    if (!completeLater && !circle) {
      focusCircleField('Pick a circle first')
      return
    }
    if (fromBucket === undefined) {
      focusFromField('Pick a source first')
    }
  }

  function handleAmountKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      amountRef.current?.blur()
      advanceOrFixAbove('amount')
    }
  }

  function handleCategorySelect(id: string) {
    setCategoryId(id)
    setCategoryOpen(false)
    if (!completeLater && !isAmountFilled()) {
      focusAmountField('Enter the amount first')
      return
    }
    if (!completeLater && type !== 'income' && !circle) {
      focusCircleField('Pick a circle first')
    }
  }

  function handleDescriptionFocus() {
    if (completeLater) return
    const incomplete = findIncompleteAbove('description')
    if (incomplete) {
      descriptionRef.current?.blur()
      focusIncompleteField(incomplete)
    }
  }

  function handleCompleteLaterChange(checked: boolean) {
    setCompleteLater(checked)
    setCircleOpen(false)
    setCategoryOpen(false)
    setFromOpen(false)
    setToOpen(false)
    if (checked) {
      // Default PIC to the other profile (partner being helped).
      if (!isEditing) {
        setOwner(profileOwner === 'suami' ? 'istri' : 'suami')
      }
      // Open Profile picker so PIC is obvious — don't jump focus to Note.
      setOwnerOpen(true)
    } else {
      setOwnerOpen(false)
      if (!isEditing) setOwner(profileOwner)
    }
  }

  function handleDescriptionKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSave()
    }
  }

  function handleTypeChange(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    setCircleOpen(false)
    setCategoryOpen(false)
    setFromOpen(false)
    setToOpen(false)
    if (next === 'transfer') {
      setFromBucket(null)
      setToBucket(undefined)
      setCircle(getStoredCircle())
    } else if (next === 'income') {
      setFromBucket(undefined)
      setToBucket(undefined)
      setCircle('hd_family')
    } else {
      setFromBucket(undefined)
      setToBucket(undefined)
      setCircle(getStoredCircle())
    }
  }

  async function handleSave() {
    if (completeLater) {
      if (!description.trim()) {
        showAppToast('Enter a note first')
        descriptionRef.current?.focus()
        return
      }
      if (
        type === 'transfer' &&
        fromBucket !== undefined &&
        toBucket !== undefined &&
        fromBucket === toBucket
      ) {
        showAppToast('Pick different from and to')
        return
      }
    } else {
      if (!advanceOrFixAbove('save')) return

      if (type === 'transfer') {
        if (!isTransferReady()) return
        if (fromBucket === toBucket) {
          showAppToast('Pick different from and to')
          return
        }
        if (fromBucket == null && toBucket == null) {
          showAppToast('Transfer needs at least one bucket')
          return
        }
        if (!circle) return
      } else if (type === 'income') {
        if (!categoryId) return
      } else if (!circle || !categoryId) {
        return
      }
    }

    const numericAmount = Number(amountDigits) || 0
    const resolvedCircle: Circle =
      type === 'income'
        ? 'hd_family'
        : (circle ?? getStoredCircle() ?? 'hd_family')

    const resolvedOwner: Owner =
      isEditing || completeLater ? owner : profileOwner

    const draft: NewTransactionInput =
      type === 'transfer'
        ? {
            type: 'transfer',
            category_id: null,
            from_bucket_id: fromBucket ?? null,
            to_bucket_id: toBucket ?? null,
            amount: numericAmount,
            description,
            owner: resolvedOwner,
            circle: resolvedCircle,
            occurred_on: occurredOn,
            is_recurring: false,
            complete_later: completeLater,
          }
        : {
            type,
            category_id: categoryId,
            from_bucket_id: null,
            to_bucket_id: null,
            amount: numericAmount,
            description,
            owner: resolvedOwner,
            circle: resolvedCircle,
            occurred_on: occurredOn,
            is_recurring: false,
            complete_later: completeLater,
          }

    // Only auto-clear when finishing an existing placeholder — not when the
    // user newly flags a completed transaction as Complete Later.
    let autoCompleted = false
    if (
      isEditing &&
      loadedAsCompleteLaterRef.current &&
      draft.complete_later &&
      isTransactionFullySpecified(draft)
    ) {
      draft.complete_later = false
      autoCompleted = true
    }

    setSaving(true)
    try {
      if (isEditing && id) {
        await updateTransaction(id, draft)
        if (draft.type !== 'income') setStoredCircle(draft.circle)
        if (autoCompleted) {
          showAppToast(`Completed ${ActionEmoji.save}`)
          setCompleteLater(false)
        }
        dismissNumericKeyboard()
        navigate('/riwayat', {
          replace: true,
          state: { highlightTxId: id },
        })
      } else {
        const newId = await createTransaction(draft)
        if (draft.category_id) bumpCategoryUsage(draft.category_id)
        if (draft.type !== 'income') setStoredCircle(draft.circle)
        void reloadBuckets()
        resetForm()
        showAppToast(`Saved ${ActionEmoji.save}`)
        dismissNumericKeyboard()
        navigate('/riwayat', {
          replace: true,
          state: { highlightTxId: newId },
        })
      }
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!id) return
    setSaving(true)
    try {
      await deleteTransaction(id)
      setConfirmDeleteOpen(false)
      dismissNumericKeyboard()
      navigate('/riwayat', { replace: true })
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
      setSaving(false)
    }
  }

  if (loadingExisting) {
    return <div className="p-6 text-center text-neutral-400">Loading…</div>
  }

  const displayAmount = amountDigits ? formatNumber(Number(amountDigits)) : ''
  const isTransfer = type === 'transfer'
  const isIncome = type === 'income'

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onPointerDown={() => dismissNumericKeyboard()}
            onClick={goBackToHistory}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-neutral-600 active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-neutral-800"
            aria-label="Back to Transactions"
          >
            ←
          </button>
          <PageTitle icon={isEditing ? ActionEmoji.edit : ActionEmoji.add}>
            {isEditing ? 'Edit Transaction' : 'Add Transaction'}
          </PageTitle>
        </div>
        <OwnerBadge
          owner={isEditing || completeLater ? owner : profileOwner}
          size="md"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
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
            {t === 'expense'
              ? 'Expense'
              : t === 'income'
                ? 'Income'
                : 'Transfer'}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs text-neutral-400">
          Date
        </span>
        <DatePickerField
          value={occurredOn}
          onChange={setOccurredOn}
          onFinished={focusNextAfterDate}
        />
      </label>

      <label className="mt-5 flex cursor-pointer items-center gap-2.5 select-none">
        <input
          type="checkbox"
          checked={completeLater}
          onChange={(e) => handleCompleteLaterChange(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-amber-500 accent-amber-500"
        />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Complete Later
        </span>
      </label>

      {completeLater ? (
        <div className="mt-3">
          <OwnerPicker
            label="Profile"
            value={owner}
            onChange={(next) => {
              setOwner(next)
              setOwnerOpen(false)
              window.setTimeout(() => descriptionRef.current?.focus(), 0)
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
        </div>
      ) : null}

      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Amount{completeLater ? ' (optional)' : ''}
        </span>
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-800">
          <span className="text-sm font-medium text-neutral-400">Rp</span>
          <input
            ref={amountCallbackRef}
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

      <div className="mt-4 space-y-3">
        {isTransfer ? (
          loadingBuckets && buckets.length === 0 ? (
            <p className="text-sm text-neutral-400">Loading buckets…</p>
          ) : (
            <>
              <CirclePicker
                value={circle}
                onChange={handleCircleSelect}
                open={circleOpen}
                onOpenChange={handleCircleOpenChange}
                highlighted={circleOpen}
              />
              <BucketPicker
                label="From"
                value={fromBucket}
                buckets={buckets}
                excludeId={toBucket ?? undefined}
                open={fromOpen}
                onOpenChange={handleFromOpenChange}
                onChange={handleFromSelect}
                highlighted={fromOpen}
              />
              <BucketPicker
                label="To"
                value={toBucket}
                buckets={buckets}
                excludeId={fromBucket ?? undefined}
                open={toOpen}
                onOpenChange={handleToOpenChange}
                onChange={handleToSelect}
                highlighted={toOpen}
              />
            </>
          )
        ) : (
          <>
            <CirclePicker
              value={isIncome ? 'hd_family' : circle}
              onChange={handleCircleSelect}
              open={circleOpen}
              onOpenChange={handleCircleOpenChange}
              highlighted={circleOpen}
              locked={isIncome}
            />
            {loadingCategories && treeByUsage.length === 0 ? (
              <p className="text-sm text-neutral-400">Loading categories…</p>
            ) : (
              <CategoryPicker
                tree={treeByUsage}
                selectedId={categoryId}
                byId={byId}
                open={categoryOpen}
                onOpenChange={handleCategoryOpenChange}
                onSelect={handleCategorySelect}
                transactionType={type}
                onCategoriesChanged={reload}
                highlighted={categoryOpen}
              />
            )}
          </>
        )}
      </div>

      <div className="mt-5">
        <NotesInput
          inputRef={descriptionRef}
          value={description}
          onChange={setDescription}
          categoryId={isTransfer ? null : categoryId}
          owner={isEditing || completeLater ? owner : profileOwner}
          onFocus={handleDescriptionFocus}
          onKeyDown={handleDescriptionKeyDown}
          placeholder={
            completeLater ? 'Note (required)' : 'Note (optional)'
          }
        />
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-md active:bg-emerald-600 disabled:opacity-60"
      >
        {saving ? 'Saving…' : isEditing ? 'Update' : 'Save'}
      </button>

      {isEditing && (
        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={saving}
          className="mt-3 w-full rounded-xl bg-red-50 py-3 text-sm font-medium text-red-600 disabled:opacity-60 dark:bg-red-950 dark:text-red-400"
        >
          Delete
        </button>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete transaction?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={saving}
        onCancel={() => {
          if (saving) return
          setConfirmDeleteOpen(false)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
