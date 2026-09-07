import type { ReactNode } from 'react'
import { StatusPill, type StatusPillTone } from '@/components/ui/StatusPill'

/**
 * Event-only status pill. Shared across Events Home, Event Workspace, and the
 * Command Center so event state reads with one consistent visual language.
 *
 * This is an EVENTS-only primitive. It is not used by retail/SMB surfaces and
 * does not change any shared `components/ui` behavior.
 */
export type EventStatusTone =
  | 'live'
  | 'positive'
  | 'neutral'
  | 'attention'
  | 'critical'
  | 'muted'

const EVENT_TONE_TO_PRODUCT_TONE: Record<EventStatusTone, StatusPillTone> = {
  live: 'healthy',
  positive: 'healthy',
  neutral: 'lifecycle',
  attention: 'attention',
  critical: 'blocking',
  muted: 'lifecycle',
}

/**
 * Maps event-domain status words to a tone + default label. Callers may also
 * pass an explicit `tone`/`label` to bypass the token map.
 */
const STATUS_TOKENS: Record<string, { tone: EventStatusTone; label: string; pulse?: boolean }> = {
  live: { tone: 'live', label: 'Live now' },
  live_now: { tone: 'live', label: 'Live now' },
  upcoming: { tone: 'muted', label: 'Upcoming' },
  active: { tone: 'positive', label: 'Active' },
  ready: { tone: 'positive', label: 'Ready' },
  launchable: { tone: 'positive', label: 'Launchable' },
  positive: { tone: 'positive', label: 'Positive' },
  needs_survey: { tone: 'attention', label: 'Needs survey' },
  soon: { tone: 'attention', label: 'Soon' },
  watch: { tone: 'attention', label: 'Watch' },
  immediate: { tone: 'critical', label: 'Immediate' },
  negative: { tone: 'critical', label: 'Negative' },
  draft: { tone: 'muted', label: 'Draft' },
  paused: { tone: 'muted', label: 'Paused' },
  completed: { tone: 'muted', label: 'Wrapped' },
  wrapped: { tone: 'muted', label: 'Wrapped' },
  archived: { tone: 'muted', label: 'Archived' },
}

export function resolveEventStatus(token: string): { tone: EventStatusTone; label: string; pulse?: boolean } {
  const key = token.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return STATUS_TOKENS[key] ?? { tone: 'muted', label: token }
}

interface EventStatusPillProps {
  /** A domain status word (e.g. "Live now", "Needs survey", "Immediate"). */
  status?: string
  /** Explicit tone override; wins over the resolved status token. */
  tone?: EventStatusTone
  /** Explicit label override; wins over the resolved status token. */
  label?: ReactNode
  size?: 'sm' | 'md'
  /** Show a leading status dot. Defaults to true. */
  dot?: boolean
  className?: string
}

export function EventStatusPill({
  status,
  tone,
  label,
  size = 'md',
  dot = true,
  className = '',
}: EventStatusPillProps) {
  const resolved = status ? resolveEventStatus(status) : undefined
  const finalTone: EventStatusTone = tone ?? resolved?.tone ?? 'muted'
  const finalLabel = label ?? resolved?.label ?? status ?? ''
  return <StatusPill label={finalLabel} tone={EVENT_TONE_TO_PRODUCT_TONE[finalTone]} dot={dot} className={`${size === 'sm' ? 'text-[10px]' : ''} ${className}`} />
}
