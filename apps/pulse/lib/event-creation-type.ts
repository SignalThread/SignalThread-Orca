/**
 * Customer-selectable creation modes for new Events-account containers.
 * These stable values are persisted in Event.eventType; labels remain UI copy.
 */
export const EVENT_CREATION_TYPES = [
  {
    value: 'TEMPLATE',
    label: 'Event Template',
    description: 'Structured setup for agenda-driven events.',
  },
  {
    value: 'BLANK',
    label: 'Simple Event',
    description: 'Create event-wide surveys without agenda or assignments.',
  },
  {
    value: 'ADVANCED',
    label: 'Advanced Event',
    description: 'Full setup with all event configuration options.',
  },
] as const

export type EventCreationType = typeof EVENT_CREATION_TYPES[number]['value']

export function isEventCreationType(value: unknown): value is EventCreationType {
  return typeof value === 'string' && EVENT_CREATION_TYPES.some((type) => type.value === value)
}

type EventExperienceInput = {
  eventType?: string | null
  templateKey?: string | null
}

const LEGACY_COMPLEX_EVENT_TYPES = new Set([
  'FEEDBACK',
  'SURVEY',
  'INTERVIEW',
  'KIOSK',
])

/**
 * The workspace experience is derived from the persisted Event type. Existing
 * complex event records retain the full experience without a data migration;
 * a legacy template key is also an explicit signal of that old setup shape.
 */
export function getEventWorkspaceExperience(event: EventExperienceInput): 'TEMPLATE' | 'SIMPLE' | 'ADVANCED' {
  if (event.eventType === 'TEMPLATE') return 'TEMPLATE'
  if (event.eventType === 'BLANK') return 'SIMPLE'
  if (event.eventType === 'ADVANCED') return 'ADVANCED'
  if (LEGACY_COMPLEX_EVENT_TYPES.has(event.eventType ?? '') || Boolean(event.templateKey)) return 'ADVANCED'

  // Unknown historical values must remain safe and retain the established
  // full workspace rather than accidentally receiving TEMPLATE-only gates.
  return 'ADVANCED'
}

export function isSimpleEventExperience(event: EventExperienceInput): boolean {
  return getEventWorkspaceExperience(event) === 'SIMPLE'
}

export function isAdvancedEventExperience(event: EventExperienceInput): boolean {
  return getEventWorkspaceExperience(event) === 'ADVANCED'
}
