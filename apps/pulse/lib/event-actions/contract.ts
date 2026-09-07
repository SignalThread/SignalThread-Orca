import { isEventPriorityLevel, type EventIssueClusterStatus, type EventPriorityLevel } from '@/lib/event-intelligence/contract'

export const EVENT_ACTION_CLASSIFICATIONS = [
  'DURING_EVENT',
  'AFTER_EVENT_FOLLOW_UP',
  'NEXT_EVENT_LEARNING',
  'INFORMATIONAL',
] as const

export const EVENT_ACTION_STATUSES = [
  'UNASSIGNED',
  'OPEN',
  'WORKING',
  'BLOCKED',
  'COMPLETE',
  'DISMISSED',
  'CANCELLED',
] as const

export const EVENT_ACTION_UPDATE_KINDS = ['WRITTEN', 'VOICE'] as const

export type EventActionClassification = typeof EVENT_ACTION_CLASSIFICATIONS[number]
export type EventActionStatus = typeof EVENT_ACTION_STATUSES[number]
export type EventActionUpdateKind = typeof EVENT_ACTION_UPDATE_KINDS[number]

export const EVENT_ACTION_CLASSIFICATION_LABELS: Record<EventActionClassification, string> = {
  DURING_EVENT: 'During this event',
  AFTER_EVENT_FOLLOW_UP: 'After-event follow-up',
  NEXT_EVENT_LEARNING: 'Next-event learning',
  INFORMATIONAL: 'Informational, no action required',
}

export const EVENT_ACTION_STATUS_LABELS: Record<EventActionStatus, string> = {
  UNASSIGNED: 'Unassigned',
  OPEN: 'Open',
  WORKING: 'Working',
  BLOCKED: 'Blocked',
  COMPLETE: 'Complete',
  DISMISSED: 'Dismissed',
  CANCELLED: 'Cancelled',
}

const ACTION_TRANSITIONS: Record<EventActionStatus, readonly EventActionStatus[]> = {
  UNASSIGNED: ['OPEN', 'DISMISSED', 'CANCELLED'],
  OPEN: ['UNASSIGNED', 'WORKING', 'BLOCKED', 'COMPLETE', 'DISMISSED', 'CANCELLED'],
  WORKING: ['UNASSIGNED', 'OPEN', 'BLOCKED', 'COMPLETE', 'DISMISSED', 'CANCELLED'],
  BLOCKED: ['UNASSIGNED', 'OPEN', 'WORKING', 'COMPLETE', 'DISMISSED', 'CANCELLED'],
  COMPLETE: ['OPEN', 'WORKING'],
  DISMISSED: ['OPEN'],
  CANCELLED: ['OPEN'],
}

export function isEventActionClassification(value: unknown): value is EventActionClassification {
  return typeof value === 'string' && (EVENT_ACTION_CLASSIFICATIONS as readonly string[]).includes(value)
}

export function isEventActionStatus(value: unknown): value is EventActionStatus {
  return typeof value === 'string' && (EVENT_ACTION_STATUSES as readonly string[]).includes(value)
}

export function isEventActionUpdateKind(value: unknown): value is EventActionUpdateKind {
  return typeof value === 'string' && (EVENT_ACTION_UPDATE_KINDS as readonly string[]).includes(value)
}

export function canTransitionEventAction(from: EventActionStatus, to: EventActionStatus): boolean {
  return from !== to && ACTION_TRANSITIONS[from].includes(to)
}

export function mapIssueStatusToActionStatus(
  status: EventIssueClusterStatus,
  hasOwner: boolean,
  classification: EventActionClassification,
): EventActionStatus {
  if (classification === 'INFORMATIONAL') return 'COMPLETE'
  if (status === 'RESOLVED') return 'COMPLETE'
  if (status === 'DISMISSED') return 'DISMISSED'
  if (!hasOwner) return 'UNASSIGNED'
  return status === 'ACTING' ? 'WORKING' : 'OPEN'
}

export function parseEventActionPriority(value: unknown): EventPriorityLevel | null {
  return isEventPriorityLevel(value) ? value : null
}

export function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim()
  return key.length >= 8 && key.length <= 200 ? key : null
}

export function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function eventActionVoiceObjectPrefix(accountId: string, eventId: string, clusterId: string): string {
  return `event-actions/${accountId}/${eventId}/${clusterId}/updates/`
}
