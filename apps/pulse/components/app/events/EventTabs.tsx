import type { ReactNode } from 'react'

/**
 * Event-only tab navigation for the Event Workspace (Overview, Event Areas,
 * Agenda, Surveys, Operations). Supports real counts and works either controlled
 * (onSelect) or as links (href). Counts are optional — pass `undefined` to omit
 * rather than render a fake zero.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
export interface EventTab {
  key: string
  label: ReactNode
  /** Real count to badge next to the label. Omit when not yet known. */
  count?: number
  href?: string
}

interface EventTabsProps {
  tabs: EventTab[]
  activeKey: string
  onSelect?: (key: string) => void
  className?: string
}

export function EventTabs({ tabs, activeKey, onSelect, className = '' }: EventTabsProps) {
  return (
    <div className={`overflow-x-auto border-b border-[#e8ebf2] ${className}`}>
      <div
        className="inline-flex min-w-max items-center gap-6"
        role="tablist"
        aria-label="Event workspace tabs"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey
          const tabClasses = `event-type-control relative inline-flex items-center gap-1.5 whitespace-nowrap px-0.5 pb-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${
            isActive
              ? 'text-[#0B1220] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#0B1220]'
              : 'text-slate-400 hover:text-[#0B1220]'
          }`

          const inner = (
            <>
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`event-type-pill rounded-full px-1.5 py-0.5 tabular-nums ${
                    isActive
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {tab.count.toLocaleString()}
                </span>
              )}
            </>
          )

          if (tab.href) {
            return (
              <a
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                className={tabClasses}
              >
                {inner}
              </a>
            )
          }

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={tabClasses}
              onClick={() => onSelect?.(tab.key)}
            >
              {inner}
            </button>
          )
        })}
      </div>
    </div>
  )
}
