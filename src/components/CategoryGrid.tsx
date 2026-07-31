import type { Category } from '../lib/types'

interface CategoryGridProps {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function CategoryGrid({
  categories,
  selectedId,
  onSelect,
}: CategoryGridProps) {
  if (categories.length === 0) {
    return (
      <p className="text-center text-sm text-neutral-500">
        Belum ada kategori. Tambahkan lewat menu Pengaturan.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {categories.map((category) => {
        const active = category.id === selectedId
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`flex flex-col items-center gap-1 rounded-xl px-1 py-3 text-center transition-colors ${
              active
                ? 'bg-emerald-500 text-white shadow-md'
                : 'bg-white text-neutral-700 shadow-sm dark:bg-neutral-800 dark:text-neutral-200'
            }`}
          >
            <span className="text-2xl">{category.icon}</span>
            <span className="text-[11px] leading-tight font-medium">
              {category.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
