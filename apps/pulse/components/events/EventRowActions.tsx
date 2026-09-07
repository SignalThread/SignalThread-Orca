import type { ReactNode } from 'react'
import type { EventRowActions as EventRowActionsModel } from '@/lib/event-row-actions'
import { EVENT_ROW_ACTION_GAP_CLASS, EventRowActionButton } from '@/components/events/EventRowActionControl'

/** Shared action-zone layout for every Event Workspace operational row. */
export function EventRowActions({
  actions,
  primary,
  children,
  onSecondary,
  overflow,
}: {
  actions: EventRowActionsModel
  primary?: ReactNode
  children?: ReactNode
  onSecondary: () => void
  overflow: ReactNode
}) {
  return <div className={`ml-auto grid shrink-0 grid-cols-[auto_auto] items-center ${EVENT_ROW_ACTION_GAP_CLASS} text-right text-xs font-semibold`}>
    <div className="flex min-w-0 items-center justify-end">{children}</div>
    <div className={`flex items-center justify-end ${EVENT_ROW_ACTION_GAP_CLASS}`}>
      {primary}
      <EventRowActionButton onClick={onSecondary}>{actions.secondary.label}</EventRowActionButton>
      {overflow}
    </div>
  </div>
}
