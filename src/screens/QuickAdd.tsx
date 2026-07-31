import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CategoryPicker } from '../components/CategoryPicker'
import { NotesInput } from '../components/NotesInput'
import { PageTitle } from '../components/PageTitle'
import { useCategories } from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import { bumpCategoryUsage, getStoredProfile } from '../lib/profile'
import { formatNumber, todayIso } from '../lib/format'
import {
  claimNumericKeyboard,
  openNumericKeyboard,
  registerAmountInput,
} from '../lib/keyboardFocus'
import { supabase } from '../lib/supabase'
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '../lib/transactionsApi'
import { OWNER_LABELS, type Owner, type TransactionType } from '../lib/types'

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

  const [type, setType] = useState<TransactionType>(
    searchParams.get('type') === 'income' ? 'income' : 'expense',
  )
  const [amountDigits, setAmountDigits] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [owner, setOwner] = useState<Owner>(profileOwner)
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(isEditing)
  const [toast, setToast] = useState<string | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)

  const amountRef = useRef<HTMLInputElement | null>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)

  const amountCallbackRef = useCallback((el: HTMLInputElement | null) => {
    amountRef.current = el
  }, [])

  // Hanya register input saat layar benar-benar terlihat.
  useEffect(() => {
    if (isEditing) return
    if (isActive) {
      registerAmountInput(amountRef.current)
    } else {
      registerAmountInput(null)
    }
    return () => {
      if (!isEditing) registerAmountInput(null)
    }
  }, [isActive, isEditing])

  const { treeByUsage, byId, loading: loadingCategories, reload } =
    useCategories(type)

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
        setType(data.type)
        setAmountDigits(String(Math.round(Number(data.amount))))
        setCategoryId(data.category_id)
        setDescription(data.description ?? '')
        setOccurredOn(data.occurred_on)
        setOwner(data.owner)
      }
      setLoadingExisting(false)
    }
    loadExisting()
    return () => {
      cancelled = true
    }
  }, [id, isEditing])

  // Claim ghost → nominal HANYA setelah layar Tambah aktif & terlihat.
  useLayoutEffect(() => {
    if (isEditing || !isActive || loadingExisting) return
    claimNumericKeyboard(amountRef.current)
  }, [isEditing, isActive, loadingExisting])

  // Reset kategori kalau ganti income/expense dan pilihan lama tidak valid.
  useEffect(() => {
    if (loadingCategories || !categoryId) return
    if (!byId.has(categoryId)) setCategoryId(null)
  }, [type, loadingCategories, byId, categoryId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1600)
    return () => clearTimeout(t)
  }, [toast])

  function resetForm() {
    setAmountDigits('')
    setCategoryId(null)
    setDescription('')
    setOccurredOn(todayIso())
    setOwner(profileOwner)
    setCategoryOpen(false)
  }

  function isAmountFilled() {
    return Number(amountDigits) > 0
  }

  /** Field wajib di atas posisi saat ini yang belum diisi. Nominal 0 = belum diisi. */
  function findIncompleteAbove(
    from: 'category' | 'description' | 'save',
  ): 'amount' | 'category' | null {
    if (!isAmountFilled()) return 'amount'
    if (from !== 'category' && !categoryId) return 'category'
    return null
  }

  function focusAmountField(message?: string) {
    setCategoryOpen(false)
    if (message) setToast(message)
    // Dipanggil dari tap/gesture → boleh buka numpad.
    openNumericKeyboard()
    if (!claimNumericKeyboard(amountRef.current)) {
      amountRef.current?.focus()
    }
  }

  function focusIncompleteField(
    field: 'amount' | 'category',
  ) {
    if (field === 'amount') {
      focusAmountField('Isi nominal dulu ya')
      return
    }
    setToast('Pilih kategori dulu ya')
    setCategoryOpen(true)
  }

  /** Coba maju ke langkah berikutnya; kalau ada field di atas yang kosong, fokus ke situ. */
  function advanceOrFixAbove(
    from: 'amount' | 'category' | 'description' | 'save',
  ): boolean {
    if (from === 'amount') {
      if (!isAmountFilled()) {
        focusAmountField('Isi nominal dulu ya')
        return false
      }
      // Kalau kategori sudah terisi (user isi kategori dulu), lanjut ke catatan.
      if (categoryId) {
        setTimeout(() => descriptionRef.current?.focus(), 50)
        return true
      }
      setCategoryOpen(true)
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

  function handleCategoryOpenChange(open: boolean) {
    if (open) {
      // Lompat ke kategori: cek dulu field di atas (nominal).
      if (!advanceOrFixAbove('category')) return
    }
    setCategoryOpen(open)
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
    // Setelah pilih kategori, next ke catatan — tapi kalau nominal masih 0, balik ke atas.
    if (!isAmountFilled()) {
      focusAmountField('Isi nominal dulu ya')
      return
    }
    setTimeout(() => descriptionRef.current?.focus(), 50)
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

  async function handleSave() {
    if (!advanceOrFixAbove('save')) return

    const numericAmount = Number(amountDigits)
    setSaving(true)
    try {
      const input = {
        type,
        category_id: categoryId!,
        amount: numericAmount,
        description,
        owner: isEditing ? owner : profileOwner,
        occurred_on: occurredOn,
        is_recurring: false,
      }
      if (isEditing && id) {
        await updateTransaction(id, input)
        navigate('/riwayat')
      } else {
        await createTransaction(input)
        bumpCategoryUsage(categoryId!)
        setToast(`Tersimpan ${ActionEmoji.save}`)
        resetForm()
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Hapus transaksi ini?')) return
    setSaving(true)
    try {
      await deleteTransaction(id)
      navigate('/riwayat')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Gagal menghapus')
      setSaving(false)
    }
  }

  if (loadingExisting) {
    return <div className="p-6 text-center text-neutral-400">Memuat…</div>
  }

  const displayAmount = amountDigits ? formatNumber(Number(amountDigits)) : ''

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-28">
      <div className="flex items-start justify-between gap-3">
        <PageTitle>
          {isEditing ? 'Edit Transaksi' : 'Catat Transaksi'}
        </PageTitle>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {OWNER_LABELS[isEditing ? owner : profileOwner]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
        {(['expense', 'income'] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              type === t
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50'
                : 'text-neutral-500'
            }`}
          >
            {t === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs text-neutral-400">
          Tanggal
        </span>
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          tabIndex={-1}
          className="w-full rounded-xl bg-white px-4 py-3 text-sm shadow-sm outline-none dark:bg-neutral-800 dark:text-neutral-100"
        />
      </label>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Nominal
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

      <div className="mt-4">
        {loadingCategories && treeByUsage.length === 0 ? (
          <p className="text-sm text-neutral-400">Memuat kategori…</p>
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
      </div>

      <div className="mt-5">
        <NotesInput
          inputRef={descriptionRef}
          value={description}
          onChange={setDescription}
          categoryId={categoryId}
          onFocus={handleDescriptionFocus}
          onKeyDown={handleDescriptionKeyDown}
          placeholder="Catatan (opsional)"
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-md active:bg-emerald-600 disabled:opacity-60"
      >
        {saving ? 'Menyimpan…' : 'Simpan'}
      </button>

      {isEditing && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="mt-3 w-full rounded-xl bg-red-50 py-3 text-sm font-medium text-red-600 disabled:opacity-60 dark:bg-red-950 dark:text-red-400"
        >
          Hapus Transaksi
        </button>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
          {toast}
        </div>
      )}
    </div>
  )
}
