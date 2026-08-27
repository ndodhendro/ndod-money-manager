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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react'
import {
  useCategories,
  type CategoryTreeNode,
} from '../hooks/useCategories'
import { useBuckets } from '../hooks/useBuckets'
import { showAppToast } from '../lib/appToast'
import { ActionEmoji } from '../lib/actionEmoji'
import { sinkingLinkedCategoryIds } from '../lib/bucketsApi'
import {
  addCategory,
  categoryHasAttachments,
  deleteCategory,
  fetchCategoryUsage,
  renameCategory,
  reorderCategories,
  type CategoryUsage,
} from '../lib/categoriesApi'
import {
  type BudgetGroup,
  type Category,
  type CategoryType,
} from '../lib/types'
import { isBlankSearch, matchesCategorySearch } from '../lib/listSearch'
import { BudgetGroupBadge } from './BudgetGroupBadge'
import { CollapseChevron } from './CollapseChevron'
import { ConfirmDialog } from './ConfirmDialog'
import { GroupedListFrame } from './GroupedListFrame'
import { SearchField } from './SearchField'
import { SinkingFundLabel } from './SinkingFundLabel'

interface CategoryManagePanelProps {
  type: CategoryType
  allowTypeChange?: boolean
  onChanged: () => void
  compact?: boolean
  onTypeChange?: (type: CategoryType) => void
  onViewChange?: (info: { view: 'list' | 'form' }) => void
  /** Parent can call this to leave the form and return to the list. */
  backToListRef?: MutableRefObject<(() => void) | null>
  /** When set by the route, keep the panel form in sync with the URL. */
  routeWantForm?: boolean
}

export function CategoryManagePanel({
  type,
  allowTypeChange = false,
  onChanged,
  compact = false,
  onTypeChange,
  onViewChange,
  backToListRef,
  routeWantForm,
}: CategoryManagePanelProps) {
  const { tree, parents, reload } = useCategories(type)
  const { buckets, reload: reloadBuckets } = useBuckets()
  const sinkingCategoryIds = useMemo(
    () => sinkingLinkedCategoryIds(buckets),
    [buckets],
  )

  const [orderedTree, setOrderedTree] = useState<CategoryTreeNode[]>([])
  const [name, setName] = useState('')
  const [formType, setFormType] = useState<CategoryType | ''>('')
  const [budgetGroup, setBudgetGroup] = useState<BudgetGroup | ''>('')
  const [icon, setIcon] = useState('🏷️')
  /** '' = unset, '__main__' = new parent category, otherwise parent id */
  const [parentChoice, setParentChoice] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editBudgetGroup, setEditBudgetGroup] = useState<BudgetGroup | null>(
    null,
  )
  /** Set when editing a subcategory — current/new parent id (`null` = promote to main). */
  const [editParentId, setEditParentId] = useState<string | null>(null)
  const [editingIsSubcategory, setEditingIsSubcategory] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleteUsage, setDeleteUsage] = useState<CategoryUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [reassignToId, setReassignToId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<'list' | 'form'>(() =>
    routeWantForm ? 'form' : 'list',
  )
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange
  const parentRef = useRef<HTMLSelectElement>(null)
  const typeRef = useRef<HTMLSelectElement>(null)
  const budgetRef = useRef<HTMLSelectElement>(null)
  const iconRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!deleteTarget?.parent_id) {
      setDeleteUsage(null)
      setReassignToId('')
      setUsageLoading(false)
      return
    }
    let cancelled = false
    setUsageLoading(true)
    setReassignToId('')
    setDeleteUsage(null)
    void fetchCategoryUsage(deleteTarget.id)
      .then((usage) => {
        if (!cancelled) setDeleteUsage(usage)
      })
      .catch(() => {
        if (!cancelled) {
          setDeleteUsage({
            transactionCount: 0,
            recurringBillCount: 0,
            hasSinkingFund: false,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [deleteTarget])

  const reassignGroups = useMemo(() => {
    if (!deleteTarget?.parent_id) return []
    return orderedTree
      .map((parent) => ({
        parent,
        children: parent.children.filter(
          (child) => child.id !== deleteTarget.id,
        ),
      }))
      .filter((group) => group.children.length > 0)
  }, [deleteTarget, orderedTree])

  const showReassignPicker =
    Boolean(deleteTarget?.parent_id) &&
    !usageLoading &&
    deleteUsage != null &&
    categoryHasAttachments(deleteUsage)

  const deleteTitle = deleteTarget?.parent_id
    ? 'Delete Subcategory?'
    : 'Delete Category?'

  const deleteMessage = (() => {
    if (!deleteTarget) return ''
    if (deleteTarget.parent_id) {
      if (showReassignPicker) {
        return `“${deleteTarget.name}” will be removed from pickers. You can move attached transactions and recurring bills to another subcategory, or delete without moving. A sinking fund moves only if the destination does not already have one.`
      }
      return `“${deleteTarget.name}” will be removed from pickers.`
    }
    return `“${deleteTarget.name}” will be removed from pickers. Past transactions keep this category.`
  })()

  // Only notify on view change — not when parent callback identity changes.
  useEffect(() => {
    onViewChangeRef.current?.({ view })
  }, [view])

  useEffect(() => {
    if (routeWantForm == null) return
    if (!routeWantForm) {
      if (view !== 'list') {
        resetAddForm()
        setView('list')
      }
      return
    }
    if (view !== 'form') {
      resetAddForm()
      setView('form')
    }
  }, [routeWantForm])

  useEffect(() => {
    if (!backToListRef) return
    backToListRef.current = () => {
      resetAddForm()
      setView('list')
    }
    return () => {
      backToListRef.current = null
    }
  })

  const parentOptions = useMemo(() => parents, [parents])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
  )

  const searchActive = !isBlankSearch(searchQuery)
  const displayTree = useMemo(() => {
    if (!searchActive) return orderedTree
    return orderedTree
      .map((parent) => {
        const parentMatch = matchesCategorySearch(searchQuery, parent)
        const children = parent.children.filter(
          (child) =>
            parentMatch ||
            matchesCategorySearch(searchQuery, child, parent.budget_group),
        )
        return { ...parent, children }
      })
      .filter(
        (parent) =>
          matchesCategorySearch(searchQuery, parent) ||
          parent.children.length > 0,
      )
  }, [orderedTree, searchActive, searchQuery])

  const parentIds = useMemo(
    () => displayTree.map((c) => c.id),
    [displayTree],
  )

  const expandableParentIds = useMemo(
    () =>
      orderedTree.filter((c) => c.children.length > 0).map((c) => c.id),
    [orderedTree],
  )

  const allSubsExpanded =
    expandableParentIds.length > 0 &&
    expandableParentIds.every((id) => expandedIds.has(id))

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setAllSubsExpanded(expanded: boolean) {
    setExpandedIds(expanded ? new Set(expandableParentIds) : new Set())
  }

  async function refresh() {
    await Promise.all([reload(), reloadBuckets()])
    onChanged()
  }

  function resetAddForm() {
    setName('')
    setIcon('🏷️')
    setParentChoice('')
    setBudgetGroup('')
    setFormType(allowTypeChange ? '' : type)
  }

  function openAddForm() {
    resetAddForm()
    setEditingId(null)
    setView('form')
  }

  async function handleAdd() {
    const resolvedType = allowTypeChange ? formType : type

    if (!resolvedType) {
      showAppToast('Select expense or income')
      typeRef.current?.focus()
      return
    }
    if (!parentChoice) {
      showAppToast('Select a parent option')
      parentRef.current?.focus()
      return
    }
    if (resolvedType === 'expense' && !budgetGroup) {
      showAppToast('Select needs or wants')
      budgetRef.current?.focus()
      return
    }
    if (!icon.trim()) {
      showAppToast('Enter an icon')
      iconRef.current?.focus()
      return
    }
    if (!name.trim()) {
      showAppToast('Enter a name')
      nameRef.current?.focus()
      return
    }

    const isMain = parentChoice === '__main__'
    setSaving(true)
    try {
      await addCategory({
        name: name.trim(),
        type: resolvedType,
        icon,
        budget_group:
          resolvedType === 'expense' ? (budgetGroup as BudgetGroup) : null,
        parent_id: isMain ? null : parentChoice,
      })
      resetAddForm()
      setView('list')
      showAppToast(`Saved ${ActionEmoji.save}`)
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCategory(deleteTarget.id, {
        reassignToId: reassignToId || null,
      })
      setDeleteTarget(null)
      if (editingId === deleteTarget.id) setEditingId(null)
      showAppToast(reassignToId ? 'Moved and deleted' : 'Deleted')
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditIcon(cat.icon)
    setEditBudgetGroup(
      type === 'expense'
        ? cat.budget_group === 'needs' || cat.budget_group === 'wants'
          ? cat.budget_group
          : 'needs'
        : null,
    )
    const isSub = Boolean(cat.parent_id)
    setEditingIsSubcategory(isSub)
    setEditParentId(cat.parent_id)
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    try {
      const parent = orderedTree.find((p) => p.id === editingId)
      const isParentWithChildren = Boolean(parent && parent.children.length > 0)

      const nextParentId = editingIsSubcategory ? editParentId : undefined

      await renameCategory(editingId, {
        name: editName.trim(),
        icon: editIcon || '🏷️',
        // Parents with children hide budget in the list; never wipe stored group.
        ...(type === 'expense' && !isParentWithChildren
          ? { budget_group: editBudgetGroup ?? 'needs' }
          : {}),
        ...(nextParentId !== undefined ? { parent_id: nextParentId } : {}),
      })

      if (nextParentId) {
        setExpandedIds((prev) => new Set(prev).add(nextParentId))
      }

      setEditingId(null)
      setEditingIsSubcategory(false)
      setEditParentId(null)
      showAppToast(`Updated ${ActionEmoji.edit}`)
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingIsSubcategory(false)
    setEditParentId(null)
  }

  async function handleParentDragEnd(event: DragEndEvent) {
    if (searchActive) return
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
      showAppToast(err instanceof Error ? err.message : 'Failed to reorder')
    }
  }

  async function handleChildDragEnd(parentIdValue: string, event: DragEndEvent) {
    if (searchActive) return
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
      showAppToast(err instanceof Error ? err.message : 'Failed to reorder')
    }
  }

  return (
    <div className={compact ? 'space-y-3 p-3' : 'space-y-4'}>
      {view === 'list' ? (
        <div className="space-y-3">
          {allowTypeChange && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
              {(['expense', 'income'] as CategoryType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onTypeChange?.(t)
                    cancelEdit()
                  }}
                  className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                    type === t
                      ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50'
                      : 'text-neutral-500'
                  }`}
                >
                  {t === 'expense' ? 'Expense' : 'Income'}
                </button>
              ))}
            </div>
          )}

          <GroupedListFrame
            label="Categories List"
            expanded={searchActive ? true : allSubsExpanded}
            onToggle={setAllSubsExpanded}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <SearchField
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search categories…"
                  aria-label="Search categories"
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={openAddForm}
                  className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white active:bg-emerald-600"
                >
                  {ActionEmoji.add} Add New
                </button>
              </div>

              {!searchActive ? (
                <p className="text-[11px] text-neutral-400">
                  Hold & drag {ActionEmoji.drag} to reorder.
                </p>
              ) : null}

              {orderedTree.length === 0 ? (
                <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                  No categories yet. Tap Add New to create one.
                </p>
              ) : displayTree.length === 0 ? (
                <p className="rounded-xl bg-white p-3 text-center text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                  No matches.
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleParentDragEnd}
                >
                  <SortableContext
                    items={parentIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {displayTree.map((cat) => (
                        <SortableParentRow
                          key={cat.id}
                          cat={cat}
                          categoryType={type}
                          expanded={
                            searchActive ? true : expandedIds.has(cat.id)
                          }
                          editingId={editingId}
                          editIcon={editIcon}
                          editName={editName}
                          editBudgetGroup={editBudgetGroup}
                          editParentId={editParentId}
                          editingIsSubcategory={editingIsSubcategory}
                          parentOptions={parentOptions}
                          editLeaf={cat.children.length === 0}
                          saving={saving}
                          reorderEnabled={!searchActive}
                          onToggleExpand={() => toggleExpand(cat.id)}
                          onStartEdit={startEdit}
                          onDelete={(cat) => setDeleteTarget(cat)}
                          onEditIconChange={setEditIcon}
                          onEditNameChange={setEditName}
                          onEditBudgetGroupChange={setEditBudgetGroup}
                          onEditParentChange={(parentId) => {
                            setEditParentId(parentId)
                            const parent = orderedTree.find((p) => p.id === parentId)
                            if (
                              parent?.budget_group === 'needs' ||
                              parent?.budget_group === 'wants'
                            ) {
                              setEditBudgetGroup(parent.budget_group)
                              return
                            }
                            const siblingGroups = (parent?.children ?? [])
                              .filter((child) => child.id !== editingId)
                              .map((child) => child.budget_group)
                              .filter(
                                (group): group is BudgetGroup =>
                                  group === 'needs' || group === 'wants',
                              )
                            if (
                              siblingGroups.length > 0 &&
                              siblingGroups.every((group) => group === siblingGroups[0])
                            ) {
                              setEditBudgetGroup(siblingGroups[0])
                            }
                          }}
                          onSaveEdit={saveEdit}
                          onCancelEdit={cancelEdit}
                          onChildDragEnd={(event) =>
                            handleChildDragEnd(cat.id, event)
                          }
                          sinkingCategoryIds={sinkingCategoryIds}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </GroupedListFrame>
        </div>
      ) : (
        <div
          className={`space-y-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800 ${
            compact ? '' : 'p-4'
          }`}
        >
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Add Category / Subcategory
          </p>
          {allowTypeChange ? (
            <select
              ref={typeRef}
              value={formType}
              onChange={(e) => {
                const next = e.target.value as CategoryType | ''
                setFormType(next)
                setParentChoice('')
                setBudgetGroup('')
                if (next) onTypeChange?.(next)
              }}
              className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
            >
              <option value="">Select One</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          ) : (
            <div className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-700">
              {type === 'expense' ? 'Expense' : 'Income'}
            </div>
          )}
          <div className="flex gap-2">
            <select
              ref={parentRef}
              value={parentChoice}
              onChange={(e) => setParentChoice(e.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
            >
              <option value="">Select One</option>
              <option value="__main__">New parent (main category)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  Sub of: {p.icon} {p.name}
                </option>
              ))}
            </select>
            {(allowTypeChange ? formType !== 'income' : type === 'expense') && (
              <select
                ref={budgetRef}
                value={budgetGroup}
                onChange={(e) =>
                  setBudgetGroup(e.target.value as BudgetGroup | '')
                }
                className="w-[38%] shrink-0 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
              >
                <option value="">Select One</option>
                <option value="needs">Needs</option>
                <option value="wants">Wants</option>
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={iconRef}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-lg dark:bg-neutral-700"
              maxLength={4}
            />
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTitle}
        message={deleteMessage}
        confirmLabel={reassignToId ? 'Move & Delete' : 'Delete'}
        busyLabel={reassignToId ? 'Moving…' : undefined}
        cancelLabel="Cancel"
        busy={deleting}
        confirmDisabled={Boolean(deleteTarget?.parent_id) && usageLoading}
        onCancel={() => {
          if (deleting) return
          setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDelete()}
      >
        {deleteTarget?.parent_id && usageLoading ? (
          <p className="mt-3 text-sm text-neutral-400">
            Checking attached items…
          </p>
        ) : null}
        {showReassignPicker ? (
          <div className="mt-3 space-y-1.5">
            <label
              htmlFor="reassign-subcategory"
              className="block text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              Move To
            </label>
            <select
              id="reassign-subcategory"
              value={reassignToId}
              disabled={deleting}
              onChange={(e) => setReassignToId(e.target.value)}
              className="w-full rounded-lg bg-neutral-100 px-2 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
              aria-label="Move to subcategory"
            >
              <option value="">Don't Move</option>
              {reassignGroups.map(({ parent, children }) => (
                <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.icon} {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

function SortableParentRow({
  cat,
  categoryType,
  expanded,
  editingId,
  editIcon,
  editName,
  editBudgetGroup,
  editParentId,
  editingIsSubcategory,
  parentOptions,
  editLeaf,
  saving,
  reorderEnabled,
  onToggleExpand,
  onStartEdit,
  onDelete,
  onEditIconChange,
  onEditNameChange,
  onEditBudgetGroupChange,
  onEditParentChange,
  onSaveEdit,
  onCancelEdit,
  onChildDragEnd,
  sinkingCategoryIds,
}: {
  cat: CategoryTreeNode
  categoryType: CategoryType
  expanded: boolean
  editingId: string | null
  editIcon: string
  editName: string
  editBudgetGroup: BudgetGroup | null
  editParentId: string | null
  editingIsSubcategory: boolean
  parentOptions: Category[]
  editLeaf: boolean
  saving: boolean
  reorderEnabled: boolean
  onToggleExpand: () => void
  onStartEdit: (cat: Category) => void
  onDelete: (cat: Category) => void
  onEditIconChange: (v: string) => void
  onEditNameChange: (v: string) => void
  onEditBudgetGroupChange: (v: BudgetGroup) => void
  onEditParentChange: (parentId: string | null) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onChildDragEnd: (event: DragEndEvent) => void
  sinkingCategoryIds: Set<string>
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
    useSensor(PointerSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
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
      className={`rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800 ${
        isDragging ? 'shadow-lg ring-1 ring-emerald-300' : ''
      }`}
    >
      {editingId === cat.id ? (
        <EditRow
          icon={editIcon}
          name={editName}
          budgetGroup={editBudgetGroup}
          showBudgetGroup={categoryType === 'expense' && editLeaf}
          saving={saving}
          onIconChange={onEditIconChange}
          onNameChange={onEditNameChange}
          onBudgetGroupChange={onEditBudgetGroupChange}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <div className="flex items-center gap-1">
          {reorderEnabled ? (
            <button
              type="button"
              className="touch-none rounded-lg px-1 py-1 text-base leading-none text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              aria-label="Drag to reorder"
              title="Drag"
              {...attributes}
              {...listeners}
            >
              {ActionEmoji.drag}
            </button>
          ) : null}
          {cat.children.length > 0 ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <CollapseChevron expanded={expanded} />
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
              {cat.children.length === 0 && cat.budget_group && (
                <p className="mt-0.5">
                  <BudgetGroupBadge group={cat.budget_group} />
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
            label="Delete"
            emoji={ActionEmoji.delete}
            onClick={() => onDelete(cat)}
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
                      budgetGroup={editBudgetGroup}
                      showBudgetGroup={categoryType === 'expense'}
                      showParentSelect={editingIsSubcategory}
                      disableParentSelect={
                        editingIsSubcategory && sinkingCategoryIds.has(child.id)
                      }
                      parentId={editParentId}
                      parentOptions={parentOptions.filter(
                        (p) => p.id !== child.id,
                      )}
                      saving={saving}
                      onIconChange={onEditIconChange}
                      onNameChange={onEditNameChange}
                      onBudgetGroupChange={onEditBudgetGroupChange}
                      onParentChange={onEditParentChange}
                      onSave={onSaveEdit}
                      onCancel={onCancelEdit}
                    />
                  </li>
                ) : (
                  <SortableChildRow
                    key={child.id}
                    child={child}
                    linkedToSinkingFund={sinkingCategoryIds.has(child.id)}
                    reorderEnabled={reorderEnabled}
                    onStartEdit={onStartEdit}
                    onDelete={onDelete}
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
  linkedToSinkingFund = false,
  reorderEnabled,
  onStartEdit,
  onDelete,
}: {
  child: Category
  linkedToSinkingFund?: boolean
  reorderEnabled: boolean
  onStartEdit: (cat: Category) => void
  onDelete: (cat: Category) => void
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
      className={`flex items-center justify-between gap-2 rounded-lg py-1 pl-2 text-sm text-neutral-600 dark:text-neutral-300 ${
        isDragging ? 'bg-emerald-50 dark:bg-emerald-950' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {reorderEnabled ? (
          <button
            type="button"
            className="touch-none shrink-0 rounded-lg px-1 py-1 text-base leading-none text-neutral-400"
            aria-label="Drag to reorder"
            title="Drag"
            {...attributes}
            {...listeners}
          >
            {ActionEmoji.drag}
          </button>
        ) : null}
        <span className="flex min-w-0 items-center gap-1 truncate">
          <span className="truncate">
            {child.icon} {child.name}
          </span>
          {linkedToSinkingFund ? <SinkingFundLabel /> : null}
          {child.budget_group ? (
            <span className="shrink-0 align-middle">
              <BudgetGroupBadge group={child.budget_group} />
            </span>
          ) : null}
        </span>
      </div>
      <span className="flex shrink-0 gap-0.5">
        <EmojiButton
          label="Edit"
          emoji={ActionEmoji.edit}
          onClick={() => onStartEdit(child)}
        />
        <EmojiButton
          label="Delete"
          emoji={ActionEmoji.delete}
          onClick={() => onDelete(child)}
        />
      </span>
    </li>
  )
}

function EmojiButton({
  label,
  emoji,
  onClick,
}: {
  label: string
  emoji: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg px-1.5 py-1 text-base leading-none hover:bg-neutral-100 dark:hover:bg-neutral-700"
    >
      {emoji}
    </button>
  )
}

function EditRow({
  icon,
  name,
  budgetGroup,
  showBudgetGroup = false,
  showParentSelect = false,
  disableParentSelect = false,
  parentId = null,
  parentOptions = [],
  saving,
  onIconChange,
  onNameChange,
  onBudgetGroupChange,
  onParentChange,
  onSave,
  onCancel,
}: {
  icon: string
  name: string
  budgetGroup: BudgetGroup | null
  showBudgetGroup?: boolean
  showParentSelect?: boolean
  disableParentSelect?: boolean
  parentId?: string | null
  parentOptions?: Category[]
  saving: boolean
  onIconChange: (v: string) => void
  onNameChange: (v: string) => void
  onBudgetGroupChange: (v: BudgetGroup) => void
  onParentChange?: (parentId: string | null) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-2">
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
          title="Save"
          aria-label="Save"
          className="rounded-lg px-1.5 py-1 text-base leading-none disabled:opacity-60"
        >
          {ActionEmoji.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          title="Cancel"
          aria-label="Cancel"
          className="rounded-lg px-1.5 py-1 text-base leading-none disabled:opacity-60"
        >
          {ActionEmoji.cancel}
        </button>
      </div>
      {showParentSelect && onParentChange ? (
        <select
          value={parentId ?? '__main__'}
          disabled={disableParentSelect}
          onChange={(e) => {
            if (disableParentSelect) return
            const next = e.target.value
            onParentChange(next === '__main__' ? null : next)
          }}
          className={`w-full rounded-lg bg-neutral-100 px-2 py-1.5 text-sm dark:bg-neutral-700 dark:text-neutral-100 ${
            disableParentSelect ? 'cursor-not-allowed opacity-60' : ''
          }`}
          aria-label="Parent category"
        >
          <option value="__main__">Main category</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              Sub of: {p.icon} {p.name}
            </option>
          ))}
        </select>
      ) : null}
      {showBudgetGroup && (
        <select
          value={budgetGroup ?? 'needs'}
          onChange={(e) =>
            onBudgetGroupChange(e.target.value as BudgetGroup)
          }
          className="w-full rounded-lg bg-neutral-100 px-2 py-1.5 text-sm dark:bg-neutral-700 dark:text-neutral-100"
          aria-label="Needs or wants"
        >
          <option value="needs">Needs</option>
          <option value="wants">Wants</option>
        </select>
      )}
    </div>
  )
}
