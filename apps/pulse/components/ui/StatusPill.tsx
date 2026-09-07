import React, { type ReactNode } from 'react'

/**
 * Product-wide status language. Statuses communicate only severity or a
 * lifecycle state; filters, categories, and selection controls are not pills.
 */
export type StatusPillTone = 'blocking' | 'attention' | 'lifecycle' | 'healthy'

export interface StatusPresentation {
  label: string
  tone: StatusPillTone
}

const PILL_CLASSES: Record<Exclude<StatusPillTone, 'healthy'>, string> = {
  blocking: 'bg-[#FEF3F2] text-[#B42318]',
  attention: 'bg-[#FEF6E7] text-[#9A5B00]',
  lifecycle: 'bg-[#F1F4F9] text-[#5B6880]',
}

/** Shared Event Workspace status-control dimensions. */
export const STATUS_PILL_CONTROL_CLASS = 'h-8 rounded-md px-2.5'

const DOT_CLASSES: Record<StatusPillTone, string> = {
  blocking: 'bg-[#B42318]',
  attention: 'bg-[#9A5B00]',
  lifecycle: 'bg-[#5B6880]',
  healthy: 'bg-emerald-500',
}

/**
 * Resolves several possible states into the single status allowed on an object
 * summary. Blocking always wins, followed by attention, then lifecycle.
 */
export function resolveStatusPresentation(
  states: Array<StatusPresentation | null | undefined>,
): StatusPresentation | null {
  const priority: Record<StatusPillTone, number> = {
    blocking: 3,
    attention: 2,
    lifecycle: 1,
    healthy: 0,
  }
  return states.reduce<StatusPresentation | null>((mostSevere, state) => {
    if (!state) return mostSevere
    if (!mostSevere || priority[state.tone] > priority[mostSevere.tone]) return state
    return mostSevere
  }, null)
}

interface StatusPillProps {
  label: ReactNode
  tone: StatusPillTone
  /** A quiet healthy state is intentionally not rendered as a pill. */
  dot?: boolean
  className?: string
}

export function StatusPill({ label, tone, dot = false, className = '' }: StatusPillProps) {
  if (tone === 'healthy') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#5B6880] ${className}`}>
        {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES.healthy}`} />}
        {label}
      </span>
    )
  }

  return (
    <span className={`inline-flex ${STATUS_PILL_CONTROL_CLASS} items-center gap-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] ${PILL_CLASSES[tone]} ${className}`}>
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />}
      {label}
    </span>
  )
}
