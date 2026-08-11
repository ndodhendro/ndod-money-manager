import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react'
import { useBuckets } from '../hooks/useBuckets'
import { useCategories } from '../hooks/useCategories'
import { usePyfSettings } from '../hooks/usePyfSettings'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import {
  createSinkingBucketFromCategory,
  deleteBucket,
  findActiveBucketForCategory,
  updateBucket,
} from '../lib/bucketsApi'
import { groupBucketsByKindAsTree } from '../lib/bucketsGroup'
import {
  getCollapseOpen,
  setCollapseOpen,
} from '../lib/collapseState'
import { sumPlannedNeeds } from '../lib/freeWants'
import { formatNumber, formatRupiah } from '../lib/format'
import { emergencyFundTarget } from '../lib/moneyPlan'
import { currentMonthCursor, monthCursorKey } from '../lib/monthCursor'
import {
  fetchRecurringBills,
  isMissingRecurringSchema,
  type RecurringBill,
} from '../lib/recurringBillsApi'
import {
  BUCKET_KIND_LABELS,
  type BucketKind,
  type BucketTreeNode,
  type BucketWithBalance,
} from '../lib/types'
import { BudgetGroupBadge } from './BudgetGroupBadge'
import { CategoryPicker } from './CategoryPicker'
import { CollapseChevron } from './CollapseChevron'
import { ConfirmDialog } from './ConfirmDialog'
import { GroupedListFrame } from './GroupedListFrame'
import { SwipeDeleteRow } from './SwipeDeleteRow'

interface BucketManagePanelProps {
  onChanged?: () => void
  onViewChange?: (info: {
    view: 'list' | 'form'
    editing: boolean
    editingId: string | null
  }) => void
  backToListRef?: MutableRefObject<(() => void) | null>
  routeWantForm?: boolean
  routeEditId?: string | null
}

export function BucketManagePanel({
  onChanged,
  onViewChange,
  backToListRef,
  routeWantForm,
  routeEditId = null,
}: BucketManagePanelProps = {}) {
  const { buckets, byId: bucketsById, loading, error, reload } = useBuckets()
  const { settings: pyfSettings } = usePyfSettings()
  const {
    tree: expenseTree,
    byId: categoriesById,
    reload: reloadCategories,
  } = useCategories('expense', { includeInactive: true })

  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [targetDigits, setTargetDigits] = useState('')
  const [openingDigits, setOpeningDigits] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(
    () => routeEditId ?? null,
  )
  const [view, setView] = useState<'list' | 'form'>(() =>
    routeWantForm ? 'form' : 'list',
  )
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BucketWithBalance | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [kindGroupsExpanded, setKindGroupsExpanded] = useState(true)
  /** Parent sinking buckets with children — default collapsed. */
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [bills, setBills] = useState<RecurringBill[]>([])
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const hydratedEditIdRef = useRef<string | null>(null)
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange

  const targetRef = useRef<HTMLInputElement>(null)
  const openingRef = useRef<HTMLInputElement>(null)

  const groupedTree = useMemo(
    () => groupBucketsByKindAsTree(buckets, categoriesById),
    [buckets, categoriesById],
  )

  /** Always show Sinking Fund section (even empty) so Add New stays discoverable. */
  const displayGroups = useMemo(() => {
    const groups = [...groupedTree]
    if (!groups.some(([kind]) => kind === 'sinking')) {
      groups.push(['sinking', []])
    }
    const order: BucketKind[] = [
      'checking',
      'emergency',
      'investment',
      'sinking',
    ]
    return groups.sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
    )
  }, [groupedTree])

  const expandableSinkingParentIds = useMemo(() => {
    const sinking = displayGroups.find(([kind]) => kind === 'sinking')
    if (!sinking) return [] as string[]
    return sinking[1]
      .filter((node) => node.children.length > 0)
      .map((node) => node.bucket.id)
  }, [displayGroups])

  const allSinkingCatsExpanded =
    expandableSinkingParentIds.length > 0 &&
    expandableSinkingParentIds.every((id) => expandedParentIds.has(id))

  function setAllSinkingCatsExpanded(expanded: boolean) {
    const next = expanded ? new Set(expandableSinkingParentIds) : new Set<string>()
    setExpandedParentIds(next)
    for (const id of expandableSinkingParentIds) {
      setCollapseOpen(`settings:buckets:parent:${id}`, expanded)
    }
  }

  const categoriesLinked = useMemo(() => {
    const set = new Set<string>()
    for (const b of buckets) {
      if (b.kind === 'sinking' && b.category_id) set.add(b.category_id)
    }
    return set
  }, [buckets])

  /** Tree with subcategories that already have a sinking fund filtered out (add form). */
  const availableExpenseTree = useMemo(() => {
    return expenseTree
      .map((parent) => ({
        ...parent,
        children: parent.children.filter((c) => !categoriesLinked.has(c.id)),
      }))
      .filter((p) => p.children.length > 0)
  }, [expenseTree, categoriesLinked])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchRecurringBills()
        if (!cancelled) setBills(rows)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        if (isMissingRecurringSchema(message)) setBills([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const viewYm = monthCursorKey(currentMonthCursor())
  const plannedNeeds = useMemo(
    () =>
      sumPlannedNeeds(
        bills,
        new Map(),
        categoriesById,
        viewYm,
        undefined,
        bucketsById,
      ),
    [bills, categoriesById, bucketsById, viewYm],
  )
  const efMultiplier = pyfSettings?.emergency_fund_target_multiplier ?? 3
  const emergencyAutoTarget = useMemo(
    () => emergencyFundTarget(plannedNeeds, efMultiplier),
    [plannedNeeds, efMultiplier],
  )

  const editingBucket =
    editingId ? buckets.find((b) => b.id === editingId) ?? null : null
  const isEditingEmergency = editingBucket?.kind === 'emergency'
  const isEditingInvestment = editingBucket?.kind === 'investment'
  const hideTargetField = isEditingEmergency || isEditingInvestment
  const editingHasChildren = useMemo(() => {
    if (!editingId) return false
    return buckets.some((b) => b.parent_id === editingId)
  }, [buckets, editingId])
  const isCategoryLinkedSinking =
    editingBucket?.kind === 'sinking' && Boolean(editingBucket.category_id)
  const linkedCategory =
    editingBucket?.category_id
      ? categoriesById.get(editingBucket.category_id) ?? null
      : null
  const selectedCategory = categoryId
    ? categoriesById.get(categoryId) ?? null
    : null
  const selectedBudgetGroup =
    selectedCategory?.budget_group === 'needs' ||
    selectedCategory?.budget_group === 'wants'
      ? selectedCategory.budget_group
      : linkedCategory?.budget_group === 'needs' ||
          linkedCategory?.budget_group === 'wants'
        ? linkedCategory.budget_group
        : null

  useEffect(() => {
    if (!isEditingEmergency) return
    setTargetDigits(
      emergencyAutoTarget > 0
        ? String(Math.round(emergencyAutoTarget))
        : '',
    )
  }, [isEditingEmergency, emergencyAutoTarget])

  useEffect(() => {
    onViewChangeRef.current?.({
      view,
      editing: editingId != null,
      editingId,
    })
  }, [view, editingId])

  useEffect(() => {
    if (routeWantForm == null) return
    if (!routeWantForm) {
      hydratedEditIdRef.current = null
      if (view !== 'list') {
        resetForm()
        setView('list')
      }
      return
    }
    if (routeEditId) {
      const bucket = buckets.find((b) => b.id === routeEditId)
      if (!bucket) return
      if (
        editingId === routeEditId &&
        view === 'form' &&
        hydratedEditIdRef.current === routeEditId
      ) {
        return
      }
      startEdit(bucket)
      hydratedEditIdRef.current = routeEditId
      setView('form')
      return
    }
    hydratedEditIdRef.current = null
    if (view !== 'form' || editingId != null) {
      resetForm()
      setView('form')
    }
  }, [routeWantForm, routeEditId, buckets])

  useEffect(() => {
    if (!backToListRef) return
    backToListRef.current = () => {
      resetForm()
      setView('list')
    }
    return () => {
      backToListRef.current = null
    }
  })

  useEffect(() => {
    if (!highlightId) return
    const t = window.setTimeout(() => setHighlightId(null), 1800)
    return () => window.clearTimeout(t)
  }, [highlightId])

  // Expand parent when a child (or the parent itself) is highlighted after save.
  useEffect(() => {
    if (!highlightId) return
    const highlighted = buckets.find((b) => b.id === highlightId)
    if (!highlighted) return
    const parentId = highlighted.parent_id ?? highlightId
    const hasChildren = buckets.some((b) => b.parent_id === parentId)
    if (!hasChildren && !highlighted.parent_id) return
    setExpandedParentIds((prev) => {
      if (prev.has(parentId)) return prev
      const next = new Set(prev)
      next.add(parentId)
      setCollapseOpen(`settings:buckets:parent:${parentId}`, true)
      return next
    })
  }, [highlightId, buckets])

  function toggleParentExpanded(parentId: string) {
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      const open = !next.has(parentId)
      if (open) next.add(parentId)
      else next.delete(parentId)
      setCollapseOpen(`settings:buckets:parent:${parentId}`, open)
      return next
    })
  }

  // Hydrate parent collapse from session (default collapsed).
  useEffect(() => {
    const parentsWithKids = buckets.filter(
      (b) =>
        b.kind === 'sinking' &&
        !b.parent_id &&
        buckets.some((c) => c.parent_id === b.id),
    )
    if (parentsWithKids.length === 0) return
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const p of parentsWithKids) {
        const key = `settings:buckets:parent:${p.id}`
        if (getCollapseOpen(key, false) && !next.has(p.id)) {
          next.add(p.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [buckets])

  useEffect(() => {
    if (!highlightId || loading || view !== 'list') return
    highlightRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlightId, loading, view, buckets])

  async function refresh() {
    await reload()
    onChanged?.()
  }

  function resetForm() {
    setCategoryId(null)
    setCategoryOpen(false)
    setTargetDigits('')
    setOpeningDigits('')
    setEditingId(null)
    hydratedEditIdRef.current = null
  }

  function startEdit(b: BucketWithBalance) {
    setEditingId(b.id)
    hydratedEditIdRef.current = b.id
    setCategoryId(b.category_id)
    setCategoryOpen(false)
    if (b.kind === 'emergency') {
      setTargetDigits(
        emergencyAutoTarget > 0
          ? String(Math.round(emergencyAutoTarget))
          : '',
      )
    } else {
      setTargetDigits(
        b.target_amount != null ? String(Math.round(b.target_amount)) : '',
      )
    }
    setOpeningDigits(
      b.opening_balance > 0 ? String(Math.round(b.opening_balance)) : '',
    )
    setOpenSwipeId(null)
  }

  function openAddForm() {
    resetForm()
    setView('form')
  }

  function openEditForm(b: BucketWithBalance) {
    startEdit(b)
    setView('form')
  }

  function handleCategorySelect(id: string) {
    const cat = categoriesById.get(id)
    if (!cat?.parent_id) {
      showAppToast('Pick a subcategory')
      return
    }
    if (findActiveBucketForCategory(buckets, id)) {
      showAppToast('This subcategory already has a sinking fund')
      return
    }
    setCategoryId(id)
    setCategoryOpen(false)
  }

  async function handleAdd() {
    if (!categoryId) {
      showAppToast('Pick a subcategory')
      setCategoryOpen(true)
      return
    }
    const cat = categoriesById.get(categoryId)
    if (!cat?.parent_id) {
      showAppToast('Pick a subcategory')
      return
    }
    const target = Number(targetDigits)
    if (!targetDigits || !Number.isFinite(target) || target <= 0) {
      showAppToast('Enter a target amount')
      targetRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const created = await createSinkingBucketFromCategory({
        category_id: categoryId,
        target_amount: target,
        opening_balance: openingDigits ? Number(openingDigits) : 0,
      })
      resetForm()
      setKindGroupsExpanded(true)
      showAppToast(`Saved ${ActionEmoji.save}`)
      setView('list')
      await refresh()
      setHighlightId(created.id)
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!editingId) return
    const updatedId = editingId
    const current = buckets.find((b) => b.id === updatedId)
    const skipTarget =
      current?.kind === 'emergency' || current?.kind === 'investment'
    if (!skipTarget && !editingHasChildren) {
      const target = Number(targetDigits)
      if (!targetDigits || !Number.isFinite(target) || target <= 0) {
        showAppToast('Enter a target amount')
        targetRef.current?.focus()
        return
      }
    }
    setSaving(true)
    try {
      await updateBucket(updatedId, {
        ...(skipTarget || (editingHasChildren && current?.kind === 'sinking')
          ? editingHasChildren && current?.kind === 'sinking' && targetDigits
            ? { target_amount: Number(targetDigits) }
            : {}
          : { target_amount: Number(targetDigits) }),
        ...(editingHasChildren
          ? {}
          : { opening_balance: openingDigits ? Number(openingDigits) : 0 }),
      })
      resetForm()
      setKindGroupsExpanded(true)
      showAppToast(`Updated ${ActionEmoji.edit}`)
      setView('list')
      await refresh()
      setHighlightId(updatedId)
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.is_system) {
      showAppToast('System buckets cannot be deleted')
      setDeleteTarget(null)
      return
    }
    setDeleting(true)
    try {
      const deletedId = deleteTarget.id
      await deleteBucket(deletedId)
      setDeleteTarget(null)
      setOpenSwipeId(null)
      if (editingId === deletedId) {
        resetForm()
        setView('list')
      }
      showAppToast('Deleted')
      setHighlightId(null)
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  function handleTargetKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!editingHasChildren) {
        openingRef.current?.focus()
      } else {
        void (editingId ? handleUpdate() : handleAdd())
      }
    }
  }

  function handleOpeningKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void (editingId ? handleUpdate() : handleAdd())
    }
  }

  const emergencyTargetDisplay =
    emergencyAutoTarget > 0
      ? formatNumber(Math.round(emergencyAutoTarget))
      : ''

  const deleteChildCount = deleteTarget
    ? buckets.filter((b) => b.parent_id === deleteTarget.id).length
    : 0

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-neutral-400">Loading…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {view === 'list' ? (
        <div className="space-y-3">
          {!loading && buckets.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
              No buckets yet. Add a sinking fund under Sinking Fund below.
            </p>
          ) : null}

          <GroupedListFrame
            label="Buckets List"
            expanded={kindGroupsExpanded}
            onToggle={(expanded) => {
              setKindGroupsExpanded(expanded)
              setAllSinkingCatsExpanded(expanded)
            }}
          >
            <div className="space-y-5">
              {displayGroups.map(([kind, nodes]) =>
                kind === 'sinking' ? (
                  <div key={kind}>
                    <button
                      type="button"
                      onClick={() =>
                        setAllSinkingCatsExpanded(!allSinkingCatsExpanded)
                      }
                      aria-expanded={allSinkingCatsExpanded}
                      aria-label={
                        allSinkingCatsExpanded
                          ? 'Collapse all sinking categories'
                          : 'Expand all sinking categories'
                      }
                      className="mb-2 flex w-full items-center gap-1.5 text-left"
                    >
                      <CollapseChevron
                        expanded={allSinkingCatsExpanded}
                        size={14}
                        className="shrink-0 text-neutral-400"
                      />
                      <p className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-neutral-400">
                        {BUCKET_KIND_LABELS[kind]}
                      </p>
                    </button>
                    <div className="space-y-2">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={openAddForm}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white active:bg-emerald-600"
                        >
                          {ActionEmoji.add} Add New
                        </button>
                      </div>
                      {nodes.length === 0 ? (
                        <p className="rounded-xl bg-white px-3 py-2.5 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                          No sinking funds yet. Tap Add New and pick a
                          subcategory.
                        </p>
                      ) : null}
                      {nodes.map((node) => (
                        <BucketTreeRows
                          key={node.bucket.id}
                          node={node}
                          openSwipeId={openSwipeId}
                          setOpenSwipeId={setOpenSwipeId}
                          highlightId={highlightId}
                          highlightRef={highlightRef}
                          emergencyAutoTarget={emergencyAutoTarget}
                          expanded={expandedParentIds.has(node.bucket.id)}
                          onToggleExpand={() =>
                            toggleParentExpanded(node.bucket.id)
                          }
                          onEdit={openEditForm}
                          onDelete={(b) => {
                            setOpenSwipeId(b.id)
                            setDeleteTarget(b)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={kind}>
                    <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">
                      {BUCKET_KIND_LABELS[kind]}
                    </p>
                    <div className="space-y-2">
                      {nodes.map((node) => (
                        <BucketTreeRows
                          key={node.bucket.id}
                          node={node}
                          openSwipeId={openSwipeId}
                          setOpenSwipeId={setOpenSwipeId}
                          highlightId={highlightId}
                          highlightRef={highlightRef}
                          emergencyAutoTarget={emergencyAutoTarget}
                          expanded={expandedParentIds.has(node.bucket.id)}
                          onToggleExpand={() =>
                            toggleParentExpanded(node.bucket.id)
                          }
                          onEdit={openEditForm}
                          onDelete={(b) => {
                            setOpenSwipeId(b.id)
                            setDeleteTarget(b)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </GroupedListFrame>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              {editingId
                ? editingBucket?.kind === 'sinking'
                  ? 'Edit Sinking Fund'
                  : 'Edit Bucket'
                : 'Add Sinking Fund'}
            </p>

            {!editingId ? (
              <div>
                <CategoryPicker
                  tree={availableExpenseTree}
                  selectedId={categoryId}
                  byId={categoriesById}
                  open={categoryOpen}
                  onOpenChange={setCategoryOpen}
                  onSelect={handleCategorySelect}
                  transactionType="expense"
                  onCategoriesChanged={() => void reloadCategories()}
                  showBudgetGroup
                />
                {selectedBudgetGroup ? (
                  <p className="mt-1 text-[11px] text-neutral-400">
                    Needs or Wants comes from the subcategory (
                    {selectedBudgetGroup === 'wants' ? 'Wants' : 'Needs'}).
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-neutral-400">
                    Pick a subcategory. Parent category becomes the bank
                    mirror automatically.
                  </p>
                )}
              </div>
            ) : isCategoryLinkedSinking ? (
              <div className="rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700">
                <span className="text-neutral-800 dark:text-neutral-100">
                  {editingBucket?.icon} {editingBucket?.name}
                </span>
                {linkedCategory?.parent_id ? (
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    Subcategory
                    {categoriesById.get(linkedCategory.parent_id)
                      ? ` · ${categoriesById.get(linkedCategory.parent_id)?.name}`
                      : ''}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    Bank mirror (parent category)
                  </p>
                )}
                {selectedBudgetGroup ? (
                  <span className="mt-1 inline-block">
                    <BudgetGroupBadge group={selectedBudgetGroup} />
                  </span>
                ) : null}
              </div>
            ) : null}

            {isEditingEmergency ? (
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Target amount
                </span>
                <input
                  ref={targetRef}
                  type="text"
                  inputMode="numeric"
                  disabled
                  readOnly
                  value={emergencyTargetDisplay}
                  aria-label="Target amount (auto-calculated)"
                  className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500 opacity-80 dark:bg-neutral-700 dark:text-neutral-400"
                />
                <span className="mt-1 block text-[11px] text-neutral-400">
                  Auto-calculated from planned needs × emergency fund target
                  in Money Plan ({efMultiplier}×).
                </span>
              </label>
            ) : !hideTargetField ? (
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Target amount
                  {editingHasChildren ? ' (optional group goal)' : ''}
                </span>
                <input
                  ref={targetRef}
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="next"
                  placeholder="0"
                  value={
                    targetDigits ? formatNumber(Number(targetDigits)) : ''
                  }
                  onChange={(e) =>
                    setTargetDigits(e.target.value.replace(/\D/g, ''))
                  }
                  onKeyDown={handleTargetKeyDown}
                  className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
                />
              </label>
            ) : null}

            {!editingHasChildren ? (
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Opening balance (optional)
                </span>
                <input
                  ref={openingRef}
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="done"
                  placeholder="0"
                  value={
                    openingDigits ? formatNumber(Number(openingDigits)) : ''
                  }
                  onChange={(e) =>
                    setOpeningDigits(e.target.value.replace(/\D/g, ''))
                  }
                  onKeyDown={handleOpeningKeyDown}
                  className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
                />
              </label>
            ) : (
              <p className="text-[11px] text-neutral-400">
                Opening balance lives on children. Parent balance is the sum
                of child balances.
              </p>
            )}

            {editingBucket && (
              <p className="text-[11px] text-neutral-400">
                {BUCKET_KIND_LABELS[editingBucket.kind]}
                {editingBucket.is_system ? ' · system' : ''}
                {' · '}
                Balance {formatRupiah(editingBucket.balance)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void (editingId ? handleUpdate() : handleAdd())}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-md active:bg-emerald-600 disabled:opacity-60"
          >
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
          </button>

          {editingBucket && !editingBucket.is_system ? (
            <button
              type="button"
              onClick={() => setDeleteTarget(editingBucket)}
              disabled={saving}
              className="w-full rounded-xl bg-red-100 py-3 text-sm font-semibold text-red-700 active:bg-red-200 disabled:opacity-60 dark:bg-red-900/50 dark:text-red-200 dark:active:bg-red-900"
            >
              Delete
            </button>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete bucket?"
        message={
          deleteTarget
            ? deleteChildCount > 0
              ? `“${deleteTarget.name}” and its ${deleteChildCount} child bucket${deleteChildCount === 1 ? '' : 's'} will be removed from pickers. Balances and history stay.`
              : `“${deleteTarget.name}” will be removed from pickers. Balances and history stay.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleting}
        onCancel={() => {
          if (deleting) return
          setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function BucketTreeRows({
  node,
  openSwipeId,
  setOpenSwipeId,
  highlightId,
  highlightRef,
  emergencyAutoTarget,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  node: BucketTreeNode
  openSwipeId: string | null
  setOpenSwipeId: (id: string | null) => void
  highlightId: string | null
  highlightRef: MutableRefObject<HTMLDivElement | null>
  emergencyAutoTarget: number
  expanded: boolean
  onToggleExpand: () => void
  onEdit: (b: BucketWithBalance) => void
  onDelete: (b: BucketWithBalance) => void
}) {
  const hasChildren = node.children.length > 0
  return (
    <div className="space-y-2">
      <BucketListRow
        bucket={node.bucket}
        indent={0}
        childCount={node.children.length}
        openSwipeId={openSwipeId}
        setOpenSwipeId={setOpenSwipeId}
        highlightId={highlightId}
        highlightRef={highlightRef}
        emergencyAutoTarget={emergencyAutoTarget}
        expandable={hasChildren}
        expanded={expanded}
        onToggleExpand={hasChildren ? onToggleExpand : undefined}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      {hasChildren && expanded
        ? node.children.map((child) => (
            <div key={child.id} className="pl-5">
              <BucketListRow
                bucket={child}
                indent={1}
                childCount={0}
                openSwipeId={openSwipeId}
                setOpenSwipeId={setOpenSwipeId}
                highlightId={highlightId}
                highlightRef={highlightRef}
                emergencyAutoTarget={emergencyAutoTarget}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          ))
        : null}
    </div>
  )
}

function BucketListRow({
  bucket,
  indent,
  childCount,
  openSwipeId,
  setOpenSwipeId,
  highlightId,
  highlightRef,
  emergencyAutoTarget,
  expandable = false,
  expanded = false,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  bucket: BucketWithBalance
  indent: number
  childCount: number
  openSwipeId: string | null
  setOpenSwipeId: (id: string | null) => void
  highlightId: string | null
  highlightRef: MutableRefObject<HTMLDivElement | null>
  emergencyAutoTarget: number
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  onEdit: (b: BucketWithBalance) => void
  onDelete: (b: BucketWithBalance) => void
}) {
  const isHighlighted = highlightId === bucket.id
  const isChild = indent > 0
  const surfaceClassName = isChild
    ? 'bg-neutral-100 dark:bg-neutral-700/70'
    : 'bg-white dark:bg-neutral-800'
  const row = (
    <BucketRowContent
      bucket={bucket}
      childCount={childCount}
      expandable={expandable}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
      displayTarget={
        bucket.kind === 'emergency' ? emergencyAutoTarget : undefined
      }
    />
  )

  if (!bucket.is_system) {
    return (
      <SwipeDeleteRow
        key={bucket.id}
        open={openSwipeId === bucket.id}
        onOpenChange={(open) => setOpenSwipeId(open ? bucket.id : null)}
        onDelete={() => onDelete(bucket)}
        contentRef={isHighlighted ? highlightRef : undefined}
        highlighted={isHighlighted}
        surfaceClassName={surfaceClassName}
        onContentClick={() => onEdit(bucket)}
      >
        {row}
      </SwipeDeleteRow>
    )
  }

  return (
    <div
      key={bucket.id}
      role="button"
      tabIndex={0}
      ref={isHighlighted ? highlightRef : undefined}
      onClick={() => onEdit(bucket)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit(bucket)
        }
      }}
      className={`flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left shadow-sm ${
        isHighlighted ? 'tx-row-highlight' : surfaceClassName
      }`}
    >
      {row}
    </div>
  )
}

function BucketRowContent({
  bucket,
  displayTarget,
  childCount = 0,
  expandable = false,
  expanded = false,
  onToggleExpand,
}: {
  bucket: BucketWithBalance
  displayTarget?: number
  childCount?: number
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
}) {
  const group =
    bucket.kind === 'sinking' &&
    (bucket.budget_group === 'needs' || bucket.budget_group === 'wants')
      ? bucket.budget_group
      : null
  const target =
    bucket.kind === 'investment' || bucket.kind === 'checking'
      ? null
      : displayTarget != null
        ? displayTarget
        : bucket.target_amount != null
          ? bucket.target_amount
          : null
  return (
    <>
      {expandable && onToggleExpand ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          className="-ml-1 shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          <CollapseChevron expanded={expanded} />
        </button>
      ) : null}
      <span className="text-xl leading-none" aria-hidden>
        {bucket.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {bucket.name}
            {childCount > 0 ? (
              <span className="ml-1 font-normal text-neutral-400">
                ({childCount})
              </span>
            ) : null}
          </p>
          <p className="shrink-0 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            {formatRupiah(bucket.balance)}
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-neutral-400">
          <span>{BUCKET_KIND_LABELS[bucket.kind]}</span>
          {group ? <BudgetGroupBadge group={group} /> : null}
          {bucket.is_system ? <span>· system</span> : null}
          {target != null && target > 0 ? (
            <span>· target {formatRupiah(target)}</span>
          ) : null}
        </p>
      </div>
    </>
  )
}
