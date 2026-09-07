import { describe, expect, it, vi } from 'vitest'
import {
  EventStatus,
  EventType,
  EventStructureItemKind,
  QuestionResponseTarget,
  QuestionType,
  SurveyAvailabilityAnchor,
  SurveyAvailabilityMode,
  SurveyAvailabilityOverride,
  SurveyTargetCategory,
} from '@prisma/client'
import {
  EventVoiceSurveyLifecycleError,
  activateEventVoiceSurvey,
  archiveEventVoiceSurvey,
  createEventVoiceSurvey,
  createEventVoiceSurveyInTransaction,
  deleteEventVoiceSurvey,
  mapEventStructureItemKindToSurveyTargetCategory,
  mapSurveyTargetCategoryToEventStructureItemKind,
  unpublishEventVoiceSurvey,
} from './event-voice-surveys'
import { saveAdvancedEventSurveyDraft } from './advanced-event-survey-builder'
import {
  normalizeSurveyAvailabilityInput,
  resolveSurveyAvailability,
  resolveSurveyLaunchReadiness,
  type SurveyAvailabilityRecord,
} from './survey-availability'

function advancedDraftResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'survey_draft', eventId: 'evt_advanced', surveyTargetId: null, creationRequestId: 'd03b7ff0-878e-46e0-ab4e-07b873a5f606',
    name: 'Attendee feedback', description: null, responseMode: 'VOICE_AND_TEXT', presentationMode: 'ATTENDEE_CHOOSES',
    collectionPhase: 'DURING',
    status: EventStatus.DRAFT, settingsJson: null, ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US',
    availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY, availabilityTimezone: 'America/New_York', availabilityOpensAt: null,
    availabilityClosesAt: null, availabilityOpenAnchor: null, availabilityCloseAnchor: null, availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null, createdAt: new Date(), updatedAt: new Date(), surveyTarget: null, publicSurveyLinks: [], questions: [],
    ...overrides,
  }
}

describe('Advanced Event unassigned draft persistence', () => {
  it('upserts an idempotent Survey without creating a target or public link', async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({
        id: 'evt_advanced', name: 'Summit', eventType: EventType.ADVANCED,
        ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US',
        location: { id: 'loc_advanced', timezone: 'America/New_York' },
      }) },
      survey: {
        findFirst: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn().mockResolvedValue(advancedDraftResult()),
      },
    }

    const result = await saveAdvancedEventSurveyDraft({
      accountId: 'acct_123',
      eventId: 'evt_advanced',
      collectionPhase: 'DURING',
      creationRequestId: 'd03b7ff0-878e-46e0-ab4e-07b873a5f606',
      name: ' Attendee feedback ',
    }, db as never)

    expect(result.surveyTargetId).toBeNull()
    expect(db.survey.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ surveyTargetId: null, status: EventStatus.DRAFT }),
    }))
    expect(Object.keys(db)).toEqual(['event', 'survey'])
  })

  it('rejects unsupported Event types before writing', async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: 'evt_template', eventType: EventType.TEMPLATE }) },
      survey: { findFirst: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    }

    await expect(saveAdvancedEventSurveyDraft({
      accountId: 'acct_123',
      eventId: 'evt_template',
      creationRequestId: 'd03b7ff0-878e-46e0-ab4e-07b873a5f606',
      name: 'Not allowed',
    }, db as never)).rejects.toMatchObject({ status: 409 })
    expect(db.survey.upsert).not.toHaveBeenCalled()
  })

  it('persists Advanced question content without storing delivery settings per question', async () => {
    const update = vi.fn().mockResolvedValue(advancedDraftResult())
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({
        id: 'evt_advanced', name: 'Summit', eventType: EventType.ADVANCED,
        ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US',
        location: { id: 'loc_advanced', timezone: 'America/New_York' },
      }) },
      survey: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'survey_draft', status: EventStatus.DRAFT, surveyTarget: null, publicSurveyLinks: [], _count: { responses: 0 },
        }),
        update,
        upsert: vi.fn(),
      },
      response: { count: vi.fn().mockResolvedValue(0) },
    }

    const ensureQuestionAudio = vi.fn().mockResolvedValue([])
    await saveAdvancedEventSurveyDraft({
      accountId: 'acct_123',
      eventId: 'evt_advanced',
      surveyId: 'survey_draft',
      creationRequestId: 'd03b7ff0-878e-46e0-ab4e-07b873a5f606',
      questions: [
        { id: 'open', text: 'What should improve?', type: QuestionType.OPEN_RESPONSE },
        { id: 'choice', text: 'Which track?', type: QuestionType.SINGLE_CHOICE, options: ['Product', 'Design'] },
      ],
    }, db as never, ensureQuestionAudio)

    const create = update.mock.calls[0]?.[0]?.data?.questions?.create
    expect(create).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: QuestionType.OPEN_RESPONSE, responseTarget: QuestionResponseTarget.GENERAL }),
      expect.objectContaining({ type: QuestionType.SINGLE_CHOICE, configurationJson: { options: ['Product', 'Design'] } }),
    ]))
    expect(JSON.stringify(create)).not.toContain('presentation')
    expect(JSON.stringify(create)).not.toContain('responseMode')
  })
})

describe('createEventVoiceSurvey orchestration', () => {
  const committedResult = {
    target: { id: 'target_123', locationId: null, eventStructureItemId: 'structure_123' },
    survey: { id: 'survey_123', ttsProvider: 'google', ttsVoice: 'en-US-Neural2-F', ttsLocale: 'en-US' },
    questions: [{ id: 'question_1', order: 0 }],
    publicLink: { id: 'link_123', token: 'token_123' },
    scope: {
      accountId: 'acct_123', eventId: 'evt_123', eventLocationId: 'loc_123',
      targetLocationId: null, eventStructureItemId: 'structure_123',
    },
  }

  it('returns committed creation truthfully when post-write question audio is deferred', async () => {
    const db = { $transaction: vi.fn().mockResolvedValue(committedResult) }
    const ensureQuestionAudio = vi.fn().mockRejectedValue(new Error('TTS storage unavailable'))

    const result = await createEventVoiceSurvey({
      eventId: 'evt_123',
      targetCategory: SurveyTargetCategory.EVENT,
      targetName: 'Main Stage',
      surveyName: 'Main Stage pulse',
      questions: [{ prompt: 'How was it?' }],
    }, db as never, ensureQuestionAudio)

    expect(result).toMatchObject({
      survey: { id: 'survey_123' },
      target: { id: 'target_123' },
      publicLink: { id: 'link_123' },
      questionAudioStatus: 'DEFERRED',
    })
    expect(ensureQuestionAudio).toHaveBeenCalledWith('survey_123', {
      provider: 'google', voice: 'en-US-Neural2-F', locale: 'en-US',
    })
  })

  it('does not generate question audio for text-only surveys', async () => {
    const db = {
      $transaction: vi.fn().mockResolvedValue({
        ...committedResult,
        survey: { ...committedResult.survey, responseMode: 'TEXT_ONLY' },
      }),
    }
    const ensureQuestionAudio = vi.fn()

    const result = await createEventVoiceSurvey({
      eventId: 'evt_123',
      targetCategory: SurveyTargetCategory.EVENT,
      targetName: 'Main Stage',
      surveyName: 'Text survey',
      responseMode: 'TEXT_ONLY',
      questions: [{ prompt: 'How was it?' }],
    }, db as never, ensureQuestionAudio)

    expect(result.questionAudioStatus).toBe('READY')
    expect(ensureQuestionAudio).not.toHaveBeenCalled()
  })

  it('resolves a concurrent idempotency-key race through the canonical retry lookup', async () => {
    const uniqueRace = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    const db = { $transaction: vi.fn().mockRejectedValueOnce(uniqueRace).mockResolvedValueOnce(committedResult) }
    const ensureQuestionAudio = vi.fn().mockResolvedValue(undefined)

    const result = await createEventVoiceSurvey({
      eventId: 'evt_123',
      creationRequestId: '4fdd4f56-e9ab-4f7c-8258-bc95cb7d7294',
      targetCategory: SurveyTargetCategory.EVENT,
      targetName: 'Main Stage',
      surveyName: 'Main Stage pulse',
      questions: [{ prompt: 'How was it?' }],
    }, db as never, ensureQuestionAudio)

    expect(db.$transaction).toHaveBeenCalledTimes(2)
    expect(result.survey.id).toBe('survey_123')
    expect(result.questionAudioStatus).toBe('READY')
  })
})

describe('createEventVoiceSurveyInTransaction', () => {
  it('creates a direct SPEAKER target for an account speaker assigned to the event', async () => {
    const tx = {
      event: { findUnique: vi.fn().mockResolvedValue({ id: 'evt_123', locationId: 'loc_123', location: { accountId: 'acct_123', account: { accountType: 'EVENTS' } } }) },
      eventSpeakerProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'speaker_123', name: 'Ada Lovelace' }) },
      surveyTarget: {
        findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'speaker_target', eventId: 'evt_123', category: SurveyTargetCategory.SPEAKER, speakerId: 'speaker_123', slug: 'speaker-speaker_123' }),
        update: vi.fn(),
      },
      survey: { create: vi.fn().mockResolvedValue({ id: 'speaker_survey', ttsProvider: null, ttsVoice: null, ttsLocale: null }), update: vi.fn() },
      question: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'question_1', key: 'speaker-question', label: 'How was Ada?', order: 0 }) },
      publicSurveyLink: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'speaker_link', token: 'speaker-token' }) },
    }

    await createEventVoiceSurveyInTransaction({
      eventId: 'evt_123', collectionPhase: 'DURING', speakerId: 'speaker_123', targetCategory: SurveyTargetCategory.SPEAKER,
      surveyName: 'Ada feedback', questions: [{ prompt: 'How was Ada?' }],
    }, tx as never)

    expect(tx.eventSpeakerProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ accountId: 'acct_123', sessionAssignments: { some: { eventId: 'evt_123' } } }) }))
    expect(tx.surveyTarget.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: SurveyTargetCategory.SPEAKER, speakerId: 'speaker_123', eventStructureItemId: null }) }))
  })

  it('creates a SurveyTarget, Survey, Questions, and PublicSurveyLink under an Event', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123',
          locationId: 'loc_123',
          location: {
            accountId: 'acct_123',
            account: { accountType: 'EVENTS' },
          },
        }),
        update: vi.fn(),
      },
      location: {
        findUnique: vi.fn(),
      },
      surveyTarget: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'target_123',
          eventId: 'evt_123',
          eventStructureItemId: 'structure_123',
          category: SurveyTargetCategory.SESSION,
          name: 'Breakout A',
          slug: 'breakout-a',
        }),
      },
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'structure_123',
          eventId: 'evt_123',
          kind: EventStructureItemKind.SESSION,
          name: 'Breakout A',
          slug: 'breakout-a',
        }),
      },
      survey: {
        create: vi.fn().mockResolvedValue({
          id: 'survey_123',
          eventId: 'evt_123',
          surveyTargetId: 'target_123',
          name: 'Breakout Survey',
          status: EventStatus.DRAFT,
        }),
        update: vi.fn(),
      },
      question: {
        findFirst: vi.fn().mockResolvedValue({ order: 4 }),
        create: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'question_1',
            key: 'breakout-a-rget_123-q1',
            label: 'What worked?',
            order: 5,
          })
          .mockResolvedValueOnce({
            id: 'question_2',
            key: 'breakout-a-rget_123-q2',
            label: 'What could improve?',
            order: 6,
          }),
      },
      publicSurveyLink: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'link_123',
          surveyId: 'survey_123',
          token: 'public-token',
          isActive: true,
        }),
      },
    }

    const result = await createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        targetCategory: SurveyTargetCategory.SESSION,
        targetName: 'Breakout A',
        targetDescription: 'Room 204 breakout',
        targetMetadata: { room: '204' },
        surveyName: 'Breakout Survey',
        availability: {
          mode: 'CUSTOM_WINDOW',
          timezone: 'America/New_York',
          opensAt: '2026-09-17T14:00:00.000Z',
          closesAt: '2026-09-17T20:00:00.000Z',
        },
        questions: [
          { prompt: 'What worked?', order: 0, required: true },
          { prompt: 'What could improve?', order: 1, required: true },
        ],
      },
      tx as never,
    )

    expect(tx.eventStructureItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        kind: EventStructureItemKind.SESSION,
        name: 'Breakout A',
        slug: 'breakout-a',
        description: 'Room 204 breakout',
        metadata: { room: '204' },
        isActive: true,
      }),
      select: { id: true, slug: true },
    })
    expect(tx.surveyTarget.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        eventStructureItemId: 'structure_123',
        category: SurveyTargetCategory.SESSION,
        name: 'Breakout A',
        slug: 'breakout-a',
        description: 'Room 204 breakout',
        metadata: { room: '204' },
        isActive: true,
      }),
    })
    expect(tx.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        surveyTargetId: 'target_123',
        name: 'Breakout Survey',
        responseMode: 'VOICE_ONLY',
        status: EventStatus.DRAFT,
        availabilityMode: 'CUSTOM_WINDOW',
        availabilityTimezone: 'America/New_York',
        availabilityOpensAt: new Date('2026-09-17T14:00:00.000Z'),
        availabilityClosesAt: new Date('2026-09-17T20:00:00.000Z'),
      }),
    })
    expect(tx.event.update).not.toHaveBeenCalled()
    expect(tx.question.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        surveyId: 'survey_123',
        label: 'What worked?',
        order: 5,
      }),
    })
    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        surveyId: 'survey_123',
        token: expect.any(String),
        isActive: false,
      }),
    })
    expect(result.target.id).toBe('target_123')
    expect(result.target.eventStructureItemId).toBe('structure_123')
    expect(result.survey.id).toBe('survey_123')
    expect(result.publicLink.id).toBe('link_123')
    expect(result.scope).toMatchObject({
      accountId: 'acct_123',
      eventId: 'evt_123',
      eventLocationId: 'loc_123',
      eventStructureItemId: 'structure_123',
    })
  })

  it('returns the original complete survey on an idempotent retry without duplicate writes', async () => {
    const existingSurvey = {
      id: 'survey_existing',
      eventId: 'evt_123',
      surveyTargetId: 'target_existing',
      name: 'Main Stage pulse',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      creationRequestId: '4fdd4f56-e9ab-4f7c-8258-bc95cb7d7294',
      surveyTarget: {
        id: 'target_existing', eventId: 'evt_123', locationId: null,
        eventStructureItemId: 'structure_123', name: 'Main Stage',
      },
      questions: [{ id: 'question_existing', key: 'main-stage-q1', order: 0 }],
      publicSurveyLinks: [{ id: 'link_existing', token: 'existing-token' }],
    }
    const tx = {
      event: { findUnique: vi.fn().mockResolvedValue({
        id: 'evt_123', locationId: 'loc_123',
        location: { accountId: 'acct_123', account: { accountType: 'EVENTS' } },
      }) },
      survey: {
        findUnique: vi.fn().mockResolvedValue(existingSurvey),
        create: vi.fn(),
      },
      surveyTarget: { create: vi.fn() },
      eventStructureItem: { create: vi.fn() },
      question: { create: vi.fn() },
      publicSurveyLink: { create: vi.fn() },
    }

    const result = await createEventVoiceSurveyInTransaction({
      eventId: 'evt_123',
      collectionPhase: 'DURING',
      creationRequestId: '4fdd4f56-e9ab-4f7c-8258-bc95cb7d7294',
      targetCategory: SurveyTargetCategory.EVENT,
      targetName: 'Main Stage',
      surveyName: 'Main Stage pulse',
      questions: [{ prompt: 'How was it?' }],
    }, tx as never)

    expect(tx.survey.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_creationRequestId: {
        eventId: 'evt_123',
        creationRequestId: '4fdd4f56-e9ab-4f7c-8258-bc95cb7d7294',
      } },
    }))
    expect(result).toMatchObject({
      survey: { id: 'survey_existing' },
      target: { id: 'target_existing' },
      questions: [{ id: 'question_existing' }],
      publicLink: { id: 'link_existing' },
    })
    expect(tx.survey.create).not.toHaveBeenCalled()
    expect(tx.surveyTarget.create).not.toHaveBeenCalled()
    expect(tx.question.create).not.toHaveBeenCalled()
    expect(tx.publicSurveyLink.create).not.toHaveBeenCalled()
  })

  it('uses the canonical responseMode when Events enables typed answers', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123', locationId: 'loc_123', location: { accountId: 'acct_123', account: { accountType: 'EVENTS' } },
        }),
      },
      location: { findUnique: vi.fn() },
      surveyTarget: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'target_123', eventStructureItemId: 'structure_123' }) },
      eventStructureItem: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'structure_123', slug: 'event' }) },
      survey: { create: vi.fn().mockResolvedValue({ id: 'survey_123' }), update: vi.fn() },
      question: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'question_1', key: 'q1' }) },
      publicSurveyLink: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'link_123', token: 'token' }) },
    }

    await createEventVoiceSurveyInTransaction({
      eventId: 'evt_123',
      collectionPhase: 'DURING',
      targetCategory: SurveyTargetCategory.EVENT,
      targetName: 'Event-wide',
      surveyName: 'Attendee feedback',
      responseMode: 'VOICE_AND_TEXT',
      questions: [{ prompt: 'What worked?', required: true }],
    }, tx as never)

    expect(tx.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ responseMode: 'VOICE_AND_TEXT' }),
    })
  })

  it('links a second survey for the same active target kind and slug to the existing EventStructureItem', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123',
          locationId: 'loc_123',
          location: {
            accountId: 'acct_123',
            account: { accountType: 'EVENTS' },
          },
        }),
        update: vi.fn(),
      },
      location: {
        findUnique: vi.fn(),
      },
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValueOnce({
          id: 'structure_existing',
          slug: 'breakout-a',
        }),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      surveyTarget: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'target_existing' })
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({
          id: 'target_456',
          eventId: 'evt_123',
          eventStructureItemId: 'structure_existing',
          category: SurveyTargetCategory.SESSION,
          name: 'Breakout A',
          slug: 'breakout-a-2',
        }),
      },
      survey: {
        create: vi.fn().mockResolvedValue({
          id: 'survey_456',
          eventId: 'evt_123',
          surveyTargetId: 'target_456',
          name: 'Breakout Follow-up',
          status: EventStatus.DRAFT,
        }),
        update: vi.fn(),
      },
      question: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'question_1',
          key: 'breakout-a-2-rget_456-q1',
          label: 'Any follow-up?',
          order: 0,
        }),
      },
      publicSurveyLink: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'link_456',
          surveyId: 'survey_456',
          token: 'public-token-2',
          isActive: true,
        }),
      },
    }

    await createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        targetCategory: SurveyTargetCategory.SESSION,
        targetName: 'Breakout A',
        surveyName: 'Breakout Follow-up',
        questions: [{ prompt: 'Any follow-up?', order: 0, required: true }],
      },
      tx as never,
    )

    expect(tx.eventStructureItem.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 'evt_123',
        kind: EventStructureItemKind.SESSION,
        slug: 'breakout-a',
        isActive: true,
      },
      select: { id: true, slug: true },
    })
    expect(tx.eventStructureItem.create).not.toHaveBeenCalled()
    expect(tx.surveyTarget.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        eventStructureItemId: 'structure_existing',
        category: SurveyTargetCategory.SESSION,
        name: 'Breakout A',
        slug: 'breakout-a-2',
      }),
    })
  })

  it('creates a SurveyTarget linked to a selected EventStructureItem and snapshots its fields', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123',
          locationId: 'loc_123',
          location: {
            accountId: 'acct_123',
            account: { accountType: 'EVENTS' },
          },
        }),
        update: vi.fn(),
      },
      location: {
        findUnique: vi.fn(),
      },
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'structure_sponsor',
          eventId: 'evt_123',
          kind: EventStructureItemKind.SPONSOR_ACTIVATION,
          name: 'Sponsor Booth A',
          slug: 'sponsor-booth-a',
          description: 'Partner demo booth',
          locationId: 'loc_123',
          metadata: { sponsor: 'Acme' },
        }),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      surveyTarget: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'target_sponsor',
          eventId: 'evt_123',
          eventStructureItemId: 'structure_sponsor',
          category: SurveyTargetCategory.CUSTOM,
          name: 'Sponsor Booth A',
          slug: 'sponsor-booth-a',
        }),
      },
      survey: {
        create: vi.fn().mockResolvedValue({
          id: 'survey_sponsor',
          eventId: 'evt_123',
          surveyTargetId: 'target_sponsor',
          name: 'Sponsor Booth Survey',
          status: EventStatus.DRAFT,
        }),
        update: vi.fn(),
      },
      question: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'question_sponsor',
          key: 'sponsor-booth-a-sponsor-q1',
          label: 'How was the demo?',
          order: 0,
        }),
      },
      publicSurveyLink: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'link_sponsor',
          surveyId: 'survey_sponsor',
          token: 'public-token',
          isActive: true,
        }),
      },
    }

    const result = await createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        eventStructureItemId: 'structure_sponsor',
        surveyName: 'Sponsor Booth Survey',
        questions: [{ prompt: 'How was the demo?', order: 0, required: true }],
      },
      tx as never,
    )

    expect(tx.eventStructureItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'structure_sponsor',
        eventId: 'evt_123',
        isActive: true,
        event: {
          location: {
            accountId: 'acct_123',
          },
        },
      },
      select: {
        id: true,
        kind: true,
        name: true,
        slug: true,
        description: true,
        locationId: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        metadata: true,
      },
    })
    expect(tx.eventStructureItem.create).not.toHaveBeenCalled()
    expect(tx.surveyTarget.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        locationId: 'loc_123',
        eventStructureItemId: 'structure_sponsor',
        category: SurveyTargetCategory.CUSTOM,
        name: 'Sponsor Booth A',
        slug: 'sponsor-booth-a',
        description: 'Partner demo booth',
        metadata: { sponsor: 'Acme' },
        isActive: true,
      }),
    })
    expect(result.target.eventStructureItemId).toBe('structure_sponsor')
    expect(result.scope).toMatchObject({
      eventStructureItemId: 'structure_sponsor',
      targetLocationId: 'loc_123',
    })
  })

  it('rejects a selected EventStructureItem outside the Event/account scope', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123',
          locationId: 'loc_123',
          location: {
            accountId: 'acct_123',
            account: { accountType: 'EVENTS' },
          },
        }),
        update: vi.fn(),
      },
      location: {
        findUnique: vi.fn(),
      },
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      surveyTarget: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      survey: {
        create: vi.fn(),
        update: vi.fn(),
      },
      question: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      publicSurveyLink: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    }

    await expect(createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        eventStructureItemId: 'structure_other',
        surveyName: 'Invalid Structure Survey',
        questions: [{ prompt: 'Question?', order: 0, required: true }],
      },
      tx as never,
    )).rejects.toThrow('Event structure item not found for this event/account')

    expect(tx.surveyTarget.create).not.toHaveBeenCalled()
    expect(tx.survey.create).not.toHaveBeenCalled()
  })

  it('rejects non-EVENTS accounts before creating structure, target, survey, or public link rows', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123',
          locationId: 'loc_123',
          location: {
            accountId: 'acct_123',
            account: { accountType: 'RETAIL' },
          },
        }),
        update: vi.fn(),
      },
      location: {
        findUnique: vi.fn(),
      },
      eventStructureItem: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      surveyTarget: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      survey: {
        create: vi.fn(),
        update: vi.fn(),
      },
      question: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      publicSurveyLink: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    }

    await expect(createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        targetCategory: SurveyTargetCategory.SESSION,
        targetName: 'Breakout A',
        surveyName: 'Retail should not create event voice survey',
        questions: [{ prompt: 'Question?', order: 0, required: true }],
      },
      tx as never,
    )).rejects.toThrow('Event voice surveys are only available for EVENTS accounts')

    expect(tx.eventStructureItem.findFirst).not.toHaveBeenCalled()
    expect(tx.eventStructureItem.create).not.toHaveBeenCalled()
    expect(tx.surveyTarget.create).not.toHaveBeenCalled()
    expect(tx.survey.create).not.toHaveBeenCalled()
    expect(tx.publicSurveyLink.create).not.toHaveBeenCalled()
  })

  it('maps SurveyTarget categories to EventStructureItem kinds', () => {
    expect(mapSurveyTargetCategoryToEventStructureItemKind(SurveyTargetCategory.EVENT)).toBe(EventStructureItemKind.EVENT)
    expect(mapSurveyTargetCategoryToEventStructureItemKind(SurveyTargetCategory.SESSION)).toBe(EventStructureItemKind.SESSION)
    expect(mapSurveyTargetCategoryToEventStructureItemKind(SurveyTargetCategory.LOCATION)).toBe(EventStructureItemKind.AREA)
    expect(mapSurveyTargetCategoryToEventStructureItemKind(SurveyTargetCategory.CUSTOM)).toBe(EventStructureItemKind.CUSTOM_TOUCHPOINT)
  })

  it('maps EventStructureItem kinds to SurveyTarget categories', () => {
    expect(mapEventStructureItemKindToSurveyTargetCategory(EventStructureItemKind.EVENT)).toBe(SurveyTargetCategory.EVENT)
    expect(mapEventStructureItemKindToSurveyTargetCategory(EventStructureItemKind.SESSION)).toBe(SurveyTargetCategory.SESSION)
    expect(mapEventStructureItemKindToSurveyTargetCategory(EventStructureItemKind.AREA)).toBe(SurveyTargetCategory.LOCATION)
    expect(mapEventStructureItemKindToSurveyTargetCategory(EventStructureItemKind.SPONSOR_ACTIVATION)).toBe(SurveyTargetCategory.CUSTOM)
    expect(mapEventStructureItemKindToSurveyTargetCategory(EventStructureItemKind.CUSTOM_TOUCHPOINT)).toBe(SurveyTargetCategory.CUSTOM)
  })

  it('persists selected question voice settings on the Survey when provided', async () => {
    const tx = {
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_123',
          locationId: 'loc_123',
          location: {
            accountId: 'acct_123',
            account: { accountType: 'EVENTS' },
          },
        }),
        update: vi.fn().mockResolvedValue({ id: 'evt_123' }),
      },
      location: {
        findUnique: vi.fn(),
      },
      surveyTarget: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'target_123',
          eventId: 'evt_123',
          eventStructureItemId: 'structure_123',
          category: SurveyTargetCategory.EVENT,
          name: 'Event-wide',
          slug: 'event-wide',
        }),
      },
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'structure_123',
          eventId: 'evt_123',
          kind: EventStructureItemKind.EVENT,
          name: 'Event-wide',
          slug: 'event-wide',
        }),
      },
      survey: {
        create: vi.fn().mockResolvedValue({
          id: 'survey_123',
          eventId: 'evt_123',
          surveyTargetId: 'target_123',
          name: 'Event Feedback',
          status: EventStatus.DRAFT,
        }),
        update: vi.fn(),
      },
      question: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'question_1',
          key: 'event-wide-rget_123-q1',
          label: 'How was the event?',
          order: 0,
        }),
      },
      publicSurveyLink: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'link_123',
          surveyId: 'survey_123',
          token: 'public-token',
          isActive: true,
        }),
      },
    }

    await createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        targetCategory: SurveyTargetCategory.EVENT,
        targetName: 'Event-wide',
        surveyName: 'Event Feedback',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
        questions: [{ prompt: 'How was the event?', order: 0, required: true }],
      },
      tx as never,
    )

    expect(tx.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
      }),
    })
    expect(tx.event.update).not.toHaveBeenCalled()
  })

  it('stores different voices on sibling surveys without updating the parent Event voice', async () => {
    function makeTx(surveyId: string) {
      return {
        event: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'evt_123',
            locationId: 'loc_123',
            location: {
              accountId: 'acct_123',
              account: { accountType: 'EVENTS' },
            },
          }),
          update: vi.fn(),
        },
        location: {
          findUnique: vi.fn(),
        },
        surveyTarget: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: `target_${surveyId}`,
            eventId: 'evt_123',
            eventStructureItemId: `structure_${surveyId}`,
            category: SurveyTargetCategory.SESSION,
            name: `Session ${surveyId}`,
            slug: `session-${surveyId}`,
          }),
        },
        eventStructureItem: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: `structure_${surveyId}`,
            eventId: 'evt_123',
            kind: EventStructureItemKind.SESSION,
            name: `Session ${surveyId}`,
            slug: `session-${surveyId}`,
          }),
        },
        survey: {
          create: vi.fn().mockResolvedValue({
            id: surveyId,
            eventId: 'evt_123',
            surveyTargetId: `target_${surveyId}`,
            name: `Survey ${surveyId}`,
            status: EventStatus.DRAFT,
          }),
          update: vi.fn(),
        },
        question: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: `question_${surveyId}`,
            key: `session-${surveyId}-q1`,
            label: 'Question?',
            order: 0,
          }),
        },
        publicSurveyLink: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: `link_${surveyId}`,
            surveyId,
            token: `token-${surveyId}`,
            isActive: true,
          }),
        },
      }
    }

    const txA = makeTx('survey_a')
    const txB = makeTx('survey_b')

    await createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        targetCategory: SurveyTargetCategory.SESSION,
        targetName: 'Session A',
        surveyName: 'Survey A',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
        questions: [{ prompt: 'Question A?', order: 0, required: true }],
      },
      txA as never,
    )
    await createEventVoiceSurveyInTransaction(
      {
        eventId: 'evt_123',
        collectionPhase: 'DURING',
        targetCategory: SurveyTargetCategory.SESSION,
        targetName: 'Session B',
        surveyName: 'Survey B',
        ttsProvider: 'google',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-AU',
        questions: [{ prompt: 'Question B?', order: 0, required: true }],
      },
      txB as never,
    )

    expect(txA.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
      }),
    })
    expect(txB.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ttsProvider: 'google',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-AU',
      }),
    })
    expect(txA.event.update).not.toHaveBeenCalled()
    expect(txB.event.update).not.toHaveBeenCalled()
  })
})

const AVAILABILITY_NOW = new Date('2026-09-17T16:00:00.000Z')

function availabilityRecord(overrides: Partial<SurveyAvailabilityRecord> = {}): SurveyAvailabilityRecord {
  return {
    availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY,
    availabilityTimezone: null,
    availabilityOpensAt: null,
    availabilityClosesAt: null,
    availabilityOpenAnchor: null,
    availabilityCloseAnchor: null,
    availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null,
    availabilityOverride: null,
    ...overrides,
  }
}

describe('canonical Survey availability', () => {
  it('keeps existing Surveys open immediately and resolves custom future, active, and closed windows', () => {
    expect(resolveSurveyAvailability({ survey: availabilityRecord(), now: AVAILABILITY_NOW }).state).toBe('OPEN')
    const custom = availabilityRecord({
      availabilityMode: SurveyAvailabilityMode.CUSTOM_WINDOW,
      availabilityTimezone: 'America/New_York',
      availabilityOpensAt: new Date('2026-09-17T17:00:00.000Z'),
      availabilityClosesAt: new Date('2026-09-17T19:00:00.000Z'),
    })
    expect(resolveSurveyAvailability({ survey: custom, now: AVAILABILITY_NOW }).state).toBe('NOT_YET_OPEN')
    expect(resolveSurveyAvailability({ survey: custom, now: new Date('2026-09-17T18:00:00.000Z') }).state).toBe('OPEN')
    expect(resolveSurveyAvailability({ survey: custom, now: new Date('2026-09-17T19:00:00.000Z') }).state).toBe('CLOSED')
  })

  it('validates custom ordering and IANA timezone input', () => {
    expect(() => normalizeSurveyAvailabilityInput({
      mode: 'CUSTOM_WINDOW',
      timezone: 'Not/A_Zone',
      opensAt: '2026-09-17T17:00:00.000Z',
      closesAt: '2026-09-17T19:00:00.000Z',
    })).toThrow('A valid IANA timezone is required')
    expect(() => normalizeSurveyAvailabilityInput({
      mode: 'CUSTOM_WINDOW',
      timezone: 'UTC',
      opensAt: '2026-09-17T19:00:00.000Z',
      closesAt: '2026-09-17T17:00:00.000Z',
    })).toThrow('Opening time must be before closing time')
  })

  it('derives negative and positive offsets from current Event Area timing', () => {
    const survey = availabilityRecord({
      availabilityMode: SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA,
      availabilityTimezone: 'America/Chicago',
      availabilityOpenAnchor: SurveyAvailabilityAnchor.END,
      availabilityCloseAnchor: SurveyAvailabilityAnchor.END,
      availabilityOpenOffsetMinutes: -10,
      availabilityCloseOffsetMinutes: 120,
    })
    const item = {
      startsAt: new Date('2026-09-17T15:00:00.000Z'),
      endsAt: new Date('2026-09-17T17:00:00.000Z'),
      timezone: 'America/Chicago',
    }
    const first = resolveSurveyAvailability({ survey, eventStructureItem: item, now: AVAILABILITY_NOW })
    expect(first.effectiveOpensAt?.toISOString()).toBe('2026-09-17T16:50:00.000Z')
    expect(first.effectiveClosesAt?.toISOString()).toBe('2026-09-17T19:00:00.000Z')

    const changed = resolveSurveyAvailability({
      survey,
      eventStructureItem: { ...item, endsAt: new Date('2026-09-17T16:00:00.000Z') },
      now: AVAILABILITY_NOW,
    })
    expect(changed.state).toBe('OPEN')
    expect(changed.effectiveOpensAt?.toISOString()).toBe('2026-09-17T15:50:00.000Z')
  })

  it('reports missing Event Area timing instead of silently opening', () => {
    const survey = availabilityRecord({
      availabilityMode: SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA,
      availabilityTimezone: 'UTC',
      availabilityOpenAnchor: SurveyAvailabilityAnchor.START,
      availabilityCloseAnchor: SurveyAvailabilityAnchor.END,
      availabilityOpenOffsetMinutes: 0,
      availabilityCloseOffsetMinutes: 30,
    })
    const result = resolveSurveyAvailability({
      survey,
      eventStructureItem: { startsAt: null, endsAt: null, timezone: 'UTC' },
      now: AVAILABILITY_NOW,
    })
    expect(result.state).toBe('INVALID')
    expect(result.issues).toEqual(['Add a session date and time to enable automatic survey scheduling. You can still publish this survey manually.'])
  })

  it('uses event timing for an area/custom survey when explicitly allowed, including multi-day follow-up', () => {
    const survey = availabilityRecord({
      availabilityMode: SurveyAvailabilityMode.RELATIVE_TO_EVENT_AREA,
      availabilityTimezone: 'UTC',
      availabilityOpenAnchor: SurveyAvailabilityAnchor.START,
      availabilityCloseAnchor: SurveyAvailabilityAnchor.END,
      availabilityOpenOffsetMinutes: -60,
      availabilityCloseOffsetMinutes: 3 * 24 * 60,
    })
    const result = resolveSurveyAvailability({
      survey,
      eventTiming: { startsAt: new Date('2026-09-17T15:00:00.000Z'), endsAt: new Date('2026-09-17T17:00:00.000Z'), timezone: 'UTC' },
      allowEventTimingFallback: true,
      now: AVAILABILITY_NOW,
    })
    expect(result.effectiveOpensAt?.toISOString()).toBe('2026-09-17T14:00:00.000Z')
    expect(result.effectiveClosesAt?.toISOString()).toBe('2026-09-20T17:00:00.000Z')
  })

  it('keeps lifecycle, link, target, questions, and manual overrides authoritative', () => {
    const ready = {
      survey: { ...availabilityRecord(), status: EventStatus.ACTIVE },
      publicLink: { isActive: true, token: 'token' },
      targetActive: true,
      questionCount: 1,
      now: AVAILABILITY_NOW,
    }
    expect(resolveSurveyLaunchReadiness(ready).responseEligible).toBe(true)
    expect(resolveSurveyLaunchReadiness({ ...ready, survey: { ...ready.survey, status: EventStatus.DRAFT } }).issues).toContain('Survey is unpublished')
    expect(resolveSurveyLaunchReadiness({ ...ready, survey: { ...ready.survey, status: EventStatus.COMPLETED } }).issues).toContain('Survey collection is complete')
    expect(resolveSurveyLaunchReadiness({ ...ready, survey: { ...ready.survey, status: EventStatus.COMPLETED } }).issues).not.toContain('Survey is unpublished')
    expect(resolveSurveyLaunchReadiness({ ...ready, publicLink: { isActive: false, token: 'token' } }).issues).toContain('Public survey link is inactive')
    expect(resolveSurveyLaunchReadiness({ ...ready, targetActive: false }).issues).toContain('Event Area is inactive')
    expect(resolveSurveyLaunchReadiness({ ...ready, questionCount: 0 }).issues).toContain('Survey has no questions')
    expect(resolveSurveyAvailability({ survey: availabilityRecord({ availabilityOverride: SurveyAvailabilityOverride.FORCE_CLOSED }), now: AVAILABILITY_NOW }).state).toBe('CLOSED')
  })
})

describe('event voice survey lifecycle services', () => {
  function scopedSurvey(overrides: Record<string, unknown> = {}) {
    return {
      id: 'survey_123',
      surveyTargetId: 'target_123',
      event: {
        location: {
          account: {
            accountType: 'EVENTS',
          },
        },
      },
      publicSurveyLinks: [{ id: 'link_123' }],
      _count: { responses: 0 },
      ...overrides,
    }
  }

  it('publishes a draft survey by activating the survey, target, and public link', async () => {
    const tx = {
      survey: {
        update: vi.fn().mockResolvedValue({ id: 'survey_123', status: EventStatus.ACTIVE }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_123', isActive: true }) },
      publicSurveyLink: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([{
          id: 'link_123',
          metadata: { assignmentState: 'CURRENT' },
          surveyTarget: { publicSurveyLinks: [{ id: 'link_123', metadata: { assignmentState: 'CURRENT' } }] },
        }]),
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: 'link_123', isActive: true }),
      },
    }
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey()) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await activateEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)

    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_123' },
      data: { status: EventStatus.ACTIVE },
    })
    expect(tx.surveyTarget.update).toHaveBeenCalledWith({
      where: { id: 'target_123' },
      data: { isActive: true },
    })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['link_123'] } },
      data: { isActive: true },
    })
  })

  it('creates an active public link when publishing a survey without one', async () => {
    const tx = {
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey_123', status: EventStatus.ACTIVE }) },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_123', isActive: true }) },
      publicSurveyLink: {
        updateMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'link_new', isActive: true }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    }
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey({ publicSurveyLinks: [] })) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await activateEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)

    expect(tx.publicSurveyLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        token: expect.any(String),
        isActive: true,
      }),
    })
  })

  it('unpublishes a survey by making it draft and disabling the public link', async () => {
    const tx = {
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey_123', status: EventStatus.DRAFT }) },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_123', isActive: true }) },
      publicSurveyLink: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'link_123', isActive: false }),
      },
    }
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey()) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await unpublishEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)

    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_123' },
      data: { status: EventStatus.DRAFT },
    })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({
      where: { surveyId: 'survey_123' },
      data: { isActive: false },
    })
  })

  it('archives a survey by preserving history and disabling launch', async () => {
    const tx = {
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey_123', status: EventStatus.ARCHIVED }) },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_123', isActive: false }) },
      publicSurveyLink: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'link_123', isActive: false }),
      },
    }
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey()) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await archiveEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)

    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_123' },
      data: { status: EventStatus.ARCHIVED },
    })
    expect(tx.surveyTarget.update).toHaveBeenCalledWith({
      where: { id: 'target_123' },
      data: { isActive: false },
    })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({
      where: { surveyId: 'survey_123' },
      data: { isActive: false },
    })
  })

  it('blocks deleting a survey that already has responses', async () => {
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey({ _count: { responses: 2 } })) },
      response: { count: vi.fn().mockResolvedValue(2) },
      $transaction: vi.fn(),
    }

    await expect(deleteEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)).rejects.toMatchObject({
      status: 409,
      message: 'This survey has responses, so it cannot be deleted. Archive it to preserve history.',
    } satisfies Partial<EventVoiceSurveyLifecycleError>)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('deletes an unassigned draft without applying deployment lifecycle guards', async () => {
    const tx = {
      question: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      survey: { delete: vi.fn().mockResolvedValue({ id: 'survey_123' }), count: vi.fn() },
      publicSurveyLink: { count: vi.fn() },
      surveyTarget: { delete: vi.fn() },
    }
    const db = {
      survey: {
        findFirst: vi.fn().mockResolvedValue(scopedSurvey({
          surveyTargetId: null,
          publicSurveyLinks: [],
          status: EventStatus.DRAFT,
          _count: { responses: 0 },
        })),
      },
      response: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await expect(deleteEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)).resolves.toMatchObject({ survey: { id: 'survey_123' } })

    expect(tx.question.deleteMany).toHaveBeenCalledWith({ where: { surveyId: 'survey_123' } })
    expect(tx.survey.delete).toHaveBeenCalledWith({ where: { id: 'survey_123' } })
    expect(tx.survey.count).not.toHaveBeenCalled()
    expect(tx.publicSurveyLink.count).not.toHaveBeenCalled()
    expect(tx.surveyTarget.delete).not.toHaveBeenCalled()
  })

  it('deletes an assigned no-response draft and removes its empty target', async () => {
    const tx = {
      question: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      survey: {
        delete: vi.fn().mockResolvedValue({ id: 'survey_123' }),
        count: vi.fn().mockResolvedValue(0),
      },
      publicSurveyLink: { count: vi.fn().mockResolvedValue(0) },
      surveyTarget: { delete: vi.fn().mockResolvedValue({ id: 'target_123' }) },
    }
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey()) },
      response: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await deleteEventVoiceSurvey({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_123',
    }, db as never)

    expect(tx.question.deleteMany).toHaveBeenCalledWith({ where: { surveyId: 'survey_123' } })
    expect(tx.survey.delete).toHaveBeenCalledWith({ where: { id: 'survey_123' } })
    expect(tx.surveyTarget.delete).toHaveBeenCalledWith({ where: { id: 'target_123' } })
  })

  it('preserves a target still used by another survey deployment', async () => {
    const tx = {
      question: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      survey: {
        delete: vi.fn().mockResolvedValue({ id: 'survey_123' }),
        count: vi.fn().mockResolvedValue(0),
      },
      publicSurveyLink: { count: vi.fn().mockResolvedValue(1) },
      surveyTarget: { delete: vi.fn() },
    }
    const db = {
      survey: { findFirst: vi.fn().mockResolvedValue(scopedSurvey()) },
      response: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await deleteEventVoiceSurvey({ eventId: 'evt_123', accountId: 'acct_123', surveyId: 'survey_123' }, db as never)

    expect(tx.publicSurveyLink.count).toHaveBeenCalledWith({ where: { surveyTargetId: 'target_123' } })
    expect(tx.surveyTarget.delete).not.toHaveBeenCalled()
  })
})
