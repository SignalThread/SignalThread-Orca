import { EventAgendaImportStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEventListeningPlanMock } = vi.hoisted(() => ({
  getEventListeningPlanMock: vi.fn(),
}))

vi.mock('@/lib/event-listening-plan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-listening-plan')>('@/lib/event-listening-plan')
  return { ...actual, getEventListeningPlan: getEventListeningPlanMock }
})

import { agendaImportReadinessState, getEventPreEventReadiness } from './event-pre-event-readiness'

function createDb() {
  return {
    event: { findFirst: vi.fn() },
    eventStructureItem: { findMany: vi.fn() },
    survey: { findMany: vi.fn() },
    surveyTarget: { findMany: vi.fn() },
    eventAgendaImportJob: { findFirst: vi.fn() },
  }
}

describe('pre-event Signals readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps durable import states without inventing a second import lifecycle', () => {
    expect(agendaImportReadinessState(EventAgendaImportStatus.MAPPING)).toBe('IN_PROGRESS')
    expect(agendaImportReadinessState(EventAgendaImportStatus.CONFIRMING)).toBe('IN_PROGRESS')
    expect(agendaImportReadinessState(EventAgendaImportStatus.NEEDS_REVIEW)).toBe('NEEDS_REVIEW')
    expect(agendaImportReadinessState(EventAgendaImportStatus.FAILED)).toBe('NEEDS_REVIEW')
    expect(agendaImportReadinessState(EventAgendaImportStatus.COMPLETED)).toBeNull()
  })

  it('derives readiness from canonical agenda, listening, survey, deployment, and speaker records', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue({
      id: 'event-1', name: 'Future Event', status: 'ACTIVE', isActive: true,
      startDate: new Date('2026-09-17T12:00:00Z'), endDate: new Date('2026-09-18T22:00:00Z'),
      location: { timezone: 'America/New_York' }, _count: { responses: 0 },
    })
    db.eventStructureItem.findMany.mockResolvedValue([
      { id: 'session-ready', name: 'Opening keynote', kind: 'SESSION', _count: { speakerAssignments: 1 } },
      { id: 'session-missing', name: 'Sponsor roundtable', kind: 'SESSION', _count: { speakerAssignments: 1 } },
      { id: 'area-1', name: 'Expo floor', kind: 'AREA', _count: { speakerAssignments: 0 } },
    ])
    db.survey.findMany.mockResolvedValue([
      {
        id: 'survey-ready', name: 'Session pulse', status: 'ACTIVE',
        availabilityMode: 'OPEN_IMMEDIATELY', availabilityTimezone: null,
        availabilityOpensAt: null, availabilityClosesAt: null,
        availabilityOpenAnchor: null, availabilityCloseAnchor: null,
        availabilityOpenOffsetMinutes: null, availabilityCloseOffsetMinutes: null,
        availabilityOverride: null,
        surveyTarget: { isActive: true, metadata: null, eventStructureItem: null },
        publicSurveyLinks: [{ id: 'link-1', token: 'real-token', isActive: true }],
        _count: { questions: 1 },
      },
      {
        id: 'survey-result-only', name: 'Persisted session results', status: 'DRAFT',
        availabilityMode: 'OPEN_IMMEDIATELY', availabilityTimezone: null,
        availabilityOpensAt: null, availabilityClosesAt: null,
        availabilityOpenAnchor: null, availabilityCloseAnchor: null,
        availabilityOpenOffsetMinutes: null, availabilityCloseOffsetMinutes: null,
        availabilityOverride: null,
        surveyTarget: { isActive: true, metadata: { listeningPoint: false, resultScope: 'SESSION' }, eventStructureItem: null },
        publicSurveyLinks: [],
        _count: { questions: 2 },
      },
    ])
    db.surveyTarget.findMany
      .mockResolvedValueOnce([
        {
          id: 'target-speaker', isActive: true, eventStructureItem: null, metadata: null,
          speakerAssignment: {
            id: 'assignment-speaker',
            speaker: { id: 'speaker-1', name: 'Jordan Lee' },
            session: { id: 'session-ready', name: 'Opening keynote' },
          },
          publicSurveyLinks: [],
        },
        {
          id: 'target-speaker-result-only', isActive: true, eventStructureItem: null,
          metadata: { listeningPoint: false, resultScope: 'SPEAKER_ASSIGNMENT' },
          speakerAssignment: {
            id: 'assignment-speaker-result',
            speaker: { id: 'speaker-2', name: 'Morgan Chen' },
            session: { id: 'session-missing', name: 'Sponsor roundtable' },
          },
          publicSurveyLinks: [],
        },
      ])
      .mockResolvedValueOnce(Array.from({ length: 14 }, (_, index) => ({ metadata: { listeningPoint: true, index } })))
    db.eventAgendaImportJob.findFirst.mockResolvedValue(null)
    getEventListeningPlanMock.mockResolvedValue({
      summary: {
        agendaSessionCount: 2, selectedSessionCount: 2, representedSessionCount: 0,
        selectedCoverageLabel: '2 of 2 sessions selected for listening', evidenceCoverageLabel: '0 of 2 selected sessions represented',
      },
      sessions: [
        { sessionId: 'session-ready', state: 'READY_TO_COLLECT', survey: { id: 'survey-ready', name: 'Session pulse' }, readiness: { issues: [] } },
        { sessionId: 'session-missing', state: 'NEEDS_SURVEY', survey: null, readiness: null },
      ],
      surveys: [],
    })

    const result = await getEventPreEventReadiness({
      accountId: 'account-1', accountSlug: 'events-co', eventId: 'event-1', now: new Date('2026-07-30T12:00:00Z'),
    }, db as never)

    expect(result.lifecyclePhase).toBe('PRE_EVENT')
    expect(result.noEvidence).toBe(true)
    expect(result.agenda).toMatchObject({ sessionCount: 2, eventAreaCount: 3, status: 'READY' })
    expect(result.listeningPlan).toMatchObject({ totalListeningPointCount: 14, agendaSessionCount: 2, selectedSessionCount: 2, readySessionCount: 1, missingSetupCount: 1 })
    expect(result.surveys).toMatchObject({ totalCount: 1, readyCount: 1, notReadyCount: 0 })
    expect(result.deployment).toMatchObject({ publicLinkCount: 1, qrReadyCount: 1, signageReadyCount: 1 })
    expect(result.speakers).toMatchObject({ assignmentCount: 2, selectedForListeningCount: 1, readyCount: 0, needsSetupCount: 1 })
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]).toMatchObject({ id: 'session-session-missing', title: 'Sponsor roundtable needs a survey', actionLabel: 'Open session' })
    expect(result.issues[0].href).toBe('/app/events/event-1?account=events-co&tab=operations&operationsView=sessions&sessionId=session-missing')
    expect(result.issues[1]).toMatchObject({ id: 'speaker-target-speaker', title: 'Jordan Lee feedback is not ready' })
    expect(result.issues[1].href).toBe('/app/events/event-1?account=events-co&tab=operations&operationsView=speakers&speakerId=speaker-1')
    expect(result.issues.some((issue) => issue.id.includes('session-ready'))).toBe(false)
  })

  it('re-checks account ownership and Events product scope before loading readiness', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue(null)

    await expect(getEventPreEventReadiness({ accountId: 'account-1', accountSlug: 'events-co', eventId: 'event-other' }, db as never))
      .rejects.toThrow('Event not found or access denied')

    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'event-other',
        location: { accountId: 'account-1', account: { accountType: 'EVENTS' } },
      },
    }))
    expect(db.eventStructureItem.findMany).not.toHaveBeenCalled()
    expect(db.surveyTarget.findMany).not.toHaveBeenCalled()
  })
})
