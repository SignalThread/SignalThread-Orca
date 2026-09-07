import type { ReactNode } from 'react'

/**
 * Event-only filter bar: a search field plus filter chips. Used by the Event
 * Areas tab and the Command Center to filter dense lists (by area type, "Needs
 * survey", survey, etc.). Controlled — the parent owns search text and active
 * chip state so the same bar can drive URL params or local state.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
export interface EventFilterChip {
  key: string
  label: ReactNode
  /** Real count badge. Omit when not meaningful. */
  count?: number
}

interface EventFilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  chips?: EventFilterChip[]
  /** The currently active chip key(s). */
  activeChipKey?: string
  onChipSelect?: (key: string) => void
  /** Trailing slot for actions like "Add Area / Session". */
  trailing?: ReactNode
  className?: string
}

export function EventFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  chips = [],
  activeChipKey,
  onChipSelect,
  trailing,
  className = '',
}: EventFilterBarProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a1 1 0 01-1.414 1.414l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-[11px] border border-[#e5e8ef] bg-white py-1.5 pl-9 pr-3 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => {
            const isActive = chip.key === activeChipKey
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onChipSelect?.(chip.key)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${
                  isActive
                    ? 'border-[#0B1638] bg-[#0B1638] text-white'
                    : 'border-[#e5e8ef] bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {chip.label}
                {typeof chip.count === 'number' && (
                  <span
                    className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {chip.count.toLocaleString()}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
