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
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import { ActionEmoji } from '../lib/actionEmoji'
import { SwipeDeleteRow } from './SwipeDeleteRow'

interface HistoryDaySortableListProps {
  ids: string[]
  onReorder: (orderedIds: string[]) => void
  children: ReactNode
}

export function HistoryDaySortableList({
  ids,
  onReorder,
  children,
}: HistoryDaySortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 400, tolerance: 8 },
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(ids, oldIndex, newIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">{children}</div>
      </SortableContext>
    </DndContext>
  )
}

interface HistoryTxSwipeRowProps {
  id: string
  sortable: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  contentRef?: Ref<HTMLDivElement>
  highlighted?: boolean
  completeLater?: boolean
  onContentClick: () => void
  children: ReactNode
}

export function HistoryTxSwipeRow({
  id,
  sortable,
  open,
  onOpenChange,
  onDelete,
  contentRef,
  highlighted = false,
  completeLater = false,
  onContentClick,
  children,
}: HistoryTxSwipeRowProps) {
  if (!sortable) {
    return (
      <SwipeDeleteRow
        open={open}
        onOpenChange={onOpenChange}
        onDelete={onDelete}
        contentRef={contentRef}
        highlighted={highlighted}
        completeLater={completeLater}
        onContentClick={onContentClick}
      >
        {children}
      </SwipeDeleteRow>
    )
  }

  return (
    <SortableHistoryTxRow
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      onDelete={onDelete}
      contentRef={contentRef}
      highlighted={highlighted}
      completeLater={completeLater}
      onContentClick={onContentClick}
    >
      {children}
    </SortableHistoryTxRow>
  )
}

function SortableHistoryTxRow({
  id,
  open,
  onOpenChange,
  onDelete,
  contentRef,
  highlighted = false,
  completeLater = false,
  onContentClick,
  children,
}: Omit<HistoryTxSwipeRowProps, 'sortable'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'shadow-lg ring-1 ring-emerald-300' : undefined}
    >
      <SwipeDeleteRow
        open={open}
        onOpenChange={onOpenChange}
        onDelete={onDelete}
        contentRef={contentRef}
        highlighted={highlighted}
        completeLater={completeLater}
        onContentClick={onContentClick}
        swipeLocked={isDragging}
        leading={
          <button
            type="button"
            className="touch-none rounded-lg px-1 py-1 text-base leading-none text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            aria-label="Drag to reorder"
            title="Drag"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            {ActionEmoji.drag}
          </button>
        }
      >
        {children}
      </SwipeDeleteRow>
    </div>
  )
}
