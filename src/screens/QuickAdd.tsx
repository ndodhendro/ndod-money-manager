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
import { PageTitle } from '../components/PageTitle'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import { bumpCategoryUsage, getStoredProfile, setStoredCircle } from '../lib/profile'
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
  type CategoryType,
  type Circle,
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
        setAmountDigits(String(Math.round(Number(data.amount))))
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
        if (isCircle(data.circle)) setCircle(data.circle)
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
    setType(
      param === 'income'
        ? 'income'
        : param === 'transfer'
          ? 'transfer'
          : 'expense',
    )
    setAmountDigits('')
    setCategoryId(null)
    setFromBucket(param === 'transfer' ? null : undefined)
    setToBucket(undefined)
    setDescription('')
    setOccurredOn(todayIso())
    setOwner(getStoredProfile() ?? 'suami')
    setCircle(null)
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
    // Default: from Cashflow → pick destination bucket (common funding path).
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
    if (!isAmountFilled()) return 'amount'
    if (type === 'transfer') {
      if (from !== 'from' && fromBucket === undefined) return 'from'
      if (from !== 'to' && from !== 'from' && toBucket === undefined) return 'to'
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
    if (from === 'amount') {
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return false
      }
      focusNextEmptyField('amount')
      return true
    }

    if (type === 'transfer') {
      if (from === 'from') {
        if (!isAmountFilled()) {
          focusAmountField('Enter the amount first')
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
    if (open) {
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      setCategoryOpen(false)
    }
    setCircleOpen(open)
  }

  function handleCategoryOpenChange(open: boolean) {
    if (open) {
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      if (!circle) {
        focusCircleField('Pick a circle first')
        return
      }
      setCircleOpen(false)
    }
    setCategoryOpen(open)
  }

  function handleFromOpenChange(open: boolean) {
    if (open) {
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      setToOpen(false)
    }
    setFromOpen(open)
  }

  function handleToOpenChange(open: boolean) {
    if (open) {
      if (!isAmountFilled()) {
        focusAmountField('Enter the amount first')
        return
      }
      if (fromBucket === undefined) {
        focusFromField('Pick a source first')
        return
      }
      setFromOpen(false)
    }
    setToOpen(open)
  }

  function handleCircleSelect(next: Circle) {
    setCircle(next)
    setCircleOpen(false)
    if (!isAmountFilled()) {
      focusAmountField('Enter the amount first')
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
    if (!isAmountFilled()) {
      focusAmountField('Enter the amount first')
      return
    }
    if (toBucket === undefined || toBucket === next) {
      focusToField()
    }
  }

  function handleToSelect(next: BucketSelection) {
    setToBucket(next)
    setToOpen(false)
    if (!isAmountFilled()) {
      focusAmountField('Enter the amount first')
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
    if (!isAmountFilled()) {
      focusAmountField('Enter the amount first')
      return
    }
    if (!circle) {
      focusCircleField('Pick a circle first')
    }
  }

  function handleDescriptionFocus() {
    const incomplete = findIncompleteAbove('description')
    if (incomplete) {
      descriptionRef.current?.blur()
      focusIncompleteField(incomplete)
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
      setCircle(null)
    } else {
      setFromBucket(undefined)
      setToBucket(undefined)
    }
  }

  async function handleSave() {
    if (!advanceOrFixAbove('save')) return

    const numericAmount = Number(amountDigits)

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
    } else if (!circle || !categoryId) {
      return
    }

    setSaving(true)
    try {
      const input =
        type === 'transfer'
          ? {
              type: 'transfer' as const,
              category_id: null,
              from_bucket_id: fromBucket ?? null,
              to_bucket_id: toBucket ?? null,
              amount: numericAmount,
              description,
              owner: isEditing ? owner : profileOwner,
              circle: 'hd_family' as Circle,
              occurred_on: occurredOn,
              is_recurring: false,
            }
          : {
              type,
              category_id: categoryId!,
              from_bucket_id: null,
              to_bucket_id: null,
              amount: numericAmount,
              description,
              owner: isEditing ? owner : profileOwner,
              circle: circle!,
              occurred_on: occurredOn,
              is_recurring: false,
            }

      if (isEditing && id) {
        await updateTransaction(id, input)
        if (input.circle) setStoredCircle(input.circle)
        dismissNumericKeyboard()
        navigate('/riwayat', {
          replace: true,
          state: { highlightTxId: id },
        })
      } else {
        const newId = await createTransaction(input)
        if (input.category_id) bumpCategoryUsage(input.category_id)
        if (input.type !== 'transfer') setStoredCircle(input.circle)
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

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onPointerDown={() => dismissNumericKeyboard()}
            onClick={goBackToHistory}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl text-neutral-600 active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-neutral-800"
            aria-label="Back to History"
          >
            ←
          </button>
          <PageTitle>
            {isEditing ? 'Edit Transaction' : 'Add Transaction'}
          </PageTitle>
        </div>
        <OwnerBadge
          owner={isEditing ? owner : profileOwner}
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

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Amount
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
              value={circle}
              onChange={handleCircleSelect}
              open={circleOpen}
              onOpenChange={handleCircleOpenChange}
              highlighted={circleOpen}
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
          owner={isEditing ? owner : profileOwner}
          onFocus={handleDescriptionFocus}
          onKeyDown={handleDescriptionKeyDown}
          placeholder="Note (optional)"
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
