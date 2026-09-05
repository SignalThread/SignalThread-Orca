import {
  AccountType,
  EventAgendaImportStatus,
  EventStatus,
  EventStructureItemKind,
  ResponseStatus,
  type PrismaClient,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getEventLifecyclePhase, type EventLifecyclePhase } from '@/lib/events-home-groups'
import { buildEventSetupTabPath, deriveEventSetupReadiness } from '@/lib/events-setup-readiness'
import { getEventListeningPlan, type EventListeningState } from '@/lib/event-listening-plan'
import { resolveSurveyLaunchReadiness } from '@/lib/survey-availability'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'

type ReadinessDb = typeof prisma | PrismaClient

export type EventPreEventReadinessIssueKind = 'EVENT' | 'AGENDA' | 'LISTENING' | 'SURVEY' | 'DEPLOYMENT' | 'SPEAKER'

export interface EventPreEventReadinessIssue {
  id: string
  kind: EventPreEventReadinessIssueKind
  title: string
  detail: string
  actionLabel: string
  href: string
}

export interface EventPreEventReadiness {
  lifecyclePhase: EventLifecyclePhase
  responseCount: number
  noEvidence: boolean
  eventDates: {
    start: Date | null
    end: Date | null
  }
  setup: {
    readyCount: number
    totalCount: number
    collectionReady: boolean
  }
  agenda: {
    sessionCount: number
    eventAreaCount: number
    status: 'NOT_STARTED' | 'IMPORT_IN_PROGRESS' | 'NEEDS_REVIEW' | 'READY'
    label: string
    href: string
  }
  listeningPlan: {
    totalListeningPointCount: number
    agendaSessionCount: number
    selectedSessionCount: number
    readySessionCount: number
    missingSetupCount: number
    selectedCoverageLabel: string
  }
  surveys: {
    totalCount: number
    readyCount: number
    notReadyCount: number
    scheduledCount: number
    href: string
  }
  deployment: {
    publicLinkCount: number
    qrReadyCount: number
    signageReadyCount: number
    href: string
  }
  speakers: {
    assignmentCount: number
    selectedForListeningCount: number
    readyCount: number
    needsSetupCount: number
    href: string
  }
  preEventSurveys: Array<{
    id: string
    name: string
    audience: string
    status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED'
    statusLabel: string
    scheduledAt: Date | null
    closesAt: Date | null
    responseCount: number
    latestResponseAt: Date | null
    href: string
    kioskPath: string | null
  }>
  issues: EventPreEventReadinessIssue[]
}

const READY_LISTENING_STATES = new Set<EventListeningState>([
  'READY_TO_COLLECT',
  'COLLECTING',
  'LOW_RESPONSE',
  'REPRESENTED',
])

export function agendaImportReadinessState(status: EventAgendaImportStatus | null) {
  if (status === EventAgendaImportStatus.NEEDS_REVIEW || status === EventAgendaImportStatus.FAILED) return 'NEEDS_REVIEW' as const
  if (
    status === EventAgendaImportStatus.UPLOADED
    || status === EventAgendaImportStatus.MAPPING
    || status === EventAgendaImportStatus.READY
    || status === EventAgendaImportStatus.CONFIRMING
  ) return 'IN_PROGRESS' as const
  return null
}

function setupPath(eventId: string, accountSlug: string, tab: 'overview' | 'operations' | 'surveys' | 'deploy') {
  return buildEventSetupTabPath(eventId, accountSlug, tab)
}

function agendaRecordPath(eventId: string, accountSlug: string, sessionId?: string, importJobId?: string | null) {
  const params = new URLSearchParams({ account: accountSlug, tab: 'operations' })
  if (sessionId) {
    params.set('operationsView', 'sessions')
    params.set('sessionId', sessionId)
  }
  if (importJobId) params.set('agendaImport', importJobId)
  return `/app/events/${encodeURIComponent(eventId)}?${params.toString()}`
}

function surveyRecordPath(eventId: string, accountSlug: string, surveyId: string) {
  const params = new URLSearchParams({ account: accountSlug, survey: surveyId })
  return `/app/events/${encodeURIComponent(eventId)}/edit?${params.toString()}`
}

function speakerRecordPath(eventId: string, accountSlug: string, speakerId?: string) {
  const params = new URLSearchParams({ account: accountSlug, tab: 'operations', operationsView: 'speakers' })
  if (speakerId) params.set('speakerId', speakerId)
  return `/app/events/${encodeURIComponent(eventId)}?${params.toString()}`
}

export async function getEventPreEventReadiness(
  input: { accountId: string; accountSlug: string; eventId: string; now?: Date },
  db: ReadinessDb = prisma,
): Promise<EventPreEventReadiness> {
  const now = input.now ?? new Date()
  const event = await db.event.findFirst({
    where: {
      id: input.eventId,
      location: {
        accountId: input.accountId,
        account: { accountType: AccountType.EVENTS },
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      isActive: true,
      startDate: true,
      endDate: true,
      location: { select: { timezone: true } },
      _count: { select: { responses: { where: { status: ResponseStatus.COMPLETED } } } },
    },
  })
  if (!event) throw new Error('Event not found or access denied')

  const [structureItems, surveyRecords, speakerTargetRecords, activeSurveyTargets, importJob, listeningPlan] = await Promise.all([
    db.eventStructureItem.findMany({
      where: { eventId: event.id, isActive: true },
      select: { id: true, name: true, kind: true, _count: { select: { speakerAssignments: true } } },
    }),
    db.survey.findMany({
      where: { eventId: event.id, status: { not: EventStatus.ARCHIVED } },
      include: {
        surveyTarget: {
          select: {
            category: true,
            name: true,
            isActive: true,
            metadata: true,
            eventStructureItem: { select: { startsAt: true, endsAt: true, timezone: true } },
          },
        },
        publicSurveyLinks: {
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, token: true, isActive: true },
        },
        responses: {
          where: { status: ResponseStatus.COMPLETED },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
        _count: { select: { questions: true, responses: { where: { status: ResponseStatus.COMPLETED } } } },
      },
      orderBy: { name: 'asc' },
    }),
    db.surveyTarget.findMany({
      where: { eventId: event.id, isActive: true, speakerAssignmentId: { not: null } },
      include: {
        eventStructureItem: { select: { startsAt: true, endsAt: true, timezone: true } },
        speakerAssignment: {
          select: {
            id: true,
            speaker: { select: { id: true, name: true } },
            session: { select: { id: true, name: true } },
          },
        },
        publicSurveyLinks: {
          orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
          include: { survey: { include: { _count: { select: { questions: true } } } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.surveyTarget.findMany({
      where: { eventId: event.id, isActive: true },
      select: { metadata: true },
    }),
    db.eventAgendaImportJob.findFirst({
      where: {
        eventId: event.id,
        accountId: input.accountId,
        status: { notIn: [EventAgendaImportStatus.COMPLETED, EventAgendaImportStatus.CANCELLED] },
      },
      select: { id: true, status: true },
      orderBy: { updatedAt: 'desc' },
    }),
    getEventListeningPlan({ accountId: input.accountId, eventId: event.id, now }, db as PrismaClient),
  ])

  const assignedSurveyRecords = surveyRecords
    .filter((survey) => Boolean(survey.surveyTarget))
    .map((survey) => ({ ...survey, surveyTarget: survey.surveyTarget! }))
  const surveys = assignedSurveyRecords.filter((survey) => isPlannerManagedSurveyTarget(survey.surveyTarget))
  const speakerTargets = speakerTargetRecords.filter(isPlannerManagedSurveyTarget)
  const totalListeningPointCount = activeSurveyTargets.filter(isPlannerManagedSurveyTarget).length

  const eventAreaCount = structureItems.length
  const agendaSessionCount = structureItems.filter((item) => item.kind === EventStructureItemKind.SESSION).length
  const surveyRows = surveys.map((survey) => {
    const publicLink = survey.publicSurveyLinks[0] ?? null
    const readiness = resolveSurveyLaunchReadiness({
      survey,
      publicLink,
      targetActive: survey.surveyTarget.isActive,
      questionCount: survey._count.questions,
      eventStructureItem: survey.surveyTarget.eventStructureItem,
      locationTimezone: event.location.timezone,
      now,
    })
    return { survey, publicLink, readiness }
  })
  const readySurveys = surveyRows.filter((row) => row.readiness.responseEligible)
  const scheduledSurveyCount = surveyRows.filter((row) => row.readiness.availability.state === 'NOT_YET_OPEN').length
  const activePublicLinkCount = surveyRows.filter((row) => row.publicLink?.isActive && row.publicLink.token).length
  const selectedSessions = listeningPlan.sessions.filter((session) => session.state !== 'NOT_SELECTED')
  const readySessions = selectedSessions.filter((session) => READY_LISTENING_STATES.has(session.state))
  const missingSessions = selectedSessions.filter((session) => !READY_LISTENING_STATES.has(session.state))
  const speakerRows = speakerTargets.map((target) => {
    const link = target.publicSurveyLinks[0] ?? null
    if (!link) return { target, ready: false, issues: ['Public survey link is missing'] }
    const readiness = resolveSurveyLaunchReadiness({
      survey: link.survey,
      publicLink: link,
      targetActive: target.isActive,
      questionCount: link.survey._count.questions,
      eventStructureItem: target.eventStructureItem,
      locationTimezone: event.location.timezone,
      now,
    })
    return { target, ready: readiness.responseEligible, issues: readiness.issues }
  })
  const readySpeakerTargets = speakerRows.filter((row) => row.ready)
  const structureNameById = new Map(structureItems.map((item) => [item.id, item.name]))
  const agendaImportState = agendaImportReadinessState(importJob?.status ?? null)
  const hasEventDetails = Boolean(event.name.trim() && event.startDate && event.endDate)
  // Pre-event feedback is deliberately limited to event-wide surveys. Session
  // and speaker targets are collected in their own scheduled context and must
  // never leak into the pre-event summary.
  const preEventSurveys = assignedSurveyRecords
    .filter((survey) => survey.surveyTarget.category === 'EVENT')
    .filter((survey) => !event.startDate || !survey.availabilityOpensAt || survey.availabilityOpensAt < event.startDate)
    .map((survey) => {
      const link = survey.publicSurveyLinks[0] ?? null
      const readiness = resolveSurveyLaunchReadiness({
        survey,
        publicLink: link,
        targetActive: survey.surveyTarget.isActive,
        questionCount: survey._count.questions,
        eventStructureItem: survey.surveyTarget.eventStructureItem,
        locationTimezone: event.location.timezone,
        now,
      })
      const status = survey.status === EventStatus.ACTIVE && link?.isActive && readiness.availability.state === 'OPEN'
        ? 'ACTIVE' as const
        : readiness.availability.state === 'NOT_YET_OPEN'
          ? 'SCHEDULED' as const
          : survey.status === EventStatus.COMPLETED
            ? 'COMPLETED' as const
            : 'DRAFT' as const
      return {
        id: survey.id,
        name: survey.name,
        audience: survey.surveyTarget.name,
        status,
        statusLabel: status === 'ACTIVE' ? 'Active' : status === 'SCHEDULED' ? 'Scheduled' : status === 'COMPLETED' ? 'Completed' : 'Draft',
        scheduledAt: survey.availabilityOpensAt,
        closesAt: survey.availabilityClosesAt,
        responseCount: survey._count.responses,
        latestResponseAt: survey.responses[0]?.completedAt ?? null,
        href: surveyRecordPath(event.id, input.accountSlug, survey.id),
        kioskPath: link?.token ? `/kiosk?token=${encodeURIComponent(link.token)}` : null,
      }
    })
  const setupReadiness = deriveEventSetupReadiness({
    hasEventDetails,
    eventAreaCount,
    agendaSessionCount,
    agendaImportState,
    surveyCount: surveys.length,
    launchableSurveyCount: readySurveys.length,
    uncoveredEventAreaCount: missingSessions.length,
  })
  const agenda = setupReadiness.agenda
  const issues: EventPreEventReadinessIssue[] = []

  if (!hasEventDetails) {
    issues.push({
      id: 'event-details',
      kind: 'EVENT',
      title: 'Complete the event schedule',
      detail: 'Add both start and end times so lifecycle and collection readiness are reliable.',
      actionLabel: 'Review event details',
      href: setupPath(event.id, input.accountSlug, 'overview'),
    })
  }
  if (agenda.status !== 'READY') {
    issues.push({
      id: 'agenda',
      kind: 'AGENDA',
      title: agenda.label === 'Not started' ? 'Add the event agenda' : agenda.label,
      detail: agenda.detail,
      actionLabel: agenda.actionLabel,
      href: agendaRecordPath(event.id, input.accountSlug, undefined, importJob?.id),
    })
  }
  if (agendaSessionCount > 0 && selectedSessions.length === 0) {
    issues.push({
      id: 'listening-plan-empty',
      kind: 'LISTENING',
      title: 'Choose sessions to collect feedback for',
      detail: 'Select the sessions where attendees should be able to leave feedback.',
      actionLabel: 'Choose sessions',
      href: setupPath(event.id, input.accountSlug, 'operations'),
    })
  }
  for (const session of missingSessions) {
    const agendaSession = listeningPlan.sessions.find((candidate) => candidate.sessionId === session.sessionId)
    const sessionName = structureNameById.get(session.sessionId) ?? 'Selected session'
    issues.push({
      id: `session-${session.sessionId}`,
      kind: 'LISTENING',
      title: agendaSession?.survey?.name ? `${sessionName} needs survey setup` : `${sessionName} needs a survey`,
      detail: session.readiness?.issues.join(' · ') || 'This selected session is not ready to collect feedback.',
      actionLabel: 'Open session',
      href: agendaRecordPath(event.id, input.accountSlug, session.sessionId),
    })
  }
  if (surveys.length === 0) {
    issues.push({
      id: 'surveys-empty',
      kind: 'SURVEY',
      title: 'Create an attendee survey',
      detail: 'At least one survey is needed before Voice can collect feedback.',
      actionLabel: 'Open Surveys',
      href: setupPath(event.id, input.accountSlug, 'surveys'),
    })
  }
  for (const row of surveyRows.filter((candidate) => !candidate.readiness.responseEligible)) {
    issues.push({
      id: `survey-${row.survey.id}`,
      kind: row.publicLink ? 'SURVEY' : 'DEPLOYMENT',
      title: `${row.survey.name} is not ready to collect`,
      detail: row.readiness.issues.join(' · ') || row.readiness.availability.message,
      actionLabel: 'Open survey',
      href: surveyRecordPath(event.id, input.accountSlug, row.survey.id),
    })
  }
  for (const row of speakerRows.filter((candidate) => !candidate.ready)) {
    issues.push({
      id: `speaker-${row.target.id}`,
      kind: 'SPEAKER',
      title: `${row.target.speakerAssignment?.speaker.name ?? 'Speaker'} feedback is not ready`,
      detail: `${row.target.speakerAssignment?.session?.name ?? 'Assigned session'} · ${row.issues.join(' · ')}`,
      actionLabel: 'Open speaker setup',
      href: speakerRecordPath(event.id, input.accountSlug, row.target.speakerAssignment?.speaker.id),
    })
  }

  return {
    lifecyclePhase: getEventLifecyclePhase({ ...event, timezone: event.location.timezone }, now),
    responseCount: event._count.responses,
    noEvidence: event._count.responses === 0,
    eventDates: { start: event.startDate, end: event.endDate },
    setup: { readyCount: setupReadiness.readyCount, totalCount: setupReadiness.totalCount, collectionReady: setupReadiness.collectionReady },
    agenda: { sessionCount: agendaSessionCount, eventAreaCount, status: agenda.status, label: agenda.label, href: agendaRecordPath(event.id, input.accountSlug, undefined, importJob?.id) },
    listeningPlan: {
      totalListeningPointCount,
      agendaSessionCount: listeningPlan.summary.agendaSessionCount,
      selectedSessionCount: listeningPlan.summary.selectedSessionCount,
      readySessionCount: readySessions.length,
      missingSetupCount: missingSessions.length,
      selectedCoverageLabel: listeningPlan.summary.selectedCoverageLabel,
    },
    surveys: {
      totalCount: surveys.length,
      readyCount: readySurveys.length,
      notReadyCount: surveys.length - readySurveys.length,
      scheduledCount: scheduledSurveyCount,
      href: setupPath(event.id, input.accountSlug, 'surveys'),
    },
    deployment: {
      publicLinkCount: activePublicLinkCount,
      qrReadyCount: readySurveys.length,
      signageReadyCount: readySurveys.length,
      href: setupPath(event.id, input.accountSlug, 'deploy'),
    },
    speakers: {
      assignmentCount: structureItems.reduce((total, item) => total + item._count.speakerAssignments, 0),
      selectedForListeningCount: speakerTargets.length,
      readyCount: readySpeakerTargets.length,
      needsSetupCount: speakerTargets.length - readySpeakerTargets.length,
      href: speakerRecordPath(event.id, input.accountSlug),
    },
    preEventSurveys,
    issues,
  }
}
