import { EventStatus, EventType, QuestionType, ResponseMode, SurveyAvailabilityMode, SurveyPresentationMode, SurveyTargetCategory } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { loadAdvancedEventSurvey, publishAdvancedEventSurvey, reconcileAdvancedSurveyAssignments, reviewAdvancedSurveyReadiness, saveAdvancedEventSurveyDraft } from './advanced-event-survey-builder'
import { advancedQuestionConfiguration } from './advanced-question-content'

function assignmentDb() {
  const tx = {
    response: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    survey: {
      findFirst: vi.fn().mockResolvedValue({ id: 'survey_1', status: EventStatus.DRAFT, availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY, _count: { responses: 0 } }),
      update: vi.fn().mockResolvedValue({ id: 'survey_1' }),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ ...validUnassignedSurvey(), surveyTargetId: 'target_event' })),
    },
    surveyTarget: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `target_${data.category.toLowerCase()}`, ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
    },
    eventStructureItem: { findMany: vi.fn().mockResolvedValue([]) },
    eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([]) },
    publicSurveyLink: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'link_1' }),
      update: vi.fn().mockResolvedValue({ id: 'link_1' }),
      deleteMany: vi.fn(),
    },
  }
  const db = {
    event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', locationId: 'location_1', eventType: EventType.ADVANCED }) },
    $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
  }
  return { db, tx }
}

describe('reconcileAdvancedSurveyAssignments', () => {
  it('creates an explicit event assignment and an inactive canonical public link', async () => {
    const { db, tx } = assignmentDb()
    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'EVENT', selection: 'SELECTED' }],
    }, db as never)

    expect(tx.surveyTarget.create).toHaveBeenCalledWith({ data: expect.objectContaining({ category: SurveyTargetCategory.EVENT, name: 'Summit' }) })
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ surveyId: 'survey_1', surveyTargetId: 'target_event', isActive: false }) })
    expect(tx.survey.update).toHaveBeenCalledWith({ where: { id: 'survey_1' }, data: { surveyTargetId: 'target_event' } })
  })

  it('bulk assigns All sessions as concrete per-target links for one survey', async () => {
    const { db, tx } = assignmentDb()
    tx.eventStructureItem.findMany
      .mockResolvedValueOnce([{ id: 'session_a' }, { id: 'session_b' }, { id: 'session_c' }])
      .mockResolvedValueOnce([
        { id: 'session_a', name: 'Session A', locationId: 'location_1', speakerAssignments: [{ speaker: { name: 'Ada', isArchived: false } }] },
        { id: 'session_b', name: 'Session B', locationId: 'location_1', speakerAssignments: [{ speaker: { name: 'Bea', isArchived: false } }] },
        { id: 'session_c', name: 'Session C', locationId: 'location_1', speakerAssignments: [{ speaker: { name: 'Cy', isArchived: false } }] },
      ])
    tx.surveyTarget.create.mockImplementation(({ data }) => Promise.resolve({ id: `target_${data.eventStructureItemId}`, ...data }))
    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'ALL' }],
    }, db as never)

    expect(tx.surveyTarget.create).toHaveBeenCalledTimes(3)
    expect(tx.publicSurveyLink.create).toHaveBeenCalledTimes(3)
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      surveyId: 'survey_1',
      surveyTargetId: 'target_session_a',
      metadata: expect.objectContaining({ advancedAssignment: { kind: 'SESSION', selection: 'ALL' } }),
    }) })
  })

  it('creates a planner target instead of reusing a result-only target with the same session identity', async () => {
    const { db, tx } = assignmentDb()
    tx.eventStructureItem.findMany.mockResolvedValue([{ id: 'session_1', name: 'Customer Advisory Board Session', locationId: 'location_1', speakerAssignments: [] }])
    tx.surveyTarget.findMany.mockResolvedValue([{
      id: 'result_only_session_target',
      eventId: 'event_1',
      eventStructureItemId: 'session_1',
      category: SurveyTargetCategory.SESSION,
      metadata: { listeningPoint: false, resultScope: 'SESSION' },
      isActive: true,
    }])
    tx.surveyTarget.create.mockImplementation(({ data }) => Promise.resolve({ id: 'planner_session_target', ...data }))

    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_1'] }],
    }, db as never)

    expect(tx.surveyTarget.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventStructureItemId: 'session_1', category: SurveyTargetCategory.SESSION, isActive: true,
    }) })
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ surveyTargetId: 'planner_session_target' }) })
  })

  it('keeps multiple assignment rules as distinct public-link targets', async () => {
    const { db, tx } = assignmentDb()
    tx.eventStructureItem.findMany
      .mockResolvedValueOnce([{ id: 'session_a' }])
      .mockResolvedValueOnce([{ id: 'session_a', name: 'Session A', locationId: 'location_1', speakerAssignments: [] }])
    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [
        { kind: 'EVENT', selection: 'SELECTED' },
        { kind: 'SESSION', selection: 'ALL' },
      ],
    }, db as never)

    expect(tx.publicSurveyLink.create).toHaveBeenCalledTimes(2)
    expect(tx.survey.update).toHaveBeenCalledWith({ where: { id: 'survey_1' }, data: { surveyTargetId: 'target_event' } })
  })

  it('allows a zero-response active survey to receive an active assignment', async () => {
    const { db, tx } = assignmentDb()
    tx.survey.findFirst.mockResolvedValue({
      id: 'survey_1', status: EventStatus.ACTIVE, availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY,
    })

    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'EVENT', selection: 'SELECTED' }],
    }, db as never)

    expect(tx.response.count).toHaveBeenCalledWith({ where: { surveyId: 'survey_1' } })
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ surveyId: 'survey_1', isActive: true }),
    })
  })

  it('moves a response-bearing survey forward without replacing its public token or historical target', async () => {
    const { db, tx } = assignmentDb()
    tx.response.count.mockResolvedValue(1)
    tx.survey.findFirst.mockResolvedValue({
      id: 'survey_1', status: EventStatus.ACTIVE, availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY,
    })
    tx.eventStructureItem.findMany.mockResolvedValue([{ id: 'session_new', name: 'Closing', locationId: 'location_1' }])
    tx.publicSurveyLink.findMany.mockResolvedValue([{
      id: 'link_live', surveyTargetId: 'target_old', speakerAssignmentId: null, isActive: true,
      metadata: { assignmentState: 'CURRENT' },
    }])

    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_new'] }],
    }, db as never)

    expect(tx.response.count).toHaveBeenCalledWith({ where: { surveyId: 'survey_1' } })
    expect(tx.response.findMany).toHaveBeenCalledWith({
      where: { publicSurveyLinkId: { in: ['link_live'] }, surveyTargetId: null },
      select: { publicSurveyLinkId: true },
    })
    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith({
      where: { id: 'link_live' },
      data: expect.objectContaining({
        surveyTargetId: 'target_session',
        isActive: true,
        metadata: { assignmentState: 'CURRENT', advancedAssignment: { kind: 'SESSION', selection: 'SELECTED' } },
      }),
    })
    expect(tx.publicSurveyLink.create).not.toHaveBeenCalled()
    expect(tx.survey.update).toHaveBeenCalledWith({ where: { id: 'survey_1' }, data: { surveyTargetId: 'target_session' } })
    expect(tx.surveyTarget).not.toHaveProperty('delete')
  })

  it('warns but still reconciles a speaker-feedback survey onto a speakerless session', async () => {
    const { db, tx } = assignmentDb()
    tx.survey.findFirst.mockResolvedValue({
      id: 'survey_1', status: EventStatus.ACTIVE, availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY,
      questions: [{ label: 'How would you rate this speaker?', type: QuestionType.SPEAKER_FEEDBACK }],
    })
    tx.eventStructureItem.findMany.mockResolvedValue([{
      id: 'session_without_speakers', name: 'Panel: Future of Events', locationId: 'location_1', speakerAssignments: [],
    }])

    const result = await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_without_speakers'] }],
    }, db as never)

    expect(result.assignmentWarnings).toEqual([expect.objectContaining({
      code: 'SPEAKER_QUESTIONS_HIDDEN',
      targetNames: ['Panel: Future of Events'],
      questionLabels: ['How would you rate this speaker?'],
      message: "This survey has 1 speaker question. Panel: Future of Events has no speakers — that question won't be shown to attendees.",
    })])
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ surveyTargetId: 'target_session', isActive: true }) })
  })

  it('keeps a legacy link on its original target when an older response lacks a target snapshot', async () => {
    const { db, tx } = assignmentDb()
    tx.response.count.mockResolvedValue(1)
    tx.response.findMany.mockResolvedValue([{ publicSurveyLinkId: 'link_legacy' }])
    tx.survey.findFirst.mockResolvedValue({ id: 'survey_1', status: EventStatus.ACTIVE, availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY })
    tx.eventStructureItem.findMany.mockResolvedValue([{ id: 'session_new', name: 'Closing', locationId: 'location_1' }])
    tx.publicSurveyLink.findMany.mockResolvedValue([{
      id: 'link_legacy', surveyTargetId: 'target_old', speakerAssignmentId: null, isActive: true,
      metadata: { assignmentState: 'CURRENT' },
    }])

    await reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_new'] }],
    }, db as never)

    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ surveyTargetId: 'target_session', isActive: true }) })
    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith({
      where: { id: 'link_legacy' },
      data: expect.objectContaining({ isActive: false, metadata: { assignmentState: 'SUPERSEDED' } }),
    })
  })

  it('unassigns one target without deleting its response-safe assignment link or canonical target', async () => {
    const { db, tx } = assignmentDb()
    tx.publicSurveyLink.findMany.mockResolvedValue([{ id: 'link_old', surveyTargetId: 'target_old' }])
    tx.survey.findFirst.mockResolvedValue({ id: 'survey_1', status: EventStatus.DRAFT, availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY, _count: { responses: 0 } })

    await reconcileAdvancedSurveyAssignments({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', assignments: [] }, db as never)

    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith({
      where: { id: 'link_old' },
      data: { isActive: false, metadata: { assignmentState: 'SUPERSEDED' } },
    })
    expect(tx.publicSurveyLink.deleteMany).not.toHaveBeenCalled()
    expect(tx.survey.update).toHaveBeenCalledWith({ where: { id: 'survey_1' }, data: { surveyTargetId: null } })
    expect(tx.surveyTarget).not.toHaveProperty('delete')
  })

  it('does not orphan session-relative availability when assignments change', async () => {
    const { db, tx } = assignmentDb()
    tx.survey.findFirst.mockResolvedValue({
      id: 'survey_1',
      status: EventStatus.DRAFT,
      availabilityMode: SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA,
      _count: { responses: 0 },
    })

    await expect(reconcileAdvancedSurveyAssignments({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', assignments: [],
    }, db as never)).rejects.toThrow('Keep a session assignment')

    expect(tx.publicSurveyLink.findMany).not.toHaveBeenCalled()
    expect(tx.survey.update).not.toHaveBeenCalled()
  })
})

function validUnassignedSurvey() {
  return {
    id: 'survey_1', eventId: 'event_1', surveyTargetId: null, creationRequestId: 'request_1',
    collectionPhase: 'DURING',
    name: 'Attendee pulse', description: null, responseMode: 'VOICE_AND_TEXT', presentationMode: 'ATTENDEE_CHOOSES',
    status: EventStatus.DRAFT, settingsJson: null, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US',
    availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY, availabilityTimezone: 'America/New_York', availabilityOpensAt: null,
    availabilityClosesAt: null, availabilityOpenAnchor: null, availabilityCloseAnchor: null, availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null, createdAt: new Date(), updatedAt: new Date(), surveyTarget: null, publicSurveyLinks: [],
    questions: [{ id: 'question_1', key: 'q1', label: 'What should improve?', type: QuestionType.OPEN_RESPONSE, order: 0, required: true, responseTarget: 'GENERAL', configurationJson: null }],
  }
}

describe('loadAdvancedEventSurvey', () => {
  it('loads the existing scoped Survey record for the canonical Advanced editor', async () => {
    const snapshot = validUnassignedSurvey()
    snapshot.questions[0] = { ...snapshot.questions[0], type: QuestionType.YES_NO } as never
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1' }) },
      survey: { findFirst: vi.fn().mockResolvedValue(snapshot) },
    }
    const result = await loadAdvancedEventSurvey({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' }, db as never)
    expect(result).toMatchObject({
      id: 'survey_1', name: 'Attendee pulse', surveyTargetId: null,
      presentationMode: SurveyPresentationMode.ATTENDEE_CHOOSES,
      responseMode: ResponseMode.VOICE_AND_TEXT,
    })
    expect(result.questions[0]).toMatchObject({ type: QuestionType.YES_NO })
    expect(db.survey.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'survey_1', eventId: 'event_1' }) }))
  })
})

describe('saveAdvancedEventSurveyDraft', () => {
  it('saves speaker feedback as a draft and returns the canonical publish issue instead of a contradictory save error', async () => {
    const creationRequestId = 'speaker-feedback-request'
    const existing = {
      id: 'survey_1', status: EventStatus.DRAFT, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F', description: 'Legacy saved intro',
      surveyTarget: null, publicSurveyLinks: [], questions: [],
    }
    const persisted = {
      ...validUnassignedSurvey(),
      questions: [{ ...validUnassignedSurvey().questions[0], type: QuestionType.SPEAKER_FEEDBACK, responseTarget: 'SPEAKERS' }],
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue(persisted) },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    const result = await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId,
      questions: [{ id: 'speaker', text: 'How was the speaker?', type: QuestionType.SPEAKER_FEEDBACK, required: true }],
    }, db as never, vi.fn().mockResolvedValue([]))

    expect(result.review).toEqual({
      ready: false,
      issues: ['Assign speaker feedback only to specific sessions before publishing.'],
    })
    expect(db.survey.update.mock.calls[0]?.[0]?.data).not.toHaveProperty('description')
  })

  it('stores group speaker feedback as one general session-level answer', async () => {
    const existing = {
      id: 'survey_1', status: EventStatus.DRAFT, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F', settingsJson: {},
      surveyTarget: null, publicSurveyLinks: [], questions: [],
    }
    const persisted = {
      ...validUnassignedSurvey(),
      questions: [{ ...validUnassignedSurvey().questions[0], type: QuestionType.SPEAKER_FEEDBACK, responseTarget: 'GENERAL' }],
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue(persisted) },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId: 'speaker-group-request',
      surveyContext: 'SESSIONS', speakerFeedbackMode: 'SPEAKERS_AS_GROUP',
      questions: [{ id: 'speaker', text: 'How was the group?', type: QuestionType.SPEAKER_FEEDBACK, required: true }],
    }, db as never, vi.fn().mockResolvedValue([]))

    expect(db.survey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        settingsJson: expect.objectContaining({ advancedSpeakerFeedbackMode: 'SPEAKERS_AS_GROUP' }),
        questions: { deleteMany: {}, create: [expect.objectContaining({ responseTarget: 'GENERAL' })] },
      }),
    }))
  })

  it('persists a changed question type and clears incompatible single-choice configuration', async () => {
    const creationRequestId = 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e'
    const existing = {
      id: 'survey_1', status: EventStatus.DRAFT, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F',
      surveyTarget: null, publicSurveyLinks: [], questions: [{
        key: `advanced-${creationRequestId}-question_1`, label: 'Which area helped?', type: QuestionType.SINGLE_CHOICE,
        responseTarget: 'GENERAL', configurationJson: { options: ['Registration', 'Sessions'] }, order: 0, required: true,
      }],
    }
    const persisted = { ...validUnassignedSurvey(), questions: [{ ...validUnassignedSurvey().questions[0], label: 'Which area helped?', type: QuestionType.YES_NO, configurationJson: null }] }
    const update = vi.fn().mockResolvedValue(persisted)
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    const result = await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId, presentationMode: 'READ_ALOUD',
      questions: [{ id: 'question_1', text: 'Which area helped?', type: QuestionType.YES_NO, required: true }],
    }, db as never, vi.fn().mockResolvedValue([]))

    expect(update.mock.calls[0][0].data.questions).toEqual(expect.objectContaining({
      deleteMany: {},
      create: [expect.objectContaining({
        type: QuestionType.YES_NO,
        responseTarget: 'GENERAL',
        configurationJson: undefined,
        required: true,
      })],
    }))
    expect(result.questions[0]).toMatchObject({ type: QuestionType.YES_NO, configurationJson: null })
  })

  it('creates a Simple Event draft with the canonical event-wide target and public link', async () => {
    const draft = validUnassignedSurvey()
    const deployed = {
      ...draft,
      surveyTargetId: 'target_event',
      surveyTarget: { id: 'target_event', category: SurveyTargetCategory.EVENT, name: 'Simple Summit', eventStructureItemId: null, speakerId: null, metadata: null, eventStructureItem: null },
      publicSurveyLinks: [],
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Simple Summit', eventType: EventType.BLANK, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { upsert: vi.fn().mockResolvedValue(draft), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(deployed) },
      response: { count: vi.fn().mockResolvedValue(0) },
      surveyTarget: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'target_event' }) },
      publicSurveyLink: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'link_event' }) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', creationRequestId: 'simple-request', name: 'Simple survey',
      collectionPhase: 'DURING',
      questions: [{ id: 'q1', text: 'How was the event?', type: QuestionType.RATING_1_TO_5, required: true }],
    }, db as never, vi.fn().mockResolvedValue([]))

    expect(db.survey.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        presentationMode: SurveyPresentationMode.READ_ALOUD,
        responseMode: ResponseMode.VOICE_ONLY,
      }),
    }))
    expect(db.surveyTarget.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: SurveyTargetCategory.EVENT, name: 'Simple Summit' }) }))
    expect(db.survey.update).toHaveBeenCalledWith({ where: { id: 'survey_1' }, data: { surveyTargetId: 'target_event' } })
    expect(db.publicSurveyLink.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ surveyId: 'survey_1', surveyTargetId: 'target_event', isActive: false }) }))
  })

  it('preserves an explicit Simple Event experience choice instead of resetting it to voice-first', async () => {
    const draft = validUnassignedSurvey()
    const deployed = {
      ...draft,
      surveyTargetId: 'target_event',
      surveyTarget: { id: 'target_event', category: SurveyTargetCategory.EVENT, name: 'Simple Summit', eventStructureItemId: null, speakerId: null, metadata: null, eventStructureItem: null },
      publicSurveyLinks: [],
    }
    const upsert = vi.fn().mockResolvedValue(draft)
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Simple Summit', eventType: EventType.BLANK, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { upsert, update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(deployed) },
      response: { count: vi.fn().mockResolvedValue(0) },
      surveyTarget: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'target_event' }) },
      publicSurveyLink: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'link_event' }) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', creationRequestId: 'simple-text-request', name: 'Simple survey',
      collectionPhase: 'DURING',
      presentationMode: SurveyPresentationMode.SCREEN, responseMode: ResponseMode.TEXT_ONLY,
    }, db as never, vi.fn().mockResolvedValue([]))

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ presentationMode: SurveyPresentationMode.SCREEN, responseMode: ResponseMode.TEXT_ONLY }),
      update: expect.objectContaining({ presentationMode: SurveyPresentationMode.SCREEN, responseMode: ResponseMode.TEXT_ONLY }),
    }))
  })

  it('derives persisted presentation from response mode when a legacy caller sends both', async () => {
    const draft = validUnassignedSurvey()
    const upsert = vi.fn().mockResolvedValue(draft)
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Advanced Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { upsert, update: vi.fn(), findUnique: vi.fn() },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', creationRequestId: 'response-mode-wins',
      collectionPhase: 'DURING',
      responseMode: ResponseMode.VOICE_ONLY,
      presentationMode: SurveyPresentationMode.SCREEN,
    }, db as never, vi.fn().mockResolvedValue([]))

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ presentationMode: SurveyPresentationMode.READ_ALOUD, responseMode: ResponseMode.VOICE_ONLY }),
      update: expect.objectContaining({ presentationMode: SurveyPresentationMode.READ_ALOUD, responseMode: ResponseMode.VOICE_ONLY }),
    }))
  })

  it('creates a new Advanced Event survey Voice-first and keeps those persisted settings for reload', async () => {
    const persisted = {
      ...validUnassignedSurvey(),
      presentationMode: SurveyPresentationMode.READ_ALOUD,
      responseMode: ResponseMode.VOICE_ONLY,
      questions: [{
        ...validUnassignedSurvey().questions[0],
        type: QuestionType.RATING_1_TO_5,
        configurationJson: {
          questionType: QuestionType.RATING_1_TO_5,
          answerFormat: 'NUMERIC',
          scale: { min: 1, max: 5 },
        },
      }],
    }
    const upsert = vi.fn().mockResolvedValue(persisted)
    const update = vi.fn().mockResolvedValue({ ...persisted, settingsJson: { advancedSurveyExperiencePreset: 'VOICE_FIRST' } })
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED,
          ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US',
          location: { id: 'location_1', timezone: 'America/New_York' },
        }),
      },
      survey: { upsert, update },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    const ensureQuestionAudio = vi.fn().mockResolvedValue([])
    const saved = await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', creationRequestId: 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e',
      collectionPhase: 'DURING',
      name: 'Rating survey', experiencePreset: 'VOICE_FIRST',
      questions: [{ id: 'rating_1', text: 'How was it?', type: QuestionType.RATING_1_TO_5, required: true }],
    }, db as never, ensureQuestionAudio)

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        presentationMode: SurveyPresentationMode.READ_ALOUD,
        responseMode: ResponseMode.VOICE_ONLY,
        questions: {
          create: [expect.objectContaining({
            type: QuestionType.RATING_1_TO_5,
            configurationJson: {
              questionType: QuestionType.RATING_1_TO_5,
              answerFormat: 'NUMERIC',
              scale: { min: 1, max: 5 },
            },
          })],
        },
      }),
    }))
    expect(saved).toMatchObject({ presentationMode: SurveyPresentationMode.READ_ALOUD, responseMode: ResponseMode.VOICE_ONLY })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { settingsJson: { advancedSurveyExperiencePreset: 'VOICE_FIRST' } } }))
    expect(ensureQuestionAudio).toHaveBeenCalledWith('survey_1', {
      provider: 'google', voice: 'en-US-Neural2-F', locale: 'en-US',
    })
  })

  it('persists a selected curated voice and regenerates only the affected question audio', async () => {
    const creationRequestId = 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e'
    const existing = {
      id: 'survey_1', status: EventStatus.DRAFT, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F',
      surveyTarget: null, publicSurveyLinks: [],
      questions: [{
        key: `advanced-${creationRequestId}-question_1`, label: 'What should improve?', type: QuestionType.OPEN_RESPONSE,
        responseTarget: 'GENERAL', configurationJson: advancedQuestionConfiguration(QuestionType.OPEN_RESPONSE, []), order: 0, required: true,
      }],
    }
    const update = vi.fn().mockResolvedValue({ ...validUnassignedSurvey(), ttsVoice: 'en-US-Neural2-J' })
    const ensureQuestionAudio = vi.fn().mockResolvedValue([])
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId,
      ttsVoice: 'en-US-Neural2-J', presentationMode: 'READ_ALOUD',
      questions: [{ id: 'question_1', text: 'What should improve?', type: QuestionType.OPEN_RESPONSE, required: true }],
    }, db as never, ensureQuestionAudio)

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ttsVoice: 'en-US-Neural2-J', ttsLocale: 'en-US' }),
    }))
    expect(update.mock.calls[0][0].data.questions).toBeUndefined()
    expect(ensureQuestionAudio).toHaveBeenCalledWith('survey_1', {
      provider: 'google', voice: 'en-US-Neural2-J', locale: 'en-US',
    })
  })

  it('allows response-bearing surveys to update safe details and voice through the existing audio path', async () => {
    const creationRequestId = 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e'
    const existing = {
      id: 'survey_1', status: EventStatus.ACTIVE, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F',
      surveyTarget: null, publicSurveyLinks: [],
      questions: [{
        key: `advanced-${creationRequestId}-question_1`, label: 'What should improve?', type: QuestionType.OPEN_RESPONSE,
        responseTarget: 'GENERAL', configurationJson: advancedQuestionConfiguration(QuestionType.OPEN_RESPONSE, []), order: 0, required: true,
      }],
    }
    const updatedSurvey = {
      ...validUnassignedSurvey(),
      status: EventStatus.ACTIVE,
      name: 'Updated attendee pulse',
      description: 'Tell us what stood out.',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      presentationMode: 'READ_ALOUD',
    }
    const update = vi.fn().mockResolvedValue(updatedSurvey)
    const ensureQuestionAudio = vi.fn().mockResolvedValue([])
    const response = { count: vi.fn().mockResolvedValue(4) }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update },
      response,
    }

    const result = await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId,
      name: 'Updated attendee pulse', description: 'Tell us what stood out.',
      ttsVoice: 'en-US-Neural2-J', presentationMode: 'READ_ALOUD',
      questions: [{ id: 'question_1', text: 'What should improve?', type: QuestionType.OPEN_RESPONSE, required: true }],
    }, db as never, ensureQuestionAudio)

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'survey_1' },
      data: expect.objectContaining({
        name: 'Updated attendee pulse',
        description: 'Tell us what stood out.',
        ttsVoice: 'en-US-Neural2-J',
        ttsLocale: 'en-US',
      }),
    }))
    expect(update.mock.calls[0][0].data.questions).toBeUndefined()
    expect(result).toMatchObject({ name: 'Updated attendee pulse', description: 'Tell us what stood out.', ttsVoice: 'en-US-Neural2-J' })
    expect(ensureQuestionAudio).toHaveBeenCalledWith('survey_1', {
      provider: 'google', voice: 'en-US-Neural2-J', locale: 'en-US',
    })
    expect(response.count).toHaveBeenCalledWith({ where: { surveyId: 'survey_1' } })
    expect(Object.keys(response)).toEqual(['count'])
  })

  it.each([
    ['question text', [{ id: 'question_1', text: 'A different historical question', type: QuestionType.OPEN_RESPONSE, required: true }]],
    ['question type', [{ id: 'question_1', text: 'What should improve?', type: QuestionType.YES_NO, required: true }]],
    ['adding a question', [
      { id: 'question_1', text: 'What should improve?', type: QuestionType.OPEN_RESPONSE, required: true },
      { id: 'question_2', text: 'Anything else?', type: QuestionType.OPEN_RESPONSE, required: true },
    ]],
    ['deleting a question', []],
  ])('rejects %s changes after responses without rewriting questions or response data', async (_label, questions) => {
    const creationRequestId = 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e'
    const existing = {
      id: 'survey_1', status: EventStatus.ACTIVE, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F',
      surveyTarget: null, publicSurveyLinks: [],
      questions: [{
        key: `advanced-${creationRequestId}-question_1`, label: 'What should improve?', type: QuestionType.OPEN_RESPONSE,
        responseTarget: 'GENERAL', configurationJson: advancedQuestionConfiguration(QuestionType.OPEN_RESPONSE, []), order: 0, required: true,
      }],
    }
    const update = vi.fn()
    const ensureQuestionAudio = vi.fn()
    const response = { count: vi.fn().mockResolvedValue(2) }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update },
      response,
    }

    await expect(saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId,
      name: 'Safe name bundled with an unsafe question change', presentationMode: 'READ_ALOUD', questions,
    }, db as never, ensureQuestionAudio)).rejects.toMatchObject({
      status: 409,
      message: 'Questions are locked because this survey has responses. Survey details and voice settings can still be updated.',
    })

    expect(update).not.toHaveBeenCalled()
    expect(ensureQuestionAudio).not.toHaveBeenCalled()
    expect(Object.keys(response)).toEqual(['count'])
  })

  it('does not regenerate cached question audio for an unrelated draft edit', async () => {
    const creationRequestId = 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e'
    const existing = {
      id: 'survey_1', status: EventStatus.DRAFT, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F',
      surveyTarget: null, publicSurveyLinks: [], questions: [{
        key: `advanced-${creationRequestId}-question_1`, label: 'What should improve?', type: QuestionType.OPEN_RESPONSE,
        responseTarget: 'GENERAL', configurationJson: advancedQuestionConfiguration(QuestionType.OPEN_RESPONSE, []), order: 0, required: true,
      }],
    }
    const update = vi.fn().mockResolvedValue(validUnassignedSurvey())
    const ensureQuestionAudio = vi.fn().mockResolvedValue([])
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId, description: 'Internal notes only', presentationMode: 'READ_ALOUD',
      questions: [{ id: 'question_1', text: 'What should improve?', type: QuestionType.OPEN_RESPONSE, required: true }],
    }, db as never, ensureQuestionAudio)

    expect(ensureQuestionAudio).not.toHaveBeenCalled()
  })

  it('regenerates spoken question audio when question text changes', async () => {
    const creationRequestId = 'b498bf8f-6c6f-48b5-9351-5f9a62f9a64e'
    const existing = {
      id: 'survey_1', status: EventStatus.DRAFT, presentationMode: 'READ_ALOUD', ttsVoice: 'en-US-Neural2-F',
      surveyTarget: null, publicSurveyLinks: [], questions: [{
        key: `advanced-${creationRequestId}-question_1`, label: 'What should improve?', type: QuestionType.OPEN_RESPONSE,
        responseTarget: 'GENERAL', configurationJson: advancedQuestionConfiguration(QuestionType.OPEN_RESPONSE, []), order: 0, required: true,
      }],
    }
    const update = vi.fn().mockResolvedValue(validUnassignedSurvey())
    const ensureQuestionAudio = vi.fn().mockResolvedValue([])
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US', location: { id: 'location_1', timezone: 'America/New_York' } }) },
      survey: { findFirst: vi.fn().mockResolvedValue(existing), update },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    await saveAdvancedEventSurveyDraft({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', creationRequestId, presentationMode: 'READ_ALOUD',
      questions: [{ id: 'question_1', text: 'What should we improve next?', type: QuestionType.OPEN_RESPONSE, required: true }],
    }, db as never, ensureQuestionAudio)

    expect(update.mock.calls[0][0].data.questions).toEqual(expect.objectContaining({ deleteMany: {}, create: expect.any(Array) }))
    expect(ensureQuestionAudio).toHaveBeenCalledTimes(1)
  })
})

describe('Advanced survey review and publish', () => {
  it('allows a complete Advanced survey to publish while intentionally unassigned', () => {
    expect(reviewAdvancedSurveyReadiness(validUnassignedSurvey() as never)).toEqual([])
  })

  it('returns specific content issues instead of a vague incomplete warning', () => {
    const survey = {
      ...validUnassignedSurvey(),
      name: 'Untitled survey',
      questions: [{
        ...validUnassignedSurvey().questions[0],
        label: 'Untitled question',
        type: QuestionType.SINGLE_CHOICE,
        configurationJson: { options: ['Only choice'] },
      }],
    }
    expect(reviewAdvancedSurveyReadiness(survey as never)).toEqual([
      'Add a survey name.',
      'Question 1 needs question text.',
      'Question 1 needs at least two choices.',
    ])
  })

  it('uses one server rule for speaker feedback across every current assignment', () => {
    const speakerQuestion = { ...validUnassignedSurvey().questions[0], type: QuestionType.SPEAKER_FEEDBACK, responseTarget: 'SPEAKERS' }
    const sessionTarget = (id: string, name: string, speakerName?: string) => ({
      id: `target_${id}`,
      category: SurveyTargetCategory.SESSION,
      name,
      eventStructureItemId: id,
      speakerId: null,
      metadata: null,
      eventStructureItem: {
        id,
        name,
        startsAt: null,
        endsAt: null,
        timezone: 'America/New_York',
        speakerAssignments: speakerName ? [{ speaker: { id: `speaker_${id}`, name: speakerName, title: null, organization: null, isArchived: false } }] : [],
      },
    })
    const valid = {
      ...validUnassignedSurvey(),
      questions: [speakerQuestion],
      publicSurveyLinks: [
        { id: 'link_a', metadata: { assignmentState: 'CURRENT' }, surveyTargetId: 'target_a', isActive: false, surveyTarget: sessionTarget('a', 'Session A', 'Ada') },
        { id: 'link_b', metadata: { assignmentState: 'CURRENT' }, surveyTargetId: 'target_b', isActive: false, surveyTarget: sessionTarget('b', 'Session B', 'Bea') },
      ],
    }
    expect(reviewAdvancedSurveyReadiness(valid as never)).toEqual([])

    const invalid = {
      ...valid,
      publicSurveyLinks: [
        valid.publicSurveyLinks[0],
        { ...valid.publicSurveyLinks[1], surveyTarget: sessionTarget('b', 'Session B') },
      ],
    }
    expect(reviewAdvancedSurveyReadiness(invalid as never)).toEqual([
      'Add a speaker to Session B before publishing speaker feedback.',
    ])
  })

  it('publishes canonical Survey state and activates only existing assignment links', async () => {
    const snapshot = {
      ...validUnassignedSurvey(),
      publicSurveyLinks: [
        { id: 'link_current', surveyTargetId: 'target_event', isActive: false, metadata: { assignmentState: 'CURRENT' }, surveyTarget: null },
        { id: 'link_old', surveyTargetId: 'target_old', isActive: false, metadata: { assignmentState: 'SUPERSEDED' }, surveyTarget: null },
      ],
    }
    const tx = {
      survey: {
        findFirst: vi.fn().mockResolvedValue(snapshot),
        update: vi.fn().mockResolvedValue({ ...snapshot, status: EventStatus.ACTIVE }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...snapshot, status: EventStatus.ACTIVE }),
      },
      publicSurveyLink: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', eventType: EventType.ADVANCED }) },
      $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    }
    const result = await publishAdvancedEventSurvey({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1' }, db as never)
    expect(tx.survey.update).toHaveBeenCalledWith({ where: { id: 'survey_1' }, data: { status: EventStatus.ACTIVE } })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['link_current'] } }, data: { isActive: true } })
    expect(result.status).toBe(EventStatus.ACTIVE)
    expect(result.review).toEqual({ ready: true, issues: [] })
  })
})
