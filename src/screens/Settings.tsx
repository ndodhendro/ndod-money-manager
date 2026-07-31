import { useState } from 'react'
import { useCategories } from '../hooks/useCategories'
import { clearStoredProfile, getStoredProfile } from '../lib/profile'
import { supabase } from '../lib/supabase'
import type { BudgetGroup, TransactionType } from '../lib/types'

interface SettingsProps {
  onProfileReset: () => void
}

export function Settings({ onProfileReset }: SettingsProps) {
  const profile = getStoredProfile()
  const { categories, reload } = useCategories()

  const [name, setName] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [budgetGroup, setBudgetGroup] = useState<BudgetGroup>('needs')
  const [icon, setIcon] = useState('🏷️')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleAddCategory() {
    if (!name.trim()) {
      setMessage('Nama kategori wajib diisi')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('categories').insert({
      name: name.trim(),
      type,
      budget_group: type === 'expense' ? budgetGroup : null,
      icon: icon || '🏷️',
      sort_order: 99,
    })
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setName('')
    setIcon('🏷️')
    setMessage('Kategori ditambahkan')
    reload()
  }

  async function handleArchive(id: string) {
    if (!confirm('Arsipkan kategori ini? Kategori tidak akan muncul lagi saat input baru.')) {
      return
    }
    const { error } = await supabase
      .from('categories')
      .update({ is_active: false })
      .eq('id', id)
    if (error) {
      setMessage(error.message)
      return
    }
    reload()
  }

  function handleChangeProfile() {
    if (!confirm('Ganti profil HP ini?')) return
    clearStoredProfile()
    onProfileReset()
  }

  const income = categories.filter((c) => c.type === 'income')
  const expense = categories.filter((c) => c.type === 'expense')

  return (
    <div className="mx-auto max-w-md px-4 pt-5 pb-24">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Pengaturan
      </h1>

      <div className="mt-5 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Profil HP ini
        </p>
        <p className="mt-1 text-sm text-neutral-500 capitalize">
          {profile ?? 'Belum dipilih'}
        </p>
        <button
          type="button"
          onClick={handleChangeProfile}
          className="mt-3 w-full rounded-lg bg-neutral-100 py-2 text-sm font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100"
        >
          Ganti Profil
        </button>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
          Tambah Kategori
        </p>
        <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
          <div className="flex gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-lg dark:bg-neutral-700"
              maxLength={2}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama kategori"
              className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
              className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
            >
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </select>
            {type === 'expense' && (
              <select
                value={budgetGroup}
                onChange={(e) => setBudgetGroup(e.target.value as BudgetGroup)}
                className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
              >
                <option value="needs">Needs</option>
                <option value="wants">Wants</option>
              </select>
            )}
          </div>
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={saving}
            className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Menyimpan…' : 'Tambah'}
          </button>
          {message && (
            <p className="text-xs text-neutral-500">{message}</p>
          )}
        </div>
      </div>

      <CategoryList title="Kategori Pemasukan" items={income} onArchive={handleArchive} />
      <CategoryList title="Kategori Pengeluaran" items={expense} onArchive={handleArchive} />
    </div>
  )
}

function CategoryList({
  title,
  items,
  onArchive,
}: {
  title: string
  items: { id: string; name: string; icon: string; budget_group: BudgetGroup | null }[]
  onArchive: (id: string) => void
}) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800"
          >
            <span className="text-xl">{cat.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {cat.name}
              </p>
              {cat.budget_group && (
                <p className="text-[11px] text-neutral-400 uppercase">
                  {cat.budget_group}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onArchive(cat.id)}
              className="text-xs font-medium text-red-500"
            >
              Arsipkan
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
