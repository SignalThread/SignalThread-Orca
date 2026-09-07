import type { ReactNode } from 'react'
import { EventStatusPill } from './EventStatusPill'
import { EventPrimaryActions, type EventAction } from './EventPrimaryActions'

/**
 * Event-only hero header. Used as the lead object on Events Home (active event
 * hero) and at the top of the Event Workspace. Gives the event clear hierarchy:
 * eyebrow/breadcrumb, status, title, contextual meta (dates, venue), and
 * obvious labeled primary actions.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
export interface EventHeroMeta {
  /** e.g. a calendar or pin icon node (decorative). */
  icon?: ReactNode
  label: ReactNode
}

interface EventHeroHeaderProps {
  /** Small overline above the title (breadcrumb, account/workspace context). */
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Domain status word resolved by EventStatusPill (e.g. "Live now"). */
  status?: string
  /** Contextual meta chips: dates, venue, workspace. */
  meta?: EventHeroMeta[]
  actions?: EventAction[]
  destructiveActions?: EventAction[]
  className?: string
}

export function EventHeroHeader({
  eyebrow,
  title,
  description,
  status,
  meta = [],
  actions = [],
  destructiveActions = [],
  className = '',
}: EventHeroHeaderProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7 ${className}`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-2 text-xs font-medium text-slate-400 dark:text-zinc-500">{eyebrow}</div>
          )}
          {/* Top metadata row: status + contextual chips (dates, venue) */}
          {(status || meta.length > 0) && (
            <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500 dark:text-zinc-400">
              {status && <EventStatusPill status={status} size="sm" />}
              {meta.map((item, index) => (
                <span key={index} className="inline-flex items-center gap-1.5">
                  {item.icon && <span aria-hidden className="inline-flex shrink-0 text-slate-400">{item.icon}</span>}
                  {item.label}
                </span>
              ))}
            </div>
          )}
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50 sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-zinc-300">
              {description}
            </p>
          )}
        </div>
        {(actions.length > 0 || destructiveActions.length > 0) && (
          <div className="shrink-0">
            <EventPrimaryActions actions={actions} destructiveActions={destructiveActions} />
          </div>
        )}
      </div>
    </div>
  )
}
