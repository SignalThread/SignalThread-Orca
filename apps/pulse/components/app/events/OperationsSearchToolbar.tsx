import type { ReactNode } from 'react'

interface OperationsSearchToolbarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  filters: ReactNode
  entityLabel: string
  selectedCount: number
  hasResults: boolean
  allSelected: boolean
  onToggleAll: (checked: boolean) => void
  className?: string
}

/** Shared search + Filters toolbar for the Operations entity lists. */
export function OperationsSearchToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  entityLabel,
  selectedCount,
  hasResults,
  allSelected,
  onToggleAll,
  className = '',
}: OperationsSearchToolbarProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{searchPlaceholder}</span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a1 1 0 01-1.414 1.414l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
        </span>
        <input type="search" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} className="h-10 w-full rounded-[11px] border border-[#e5e8ef] bg-white py-1.5 pl-9 pr-3 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      </label>
      <details className="relative shrink-0">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-[11px] border border-[#e5e8ef] bg-white px-4 text-[13px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50">Filters</summary>
        <div className="absolute right-0 z-20 mt-2 w-[min(640px,calc(100vw-48px))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">{filters}</div>
      </details>
      </div>
      {hasResults && <div className="flex min-h-12 items-center justify-between gap-2 border-y border-slate-100 px-1 py-3 text-sm dark:border-zinc-800">
        <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-zinc-200">
          <input type="checkbox" aria-label={`Select all ${entityLabel}`} checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />
          {`Select all ${entityLabel}`}
        </label>
        <span className="text-xs text-slate-500">{selectedCount} selected</span>
      </div>}
    </div>
  )
}
