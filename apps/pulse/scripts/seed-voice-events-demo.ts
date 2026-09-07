import {
  AccountType,
  AnswerStatus,
  CollectionPhase,
  EventActionClassification,
  EventActionHistoryType,
  EventActionStatus,
  EventActionUpdateKind,
  EventStatus,
  EventSpeakerRole,
  EventStructureItemKind,
  EventType,
  PrismaClient,
  QuestionResponseTarget,
  QuestionType,
  ResponseMode,
  ResponseStatus,
  SurveyTargetCategory,
} from '@prisma/client'
import { createHash, randomUUID } from 'crypto'
import { assertSeedSafety, isProductionEnvironment } from './seed-voice-events-demo-safety.js'

const DEFAULT_ACCOUNT_SLUG = 'events-demo'
const ACCOUNT_ID = 'acct_events_demo'
const LOCATION_ID = 'loc_events_demo_venue'
const LOCATION_SLUG = 'signalthread-live-venue'
const EVENT_ID_PREFIX = 'event_advanced_demo'
const DEFAULT_EVENT_NAME = 'SignalThread Live Experience Summit'
const TIMEZONE = 'America/New_York'
const PROMPT_VERSION = 'seed-voice-events-demo-v1'
const SEEDED_BY = 'seed-voice-events-demo'

export type SeedOptions = {
  apply: boolean
  accountSlug: string
  eventId: string | null
  seedKey: string
  name: string
  hasExplicitSeedKey: boolean
  hasExplicitName: boolean
}

export function parseSeedOptions(argv: string[] = process.argv.slice(2)): SeedOptions {
  const values = argv.filter((arg) => arg.startsWith('--event-id='))
  if (values.length > 1) throw new Error('Provide --event-id at most once')
  if (argv.includes('--event-id')) throw new Error('Use --event-id=<id>')
  const eventId = values[0]?.slice('--event-id='.length).trim() || null
  if (values.length && !eventId) throw new Error('--event-id requires a non-empty event ID')
  const accountValues = argv.filter((arg) => arg.startsWith('--account='))
  if (accountValues.length > 1) throw new Error('Provide --account at most once')
  if (argv.includes('--account')) throw new Error('Use --account=<slug>')
  const suppliedAccountSlug = accountValues[0]?.slice('--account='.length).trim()
  if (accountValues.length && !suppliedAccountSlug) throw new Error('--account requires a non-empty account slug')
  const seedKeyValues = argv.filter((arg) => arg.startsWith('--seed-key='))
  if (seedKeyValues.length > 1) throw new Error('Provide --seed-key at most once')
  if (argv.includes('--seed-key')) throw new Error('Use --seed-key=<key>')
  const suppliedSeedKey = seedKeyValues[0]?.slice('--seed-key='.length).trim()
  if (seedKeyValues.length && !suppliedSeedKey) throw new Error('--seed-key requires a non-empty value')
  if (eventId && suppliedSeedKey) throw new Error('Use either --event-id or --seed-key, not both')
  const nameValues = argv.filter((arg) => arg.startsWith('--name='))
  if (nameValues.length > 1) throw new Error('Provide --name at most once')
  if (argv.includes('--name')) throw new Error('Use --name=<event name>')
  const suppliedName = nameValues[0]?.slice('--name='.length).trim()
  if (nameValues.length && !suppliedName) throw new Error('--name requires a non-empty event name')
  const generatedSeedKey = `${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`
  const seedKey = suppliedSeedKey ?? generatedSeedKey
  const name = suppliedName ?? `${DEFAULT_EVENT_NAME} ${seedKey}`
  return {
    apply: argv.includes('--apply'),
    accountSlug: suppliedAccountSlug ?? DEFAULT_ACCOUNT_SLUG,
    eventId,
    seedKey,
    name,
    hasExplicitSeedKey: Boolean(suppliedSeedKey),
    hasExplicitName: Boolean(suppliedName),
  }
}

const seedOptions = parseSeedOptions()
const ACCOUNT_SLUG = seedOptions.accountSlug
const existingTargetEventId = seedOptions.eventId
const productionEnvironment = isProductionEnvironment(process.env)
const seedScopeKey = existingTargetEventId ?? seedOptions.seedKey
const normalizedSeedScope = seedScopeKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'advanced-demo'
const productionScopeHash = createHash('sha256').update(`${ACCOUNT_SLUG}:${seedScopeKey}`).digest('hex').slice(0, 8)
const seedScopeSuffix = productionEnvironment
  ? `${normalizedSeedScope.slice(-15)}-${productionScopeHash}`
  // Existing-event IDs may cross the slice boundary at a separator. Remove it
  // so reruns converge on the original deterministic scope instead of making a
  // second, hyphen-prefixed fixture set.
  : normalizedSeedScope.slice(-24).replace(/^-+/, '')
const generatedEventId = `${EVENT_ID_PREFIX}_${seedScopeSuffix.replace(/-/g, '_')}`
const generatedEventName = seedOptions.name

function isExistingEventSeed() {
  return existingTargetEventId !== null
}

// Every generated event is namespaced by a unique seed key. Supplying the same
// key makes reruns converge on the same records; existing-event mode also stays
// isolated from user-owned setup records.
function scopedSeedValue(value: string) {
  return `${value}__${seedScopeSuffix}`
}

function scopedSeedSlug(value: string) {
  return `seed-${seedScopeSuffix}-${value}`
}

function scopedSeedToken(value: string) {
  return `seed-${seedScopeSuffix}-${value}`
}

function scopedQuestionKey(value: string) {
  return `seed_${seedScopeSuffix.replace(/-/g, '_')}_${value}`
}

function scopedClusterKey(value: string) {
  return `events-demo:${seedScopeSuffix}:${value}`
}

function scopedUuid(value: string) {
  const hex = createHash('sha256').update(`${ACCOUNT_SLUG}:${seedScopeKey}:${value}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const eventStart = new Date('2026-09-17T13:00:00.000Z')
const eventEnd = new Date('2026-09-18T22:00:00.000Z')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
})

type StructureDefinition = {
  kind: EventStructureItemKind
  name: string
  slug: string
  description: string
  sortOrder: number
  startsAt?: Date
  endsAt?: Date
  metadata?: Record<string, unknown>
}

type ListeningPointDefinition = {
  slug: string
}

type SpeakerDefinition = {
  id: string
  name: string
  title: string
  organization: string
}

type SurveyDefinition = {
  key: string
  name: string
  description: string
  collectionPhase: CollectionPhase
  structureSlug: string
  token: string
  questionBaseOrder: number
  targetKey?: string
  createPublicLink?: boolean
  status?: EventStatus
  responseMode?: ResponseMode
  linkIsActive?: boolean
  questions: Array<{
    key: string
    label: string
    helperText: string
    order: number
    type?: QuestionType
  }>
}

type SeedAnswer = {
  questionKey: string
  transcript: string
  summary: string
  sentimentLabel: string
  sentimentScore: number
  urgency: string
  frictionCategory?: string
  actionWindow?: string
  recommendedAction?: string
  themes: Array<{ key: string; label: string; sentimentLabel: string; confidence: number }>
  entities: Array<{ type: string; label: string; confidence: number }>
  actions: Array<{ title: string; description: string; priority: string; urgency: string; actionWindow?: string }>
  numericValue?: number
}

type ResponseDefinition = {
  id: string
  surveyKey: string
  anonymousId: string
  startedAt: Date
  completedAt: Date
  answers: SeedAnswer[]
  requiresPublicLink?: boolean
  speakerProfileId?: string
  speakerAssignmentSessionSlug?: string
}

type ClusterDefinition = {
  key: string
  taxonomyKey: string
  title: string
  summary: string
  priorityLevel: string
  impactScore: number
  timeSensitivityScore: number
  confidence: number
  recommendedNextStep: string
  evidenceAnswerRefs: Array<{ responseId: string; questionKey: string }>
}

function databaseTarget() {
  const value = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL or DIRECT_URL is required')
  const url = new URL(value)
  const projectRef = (url.username.match(/\.([a-z0-9]+)$/i) || [])[1] ?? 'local'
  return { host: url.hostname, projectRef }
}

function assertApplyTarget() {
  const target = databaseTarget()
  return assertSeedSafety({
    env: process.env,
    accountSlug: ACCOUNT_SLUG,
    eventId: existingTargetEventId,
    eventName: generatedEventName,
    hasExplicitName: seedOptions.hasExplicitName,
    hasExplicitSeedKey: seedOptions.hasExplicitSeedKey,
    host: target.host,
  })
}

function isApplyRun() {
  return seedOptions.apply
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

function structureId(slug: string) {
  return scopedSeedValue(`esi_events_demo_${slug.replace(/-/g, '_')}`)
}

function surveyId(key: string) {
  return scopedSeedValue(`survey_events_demo_${key.replace(/-/g, '_')}`)
}

function listeningPointId(slug: string) {
  return scopedSeedValue(`listening_point_events_demo_${slug.replace(/-/g, '_')}`)
}

function resultTargetId(kind: 'session' | 'speaker', sessionSlug: string) {
  return scopedSeedValue(`${kind}_result_target_events_demo_${sessionSlug.replace(/-/g, '_')}`)
}

function speakerId(index: number) {
  return scopedSeedValue(`speaker_events_demo_${String(index + 1).padStart(2, '0')}`)
}

function assignmentId(sessionSlug: string, speaker: string) {
  return scopedSeedValue(`speaker_assignment_events_demo_${sessionSlug.replace(/-/g, '_')}_${speaker}`)
}

function questionId(key: string) {
  return scopedSeedValue(`q_events_demo_${key.replace(/-/g, '_')}`)
}

function answerId(responseId: string, questionKey: string) {
  return scopedSeedValue(`answer_${responseId}_${questionKey}`.replace(/-/g, '_'))
}

function categoryForKind(kind: EventStructureItemKind) {
  switch (kind) {
    case EventStructureItemKind.EVENT:
      return SurveyTargetCategory.EVENT
    case EventStructureItemKind.SESSION:
      return SurveyTargetCategory.SESSION
    case EventStructureItemKind.AREA:
      return SurveyTargetCategory.LOCATION
    case EventStructureItemKind.SPONSOR_ACTIVATION:
    case EventStructureItemKind.CUSTOM_TOUCHPOINT:
      return SurveyTargetCategory.CUSTOM
  }
}

const structureDefinitions: StructureDefinition[] = [
  {
    kind: EventStructureItemKind.EVENT,
    name: 'Registration / Check-in',
    slug: 'registration-check-in',
    description: 'Whole-event feedback about arrival, badge pickup, and first impressions.',
    sortOrder: 10,
    startsAt: new Date('2026-09-17T12:00:00.000Z'),
    endsAt: new Date('2026-09-17T15:00:00.000Z'),
  },
  {
    kind: EventStructureItemKind.EVENT,
    name: 'Overall Event Experience',
    slug: 'overall-event-experience',
    description: 'Whole-event sentiment, highlights, and opportunities across the attendee journey.',
    sortOrder: 20,
  },
  {
    kind: EventStructureItemKind.SESSION,
    name: 'Opening Keynote',
    slug: 'opening-keynote',
    description: 'Kickoff keynote covering product direction and customer stories.',
    sortOrder: 100,
    startsAt: new Date('2026-09-17T14:00:00.000Z'),
    endsAt: new Date('2026-09-17T15:00:00.000Z'),
  },
  {
    kind: EventStructureItemKind.SESSION,
    name: 'Product Strategy Panel',
    slug: 'product-strategy-panel',
    description: 'Panel discussion with product leaders and enterprise operators.',
    sortOrder: 110,
    startsAt: new Date('2026-09-17T17:00:00.000Z'),
    endsAt: new Date('2026-09-17T18:00:00.000Z'),
  },
  {
    kind: EventStructureItemKind.SESSION,
    name: 'Customer Success Workshop',
    slug: 'customer-success-workshop',
    description: 'Interactive workshop for playbooks, rollout lessons, and adoption planning.',
    sortOrder: 120,
    startsAt: new Date('2026-09-18T15:00:00.000Z'),
    endsAt: new Date('2026-09-18T16:30:00.000Z'),
  },
  {
    kind: EventStructureItemKind.SESSION,
    name: 'Closing Session',
    slug: 'closing-session',
    description: 'Closing remarks, attendee takeaways, and next steps.',
    sortOrder: 130,
    startsAt: new Date('2026-09-18T20:30:00.000Z'),
    endsAt: new Date('2026-09-18T21:30:00.000Z'),
  },
  {
    kind: EventStructureItemKind.AREA,
    name: 'Expo Floor',
    slug: 'expo-floor',
    description: 'Main exhibitor hall and demo area.',
    sortOrder: 200,
  },
  {
    kind: EventStructureItemKind.AREA,
    name: 'F&B Lounge',
    slug: 'f-and-b-lounge',
    description: 'Food, beverage, seating, and recharge space.',
    sortOrder: 210,
  },
  {
    kind: EventStructureItemKind.AREA,
    name: 'Registration Desk',
    slug: 'registration-desk',
    description: 'Badge pickup, help desk, and attendee support.',
    sortOrder: 220,
  },
  {
    kind: EventStructureItemKind.AREA,
    name: 'Main Entrance',
    slug: 'main-entrance',
    description: 'Primary attendee entrance and wayfinding point.',
    sortOrder: 230,
  },
  {
    kind: EventStructureItemKind.SPONSOR_ACTIVATION,
    name: 'SignalThread Demo Booth',
    slug: 'signalthread-demo-booth',
    description: 'Hands-on sponsor demo booth for live attendee voice workflows.',
    sortOrder: 300,
  },
  {
    kind: EventStructureItemKind.SPONSOR_ACTIVATION,
    name: 'Partner AI Lounge',
    slug: 'partner-ai-lounge',
    description: 'Partner-hosted lounge with AI demos, meetings, and small-group conversations.',
    sortOrder: 310,
  },
  {
    kind: EventStructureItemKind.CUSTOM_TOUCHPOINT,
    name: 'VIP Reception',
    slug: 'vip-reception',
    description: 'Invite-only reception for speakers, sponsors, and strategic customers.',
    sortOrder: 400,
    startsAt: new Date('2026-09-17T22:00:00.000Z'),
    endsAt: new Date('2026-09-18T00:00:00.000Z'),
  },
  {
    kind: EventStructureItemKind.CUSTOM_TOUCHPOINT,
    name: 'Networking Break',
    slug: 'networking-break',
    description: 'Open networking break between major programming blocks.',
    sortOrder: 410,
  },
]

const additionalAgendaSessionNames = [
  'Future of Experience Design', 'Revenue Operations Roundtable', 'AI Governance Briefing', 'Partner Ecosystem Forum',
  'Hands-on Signal Mapping Lab', 'Customer Research Panel', 'Expo Floor Office Hours', 'Lunch and Community Tables',
  'Product Launch Readiness Workshop', 'Healthcare Experience Case Study', 'Retail Signals Playbook', 'Afternoon Networking Break',
  'Sponsor Innovation Showcase', 'Design Leaders Fireside Chat', 'Data Quality Clinic', 'Community Lightning Talks',
  'Executive Peer Exchange', 'Accessibility in Live Experiences', 'Evening Reception Briefing', 'Growth Teams Workshop',
  'Customer Story Studio', 'Day One Closing Reflection', 'Morning Wellness Walk', 'Platform Architecture Keynote',
  'Operational Excellence Panel', 'Workshop: Journey Mapping', 'Finance Leaders Roundtable', 'Expo Floor Guided Tours',
  'Lunch and Speaker Meetups', 'Field Marketing Clinic', 'Developer Experience Workshop', 'Partner Success Panel',
  'Afternoon Coffee and Networking', 'Global Events Case Study', 'Measurement Framework Lab', 'Community Program Showcase',
  'Sales Enablement Workshop', 'Leadership AMA', 'Innovation Awards Break', 'Post-Event Activation Panel',
  'Customer Advisory Board Session', 'Closing Networking Reception', 'Next Year Planning Workshop', 'Day Two Reflection',
] as const

const additionalAgendaSessions: StructureDefinition[] = additionalAgendaSessionNames.map((name, index) => {
  const day = index < 22 ? 17 : 18
  const slot = index % 11
  const startHour = 9 + Math.floor(slot / 2)
  const startMinute = slot % 2 === 0 ? 0 : 30
  const startsAt = new Date(Date.UTC(2026, 8, day, startHour + 4, startMinute))
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000)
  const formats = ['talk', 'panel', 'workshop', 'roundtable', 'break'] as const
  const tracks = ['Experience Design', 'Operations', 'Customer Growth', 'Technology'] as const
  const rooms = ['Grand Ballroom', 'Studio A', 'Studio B', 'Harbor Room'] as const
  const format = formats[index % formats.length]
  const intentionallyMissingTimes = index === 40
  const intentionallyMissingRoom = index === 41
  const intentionallyMissingTrack = index === 42
  return {
    kind: EventStructureItemKind.SESSION,
    name,
    slug: `agenda-${String(index + 1).padStart(2, '0')}`,
    description: `${format[0].toUpperCase()}${format.slice(1)} session in the ${tracks[index % tracks.length]} track.`,
    sortOrder: 2000 + index,
    startsAt: intentionallyMissingTimes ? undefined : startsAt,
    endsAt: intentionallyMissingTimes ? undefined : endsAt,
    metadata: {
      ...(intentionallyMissingRoom ? {} : { room: rooms[index % rooms.length] }),
      ...(intentionallyMissingTrack ? {} : { track: tracks[index % tracks.length] }),
      format,
      day,
      agendaSource: 'seed-voice-events-demo',
    },
  }
})

const agendaSessionDefinitions = [...structureDefinitions.filter((item) => item.kind === EventStructureItemKind.SESSION), ...additionalAgendaSessions]
const allStructureDefinitions = [...structureDefinitions.filter((item) => item.kind !== EventStructureItemKind.SESSION), ...agendaSessionDefinitions]

const listeningPointDefinitions: ListeningPointDefinition[] = [
  { slug: 'registration-check-in' }, { slug: 'overall-event-experience' },
  { slug: 'opening-keynote' }, { slug: 'product-strategy-panel' },
  { slug: 'customer-success-workshop' }, { slug: 'closing-session' },
  { slug: 'expo-floor' }, { slug: 'f-and-b-lounge' }, { slug: 'registration-desk' }, { slug: 'main-entrance' },
  { slug: 'signalthread-demo-booth' }, { slug: 'partner-ai-lounge' }, { slug: 'vip-reception' }, { slug: 'networking-break' },
]
const sessionListeningPointSlugs = new Set([
  'opening-keynote',
  'product-strategy-panel',
  'customer-success-workshop',
  'closing-session',
])

const speakerDefinitions: SpeakerDefinition[] = [
  ['Maya Chen', 'Chief Experience Officer', 'Northstar Health'], ['Jordan Patel', 'VP Product', 'SignalThread'],
  ['Avery Brooks', 'Head of Customer Strategy', 'Brightline'], ['Diego Morales', 'Director of Events', 'Fieldwork'],
  ['Sofia Reyes', 'Principal Researcher', 'Common Ground'], ['Noah Williams', 'VP Revenue Operations', 'Orbit'],
  ['Priya Nair', 'Chief Data Officer', 'Luma'], ['Ethan Cole', 'Founder', 'Moment Studio'],
  ['Leila Haddad', 'Head of Partnerships', 'Rally'], ['Marcus Grant', 'VP Marketing', 'Beacon'],
  ['Hannah Kim', 'Accessibility Lead', 'Open City'], ['Owen Price', 'Community Director', 'Mosaic'],
  ['Amara Okafor', 'SVP Customer Experience', 'Harbor Health'], ['Theo Laurent', 'Product Design Director', 'Arc Works'],
  ['Nina Alvarez', 'Head of Field Marketing', 'Cascade'], ['Samir Desai', 'Chief Operating Officer', 'Vantage Labs'],
  ['Elena Rossi', 'Director of Community', 'Kindred'], ['Malcolm Reed', 'VP Enterprise Strategy', 'Northwind'],
  ['Yuki Tanaka', 'AI Governance Lead', 'Clearpath'], ['Grace Mensah', 'Research Operations Director', 'Gather'],
  ['Ben Foster', 'Developer Experience Lead', 'Atlas Cloud'], ['Camila Torres', 'Global Events Lead', 'Juniper'],
  ['Ibrahim Khan', 'Partner Success Director', 'Elevate'], ['Zoë Martin', 'Accessibility Researcher', 'Open City'],
].map(([name, title, organization], index) => ({ id: speakerId(index), name, title, organization }))

type SpeakerAssignmentPlan = {
  sessionSlug: string
  speakerIndex: number
  role: EventSpeakerRole
  sortOrder: number
}

const speakerAssignmentPlans: SpeakerAssignmentPlan[] = agendaSessionDefinitions.flatMap((session, sessionIndex) => {
  const primary: SpeakerAssignmentPlan = {
    sessionSlug: session.slug,
    speakerIndex: sessionIndex % speakerDefinitions.length,
    role: sessionIndex % 5 === 1 ? EventSpeakerRole.PANELIST : EventSpeakerRole.SPEAKER,
    sortOrder: 0,
  }
  const extraCount = sessionIndex % 8 === 1 ? 2 : sessionIndex % 6 === 0 ? 1 : 0
  return [
    primary,
    ...Array.from({ length: extraCount }, (_, extraIndex): SpeakerAssignmentPlan => ({
      sessionSlug: session.slug,
      speakerIndex: (sessionIndex + 7 + extraIndex * 5) % speakerDefinitions.length,
      role: extraIndex === 0 ? EventSpeakerRole.PANELIST : EventSpeakerRole.MODERATOR,
      sortOrder: extraIndex + 1,
    })),
  ]
})

const baseSurveyDefinitions: SurveyDefinition[] = [
  {
    key: 'pre-event-agenda-priorities',
    name: 'Pre-event Agenda Priorities',
    description: 'Planning survey that captures attendee content priorities, speaker questions, networking goals, and agenda needs before doors open.',
    collectionPhase: CollectionPhase.PRE,
    structureSlug: 'overall-event-experience',
    token: 'events-demo-pre-event-agenda-priorities',
    questionBaseOrder: 1,
    status: EventStatus.COMPLETED,
    linkIsActive: false,
    questions: [
      {
        key: 'pre-event-agenda-question',
        label: 'What question do you most want the agenda or speakers to answer?',
        helperText: 'Capture the attendee-authored question exactly so the content team can brief speakers before the event.',
        order: 1,
      },
      {
        key: 'pre-content-priority',
        label: 'Which topic or practical example would make this event most valuable to you?',
        helperText: 'Capture desired topics, examples, and depth before the agenda is finalized.',
        order: 2,
      },
      {
        key: 'pre-networking-agenda-need',
        label: 'What networking or agenda support would help you get the most from the event?',
        helperText: 'Capture networking goals, session-choice needs, and format preferences organizers can prepare for.',
        order: 3,
      },
    ],
  },
  {
    key: 'overall-experience-pulse',
    name: 'Overall Event Pulse',
    description: 'Quick whole-event feedback on attendee sentiment, highlights, and friction.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'overall-event-experience',
    token: 'events-demo-overall-pulse',
    questionBaseOrder: 10,
    questions: [
      {
        key: 'overall-highlight',
        label: 'What has been the most valuable part of the event so far?',
        helperText: 'Ask attendees for a specific highlight, moment, or reason.',
        order: 10,
      },
      {
        key: 'overall-friction',
        label: 'What should the event team improve while the event is still happening?',
        helperText: 'Capture urgent friction, confusion, or unmet needs.',
        order: 11,
      },
      {
        key: 'overall-rating',
        label: 'How would you rate the event so far?',
        helperText: 'Use a one-to-five rating for a comparable event pulse.',
        order: 12,
        type: QuestionType.RATING_1_TO_5,
      },
    ],
  },
  {
    key: 'opening-keynote-feedback',
    name: 'Opening Keynote Feedback',
    description: 'Session-level insight for the kickoff keynote.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'opening-keynote',
    token: 'events-demo-opening-keynote',
    questionBaseOrder: 20,
    questions: [
      {
        key: 'keynote-content',
        label: 'What resonated most from the Opening Keynote?',
        helperText: 'Look for message clarity, speaker value, and audience energy.',
        order: 20,
      },
      {
        key: 'keynote-room',
        label: 'Was anything about the room, sound, or seating distracting?',
        helperText: 'Capture operational issues the event team can address.',
        order: 21,
      },
      {
        key: 'keynote-rating',
        label: 'How would you rate the Opening Keynote?',
        helperText: 'Use a one-to-five rating for the keynote experience.',
        order: 22,
        type: QuestionType.RATING_1_TO_5,
      },
    ],
  },
  {
    key: 'expo-floor-feedback',
    name: 'Expo Floor Feedback',
    description: 'Location-level insight for expo navigation, density, and exhibitor value.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'expo-floor',
    token: 'events-demo-expo-floor',
    questionBaseOrder: 30,
    questions: [
      {
        key: 'expo-value',
        label: 'What stood out to you on the Expo Floor?',
        helperText: 'Capture sponsor, exhibitor, demo, or networking value.',
        order: 30,
      },
      {
        key: 'expo-friction',
        label: 'What made the Expo Floor harder to navigate or use?',
        helperText: 'Listen for wayfinding, crowding, signage, and noise issues.',
        order: 31,
      },
      {
        key: 'expo-recommendation',
        label: 'How likely are you to recommend the Expo Floor to a colleague?',
        helperText: 'Use a zero-to-ten recommendation score for exhibitor value.',
        order: 32,
        type: QuestionType.RECOMMENDATION_0_TO_10,
      },
    ],
  },
  {
    key: 'signalthread-demo-booth-feedback',
    name: 'SignalThread Demo Booth Feedback',
    description: 'Sponsor activation feedback for the SignalThread demo booth.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'signalthread-demo-booth',
    token: 'events-demo-signalthread-booth',
    questionBaseOrder: 40,
    questions: [
      {
        key: 'booth-value',
        label: 'What was useful or memorable about the SignalThread Demo Booth?',
        helperText: 'Capture sponsor value, demos, staffing, and follow-up intent.',
        order: 40,
      },
      {
        key: 'booth-next-step',
        label: 'What would make this sponsor experience more useful?',
        helperText: 'Ask for product, demo, or staffing improvements.',
        order: 41,
      },
      {
        key: 'booth-recommendation',
        label: 'How likely are you to recommend this sponsor experience?',
        helperText: 'Use a zero-to-ten recommendation score for the activation.',
        order: 42,
        type: QuestionType.RECOMMENDATION_0_TO_10,
      },
    ],
  },
  {
    key: 'vip-reception-feedback',
    name: 'VIP Reception Feedback',
    description: 'Custom touchpoint feedback for the VIP reception experience.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'vip-reception',
    token: 'events-demo-vip-reception',
    questionBaseOrder: 50,
    status: EventStatus.COMPLETED,
    questions: [
      {
        key: 'vip-experience',
        label: 'How did the VIP Reception feel for you?',
        helperText: 'Capture atmosphere, networking value, and hospitality signals.',
        order: 50,
      },
      {
        key: 'vip-improvement',
        label: 'What would improve the VIP Reception next time?',
        helperText: 'Listen for food, access, room flow, and invitation clarity.',
        order: 51,
      },
      {
        key: 'vip-rating',
        label: 'How would you rate the VIP Reception?',
        helperText: 'Use a one-to-five hospitality rating.',
        order: 52,
        type: QuestionType.RATING_1_TO_5,
      },
    ],
  },
  {
    key: 'registration-arrival-feedback',
    name: 'Registration & Arrival Feedback',
    description: 'Arrival, check-in, and badge-pickup feedback from the existing registration listening point.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'registration-check-in',
    token: 'events-demo-registration-arrival',
    questionBaseOrder: 60,
    status: EventStatus.COMPLETED,
    questions: [
      { key: 'arrival-flow', label: 'How did registration and arrival go for you?', helperText: 'Capture queue, welcome, and badge-pickup details.', order: 60 },
      { key: 'arrival-rating', label: 'How would you rate the arrival experience?', helperText: 'Use a one-to-five arrival rating.', order: 61, type: QuestionType.RATING_1_TO_5 },
    ],
  },
  {
    key: 'food-hospitality-feedback',
    name: 'Food & Hospitality Feedback',
    description: 'Food, beverage, seating, and recharge feedback from the existing F&B Lounge listening point.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'f-and-b-lounge',
    token: 'events-demo-food-hospitality',
    questionBaseOrder: 70,
    questions: [
      { key: 'hospitality-highlight', label: 'How is food and hospitality working for you?', helperText: 'Capture quality, availability, and seating details.', order: 70 },
      { key: 'hospitality-rating', label: 'How would you rate food and hospitality?', helperText: 'Use a one-to-five hospitality rating.', order: 71, type: QuestionType.RATING_1_TO_5 },
    ],
  },
  {
    key: 'networking-feedback',
    name: 'Networking Feedback',
    description: 'Connection quality and programming feedback from the existing networking-break listening point.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'networking-break',
    token: 'events-demo-networking',
    questionBaseOrder: 80,
    questions: [
      { key: 'networking-value', label: 'What made networking useful or less useful?', helperText: 'Capture connection quality, hosts, and format.', order: 80 },
      { key: 'networking-recommendation', label: 'How likely are you to recommend this networking format?', helperText: 'Use a zero-to-ten recommendation score.', order: 81, type: QuestionType.RECOMMENDATION_0_TO_10 },
    ],
  },
  {
    key: 'venue-navigation-feedback',
    name: 'Venue & Navigation Feedback',
    description: 'Venue access, signage, and navigation feedback from the existing main-entrance listening point.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'main-entrance',
    token: 'events-demo-venue-navigation',
    questionBaseOrder: 90,
    status: EventStatus.PAUSED,
    questions: [
      { key: 'venue-navigation', label: 'What has made the venue easy or hard to navigate?', helperText: 'Capture signage, room labels, elevators, and access.', order: 90 },
      { key: 'venue-rating', label: 'How would you rate venue navigation?', helperText: 'Use a one-to-five navigation rating.', order: 91, type: QuestionType.RATING_1_TO_5 },
    ],
  },
  {
    key: 'product-strategy-panel-feedback',
    name: 'Product Strategy Panel Feedback',
    description: 'Session-level feedback for the selected Product Strategy Panel listening point.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'product-strategy-panel',
    token: 'events-demo-product-strategy-panel',
    questionBaseOrder: 100,
    status: EventStatus.COMPLETED,
    questions: [
      { key: 'product-panel-value', label: 'What was most useful from the Product Strategy Panel?', helperText: 'Capture practical content, relevance, and speaker clarity.', order: 100 },
      { key: 'product-panel-rating', label: 'How would you rate the Product Strategy Panel?', helperText: 'Use a one-to-five session rating.', order: 101, type: QuestionType.RATING_1_TO_5 },
    ],
  },
  {
    key: 'customer-success-workshop-feedback',
    name: 'Customer Success Workshop Feedback',
    description: 'Session-level feedback for the selected Customer Success Workshop listening point.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'customer-success-workshop',
    token: 'events-demo-customer-success-workshop',
    questionBaseOrder: 110,
    questions: [
      { key: 'workshop-value', label: 'What was most useful from the Customer Success Workshop?', helperText: 'Capture facilitation, materials, and practical takeaways.', order: 110 },
      { key: 'workshop-recommendation', label: 'How likely are you to recommend this workshop format?', helperText: 'Use a zero-to-ten recommendation score.', order: 111, type: QuestionType.RECOMMENDATION_0_TO_10 },
    ],
  },
  {
    key: 'closing-follow-up-feedback',
    name: 'Post-Event Follow-up',
    description: 'Post-event outcomes and learning survey for the selected Closing Session listening point.',
    collectionPhase: CollectionPhase.POST,
    structureSlug: 'closing-session',
    token: 'events-demo-closing-follow-up',
    questionBaseOrder: 120,
    status: EventStatus.COMPLETED,
    linkIsActive: false,
    questions: [
      { key: 'closing-takeaway', label: 'What should the event team carry forward after the closing session?', helperText: 'Collect post-event takeaways after launch.', order: 120 },
      { key: 'closing-recommendation', label: 'How likely are you to recommend the overall event?', helperText: 'Use a zero-to-ten post-event recommendation score.', order: 121, type: QuestionType.RECOMMENDATION_0_TO_10 },
    ],
  },
  {
    key: 'shared-session-and-speaker-feedback',
    name: 'Shared Session and Speaker Feedback',
    description: 'One reusable Advanced survey bulk-assigned to several sessions, including canonical per-presenter feedback.',
    collectionPhase: CollectionPhase.DURING,
    structureSlug: 'opening-keynote',
    token: 'events-demo-shared-session-speaker',
    questionBaseOrder: 130,
    createPublicLink: false,
    responseMode: ResponseMode.VOICE_AND_TEXT,
    questions: [
      { key: 'shared-session-value', label: 'What was most useful about this session?', helperText: 'Session context comes from the target-specific launch link.', order: 130 },
      { key: 'shared-speaker-rating', label: 'How would you rate each presenter in this session?', helperText: 'Expands to the speakers assigned to the launched session.', order: 131, type: QuestionType.SPEAKER_FEEDBACK },
    ],
  },
]

const baseResponseDefinitions: ResponseDefinition[] = [
  {
    id: 'resp_events_demo_overall_001',
    surveyKey: 'overall-experience-pulse',
    anonymousId: 'anon_events_demo_overall_001',
    startedAt: new Date('2026-09-17T16:10:00.000Z'),
    completedAt: new Date('2026-09-17T16:13:00.000Z'),
    answers: [
      {
        questionKey: 'overall-highlight',
        transcript:
          'The opening flow felt premium and the product roadmap examples were concrete. I especially liked hearing how other teams use live feedback during the event instead of waiting for a post-event survey.',
        summary: 'Attendee valued concrete product roadmap examples and live feedback positioning.',
        sentimentLabel: 'positive',
        sentimentScore: 0.82,
        urgency: 'LOW',
        themes: [{ key: 'event_value', label: 'Clear event value', sentimentLabel: 'positive', confidence: 0.92 }],
        entities: [{ type: 'TOPIC', label: 'live feedback', confidence: 0.88 }],
        actions: [],
      },
      {
        questionKey: 'overall-friction',
        transcript:
          'The only snag was the badge pickup line around nine. It moved eventually, but the signs did not make it obvious where speakers versus general attendees should go.',
        summary: 'Badge pickup line and unclear attendee lanes created arrival friction.',
        sentimentLabel: 'negative',
        sentimentScore: -0.58,
        urgency: 'HIGH',
        frictionCategory: 'access_checkin',
        actionWindow: 'NOW',
        recommendedAction: 'Add clearer speaker and attendee lane signage at registration before the next arrival rush.',
        themes: [{ key: 'checkin_friction', label: 'Check-in friction', sentimentLabel: 'negative', confidence: 0.91 }],
        entities: [{ type: 'LOCATION', label: 'badge pickup', confidence: 0.9 }],
        actions: [
          {
            title: 'Clarify registration lanes',
            description: 'Place speaker and general attendee signs where the queue splits.',
            priority: 'Immediate',
            urgency: 'HIGH',
            actionWindow: 'NOW',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_overall_002',
    surveyKey: 'overall-experience-pulse',
    anonymousId: 'anon_events_demo_overall_002',
    startedAt: new Date('2026-09-17T19:40:00.000Z'),
    completedAt: new Date('2026-09-17T19:44:00.000Z'),
    answers: [
      {
        questionKey: 'overall-highlight',
        transcript:
          'The hallway conversations have been excellent. I met two other operations leaders wrestling with the same voice of customer problems, and the event feels curated rather than generic.',
        summary: 'Networking quality is a strong event highlight.',
        sentimentLabel: 'positive',
        sentimentScore: 0.76,
        urgency: 'LOW',
        themes: [{ key: 'networking_value', label: 'High-value networking', sentimentLabel: 'positive', confidence: 0.88 }],
        entities: [{ type: 'TOPIC', label: 'operations leaders', confidence: 0.8 }],
        actions: [],
      },
      {
        questionKey: 'overall-friction',
        transcript:
          'I keep seeing people ask where the afternoon workshops are. The app has the room names, but the printed signs near the elevators do not match the room labels.',
        summary: 'Mismatched signage and app room labels are causing wayfinding confusion.',
        sentimentLabel: 'negative',
        sentimentScore: -0.64,
        urgency: 'HIGH',
        frictionCategory: 'wayfinding',
        actionWindow: 'NOW',
        recommendedAction: 'Update elevator signage to match the app room labels for afternoon workshops.',
        themes: [{ key: 'wayfinding_confusion', label: 'Wayfinding confusion', sentimentLabel: 'negative', confidence: 0.9 }],
        entities: [{ type: 'LOCATION', label: 'elevators', confidence: 0.77 }],
        actions: [
          {
            title: 'Align workshop signage',
            description: 'Use the same room labels on printed signs and in the event app.',
            priority: 'Immediate',
            urgency: 'HIGH',
            actionWindow: 'NOW',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_keynote_001',
    surveyKey: 'opening-keynote-feedback',
    anonymousId: 'anon_events_demo_keynote_001',
    startedAt: new Date('2026-09-17T15:05:00.000Z'),
    completedAt: new Date('2026-09-17T15:08:00.000Z'),
    answers: [
      {
        questionKey: 'keynote-content',
        transcript:
          'The customer story in the keynote was the strongest part. It made the strategy feel real, not just aspirational. The speaker also kept the pace moving.',
        summary: 'Customer story made keynote strategy feel concrete and credible.',
        sentimentLabel: 'positive',
        sentimentScore: 0.87,
        urgency: 'LOW',
        themes: [{ key: 'session_content', label: 'Strong session content', sentimentLabel: 'positive', confidence: 0.93 }],
        entities: [{ type: 'SESSION', label: 'Opening Keynote', confidence: 0.94 }],
        actions: [],
      },
      {
        questionKey: 'keynote-room',
        transcript:
          'The audio was clear where I sat, but the back left section was too cold and people kept stepping out to grab jackets.',
        summary: 'Back-left keynote seating area felt too cold.',
        sentimentLabel: 'negative',
        sentimentScore: -0.35,
        urgency: 'MEDIUM',
        frictionCategory: 'room_environment_av',
        actionWindow: 'NEXT_BLOCK',
        recommendedAction: 'Ask venue operations to check temperature in the back-left keynote seating section.',
        themes: [{ key: 'room_environment', label: 'Room environment', sentimentLabel: 'negative', confidence: 0.79 }],
        entities: [{ type: 'LOCATION', label: 'back left section', confidence: 0.73 }],
        actions: [
          {
            title: 'Check keynote room temperature',
            description: 'Adjust HVAC or add a venue note for the back-left seating area.',
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'NEXT_BLOCK',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_keynote_002',
    surveyKey: 'opening-keynote-feedback',
    anonymousId: 'anon_events_demo_keynote_002',
    startedAt: new Date('2026-09-17T15:12:00.000Z'),
    completedAt: new Date('2026-09-17T15:15:00.000Z'),
    answers: [
      {
        questionKey: 'keynote-content',
        transcript:
          'Great energy, but the Q and A ended right when the best questions started. I would have traded five minutes of intro for more audience questions.',
        summary: 'Audience wanted more Q and A time in the keynote.',
        sentimentLabel: 'neutral',
        sentimentScore: 0.12,
        urgency: 'MEDIUM',
        frictionCategory: 'session_content_speakers',
        actionWindow: 'NEXT_SESSION',
        recommendedAction: 'Protect additional audience Q and A time in upcoming high-demand sessions.',
        themes: [{ key: 'qa_time', label: 'More Q and A time', sentimentLabel: 'neutral', confidence: 0.82 }],
        entities: [{ type: 'SESSION', label: 'Opening Keynote', confidence: 0.92 }],
        actions: [
          {
            title: 'Extend Q and A in popular sessions',
            description: 'Trim intros or hold a follow-up discussion for high-interest topics.',
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'NEXT_SESSION',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_expo_001',
    surveyKey: 'expo-floor-feedback',
    anonymousId: 'anon_events_demo_expo_001',
    startedAt: new Date('2026-09-17T18:35:00.000Z'),
    completedAt: new Date('2026-09-17T18:39:00.000Z'),
    answers: [
      {
        questionKey: 'expo-value',
        transcript:
          'The expo floor has a lot of useful vendors, and the smaller demo stations are easier to approach than the big theater demos.',
        summary: 'Smaller demo stations make expo conversations easier.',
        sentimentLabel: 'positive',
        sentimentScore: 0.7,
        urgency: 'LOW',
        themes: [{ key: 'expo_demo_value', label: 'Expo demo value', sentimentLabel: 'positive', confidence: 0.86 }],
        entities: [{ type: 'LOCATION', label: 'expo floor', confidence: 0.9 }],
        actions: [],
      },
      {
        questionKey: 'expo-friction',
        transcript:
          'The far aisle near the partner booths is packed and the signs for the AI Lounge are hidden behind a banner. I circled twice before finding it.',
        summary: 'Crowding and hidden signage made Partner AI Lounge hard to find.',
        sentimentLabel: 'negative',
        sentimentScore: -0.72,
        urgency: 'HIGH',
        frictionCategory: 'wayfinding',
        actionWindow: 'NOW',
        recommendedAction: 'Move AI Lounge signage above the aisle banner and open a wider lane near partner booths.',
        themes: [{ key: 'expo_wayfinding', label: 'Expo wayfinding', sentimentLabel: 'negative', confidence: 0.93 }],
        entities: [
          { type: 'LOCATION', label: 'Partner AI Lounge', confidence: 0.87 },
          { type: 'LOCATION', label: 'partner booths', confidence: 0.76 },
        ],
        actions: [
          {
            title: 'Expose Partner AI Lounge signage',
            description: 'Raise or move signage so it is visible above the partner aisle banner.',
            priority: 'Immediate',
            urgency: 'HIGH',
            actionWindow: 'NOW',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_expo_002',
    surveyKey: 'expo-floor-feedback',
    anonymousId: 'anon_events_demo_expo_002',
    startedAt: new Date('2026-09-18T16:05:00.000Z'),
    completedAt: new Date('2026-09-18T16:09:00.000Z'),
    answers: [
      {
        questionKey: 'expo-friction',
        transcript:
          'The expo was lively, but the coffee line spills into the demo aisle and makes it tough to hear the exhibitors.',
        summary: 'Coffee queue spills into demo aisle and creates noise/crowding.',
        sentimentLabel: 'negative',
        sentimentScore: -0.5,
        urgency: 'MEDIUM',
        frictionCategory: 'food_beverage',
        actionWindow: 'NEXT_BLOCK',
        recommendedAction: 'Redirect the coffee queue away from the demo aisle before the afternoon break.',
        themes: [{ key: 'food_queue_crowding', label: 'Food and beverage crowding', sentimentLabel: 'negative', confidence: 0.84 }],
        entities: [
          { type: 'LOCATION', label: 'coffee line', confidence: 0.8 },
          { type: 'LOCATION', label: 'demo aisle', confidence: 0.82 },
        ],
        actions: [
          {
            title: 'Move coffee queue away from demos',
            description: 'Use stanchions or staff guidance to keep the demo aisle clear.',
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'NEXT_BLOCK',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_booth_001',
    surveyKey: 'signalthread-demo-booth-feedback',
    anonymousId: 'anon_events_demo_booth_001',
    startedAt: new Date('2026-09-17T20:15:00.000Z'),
    completedAt: new Date('2026-09-17T20:20:00.000Z'),
    answers: [
      {
        questionKey: 'booth-value',
        transcript:
          'The SignalThread demo booth was one of the better sponsor stops. The live dashboard made it obvious how feedback turns into action briefs.',
        summary: 'Sponsor booth clearly demonstrated live feedback turning into action briefs.',
        sentimentLabel: 'positive',
        sentimentScore: 0.88,
        urgency: 'LOW',
        themes: [{ key: 'sponsor_demo_value', label: 'Sponsor demo value', sentimentLabel: 'positive', confidence: 0.94 }],
        entities: [
          { type: 'SPONSOR', label: 'SignalThread', confidence: 0.95 },
          { type: 'TOPIC', label: 'action briefs', confidence: 0.87 },
        ],
        actions: [],
      },
      {
        questionKey: 'booth-next-step',
        transcript:
          'I wanted a takeaway card with the QR code and pricing path. The staff were helpful, but the follow-up step was not obvious.',
        summary: 'Attendee wanted clearer sponsor follow-up materials.',
        sentimentLabel: 'negative',
        sentimentScore: -0.24,
        urgency: 'MEDIUM',
        frictionCategory: 'sponsor_exhibitor_experience',
        actionWindow: 'TODAY',
        recommendedAction: 'Put QR and follow-up cards at the SignalThread booth counter.',
        themes: [{ key: 'sponsor_followup', label: 'Sponsor follow-up clarity', sentimentLabel: 'neutral', confidence: 0.85 }],
        entities: [{ type: 'SPONSOR', label: 'SignalThread', confidence: 0.95 }],
        actions: [
          {
            title: 'Add sponsor follow-up cards',
            description: 'Place QR and pricing path cards at the SignalThread demo booth.',
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'TODAY',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_booth_002',
    surveyKey: 'signalthread-demo-booth-feedback',
    anonymousId: 'anon_events_demo_booth_002',
    startedAt: new Date('2026-09-18T17:25:00.000Z'),
    completedAt: new Date('2026-09-18T17:30:00.000Z'),
    answers: [
      {
        questionKey: 'booth-value',
        transcript:
          'The booth team tied the demo to our conference use case really well. I would send our event ops lead here.',
        summary: 'Sponsor demo felt relevant to event operations buyer needs.',
        sentimentLabel: 'positive',
        sentimentScore: 0.83,
        urgency: 'LOW',
        themes: [{ key: 'sponsor_relevance', label: 'Sponsor relevance', sentimentLabel: 'positive', confidence: 0.9 }],
        entities: [{ type: 'SPONSOR', label: 'SignalThread', confidence: 0.96 }],
        actions: [],
      },
    ],
  },
  {
    id: 'resp_events_demo_vip_001',
    surveyKey: 'vip-reception-feedback',
    anonymousId: 'anon_events_demo_vip_001',
    startedAt: new Date('2026-09-18T00:20:00.000Z'),
    completedAt: new Date('2026-09-18T00:24:00.000Z'),
    answers: [
      {
        questionKey: 'vip-experience',
        transcript:
          'The VIP reception felt intimate and useful. I had two high-quality conversations with speakers that would not have happened on the expo floor.',
        summary: 'VIP reception delivered high-quality speaker networking.',
        sentimentLabel: 'positive',
        sentimentScore: 0.84,
        urgency: 'LOW',
        themes: [{ key: 'vip_networking', label: 'VIP networking value', sentimentLabel: 'positive', confidence: 0.91 }],
        entities: [{ type: 'TOUCHPOINT', label: 'VIP Reception', confidence: 0.9 }],
        actions: [],
      },
      {
        questionKey: 'vip-improvement',
        transcript:
          'The room was hard to find because the invite said terrace lounge but the sign outside said executive suite. A small host stand would fix it.',
        summary: 'VIP room naming mismatch created access confusion.',
        sentimentLabel: 'negative',
        sentimentScore: -0.46,
        urgency: 'MEDIUM',
        frictionCategory: 'wayfinding',
        actionWindow: 'NEXT_EVENT',
        recommendedAction: 'Use matching VIP room names on invitations and onsite signage.',
        themes: [{ key: 'vip_access', label: 'VIP access clarity', sentimentLabel: 'negative', confidence: 0.86 }],
        entities: [{ type: 'LOCATION', label: 'terrace lounge', confidence: 0.75 }],
        actions: [
          {
            title: 'Match VIP invite and signage names',
            description: 'Use one room name across invitations, host stand signage, and staff notes.',
            priority: 'Watch',
            urgency: 'MEDIUM',
            actionWindow: 'NEXT_EVENT',
          },
        ],
      },
    ],
  },
  {
    id: 'resp_events_demo_vip_002',
    surveyKey: 'vip-reception-feedback',
    anonymousId: 'anon_events_demo_vip_002',
    startedAt: new Date('2026-09-18T00:45:00.000Z'),
    completedAt: new Date('2026-09-18T00:48:00.000Z'),
    answers: [
      {
        questionKey: 'vip-improvement',
        transcript:
          'Food ran low near the end of the reception. The conversations were excellent, but several people arrived after the keynote dinner and missed the passed appetizers.',
        summary: 'VIP food supply ran low late in the reception.',
        sentimentLabel: 'negative',
        sentimentScore: -0.4,
        urgency: 'MEDIUM',
        frictionCategory: 'food_beverage',
        actionWindow: 'NEXT_EVENT',
        recommendedAction: 'Hold back a late-replenishment tray for VIP reception arrivals after dinner.',
        themes: [{ key: 'vip_food_supply', label: 'VIP food supply', sentimentLabel: 'negative', confidence: 0.82 }],
        entities: [{ type: 'TOUCHPOINT', label: 'VIP Reception', confidence: 0.88 }],
        actions: [
          {
            title: 'Plan late VIP food replenishment',
            description: 'Reserve food for attendees arriving after late programming.',
            priority: 'Watch',
            urgency: 'MEDIUM',
            actionWindow: 'NEXT_EVENT',
          },
        ],
      },
    ],
  },
]

const planningResponseProfiles = [
  {
    question: 'How are companies actually measuring ROI from AI initiatives?',
    content: 'Practical AI case studies with real adoption metrics would make the event most valuable to me, especially examples that connect investment to customer outcomes.',
    network: 'I want to meet operations leaders who are already measuring AI value, and a role-based session guide would help me choose between overlapping sessions.',
    networkTheme: 'Session choice guidance',
    networkAction: 'Publish a role-based session choice guide',
  },
  {
    question: 'What are the biggest mistakes teams make when introducing AI agents?',
    content: 'I want candid implementation examples that cover failure modes, team adoption, and what leaders changed after an AI rollout did not work as planned.',
    network: 'Small hosted roundtables grouped by AI maturity would help me find peers facing the same implementation decisions before the larger reception.',
    networkTheme: 'Intentional networking matches',
    networkAction: 'Prepare hosted networking matches',
  },
  {
    question: 'Can the speakers share examples of AI governance that works in practice?',
    content: 'Concrete governance playbooks are a high priority; I need examples of approval paths, ownership, and safeguards rather than a high-level principles discussion.',
    network: 'The agenda has many relevant sessions, so a recommended path for governance-focused attendees would help me avoid choosing between sessions blindly.',
    networkTheme: 'Session choice guidance',
    networkAction: 'Publish a role-based session choice guide',
  },
  {
    question: 'How should smaller teams prioritize which AI workflows to automate first?',
    content: 'Examples designed for small teams with limited data and engineering support would be more useful than enterprise-only transformation stories.',
    network: 'A first-time attendee meetup with facilitated introductions would make networking less dependent on already knowing people in the room.',
    networkTheme: 'Intentional networking matches',
    networkAction: 'Prepare hosted networking matches',
  },
  {
    question: 'Will there be examples specific to customer experience teams?',
    content: 'Customer experience examples are my main content priority, especially practical uses of AI for research synthesis and closing the feedback loop.',
    network: 'I hope to meet customer experience leaders running similar programs, so role labels or hosted topic tables would make the event more valuable.',
    networkTheme: 'Intentional networking matches',
    networkAction: 'Prepare hosted networking matches',
  },
  {
    question: 'How can teams measure AI outcomes without encouraging shallow productivity metrics?',
    content: 'I want speakers to compare meaningful outcome measures and show how teams balance speed, quality, trust, and customer impact.',
    network: 'A clear agenda path separating introductory and advanced material would help me spend time on the sessions that match my experience level.',
    networkTheme: 'Session choice guidance',
    networkAction: 'Publish a role-based session choice guide',
  },
  {
    question: 'How do teams introduce AI while keeping human judgment in critical customer decisions?',
    content: 'Detailed operating examples about human review, escalation, and responsible automation would make the speaker sessions useful for my team.',
    network: 'I prefer small-group discussions around shared problems instead of unstructured networking, particularly for responsible AI and customer trust.',
    networkTheme: 'Intentional networking matches',
    networkAction: 'Prepare hosted networking matches',
  },
  {
    question: 'What data-readiness work should teams complete before choosing an AI use case?',
    content: 'Hands-on data quality and signal-mapping examples are in high demand for my team because we need a realistic starting point, not another trend overview.',
    network: 'Please send a session decision guide before the event so I can compare the labs, panels, and roundtables against my learning goals.',
    networkTheme: 'Session choice guidance',
    networkAction: 'Publish a role-based session choice guide',
  },
] as const

function buildPlanningResponses(): ResponseDefinition[] {
  return planningResponseProfiles.map((profile, index) => {
    const sequence = index + 1
    const startedAt = new Date(Date.UTC(2026, 8, 3 + index, 14, index * 7))
    return {
      id: `resp_events_demo_pre_event_agenda_${String(sequence).padStart(3, '0')}`,
      surveyKey: 'pre-event-agenda-priorities',
      anonymousId: `anon_events_demo_pre_event_agenda_${String(sequence).padStart(3, '0')}`,
      startedAt,
      completedAt: new Date(startedAt.getTime() + 2 * 60_000),
      answers: [
        {
          questionKey: 'pre-event-agenda-question',
          transcript: profile.question,
          summary: profile.question,
          sentimentLabel: 'neutral',
          sentimentScore: 0.08,
          urgency: 'MEDIUM',
          themes: [{ key: 'speaker_questions', label: 'Questions for speakers', sentimentLabel: 'neutral', confidence: 0.96 }],
          entities: [{ type: 'TOPIC', label: 'AI implementation', confidence: 0.9 }],
          actions: [],
        },
        {
          questionKey: 'pre-content-priority',
          transcript: profile.content,
          summary: profile.content,
          sentimentLabel: 'positive',
          sentimentScore: 0.5,
          urgency: 'MEDIUM',
          frictionCategory: 'session_content_speakers',
          actionWindow: 'THIS_WEEK',
          recommendedAction: 'Brief speakers to address attendee demand for practical AI examples, implementation detail, and measurable outcomes.',
          themes: [{ key: 'practical_ai_content', label: 'Practical AI examples', sentimentLabel: 'positive', confidence: 0.92 }],
          entities: [{ type: 'TOPIC', label: 'practical AI', confidence: 0.94 }],
          actions: [{
            title: 'Brief speakers on practical AI questions',
            description: 'Share the attendee-authored questions and requested practical examples with speakers before doors open.',
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'THIS_WEEK',
          }],
        },
        {
          questionKey: 'pre-networking-agenda-need',
          transcript: profile.network,
          summary: profile.network,
          sentimentLabel: 'neutral',
          sentimentScore: -0.12,
          urgency: 'MEDIUM',
          frictionCategory: profile.networkAction.includes('session') ? 'agenda_programming' : 'networking_program',
          actionWindow: 'THIS_WEEK',
          recommendedAction: profile.networkAction,
          themes: [{ key: profile.networkAction.includes('session') ? 'session_choice_support' : 'networking_expectations', label: profile.networkTheme, sentimentLabel: 'neutral', confidence: 0.9 }],
          entities: [{ type: 'TOPIC', label: profile.networkAction.includes('session') ? 'agenda planning' : 'networking goals', confidence: 0.9 }],
          actions: [{
            title: profile.networkAction,
            description: profile.network,
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'THIS_WEEK',
          }],
        },
      ],
    }
  })
}

const postEventResponseProfiles = [
  { takeaway: 'The practical AI case studies and hosted peer conversations delivered the clearest value. Keep both formats and send a short implementation toolkit as follow-through.', rating: 9, themeKey: 'post_practical_value', themeLabel: 'Practical content outcomes' },
  { takeaway: 'The content was strong, but inconsistent room names and expo destination signs cost time between sessions. A single source of truth for venue labels should be part of next year\'s plan.', rating: 6, themeKey: 'post_wayfinding_learning', themeLabel: 'Wayfinding learning', action: 'Standardize venue labels for the next event' },
  { takeaway: 'Registration staff recovered well after the opening rush, but the unclear lane split shaped the first impression. Keep the greeter role and place lane signs before the queue starts.', rating: 7, themeKey: 'post_arrival_learning', themeLabel: 'Arrival experience learning', action: 'Redesign the next-event arrival plan' },
  { takeaway: 'The Customer Success Workshop was useful, and a completed worksheet example would make the exercise much easier to apply after the event.', rating: 7, themeKey: 'post_workshop_learning', themeLabel: 'Workshop follow-through', action: 'Add a completed workshop example' },
  { takeaway: 'Hosted introductions made networking unusually productive. Preserve the topic tables and give first-time attendees a clear entry point next year.', rating: 9, themeKey: 'post_networking_value', themeLabel: 'Networking outcomes' },
  { takeaway: 'I left with a clearer AI roadmap and several speaker answers I can use with my team. A follow-up package linking the recordings, templates, and unanswered questions would extend the value.', rating: 8, themeKey: 'post_follow_through', themeLabel: 'Post-event follow-through', action: 'Publish the attendee follow-through package' },
] as const

function buildPostEventResponses(): ResponseDefinition[] {
  return postEventResponseProfiles.map((profile, index) => {
    const sequence = index + 1
    const startedAt = new Date(Date.UTC(2026, 8, 19 + Math.floor(index / 3), 14, index * 9))
    const hasAction = 'action' in profile
    return {
      id: `resp_events_demo_post_event_${String(sequence).padStart(3, '0')}`,
      surveyKey: 'closing-follow-up-feedback',
      anonymousId: `anon_events_demo_post_event_${String(sequence).padStart(3, '0')}`,
      startedAt,
      completedAt: new Date(startedAt.getTime() + 3 * 60_000),
      answers: [
        {
          questionKey: 'closing-takeaway',
          transcript: profile.takeaway,
          summary: profile.takeaway,
          sentimentLabel: profile.rating >= 8 ? 'positive' : profile.rating === 7 ? 'neutral' : 'negative',
          sentimentScore: profile.rating >= 8 ? 0.72 : profile.rating === 7 ? 0.08 : -0.42,
          urgency: hasAction ? 'MEDIUM' : 'LOW',
          frictionCategory: hasAction ? (profile.themeKey.includes('wayfinding') ? 'wayfinding' : profile.themeKey.includes('arrival') ? 'access_checkin' : 'session_content_speakers') : undefined,
          actionWindow: hasAction ? 'NEXT_EVENT' : undefined,
          recommendedAction: hasAction ? profile.action : undefined,
          themes: [{ key: profile.themeKey, label: profile.themeLabel, sentimentLabel: profile.rating >= 8 ? 'positive' : profile.rating === 7 ? 'neutral' : 'negative', confidence: 0.91 }],
          entities: [{ type: 'EVENT', label: DEFAULT_EVENT_NAME, confidence: 0.95 }],
          actions: hasAction ? [{
            title: profile.action,
            description: profile.takeaway,
            priority: 'Soon',
            urgency: 'MEDIUM',
            actionWindow: 'NEXT_EVENT',
          }] : [],
        },
        {
          questionKey: 'closing-recommendation',
          transcript: `Recommendation score: ${profile.rating} out of 10.`,
          summary: `Post-event recommendation score recorded at ${profile.rating}.`,
          sentimentLabel: profile.rating >= 8 ? 'positive' : profile.rating === 7 ? 'neutral' : 'negative',
          sentimentScore: profile.rating >= 8 ? 0.7 : profile.rating === 7 ? 0 : -0.45,
          urgency: 'LOW',
          themes: [{ key: 'post_event_recommendation', label: 'Post-event recommendation', sentimentLabel: profile.rating >= 8 ? 'positive' : profile.rating === 7 ? 'neutral' : 'negative', confidence: 0.94 }],
          entities: [{ type: 'EVENT', label: DEFAULT_EVENT_NAME, confidence: 0.95 }],
          actions: [],
          numericValue: profile.rating,
        },
      ],
    }
  })
}

type SupplementalInsight = {
  transcript: string
  summary: string
  themeKey: string
  themeLabel: string
  frictionCategory?: string
  recommendedAction?: string
  actionTitle?: string
}

type SupplementalResponsePlan = {
  surveyKey: string
  idPrefix: string
  startIndex: number
  count: number
  startsAt: Date
  voiceQuestionKey: string
  structuredQuestionKey: string
  scale: 5 | 10
  positive: SupplementalInsight
  mixed: SupplementalInsight
  negative: SupplementalInsight
  entity: { type: string; label: string }
}

const supplementalResponsePlans: SupplementalResponsePlan[] = [
  {
    surveyKey: 'overall-experience-pulse', idPrefix: 'overall', startIndex: 3, count: 10, startsAt: new Date('2026-09-17T16:25:00.000Z'), voiceQuestionKey: 'overall-highlight', structuredQuestionKey: 'overall-rating', scale: 5,
    positive: { transcript: 'The event feels intentionally designed. The peer stories and the chance to compare live operating practices have been especially useful.', summary: 'Attendee found the event design and peer learning valuable.', themeKey: 'event_value', themeLabel: 'Clear event value' },
    mixed: { transcript: 'The content is useful and the people are strong, although a little more time between major blocks would make it easier to follow through on conversations.', summary: 'Attendee valued content but wanted more transition time.', themeKey: 'agenda_density', themeLabel: 'Agenda pacing' },
    negative: { transcript: 'The agenda is valuable, but the transition between rooms is tighter than the signage and elevators can support.', summary: 'Tight transitions and navigation are creating event-level friction.', themeKey: 'wayfinding_confusion', themeLabel: 'Wayfinding confusion', frictionCategory: 'wayfinding', recommendedAction: 'Add transition guides near elevators and protect a longer room-change buffer.', actionTitle: 'Improve transition wayfinding' },
    entity: { type: 'TOPIC', label: 'live event operations' },
  },
  {
    surveyKey: 'opening-keynote-feedback', idPrefix: 'keynote', startIndex: 3, count: 8, startsAt: new Date('2026-09-17T15:20:00.000Z'), voiceQuestionKey: 'keynote-content', structuredQuestionKey: 'keynote-rating', scale: 5,
    positive: { transcript: 'The keynote speaker made the strategy concrete with customer examples and kept the room engaged without overexplaining the basics.', summary: 'Attendee positively evaluated the keynote speaker delivery and examples.', themeKey: 'speaker_delivery', themeLabel: 'Clear speaker delivery' },
    mixed: { transcript: 'The keynote speaker was clear, though the most useful discussion started late and I wanted more audience questions before the close.', summary: 'Attendee liked speaker clarity but wanted more audience discussion.', themeKey: 'qa_time', themeLabel: 'More Q and A time' },
    negative: { transcript: 'The keynote message was promising, but the Q and A was cut short before the speaker could address the practical implementation questions.', summary: 'Attendee wanted more speaker-led Q and A time.', themeKey: 'qa_time', themeLabel: 'More Q and A time', frictionCategory: 'session_content_speakers', recommendedAction: 'Reserve a protected audience Q and A segment for future keynotes.', actionTitle: 'Protect keynote Q and A time' },
    entity: { type: 'SPEAKER', label: 'Maya Chen' },
  },
  {
    surveyKey: 'expo-floor-feedback', idPrefix: 'expo', startIndex: 3, count: 9, startsAt: new Date('2026-09-17T18:50:00.000Z'), voiceQuestionKey: 'expo-value', structuredQuestionKey: 'expo-recommendation', scale: 10,
    positive: { transcript: 'The exhibitor mix is practical and the smaller demo stations make it easy to ask focused questions without competing with a stage presentation.', summary: 'Attendee found the expo exhibitor mix and demo format useful.', themeKey: 'expo_demo_value', themeLabel: 'Expo demo value' },
    mixed: { transcript: 'There are useful conversations on the expo floor, but the busiest aisle becomes noisy enough that it is hard to compare demos.', summary: 'Attendee saw expo value but experienced crowding and noise.', themeKey: 'expo_crowding', themeLabel: 'Expo crowding' },
    negative: { transcript: 'I found the exhibitors I needed, but the partner aisles and the AI Lounge signs still make the floor feel harder to navigate than it should.', summary: 'Expo wayfinding remains difficult around partner destinations.', themeKey: 'expo_wayfinding', themeLabel: 'Expo wayfinding', frictionCategory: 'wayfinding', recommendedAction: 'Raise destination signs above booth banners and post an aisle-level map.', actionTitle: 'Improve expo destination signage' },
    entity: { type: 'LOCATION', label: 'Expo Floor' },
  },
  {
    surveyKey: 'signalthread-demo-booth-feedback', idPrefix: 'booth', startIndex: 3, count: 6, startsAt: new Date('2026-09-17T20:35:00.000Z'), voiceQuestionKey: 'booth-value', structuredQuestionKey: 'booth-recommendation', scale: 10,
    positive: { transcript: 'The booth team connected the demo to the real operating decisions I make after an event, and the live evidence view was easy to understand.', summary: 'Attendee valued the sponsor demo relevance and clarity.', themeKey: 'sponsor_demo_value', themeLabel: 'Sponsor demo value' },
    mixed: { transcript: 'The demonstration was useful, though I was not sure whether the next step was a follow-up meeting, a QR code, or a handout.', summary: 'Attendee valued the demo but wanted a clearer follow-up path.', themeKey: 'sponsor_followup', themeLabel: 'Sponsor follow-up clarity' },
    negative: { transcript: 'The team was helpful, but I left the booth without a clear way to save the product details or request the relevant follow-up.', summary: 'Sponsor follow-up path is unclear after otherwise strong demos.', themeKey: 'sponsor_followup', themeLabel: 'Sponsor follow-up clarity', frictionCategory: 'sponsor_exhibitor_experience', recommendedAction: 'Put a visible QR and use-case card at each demo station.', actionTitle: 'Clarify sponsor follow-up path' },
    entity: { type: 'SPONSOR', label: 'SignalThread' },
  },
  {
    surveyKey: 'vip-reception-feedback', idPrefix: 'vip', startIndex: 3, count: 5, startsAt: new Date('2026-09-18T00:55:00.000Z'), voiceQuestionKey: 'vip-experience', structuredQuestionKey: 'vip-rating', scale: 5,
    positive: { transcript: 'The smaller setting made it easy to meet the right people and the hosts were thoughtful about introductions.', summary: 'Attendee valued the VIP reception networking and hosting.', themeKey: 'vip_networking', themeLabel: 'VIP networking value' },
    mixed: { transcript: 'The conversations were excellent, although late arrivals needed clearer directions and a little more food availability.', summary: 'Attendee valued VIP networking but noted late-arrival hospitality gaps.', themeKey: 'vip_food_supply', themeLabel: 'VIP food supply' },
    negative: { transcript: 'The reception was worth attending, but the room name on the invite and signage still did not match and late food ran out quickly.', summary: 'VIP access and late food availability require follow-up.', themeKey: 'vip_access', themeLabel: 'VIP access clarity', frictionCategory: 'food_beverage', recommendedAction: 'Use one room name and reserve a late-arrival food replenishment tray.', actionTitle: 'Improve VIP arrival and food plan' },
    entity: { type: 'TOUCHPOINT', label: 'VIP Reception' },
  },
  {
    surveyKey: 'registration-arrival-feedback', idPrefix: 'registration', startIndex: 1, count: 10, startsAt: new Date('2026-09-17T13:10:00.000Z'), voiceQuestionKey: 'arrival-flow', structuredQuestionKey: 'arrival-rating', scale: 5,
    positive: { transcript: 'Badge pickup was welcoming and staff quickly pointed me to the right line, so I was in the first session without any uncertainty.', summary: 'Attendee had a smooth, welcoming arrival experience.', themeKey: 'arrival_welcome', themeLabel: 'Welcoming arrival' },
    mixed: { transcript: 'The team was helpful once I reached the desk, but the queue split was not obvious from the entrance.', summary: 'Attendee found staff helpful but queue routing unclear.', themeKey: 'checkin_friction', themeLabel: 'Check-in friction' },
    negative: { transcript: 'The badge line moved eventually, but I could not tell which lane was for general attendees and which was for speakers until I was already waiting.', summary: 'Registration lane signage is insufficient.', themeKey: 'checkin_friction', themeLabel: 'Check-in friction', frictionCategory: 'access_checkin', recommendedAction: 'Place large lane signs before the queue split and add a greeter during peak arrival.', actionTitle: 'Clarify registration lanes' },
    entity: { type: 'LOCATION', label: 'Registration Desk' },
  },
  {
    surveyKey: 'food-hospitality-feedback', idPrefix: 'food', startIndex: 1, count: 9, startsAt: new Date('2026-09-17T17:15:00.000Z'), voiceQuestionKey: 'hospitality-highlight', structuredQuestionKey: 'hospitality-rating', scale: 5,
    positive: { transcript: 'The food stations are easy to use and the lounge has enough seating to reset between sessions without losing the energy of the event.', summary: 'Attendee valued food quality and lounge seating.', themeKey: 'hospitality_quality', themeLabel: 'Hospitality quality' },
    mixed: { transcript: 'The food itself is good, although the coffee queue sometimes spills toward the demo aisle at the busiest break.', summary: 'Attendee liked food but noted queue spillover.', themeKey: 'food_queue_crowding', themeLabel: 'Food and beverage crowding' },
    negative: { transcript: 'The coffee line crosses the demo aisle and makes it difficult to move or hear exhibitors during the break.', summary: 'Coffee queue is disrupting nearby expo activity.', themeKey: 'food_queue_crowding', themeLabel: 'Food and beverage crowding', frictionCategory: 'food_beverage', recommendedAction: 'Move the coffee queue behind the lounge boundary with stanchions and staff guidance.', actionTitle: 'Redirect coffee queue' },
    entity: { type: 'LOCATION', label: 'F&B Lounge' },
  },
  {
    surveyKey: 'networking-feedback', idPrefix: 'networking', startIndex: 1, count: 8, startsAt: new Date('2026-09-17T19:00:00.000Z'), voiceQuestionKey: 'networking-value', structuredQuestionKey: 'networking-recommendation', scale: 10,
    positive: { transcript: 'The hosted prompts made it much easier to find people with similar operational challenges instead of relying on random introductions.', summary: 'Attendee valued the intentional networking format.', themeKey: 'networking_value', themeLabel: 'High-value networking' },
    mixed: { transcript: 'I met useful people, though a clearer signal for first-time attendees would make it easier to join an existing conversation.', summary: 'Attendee valued networking but wanted an easier entry point.', themeKey: 'networking_access', themeLabel: 'Networking access' },
    negative: { transcript: 'The room was lively, but I could not tell where the hosted conversations were supposed to begin after the break started.', summary: 'Networking format needs clearer on-site orientation.', themeKey: 'networking_access', themeLabel: 'Networking access', frictionCategory: 'wayfinding', recommendedAction: 'Add a host-led start point and visible topic signs for each networking break.', actionTitle: 'Clarify networking start points' },
    entity: { type: 'TOUCHPOINT', label: 'Networking Break' },
  },
  {
    surveyKey: 'venue-navigation-feedback', idPrefix: 'venue', startIndex: 1, count: 5, startsAt: new Date('2026-09-17T14:20:00.000Z'), voiceQuestionKey: 'venue-navigation', structuredQuestionKey: 'venue-rating', scale: 5,
    positive: { transcript: 'Once I understood the building, the staff and elevator signs made it straightforward to move between the keynote and expo areas.', summary: 'Attendee found venue navigation workable after orientation.', themeKey: 'venue_access', themeLabel: 'Venue access' },
    mixed: { transcript: 'The venue is manageable, but app room names and printed signs should use exactly the same language.', summary: 'Attendee requested more consistent room naming.', themeKey: 'wayfinding_confusion', themeLabel: 'Wayfinding confusion' },
    negative: { transcript: 'The printed signs near the elevators do not match the room names in the app, which makes each transition slower than it needs to be.', summary: 'Inconsistent venue labels are slowing attendee navigation.', themeKey: 'wayfinding_confusion', themeLabel: 'Wayfinding confusion', frictionCategory: 'wayfinding', recommendedAction: 'Audit printed signs against the app and replace mismatched room labels.', actionTitle: 'Align venue and app room labels' },
    entity: { type: 'LOCATION', label: 'Main Entrance' },
  },
  {
    surveyKey: 'product-strategy-panel-feedback', idPrefix: 'product_strategy', startIndex: 1, count: 5, startsAt: new Date('2026-09-17T18:10:00.000Z'), voiceQuestionKey: 'product-panel-value', structuredQuestionKey: 'product-panel-rating', scale: 5,
    positive: { transcript: 'The panelists gave specific tradeoffs and examples instead of broad predictions, which made the product strategy conversation useful for planning.', summary: 'Attendee valued practical panelist examples and tradeoffs.', themeKey: 'session_content', themeLabel: 'Strong session content' },
    mixed: { transcript: 'The panel had useful viewpoints, though a short recap of the differing positions would help attendees carry the ideas into later sessions.', summary: 'Attendee valued panel content but wanted a clearer synthesis.', themeKey: 'panel_synthesis', themeLabel: 'Panel synthesis' },
    negative: { transcript: 'The panel had strong ideas, but several audience questions went unanswered as the discussion ran out of time.', summary: 'Product panel needs more time for audience questions.', themeKey: 'qa_time', themeLabel: 'More Q and A time', frictionCategory: 'session_content_speakers', recommendedAction: 'Reserve a moderated Q and A block and publish overflow questions after the panel.', actionTitle: 'Extend product panel Q and A' },
    entity: { type: 'SESSION', label: 'Product Strategy Panel' },
  },
  {
    surveyKey: 'customer-success-workshop-feedback', idPrefix: 'customer_success', startIndex: 1, count: 5, startsAt: new Date('2026-09-18T16:35:00.000Z'), voiceQuestionKey: 'workshop-value', structuredQuestionKey: 'workshop-recommendation', scale: 10,
    positive: { transcript: 'The workshop gave me a practical rollout checklist and enough time to compare notes with people solving similar customer adoption problems.', summary: 'Attendee valued the workshop materials and peer discussion.', themeKey: 'workshop_practicality', themeLabel: 'Practical workshop materials' },
    mixed: { transcript: 'The facilitator was useful, though the worksheet would be easier to apply if it included a completed example before the group exercise.', summary: 'Attendee valued facilitation but wanted a worked example.', themeKey: 'workshop_materials', themeLabel: 'Workshop materials' },
    negative: { transcript: 'The discussion was valuable, but the worksheet instructions changed halfway through and left part of the room unsure which exercise to complete.', summary: 'Workshop materials and instructions caused attendee confusion.', themeKey: 'workshop_materials', themeLabel: 'Workshop materials', frictionCategory: 'session_content_speakers', recommendedAction: 'Simplify worksheet instructions and show a completed example before the exercise.', actionTitle: 'Improve workshop materials' },
    entity: { type: 'SESSION', label: 'Customer Success Workshop' },
  },
]

function supplementalResponseId(idPrefix: string, index: number) {
  return `resp_events_demo_${idPrefix}_${String(index).padStart(3, '0')}`
}

function buildSupplementalResponses(): ResponseDefinition[] {
  const endings = [
    'I would make time for this again.',
    'It was the part I would mention to a colleague.',
    'That detail shaped my overall impression of the event.',
    'It would be even better with a small operational adjustment.',
  ]

  return supplementalResponsePlans.flatMap((plan, planIndex) =>
    Array.from({ length: plan.count }, (_, offset) => {
      const sequence = plan.startIndex + offset
      const mood: 'positive' | 'mixed' | 'negative' = offset % 8 === 0 ? 'negative' : offset % 5 === 0 ? 'mixed' : 'positive'
      const insight = plan[mood]
      const numericValue = mood === 'negative'
        ? plan.scale === 5 ? 2 : 4
        : mood === 'mixed'
          ? plan.scale === 5 ? 3 : 6
          : plan.scale === 5 ? 5 : 9
      const urgency = mood === 'negative' ? 'HIGH' : mood === 'mixed' ? 'MEDIUM' : 'LOW'
      const responseId = supplementalResponseId(plan.idPrefix, sequence)
      const startedAt = new Date(plan.startsAt.getTime() + offset * 17 * 60_000 + planIndex * 3 * 60_000)
      const completedAt = new Date(startedAt.getTime() + 2 * 60_000 + (offset % 3) * 30_000)
      const action = mood === 'negative'
        ? [{ title: insight.actionTitle ?? 'Follow up on attendee friction', description: insight.recommendedAction ?? 'Review the attendee feedback and assign a follow-up owner.', priority: 'Soon', urgency: 'HIGH', actionWindow: 'NEXT_BLOCK' }]
        : []

      return {
        id: responseId,
        surveyKey: plan.surveyKey,
        anonymousId: `anon_events_demo_${plan.idPrefix}_${String(sequence).padStart(3, '0')}`,
        startedAt,
        completedAt,
        answers: [
          {
            questionKey: plan.voiceQuestionKey,
            transcript: `${insight.transcript} ${endings[(offset + planIndex) % endings.length]}`,
            summary: insight.summary,
            sentimentLabel: mood === 'positive' ? 'positive' : mood === 'mixed' ? 'neutral' : 'negative',
            sentimentScore: mood === 'positive' ? 0.78 : mood === 'mixed' ? 0.08 : -0.61,
            urgency,
            frictionCategory: mood === 'negative' ? insight.frictionCategory : undefined,
            actionWindow: mood === 'negative' ? 'NEXT_BLOCK' : undefined,
            recommendedAction: mood === 'negative' ? insight.recommendedAction : undefined,
            themes: [{ key: insight.themeKey, label: insight.themeLabel, sentimentLabel: mood === 'mixed' ? 'neutral' : mood, confidence: mood === 'negative' ? 0.88 : 0.84 }],
            entities: [{ type: plan.entity.type, label: plan.entity.label, confidence: 0.9 }],
            actions: action,
          },
          {
            questionKey: plan.structuredQuestionKey,
            transcript: plan.scale === 5 ? `Rated ${numericValue} out of 5.` : `Recommendation score: ${numericValue} out of 10.`,
            summary: `Structured ${plan.scale === 5 ? 'rating' : 'recommendation'} recorded at ${numericValue}.`,
            sentimentLabel: mood === 'positive' ? 'positive' : mood === 'mixed' ? 'neutral' : 'negative',
            sentimentScore: mood === 'positive' ? 0.65 : mood === 'mixed' ? 0 : -0.48,
            urgency,
            themes: [{ key: `${insight.themeKey}_score`, label: `${insight.themeLabel} score`, sentimentLabel: mood === 'mixed' ? 'neutral' : mood, confidence: 0.8 }],
            entities: [{ type: plan.entity.type, label: plan.entity.label, confidence: 0.82 }],
            actions: [],
            numericValue,
          },
        ],
      }
    }),
  )
}

type SessionResultMood = 'strong' | 'mixed' | 'underperforming'

function sessionResultMood(index: number): SessionResultMood {
  const sequence: SessionResultMood[] = ['strong', 'mixed', 'strong', 'underperforming', 'mixed', 'strong']
  return sequence[index % sequence.length]
}

function sessionResultResponseCount(index: number) {
  const sequence = [8, 1, 0, 8, 3, 3, 3, 3, 3, 3, 3, 3] as const
  return sequence[index % sequence.length]
}

function speakerResultResponseCount(speakerIndex: number, sessionIndex: number) {
  if (speakerIndex < 5) return 4
  if (speakerIndex < 9) return 2
  if (speakerIndex < 18) return 1
  if (speakerIndex < 21) return sessionIndex < speakerDefinitions.length ? 1 : 0
  return 0
}

function resultSurveyKey(kind: 'session' | 'speaker', sessionSlug: string) {
  return `${kind}-results-${sessionSlug}`
}

function resultQuestionKey(kind: 'session' | 'speaker', sessionSlug: string, field: 'feedback' | 'rating') {
  return `${kind}-results-${sessionSlug}-${field}`
}

function resultResponseId(kind: 'session' | 'speaker', sessionSlug: string, sequence: number) {
  return `resp_events_demo_${kind}_results_${sessionSlug.replace(/-/g, '_')}_${String(sequence).padStart(2, '0')}`
}

function buildSessionResultSurveys(): SurveyDefinition[] {
  return agendaSessionDefinitions.flatMap((session, index) => {
    const speaker = speakerDefinitions[index % speakerDefinitions.length]
    return [
      {
        key: resultSurveyKey('session', session.slug),
        name: `${session.name} — Session Results`,
        description: `Completed attendee feedback about the quality and usefulness of ${session.name}.`,
        collectionPhase: CollectionPhase.DURING,
        structureSlug: session.slug,
        targetKey: `session:${session.slug}`,
        token: `internal-session-results-${session.slug}`,
        createPublicLink: false,
        questionBaseOrder: 1000 + index * 10,
        status: EventStatus.COMPLETED,
        responseMode: ResponseMode.VOICE_AND_TEXT,
        questions: [
          {
            key: resultQuestionKey('session', session.slug, 'feedback'),
            label: `What worked well, or should improve, in ${session.name}?`,
            helperText: 'Capture feedback about the session content, structure, and usefulness rather than the presenter.',
            order: 1000 + index * 10,
          },
          {
            key: resultQuestionKey('session', session.slug, 'rating'),
            label: `How would you rate ${session.name}?`,
            helperText: 'Use a one-to-five rating for session quality.',
            order: 1001 + index * 10,
            type: QuestionType.RATING_1_TO_5,
          },
        ],
      },
      {
        key: resultSurveyKey('speaker', session.slug),
        name: `${session.name} — Speaker Results`,
        description: `Completed attendee feedback evaluating ${speaker.name}'s delivery in ${session.name}.`,
        collectionPhase: CollectionPhase.DURING,
        structureSlug: session.slug,
        targetKey: `speaker:${session.slug}`,
        token: `internal-speaker-results-${session.slug}`,
        createPublicLink: false,
        questionBaseOrder: 1002 + index * 10,
        status: EventStatus.COMPLETED,
        responseMode: ResponseMode.VOICE_AND_TEXT,
        questions: [
          {
            key: resultQuestionKey('speaker', session.slug, 'feedback'),
            label: `How did ${speaker.name}'s clarity, expertise, engagement, pacing, or usefulness affect this session?`,
            helperText: 'Only collect feedback that directly evaluates the assigned speaker.',
            order: 1002 + index * 10,
          },
          {
            key: resultQuestionKey('speaker', session.slug, 'rating'),
            label: `How would you rate ${speaker.name}'s delivery in ${session.name}?`,
            helperText: 'Use a one-to-five speaker rating for this exact assignment.',
            order: 1003 + index * 10,
            type: QuestionType.RATING_1_TO_5,
          },
        ],
      },
    ]
  })
}

function buildSessionAndSpeakerResponses(): ResponseDefinition[] {
  return agendaSessionDefinitions.flatMap((session, sessionIndex) => {
    const speaker = speakerDefinitions[sessionIndex % speakerDefinitions.length]
    const mood = sessionResultMood(sessionIndex)
    const startsAt = session.endsAt ?? eventStart
    const sessionInsights = {
      strong: [
        `The examples in ${session.name} were specific enough to apply immediately, and the session moved through the material with a clear arc.`,
        `${session.name} balanced practical detail with a useful point of view; the case study made the topic easy to carry into our own planning.`,
        `I left ${session.name} with a concrete next step rather than a generic takeaway, which made the time feel well spent.`,
      ],
      mixed: [
        `${session.name} covered a relevant topic and had useful moments, but the middle section needed a sharper summary of the key decisions.`,
        `The material in ${session.name} was worthwhile, although the transition between examples made the overall structure harder to follow.`,
        `I found ${session.name} useful overall, but a shorter setup and more time on the practical implications would improve it.`,
      ],
      underperforming: [
        `${session.name} had a promising topic, but the content stayed too high level for the amount of time it used.`,
        `The session needed a clearer through-line; several examples were interesting on their own but did not add up to a usable takeaway.`,
        `I wanted more depth from ${session.name}; the pacing left little room to connect the ideas to an actual operating decision.`,
      ],
    } as const
    const speakerInsights = {
      strong: ` ${speaker.name} explained the tradeoffs clearly, brought credible expertise to the examples, and kept the audience engaged without rushing the useful parts.`,
      mixed: ` ${speaker.name} showed solid expertise and answered questions thoughtfully, though a more deliberate pace would make the key points easier to retain.`,
      underperforming: ` ${speaker.name} clearly knew the subject, but the delivery moved quickly and the main message needed more direct explanation for the audience.`,
    } as const
    const sessionRating = mood === 'strong' ? 5 : mood === 'mixed' ? 3 : 2
    const speakerRating = mood === 'strong' ? 5 : mood === 'mixed' ? 3 : 2
    const sentimentLabel = mood === 'strong' ? 'positive' : mood === 'mixed' ? 'neutral' : 'negative'
    const sentimentScore = mood === 'strong' ? 0.79 : mood === 'mixed' ? 0.08 : -0.58
    const urgency = mood === 'underperforming' ? 'MEDIUM' : 'LOW'
    const sessionTheme = mood === 'strong'
      ? { key: 'session_practicality', label: 'Practical session value', sentimentLabel, confidence: 0.92 }
      : mood === 'mixed'
        ? { key: 'session_structure', label: 'Session structure and synthesis', sentimentLabel, confidence: 0.7 }
        : { key: 'session_content_depth', label: 'Session content depth', sentimentLabel, confidence: 0.62 }
    const speakerTheme = mood === 'strong'
      ? { key: 'speaker_clarity_engagement', label: 'Speaker clarity and engagement', sentimentLabel: 'POSITIVE', confidence: 0.91 }
      : mood === 'mixed'
        ? { key: 'speaker_pacing', label: 'Speaker pacing', sentimentLabel: 'NEUTRAL', confidence: 0.68 }
        : { key: 'speaker_clarity', label: 'Speaker clarity', sentimentLabel: 'NEGATIVE', confidence: 0.58 }

    const genericResponses = Array.from({ length: sessionResultResponseCount(sessionIndex) }, (_, responseIndex) => {
      const startedAt = new Date(startsAt.getTime() + (responseIndex + 1) * 9 * 60_000)
      return {
        id: resultResponseId('session', session.slug, responseIndex + 1),
        surveyKey: resultSurveyKey('session', session.slug),
        anonymousId: `anon_events_demo_session_${session.slug}_${String(responseIndex + 1).padStart(2, '0')}`,
        startedAt,
        completedAt: new Date(startedAt.getTime() + 2 * 60_000),
        requiresPublicLink: false,
        answers: [
          {
            questionKey: resultQuestionKey('session', session.slug, 'feedback'),
            transcript: `${sessionInsights[mood][responseIndex % sessionInsights[mood].length]} ${responseIndex >= 3 ? `This was follow-up perspective ${responseIndex - 2}, with a different attendee emphasizing the same underlying signal.` : ''}`.trim(),
            summary: mood === 'strong' ? `${session.name} produced a concrete, useful takeaway.` : mood === 'mixed' ? `${session.name} was useful but needs sharper structure.` : `${session.name} needs more depth and a clearer through-line.`,
            sentimentLabel,
            sentimentScore,
            urgency,
            frictionCategory: mood === 'underperforming' ? 'session_content_speakers' : undefined,
            themes: [sessionTheme],
            entities: [{ type: 'SESSION', label: session.name, confidence: 0.96 }],
            actions: [],
          },
          {
            questionKey: resultQuestionKey('session', session.slug, 'rating'),
            transcript: `Session rating: ${sessionRating} out of 5.`,
            summary: `Attendee rated ${session.name} ${sessionRating} out of 5.`,
            sentimentLabel,
            sentimentScore: mood === 'strong' ? 0.68 : mood === 'mixed' ? 0 : -0.45,
            urgency,
            themes: [{ ...sessionTheme, key: `${sessionTheme.key}_rating`, label: `${sessionTheme.label} rating`, confidence: sessionTheme.confidence - 0.03 }],
            entities: [{ type: 'SESSION', label: session.name, confidence: 0.93 }],
            actions: [],
            numericValue: sessionRating,
          },
        ],
      }
    })

    const speakerResponses: ResponseDefinition[] = Array.from({
      length: speakerResultResponseCount(sessionIndex % speakerDefinitions.length, sessionIndex),
    }, (_, responseIndex) => {
      const speakerStartedAt = new Date(startsAt.getTime() + (36 + responseIndex * 6) * 60_000)
      return {
        id: resultResponseId('speaker', session.slug, responseIndex + 1),
        surveyKey: resultSurveyKey('speaker', session.slug),
        anonymousId: `anon_events_demo_speaker_${session.slug}_${String(responseIndex + 1).padStart(2, '0')}`,
        startedAt: speakerStartedAt,
        completedAt: new Date(speakerStartedAt.getTime() + 2 * 60_000),
        requiresPublicLink: false,
        speakerProfileId: speaker.id,
        speakerAssignmentSessionSlug: session.slug,
        answers: [
        {
          questionKey: resultQuestionKey('speaker', session.slug, 'feedback'),
          transcript: `${speaker.name}'s contribution to ${session.name} was the focus of this feedback.${speakerInsights[mood]} Attendee perspective ${responseIndex + 1} focused on ${responseIndex % 2 === 0 ? 'clarity and usefulness' : 'pacing and audience engagement'}.`,
          summary: mood === 'strong' ? `${speaker.name} was clear, expert, and engaging.` : mood === 'mixed' ? `${speaker.name} was knowledgeable but could pace the delivery more deliberately.` : `${speaker.name} needs a clearer, less rushed delivery.`,
          sentimentLabel,
          sentimentScore,
          urgency,
          themes: [speakerTheme],
          entities: [
            { type: 'SPEAKER', label: speaker.name, confidence: 0.99 },
            { type: 'SESSION', label: session.name, confidence: 0.96 },
          ],
          actions: [],
        },
        {
          questionKey: resultQuestionKey('speaker', session.slug, 'rating'),
          transcript: `Speaker delivery rating for ${speaker.name}: ${speakerRating} out of 5.`,
          summary: `Attendee rated ${speaker.name}'s delivery ${speakerRating} out of 5.`,
          sentimentLabel,
          sentimentScore: mood === 'strong' ? 0.7 : mood === 'mixed' ? 0.02 : -0.43,
          urgency,
          themes: [{ ...speakerTheme, key: `${speakerTheme.key}_rating`, label: `${speakerTheme.label} rating`, confidence: speakerTheme.confidence - 0.02 }],
          entities: [
            { type: 'SPEAKER', label: speaker.name, confidence: 0.99 },
            { type: 'SESSION', label: session.name, confidence: 0.94 },
          ],
          actions: [],
          numericValue: speakerRating,
        },
        ],
      }
    })

    return [...genericResponses, ...speakerResponses]
  })
}

const surveyDefinitions: SurveyDefinition[] = [...baseSurveyDefinitions, ...buildSessionResultSurveys()]
const surveyDefinitionByKey = new Map(surveyDefinitions.map((survey) => [survey.key, survey]))
const responseDefinitions: ResponseDefinition[] = [
  ...buildPlanningResponses(),
  ...baseResponseDefinitions,
  ...buildSupplementalResponses(),
  ...buildSessionAndSpeakerResponses(),
  ...buildPostEventResponses(),
]

const baseClusterDefinitions: ClusterDefinition[] = [
  {
    key: 'pre_practical_ai_demand',
    taxonomyKey: 'session_content_speakers',
    title: 'Attendees expect practical AI examples and specific speaker answers',
    summary: 'Pre-event responses consistently prioritize concrete implementation cases, measurable outcomes, governance, and customer experience examples.',
    priorityLevel: 'Soon',
    impactScore: 0.84,
    timeSensitivityScore: 0.78,
    confidence: 0.93,
    recommendedNextStep: 'Brief speakers with the attendee-authored questions and confirm that practical AI examples are prominent in the agenda.',
    evidenceAnswerRefs: Array.from({ length: 8 }, (_, index) => ({
      responseId: `resp_events_demo_pre_event_agenda_${String(index + 1).padStart(3, '0')}`,
      questionKey: 'pre-content-priority',
    })),
  },
  {
    key: 'pre_session_choice_support',
    taxonomyKey: 'agenda_programming',
    title: 'Attendees need help choosing the sessions that fit their goals',
    summary: 'Pre-event planning feedback asks for role- and experience-based paths through overlapping labs, panels, and roundtables.',
    priorityLevel: 'Soon',
    impactScore: 0.72,
    timeSensitivityScore: 0.82,
    confidence: 0.9,
    recommendedNextStep: 'Publish a role-based session decision guide before attendees finalize their personal agendas.',
    evidenceAnswerRefs: [1, 3, 6, 8].map((sequence) => ({
      responseId: `resp_events_demo_pre_event_agenda_${String(sequence).padStart(3, '0')}`,
      questionKey: 'pre-networking-agenda-need',
    })),
  },
  {
    key: 'pre_networking_expectations',
    taxonomyKey: 'networking_program',
    title: 'Networking is a core expectation that needs intentional structure',
    summary: 'Attendees want facilitated introductions, role-based peer groups, and topic tables instead of relying on unstructured networking.',
    priorityLevel: 'Soon',
    impactScore: 0.76,
    timeSensitivityScore: 0.74,
    confidence: 0.91,
    recommendedNextStep: 'Prepare hosted networking matches, topic tables, and a first-time attendee entry point before the event.',
    evidenceAnswerRefs: [2, 4, 5, 7].map((sequence) => ({
      responseId: `resp_events_demo_pre_event_agenda_${String(sequence).padStart(3, '0')}`,
      questionKey: 'pre-networking-agenda-need',
    })),
  },
  {
    key: 'registration_queue_signage',
    taxonomyKey: 'access_checkin',
    title: 'Registration lanes and badge pickup need clearer signage',
    summary: 'Arrival feedback points to badge pickup queues and unclear speaker versus attendee lanes.',
    priorityLevel: 'Immediate',
    impactScore: 0.86,
    timeSensitivityScore: 0.94,
    confidence: 0.9,
    recommendedNextStep: 'Add visible lane signs and station a staff member near the registration split before the next arrival rush.',
    evidenceAnswerRefs: [
      { responseId: 'resp_events_demo_overall_001', questionKey: 'overall-friction' },
      { responseId: supplementalResponseId('registration', 1), questionKey: 'arrival-flow' },
      { responseId: supplementalResponseId('registration', 2), questionKey: 'arrival-flow' },
      { responseId: supplementalResponseId('registration', 5), questionKey: 'arrival-flow' },
      { responseId: supplementalResponseId('registration', 9), questionKey: 'arrival-flow' },
    ],
  },
  {
    key: 'expo_ai_lounge_wayfinding',
    taxonomyKey: 'wayfinding',
    title: 'Expo floor wayfinding is hiding partner destinations',
    summary: 'Attendees are circling the expo floor because AI Lounge signage is blocked and room labels do not match.',
    priorityLevel: 'Immediate',
    impactScore: 0.82,
    timeSensitivityScore: 0.91,
    confidence: 0.88,
    recommendedNextStep: 'Move AI Lounge signage above the aisle banner and reconcile room labels with the app.',
    evidenceAnswerRefs: [
      { responseId: 'resp_events_demo_overall_002', questionKey: 'overall-friction' },
      { responseId: 'resp_events_demo_expo_001', questionKey: 'expo-friction' },
      { responseId: supplementalResponseId('expo', 3), questionKey: 'expo-value' },
      { responseId: supplementalResponseId('venue', 1), questionKey: 'venue-navigation' },
      { responseId: supplementalResponseId('venue', 2), questionKey: 'venue-navigation' },
    ],
  },
  {
    key: 'sponsor_followup_clarity',
    taxonomyKey: 'sponsor_exhibitor_experience',
    title: 'Sponsor demo value is strong but follow-up path is unclear',
    summary: 'SignalThread booth feedback is positive, with a request for clearer QR and pricing next steps.',
    priorityLevel: 'Soon',
    impactScore: 0.72,
    timeSensitivityScore: 0.62,
    confidence: 0.86,
    recommendedNextStep: 'Place QR and follow-up cards at the booth counter and coach staff to offer them after each demo.',
    evidenceAnswerRefs: [
      { responseId: 'resp_events_demo_booth_001', questionKey: 'booth-value' },
      { responseId: 'resp_events_demo_booth_001', questionKey: 'booth-next-step' },
      { responseId: supplementalResponseId('booth', 3), questionKey: 'booth-value' },
      { responseId: supplementalResponseId('booth', 4), questionKey: 'booth-value' },
      { responseId: supplementalResponseId('booth', 5), questionKey: 'booth-value' },
    ],
  },
  {
    key: 'vip_access_food',
    taxonomyKey: 'food_beverage',
    title: 'VIP reception access and late food availability need adjustment',
    summary: 'VIP guests liked the reception but noted room naming confusion and low food availability late in the event.',
    priorityLevel: 'Watch',
    impactScore: 0.58,
    timeSensitivityScore: 0.45,
    confidence: 0.82,
    recommendedNextStep: 'Use consistent VIP room labels and reserve late-arrival food replenishment for future receptions.',
    evidenceAnswerRefs: [
      { responseId: 'resp_events_demo_vip_001', questionKey: 'vip-improvement' },
      { responseId: 'resp_events_demo_vip_002', questionKey: 'vip-improvement' },
      { responseId: supplementalResponseId('vip', 3), questionKey: 'vip-experience' },
      { responseId: supplementalResponseId('vip', 4), questionKey: 'vip-experience' },
      { responseId: supplementalResponseId('vip', 5), questionKey: 'vip-experience' },
    ],
  },
  {
    key: 'keynote_qa_depth',
    taxonomyKey: 'session_content_speakers',
    title: 'Keynote evidence supports protecting more audience Q and A time',
    summary: 'Attendees consistently valued the keynote speaker and customer examples, while asking for a longer audience discussion segment.',
    priorityLevel: 'Soon',
    impactScore: 0.67,
    timeSensitivityScore: 0.55,
    confidence: 0.9,
    recommendedNextStep: 'Protect a moderated audience Q and A block in future keynote run-of-show planning.',
    evidenceAnswerRefs: [
      { responseId: 'resp_events_demo_keynote_002', questionKey: 'keynote-content' },
      { responseId: supplementalResponseId('keynote', 3), questionKey: 'keynote-content' },
      { responseId: supplementalResponseId('keynote', 4), questionKey: 'keynote-content' },
      { responseId: supplementalResponseId('keynote', 5), questionKey: 'keynote-content' },
      { responseId: supplementalResponseId('keynote', 8), questionKey: 'keynote-content' },
    ],
  },
  {
    key: 'food_queue_flow',
    taxonomyKey: 'food_beverage',
    title: 'Coffee queue flow is disrupting hospitality and nearby demos',
    summary: 'Food quality is broadly positive, but repeat observations show the coffee queue spilling into the expo aisle at peak breaks.',
    priorityLevel: 'Soon',
    impactScore: 0.7,
    timeSensitivityScore: 0.73,
    confidence: 0.89,
    recommendedNextStep: 'Move the coffee queue behind a staffed lounge boundary before the next high-volume break.',
    evidenceAnswerRefs: [
      { responseId: supplementalResponseId('food', 1), questionKey: 'hospitality-highlight' },
      { responseId: supplementalResponseId('food', 2), questionKey: 'hospitality-highlight' },
      { responseId: supplementalResponseId('food', 3), questionKey: 'hospitality-highlight' },
      { responseId: supplementalResponseId('food', 4), questionKey: 'hospitality-highlight' },
      { responseId: supplementalResponseId('food', 9), questionKey: 'hospitality-highlight' },
    ],
  },
  {
    key: 'networking_program_value',
    taxonomyKey: 'networking_program',
    title: 'Hosted networking format is a repeatable event strength',
    summary: 'Networking feedback is consistently positive: hosted prompts are helping attendees make relevant operational connections.',
    priorityLevel: 'Watch',
    impactScore: 0.62,
    timeSensitivityScore: 0.28,
    confidence: 0.87,
    recommendedNextStep: 'Keep the hosted networking format and add a clear entry point for first-time attendees.',
    evidenceAnswerRefs: [
      { responseId: supplementalResponseId('networking', 1), questionKey: 'networking-value' },
      { responseId: supplementalResponseId('networking', 2), questionKey: 'networking-value' },
      { responseId: supplementalResponseId('networking', 3), questionKey: 'networking-value' },
      { responseId: supplementalResponseId('networking', 4), questionKey: 'networking-value' },
      { responseId: supplementalResponseId('networking', 5), questionKey: 'networking-value' },
    ],
  },
  {
    key: 'workshop_materials_clarity',
    taxonomyKey: 'session_content_speakers',
    title: 'Customer Success Workshop materials need a clearer worked example',
    summary: 'The workshop is valued for its practical content, while repeated feedback asks for simpler instructions and a completed worksheet example.',
    priorityLevel: 'Soon',
    impactScore: 0.65,
    timeSensitivityScore: 0.52,
    confidence: 0.88,
    recommendedNextStep: 'Add a completed worksheet example and simplify the exercise instructions before the next workshop.',
    evidenceAnswerRefs: [
      { responseId: supplementalResponseId('customer_success', 1), questionKey: 'workshop-value' },
      { responseId: supplementalResponseId('customer_success', 2), questionKey: 'workshop-value' },
      { responseId: supplementalResponseId('customer_success', 3), questionKey: 'workshop-value' },
      { responseId: supplementalResponseId('customer_success', 4), questionKey: 'workshop-value' },
      { responseId: supplementalResponseId('customer_success', 5), questionKey: 'workshop-value' },
    ],
  },
  {
    key: 'venue_label_alignment',
    taxonomyKey: 'wayfinding',
    title: 'Venue and app room labels need one shared source of truth',
    summary: 'Attendees repeatedly report that elevator signs and app room names do not match, slowing movement between program areas.',
    priorityLevel: 'Immediate',
    impactScore: 0.76,
    timeSensitivityScore: 0.84,
    confidence: 0.9,
    recommendedNextStep: 'Audit all room names against the event app and replace the mismatched printed signs.',
    evidenceAnswerRefs: [
      { responseId: supplementalResponseId('venue', 1), questionKey: 'venue-navigation' },
      { responseId: supplementalResponseId('venue', 2), questionKey: 'venue-navigation' },
      { responseId: supplementalResponseId('venue', 3), questionKey: 'venue-navigation' },
      { responseId: supplementalResponseId('venue', 4), questionKey: 'venue-navigation' },
      { responseId: supplementalResponseId('venue', 5), questionKey: 'venue-navigation' },
    ],
  },
  {
    key: 'post_practical_value_and_networking',
    taxonomyKey: 'session_content_speakers',
    title: 'Practical AI content and hosted networking drove lasting event value',
    summary: 'Post-event feedback confirms that concrete AI cases, usable speaker answers, and facilitated peer connections produced the strongest outcomes.',
    priorityLevel: 'Watch',
    impactScore: 0.78,
    timeSensitivityScore: 0.38,
    confidence: 0.91,
    recommendedNextStep: 'Preserve the practical case-study and hosted-networking formats and package their takeaways for follow-through.',
    evidenceAnswerRefs: [1, 5, 6].map((sequence) => ({
      responseId: `resp_events_demo_post_event_${String(sequence).padStart(3, '0')}`,
      questionKey: 'closing-takeaway',
    })),
  },
  {
    key: 'post_operational_learning',
    taxonomyKey: 'event_operations',
    title: 'Arrival, wayfinding, and workshop clarity remain next-event lessons',
    summary: 'Post-event responses reinforce the live evidence about registration lanes, venue labels, and the need for a completed workshop example.',
    priorityLevel: 'Soon',
    impactScore: 0.7,
    timeSensitivityScore: 0.5,
    confidence: 0.88,
    recommendedNextStep: 'Carry the validated arrival, wayfinding, and workshop improvements into the next event plan.',
    evidenceAnswerRefs: [2, 3, 4].map((sequence) => ({
      responseId: `resp_events_demo_post_event_${String(sequence).padStart(3, '0')}`,
      questionKey: 'closing-takeaway',
    })),
  },
]

function buildSessionResultClusters(): ClusterDefinition[] {
  const evidenceForMood = (kind: 'session' | 'speaker', mood: SessionResultMood) => agendaSessionDefinitions
    .map((session, index) => ({ session, index }))
    .filter(({ index }) => sessionResultMood(index) === mood)
    .filter(({ session }) => responseDefinitions.some((response) => response.id === resultResponseId(kind, session.slug, 1)))
    .map(({ session }) => ({
      responseId: resultResponseId(kind, session.slug, 1),
      questionKey: resultQuestionKey(kind, session.slug, 'feedback'),
    }))

  return [
    {
      key: 'session_practical_value', taxonomyKey: 'session_content',
      title: 'Multiple sessions delivered practical, immediately usable value',
      summary: 'Strong session feedback points to concrete examples, clear structure, and takeaways attendees can apply in their work.',
      priorityLevel: 'Watch', impactScore: 0.64, timeSensitivityScore: 0.25, confidence: 0.91,
      recommendedNextStep: 'Preserve the concrete-case-study format in future agenda planning.',
      evidenceAnswerRefs: evidenceForMood('session', 'strong'),
    },
    {
      key: 'session_structure_synthesis', taxonomyKey: 'session_content',
      title: 'Some sessions need clearer synthesis between useful examples',
      summary: 'Mixed feedback identifies valuable material that would land better with sharper transitions and explicit summaries.',
      priorityLevel: 'Soon', impactScore: 0.58, timeSensitivityScore: 0.46, confidence: 0.72,
      recommendedNextStep: 'Add session-level synthesis prompts and a concise takeaway recap to the run of show.',
      evidenceAnswerRefs: evidenceForMood('session', 'mixed'),
    },
    {
      key: 'session_content_depth', taxonomyKey: 'session_content',
      title: 'Underperforming sessions need greater depth and a clearer through-line',
      summary: 'Lower-confidence negative feedback repeats that several topics stayed high level or moved too quickly to create an operating takeaway.',
      priorityLevel: 'Soon', impactScore: 0.7, timeSensitivityScore: 0.53, confidence: 0.63,
      recommendedNextStep: 'Review lower-rated session outlines for depth, sequencing, and protected discussion time.',
      evidenceAnswerRefs: evidenceForMood('session', 'underperforming'),
    },
    {
      key: 'speaker_clarity_engagement', taxonomyKey: 'speaker_delivery',
      title: 'Strong speaker delivery combined clarity, expertise, and audience engagement',
      summary: 'Speaker-specific feedback credits clear explanations, credible examples, and delivery that kept attendees engaged.',
      priorityLevel: 'Watch', impactScore: 0.66, timeSensitivityScore: 0.24, confidence: 0.9,
      recommendedNextStep: 'Use the strongest delivery patterns as coaching examples for future presenters.',
      evidenceAnswerRefs: evidenceForMood('speaker', 'strong'),
    },
    {
      key: 'speaker_pacing_coaching', taxonomyKey: 'speaker_delivery',
      title: 'Several speakers would benefit from more deliberate pacing',
      summary: 'Speaker-specific feedback recognizes expertise while asking presenters to slow down and reinforce the key message.',
      priorityLevel: 'Soon', impactScore: 0.61, timeSensitivityScore: 0.43, confidence: 0.69,
      recommendedNextStep: 'Provide speaker coaching on pacing, recap slides, and audience checkpoints.',
      evidenceAnswerRefs: [
        ...evidenceForMood('speaker', 'mixed'),
        ...evidenceForMood('speaker', 'underperforming'),
      ],
    },
  ]
}

const clusterDefinitions: ClusterDefinition[] = [...baseClusterDefinitions, ...buildSessionResultClusters()]

const expectedSeedTotals = {
  agendaSessions: 48,
  speakers: 24,
  speakerAssignments: 68,
  listeningPoints: 14,
  sessionListeningPoints: 4,
  surveys: 110,
  completedResponses: 345,
  completedAnswers: 694,
  issueClusters: 19,
  evidence: 150,
  canonicalActionWorkflows: 8,
} as const

function assertSeedDefinitionTotals() {
  const actual = {
    agendaSessions: agendaSessionDefinitions.length,
    speakers: speakerDefinitions.length,
    speakerAssignments: speakerAssignmentPlans.length,
    listeningPoints: listeningPointDefinitions.length,
    sessionListeningPoints: sessionListeningPointSlugs.size,
    surveys: surveyDefinitions.length,
    completedResponses: responseDefinitions.length,
    completedAnswers: responseDefinitions.reduce((sum, response) => sum + response.answers.length, 0),
    issueClusters: clusterDefinitions.length,
    evidence: clusterDefinitions.reduce((sum, cluster) => sum + cluster.evidenceAnswerRefs.length, 0),
  }
  for (const [key, expected] of Object.entries(expectedSeedTotals)) {
    if (key === 'canonicalActionWorkflows') continue
    if (actual[key as keyof typeof actual] !== expected) {
      throw new Error(`Seed definition total mismatch for ${key}: expected ${expected}, received ${actual[key as keyof typeof actual]}`)
    }
  }

  const surveyByKey = new Map(surveyDefinitions.map((survey) => [survey.key, survey]))
  for (const response of responseDefinitions) {
    if (!surveyByKey.get(response.surveyKey)?.collectionPhase) {
      throw new Error(`Response ${response.id} belongs to an unclassified survey ${response.surveyKey}`)
    }
  }
  for (const cluster of clusterDefinitions) {
    const phases = new Set(cluster.evidenceAnswerRefs.map((reference) => {
      const response = responseDefinitions.find((candidate) => candidate.id === reference.responseId)
      if (!response) throw new Error(`Cluster ${cluster.key} references missing response ${reference.responseId}`)
      const survey = surveyByKey.get(response.surveyKey)
      if (!survey) throw new Error(`Cluster ${cluster.key} references response with missing survey ${response.surveyKey}`)
      return survey.collectionPhase
    }))
    if (phases.size !== 1) {
      throw new Error(`Cluster ${cluster.key} mixes collection phases: ${[...phases].join(', ')}`)
    }
  }
}

function sessionResponseCoverage() {
  return agendaSessionDefinitions.map((session) => responseDefinitions.filter((response) =>
    response.surveyKey === resultSurveyKey('session', session.slug),
  ).length)
}

function speakerAssignmentCoverage() {
  return agendaSessionDefinitions.map((session) => responseDefinitions.filter((response) =>
    response.surveyKey === resultSurveyKey('speaker', session.slug),
  ).reduce((total, response) => total + response.answers.length, 0))
}

function resultCoverageSummary() {
  const sessionResponses = sessionResponseCoverage()
  const speakerAnswers = speakerAssignmentCoverage()
  const sessionAnswers = responseDefinitions
    .filter((response) => response.surveyKey.startsWith('session-results-'))
    .reduce((total, response) => total + response.answers.length, 0)
  const speakerSpecificAnswers = responseDefinitions
    .filter((response) => response.surveyKey.startsWith('speaker-results-'))
    .reduce((total, response) => total + response.answers.length, 0)
  return {
    sessionsWithResponses: sessionResponses.filter((count) => count > 0).length,
    minResponsesPerSession: Math.min(...sessionResponses),
    maxResponsesPerSession: Math.max(...sessionResponses),
    averageResponsesPerSession: sessionResponses.reduce((total, count) => total + count, 0) / sessionResponses.length,
    speakerAssignmentsWithResults: speakerAnswers.filter((count) => count > 0).length,
    minSpeakerAnswersPerAssignment: Math.min(...speakerAnswers),
    maxSpeakerAnswersPerAssignment: Math.max(...speakerAnswers),
    sessionAnswers,
    speakerSpecificAnswers,
  }
}

async function main() {
  assertSeedDefinitionTotals()
  const target = databaseTarget()
  if (!isApplyRun()) {
    const dryRunTarget = existingTargetEventId
      ? await prisma.event.findUnique({
        where: { id: existingTargetEventId },
        select: { id: true, name: true, location: { select: { account: { select: { slug: true } } } } },
      })
      : null
    if (existingTargetEventId && !dryRunTarget) throw new Error(`Target event "${existingTargetEventId}" does not exist.`)
    if (dryRunTarget && dryRunTarget.location.account.slug !== ACCOUNT_SLUG) {
      throw new Error(`Target event "${dryRunTarget.id}" does not belong to the ${ACCOUNT_SLUG} account.`)
    }
    console.log('[seed-voice-events-demo] dry run — no database writes')
    console.log(`  target project: ${target.projectRef}`)
    console.log(`  target event: ${dryRunTarget ? `${dryRunTarget.id} (${dryRunTarget.name})` : `${generatedEventId} (${generatedEventName})`}`)
    console.log(`  agenda sessions: ${agendaSessionDefinitions.length}`)
    console.log(`  listening points: ${listeningPointDefinitions.length} (${sessionListeningPointSlugs.size} session)`)
    console.log(`  surveys: ${surveyDefinitions.length}`)
    console.log(`  completed responses: ${responseDefinitions.length}`)
    console.log(`  completed answers: ${responseDefinitions.reduce((sum, response) => sum + response.answers.length, 0)}`)
    const coverage = resultCoverageSummary()
    console.log(`  session result coverage: ${coverage.sessionsWithResponses}/${agendaSessionDefinitions.length} (${coverage.minResponsesPerSession}-${coverage.maxResponsesPerSession}, avg ${coverage.averageResponsesPerSession.toFixed(1)} responses/session)`)
    console.log(`  speaker result coverage: ${coverage.speakerAssignmentsWithResults}/${agendaSessionDefinitions.length} (${coverage.minSpeakerAnswersPerAssignment}-${coverage.maxSpeakerAnswersPerAssignment} speaker-evaluating answers/assignment)`)
    console.log(`  session vs speaker-specific answers: ${coverage.sessionAnswers} / ${coverage.speakerSpecificAnswers}`)
    console.log(`  issue clusters: ${clusterDefinitions.length}`)
    console.log(`  evidence records: ${clusterDefinitions.reduce((sum, cluster) => sum + cluster.evidenceAnswerRefs.length, 0)}`)
    return
  }
  const safety = assertApplyTarget()
  if (safety.environment === 'development') {
    console.log(`[seed-voice-events-demo] applying to ${safety.isLocal ? 'local' : 'remote development'} database (project ${target.projectRef})`)
  }

  const existingAccount = await prisma.account.findUnique({
    where: { slug: ACCOUNT_SLUG },
  })

  if (safety.environment === 'production' && !existingAccount) {
    throw new Error('Refusing production seed: exact account slug "signalthread" does not exist')
  }

  if (existingAccount && existingAccount.accountType !== AccountType.EVENTS) {
    throw new Error(
      `Refusing to modify account "${ACCOUNT_SLUG}" because it exists as ${existingAccount.accountType}, not EVENTS.`,
    )
  }

  if (safety.environment === 'production') {
    console.log('[seed-voice-events-demo] production write preflight')
    console.log(`  database host: ${target.host}`)
    console.log(`  database project: ${target.projectRef}`)
    console.log(`  environment: ${safety.environment}`)
    console.log(`  account slug: ${ACCOUNT_SLUG}`)
    console.log(`  account ID: ${existingAccount!.id}`)
    console.log(`  event name: ${generatedEventName}`)
    console.log(`  seed key: ${seedOptions.seedKey}`)
    console.log('  authorization: VOICE_EVENTS_DEMO_ALLOW_PROD=signalthread')
    console.log('  preflight complete; starting deterministic event-scoped upserts')
  }

  const targetEvent = existingTargetEventId
    ? await prisma.event.findUnique({
      where: { id: existingTargetEventId },
      select: { id: true, name: true, locationId: true, location: { select: { accountId: true } } },
    })
    : null

  if (existingTargetEventId && !targetEvent) {
    throw new Error(`Target event "${existingTargetEventId}" does not exist.`)
  }
  if (targetEvent && targetEvent.location.accountId !== existingAccount?.id) {
    throw new Error(`Target event "${targetEvent.id}" does not belong to the ${ACCOUNT_SLUG} account.`)
  }

  const account = targetEvent
    ? await prisma.account.findUniqueOrThrow({ where: { id: targetEvent.location.accountId } })
    : safety.environment === 'production'
      ? existingAccount!
      : await prisma.account.upsert({
    where: { slug: ACCOUNT_SLUG },
    update: {
      name: 'SignalThread Events Demo',
      accountType: AccountType.EVENTS,
      tier: 'enterprise',
      isActive: true,
      email: 'events-demo@signalthread.example',
      settingsJson: {
        seededBy: SEEDED_BY,
        productMode: 'EVENTS',
        demo: true,
      },
    },
    create: {
      id: ACCOUNT_ID,
      name: 'SignalThread Events Demo',
      slug: ACCOUNT_SLUG,
      accountType: AccountType.EVENTS,
      tier: 'enterprise',
      isActive: true,
      email: 'events-demo@signalthread.example',
      settingsJson: {
        seededBy: SEEDED_BY,
        productMode: 'EVENTS',
        demo: true,
      },
    },
  })

  const location = targetEvent
    ? await prisma.location.findUniqueOrThrow({ where: { id: targetEvent.locationId } })
    : await prisma.location.upsert({
    where: {
      accountId_slug: {
        accountId: account.id,
        slug: productionEnvironment ? scopedSeedSlug(LOCATION_SLUG) : LOCATION_SLUG,
      },
    },
    update: {
      name: 'SignalThread Live Venue',
      address: '100 Demo Center Way',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
      timezone: TIMEZONE,
      isActive: true,
      settingsJson: {
        seededBy: SEEDED_BY,
        demoVenue: true,
      },
      googleReviewUrl: null,
    },
    create: {
      id: productionEnvironment ? scopedSeedValue(LOCATION_ID) : LOCATION_ID,
      accountId: account.id,
      name: 'SignalThread Live Venue',
      slug: productionEnvironment ? scopedSeedSlug(LOCATION_SLUG) : LOCATION_SLUG,
      address: '100 Demo Center Way',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
      timezone: TIMEZONE,
      isActive: true,
      settingsJson: {
        seededBy: SEEDED_BY,
        demoVenue: true,
      },
      googleReviewUrl: null,
    },
  })

  const allQuestionJson = surveyDefinitions.flatMap((survey) =>
    survey.questions.map((question) => ({
      key: question.key,
      label: question.label,
      order: question.order,
      required: true,
      type: question.type ?? QuestionType.VOICE,
      surveyKey: survey.key,
    })),
  )

  const event = targetEvent ?? await prisma.event.upsert({
    where: { id: generatedEventId },
    update: {
      locationId: location.id,
      name: generatedEventName,
      description:
        'Production-safe demo event for live attendee voice, event signals, action briefs, sponsor value, and structure filters.',
      responseMode: ResponseMode.VOICE_ONLY,
      eventType: EventType.ADVANCED,
      startDate: eventStart,
      endDate: eventEnd,
      status: EventStatus.ACTIVE,
      isActive: true,
      questionsJson: allQuestionJson,
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
    },
    create: {
      id: generatedEventId,
      locationId: location.id,
      name: generatedEventName,
      description:
        'Production-safe demo event for live attendee voice, event signals, action briefs, sponsor value, and structure filters.',
      responseMode: ResponseMode.VOICE_ONLY,
      eventType: EventType.ADVANCED,
      startDate: eventStart,
      endDate: eventEnd,
      status: EventStatus.ACTIVE,
      isActive: true,
      questionsJson: allQuestionJson,
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
    },
  })

  const existingStructureItems = isExistingEventSeed()
    ? await prisma.eventStructureItem.findMany({ where: { eventId: event.id, isActive: true }, orderBy: { sortOrder: 'asc' } })
    : []
  if (isExistingEventSeed() && existingStructureItems.length === 0) {
    throw new Error(`Target event "${event.id}" has no existing sessions or areas to connect demo data to.`)
  }

  const structureBySlug = new Map<string, Awaited<ReturnType<typeof prisma.eventStructureItem.upsert>>>()
  for (const [definitionIndex, item] of allStructureDefinitions.entries()) {
    const existingStructure = isExistingEventSeed()
      ? existingStructureItems.find((candidate) => candidate.slug === item.slug)
        ?? existingStructureItems.find((candidate) => candidate.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase())
        ?? existingStructureItems.filter((candidate) => candidate.kind === item.kind)[definitionIndex % Math.max(1, existingStructureItems.filter((candidate) => candidate.kind === item.kind).length)]
        ?? existingStructureItems[definitionIndex % existingStructureItems.length]
      : null
    const structureItem = existingStructure ?? await prisma.eventStructureItem.upsert({
      where: {
        eventId_slug: {
          eventId: event.id,
          slug: item.slug,
        },
      },
      update: {
        kind: item.kind,
        name: item.name,
        description: item.description,
        parentId: null,
        locationId: item.kind === EventStructureItemKind.AREA ? location.id : null,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        timezone: TIMEZONE,
        sortOrder: item.sortOrder,
        metadata: {
          seededBy: SEEDED_BY,
          demo: true,
          customerFacingName: 'Event Areas',
          ...item.metadata,
        },
        isActive: true,
      },
      create: {
        id: structureId(item.slug),
        eventId: event.id,
        kind: item.kind,
        name: item.name,
        slug: item.slug,
        description: item.description,
        parentId: null,
        locationId: item.kind === EventStructureItemKind.AREA ? location.id : null,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        timezone: TIMEZONE,
        sortOrder: item.sortOrder,
        metadata: {
          seededBy: SEEDED_BY,
          demo: true,
          customerFacingName: 'Event Areas',
          ...item.metadata,
        },
        isActive: true,
      },
    })
    structureBySlug.set(item.slug, structureItem)
  }

  const speakerBySessionSlug = new Map<string, string>()
  const speakerProfileBySessionSlug = new Map<string, string>()
  if (!isExistingEventSeed()) for (let index = 0; index < speakerDefinitions.length; index++) {
    const speaker = speakerDefinitions[index]
    await prisma.eventSpeakerProfile.upsert({
      where: { id: speaker.id },
      update: { accountId: account.id, name: speaker.name, title: speaker.title, organization: speaker.organization, normalizedName: speaker.name.toLowerCase(), isArchived: false },
      create: { id: speaker.id, accountId: account.id, name: speaker.name, title: speaker.title, organization: speaker.organization, normalizedName: speaker.name.toLowerCase() },
    })
  }
  const existingAssignments = isExistingEventSeed()
    ? await prisma.eventSessionSpeakerAssignment.findMany({ where: { eventId: event.id }, include: { speaker: true }, orderBy: { sortOrder: 'asc' } })
    : []
  if (isExistingEventSeed() && existingAssignments.length === 0) {
    throw new Error(`Target event "${event.id}" has no existing speaker assignments to connect speaker-result data to.`)
  }
  for (const plan of speakerAssignmentPlans) {
    const session = agendaSessionDefinitions.find((candidate) => candidate.slug === plan.sessionSlug)
    if (!session) throw new Error(`Missing agenda session definition ${plan.sessionSlug}`)
    const sessionRecord = structureBySlug.get(session.slug)
    const speaker = speakerDefinitions[plan.speakerIndex]
    if (!sessionRecord) throw new Error(`Missing agenda session ${session.slug}`)
    const existingAssignment = isExistingEventSeed()
      ? existingAssignments.find((candidate) => candidate.sessionId === sessionRecord.id && candidate.speakerId === speaker.id)
        ?? (plan.sortOrder === 0 ? existingAssignments.find((candidate) => candidate.sessionId === sessionRecord.id) : null)
      : null
    if (isExistingEventSeed() && plan.sortOrder > 0 && !existingAssignment) continue
    const assignment = existingAssignment ?? await prisma.eventSessionSpeakerAssignment.upsert({
      where: { id: assignmentId(session.slug, speaker.id) },
      update: { accountId: account.id, eventId: event.id, sessionId: sessionRecord.id, speakerId: speaker.id, role: plan.role, sortOrder: plan.sortOrder, metadata: { seededBy: SEEDED_BY } },
      create: { id: assignmentId(session.slug, speaker.id), accountId: account.id, eventId: event.id, sessionId: sessionRecord.id, speakerId: speaker.id, role: plan.role, sortOrder: plan.sortOrder, metadata: { seededBy: SEEDED_BY } },
    })
    if (plan.sortOrder === 0) {
      speakerBySessionSlug.set(session.slug, assignment.id)
      speakerProfileBySessionSlug.set(session.slug, assignment.speakerId)
      if (existingAssignment) speakerBySessionSlug.set(`${session.slug}:speaker-name`, existingAssignment.speaker.name)
    }
  }

  const targetBySlug = new Map<string, Awaited<ReturnType<typeof prisma.surveyTarget.upsert>>>()
  for (const definition of listeningPointDefinitions) {
    const structureItem = structureBySlug.get(definition.slug)
    if (!structureItem) throw new Error(`Missing listening point structure ${definition.slug}`)
    const target = await prisma.surveyTarget.upsert({
      where: { eventId_slug: { eventId: event.id, slug: scopedSeedSlug(definition.slug) } },
      update: { locationId: structureItem.locationId, eventStructureItemId: structureItem.id, speakerAssignmentId: null, category: categoryForKind(structureItem.kind), name: structureItem.name, description: structureItem.description, metadata: { seededBy: SEEDED_BY, demo: true, listeningPoint: true, structureKind: structureItem.kind }, isActive: true },
      create: { id: listeningPointId(definition.slug), eventId: event.id, locationId: structureItem.locationId, eventStructureItemId: structureItem.id, speakerAssignmentId: null, category: categoryForKind(structureItem.kind), name: structureItem.name, slug: scopedSeedSlug(definition.slug), description: structureItem.description, metadata: { seededBy: SEEDED_BY, demo: true, listeningPoint: true, structureKind: structureItem.kind }, isActive: true },
    })
    targetBySlug.set(definition.slug, target)
  }

  // These are result scopes, not additional listening points. Generic session
  // targets remain separate from the canonical direct SPEAKER target.
  const resultTargetByKey = new Map<string, Awaited<ReturnType<typeof prisma.surveyTarget.upsert>>>()
  for (let index = 0; index < agendaSessionDefinitions.length; index++) {
    const session = agendaSessionDefinitions[index]
    const structureItem = structureBySlug.get(session.slug)
    const speakerAssignmentId = speakerBySessionSlug.get(session.slug)
    if (!structureItem || !speakerAssignmentId) throw new Error(`Missing result scope for session ${session.slug}`)

    const genericTarget = await prisma.surveyTarget.upsert({
      where: { eventId_slug: { eventId: event.id, slug: scopedSeedSlug(`session-results-${session.slug}`) } },
      update: { locationId: null, eventStructureItemId: structureItem.id, speakerAssignmentId: null, category: SurveyTargetCategory.SESSION, name: `${session.name} session results`, description: `Persisted attendee results for ${session.name}.`, metadata: { seededBy: SEEDED_BY, demo: true, listeningPoint: false, resultScope: 'SESSION', structureKind: structureItem.kind }, isActive: true },
      create: { id: resultTargetId('session', session.slug), eventId: event.id, locationId: null, eventStructureItemId: structureItem.id, speakerAssignmentId: null, category: SurveyTargetCategory.SESSION, name: `${session.name} session results`, slug: scopedSeedSlug(`session-results-${session.slug}`), description: `Persisted attendee results for ${session.name}.`, metadata: { seededBy: SEEDED_BY, demo: true, listeningPoint: false, resultScope: 'SESSION', structureKind: structureItem.kind }, isActive: true },
    })
    resultTargetByKey.set(`session:${session.slug}`, genericTarget)

  }

  const resultSpeakers = isExistingEventSeed()
    ? [...new Map(existingAssignments.map((assignment) => [assignment.speaker.id, assignment.speaker])).values()]
    : speakerDefinitions
  for (const speaker of resultSpeakers) {
    const speakerTarget = await prisma.surveyTarget.upsert({
      where: { eventId_slug: { eventId: event.id, slug: `speaker-${speaker.id}` } },
      update: { locationId: null, eventStructureItemId: null, speakerAssignmentId: null, speakerId: speaker.id, category: SurveyTargetCategory.SPEAKER, name: speaker.name, description: `Event-wide speaker feedback for ${speaker.name}, with optional session launch context retained on links and responses.`, metadata: { seededBy: SEEDED_BY, demo: true, listeningPoint: false, resultScope: 'SPEAKER' }, isActive: true },
      create: { id: resultTargetId('speaker', speaker.id), eventId: event.id, locationId: null, eventStructureItemId: null, speakerAssignmentId: null, speakerId: speaker.id, category: SurveyTargetCategory.SPEAKER, name: speaker.name, slug: `speaker-${speaker.id}`, description: `Event-wide speaker feedback for ${speaker.name}, with optional session launch context retained on links and responses.`, metadata: { seededBy: SEEDED_BY, demo: true, listeningPoint: false, resultScope: 'SPEAKER' }, isActive: true },
    })
    resultTargetByKey.set(`speaker-profile:${speaker.id}`, speakerTarget)
  }
  for (let index = 0; index < agendaSessionDefinitions.length; index++) {
    const session = agendaSessionDefinitions[index]
    const existingAssignment = isExistingEventSeed()
      ? existingAssignments.find((assignment) => assignment.sessionId === structureBySlug.get(session.slug)?.id)
      : null
    const speaker = existingAssignment?.speaker ?? speakerDefinitions[index % speakerDefinitions.length]
    const speakerTarget = resultTargetByKey.get(`speaker-profile:${speaker.id}`)
    if (!speakerTarget) throw new Error(`Missing direct speaker target for ${speaker.name}`)
    resultTargetByKey.set(`speaker:${session.slug}`, speakerTarget)
  }

  const surveyByKey = new Map<string, Awaited<ReturnType<typeof prisma.survey.upsert>>>()
  const surveyTargetByKey = new Map<string, Awaited<ReturnType<typeof prisma.surveyTarget.upsert>>>()
  const questionByKey = new Map<string, Awaited<ReturnType<typeof prisma.question.upsert>>>()
  const linkBySurveyKey = new Map<string, Awaited<ReturnType<typeof prisma.publicSurveyLink.upsert>>>()

  for (const surveyDef of surveyDefinitions) {
    const structureItem = structureBySlug.get(surveyDef.structureSlug)
    if (!structureItem) {
      throw new Error(`Missing structure item for ${surveyDef.structureSlug}`)
    }

    const target = surveyDef.targetKey ? resultTargetByKey.get(surveyDef.targetKey) : targetBySlug.get(surveyDef.structureSlug)
    if (!target) throw new Error(`Missing survey target for ${surveyDef.targetKey ?? surveyDef.structureSlug}`)
    surveyTargetByKey.set(surveyDef.key, target)

    const survey = await prisma.survey.upsert({
      where: { id: surveyId(surveyDef.key) },
      update: {
        eventId: event.id,
        surveyTargetId: target.id,
        name: surveyDef.name,
        description: surveyDef.description,
        responseMode: surveyDef.responseMode ?? ResponseMode.VOICE_ONLY,
        status: surveyDef.status ?? EventStatus.ACTIVE,
        collectionPhase: surveyDef.collectionPhase,
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        settingsJson: {
          seededBy: SEEDED_BY,
          demo: true,
          questionHelpers: Object.fromEntries(surveyDef.questions.map((question) => [question.key, question.helperText])),
        },
      },
      create: {
        id: surveyId(surveyDef.key),
        eventId: event.id,
        surveyTargetId: target.id,
        name: surveyDef.name,
        description: surveyDef.description,
        responseMode: surveyDef.responseMode ?? ResponseMode.VOICE_ONLY,
        status: surveyDef.status ?? EventStatus.ACTIVE,
        collectionPhase: surveyDef.collectionPhase,
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        settingsJson: {
          seededBy: SEEDED_BY,
          demo: true,
          questionHelpers: Object.fromEntries(surveyDef.questions.map((question) => [question.key, question.helperText])),
        },
      },
    })
    surveyByKey.set(surveyDef.key, survey)

    for (const questionDef of surveyDef.questions) {
      const question = await prisma.question.upsert({
        where: {
          eventId_key: {
            eventId: event.id,
            key: scopedQuestionKey(questionDef.key),
          },
        },
        update: {
          surveyId: survey.id,
          label: questionDef.label,
          ttsText: questionDef.label,
          type: questionDef.type ?? QuestionType.VOICE,
          responseTarget: questionDef.type === QuestionType.SPEAKER_FEEDBACK ? QuestionResponseTarget.SPEAKERS : QuestionResponseTarget.GENERAL,
          order: questionDef.order,
          required: true,
        },
        create: {
          id: questionId(questionDef.key),
          eventId: event.id,
          surveyId: survey.id,
          key: scopedQuestionKey(questionDef.key),
          label: questionDef.label,
          ttsText: questionDef.label,
          type: questionDef.type ?? QuestionType.VOICE,
          responseTarget: questionDef.type === QuestionType.SPEAKER_FEEDBACK ? QuestionResponseTarget.SPEAKERS : QuestionResponseTarget.GENERAL,
          order: questionDef.order,
          required: true,
        },
      })
      questionByKey.set(questionDef.key, question)
    }

    if (surveyDef.createPublicLink === false) continue

    const link = await prisma.publicSurveyLink.upsert({
      where: { token: scopedSeedToken(surveyDef.token) },
      update: {
        surveyId: survey.id,
        surveyTargetId: target.id,
        slug: scopedSeedSlug(surveyDef.key),
        isActive: surveyDef.linkIsActive ?? surveyDef.status !== EventStatus.DRAFT,
        expiresAt: null,
        metadata: {
          seededBy: SEEDED_BY,
          demo: true,
          eventId: event.id,
          surveyKey: surveyDef.key,
          structureSlug: surveyDef.structureSlug,
        },
      },
      create: {
        surveyId: survey.id,
        surveyTargetId: target.id,
        token: scopedSeedToken(surveyDef.token),
        slug: scopedSeedSlug(surveyDef.key),
        isActive: surveyDef.linkIsActive ?? surveyDef.status !== EventStatus.DRAFT,
        expiresAt: null,
        metadata: {
          seededBy: SEEDED_BY,
          demo: true,
          eventId: event.id,
          surveyKey: surveyDef.key,
          structureSlug: surveyDef.structureSlug,
        },
      },
    })
    linkBySurveyKey.set(surveyDef.key, link)
  }

  const sharedSurvey = surveyByKey.get('shared-session-and-speaker-feedback')
  if (!sharedSurvey) throw new Error('Missing shared session and speaker survey')
  const sharedSessionTargets = []
  for (const session of agendaSessionDefinitions.slice(0, 6)) {
    const structureItem = structureBySlug.get(session.slug)
    if (!structureItem) throw new Error(`Missing bulk-assignment session ${session.slug}`)
    const target = targetBySlug.get(session.slug) ?? await prisma.surveyTarget.upsert({
      where: { eventId_slug: { eventId: event.id, slug: scopedSeedSlug(`advanced-session-${session.slug}`) } },
      update: { eventStructureItemId: structureItem.id, category: SurveyTargetCategory.SESSION, name: session.name, metadata: { seededBy: SEEDED_BY, demo: true, advancedAssignment: { kind: 'SESSION', selection: 'SELECTED' } }, isActive: true },
      create: { id: scopedSeedValue(`target_events_demo_bulk_${session.slug.replace(/-/g, '_')}`), eventId: event.id, eventStructureItemId: structureItem.id, category: SurveyTargetCategory.SESSION, name: session.name, slug: scopedSeedSlug(`advanced-session-${session.slug}`), metadata: { seededBy: SEEDED_BY, demo: true, advancedAssignment: { kind: 'SESSION', selection: 'SELECTED' } }, isActive: true },
    })
    sharedSessionTargets.push(target)
    await prisma.publicSurveyLink.upsert({
      where: { token: scopedSeedToken(`shared-session-speaker-${session.slug}`) },
      update: { surveyId: sharedSurvey.id, surveyTargetId: target.id, speakerAssignmentId: null, isActive: true, metadata: { seededBy: SEEDED_BY, assignmentSource: 'ADVANCED_SURVEY_BUILDER', assignmentState: 'CURRENT', advancedAssignment: { kind: 'SESSION', selection: 'SELECTED' } } },
      create: { surveyId: sharedSurvey.id, surveyTargetId: target.id, speakerAssignmentId: null, token: scopedSeedToken(`shared-session-speaker-${session.slug}`), slug: scopedSeedSlug(`shared-session-speaker-${session.slug}`), isActive: true, metadata: { seededBy: SEEDED_BY, assignmentSource: 'ADVANCED_SURVEY_BUILDER', assignmentState: 'CURRENT', advancedAssignment: { kind: 'SESSION', selection: 'SELECTED' } } },
    })
  }
  await prisma.survey.update({ where: { id: sharedSurvey.id }, data: { surveyTargetId: sharedSessionTargets[0].id } })

  const answerContextByRef = new Map<
    string,
    {
      answerId: string
      responseId: string
      surveyId: string
      surveyTargetId: string
      questionId: string
      transcript: string
      sentimentScore: number
      priorityLevel: string
      createdAt: Date
    }
  >()

  for (const responseDef of responseDefinitions) {
    const surveyDefinition = surveyDefinitionByKey.get(responseDef.surveyKey)
    const survey = surveyByKey.get(responseDef.surveyKey)
    const target = surveyTargetByKey.get(responseDef.surveyKey)
    const link = linkBySurveyKey.get(responseDef.surveyKey)
    if (!surveyDefinition || !survey || !target || (responseDef.requiresPublicLink !== false && !link)) {
      throw new Error(`Missing survey state for response ${responseDef.id}`)
    }
    const responseSpeakerAssignmentId = responseDef.speakerAssignmentSessionSlug
      ? speakerBySessionSlug.get(responseDef.speakerAssignmentSessionSlug) ?? null
      : null
    const responseSpeakerProfileId = responseDef.speakerAssignmentSessionSlug
      ? speakerProfileBySessionSlug.get(responseDef.speakerAssignmentSessionSlug) ?? responseDef.speakerProfileId ?? null
      : responseDef.speakerProfileId ?? null

    const response = await prisma.response.upsert({
      where: { id: scopedSeedValue(responseDef.id) },
      update: {
        eventId: event.id,
        surveyId: survey.id,
        surveyTargetId: target.id,
        publicSurveyLinkId: responseDef.requiresPublicLink === false ? null : link!.id,
        speakerAssignmentId: responseSpeakerAssignmentId,
        anonymousId: responseDef.anonymousId,
        status: ResponseStatus.COMPLETED,
        collectionPhase: surveyDefinition.collectionPhase,
        startedAt: responseDef.startedAt,
        completedAt: responseDef.completedAt,
        metadata: {
          seededBy: SEEDED_BY,
          demo: true,
          source: 'seeded-completed-response',
          accountSlug: ACCOUNT_SLUG,
        },
      },
      create: {
        id: scopedSeedValue(responseDef.id),
        eventId: event.id,
        surveyId: survey.id,
        surveyTargetId: target.id,
        publicSurveyLinkId: responseDef.requiresPublicLink === false ? null : link!.id,
        speakerAssignmentId: responseSpeakerAssignmentId,
        anonymousId: responseDef.anonymousId,
        status: ResponseStatus.COMPLETED,
        collectionPhase: surveyDefinition.collectionPhase,
        startedAt: responseDef.startedAt,
        completedAt: responseDef.completedAt,
        metadata: {
          seededBy: SEEDED_BY,
          demo: true,
          source: 'seeded-completed-response',
          accountSlug: ACCOUNT_SLUG,
        },
      },
    })

    for (const answerDef of responseDef.answers) {
      const question = questionByKey.get(answerDef.questionKey)
      if (!question) {
        throw new Error(`Missing question for ${answerDef.questionKey}`)
      }

      const stableAnswerId = answerId(response.id, answerDef.questionKey)
      const isStructuredAnswer = typeof answerDef.numericValue === 'number'
      const answer = await prisma.answer.upsert({
        where: { id: stableAnswerId },
        update: {
          responseId: response.id,
          questionId: question.id,
          questionKey: scopedQuestionKey(answerDef.questionKey),
          promptLabel: question.label,
          objectKey: isStructuredAnswer ? null : `seed/events-demo/${response.id}/${answerDef.questionKey}.webm`,
          objectEtag: isStructuredAnswer ? null : `seed-${response.id}-${answerDef.questionKey}`,
          mimeType: isStructuredAnswer ? null : 'audio/webm',
          fileSizeBytes: isStructuredAnswer ? null : 128000 + answerDef.transcript.length * 12,
          durationMs: isStructuredAnswer ? null : Math.max(9000, Math.min(65000, answerDef.transcript.length * 55)),
          numericValue: answerDef.numericValue,
          speakerId: responseSpeakerProfileId,
          status: AnswerStatus.COMPLETED,
          statusReason: 'Seeded transcript and analysis; no external audio processing was invoked.',
        },
        create: {
          id: stableAnswerId,
          responseId: response.id,
          questionId: question.id,
          questionKey: scopedQuestionKey(answerDef.questionKey),
          promptLabel: question.label,
          objectKey: isStructuredAnswer ? null : `seed/events-demo/${response.id}/${answerDef.questionKey}.webm`,
          objectEtag: isStructuredAnswer ? null : `seed-${response.id}-${answerDef.questionKey}`,
          mimeType: isStructuredAnswer ? null : 'audio/webm',
          fileSizeBytes: isStructuredAnswer ? null : 128000 + answerDef.transcript.length * 12,
          durationMs: isStructuredAnswer ? null : Math.max(9000, Math.min(65000, answerDef.transcript.length * 55)),
          numericValue: answerDef.numericValue,
          speakerId: responseSpeakerProfileId,
          status: AnswerStatus.COMPLETED,
          statusReason: 'Seeded transcript and analysis; no external audio processing was invoked.',
        },
      })

      await prisma.answerTranscript.upsert({
        where: { answerId: answer.id },
        update: {
          provider: 'seed',
          model: 'events-demo-script',
          text: answerDef.transcript,
          wordsJson: {
            seededBy: SEEDED_BY,
            wordCount: answerDef.transcript.split(/\s+/).length,
          },
        },
        create: {
          id: `transcript_${answer.id}`,
          answerId: answer.id,
          provider: 'seed',
          model: 'events-demo-script',
          text: answerDef.transcript,
          wordsJson: {
            seededBy: SEEDED_BY,
            wordCount: answerDef.transcript.split(/\s+/).length,
          },
        },
      })

      await prisma.answerAnalysis.upsert({
        where: { answerId: answer.id },
        update: {
          provider: 'seed',
          model: 'events-demo-script',
          promptVersion: PROMPT_VERSION,
          summary: answerDef.summary,
          sentimentScore: answerDef.sentimentScore,
          sentimentLabel: answerDef.sentimentLabel,
          themesJson: answerDef.themes,
          actionsJson: answerDef.actions,
          entitiesJson: answerDef.entities,
        },
        create: {
          id: `analysis_${answer.id}`,
          answerId: answer.id,
          provider: 'seed',
          model: 'events-demo-script',
          promptVersion: PROMPT_VERSION,
          summary: answerDef.summary,
          sentimentScore: answerDef.sentimentScore,
          sentimentLabel: answerDef.sentimentLabel,
          themesJson: answerDef.themes,
          actionsJson: answerDef.actions,
          entitiesJson: answerDef.entities,
        },
      })

      const intelligence = await prisma.answerEventIntelligence.upsert({
        where: { answerId: answer.id },
        update: {
          accountId: account.id,
          locationId: location.id,
          eventId: event.id,
          surveyId: survey.id,
          surveyTargetId: target.id,
          responseId: response.id,
          questionId: question.id,
          sentimentLabel: answerDef.sentimentLabel,
          sentimentScore: answerDef.sentimentScore,
          urgency: answerDef.urgency,
          frictionCategory: answerDef.frictionCategory,
          actionWindow: answerDef.actionWindow,
          recommendedAction: answerDef.recommendedAction,
          confidence: 0.86,
          promptVersion: PROMPT_VERSION,
          model: 'events-demo-script',
        },
        create: {
          id: `intel_${answer.id}`,
          accountId: account.id,
          locationId: location.id,
          eventId: event.id,
          surveyId: survey.id,
          surveyTargetId: target.id,
          responseId: response.id,
          answerId: answer.id,
          questionId: question.id,
          sentimentLabel: answerDef.sentimentLabel,
          sentimentScore: answerDef.sentimentScore,
          urgency: answerDef.urgency,
          frictionCategory: answerDef.frictionCategory,
          actionWindow: answerDef.actionWindow,
          recommendedAction: answerDef.recommendedAction,
          confidence: 0.86,
          promptVersion: PROMPT_VERSION,
          model: 'events-demo-script',
        },
      })

      for (let index = 0; index < answerDef.themes.length; index++) {
        const theme = answerDef.themes[index]
        await prisma.answerEventTheme.upsert({
          where: { id: `theme_${answer.id}_${index}` },
          update: {
            intelligenceId: intelligence.id,
            eventId: event.id,
            surveyId: survey.id,
            surveyTargetId: target.id,
            answerId: answer.id,
            themeKey: theme.key,
            label: theme.label,
            sentimentLabel: theme.sentimentLabel,
            confidence: theme.confidence,
          },
          create: {
            id: `theme_${answer.id}_${index}`,
            intelligenceId: intelligence.id,
            eventId: event.id,
            surveyId: survey.id,
            surveyTargetId: target.id,
            answerId: answer.id,
            themeKey: theme.key,
            label: theme.label,
            sentimentLabel: theme.sentimentLabel,
            confidence: theme.confidence,
          },
        })
      }

      for (let index = 0; index < answerDef.entities.length; index++) {
        const entity = answerDef.entities[index]
        await prisma.answerEventEntity.upsert({
          where: { id: `entity_${answer.id}_${index}` },
          update: {
            intelligenceId: intelligence.id,
            eventId: event.id,
            surveyId: survey.id,
            surveyTargetId: target.id,
            answerId: answer.id,
            entityType: entity.type,
            label: entity.label,
            confidence: entity.confidence,
          },
          create: {
            id: `entity_${answer.id}_${index}`,
            intelligenceId: intelligence.id,
            eventId: event.id,
            surveyId: survey.id,
            surveyTargetId: target.id,
            answerId: answer.id,
            entityType: entity.type,
            label: entity.label,
            confidence: entity.confidence,
          },
        })
      }

      for (let index = 0; index < answerDef.actions.length; index++) {
        const action = answerDef.actions[index]
        await prisma.answerEventAction.upsert({
          where: { id: `action_${answer.id}_${index}` },
          update: {
            intelligenceId: intelligence.id,
            eventId: event.id,
            surveyId: survey.id,
            surveyTargetId: target.id,
            answerId: answer.id,
            title: action.title,
            description: action.description,
            priority: action.priority,
            urgency: action.urgency,
            actionWindow: action.actionWindow,
            status: 'OPEN',
            confidence: 0.84,
          },
          create: {
            id: `action_${answer.id}_${index}`,
            intelligenceId: intelligence.id,
            eventId: event.id,
            surveyId: survey.id,
            surveyTargetId: target.id,
            answerId: answer.id,
            title: action.title,
            description: action.description,
            priority: action.priority,
            urgency: action.urgency,
            actionWindow: action.actionWindow,
            status: 'OPEN',
            confidence: 0.84,
          },
        })
      }

      answerContextByRef.set(`${responseDef.id}:${answerDef.questionKey}`, {
        answerId: answer.id,
        responseId: response.id,
        surveyId: survey.id,
        surveyTargetId: target.id,
        questionId: question.id,
        transcript: answerDef.transcript,
        sentimentScore: answerDef.sentimentScore,
        priorityLevel:
          answerDef.urgency === 'HIGH' ? 'Immediate' : answerDef.urgency === 'MEDIUM' ? 'Soon' : 'Watch',
        createdAt: responseDef.completedAt,
      })
    }
  }

  for (const clusterDef of clusterDefinitions) {
    const evidence = clusterDef.evidenceAnswerRefs
      .map((ref) => answerContextByRef.get(`${ref.responseId}:${ref.questionKey}`))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    if (evidence.length === 0) {
      continue
    }

    const firstSeenAt = evidence.reduce((oldest, row) => (row.createdAt < oldest ? row.createdAt : oldest), evidence[0].createdAt)
    const lastSeenAt = evidence.reduce((latest, row) => (row.createdAt > latest ? row.createdAt : latest), evidence[0].createdAt)
    const primary = evidence[0]

    const cluster = await prisma.eventIssueCluster.upsert({
      where: { clusterKey: scopedClusterKey(clusterDef.key) },
      update: {
        accountId: account.id,
        locationId: location.id,
        eventId: event.id,
        surveyId: primary.surveyId,
        surveyTargetId: primary.surveyTargetId,
        questionId: primary.questionId,
        taxonomyKey: clusterDef.taxonomyKey,
        title: clusterDef.title,
        summary: clusterDef.summary,
        priorityLevel: clusterDef.priorityLevel,
        legacyUrgency: clusterDef.priorityLevel,
        impactScore: clusterDef.impactScore,
        timeSensitivityScore: clusterDef.timeSensitivityScore,
        confidence: clusterDef.confidence,
        evidenceCount: evidence.length,
        firstSeenAt,
        lastSeenAt,
        recommendedNextStep: clusterDef.recommendedNextStep,
        status: 'NEW',
      },
      create: {
        id: scopedSeedValue(`cluster_events_demo_${clusterDef.key}`),
        clusterKey: scopedClusterKey(clusterDef.key),
        accountId: account.id,
        locationId: location.id,
        eventId: event.id,
        surveyId: primary.surveyId,
        surveyTargetId: primary.surveyTargetId,
        questionId: primary.questionId,
        taxonomyKey: clusterDef.taxonomyKey,
        title: clusterDef.title,
        summary: clusterDef.summary,
        priorityLevel: clusterDef.priorityLevel,
        legacyUrgency: clusterDef.priorityLevel,
        impactScore: clusterDef.impactScore,
        timeSensitivityScore: clusterDef.timeSensitivityScore,
        confidence: clusterDef.confidence,
        evidenceCount: evidence.length,
        firstSeenAt,
        lastSeenAt,
        recommendedNextStep: clusterDef.recommendedNextStep,
        status: 'NEW',
      },
    })

    for (const row of evidence) {
      await prisma.eventIssueEvidence.upsert({
        where: {
          clusterId_answerId: {
            clusterId: cluster.id,
            answerId: row.answerId,
          },
        },
        update: {
          accountId: account.id,
          locationId: location.id,
          eventId: event.id,
          surveyId: row.surveyId,
          surveyTargetId: row.surveyTargetId,
          responseId: row.responseId,
          questionId: row.questionId,
          transcriptSnippet: row.transcript.slice(0, 320),
          sentimentScore: row.sentimentScore,
          priorityLevel: row.priorityLevel,
        },
        create: {
          id: `evidence_${clusterDef.key}_${row.answerId}`,
          clusterId: cluster.id,
          accountId: account.id,
          locationId: location.id,
          eventId: event.id,
          surveyId: row.surveyId,
          surveyTargetId: row.surveyTargetId,
          responseId: row.responseId,
          answerId: row.answerId,
          questionId: row.questionId,
          transcriptSnippet: row.transcript.slice(0, 320),
          sentimentScore: row.sentimentScore,
          priorityLevel: row.priorityLevel,
        },
      })
    }
  }

  const actionOwners = [
    {
      id: productionEnvironment ? scopedUuid('action-owner-operations') : '0e177dd7-6d4f-44c1-a029-91fd98266129',
      email: productionEnvironment ? `operations.demo+${seedScopeSuffix}@example.invalid` : 'operations.events-demo@signalthread.example',
      firstName: 'Jordan',
      lastName: 'Lee',
      role: 'MANAGER' as const,
    },
    {
      id: productionEnvironment ? scopedUuid('action-owner-programming') : 'c0c15547-75f7-4395-b83f-fd10dcd98478',
      email: productionEnvironment ? `programming.demo+${seedScopeSuffix}@example.invalid` : 'programming.events-demo@signalthread.example',
      firstName: 'Casey',
      lastName: 'Morgan',
      role: 'ADMIN' as const,
    },
    {
      id: productionEnvironment ? scopedUuid('action-owner-partners') : '2d4ee018-655d-4774-a119-c8ed32b15f23',
      email: productionEnvironment ? `partners.demo+${seedScopeSuffix}@example.invalid` : 'partners.events-demo@signalthread.example',
      firstName: 'Riley',
      lastName: 'Santos',
      role: 'MANAGER' as const,
    },
  ]

  for (const owner of actionOwners) {
    await prisma.user.upsert({
      where: { id: owner.id },
      update: { accountId: account.id, firstName: owner.firstName, lastName: owner.lastName, role: owner.role, isActive: true },
      create: { id: owner.id, email: owner.email, accountId: account.id, firstName: owner.firstName, lastName: owner.lastName, role: owner.role, isActive: true },
    })
  }

  const actionDefinitions = [
    {
      clusterKey: 'registration_queue_signage',
      ownerUserId: actionOwners[0].id,
      classification: EventActionClassification.DURING_EVENT,
      status: EventActionStatus.WORKING,
      clusterStatus: 'ACTING',
      dueAt: new Date('2026-09-18T14:30:00.000Z'),
      blockedReason: null,
      resolution: null,
      updates: [
        'Venue operations added visible lane signage and a staffed registration split before the next arrival window.',
        'The afternoon arrival window stayed below the morning queue threshold; operations will keep the greeter through close.',
      ],
    },
    {
      clusterKey: 'expo_ai_lounge_wayfinding',
      ownerUserId: actionOwners[1].id,
      classification: EventActionClassification.AFTER_EVENT_FOLLOW_UP,
      status: EventActionStatus.BLOCKED,
      clusterStatus: 'ACTING',
      dueAt: new Date('2026-09-25T17:00:00.000Z'),
      blockedReason: 'Venue print vendor cannot replace the full sign set until after the event closes.',
      resolution: null,
      updates: [
        'The floor team moved the temporary AI Lounge sign above the aisle banner and reconciled the next-day room labels in the event app.',
        'A full printed-sign replacement is blocked on the venue vendor and is scheduled as a post-event follow-up.',
      ],
    },
    {
      clusterKey: 'sponsor_followup_clarity',
      ownerUserId: actionOwners[2].id,
      classification: EventActionClassification.AFTER_EVENT_FOLLOW_UP,
      status: EventActionStatus.OPEN,
      clusterStatus: 'ACKNOWLEDGED',
      dueAt: new Date('2026-10-09T17:00:00.000Z'),
      blockedReason: null,
      resolution: null,
      updates: [
        'Partner operations is testing a post-demo QR prompt and a clearer next-step card for the next event.',
        'The team will compare QR scans with staffed demo follow-up requests before choosing the final booth flow.',
      ],
    },
    {
      clusterKey: 'vip_access_food',
      ownerUserId: actionOwners[0].id,
      classification: EventActionClassification.NEXT_EVENT_LEARNING,
      status: EventActionStatus.COMPLETE,
      clusterStatus: 'RESOLVED',
      dueAt: new Date('2026-09-22T17:00:00.000Z'),
      blockedReason: null,
      resolution: 'The VIP room name and late-arrival food replenishment were documented in the next-event hospitality runbook.',
      updates: [
        'Hospitality documented the invitation, host-stand, and signage naming convention for the next VIP reception.',
        'A late-arrival food replenishment checkpoint is now included in the reception runbook.',
      ],
    },
    {
      clusterKey: 'keynote_qa_depth',
      ownerUserId: actionOwners[1].id,
      classification: EventActionClassification.NEXT_EVENT_LEARNING,
      status: EventActionStatus.OPEN,
      clusterStatus: 'ACKNOWLEDGED',
      dueAt: new Date('2026-10-02T17:00:00.000Z'),
      blockedReason: null,
      resolution: null,
      updates: [
        'Programming added a protected Q and A block to the keynote planning template.',
        'The content team is reviewing which introduction material can move to pre-event channels to protect audience time.',
      ],
    },
    {
      clusterKey: 'food_queue_flow',
      ownerUserId: actionOwners[0].id,
      classification: EventActionClassification.DURING_EVENT,
      status: EventActionStatus.WORKING,
      clusterStatus: 'ACTING',
      dueAt: new Date('2026-09-18T15:00:00.000Z'),
      blockedReason: null,
      resolution: null,
      updates: [
        'Operations placed stanchions at the lounge boundary and redirected the coffee line away from the demo aisle.',
        'The team is monitoring the final afternoon break to confirm the revised queue does not spill back into exhibitors.',
      ],
    },
    {
      clusterKey: 'workshop_materials_clarity',
      ownerUserId: null,
      classification: EventActionClassification.NEXT_EVENT_LEARNING,
      status: EventActionStatus.UNASSIGNED,
      clusterStatus: 'NEW',
      dueAt: new Date('2026-10-16T17:00:00.000Z'),
      blockedReason: 'A content owner has not yet been assigned to revise the worksheet.',
      resolution: null,
      updates: [
        'The finding is ready for assignment once the next workshop content owner is confirmed.',
      ],
    },
    {
      clusterKey: 'venue_label_alignment',
      ownerUserId: actionOwners[2].id,
      classification: EventActionClassification.AFTER_EVENT_FOLLOW_UP,
      status: EventActionStatus.COMPLETE,
      clusterStatus: 'RESOLVED',
      dueAt: new Date('2026-09-21T17:00:00.000Z'),
      blockedReason: null,
      resolution: 'The event team reconciled the room-label inventory and added a single-source checklist for the next venue setup.',
      updates: [
        'The venue and app room-label inventory was reconciled after close.',
        'Partner operations added a single-source room-label checklist to the venue onboarding packet.',
      ],
    },
  ]

  if (actionDefinitions.length !== expectedSeedTotals.canonicalActionWorkflows) {
    throw new Error(`Seed definition total mismatch for canonicalActionWorkflows: expected ${expectedSeedTotals.canonicalActionWorkflows}, received ${actionDefinitions.length}`)
  }

  for (const definition of actionDefinitions) {
    const cluster = await prisma.eventIssueCluster.findUniqueOrThrow({
      where: { clusterKey: scopedClusterKey(definition.clusterKey) },
      select: { id: true },
    })

    await prisma.eventIssueCluster.update({
      where: { id: cluster.id },
      data: {
        actionClassification: definition.classification,
        actionStatus: definition.status,
        ownerUserId: definition.ownerUserId,
        ownerAssignedAt: definition.ownerUserId ? new Date('2026-09-18T12:00:00.000Z') : null,
        ownerAssignedByUserId: definition.ownerUserId ? actionOwners[1].id : null,
        actionDueAt: definition.dueAt,
        actionBlockedReason: definition.blockedReason,
        actionResolution: definition.resolution,
        actionConvertedAt: new Date('2026-09-18T12:00:00.000Z'),
        actionConvertedByUserId: actionOwners[1].id,
        statusChangedAt: new Date('2026-09-18T12:00:00.000Z'),
        status: definition.clusterStatus,
        resolvedAt: definition.clusterStatus === 'RESOLVED' ? new Date('2026-09-19T16:00:00.000Z') : null,
        resolvedByUserId: definition.clusterStatus === 'RESOLVED' ? definition.ownerUserId : null,
        resolutionReason: definition.resolution,
      },
    })

    const assignmentHistoryType = definition.ownerUserId ? EventActionHistoryType.ASSIGNED : EventActionHistoryType.UNASSIGNED
    await prisma.eventActionHistory.upsert({
      where: { clusterId_idempotencyKey: { clusterId: cluster.id, idempotencyKey: `${SEEDED_BY}:${definition.clusterKey}:assignment` } },
      update: { actorUserId: actionOwners[1].id, type: assignmentHistoryType, fromValue: null, toValue: definition.ownerUserId, detailsJson: { seededBy: SEEDED_BY, dueAt: definition.dueAt.toISOString(), notificationState: 'NOT_REQUESTED' } },
      create: { id: scopedSeedValue(`history_events_demo_${definition.clusterKey}_assignment`), clusterId: cluster.id, accountId: account.id, eventId: event.id, actorUserId: actionOwners[1].id, idempotencyKey: `${SEEDED_BY}:${definition.clusterKey}:assignment`, type: assignmentHistoryType, toValue: definition.ownerUserId, detailsJson: { seededBy: SEEDED_BY, dueAt: definition.dueAt.toISOString(), notificationState: 'NOT_REQUESTED' } },
    })

    await prisma.eventActionHistory.upsert({
      where: { clusterId_idempotencyKey: { clusterId: cluster.id, idempotencyKey: `${SEEDED_BY}:${definition.clusterKey}:status` } },
      update: { actorUserId: actionOwners[1].id, type: EventActionHistoryType.STATUS_CHANGED, fromValue: 'OPEN', toValue: definition.status, detailsJson: { seededBy: SEEDED_BY, clusterStatus: definition.clusterStatus } },
      create: { id: scopedSeedValue(`history_events_demo_${definition.clusterKey}_status`), clusterId: cluster.id, accountId: account.id, eventId: event.id, actorUserId: actionOwners[1].id, idempotencyKey: `${SEEDED_BY}:${definition.clusterKey}:status`, type: EventActionHistoryType.STATUS_CHANGED, fromValue: 'OPEN', toValue: definition.status, detailsJson: { seededBy: SEEDED_BY, clusterStatus: definition.clusterStatus } },
    })

    for (const [updateIndex, updateBody] of definition.updates.entries()) {
      await prisma.eventActionUpdate.upsert({
        where: { clusterId_idempotencyKey: { clusterId: cluster.id, idempotencyKey: `${SEEDED_BY}:${definition.clusterKey}:update:${updateIndex + 1}` } },
        update: { authorUserId: definition.ownerUserId ?? actionOwners[1].id, kind: EventActionUpdateKind.WRITTEN, body: updateBody },
        create: { id: scopedSeedValue(`update_events_demo_${definition.clusterKey}_${updateIndex + 1}`), clusterId: cluster.id, accountId: account.id, eventId: event.id, authorUserId: definition.ownerUserId ?? actionOwners[1].id, idempotencyKey: `${SEEDED_BY}:${definition.clusterKey}:update:${updateIndex + 1}`, kind: EventActionUpdateKind.WRITTEN, body: updateBody },
      })
    }

    // Deliberately no EventActionAssignmentDelivery: demo seeding never sends email.
  }

  await seedAggregates({ accountId: account.id, locationId: location.id, eventId: event.id })

  const baseUrl = appBaseUrl()
  const kioskLinks = await prisma.publicSurveyLink.findMany({
    where: { survey: { eventId: event.id }, isActive: true },
    select: {
      id: true,
      token: true,
      survey: { select: { name: true } },
      surveyTarget: { select: { id: true, category: true, name: true, eventStructureItemId: true, speakerId: true } },
      speakerAssignmentId: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log('[seed-voice-events-demo] complete')
  console.log(`  account: ${account.name} (${ACCOUNT_SLUG})`)
  console.log(`  populated event: ${event.name} (${event.id})`)
  console.log(`  agenda sessions: ${agendaSessionDefinitions.length}`)
  console.log(`  listening points: ${listeningPointDefinitions.length} (4 session)`)
  console.log(`  speakers: ${speakerDefinitions.length}`)
  console.log(`  speaker assignments: ${speakerAssignmentPlans.length}`)
  console.log(`  surveys: ${surveyDefinitions.length}`)
  console.log(`  completed responses: ${responseDefinitions.length}`)
  console.log(`  completed answers: ${responseDefinitions.reduce((sum, response) => sum + response.answers.length, 0)}`)
  const coverage = resultCoverageSummary()
  console.log(`  session result coverage: ${coverage.sessionsWithResponses}/${agendaSessionDefinitions.length} (${coverage.minResponsesPerSession}-${coverage.maxResponsesPerSession}, avg ${coverage.averageResponsesPerSession.toFixed(1)} responses/session)`)
  console.log(`  speaker result coverage: ${coverage.speakerAssignmentsWithResults}/${agendaSessionDefinitions.length} (${coverage.minSpeakerAnswersPerAssignment}-${coverage.maxSpeakerAnswersPerAssignment} speaker-evaluating answers/assignment)`)
  console.log(`  session vs speaker-specific answers: ${coverage.sessionAnswers} / ${coverage.speakerSpecificAnswers}`)
  console.log(`  issue clusters: ${clusterDefinitions.length}`)
  console.log(`  evidence records: ${clusterDefinitions.reduce((sum, cluster) => sum + cluster.evidenceAnswerRefs.length, 0)}`)
  console.log(`  canonical action workflows: ${actionDefinitions.length}`)
  console.log('')
  console.log('URLs:')
  console.log(`  App: ${baseUrl}/app?account=${ACCOUNT_SLUG}`)
  console.log(`  Event detail: ${baseUrl}/app/events/${event.id}?account=${ACCOUNT_SLUG}`)
  console.log(`  Event dashboard: ${baseUrl}/app/events/${event.id}/dashboard?account=${ACCOUNT_SLUG}`)
  console.log(`  Session Intelligence: ${baseUrl}/app/events/${event.id}/dashboard?account=${ACCOUNT_SLUG}&tab=intelligence&lifecycle=in-event&intelligenceScope=sessions`)
  console.log(`  Speaker Intelligence: ${baseUrl}/app/events/${event.id}/dashboard?account=${ACCOUNT_SLUG}&tab=intelligence&lifecycle=in-event&intelligenceScope=speakers`)
  console.log(`  Event Areas Intelligence: ${baseUrl}/app/events/${event.id}/dashboard?account=${ACCOUNT_SLUG}&tab=intelligence&lifecycle=in-event`)
  for (const link of kioskLinks) {
    const context = link.surveyTarget
      ? `${link.surveyTarget.category}:${link.surveyTarget.name} target=${link.surveyTarget.id}${link.speakerAssignmentId ? ` speakerAssignment=${link.speakerAssignmentId}` : ''}`
      : 'unassigned'
    console.log(`  Kiosk - ${link.survey.name} [${context}]: ${baseUrl}/kiosk?token=${link.token}`)
  }
}

async function seedAggregates(input: { accountId: string; locationId: string; eventId: string }) {
  const [intelligenceRows, themeRows, entityRows] = await prisma.$transaction([
    prisma.answerEventIntelligence.findMany({
      where: {
        eventId: input.eventId,
        accountId: input.accountId,
      },
      select: {
        responseId: true,
        surveyId: true,
        surveyTargetId: true,
        urgency: true,
        sentimentScore: true,
      },
    }),
    prisma.answerEventTheme.findMany({
      where: { eventId: input.eventId },
      select: { surveyTargetId: true, label: true },
    }),
    prisma.answerEventEntity.findMany({
      where: { eventId: input.eventId },
      select: { surveyTargetId: true, label: true },
    }),
  ])

  const responseIds = new Set(intelligenceRows.map((row) => row.responseId))
  const highUrgencyCount = intelligenceRows.filter((row) => row.urgency === 'HIGH').length
  const avgSentiment =
    intelligenceRows.length > 0
      ? intelligenceRows.reduce((sum, row) => sum + (row.sentimentScore ?? 0), 0) / intelligenceRows.length
      : 0
  const themeCounts = countLabels(themeRows.map((theme) => theme.label))
  const entityCounts = countLabels(entityRows.map((entity) => entity.label))
  const actionCounts = countLabels(
    responseDefinitions.flatMap((response) =>
      response.answers.flatMap((answer) => answer.actions.map((action) => action.title)),
    ),
  )

  await prisma.eventIntelligenceAggregate.upsert({
    where: { id: scopedSeedValue('aggregate_events_demo_event') },
    update: {
      accountId: input.accountId,
      locationId: input.locationId,
      eventId: input.eventId,
      surveyId: null,
      surveyTargetId: null,
      questionId: null,
      bucketType: 'EVENT',
      bucketKey: input.eventId,
      windowStart: eventStart,
      windowEnd: eventEnd,
      responseCount: responseIds.size,
      answerCount: intelligenceRows.length,
      avgSentiment,
      highUrgencyCount,
      topThemesJson: themeCounts,
      topEntitiesJson: entityCounts,
      topActionsJson: actionCounts,
    },
    create: {
      id: scopedSeedValue('aggregate_events_demo_event'),
      accountId: input.accountId,
      locationId: input.locationId,
      eventId: input.eventId,
      surveyId: null,
      surveyTargetId: null,
      questionId: null,
      bucketType: 'EVENT',
      bucketKey: input.eventId,
      windowStart: eventStart,
      windowEnd: eventEnd,
      responseCount: responseIds.size,
      answerCount: intelligenceRows.length,
      avgSentiment,
      highUrgencyCount,
      topThemesJson: themeCounts,
      topEntitiesJson: entityCounts,
      topActionsJson: actionCounts,
    },
  })

  const rowsByTarget = new Map<string, typeof intelligenceRows>()
  const themesByTarget = new Map<string, string[]>()
  const entitiesByTarget = new Map<string, string[]>()
  for (const theme of themeRows) {
    if (!theme.surveyTargetId) continue
    themesByTarget.set(theme.surveyTargetId, [...(themesByTarget.get(theme.surveyTargetId) ?? []), theme.label])
  }
  for (const entity of entityRows) {
    if (!entity.surveyTargetId) continue
    entitiesByTarget.set(entity.surveyTargetId, [...(entitiesByTarget.get(entity.surveyTargetId) ?? []), entity.label])
  }
  for (const row of intelligenceRows) {
    if (!row.surveyTargetId) continue
    rowsByTarget.set(row.surveyTargetId, [...(rowsByTarget.get(row.surveyTargetId) ?? []), row])
  }

  for (const [surveyTargetId, rows] of rowsByTarget) {
    const targetResponseIds = new Set(rows.map((row) => row.responseId))
    await prisma.eventIntelligenceAggregate.upsert({
      where: { id: scopedSeedValue(`aggregate_events_demo_target_${surveyTargetId}`) },
      update: {
        accountId: input.accountId,
        locationId: input.locationId,
        eventId: input.eventId,
        surveyId: rows[0].surveyId,
        surveyTargetId,
        questionId: null,
        bucketType: 'SURVEY_TARGET',
        bucketKey: surveyTargetId,
        windowStart: eventStart,
        windowEnd: eventEnd,
        responseCount: targetResponseIds.size,
        answerCount: rows.length,
        avgSentiment: rows.reduce((sum, row) => sum + (row.sentimentScore ?? 0), 0) / rows.length,
        highUrgencyCount: rows.filter((row) => row.urgency === 'HIGH').length,
        topThemesJson: countLabels(themesByTarget.get(surveyTargetId) ?? []),
        topEntitiesJson: countLabels(entitiesByTarget.get(surveyTargetId) ?? []),
        topActionsJson: [],
      },
      create: {
        id: scopedSeedValue(`aggregate_events_demo_target_${surveyTargetId}`),
        accountId: input.accountId,
        locationId: input.locationId,
        eventId: input.eventId,
        surveyId: rows[0].surveyId,
        surveyTargetId,
        questionId: null,
        bucketType: 'SURVEY_TARGET',
        bucketKey: surveyTargetId,
        windowStart: eventStart,
        windowEnd: eventEnd,
        responseCount: targetResponseIds.size,
        answerCount: rows.length,
        avgSentiment: rows.reduce((sum, row) => sum + (row.sentimentScore ?? 0), 0) / rows.length,
        highUrgencyCount: rows.filter((row) => row.urgency === 'HIGH').length,
        topThemesJson: countLabels(themesByTarget.get(surveyTargetId) ?? []),
        topEntitiesJson: countLabels(entitiesByTarget.get(surveyTargetId) ?? []),
        topActionsJson: [],
      },
    })
  }
}

function countLabels(labels: string[]) {
  const counts = new Map<string, number>()
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }))
}

main()
  .catch((error) => {
    console.error('[seed-voice-events-demo] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
