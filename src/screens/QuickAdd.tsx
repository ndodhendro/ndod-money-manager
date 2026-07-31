import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AmountKeypad } from '../components/AmountKeypad'
import { CategoryGrid } from '../components/CategoryGrid'
import { useCategories } from '../hooks/useCategories'
import { bumpCategoryUsage, getStoredProfile } from '../lib/profile'
import { supabase } from '../lib/supabase'
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '../lib/transactionsApi'
import { todayIso } from '../lib/format'
import type { Owner, TransactionType } from '../lib/types'

export function QuickAdd() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [type, setType] = useState<TransactionType>(
    searchParams.get('type') === 'income' ? 'income' : 'expense',
  )
  const [amount, setAmount] = useState('0')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [owner, setOwner] = useState<Owner>(getStoredProfile() ?? 'suami')
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(isEditing)
  const [toast, setToast] = useState<string | null>(null)

  const { sortedByUsage, loading: loadingCategories } = useCategories(type)

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
        setAmount(String(Math.round(Number(data.amount))))
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

  // Kategori terpilih harus reset kalau ganti tab income/expense (kategori beda tipe).
  useEffect(() => {
    if (loadingCategories) return
    if (categoryId && !sortedByUsage.some((c) => c.id === categoryId)) {
      setCategoryId(null)
    }
  }, [type, loadingCategories, sortedByUsage, categoryId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1600)
    return () => clearTimeout(t)
  }, [toast])

  function resetForm() {
    setAmount('0')
    setCategoryId(null)
    setDescription('')
    setOccurredOn(todayIso())
  }

  async function handleSave() {
    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0) {
      setToast('Isi nominal dulu ya')
      return
    }
    if (!categoryId) {
      setToast('Pilih kategori dulu ya')
      return
    }

    setSaving(true)
    try {
      const input = {
        type,
        category_id: categoryId,
        amount: numericAmount,
        description,
        owner,
        occurred_on: occurredOn,
        is_recurring: false,
      }
      if (isEditing && id) {
        await updateTransaction(id, input)
        navigate('/riwayat')
      } else {
        await createTransaction(input)
        bumpCategoryUsage(categoryId)
        setToast('Tersimpan ✓')
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

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-28">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        {isEditing ? 'Edit Transaksi' : 'Catat Transaksi'}
      </h1>

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

      <div className="mt-4">
        <AmountKeypad value={amount} onChange={setAmount} />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Kategori
        </p>
        {loadingCategories ? (
          <p className="text-sm text-neutral-400">Memuat kategori…</p>
        ) : (
          <CategoryGrid
            categories={sortedByUsage}
            selectedId={categoryId}
            onSelect={setCategoryId}
          />
        )}
      </div>

      <div className="mt-5 space-y-3">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Catatan (opsional)"
          className="w-full rounded-xl bg-white px-4 py-3 text-sm shadow-sm outline-none dark:bg-neutral-800 dark:text-neutral-100"
        />

        <div className="flex gap-3">
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="flex-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm outline-none dark:bg-neutral-800 dark:text-neutral-100"
          />
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value as Owner)}
            className="flex-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm outline-none dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="suami">Ndod</option>
            <option value="istri">Devi</option>
          </select>
        </div>
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
