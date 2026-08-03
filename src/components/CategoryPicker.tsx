import { useEffect, useState } from 'react'
import { useOverlayBack } from '../hooks/useBackButton'
import type { CategoryTreeNode } from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import type { Category, CategoryType } from '../lib/types'
import { CategoryManagePanel } from './CategoryManagePanel'

interface CategoryPickerProps {
  tree: CategoryTreeNode[]
  selectedId: string | null
  byId: Map<string, Category>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (categoryId: string) => void
  transactionType: CategoryType
  onCategoriesChanged: () => void
  highlighted?: boolean
}

export function CategoryPicker({
  tree,
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
  const isChild = Boolean(selected?.parent_id)
  const parentCategory = selected
    ? isChild
      ? (selected.parent_id ? byId.get(selected.parent_id) : null)
      : selected
    : null
  const childCategory = isChild ? selected : null

  const [activeParentId, setActiveParentId] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)

  useEffect(() => {
    if (!open) {
      setManaging(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || managing) return
    if (selected?.parent_id) {
      setActiveParentId(selected.parent_id)
    } else if (selected && !selected.parent_id) {
      setActiveParentId(selected.id)
    } else if (tree[0]) {
      setActiveParentId(tree[0].id)
    }
  }, [open, managing, selected, tree])

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

  useOverlayBack(open, () => {
    if (managing) {
      setManaging(false)
      return true
    }
    onOpenChange(false)
    return true
  })

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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-xl" aria-hidden>
            {parentCategory?.icon ?? '📂'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-neutral-400">
              Category
            </p>
            <p
              className={`truncate text-sm font-medium ${
                parentCategory
                  ? 'text-neutral-900 dark:text-white'
                  : 'text-neutral-400'
              }`}
            >
              {parentCategory?.name ?? 'Select category'}
            </p>
            {childCategory && (
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-neutral-400">
                <span aria-hidden>{childCategory.icon}</span>
                <span className="truncate">{childCategory.name}</span>
              </p>
            )}
          </div>
        </div>
        <span className="shrink-0 text-neutral-300">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {!managing && (
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/40"
              onClick={() => onOpenChange(false)}
            />
          )}
          <div
            className={`relative flex flex-col bg-neutral-100 shadow-2xl dark:bg-neutral-900 ${
              managing
                ? 'h-full rounded-none'
                : 'h-[70vh] max-h-[640px] rounded-t-2xl'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {managing ? 'Manage categories' : 'Category'}
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                {managing ? (
                  <button
                    type="button"
                    onClick={() => setManaging(false)}
                    className="rounded-lg px-2 py-1 text-base leading-none"
                    aria-label="Back to category picker"
                    title="Back"
                  >
                    {ActionEmoji.back}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setManaging(true)}
                      className="rounded-lg px-2 py-1 text-base leading-none"
                      aria-label="Manage categories"
                      title="Manage categories"
                    >
                      {ActionEmoji.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="rounded-lg px-2 py-1 text-base leading-none"
                      aria-label="Close"
                      title="Close"
                    >
                      {ActionEmoji.close}
                    </button>
                  </>
                )}
              </div>
            </div>

            {managing ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <CategoryManagePanel
                  type={transactionType}
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
                    <p className="p-4 text-xs text-neutral-400" />
                  ) : (
                    <div className="grid grid-cols-1">
                      {children.map((child) => {
                        const picked = child.id === selectedId
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => handlePickLeaf(child)}
                            className={`flex w-full items-center gap-2.5 border-b border-neutral-100 px-4 py-3.5 text-left text-sm dark:border-neutral-900 ${
                              picked
                                ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'text-neutral-700 dark:text-neutral-200'
                            }`}
                          >
                            <span className="text-base" aria-hidden>
                              {child.icon}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {child.name}
                            </span>
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
