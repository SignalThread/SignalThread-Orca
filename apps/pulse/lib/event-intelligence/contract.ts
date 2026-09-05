export const EVENT_OPERATIONS_TAXONOMY = [
  'access_checkin',
  'session_content_speakers',
  'room_environment_av',
  'wayfinding',
  'food_beverage',
  'networking_expo',
  'staff_process',
  'safety_accessibility',
  'sponsor_exhibitor_experience',
  'general_positive',
  'general_other',
] as const

export type EventOperationsTaxonomyKey = typeof EVENT_OPERATIONS_TAXONOMY[number]

export const EVENT_PRIORITY_LEVELS = [
  'Immediate',
  'Soon',
  'Watch',
  'Informational',
] as const

export type EventPriorityLevel = typeof EVENT_PRIORITY_LEVELS[number]

export const EVENT_ISSUE_CLUSTER_STATUSES = [
  'NEW',
  'ACKNOWLEDGED',
  'ACTING',
  'RESOLVED',
  'DISMISSED',
] as const

export type EventIssueClusterStatus = typeof EVENT_ISSUE_CLUSTER_STATUSES[number]

export const EVENT_OPERATIONS_TAXONOMY_LABELS: Record<EventOperationsTaxonomyKey, string> = {
  access_checkin: 'Access and check-in',
  session_content_speakers: 'Session content and speakers',
  room_environment_av: 'Room environment and AV',
  wayfinding: 'Wayfinding',
  food_beverage: 'Food and beverage',
  networking_expo: 'Networking and expo',
  staff_process: 'Staff and process',
  safety_accessibility: 'Safety and accessibility',
  sponsor_exhibitor_experience: 'Sponsor and exhibitor experience',
  general_positive: 'General positive feedback',
  general_other: 'General other feedback',
}

export interface EventMentionSet {
  sponsors: string[]
  exhibitors: string[]
  sessions: string[]
  locations: string[]
}

export interface EventCommandCenterExtraction {
  taxonomyKey: EventOperationsTaxonomyKey
  taxonomyLabel: string
  priorityLevel: EventPriorityLevel
  impactScore: number | null
  timeSensitivityScore: number | null
  recommendedNextStep: string | null
  actionWindow: string | null
  representativeSnippet: string
  confidence: number
  entities: string[]
  mentions: EventMentionSet
}

export interface NormalizedEventActionSignal {
  title: string
  priority?: string | null
  actionWindow?: string | null
}

export interface EventTaxonomyInput {
  themes?: string[]
  actions?: NormalizedEventActionSignal[]
  transcriptText?: string
  sentimentScore?: number | null
}

export interface EventPriorityInput {
  sentimentScore?: number | null
  actionPriority?: string | null
  actionWindow?: string | null
  evidenceCount?: number
  frictionCategory?: EventOperationsTaxonomyKey | null
  hasAction?: boolean
}

const TAXONOMY_KEYWORDS: Array<{
  key: EventOperationsTaxonomyKey
  keywords: string[]
}> = [
  {
    key: 'safety_accessibility',
    keywords: [
      'accessibility',
      'accessible',
      'ada',
      'wheelchair',
      'safety',
      'unsafe',
      'security',
      'medical',
      'emergency',
      'harassment',
      'evacuation',
    ],
  },
  {
    key: 'access_checkin',
    keywords: [
      'check in',
      'check-in',
      'checkin',
      'registration',
      'badge',
      'entry',
      'entrance',
      'ticket',
      'line',
      'queue',
      'access',
    ],
  },
  {
    key: 'room_environment_av',
    keywords: [
      'audio',
      'av',
      'microphone',
      'mic',
      'sound',
      'speaker volume',
      'projector',
      'screen',
      'wifi',
      'wi-fi',
      'temperature',
      'hot',
      'cold',
      'lighting',
      'seating',
      'room',
    ],
  },
  {
    key: 'wayfinding',
    keywords: [
      'wayfinding',
      'signage',
      'signs',
      'directions',
      'map',
      'find',
      'finding',
      'hallway',
      'confusing',
      'lost',
    ],
  },
  {
    key: 'food_beverage',
    keywords: [
      'food',
      'beverage',
      'coffee',
      'water',
      'lunch',
      'breakfast',
      'catering',
      'snack',
      'bar',
      'drink',
    ],
  },
  {
    key: 'sponsor_exhibitor_experience',
    keywords: [
      'sponsor',
      'exhibitor',
      'vendor',
      'sponsor booth',
      'exhibitor booth',
      'booth staff',
    ],
  },
  {
    key: 'networking_expo',
    keywords: [
      'networking',
      'expo',
      'expo hall',
      'meet',
      'matchmaking',
      'reception',
      'connections',
    ],
  },
  {
    key: 'staff_process',
    keywords: [
      'staff',
      'volunteer',
      'organizer',
      'process',
      'communication',
      'schedule',
      'rude',
      'unclear',
      'coordination',
    ],
  },
  {
    key: 'session_content_speakers',
    keywords: [
      'session',
      'speaker',
      'keynote',
      'panel',
      'presentation',
      'content',
      'agenda',
      'workshop',
      'topic',
    ],
  },
]

const TIME_SENSITIVE_CATEGORIES = new Set<EventOperationsTaxonomyKey>([
  'access_checkin',
  'room_environment_av',
  'wayfinding',
  'safety_accessibility',
])

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

export function normalizeEventTaxonomyKey(value: unknown): EventOperationsTaxonomyKey {
  if (typeof value !== 'string') return 'general_other'
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return isEventOperationsTaxonomyKey(normalized) ? normalized : 'general_other'
}

export function getEventTaxonomyLabel(key: EventOperationsTaxonomyKey): string {
  return EVENT_OPERATIONS_TAXONOMY_LABELS[key]
}

export function isEventOperationsTaxonomyKey(value: unknown): value is EventOperationsTaxonomyKey {
  return typeof value === 'string' && (EVENT_OPERATIONS_TAXONOMY as readonly string[]).includes(value)
}

export function isEventPriorityLevel(value: unknown): value is EventPriorityLevel {
  return typeof value === 'string' && (EVENT_PRIORITY_LEVELS as readonly string[]).includes(value)
}

export function isEventIssueClusterStatus(value: unknown): value is EventIssueClusterStatus {
  return typeof value === 'string' && (EVENT_ISSUE_CLUSTER_STATUSES as readonly string[]).includes(value)
}

export function isActiveEventIssueClusterStatus(value: unknown): boolean {
  return value !== 'RESOLVED' && value !== 'DISMISSED'
}

const EVENT_ALERT_TRANSITIONS: Record<EventIssueClusterStatus, readonly EventIssueClusterStatus[]> = {
  NEW: ['ACKNOWLEDGED', 'DISMISSED'],
  ACKNOWLEDGED: ['ACTING', 'DISMISSED'],
  ACTING: ['RESOLVED', 'DISMISSED'],
  RESOLVED: ['NEW'],
  DISMISSED: ['NEW'],
}

export function canTransitionEventIssueCluster(
  from: EventIssueClusterStatus,
  to: EventIssueClusterStatus,
): boolean {
  return EVENT_ALERT_TRANSITIONS[from].includes(to)
}

export function classifyEventOperationsTaxonomy(input: EventTaxonomyInput): EventOperationsTaxonomyKey {
  const text = [
    ...(input.themes ?? []),
    ...(input.actions ?? []).map((action) => action.title),
    input.transcriptText ?? '',
  ]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeText)
    .join(' ')

  for (const { key, keywords } of TAXONOMY_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return key
    }
  }

  if ((input.sentimentScore ?? 0) >= 0.35) {
    return 'general_positive'
  }

  return 'general_other'
}

export function deriveEventPriorityLevel(input: EventPriorityInput): EventPriorityLevel {
  const sentimentScore = typeof input.sentimentScore === 'number' && Number.isFinite(input.sentimentScore)
    ? input.sentimentScore
    : null
  const actionPriority = input.actionPriority?.trim().toLowerCase() ?? ''
  const actionWindow = input.actionWindow?.trim().toUpperCase() ?? ''
  const evidenceCount = Math.max(0, input.evidenceCount ?? 0)
  const frictionCategory = input.frictionCategory ?? 'general_other'
  const hasAction = Boolean(input.hasAction || actionPriority)
  const isTimeSensitive = TIME_SENSITIVE_CATEGORIES.has(frictionCategory)

  if (['IMMEDIATE', 'NOW', 'TODAY'].includes(actionWindow)) {
    return isTimeSensitive || actionPriority === 'high' || evidenceCount >= 2 ? 'Immediate' : 'Soon'
  }

  if (['SOON', 'THIS_WEEK', 'NEXT_24_HOURS', 'NEXT_48_HOURS'].includes(actionWindow)) {
    return 'Soon'
  }

  if (actionPriority === 'high') {
    return isTimeSensitive && evidenceCount >= 2 ? 'Immediate' : 'Soon'
  }

  if (frictionCategory === 'safety_accessibility' && sentimentScore !== null && sentimentScore <= -0.2) {
    return hasAction || evidenceCount >= 2 ? 'Immediate' : 'Soon'
  }

  if (actionPriority === 'medium') {
    return isTimeSensitive || (sentimentScore !== null && sentimentScore <= -0.4) ? 'Soon' : 'Watch'
  }

  if (hasAction) {
    return sentimentScore !== null && sentimentScore <= -0.35 ? 'Soon' : 'Watch'
  }

  if (sentimentScore !== null && sentimentScore <= -0.6) {
    return isTimeSensitive && evidenceCount >= 2 ? 'Soon' : 'Watch'
  }

  if (sentimentScore !== null && sentimentScore <= -0.2) {
    return 'Watch'
  }

  return 'Informational'
}

export function mapEventPriorityToLegacyUrgency(priority: EventPriorityLevel): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (priority === 'Immediate') return 'HIGH'
  if (priority === 'Soon') return 'MEDIUM'
  return 'LOW'
}

export function mapLegacyUrgencyToEventPriority(urgency: string | null | undefined): EventPriorityLevel {
  const normalized = urgency?.trim().toUpperCase()
  if (normalized === 'HIGH' || normalized === 'CRITICAL' || normalized === 'URGENT') return 'Immediate'
  if (normalized === 'MEDIUM') return 'Soon'
  if (normalized === 'NO_DATA') return 'Informational'
  return 'Watch'
}

export function deriveActionWindowForPriority(priority: EventPriorityLevel, hasAction: boolean): string | null {
  if (!hasAction) return null
  if (priority === 'Immediate') return 'IMMEDIATE'
  if (priority === 'Soon') return 'THIS_WEEK'
  if (priority === 'Watch') return 'WATCH'
  return 'LATER'
}

export function priorityLevelToActionPriority(priority: EventPriorityLevel): 'High' | 'Medium' | 'Low' {
  if (priority === 'Immediate') return 'High'
  if (priority === 'Soon') return 'Medium'
  return 'Low'
}
