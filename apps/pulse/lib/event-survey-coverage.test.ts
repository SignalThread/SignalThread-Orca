import { EventStatus, EventStructureItemKind, EventType, SurveyTargetCategory } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { bulkAssignMock, reconcileAdvancedMock, saveAdvancedDraftMock, createStructureMock, updateStructureMock, deleteStructureMock } = vi.hoisted(() => ({
  bulkAssignMock: vi.fn(),
  reconcileAdvancedMock: vi.fn(),
  saveAdvancedDraftMock: vi.fn(),
  createStructureMock: vi.fn(),
  updateStructureMock: vi.fn(),
  deleteStructureMock: vi.fn(),
}))

vi.mock('@/lib/event-listening-plan', () => ({ bulkAssignExistingSurvey: bulkAssignMock }))
vi.mock('@/lib/advanced-event-survey-builder', () => ({ reconcileAdvancedSurveyAssignments: reconcileAdvancedMock, saveAdvancedEventSurveyDraft: saveAdvancedDraftMock }))
vi.mock('@/lib/event-structure', () => ({
  EventStructureError: class EventStructureError extends Error { constructor(message: string, public status: number) { super(message) } },
  createEventStructureItem: createStructureMock,
  updateEventStructureItem: updateStructureMock,
  deleteEventStructureItem: deleteStructureMock,
}))

import {
  bulkAttachSurveyToSessions,
  advancedAssignmentForSurveyDeployment,
  ensureEventSurveyCoverageTarget,
  getEventSurveyCoverage,
  removeEventAreaForSurveyCoverage,
  duplicateAdvancedSurvey,
  setAdvancedSurveyCollectionState,
  setEventSurveyDeployment,
} from './event-survey-coverage'

const scopedEvent = { id: 'event_1', status: EventStatus.DRAFT, location: { accountId: 'account_1' } }

describe('event survey coverage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('derives Overall Event, session, and Event Area status from canonical target-scoped public links', async () => {
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue(scopedEvent),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: 'ADVANCED' }),
      },
      eventStructureItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'session_1', kind: EventStructureItemKind.SESSION, name: 'Opening', description: null, startsAt: new Date('2026-09-01T14:00:00Z'), endsAt: null, timezone: 'UTC', metadata: { room: 'Grand Hall' }, sortOrder: 0 },
          { id: 'session_2', kind: EventStructureItemKind.SESSION, name: 'Breakout', description: null, startsAt: null, endsAt: null, timezone: 'UTC', metadata: { room: 'Room B' }, sortOrder: 1 },
          { id: 'area_1', kind: EventStructureItemKind.AREA, name: 'Registration', description: null, startsAt: null, endsAt: null, timezone: null, metadata: null, sortOrder: 0 },
        ]),
      },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'target_session', name: 'Opening', category: SurveyTargetCategory.SESSION, eventStructureItemId: 'session_1', speakerAssignmentId: null, speakerId: null, metadata: null, createdAt: new Date(), publicSurveyLinks: [{ id: 'link_session', token: 'session-token', isActive: true, survey: { id: 'survey_1', name: 'Session feedback', status: EventStatus.ACTIVE, responseMode: 'VOICE_ONLY', _count: { questions: 2, responses: 1 } } }] },
          { id: 'target_area', name: 'Registration', category: SurveyTargetCategory.LOCATION, eventStructureItemId: 'area_1', speakerAssignmentId: null, speakerId: null, metadata: null, createdAt: new Date(), publicSurveyLinks: [] },
          { id: 'target_speaker', name: 'Jordan Lee', category: SurveyTargetCategory.SPEAKER, eventStructureItemId: null, speakerAssignmentId: null, speakerId: 'speaker_1', metadata: null, createdAt: new Date(), publicSurveyLinks: [{ id: 'link_speaker', token: 'speaker-token', isActive: true, survey: { id: 'survey_1', name: 'Session feedback', status: EventStatus.ACTIVE, responseMode: 'VOICE_ONLY', _count: { questions: 2, responses: 1 } } }] },
          { id: 'target_custom', name: 'VIP lounge follow-up', category: SurveyTargetCategory.CUSTOM, eventStructureItemId: null, speakerAssignmentId: null, speakerId: null, metadata: { advancedAssignment: { kind: 'CUSTOM', selection: 'SELECTED', customKey: 'vip-lounge' } }, createdAt: new Date(), publicSurveyLinks: [{ id: 'link_custom', token: 'custom-token', isActive: true, survey: { id: 'survey_1', name: 'Session feedback', status: EventStatus.ACTIVE, responseMode: 'VOICE_ONLY', _count: { questions: 2, responses: 1 } } }] },
          { id: 'target_superseded', name: 'Old event assignment', category: SurveyTargetCategory.EVENT, eventStructureItemId: null, speakerAssignmentId: null, speakerId: null, metadata: null, createdAt: new Date(), publicSurveyLinks: [{ id: 'link_superseded', token: 'old-token', isActive: false, metadata: { assignmentState: 'SUPERSEDED' }, survey: { id: 'survey_1', name: 'Session feedback', status: EventStatus.ACTIVE, responseMode: 'VOICE_ONLY', _count: { questions: 2, responses: 1 } } }] },
        ]),
      },
      survey: { findMany: vi.fn().mockResolvedValue([{ id: 'survey_1', name: 'Session feedback', status: EventStatus.ACTIVE, responseMode: 'VOICE_ONLY', _count: { questions: 2, responses: 1 } }]) },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([{ id: 'speaker_1', name: 'Jordan Lee', title: 'CEO', organization: 'Northstar' }]) },
    }

    const result = await getEventSurveyCoverage({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(result.summary).toMatchObject({ sessionCount: 2, sessionsWithSurveys: 1, eventAreaCount: 1, eventAreasWithSurveys: 0 })
    expect(result.sessions[0]).toMatchObject({ name: 'Opening', room: 'Grand Hall', attachment: { publicLink: { kioskPath: '/kiosk?token=session-token' } } })
    expect(result.sessions[1].attachment).toBeNull()
    expect(result.eventAreas[0]).toMatchObject({ name: 'Registration', attachment: null })
    expect(result.speakers).toEqual([{ id: 'speaker_1', name: 'Jordan Lee', title: 'CEO', organization: 'Northstar', surveyIds: ['survey_1'] }])
    expect(result.surveyDeployments[0].deployment).toMatchObject({ overallEvent: false, sessionCount: 1, speakerCount: 1, customCount: 1, customName: 'VIP lounge follow-up', customKey: 'vip-lounge' })
    expect(result.surveyDeployments[0]).toMatchObject({
      isPaused: false,
      assignment: { kind: 'SESSION', label: 'Session · Opening' },
      publicLink: { id: 'link_session', kioskPath: '/kiosk?token=session-token', isActive: true },
    })
    // Agenda room metadata is display context only; it never becomes an area.
    expect(result.eventAreas.map((area) => area.name)).not.toContain('Grand Hall')
    expect(db.survey.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_1',
        OR: [
          { surveyTargetId: null },
          { surveyTarget: { category: { in: [SurveyTargetCategory.EVENT, SurveyTargetCategory.SESSION, SurveyTargetCategory.SPEAKER, SurveyTargetCategory.LOCATION, SurveyTargetCategory.CUSTOM] } } },
        ],
      }),
    }))
  })

  it('includes and counts unassigned drafts alongside assigned surveys', async () => {
    const assigned = { id: 'survey_assigned', name: 'Assigned survey', status: EventStatus.ACTIVE, responseMode: 'VOICE_ONLY', _count: { questions: 2, responses: 1 } }
    const unassigned = { id: 'survey_unassigned', name: 'Unassigned draft', status: EventStatus.DRAFT, responseMode: 'VOICE_AND_TEXT', _count: { questions: 1, responses: 0 } }
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue(scopedEvent),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: 'ADVANCED' }),
      },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([]) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'target_event', category: SurveyTargetCategory.EVENT, eventStructureItemId: null,
          speakerAssignmentId: null, speakerId: null, metadata: null, createdAt: new Date(),
          publicSurveyLinks: [{ id: 'link_assigned', token: 'assigned-token', isActive: true, metadata: null, survey: assigned }],
        }]),
      },
      survey: { findMany: vi.fn().mockResolvedValue([assigned, unassigned]) },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([]) },
    }

    const result = await getEventSurveyCoverage({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(result.surveyDeployments.map((survey) => survey.id)).toEqual(['survey_assigned', 'survey_unassigned'])
    expect(result.surveyDeployments[1]).toMatchObject({
      id: 'survey_unassigned',
      status: EventStatus.DRAFT,
      deployment: { overallEvent: false, sessionCount: 0, eventAreaCount: 0 },
    })
    expect(result.summary.surveyCount).toBe(result.surveyDeployments.length)
    expect(result.summary.surveyCount).toBe(2)
  })

  it('includes an Overall Event survey as a reusable session configuration', async () => {
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue(scopedEvent),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: 'TEMPLATE' }),
      },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([]) },
      survey: { findMany: vi.fn().mockResolvedValue([{ id: 'overall_survey', name: '2026 Event Feedback', status: EventStatus.DRAFT, responseMode: 'VOICE_ONLY', _count: { questions: 3, responses: 0 } }]) },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([]) },
    }

    const result = await getEventSurveyCoverage({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(result.surveyConfigurations).toEqual([expect.objectContaining({
      id: 'overall_survey',
      name: '2026 Event Feedback',
      targetType: 'SESSION',
      eventId: 'event_1',
    })])
  })

  it('reassigns a zero-response Advanced survey through the Surveys-list service path', async () => {
    reconcileAdvancedMock.mockResolvedValue({ id: 'survey_1' })
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ ...scopedEvent, eventType: EventType.ADVANCED }) },
      $transaction: vi.fn(),
    }

    await expect(setEventSurveyDeployment({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', kind: 'SESSION', structureItemIds: ['session_new'],
    }, db as never)).resolves.toEqual({ id: 'survey_1' })

    expect(reconcileAdvancedMock).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_new'] }],
    }, db)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('routes a response-bearing Surveys-list reassignment through the same canonical builder mutation', async () => {
    reconcileAdvancedMock.mockResolvedValue({ id: 'survey_1', publicSurveyLinks: [{ id: 'link_live', surveyTargetId: 'target_new', isActive: true }] })
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ ...scopedEvent, eventType: EventType.ADVANCED }) },
      $transaction: vi.fn(),
    }

    await expect(setEventSurveyDeployment({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', kind: 'SESSION', structureItemIds: ['session_new'],
    }, db as never)).resolves.toMatchObject({ id: 'survey_1' })

    expect(reconcileAdvancedMock).toHaveBeenCalledTimes(1)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(reconcileAdvancedMock).toHaveBeenCalledWith(expect.objectContaining({
      surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_new'] }],
    }), db)
  })

  it('pauses collection by persisting only the canonical availability override', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'survey_1', availabilityOverride: 'FORCE_CLOSED' })
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ ...scopedEvent, eventType: EventType.ADVANCED }) },
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_1' }), update },
    }
    await expect(setAdvancedSurveyCollectionState({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', paused: true }, db as never)).resolves.toMatchObject({ id: 'survey_1' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'survey_1' },
      data: { availabilityOverride: 'FORCE_CLOSED' },
    }))
  })

  it('duplicates into the canonical unassigned draft path without copying links or responses', async () => {
    saveAdvancedDraftMock.mockResolvedValue({ id: 'survey_copy', status: EventStatus.DRAFT })
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ ...scopedEvent, eventType: EventType.ADVANCED }) },
      survey: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'survey_1', name: 'Opening feedback', description: 'How was it?', responseMode: 'TEXT_ONLY', presentationMode: 'SCREEN', ttsVoice: null,
          availabilityMode: 'OPEN_IMMEDIATELY', availabilityTimezone: null, availabilityOpensAt: null, availabilityClosesAt: null, availabilityOpenAnchor: null, availabilityCloseAnchor: null, availabilityOpenOffsetMinutes: null, availabilityCloseOffsetMinutes: null, availabilityOverride: null,
          questions: [{ id: 'q_1', label: 'Would you return?', type: 'YES_NO', required: true, configurationJson: null }],
        }),
      },
    }
    await expect(duplicateAdvancedSurvey({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' }, db as never)).resolves.toMatchObject({ id: 'survey_copy' })
    expect(saveAdvancedDraftMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event_1', name: 'Opening feedback copy', questions: [expect.objectContaining({ text: 'Would you return?' })],
    }), db)
    expect(saveAdvancedDraftMock.mock.calls[0][0]).not.toHaveProperty('surveyId')
  })

  it('maps every Surveys-list assignment kind to the canonical Advanced assignment contract', () => {
    expect(advancedAssignmentForSurveyDeployment({ surveyId: 'survey_1', kind: 'OVERALL_EVENT' })).toEqual({ kind: 'EVENT', selection: 'SELECTED' })
    expect(advancedAssignmentForSurveyDeployment({ surveyId: 'survey_1', kind: 'SESSION', targetIds: ['session_1'] })).toEqual({ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_1'] })
    expect(advancedAssignmentForSurveyDeployment({ surveyId: 'survey_1', kind: 'SPEAKER', targetIds: ['speaker_1'] })).toEqual({ kind: 'SPEAKER', selection: 'SELECTED', targetIds: ['speaker_1'] })
    expect(advancedAssignmentForSurveyDeployment({ surveyId: 'survey_1', kind: 'EVENT_AREA', targetIds: ['area_1'] })).toEqual({ kind: 'LOCATION', selection: 'SELECTED', targetIds: ['area_1'] })
    expect(advancedAssignmentForSurveyDeployment({ surveyId: 'survey_1', kind: 'CUSTOM', customName: 'VIP lounge' })).toEqual({ kind: 'CUSTOM', selection: 'SELECTED', customKey: 'survey_1', customName: 'VIP lounge' })
  })

  it('reuses the same canonical Overall Event target on repeated ensure calls', async () => {
    const target = { id: 'target_overall', eventStructureItemId: 'overall_item', metadata: null }
    const tx = {
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue([target]),
        update: vi.fn().mockResolvedValue(target),
        upsert: vi.fn(),
      },
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'overall_item', name: 'Overall Event', description: null, locationId: null, metadata: null }),
        upsert: vi.fn(),
      },
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(scopedEvent) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await ensureEventSurveyCoverageTarget({ accountId: 'account_1', eventId: 'event_1', kind: 'OVERALL_EVENT' }, db as never)
    await ensureEventSurveyCoverageTarget({ accountId: 'account_1', eventId: 'event_1', kind: 'OVERALL_EVENT' }, db as never)

    expect(tx.surveyTarget.update).toHaveBeenCalledTimes(2)
    expect(tx.surveyTarget.upsert).not.toHaveBeenCalled()
  })

  it('blocks Event Area removal when a survey, public link, or response must be preserved', async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(scopedEvent) },
      eventStructureItem: { findFirst: vi.fn().mockResolvedValue({ id: 'area_1', surveyTargets: [{ id: 'target_1', _count: { surveys: 1, publicSurveyLinks: 1, responses: 0 } }] }) },
      surveyTarget: { updateMany: vi.fn() },
    }

    await expect(removeEventAreaForSurveyCoverage({ accountId: 'account_1', accountSlug: 'acme', eventId: 'event_1', eventAreaId: 'area_1' }, db as never))
      .rejects.toMatchObject({ status: 409, code: 'EVENT_AREA_HAS_SURVEY_HISTORY' })
    expect(deleteStructureMock).not.toHaveBeenCalled()
  })

  it('delegates a 500-session attachment to one canonical bulk operation without replacement', async () => {
    const sessionIds = Array.from({ length: 500 }, (_, index) => `session_${index}`)
    bulkAssignMock.mockResolvedValue({ counts: { requested: 500, attached: 500, alreadyAttached: 0, skipped: 0, replaced: 0, failed: 0 } })

    await bulkAttachSurveyToSessions({ accountId: 'account_1', eventId: 'event_1', sessionIds, surveyId: 'survey_1' }, {} as never)

    expect(bulkAssignMock).toHaveBeenCalledTimes(1)
    expect(bulkAssignMock).toHaveBeenCalledWith(expect.objectContaining({ targetIds: sessionIds, conflictMode: 'SKIP_EXISTING' }), expect.anything())
  })
})
