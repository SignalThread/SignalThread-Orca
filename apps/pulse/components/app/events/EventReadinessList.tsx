import type { ReactNode } from 'react'
import { EventRowActionButton } from '@/components/events/EventRowActionControl'

/**
 * Event-only readiness checklist. Drives the Setup & Operations / Launch
 * Readiness list in the Event Workspace Overview and Operations tabs. Each item
 * reflects real derived state (complete vs. needs action) and may expose a
 * single labeled next-step action.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
export interface EventReadinessItem {
  id: string
  label: ReactNode
  description?: ReactNode
  complete: boolean
  statusLabel?: string
  statusTone?: 'ready' | 'attention' | 'progress' | 'neutral'
  /** Labeled navigation or next-step action for this readiness row. */
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

function CheckMark({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 dark:border-amber-500/60"
    />
  )
}

interface EventReadinessListProps {
  items: EventReadinessItem[]
  className?: string
}

export function EventReadinessList({ items, className = '' }: EventReadinessListProps) {
  return (
    <ul className={`divide-y divide-zinc-200 dark:divide-zinc-800 ${className}`}>
      {items.map((item) => (
        <li key={item.id} className="grid gap-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <CheckMark complete={item.complete} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={`text-sm font-semibold ${
                    item.complete
                      ? 'text-zinc-700 dark:text-zinc-200'
                      : 'text-zinc-900 dark:text-zinc-50'
                  }`}
                >
                  {item.label}
                </p>
                {item.statusLabel && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${readinessToneClass(item.statusTone ?? (item.complete ? 'ready' : 'attention'))}`}>
                    {item.statusLabel}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{item.description}</p>
              )}
            </div>
          </div>
          {item.actionLabel && (item.actionHref || item.onAction) && <EventRowActionButton href={item.actionHref} onClick={item.onAction} variant="primary" className="w-full">{item.actionLabel}</EventRowActionButton>}
        </li>
      ))}
    </ul>
  )
}

function readinessToneClass(tone: NonNullable<EventReadinessItem['statusTone']>) {
  if (tone === 'ready') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
  if (tone === 'progress') return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
  if (tone === 'neutral') return 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
}
