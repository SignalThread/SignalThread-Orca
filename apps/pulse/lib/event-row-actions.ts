import type { StatusPillTone } from '@/components/ui/StatusPill'

export type EventRowPrimaryAction = 'complete-setup' | 'attach-survey' | 'finish-survey' | 'view-results' | 'set-up-feedback' | 'open-survey'

/**
 * The complete, approved Event Workspace status inventory. These are the only
 * states that render as operational status pills. Other context belongs in
 * row metadata or an action, not another badge.
 */
export const EVENT_ROW_STATUS = {
  MISSING_INFO: { label: 'MISSING INFO', tone: 'attention' },
  MISSING_DETAILS: { label: 'MISSING DETAILS', tone: 'blocking' },
  NO_ROOM: { label: 'NO ROOM', tone: 'blocking' },
  NO_SPEAKER: { label: 'NO SPEAKER', tone: 'blocking' },
  OVER_CAPACITY: { label: 'OVER CAPACITY', tone: 'blocking' },
  TIME_CONFLICT: { label: 'TIME CONFLICT', tone: 'attention' },
  UNCONFIRMED: { label: 'UNCONFIRMED', tone: 'attention' },
  CLOSES_TODAY: { label: 'CLOSES TODAY', tone: 'attention' },
  LOW_RESPONSE: { label: 'LOW RESPONSE', tone: 'attention' },
  DRAFT: { label: 'DRAFT', tone: 'lifecycle' },
  UNPUBLISHED: { label: 'UNPUBLISHED', tone: 'lifecycle' },
  CANCELLED: { label: 'CANCELLED', tone: 'lifecycle' },
  ARCHIVED: { label: 'ARCHIVED', tone: 'lifecycle' },
} as const

export type EventRowStatusId = keyof typeof EVENT_ROW_STATUS

export interface EventRowStatus {
  id: EventRowStatusId
  label: string
  tone: Exclude<StatusPillTone, 'healthy'>
}

export type EventRowStatusVariant = 'main' | 'detail' | 'needs-attention'

export interface EventRowStatusSummary {
  /** All remaining qualifying states, ordered deterministically. */
  all: EventRowStatus[]
  /** The states visible without expanding the +n disclosure. */
  visible: EventRowStatus[]
  /** States available through the +n disclosure. */
  hidden: EventRowStatus[]
  additionalCount: number
  /** Number of status pills shown before the compact +n disclosure. */
  maxPills: number
}

export interface EventRowActions {
  primary: { id: EventRowPrimaryAction; label: string } | null
  secondary: { id: 'edit'; label: 'Edit' }
  overflow: true
  statuses: EventRowStatusSummary
}

export interface EventRowActionInput {
  entityType?: 'area' | 'session' | 'speaker' | 'survey' | 'deployment'
  /** Legacy raw states supplied by current workspace data. They are normalized into EVENT_ROW_STATUS. */
  blockers?: string[]
  /** Legacy raw states supplied by current workspace data. They are normalized into EVENT_ROW_STATUS. */
  attention?: string[]
  /** Explicit canonical states for new callers. */
  statusIds?: EventRowStatusId[]
  /** Remove a status only when this row's primary action directly remedies it. */
  remediedStatusIds?: EventRowStatusId[]
  variant?: EventRowStatusVariant
  survey: 'none' | 'draft' | 'active'
  responseCount?: number
  surveysAvailable: boolean
}

const STATUS_PRIORITY: Record<EventRowStatusId, number> = {
  // Specific blockers lead generic missing details so a row with no room is
  // immediately actionable even when it has several other setup gaps.
  NO_ROOM: 120,
  NO_SPEAKER: 119,
  OVER_CAPACITY: 118,
  MISSING_DETAILS: 117,
  MISSING_INFO: 76,
  TIME_CONFLICT: 80,
  UNCONFIRMED: 79,
  CLOSES_TODAY: 78,
  LOW_RESPONSE: 77,
  DRAFT: 40,
  UNPUBLISHED: 39,
  CANCELLED: 38,
  ARCHIVED: 37,
}

const STATUS_ALIASES: Record<string, EventRowStatusId> = {
  'missing info': 'MISSING_INFO',
  'missing details': 'MISSING_DETAILS',
  'missing start time': 'MISSING_DETAILS',
  'missing end time': 'MISSING_DETAILS',
  'missing timezone': 'MISSING_DETAILS',
  'missing track': 'MISSING_DETAILS',
  'missing format': 'MISSING_DETAILS',
  'check session times': 'MISSING_DETAILS',
  unscheduled: 'MISSING_DETAILS',
  'no room': 'NO_ROOM',
  'missing room': 'NO_ROOM',
  'no speaker': 'NO_SPEAKER',
  'missing speaker': 'NO_SPEAKER',
  'over capacity': 'OVER_CAPACITY',
  'time conflict': 'TIME_CONFLICT',
  unconfirmed: 'UNCONFIRMED',
  'closes today': 'CLOSES_TODAY',
  'low response': 'LOW_RESPONSE',
  draft: 'DRAFT',
  unpublished: 'UNPUBLISHED',
  cancelled: 'CANCELLED',
  archived: 'ARCHIVED',
}

function resolveRawStatus(value: string, fallback: 'blocking' | 'attention'): EventRowStatusId | null {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  const direct = STATUS_ALIASES[normalized]
  if (direct) return direct
  // A data-quality blocker without a more specific approved label remains the
  // canonical generic blocker. Attention-only states outside the inventory
  // stay as metadata rather than gaining an ad-hoc pill.
  return fallback === 'blocking' ? 'MISSING_DETAILS' : null
}

function summarizeStatuses({
  statusIds,
  remediedStatusIds,
  variant,
}: {
  statusIds: EventRowStatusId[]
  remediedStatusIds: EventRowStatusId[]
  variant: EventRowStatusVariant
}): EventRowStatusSummary {
  const remedied = new Set(remediedStatusIds)
  const all = [...new Set(statusIds)]
    .filter((statusId) => !remedied.has(statusId))
    .sort((left, right) => STATUS_PRIORITY[right] - STATUS_PRIORITY[left])
    .map((id) => ({ id, ...EVENT_ROW_STATUS[id] }))
  // Main rows show useful words whenever there are only one or two qualifying
  // states. The compact disclosure is reserved for genuinely dense rows.
  const maxPills = variant === 'main' ? (all.length >= 3 ? 1 : all.length) : all.length
  const visible = all.slice(0, maxPills)
  const hidden = all.slice(maxPills)
  return { all, visible, hidden, additionalCount: hidden.length, maxPills }
}

/**
 * Canonical operational-row grammar for Events. It resolves status candidates
 * before rendering, removes states a primary action directly remedies, ranks
 * Blocking > Attention > Lifecycle, and uses +n only for dense main rows.
 */
export function resolveEventRowActions({
  blockers = [],
  attention = [],
  statusIds = [],
  remediedStatusIds = [],
  survey,
  responseCount = 0,
  surveysAvailable,
  entityType,
  variant = 'main',
}: EventRowActionInput): EventRowActions {
  const secondary = { id: 'edit' as const, label: 'Edit' as const }
  const overflow = true as const
  const normalizedBlockers = blockers.map((status) => resolveRawStatus(status, 'blocking')).filter((status): status is EventRowStatusId => Boolean(status))
  const normalizedAttention = attention.map((status) => resolveRawStatus(status, 'attention')).filter((status): status is EventRowStatusId => Boolean(status))
  const candidates = [...statusIds, ...normalizedBlockers, ...normalizedAttention]
  let primary: EventRowActions['primary'] = null
  const remedied = [...remediedStatusIds]

  if (candidates.some((status) => EVENT_ROW_STATUS[status].tone === 'blocking')) {
    primary = { id: 'complete-setup', label: 'Complete setup' }
  } else if (survey === 'none') {
    primary = surveysAvailable
      ? { id: 'attach-survey', label: 'Attach survey' }
      : { id: 'set-up-feedback', label: 'Set up feedback' }
  } else if (survey === 'draft') {
    primary = { id: 'finish-survey', label: 'Finish survey' }
  } else if (responseCount > 0) {
    primary = { id: 'view-results', label: 'View results' }
  } else if (entityType === 'survey') {
    primary = { id: 'open-survey', label: 'Open survey' }
  }

  if (survey === 'draft') candidates.push('DRAFT')

  return {
    primary,
    secondary,
    overflow,
    statuses: summarizeStatuses({ statusIds: candidates, remediedStatusIds: remedied, variant }),
  }
}
