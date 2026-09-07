import type { ReactNode } from 'react'
import { EventStatusPill } from './EventStatusPill'
import { EventPrimaryActions, type EventAction } from './EventPrimaryActions'

/**
 * Event-only clickable object row. Represents a real object (event, event area,
 * survey) in a list. The whole row is clickable when `href`/`onClick` is set,
 * while inline actions stop propagation so they remain independently usable —
 * satisfying the rule that critical rows are clickable but action buttons stay
 * labeled and separate.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
interface EventObjectRowProps {
  title: ReactNode
  description?: ReactNode
  /** Domain status word resolved by EventStatusPill. */
  status?: string
  /** Small meta chips (category, dates, counts). */
  meta?: ReactNode[]
  /** Leading icon/avatar node. */
  leading?: ReactNode
  /** Makes the row a link. */
  href?: string
  /** Makes the row a button when no href is provided. */
  onClick?: () => void
  /** Inline labeled actions; clicks are isolated from the row navigation. */
  actions?: EventAction[]
  destructiveActions?: EventAction[]
  className?: string
}

export function EventObjectRow({
  title,
  description,
  status,
  meta = [],
  leading,
  href,
  onClick,
  actions = [],
  destructiveActions = [],
  className = '',
}: EventObjectRowProps) {
  const interactive = Boolean(href || onClick)

  const body = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {leading && <div className="mt-0.5 shrink-0 text-zinc-400">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
          {status && <EventStatusPill status={status} size="sm" />}
        </div>
        {description && (
          <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        )}
        {meta.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {meta.map((item, index) => (
              <span key={index} className="inline-flex items-center gap-1">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const hasActions = actions.length > 0 || destructiveActions.length > 0
  const actionsCluster = hasActions ? (
    // Isolate action clicks from the row-level navigation.
    <div
      className="shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      <EventPrimaryActions actions={actions} destructiveActions={destructiveActions} size="sm" align="end" />
    </div>
  ) : null

  const containerClasses = `group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between ${
    interactive
      ? 'hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
      : ''
  } ${className}`

  if (href) {
    return (
      <a href={href} className={containerClasses}>
        {body}
        {actionsCluster}
      </a>
    )
  }

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        }}
        className={containerClasses}
      >
        {body}
        {actionsCluster}
      </div>
    )
  }

  return (
    <div className={containerClasses}>
      {body}
      {actionsCluster}
    </div>
  )
}
