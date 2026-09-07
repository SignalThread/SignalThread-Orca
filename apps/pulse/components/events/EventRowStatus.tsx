import React from 'react'
import { StatusPill, STATUS_PILL_CONTROL_CLASS } from '@/components/ui/StatusPill'
import type { EventRowStatusSummary } from '@/lib/event-row-actions'

/**
 * Shared Event Workspace status display. The resolver has already applied the
 * inventory, remedy suppression, severity ordering, and variant cap; this
 * component only renders that canonical result.
 */
export function EventRowStatus({ statuses }: { statuses: EventRowStatusSummary }) {
  // Keep the no-+1 rule true even if a legacy caller provides a stale summary.
  const visibleStatuses = statuses.additionalCount === 1
    ? [...statuses.visible, ...statuses.hidden]
    : statuses.visible
  const hasDisclosure = statuses.additionalCount > 1

  if (visibleStatuses.length === 0) return null

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {visibleStatuses.map((status) => <StatusPill key={status.id} label={status.label} tone={status.tone} />)}
      {hasDisclosure && (
        <details className="relative inline-block">
          <summary
            aria-label={`Show ${statuses.additionalCount} additional status${statuses.additionalCount === 1 ? '' : 'es'}`}
            className={`inline-flex min-w-8 cursor-pointer list-none items-center justify-center ${STATUS_PILL_CONTROL_CLASS} border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`}
          >
            +{statuses.additionalCount}
          </summary>
          <div role="tooltip" className="absolute right-0 z-20 mt-1 flex min-w-max flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {statuses.hidden.map((status) => <StatusPill key={status.id} label={status.label} tone={status.tone} />)}
          </div>
        </details>
      )}
    </div>
  )
}
