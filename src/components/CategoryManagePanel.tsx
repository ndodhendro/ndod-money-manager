import { useMemo, useState } from 'react'
import type { CategoryTreeNode } from '../hooks/useCategories'
import {
  addCategory,
  archiveCategory,
  renameCategory,
} from '../lib/categoriesApi'
import type { BudgetGroup, Category, TransactionType } from '../lib/types'

interface CategoryManagePanelProps {
  /** Tipe transaksi yang sedang dikelola. */
  type: TransactionType
  /** Izinkan ganti tipe (Pengaturan). Di Quick Add dikunci. */
  allowTypeChange?: boolean
  parents: Category[]
  tree: CategoryTreeNode[]
  onChanged: () => void
  /** Compact mode untuk sheet di Quick Add. */
  compact?: boolean
  onTypeChange?: (type: TransactionType) => void
}

export function CategoryManagePanel({
  type,
  allowTypeChange = false,
  parents,
  tree,
  onChanged,
  compact = false,
  onTypeChange,
}: CategoryManagePanelProps) {
  const [name, setName] = useState('')
  const [budgetGroup, setBudgetGroup] = useState<BudgetGroup>('needs')
  const [icon, setIcon] = useState('🏷️')
  const [parentId, setParentId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')

  const parentOptions = useMemo(
    () => parents.filter((p) => p.type === type),
    [parents, type],
  )

  const scopedTree = useMemo(
    () => tree.filter((c) => c.type === type),
    [tree, type],
  )

  async function handleAdd() {
    if (!name.trim()) {
      setMessage('Nama kategori wajib diisi')
      return
    }
    setSaving(true)
    try {
      const parent = parentId
        ? parents.find((p) => p.id === parentId)
        : null
      await addCategory({
        name: name.trim(),
        type,
        icon,
        budget_group:
          type === 'expense' ? (parent?.budget_group ?? budgetGroup) : null,
        parent_id: parentId || null,
      })
      setName('')
      setIcon('🏷️')
      setParentId('')
      setMessage('Kategori ditambahkan')
      onChanged()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal menambah')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(id: string) {
    if (
      !confirm(
        'Arsipkan kategori ini? Sub-kategori di bawahnya juga tidak akan muncul saat input baru.',
      )
    ) {
      return
    }
    try {
      await archiveCategory(id)
      onChanged()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal mengarsipkan')
    }
  }

  function startEdit(cat: { id: string; name: string; icon: string }) {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditIcon(cat.icon)
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    try {
      await renameCategory(editingId, {
        name: editName.trim(),
        icon: editIcon || '🏷️',
      })
      setEditingId(null)
      setMessage('Kategori diperbarui')
      onChanged()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal mengubah')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={compact ? 'space-y-3 p-3' : 'space-y-4'}>
      <div
        className={`space-y-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800 ${
          compact ? '' : 'p-4'
        }`}
      >
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Tambah Kategori / Sub-kategori
        </p>
        <div className="flex gap-2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-lg dark:bg-neutral-700"
            maxLength={4}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama"
            className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
          />
        </div>
        <div className="flex gap-2">
          {allowTypeChange ? (
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value as TransactionType
                onTypeChange?.(next)
                setParentId('')
              }}
              className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
            >
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </select>
          ) : (
            <div className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-700">
              {type === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
            </div>
          )}
          {type === 'expense' && !parentId && (
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
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
        >
          <option value="">— Parent baru (kategori utama) —</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              Sub dari: {p.icon} {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Menyimpan…' : 'Tambah'}
        </button>
        {message && <p className="text-xs text-neutral-500">{message}</p>}
      </div>

      <div className="space-y-2">
        {scopedTree.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800"
          >
            {editingId === cat.id ? (
              <EditRow
                icon={editIcon}
                name={editName}
                saving={saving}
                onIconChange={setEditIcon}
                onNameChange={setEditName}
                onSave={saveEdit}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xl">{cat.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
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
                  onClick={() => startEdit(cat)}
                  className="text-xs font-medium text-emerald-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(cat.id)}
                  className="text-xs font-medium text-red-500"
                >
                  Arsipkan
                </button>
              </div>
            )}

            {cat.children.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2 dark:border-neutral-700">
                {cat.children.map((child) =>
                  editingId === child.id ? (
                    <li key={child.id} className="pl-4">
                      <EditRow
                        icon={editIcon}
                        name={editName}
                        saving={saving}
                        onIconChange={setEditIcon}
                        onNameChange={setEditName}
                        onSave={saveEdit}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <li
                      key={child.id}
                      className="flex items-center justify-between gap-2 pl-8 text-sm text-neutral-600 dark:text-neutral-300"
                    >
                      <span className="min-w-0 truncate">
                        {child.icon} {child.name}
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(child)}
                          className="text-xs font-medium text-emerald-600"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(child.id)}
                          className="text-xs font-medium text-red-400"
                        >
                          Arsipkan
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function EditRow({
  icon,
  name,
  saving,
  onIconChange,
  onNameChange,
  onSave,
  onCancel,
}: {
  icon: string
  name: string
  saving: boolean
  onIconChange: (v: string) => void
  onNameChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={icon}
        onChange={(e) => onIconChange(e.target.value)}
        className="w-12 rounded-lg bg-neutral-100 px-1 py-1.5 text-center text-base dark:bg-neutral-700"
        maxLength={4}
      />
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-2 py-1.5 text-sm dark:bg-neutral-700 dark:text-neutral-100"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="text-xs font-semibold text-emerald-600 disabled:opacity-60"
      >
        Simpan
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs font-medium text-neutral-400"
      >
        Batal
      </button>
    </div>
  )
}
