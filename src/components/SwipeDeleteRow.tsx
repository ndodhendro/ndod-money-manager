import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { ActionEmoji } from '../lib/actionEmoji'

const ACTION_WIDTH = 76
const OPEN_THRESHOLD = 36

interface SwipeDeleteRowProps {
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  /** Ref ke konten depan (opsional, untuk highlight scroll). */
  contentRef?: Ref<HTMLDivElement>
  highlighted?: boolean
  /** Persistent gold glow (Complete Later placeholders). */
  completeLater?: boolean
  onContentClick: () => void
  deleteAriaLabel?: string
  /**
   * Trailing controls that slide with the row (e.g. edit).
   * Stay to the left of the revealed delete action.
   */
  trailing?: ReactNode
  /** Override front-face background (default white / dark neutral-800). */
  surfaceClassName?: string
}

export function SwipeDeleteRow({
  children,
  open,
  onOpenChange,
  onDelete,
  contentRef,
  highlighted = false,
  completeLater = false,
  onContentClick,
  deleteAriaLabel = 'Delete',
  trailing,
  surfaceClassName,
}: SwipeDeleteRowProps) {
  const [offset, setOffset] = useState(0)
  const startX = useRef(0)
  const startY = useRef(0)
  const startOffset = useRef(0)
  const dragging = useRef(false)
  const axis = useRef<'none' | 'x' | 'y'>('none')
  const moved = useRef(false)

  useEffect(() => {
    setOffset(open ? -ACTION_WIDTH : 0)
  }, [open])

  // Saat highlight (baru save), pastikan swipe tertutup — jangan tampilkan tong sampah.
  useEffect(() => {
    if (!highlighted) return
    if (open) onOpenChange(false)
    setOffset(0)
  }, [highlighted, open, onOpenChange])

  function clamp(value: number) {
    return Math.max(-ACTION_WIDTH, Math.min(0, value))
  }

  function handleTouchStart(e: ReactTouchEvent) {
    if (highlighted) return
    const t = e.changedTouches[0]
    if (!t) return
    startX.current = t.clientX
    startY.current = t.clientY
    startOffset.current = offset
    dragging.current = true
    axis.current = 'none'
    moved.current = false
  }

  function handleTouchMove(e: ReactTouchEvent) {
    if (!dragging.current || highlighted) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - startX.current
    const dy = t.clientY - startY.current

    if (axis.current === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axis.current !== 'x') return

    // Jangan biarkan swipe bulan di parent ikut bergerak.
    e.stopPropagation()
    moved.current = true
    setOffset(clamp(startOffset.current + dx))
  }

  function handleTouchEnd(e: ReactTouchEvent) {
    if (!dragging.current) return
    dragging.current = false

    if (axis.current === 'x' && !highlighted) {
      e.stopPropagation()
      const shouldOpen = offset <= -OPEN_THRESHOLD
      onOpenChange(shouldOpen)
      setOffset(shouldOpen ? -ACTION_WIDTH : 0)
    }
    axis.current = 'none'
  }

  function handleContentClick() {
    if (moved.current) {
      moved.current = false
      return
    }
    if (open) {
      onOpenChange(false)
      return
    }
    onContentClick()
  }

  const actionVisible = !highlighted && (open || offset < -1)

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${
        !highlighted && completeLater
          ? 'border-2 recurring-variable-highlight'
          : ''
      }`}
    >
      <div
        className={`absolute inset-y-0 right-0 flex w-[76px] transition-opacity duration-150 ${
          actionVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!actionVisible}
      >
        <button
          type="button"
          tabIndex={actionVisible ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex w-full items-center justify-center bg-red-50 text-xl text-red-600 active:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:active:bg-red-900"
          aria-label={deleteAriaLabel}
        >
          {ActionEmoji.delete}
        </button>
      </div>

      <div
        style={{
          transform: `translateX(${highlighted ? 0 : offset}px)`,
          transition: dragging.current ? 'none' : 'transform 180ms ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`relative z-10 flex w-full items-center shadow-sm ${
          highlighted
            ? 'tx-row-highlight'
            : (surfaceClassName ?? 'bg-white dark:bg-neutral-800')
        }`}
      >
        <div
          ref={contentRef}
          role="button"
          tabIndex={0}
          onClick={handleContentClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleContentClick()
            }
          }}
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
        >
          {children}
        </div>
        {trailing != null ? (
          <div
            className="shrink-0 pr-2"
            onClick={(e) => {
              // Keep trailing actions from toggling the row.
              e.stopPropagation()
              if (moved.current) {
                moved.current = false
              }
            }}
          >
            {trailing}
          </div>
        ) : null}
      </div>
    </div>
  )
}
