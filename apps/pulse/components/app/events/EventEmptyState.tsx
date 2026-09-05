import type { ReactNode } from 'react'
import { EventPrimaryActions, type EventAction } from './EventPrimaryActions'

/**
 * Event-only empty state. A reusable, helpful empty/zero state for the Events
 * tiers (no events, no surveys, no responses, no active event, no urgent
 * issues, no sponsor signals). Never a blank box — always explains the state
 * and, where useful, offers a labeled next action.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
interface EventEmptyStateProps {
  title: ReactNode
  description?: ReactNode
  /** Decorative leading icon node. */
  icon?: ReactNode
  actions?: EventAction[]
  /** Compact variant for inline/section empties vs. full-page empties. */
  size?: 'sm' | 'md'
  className?: string
}

export function EventEmptyState({
  title,
  description,
  icon,
  actions = [],
  size = 'md',
  className = '',
}: EventEmptyStateProps) {
  const pad = size === 'sm' ? 'px-3 py-5' : 'px-4 py-8'
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 text-center dark:border-zinc-700 dark:bg-zinc-900/40 ${pad} ${className}`}
    >
      {icon && (
        <div className="mb-2.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      )}
      {actions.length > 0 && (
        <div className="mt-4">
          <EventPrimaryActions actions={actions} align="start" />
        </div>
      )}
    </div>
  )
}
