import { useState } from 'react'
import { useBuckets } from '../hooks/useBuckets'
import { ActionEmoji } from '../lib/actionEmoji'
import { showAppToast } from '../lib/appToast'
import { createBucket, updateBucket } from '../lib/bucketsApi'
import { formatNumber, formatRupiah } from '../lib/format'
import { BUCKET_KIND_LABELS, type BucketWithBalance } from '../lib/types'

export function BucketManagePanel({ onChanged }: { onChanged?: () => void }) {
  const { buckets, loading, error, reload } = useBuckets({
    includeInactive: true,
  })
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [targetDigits, setTargetDigits] = useState('')
  const [openingDigits, setOpeningDigits] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editTargetDigits, setEditTargetDigits] = useState('')
  const [editOpeningDigits, setEditOpeningDigits] = useState('')

  async function refresh() {
    await reload()
    onChanged?.()
  }

  async function handleAdd() {
    if (!name.trim()) {
      showAppToast('Name is required')
      return
    }
    setSaving(true)
    try {
      await createBucket({
        name: name.trim(),
        kind: 'sinking',
        icon: icon || '🎯',
        target_amount: targetDigits ? Number(targetDigits) : null,
        opening_balance: openingDigits ? Number(openingDigits) : 0,
      })
      setName('')
      setIcon('🎯')
      setTargetDigits('')
      setOpeningDigits('')
      showAppToast('Bucket added')
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(b: BucketWithBalance) {
    setEditingId(b.id)
    setEditName(b.name)
    setEditIcon(b.icon)
    setEditTargetDigits(
      b.target_amount != null ? String(Math.round(b.target_amount)) : '',
    )
    setEditOpeningDigits(
      b.opening_balance > 0 ? String(Math.round(b.opening_balance)) : '',
    )
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    try {
      await updateBucket(editingId, {
        name: editName.trim(),
        icon: editIcon || '🏦',
        target_amount: editTargetDigits ? Number(editTargetDigits) : null,
        opening_balance: editOpeningDigits ? Number(editOpeningDigits) : 0,
      })
      setEditingId(null)
      showAppToast('Bucket updated')
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(b: BucketWithBalance) {
    if (b.is_system && b.is_active) {
      showAppToast('System buckets stay active')
      return
    }
    try {
      await updateBucket(b.id, { is_active: !b.is_active })
      await refresh()
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  return (
    <div className="space-y-3">
      {loading && (
        <p className="text-sm text-neutral-400">Loading buckets…</p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
        <p className="text-xs font-medium text-neutral-500">Add sinking fund</p>
        <div className="flex gap-2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-sm dark:bg-neutral-700"
            aria-label="Icon"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
          />
        </div>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Target amount (optional)"
          value={targetDigits ? formatNumber(Number(targetDigits)) : ''}
          onChange={(e) =>
            setTargetDigits(e.target.value.replace(/\D/g, ''))
          }
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="Opening balance (optional)"
          value={openingDigits ? formatNumber(Number(openingDigits)) : ''}
          onChange={(e) =>
            setOpeningDigits(e.target.value.replace(/\D/g, ''))
          }
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700 dark:text-neutral-100"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving}
          className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : `Add ${ActionEmoji.add}`}
        </button>
      </div>

      <div className="space-y-2">
        {buckets.map((b) => (
          <div
            key={b.id}
            className={`rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-neutral-800 ${
              b.is_active ? '' : 'opacity-50'
            }`}
          >
            {editingId === b.id ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value.slice(0, 4))}
                    className="w-14 rounded-lg bg-neutral-100 px-2 py-2 text-center text-sm dark:bg-neutral-700"
                  />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700"
                  />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Target"
                  value={
                    editTargetDigits
                      ? formatNumber(Number(editTargetDigits))
                      : ''
                  }
                  onChange={(e) =>
                    setEditTargetDigits(e.target.value.replace(/\D/g, ''))
                  }
                  className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Opening balance"
                  value={
                    editOpeningDigits
                      ? formatNumber(Number(editOpeningDigits))
                      : ''
                  }
                  onChange={(e) =>
                    setEditOpeningDigits(e.target.value.replace(/\D/g, ''))
                  }
                  className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white"
                  >
                    {ActionEmoji.save} Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-700"
                  >
                    {ActionEmoji.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="text-xl">{b.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {b.name}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {BUCKET_KIND_LABELS[b.kind]}
                    {b.is_system ? ' · system' : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Balance {formatRupiah(b.balance)}
                    {b.target_amount != null && b.target_amount > 0
                      ? ` / ${formatRupiah(b.target_amount)}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className="rounded-lg bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-700"
                    aria-label="Edit"
                  >
                    {ActionEmoji.edit}
                  </button>
                  {!b.is_system && (
                    <button
                      type="button"
                      onClick={() => void toggleActive(b)}
                      className="rounded-lg bg-neutral-100 px-2 py-1 text-[10px] dark:bg-neutral-700"
                    >
                      {b.is_active ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
