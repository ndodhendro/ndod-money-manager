import { useOverlayBack } from '../hooks/useBackButton'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /**
   * Optional left-button action distinct from dismiss (backdrop / Back).
   * When set, left button calls onAlternate; backdrop still calls onCancel.
   */
  alternateLabel?: string
  onAlternate?: () => void
  /** Shown on the confirm button while busy. Defaults to "Deleting…". */
  busyLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  alternateLabel,
  onAlternate,
  busyLabel = 'Deleting…',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useOverlayBack(open, () => {
    if (busy) return false
    onCancel()
    return true
  })

  if (!open) return null

  const leftLabel = alternateLabel ?? cancelLabel
  const leftAction =
    alternateLabel && onAlternate ? onAlternate : onCancel

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        disabled={busy}
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900">
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-desc"
          className="mt-2 text-sm text-neutral-500 dark:text-neutral-400"
        >
          {message}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={leftAction}
            className="rounded-xl bg-neutral-100 py-3 text-sm font-semibold text-neutral-700 active:bg-neutral-200 disabled:opacity-60 dark:bg-neutral-800 dark:text-neutral-200 dark:active:bg-neutral-700"
          >
            {leftLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-xl py-3 text-sm font-semibold disabled:opacity-60 ${
              danger
                ? 'bg-red-50 text-red-600 active:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:active:bg-red-900'
                : 'bg-emerald-500 text-white active:bg-emerald-600'
            }`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
