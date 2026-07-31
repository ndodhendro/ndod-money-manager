import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  useCategories,
  type CategoryTreeNode,
} from '../hooks/useCategories'
import { ActionEmoji } from '../lib/actionEmoji'
import {
  addCategory,
  renameCategory,
  reorderCategories,
  setCategoryVisibility,
} from '../lib/categoriesApi'
import type { BudgetGroup, Category, TransactionType } from '../lib/types'

interface CategoryManagePanelProps {
  type: TransactionType
  allowTypeChange?: boolean
  onChanged: () => void
  compact?: boolean
  onTypeChange?: (type: TransactionType) => void
}

export function CategoryManagePanel({
  type,
  allowTypeChange = false,
  onChanged,
  compact = false,
  onTypeChange,
}: CategoryManagePanelProps) {
  const { tree, parents, reload } = useCategories(type, {
    includeInactive: true,
  })

  const [orderedTree, setOrderedTree] = useState<CategoryTreeNode[]>([])
  const [name, setName] = useState('')
  const [budgetGroup, setBudgetGroup] = useState<BudgetGroup>('needs')
  const [icon, setIcon] = useState('🏷️')
  const [parentId, setParentId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setOrderedTree(tree)
  }, [tree])

  // Saat edit sub-kategori, pastikan parent-nya terbuka.
  useEffect(() => {
    if (!editingId) return
    const parent = orderedTree.find((p) =>
      p.children.some((c) => c.id === editingId),
    )
    if (parent) {
      setExpandedIds((prev) => new Set(prev).add(parent.id))
    }
  }, [editingId, orderedTree])

  const parentOptions = useMemo(
    () => parents.filter((p) => p.is_active),
    [parents],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  )

  const parentIds = useMemo(
    () => orderedTree.map((c) => c.id),
    [orderedTree],
  )

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function refresh() {
    await reload()
    onChanged()
  }

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
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal menambah')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleVisibility(
    id: string,
    currentlyActive: boolean,
    parentIdValue?: string | null,
  ) {
    try {
      await setCategoryVisibility(id, !currentlyActive, parentIdValue)
      await refresh()
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Gagal mengubah visibilitas',
      )
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
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Gagal mengubah')
    } finally {
      setSaving(false)
    }
  }

  async function handleParentDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = orderedTree.findIndex((c) => c.id === active.id)
    const newIndex = orderedTree.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const next = arrayMove(orderedTree, oldIndex, newIndex)
    setOrderedTree(next)
    try {
      await reorderCategories(next.map((c) => c.id))
      onChanged()
    } catch (err) {
      setOrderedTree(tree)
      setMessage(err instanceof Error ? err.message : 'Gagal mengubah urutan')
    }
  }

  async function handleChildDragEnd(parentIdValue: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const parent = orderedTree.find((p) => p.id === parentIdValue)
    if (!parent) return

    const oldIndex = parent.children.findIndex((c) => c.id === active.id)
    const newIndex = parent.children.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const nextChildren = arrayMove(parent.children, oldIndex, newIndex)
    setOrderedTree((prev) =>
      prev.map((p) =>
        p.id === parentIdValue ? { ...p, children: nextChildren } : p,
      ),
    )
    try {
      await reorderCategories(nextChildren.map((c) => c.id))
      onChanged()
    } catch (err) {
      setOrderedTree(tree)
      setMessage(err instanceof Error ? err.message : 'Gagal mengubah urutan')
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
        <p className="text-[11px] text-neutral-400">
          Tahan & seret {ActionEmoji.drag} untuk mengubah urutan.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleParentDragEnd}
      >
        <SortableContext items={parentIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {orderedTree.map((cat) => (
              <SortableParentRow
                key={cat.id}
                cat={cat}
                expanded={expandedIds.has(cat.id)}
                editingId={editingId}
                editIcon={editIcon}
                editName={editName}
                saving={saving}
                onToggleExpand={() => toggleExpand(cat.id)}
                onStartEdit={startEdit}
                onToggleVisibility={handleToggleVisibility}
                onEditIconChange={setEditIcon}
                onEditNameChange={setEditName}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onChildDragEnd={(event) => handleChildDragEnd(cat.id, event)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableParentRow({
  cat,
  expanded,
  editingId,
  editIcon,
  editName,
  saving,
  onToggleExpand,
  onStartEdit,
  onToggleVisibility,
  onEditIconChange,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onChildDragEnd,
}: {
  cat: CategoryTreeNode
  expanded: boolean
  editingId: string | null
  editIcon: string
  editName: string
  saving: boolean
  onToggleExpand: () => void
  onStartEdit: (cat: Category) => void
  onToggleVisibility: (
    id: string,
    currentlyActive: boolean,
    parentIdValue?: string | null,
  ) => void
  onEditIconChange: (v: string) => void
  onEditNameChange: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onChildDragEnd: (event: DragEndEvent) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id })

  const childSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  )

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 10 : undefined,
  }

  const childIds = cat.children.map((c) => c.id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl px-3 py-2.5 shadow-sm ${
        cat.is_active
          ? 'bg-white dark:bg-neutral-800'
          : 'bg-neutral-100 opacity-60 dark:bg-neutral-900'
      } ${isDragging ? 'shadow-lg ring-1 ring-emerald-300' : ''}`}
    >
      {editingId === cat.id ? (
        <EditRow
          icon={editIcon}
          name={editName}
          saving={saving}
          onIconChange={onEditIconChange}
          onNameChange={onEditNameChange}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="touch-none rounded-lg px-1 py-1 text-base leading-none text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            aria-label="Seret untuk ubah urutan"
            title="Seret"
            {...attributes}
            {...listeners}
          >
            {ActionEmoji.drag}
          </button>
          {cat.children.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <IconChevron expanded={expanded} />
            </button>
          ) : (
            <span className="w-7" />
          )}
          <button
            type="button"
            onClick={() =>
              cat.children.length > 0 ? onToggleExpand() : undefined
            }
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="text-xl">{cat.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {cat.name}
                {cat.children.length > 0 && (
                  <span className="ml-1.5 text-[11px] font-normal text-neutral-400">
                    ({cat.children.length})
                  </span>
                )}
              </p>
              {cat.budget_group && (
                <p className="text-[11px] text-neutral-400 uppercase">
                  {cat.budget_group}
                </p>
              )}
            </div>
          </button>
          <EmojiButton
            label="Edit"
            emoji={ActionEmoji.edit}
            onClick={() => onStartEdit(cat)}
          />
          <EmojiButton
            label={cat.is_active ? 'Sembunyikan' : 'Tampilkan'}
            emoji={ActionEmoji.show}
            struck={!cat.is_active}
            onClick={() => onToggleVisibility(cat.id, cat.is_active, null)}
          />
        </div>
      )}

      {cat.children.length > 0 && expanded && (
        <DndContext
          sensors={childSensors}
          collisionDetection={closestCenter}
          onDragEnd={onChildDragEnd}
        >
          <SortableContext
            items={childIds}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2 dark:border-neutral-700">
              {cat.children.map((child) =>
                editingId === child.id ? (
                  <li key={child.id} className="pl-4">
                    <EditRow
                      icon={editIcon}
                      name={editName}
                      saving={saving}
                      onIconChange={onEditIconChange}
                      onNameChange={onEditNameChange}
                      onSave={onSaveEdit}
                      onCancel={onCancelEdit}
                    />
                  </li>
                ) : (
                  <SortableChildRow
                    key={child.id}
                    child={child}
                    onStartEdit={onStartEdit}
                    onToggleVisibility={onToggleVisibility}
                  />
                ),
              )}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function SortableChildRow({
  child,
  onStartEdit,
  onToggleVisibility,
}: {
  child: Category
  onStartEdit: (cat: Category) => void
  onToggleVisibility: (
    id: string,
    currentlyActive: boolean,
    parentIdValue?: string | null,
  ) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 rounded-lg py-1 pl-2 text-sm ${
        child.is_active
          ? 'text-neutral-600 dark:text-neutral-300'
          : 'bg-neutral-100 text-neutral-500 opacity-60 dark:bg-neutral-900 dark:text-neutral-400'
      } ${isDragging ? 'bg-emerald-50 dark:bg-emerald-950' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          className="touch-none shrink-0 rounded-lg px-1 py-1 text-base leading-none text-neutral-400"
          aria-label="Seret untuk ubah urutan"
          title="Seret"
          {...attributes}
          {...listeners}
        >
          {ActionEmoji.drag}
        </button>
        <span className="min-w-0 truncate">
          {child.icon} {child.name}
        </span>
      </div>
      <span className="flex shrink-0 gap-0.5">
        <EmojiButton
          label="Edit"
          emoji={ActionEmoji.edit}
          onClick={() => onStartEdit(child)}
        />
        <EmojiButton
          label={child.is_active ? 'Sembunyikan' : 'Tampilkan'}
          emoji={ActionEmoji.show}
          struck={!child.is_active}
          onClick={() =>
            onToggleVisibility(child.id, child.is_active, child.parent_id)
          }
        />
      </span>
    </li>
  )
}

function EmojiButton({
  label,
  emoji,
  onClick,
  struck = false,
}: {
  label: string
  emoji: string
  onClick: () => void
  struck?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg px-1.5 py-1 text-base leading-none hover:bg-neutral-100 dark:hover:bg-neutral-700"
    >
      {struck ? (
        <span className="relative inline-block">
          <span aria-hidden>{emoji}</span>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 -rotate-45 rounded bg-neutral-600 dark:bg-neutral-300"
          />
        </span>
      ) : (
        emoji
      )}
    </button>
  )
}

function IconChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
        title="Simpan"
        aria-label="Simpan"
        className="rounded-lg px-1.5 py-1 text-base leading-none disabled:opacity-60"
      >
        {ActionEmoji.save}
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Batal"
        aria-label="Batal"
        className="rounded-lg px-1.5 py-1 text-base leading-none"
      >
        {ActionEmoji.cancel}
      </button>
    </div>
  )
}
