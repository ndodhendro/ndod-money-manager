import { useEffect, useState } from 'react'
import type { CategoryTreeNode } from '../hooks/useCategories'
import type { Category, TransactionType } from '../lib/types'
import { formatCategoryLabel } from '../lib/types'
import { CategoryManagePanel } from './CategoryManagePanel'

interface CategoryPickerProps {
  tree: CategoryTreeNode[]
  parents: Category[]
  selectedId: string | null
  byId: Map<string, Category>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (categoryId: string) => void
  /** Dipakai untuk kelola kategori runtime (sama seperti Pengaturan). */
  transactionType: TransactionType
  onCategoriesChanged: () => void
  highlighted?: boolean
}

export function CategoryPicker({
  tree,
  parents,
  selectedId,
  byId,
  open,
  onOpenChange,
  onSelect,
  transactionType,
  onCategoriesChanged,
  highlighted = false,
}: CategoryPickerProps) {
  const selected = selectedId ? byId.get(selectedId) : null
  const selectedParent = selected?.parent_id
    ? byId.get(selected.parent_id)
    : selected && !selected.parent_id
      ? selected
      : null

  const [activeParentId, setActiveParentId] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)

  useEffect(() => {
    if (!open) {
      setManaging(false)
      return
    }
    if (selected?.parent_id) {
      setActiveParentId(selected.parent_id)
    } else if (selected && !selected.parent_id) {
      setActiveParentId(selected.id)
    } else if (tree[0]) {
      setActiveParentId(tree[0].id)
    }
  }, [open, selected, tree])

  const activeParent = tree.find((p) => p.id === activeParentId) ?? null
  const children = activeParent?.children ?? []

  function handlePickLeaf(category: Category) {
    onSelect(category.id)
    onOpenChange(false)
  }

  function handlePickParent(parent: CategoryTreeNode) {
    setActiveParentId(parent.id)
    if (parent.children.length === 0) {
      onSelect(parent.id)
      onOpenChange(false)
    }
  }

  const label = selected
    ? formatCategoryLabel(
        selected.parent_id
          ? { ...selected, parent: selectedParent ?? null }
          : selected,
      )
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={`flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left shadow-sm dark:bg-neutral-800 ${
          highlighted
            ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-neutral-950'
            : ''
        }`}
      >
        <span className="text-xl">
          {selected ? (selectedParent?.icon ?? selected.icon) : '📂'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-400">Kategori</p>
          <p
            className={`truncate text-sm font-medium ${
              label
                ? 'text-neutral-900 dark:text-neutral-50'
                : 'text-neutral-400'
            }`}
          >
            {label ?? 'Pilih kategori'}
          </p>
        </div>
        <span className="text-neutral-300">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 bg-black/40"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative flex h-[70vh] max-h-[640px] flex-col rounded-t-2xl bg-neutral-100 shadow-2xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {managing ? 'Kelola Kategori' : 'Kategori'}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setManaging((v) => !v)}
                  className="rounded-lg px-2.5 py-1 text-sm font-medium text-emerald-600"
                  aria-label={managing ? 'Selesai kelola' : 'Edit kategori'}
                >
                  {managing ? 'Selesai' : '✏️'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full px-2 py-1 text-lg leading-none text-neutral-400"
                >
                  ×
                </button>
              </div>
            </div>

            {managing ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <CategoryManagePanel
                  type={transactionType}
                  parents={parents}
                  tree={tree}
                  onChanged={onCategoriesChanged}
                  compact
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1">
                <div className="w-[42%] overflow-y-auto border-r border-neutral-200 dark:border-neutral-800">
                  {tree.map((parent) => {
                    const active = parent.id === activeParentId
                    return (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => handlePickParent(parent)}
                        className={`flex w-full items-center gap-2 px-3 py-3 text-left text-sm ${
                          active
                            ? 'bg-emerald-600 text-white'
                            : 'text-neutral-700 dark:text-neutral-200'
                        }`}
                      >
                        <span className="text-base">{parent.icon}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {parent.name}
                        </span>
                        {parent.children.length > 0 && (
                          <span
                            className={
                              active ? 'text-white/70' : 'text-neutral-300'
                            }
                          >
                            ›
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="flex-1 overflow-y-auto bg-white dark:bg-neutral-950">
                  {children.length === 0 ? (
                    <p className="p-4 text-xs text-neutral-400">
                      Tidak ada sub-kategori. Ketuk parent untuk memilih
                      langsung, atau ✏️ untuk menambah.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1">
                      {children.map((child) => {
                        const picked = child.id === selectedId
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => handlePickLeaf(child)}
                            className={`border-b border-neutral-100 px-4 py-3.5 text-left text-sm dark:border-neutral-900 ${
                              picked
                                ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'text-neutral-700 dark:text-neutral-200'
                            }`}
                          >
                            {child.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
