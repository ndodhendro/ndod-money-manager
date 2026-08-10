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
import { createBucket, deleteBucket, updateBucket } from '../lib/bucketsApi'
import { groupBucketsByKind } from '../lib/bucketsGroup'
import { areAllCollapseOpen } from '../lib/collapseState'
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
  type BucketWithBalance,
} from '../lib/types'
import { BudgetGroupBadge } from './BudgetGroupBadge'
import { CollapsibleDayGroup } from './CollapsibleDayGroup'
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
  /** Parent can call this to leave the form and return to the list. */
  backToListRef?: MutableRefObject<(() => void) | null>
  /** When set by the route, keep the panel form in sync with the URL. */
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
  const { byId: categoriesById } = useCategories('expense', {
    includeInactive: true,
  })

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [targetDigits, setTargetDigits] = useState('')
  const [openingDigits, setOpeningDigits] = useState('')
  const [budgetGroup, setBudgetGroup] = useState<'needs' | 'wants'>('needs')
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
  const [kindGroupsVersion, setKindGroupsVersion] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [bills, setBills] = useState<RecurringBill[]>([])
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const hydratedEditIdRef = useRef<string | null>(null)
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange

  const nameRef = useRef<HTMLInputElement>(null)
  const iconRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<HTMLInputElement>(null)
  const openingRef = useRef<HTMLInputElement>(null)

  const groupedBuckets = useMemo(() => groupBucketsByKind(buckets), [buckets])
  const kindPersistKeys = useMemo(
    () => groupedBuckets.map(([kind]) => `settings:buckets:kind:${kind}`),
    [groupedBuckets],
  )

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

  // Keep the disabled emergency target field in sync with Money Plan / estimates.
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
    if (kindGroupsVersion > 0) return
    setKindGroupsExpanded(areAllCollapseOpen(kindPersistKeys, true))
  }, [kindPersistKeys, kindGroupsVersion])

  useEffect(() => {
    if (!highlightId) return
    const t = window.setTimeout(() => setHighlightId(null), 1800)
    return () => window.clearTimeout(t)
  }, [highlightId])

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
    setName('')
    setIcon('🎯')
    setTargetDigits('')
    setOpeningDigits('')
    setBudgetGroup('needs')
    setEditingId(null)
    hydratedEditIdRef.current = null
  }

  function startEdit(b: BucketWithBalance) {
    setEditingId(b.id)
    hydratedEditIdRef.current = b.id
    setName(b.name)
    setIcon(b.icon)
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
    setBudgetGroup(
      b.budget_group === 'wants' || b.budget_group === 'needs'
        ? b.budget_group
        : 'needs',
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

  async function handleAdd() {
    if (!icon.trim()) {
      showAppToast('Enter an icon')
      iconRef.current?.focus()
      return
    }
    if (!name.trim()) {
      showAppToast('Name is required')
      nameRef.current?.focus()
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
      const created = await createBucket({
        name: name.trim(),
        kind: 'sinking',
        icon: icon || '🎯',
        target_amount: target,
        opening_balance: openingDigits ? Number(openingDigits) : 0,
        budget_group: budgetGroup,
      })
      resetForm()
      setKindGroupsExpanded(true)
      setKindGroupsVersion((v) => v + 1)
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
    if (!icon.trim()) {
      showAppToast('Enter an icon')
      iconRef.current?.focus()
      return
    }
    if (!name.trim()) {
      showAppToast('Name is required')
      nameRef.current?.focus()
      return
    }
    const updatedId = editingId
    const current = buckets.find((b) => b.id === updatedId)
    const skipTarget =
      current?.kind === 'emergency' || current?.kind === 'investment'
    if (!skipTarget) {
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
        name: name.trim(),
        icon: icon || '🏦',
        ...(skipTarget ? {} : { target_amount: Number(targetDigits) }),
        opening_balance: openingDigits ? Number(openingDigits) : 0,
        ...(current?.kind === 'sinking' ? { budget_group: budgetGroup } : {}),
      })
      resetForm()
      setKindGroupsExpanded(true)
      setKindGroupsVersion((v) => v + 1)
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

  function handleNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const editing =
        editingId ? buckets.find((b) => b.id === editingId) : null
      if (
        editing?.kind === 'emergency' ||
        editing?.kind === 'investment'
      ) {
        openingRef.current?.focus()
      } else {
        targetRef.current?.focus()
      }
    }
  }

  function handleTargetKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      openingRef.current?.focus()
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

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-neutral-400">Loading…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {view === 'list' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={openAddForm}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white active:bg-emerald-600"
            >
              {ActionEmoji.add} Add New
            </button>
          </div>

          {!loading && buckets.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
              No buckets yet. Tap Add New to create one.
            </p>
          ) : (
            <GroupedListFrame
              label="Buckets List"
              expanded={kindGroupsExpanded}
              onToggle={(expanded) => {
                setKindGroupsExpanded(expanded)
                setKindGroupsVersion((v) => v + 1)
              }}
            >
              <div className="space-y-5">
                {groupedBuckets.map(([kind, items]) => (
                  <CollapsibleDayGroup
                    key={kind}
                    title={BUCKET_KIND_LABELS[kind]}
                    persistKey={`settings:buckets:kind:${kind}`}
                    forceOpen={
                      kindGroupsVersion > 0 ? kindGroupsExpanded : undefined
                    }
                    forceVersion={kindGroupsVersion}
                  >
                    <div className="space-y-2">
                      {items.map((b) => {
                        const isHighlighted = highlightId === b.id
                        const row = (
                          <BucketRowContent
                            bucket={b}
                            displayTarget={
                              b.kind === 'emergency'
                                ? emergencyAutoTarget
                                : undefined
                            }
                          />
                        )

                        if (!b.is_system) {
                          return (
                            <SwipeDeleteRow
                              key={b.id}
                              open={openSwipeId === b.id}
                              onOpenChange={(open) =>
                                setOpenSwipeId(open ? b.id : null)
                              }
                              onDelete={() => {
                                setOpenSwipeId(b.id)
                                setDeleteTarget(b)
                              }}
                              contentRef={
                                isHighlighted ? highlightRef : undefined
                              }
                              highlighted={isHighlighted}
                              onContentClick={() => openEditForm(b)}
                            >
                              {row}
                            </SwipeDeleteRow>
                          )
                        }

                        return (
                          <div
                            key={b.id}
                            role="button"
                            tabIndex={0}
                            ref={isHighlighted ? highlightRef : undefined}
                            onClick={() => openEditForm(b)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openEditForm(b)
                              }
                            }}
                            className={`flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left shadow-sm ${
                              isHighlighted
                                ? 'tx-row-highlight'
                                : 'bg-white dark:bg-neutral-800'
                            }`}
                          >
                            {row}
                          </div>
                        )
                      })}
                    </div>
                  </CollapsibleDayGroup>
                ))}
              </div>
            </GroupedListFrame>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              {editingId ? 'Edit bucket' : 'Add sinking fund'}
            </p>
            <div className="flex gap-2">
              <input
                ref={iconRef}
                value={icon}
                onChange={(e) => setIcon(e.target.value.slice(0, 4))}
                className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-lg dark:bg-neutral-700"
                aria-label="Icon"
                maxLength={4}
              />
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder="Name"
                enterKeyHint="next"
                className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
              />
            </div>
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
            {(!editingBucket || editingBucket.kind === 'sinking') && (
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Needs or Wants
                </span>
                <select
                  value={budgetGroup}
                  onChange={(e) =>
                    setBudgetGroup(e.target.value as 'needs' | 'wants')
                  }
                  aria-label="Needs or wants"
                  className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
                >
                  <option value="needs">Needs</option>
                  <option value="wants">Wants</option>
                </select>
                <span className="mt-1 block text-[11px] text-neutral-400">
                  Transfers into this fund count toward planned Needs or
                  committed Wants.
                </span>
              </label>
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
            ? `“${deleteTarget.name}” will be removed from pickers. Balances and history stay.`
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

function BucketRowContent({
  bucket,
  displayTarget,
}: {
  bucket: BucketWithBalance
  /** When set (Emergency Fund), overrides stored target_amount. */
  displayTarget?: number
}) {
  const group =
    bucket.kind === 'sinking' &&
    (bucket.budget_group === 'needs' || bucket.budget_group === 'wants')
      ? bucket.budget_group
      : null
  const target =
    bucket.kind === 'investment'
      ? null
      : displayTarget != null
        ? displayTarget
        : bucket.target_amount != null
          ? bucket.target_amount
          : null
  return (
    <>
      <span className="text-xl leading-none" aria-hidden>
        {bucket.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {bucket.name}
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
