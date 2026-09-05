import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveyAvailabilityValidationError } from '@/lib/survey-availability'
import { DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION } from '@/lib/event-signage'

const requireAccountAdminMock = vi.fn()
const createEventVoiceSurveyMock = vi.fn()
const activateEventVoiceSurveyMock = vi.fn()
const unpublishEventVoiceSurveyMock = vi.fn()
const archiveEventVoiceSurveyMock = vi.fn()
const restoreArchivedEventVoiceSurveyMock = vi.fn()
const deleteEventVoiceSurveyMock = vi.fn()
const ensureSurveyQuestionAudioForSurveyMock = vi.fn()
const createBulkSurveyConfigurationForSessionsMock = vi.fn()
const loadEventSurveyWorkspacePackageMock = vi.fn()

const prismaMock = {
  event: {
    findFirst: vi.fn(),
  },
  surveyTarget: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

vi.mock('@/lib/event-voice-surveys', () => ({
  activateEventVoiceSurvey: activateEventVoiceSurveyMock,
  archiveEventVoiceSurvey: archiveEventVoiceSurveyMock,
  createEventVoiceSurvey: createEventVoiceSurveyMock,
  deleteEventVoiceSurvey: deleteEventVoiceSurveyMock,
  restoreArchivedEventVoiceSurvey: restoreArchivedEventVoiceSurveyMock,
  unpublishEventVoiceSurvey: unpublishEventVoiceSurveyMock,
  EventVoiceSurveyLifecycleError: class EventVoiceSurveyLifecycleError extends Error {
    status: number

    constructor(message: string, status = 400) {
      super(message)
      this.name = 'EventVoiceSurveyLifecycleError'
      this.status = status
    }
  },
}))

vi.mock('@/lib/question-audio', () => ({
  ensureSurveyQuestionAudioForSurvey: ensureSurveyQuestionAudioForSurveyMock,
}))

vi.mock('@/lib/event-listening-plan', () => ({
  createBulkSurveyConfigurationForSessions: createBulkSurveyConfigurationForSessionsMock,
}))

vi.mock('@/lib/event-survey-workspace', () => ({
  loadEventSurveyWorkspacePackage: loadEventSurveyWorkspacePackageMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const voiceSurveyPackage = {
  id: 'evt_123',
  name: 'WEC Voice Survey',
  status: 'ACTIVE',
  eventType: 'SURVEY',
  isActive: true,
  ttsProvider: 'google',
  ttsVoice: 'en-US-Neural2-F',
  ttsLocale: 'en-US',
  location: {
    id: 'loc_123',
    name: 'Main Event',
    slug: 'main-event',
    account: {
      accountType: 'EVENTS',
    },
  },
  surveys: [
    {
      id: 'survey_123',
      eventId: 'evt_123',
      surveyTargetId: 'target_123',
      name: 'Attendee Voice Survey',
      description: null,
      collectionPhase: 'PRE',
      responseMode: 'VOICE_ONLY',
      status: 'ACTIVE',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      settingsJson: null,
      surveyTarget: {
        id: 'target_123',
        eventId: 'evt_123',
        locationId: null,
        category: 'EVENT',
        name: 'Main Stage',
        slug: 'main-stage',
        description: null,
        isActive: true,
      },
      questions: [
        {
          id: 'question_1',
          key: 'q1',
          label: 'What worked best?',
          ttsText: null,
          order: 0,
          required: true,
        },
        {
          id: 'question_2',
          key: 'q2',
          label: 'What could improve?',
          ttsText: null,
          order: 1,
          required: true,
        },
      ],
      publicSurveyLinks: [
        {
          id: 'link_123',
          surveyId: 'survey_123',
          token: 'token 123',
          slug: null,
          isActive: true,
          expiresAt: null,
          metadata: null,
          surveyTarget: {
            id: 'target_123',
            eventId: 'evt_123',
            locationId: null,
            category: 'EVENT',
            name: 'Main Stage',
            slug: 'main-stage',
            description: null,
            isActive: true,
          },
        },
      ],
      _count: {
        responses: 3,
      },
    },
    {
      id: 'survey_456',
      eventId: 'evt_123',
      surveyTargetId: 'target_456',
      name: 'Session Feedback',
      description: 'Breakout session survey',
      collectionPhase: 'DURING',
      responseMode: 'VOICE_ONLY',
      status: 'DRAFT',
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      settingsJson: null,
      surveyTarget: {
        id: 'target_456',
        eventId: 'evt_123',
        locationId: null,
        category: 'SESSION',
        name: 'Breakout A',
        slug: 'breakout-a',
        description: null,
        isActive: true,
      },
      questions: [
        {
          id: 'question_3',
          key: 'q3',
          label: 'How was the breakout?',
          ttsText: null,
          order: 2,
          required: true,
        },
      ],
      publicSurveyLinks: [
        {
          id: 'link_456',
          surveyId: 'survey_456',
          token: 'session token',
          slug: null,
          isActive: true,
          expiresAt: null,
          metadata: null,
          surveyTarget: {
            id: 'target_456',
            eventId: 'evt_123',
            locationId: null,
            category: 'SESSION',
            name: 'Breakout A',
            slug: 'breakout-a',
            description: null,
            isActive: true,
          },
        },
      ],
      _count: {
        responses: 1,
      },
    },
  ],
}

describe('POST /api/app/events/[eventId]/voice-surveys', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.surveyTarget.findMany.mockResolvedValue([
      { id: 'target_123', metadata: null },
      { id: 'target_456', metadata: { listeningPoint: true } },
    ])

    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme Events' },
    })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      location: {
        account: {
          accountType: 'EVENTS',
        },
      },
    })
    prismaMock.$transaction.mockImplementation(async (callback: (client: any) => Promise<unknown>) => callback({
      event: { update: vi.fn().mockResolvedValue({ id: 'evt_123' }) },
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey_123' }) },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_123' }) },
      publicSurveyLink: { update: vi.fn().mockResolvedValue({ id: 'link_123' }) },
      question: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }))
    loadEventSurveyWorkspacePackageMock.mockImplementation(() => prismaMock.event.findFirst())
    createEventVoiceSurveyMock.mockResolvedValue({
      target: { id: 'target_123', eventId: 'evt_123', slug: 'main-stage' },
      survey: { id: 'survey_123', eventId: 'evt_123', surveyTargetId: 'target_123' },
      questions: [{ id: 'question_123', key: 'q-1', label: 'How was the session?' }],
      publicLink: {
        id: 'link_123',
        surveyId: 'survey_123',
        token: 'public token',
        slug: null,
        isActive: true,
      },
      questionAudioStatus: 'READY',
    })
    createBulkSurveyConfigurationForSessionsMock.mockResolvedValue({
      target: { id: 'target_123' },
      survey: { id: 'survey_bulk', responseMode: 'VOICE_ONLY' },
      questions: [{ id: 'question_123' }],
      publicLink: { id: 'link_123', token: 'bulk-token', isActive: false },
      counts: { requested: 2, attached: 2, alreadyAttached: 0, skipped: 0 },
      questionAudioStatus: 'READY',
    })
  })

  it('creates one full survey configuration for many selected sessions through the canonical bulk service', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
      json: async () => ({
        sessionIds: ['session_1', 'session_2'],
        creationRequestId: 'b758d4da-99f8-4b7c-a454-4ae1a8f56940',
        surveyName: 'Session Feedback',
        collectionPhase: 'DURING',
        questions: [{ prompt: 'How was this session?' }],
      }),
    } as never, { params: { eventId: 'evt_123' } })

    expect(response.status).toBe(201)
    expect(createBulkSurveyConfigurationForSessionsMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acct_123',
      eventId: 'evt_123',
      sessionIds: ['session_1', 'session_2'],
      survey: expect.objectContaining({ surveyName: 'Session Feedback' }),
    }))
    expect(createEventVoiceSurveyMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ data: { counts: { requested: 2, attached: 2 } } })
  })

  it('creates a direct speaker-targeted survey using the canonical speaker id', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
      json: async () => ({
        speakerId: 'speaker_1',
        targetCategory: 'SPEAKER',
        surveyName: 'Speaker feedback',
        collectionPhase: 'POST',
        questions: [{ prompt: 'How was the speaker?' }],
      }),
    } as never, { params: { eventId: 'evt_123' } })

    expect(response.status).toBe(201)
    expect(createEventVoiceSurveyMock).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt_123', speakerId: 'speaker_1', targetCategory: 'SPEAKER',
    }))
  })

  it('returns a token-based kiosk path for the public survey link', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          targetCategory: 'EVENT',
          targetName: 'Main Stage',
          surveyName: 'Main Stage Feedback',
          collectionPhase: 'DURING',
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Studio-C',
          ttsLocale: 'en-US',
          questions: [{ prompt: 'How was the session?', type: 'RATING_1_TO_5', required: false }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(201)
    expect(createEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      collectionPhase: 'DURING',
      creationRequestId: undefined,
      eventStructureItemId: undefined,
      targetCategory: 'EVENT',
      targetName: 'Main Stage',
      targetDescription: undefined,
      targetMetadata: undefined,
      locationId: undefined,
      surveyName: 'Main Stage Feedback',
      surveyDescription: undefined,
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      questions: [
        {
          prompt: 'How was the session?',
          helperText: undefined,
          type: 'RATING_1_TO_5',
          required: false,
          order: undefined,
        },
      ],
    })
    expect(ensureSurveyQuestionAudioForSurveyMock).not.toHaveBeenCalled()

    const json = await response.json()
    expect(json.data.publicLink).toMatchObject({
      id: 'link_123',
      token: 'public token',
      kioskPath: '/kiosk?token=public%20token',
    })
    expect(json.data.questionAudioStatus).toBe('READY')
  })

  it('rejects a malformed creation idempotency key before writing', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          creationRequestId: 'not-a-uuid',
          targetCategory: 'EVENT',
          targetName: 'Main Stage',
          surveyName: 'Invalid retry key',
          questions: [{ prompt: 'How was the session?' }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(400)
    expect(createEventVoiceSurveyMock).not.toHaveBeenCalled()
  })

  it('passes validated relative availability to canonical Survey creation', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const availability = {
      mode: 'RELATIVE_TO_EVENT_AREA',
      timezone: 'America/New_York',
      openAnchor: 'END',
      closeAnchor: 'END',
      openOffsetMinutes: -10,
      closeOffsetMinutes: 120,
      override: null,
    }

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          eventStructureItemId: 'structure_session',
          surveyName: 'Session pulse',
          collectionPhase: 'DURING',
          questions: [{ prompt: 'How was the session?', type: 'RATING_1_TO_5' }],
          availability,
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(201)
    expect(createEventVoiceSurveyMock).toHaveBeenCalledWith(expect.objectContaining({ availability }))
  })

  it('returns canonical custom-availability validation errors', async () => {
    createEventVoiceSurveyMock.mockRejectedValueOnce(
      new SurveyAvailabilityValidationError('Opening time must be before closing time'),
    )
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          eventStructureItemId: 'structure_session',
          surveyName: 'Session pulse',
          collectionPhase: 'DURING',
          questions: [{ prompt: 'How was the session?' }],
          availability: {
            mode: 'CUSTOM_WINDOW',
            timezone: 'UTC',
            opensAt: '2026-09-17T19:00:00.000Z',
            closesAt: '2026-09-17T17:00:00.000Z',
          },
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Opening time must be before closing time' })
    expect(createEventVoiceSurveyMock).toHaveBeenCalledTimes(1)
  })

  it('returns a real core-transaction failure without reporting success', async () => {
    createEventVoiceSurveyMock.mockRejectedValueOnce(new Error('Database transaction failed'))
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          creationRequestId: '4fdd4f56-e9ab-4f7c-8258-bc95cb7d7294',
          targetCategory: 'EVENT',
          targetName: 'Main Stage',
          surveyName: 'Transaction failure',
          collectionPhase: 'DURING',
          questions: [{ prompt: 'How was the session?' }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Database transaction failed' })
    expect(ensureSurveyQuestionAudioForSurveyMock).not.toHaveBeenCalled()
  })

  it('accepts eventStructureItemId for existing Event Structure collection points', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          eventStructureItemId: 'structure_session',
          surveyName: 'Opening Keynote Feedback',
          collectionPhase: 'DURING',
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Studio-C',
          ttsLocale: 'en-US',
          questions: [{ prompt: 'How was the keynote?' }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(201)
    expect(createEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      collectionPhase: 'DURING',
      creationRequestId: undefined,
      eventStructureItemId: 'structure_session',
      targetCategory: undefined,
      targetName: undefined,
      targetDescription: undefined,
      targetMetadata: undefined,
      locationId: undefined,
      surveyName: 'Opening Keynote Feedback',
      surveyDescription: undefined,
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      questions: [
        {
          prompt: 'How was the keynote?',
          helperText: undefined,
          required: undefined,
          order: undefined,
        },
      ],
    })
  })

  it('rejects unsupported question types before creating survey rows', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          targetCategory: 'EVENT',
          targetName: 'Main Stage',
          surveyName: 'Invalid Survey',
          questions: [{ prompt: 'Choose yes or no', type: 'BOOLEAN' }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Validation failed' })
    expect(createEventVoiceSurveyMock).not.toHaveBeenCalled()
  })

  it('rejects POST for non-EVENTS account types before creating survey rows', async () => {
    const { POST } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    for (const accountType of ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined]) {
      prismaMock.event.findFirst.mockResolvedValueOnce({
        id: 'evt_123',
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        location: {
          account: {
            accountType,
          },
        },
      })

      const response = await POST(
        {
          nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
          json: async () => ({
            targetCategory: 'EVENT',
            targetName: 'Main Stage',
            surveyName: 'Main Stage Feedback',
            collectionPhase: 'DURING',
            questions: [{ prompt: 'How was the session?' }],
          }),
        } as never,
        { params: { eventId: 'evt_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.error).toBe('Event voice surveys are only available for EVENTS accounts')
    }

    expect(createEventVoiceSurveyMock).not.toHaveBeenCalled()
    expect(ensureSurveyQuestionAudioForSurveyMock).not.toHaveBeenCalled()
  })

  it('loads all account-scoped event voice surveys for an event', async () => {
    prismaMock.event.findFirst.mockResolvedValue(voiceSurveyPackage)

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(loadEventSurveyWorkspacePackageMock).toHaveBeenCalledWith('evt_123', 'acct_123')
    expect(json.data.event).toMatchObject({
      id: 'evt_123',
      name: 'WEC Voice Survey',
      ttsVoice: 'en-US-Neural2-F',
    })
    expect(json.data.publicLink).toMatchObject({
      id: 'link_123',
      kioskPath: '/kiosk?token=token%20123',
    })
    expect(json.data.surveys).toHaveLength(2)
    expect(json.data.surveys[0]).toMatchObject({
      id: 'survey_123',
      name: 'Attendee Voice Survey',
      collectionPhase: 'PRE',
      responseCount: 3,
      publicLink: {
        id: 'link_123',
        kioskPath: '/kiosk?token=token%20123',
      },
    })
    expect(json.data.surveys[1]).toMatchObject({
      id: 'survey_456',
      name: 'Session Feedback',
      collectionPhase: 'DURING',
      responseCount: 1,
      target: {
        category: 'SESSION',
        name: 'Breakout A',
      },
      publicLink: {
        id: 'link_456',
        kioskPath: '/kiosk?token=session%20token',
      },
    })
    expect(json.data.deployments).toHaveLength(2)
  })

  it('returns unassigned draft and active surveys alongside an assigned ready deployment', async () => {
    const unassignedDraft = {
      ...voiceSurveyPackage.surveys[0],
      id: 'survey_unassigned_draft',
      surveyTargetId: null,
      name: 'Unassigned draft',
      status: 'DRAFT',
      surveyTarget: null,
      questions: [],
      publicSurveyLinks: [],
      _count: { responses: 0 },
    }
    const unassignedActive = {
      ...voiceSurveyPackage.surveys[0],
      id: 'survey_unassigned_active',
      surveyTargetId: null,
      name: 'Unassigned active',
      status: 'ACTIVE',
      surveyTarget: null,
      publicSurveyLinks: [],
      _count: { responses: 0 },
    }
    loadEventSurveyWorkspacePackageMock.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [unassignedDraft, unassignedActive, voiceSurveyPackage.surveys[0]],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET({
      nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
    } as never, { params: { eventId: 'evt_123' } })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(loadEventSurveyWorkspacePackageMock).toHaveBeenCalledWith('evt_123', 'acct_123')
    expect(json.data.surveys.map((survey: { id: string }) => survey.id)).toEqual([
      'survey_unassigned_draft',
      'survey_unassigned_active',
      'survey_123',
    ])
    expect(json.data.surveys[0]).toMatchObject({
      id: 'survey_unassigned_draft',
      surveyTargetId: null,
      status: 'DRAFT',
      target: null,
      publicLink: null,
    })
    expect(json.data.deployments).toHaveLength(3)

    const draftDeployment = json.data.deployments.find((deployment: { surveyId: string }) => deployment.surveyId === 'survey_unassigned_draft')
    expect(draftDeployment).toMatchObject({
      target: null,
      publicLink: null,
      readiness: { responseEligible: false },
    })
    expect(draftDeployment.readiness.issues).toEqual(expect.arrayContaining([
      'Survey is not assigned',
      'Survey is unpublished',
      'Public survey link is missing',
      'Survey has no questions',
    ]))

    const activeDeployment = json.data.deployments.find((deployment: { surveyId: string }) => deployment.surveyId === 'survey_unassigned_active')
    expect(activeDeployment).toMatchObject({
      target: null,
      publicLink: null,
      readiness: { responseEligible: false },
    })
    expect(activeDeployment.readiness.issues).toEqual(expect.arrayContaining([
      'Survey is not assigned',
      'Public survey link is missing',
    ]))

    expect(json.data.deployments.find((deployment: { surveyId: string }) => deployment.surveyId === 'survey_123')).toMatchObject({
      target: { id: 'target_123', name: 'Main Stage' },
      publicLink: { id: 'link_123', isActive: true },
      readiness: { responseEligible: true, issues: [] },
    })
  })

  it('exposes every target-specific public link to the existing QR deployment surface', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [{
        ...voiceSurveyPackage.surveys[1],
        status: 'ACTIVE',
        publicSurveyLinks: [
          {
            ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0],
            id: 'link_breakout_a',
            token: 'breakout-a',
            surveyTarget: voiceSurveyPackage.surveys[1].surveyTarget,
          },
          {
            ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0],
            id: 'link_breakout_b',
            token: 'breakout-b',
            surveyTarget: {
              ...voiceSurveyPackage.surveys[1].surveyTarget,
              id: 'target_breakout_b',
              name: 'Breakout B',
              slug: 'breakout-b',
            },
          },
        ],
      }],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme') } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.surveys).toHaveLength(1)
    expect(json.data.deployments).toEqual([
      expect.objectContaining({ surveyId: 'survey_456', target: expect.objectContaining({ name: 'Breakout A' }), publicLink: expect.objectContaining({ kioskPath: '/kiosk?token=breakout-a' }) }),
      expect.objectContaining({ surveyId: 'survey_456', target: expect.objectContaining({ name: 'Breakout B' }), publicLink: expect.objectContaining({ kioskPath: '/kiosk?token=breakout-b' }) }),
    ])
  })

  it('keeps reusable deployments target-centric when the legacy survey pointer is not a planner target', async () => {
    const legacyPointer = {
      ...voiceSurveyPackage.surveys[1].surveyTarget,
      id: 'target-result-only',
      name: 'Historical analysis target',
      metadata: { listeningPoint: false, resultScope: 'SESSION' },
    }
    const afternoonTarget = {
      ...voiceSurveyPackage.surveys[1].surveyTarget,
      id: 'target-afternoon-networking-break',
      name: 'Afternoon Networking Break',
      slug: 'afternoon-networking-break',
      metadata: null,
    }
    const welcomeTarget = {
      ...afternoonTarget,
      id: 'target-welcome-reception',
      name: 'Welcome Reception',
      slug: 'welcome-reception',
    }
    loadEventSurveyWorkspacePackageMock.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [{
        ...voiceSurveyPackage.surveys[1],
        id: 'survey-closing-session',
        name: 'Closing Session',
        status: 'ACTIVE',
        surveyTargetId: legacyPointer.id,
        surveyTarget: legacyPointer,
        publicSurveyLinks: [
          { ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0], id: 'link-afternoon-networking-break', token: 'afternoon', metadata: { assignmentState: 'CURRENT' }, surveyTarget: afternoonTarget },
          { ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0], id: 'link-welcome-reception', token: 'welcome', metadata: { assignmentState: 'CURRENT' }, surveyTarget: welcomeTarget },
        ],
      }],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme') } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.deployments).toHaveLength(2)
    expect(json.data.deployments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'link-afternoon-networking-break',
        surveyId: 'survey-closing-session',
        targetId: 'target-afternoon-networking-break',
        publicLinkId: 'link-afternoon-networking-break',
        name: 'Closing Session',
        target: expect.objectContaining({ name: 'Afternoon Networking Break' }),
        publicLink: expect.objectContaining({ kioskPath: '/kiosk?token=afternoon' }),
      }),
      expect.objectContaining({
        id: 'link-welcome-reception',
        surveyId: 'survey-closing-session',
        targetId: 'target-welcome-reception',
        publicLinkId: 'link-welcome-reception',
        target: expect.objectContaining({ name: 'Welcome Reception' }),
        publicLink: expect.objectContaining({ kioskPath: '/kiosk?token=welcome' }),
      }),
    ]))
  })

  it('returns every current target assignment for a reusable survey definition', async () => {
    const sessionTarget = {
      ...voiceSurveyPackage.surveys[1].surveyTarget,
      id: 'target_session_1',
      eventStructureItemId: 'session_1',
      category: 'SESSION',
      name: 'Session 1',
    }
    const registrationTarget = {
      ...sessionTarget,
      id: 'target_registration',
      eventStructureItemId: 'area_registration',
      category: 'LOCATION',
      name: 'Registration',
    }
    const expoTarget = {
      ...sessionTarget,
      id: 'target_expo',
      eventStructureItemId: 'area_expo',
      category: 'LOCATION',
      name: 'Expo Hall',
    }
    const speakerTarget = {
      ...sessionTarget,
      id: 'target_speaker_1',
      eventStructureItemId: null,
      category: 'SPEAKER',
      name: 'Speaker 1',
    }
    loadEventSurveyWorkspacePackageMock.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [{
        ...voiceSurveyPackage.surveys[1],
        id: 'survey_reusable',
        surveyTarget: sessionTarget,
        publicSurveyLinks: [
          { ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0], id: 'link_session', surveyTarget: sessionTarget, metadata: { assignmentState: 'CURRENT' } },
          { ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0], id: 'link_registration', surveyTarget: registrationTarget, metadata: { assignmentState: 'CURRENT' } },
          { ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0], id: 'link_expo', surveyTarget: expoTarget, metadata: { assignmentState: 'CURRENT' } },
          { ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0], id: 'link_speaker', surveyTarget: speakerTarget, metadata: { assignmentState: 'CURRENT' } },
        ],
      }],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme') } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.surveys).toHaveLength(1)
    expect(json.data.surveys[0].assignmentTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'target_session_1', eventStructureItemId: 'session_1' }),
      expect.objectContaining({ id: 'target_registration', eventStructureItemId: 'area_registration' }),
      expect.objectContaining({ id: 'target_expo', eventStructureItemId: 'area_expo' }),
      expect.objectContaining({ id: 'target_speaker_1', category: 'SPEAKER' }),
    ]))
    expect(json.data.surveys[0].dashboardScope).toEqual({
      eventStructureItemIds: expect.arrayContaining(['session_1', 'area_registration', 'area_expo']),
    })
  })

  it('returns the saved visual-only signage configuration on survey and deployment rows', async () => {
    const savedConfiguration = { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, headline: 'Saved keynote design' }
    prismaMock.event.findFirst.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [{
        ...voiceSurveyPackage.surveys[0],
        settingsJson: {
          templateRecommendation: { key: 'preserved' },
          qrSignage: savedConfiguration,
        },
      }],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme') } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()
    expect(json.data.surveys[0].signageConfiguration).toEqual(savedConfiguration)
    expect(json.data.deployments[0].signageConfiguration).toEqual(savedConfiguration)
    expect(json.data.deployments[0].signageConfiguration).not.toHaveProperty('qrUrl')
  })

  it('returns a clean empty survey list for an event container without surveys', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.surveys).toEqual([])
    expect(json.data.survey).toBeNull()
    expect(json.data.publicLink).toBeNull()
    expect(json.data.questions).toEqual([])
  })

  it('returns the legacy Event survey adapter instead of reproducing the workspace 500', async () => {
    loadEventSurveyWorkspacePackageMock.mockResolvedValueOnce({
      ...voiceSurveyPackage,
      surveySource: 'LEGACY_EVENT',
      surveys: [{
        ...voiceSurveyPackage.surveys[0],
        id: 'legacy-event:evt_123',
        surveyTargetId: 'legacy-event:evt_123:target',
        surveyTarget: {
          ...voiceSurveyPackage.surveys[0].surveyTarget,
          id: 'legacy-event:evt_123:target',
          name: 'Overall Event',
        },
        publicSurveyLinks: [{
          ...voiceSurveyPackage.surveys[0].publicSurveyLinks[0],
          id: 'legacy-event:evt_123:link',
          token: '',
          kioskPath: '/kiosk?eventId=evt_123',
        }],
      }],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme') } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.surveySource).toBe('LEGACY_EVENT')
    expect(json.data.surveys).toEqual([
      expect.objectContaining({
        id: 'legacy-event:evt_123',
        publicLink: expect.objectContaining({ kioskPath: '/kiosk?eventId=evt_123' }),
      }),
    ])
  })

  it('keeps result-only intelligence surveys out of planner Setup and deployment', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [
        voiceSurveyPackage.surveys[0],
        {
          ...voiceSurveyPackage.surveys[1],
          id: 'survey_result_only',
          surveyTarget: {
            ...voiceSurveyPackage.surveys[1].surveyTarget,
            metadata: { listeningPoint: false, resultScope: 'SESSION' },
          },
          publicSurveyLinks: voiceSurveyPackage.surveys[1].publicSurveyLinks.map((link) => ({
            ...link,
            surveyTarget: {
              ...link.surveyTarget,
              metadata: { listeningPoint: false, resultScope: 'SESSION' },
            },
          })),
        },
      ],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme') } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.surveys.map((survey: { id: string }) => survey.id)).toEqual(['survey_123'])
  })

  it('rejects GET for non-EVENTS account types', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    for (const accountType of ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined]) {
      prismaMock.event.findFirst.mockResolvedValueOnce({
        ...voiceSurveyPackage,
        location: {
          ...voiceSurveyPackage.location,
          account: {
            accountType,
          },
        },
      })

      const response = await GET(
        {
          nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        } as never,
        { params: { eventId: 'evt_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.error).toBe('Event voice surveys are only available for EVENTS accounts')
    }
  })

  it('returns 404 when the event is outside the scoped account', async () => {
    prismaMock.event.findFirst.mockResolvedValue(null)

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_other/voice-surveys?account=acme'),
      } as never,
      { params: { eventId: 'evt_other' } },
    )

    expect(response.status).toBe(404)
  })

  it('persists event, survey, target, question, and selected voice edits', async () => {
    const tx = {
      event: {
        update: vi.fn().mockResolvedValue({ id: 'evt_123' }),
      },
      survey: {
        update: vi.fn().mockResolvedValue({ id: 'survey_123' }),
      },
      surveyTarget: {
        update: vi.fn().mockResolvedValue({ id: 'target_123' }),
      },
      publicSurveyLink: {
        update: vi.fn().mockResolvedValue({ id: 'link_123' }),
      },
      question: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce({
        ...voiceSurveyPackage,
        name: 'Updated Event',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
        surveys: [
          {
            ...voiceSurveyPackage.surveys[0],
            name: 'Updated Survey',
            surveyTarget: {
              ...voiceSurveyPackage.surveys[0].surveyTarget,
              name: 'Updated Target',
            },
            questions: [
              {
                id: 'question_1',
                key: 'q1',
                label: 'Updated first prompt',
                ttsText: null,
                order: 0,
                required: true,
              },
              {
                id: 'question_3',
                key: 'survey-rvey_123-q2',
                label: 'Brand new prompt',
                ttsText: null,
                order: 1,
                required: true,
              },
            ],
          },
        ],
      })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          eventName: 'Updated Event',
          surveyName: 'Updated Survey',
          targetName: 'Updated Target',
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Studio-C',
          ttsLocale: 'en-GB',
          responseMode: 'VOICE_AND_TEXT',
          questions: [
            { id: 'question_1', text: 'Updated first prompt', order: 0, required: true },
            { text: 'Brand new prompt', order: 1, required: true },
          ],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'evt_123' },
      data: {
        name: 'Updated Event',
      },
    })
    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_123' },
      data: expect.objectContaining({
        name: 'Updated Survey',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
        responseMode: 'VOICE_AND_TEXT',
      }),
    })
    expect(tx.surveyTarget.update).toHaveBeenCalledWith({
      where: { id: 'target_123' },
      data: {
        name: 'Updated Target',
      },
    })
    expect(tx.publicSurveyLink.update).not.toHaveBeenCalled()
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'question_1' },
      data: expect.objectContaining({
        label: 'Updated first prompt',
        order: 0,
        required: true,
      }),
    })
    expect(tx.question.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'evt_123',
        surveyId: 'survey_123',
        label: 'Brand new prompt',
        order: 1,
      }),
    })
    expect(ensureSurveyQuestionAudioForSurveyMock).toHaveBeenCalledWith('survey_123', {
      provider: 'google',
      voice: 'en-GB-Studio-C',
      locale: 'en-GB',
    })
    expect(json.data.event.name).toBe('Updated Event')
  })

  it('rejects PATCH for non-EVENTS account types before updating survey rows', async () => {
    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    for (const accountType of ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined]) {
      prismaMock.event.findFirst.mockResolvedValueOnce({
        ...voiceSurveyPackage,
        location: {
          ...voiceSurveyPackage.location,
          account: {
            accountType,
          },
        },
      })

      const response = await PATCH(
        {
          nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
          json: async () => ({
            eventName: 'Updated Event',
            surveyName: 'Updated Survey',
            targetName: 'Updated Target',
            questions: [{ id: 'question_1', text: 'Updated first prompt', order: 0, required: true }],
          }),
        } as never,
        { params: { eventId: 'evt_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.error).toBe('Event voice survey editing is only available for EVENTS accounts')
    }

    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects changing a question type after responses have been collected', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [{
        ...voiceSurveyPackage.surveys[0],
        questions: [{
          ...voiceSurveyPackage.surveys[0].questions[0],
          type: 'VOICE',
        }],
        _count: { responses: 2 },
      }],
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')
    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          surveyId: 'survey_123',
          questions: [{ id: 'question_1', text: 'Updated prompt', type: 'RATING_1_TO_5', order: 0 }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('cannot change') })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('edits a selected survey by surveyId rather than the first survey', async () => {
    const tx = {
      event: { update: vi.fn().mockResolvedValue({ id: 'evt_123' }) },
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey_456' }) },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_456' }) },
      publicSurveyLink: { update: vi.fn().mockResolvedValue({ id: 'link_456' }) },
      question: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce(voiceSurveyPackage)
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          surveyId: 'survey_456',
          surveyName: 'Updated Session Survey',
          questions: [{ id: 'question_3', text: 'Updated breakout prompt', order: 0, required: true }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_456' },
      data: expect.objectContaining({ name: 'Updated Session Survey' }),
    })
    expect(tx.surveyTarget.update).toHaveBeenCalledWith({
      where: { id: 'target_456' },
      data: {},
    })
    expect(tx.publicSurveyLink.update).not.toHaveBeenCalled()
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'question_3' },
      data: expect.objectContaining({ label: 'Updated breakout prompt' }),
    })
  })

  it('persists and clears the optional survey description', async () => {
    const tx = {
      event: { update: vi.fn().mockResolvedValue({ id: 'evt_123' }) },
      survey: { update: vi.fn().mockResolvedValue({ id: 'survey_123' }) },
      surveyTarget: { update: vi.fn().mockResolvedValue({ id: 'target_123' }) },
      publicSurveyLink: { update: vi.fn().mockResolvedValue({ id: 'link_123' }) },
      question: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce(voiceSurveyPackage)
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const setResponse = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          surveyId: 'survey_123',
          surveyDescription: 'Post-keynote attendee pulse',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(setResponse.status).toBe(200)
    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_123' },
      data: expect.objectContaining({ description: 'Post-keynote attendee pulse' }),
    })

    const clearResponse = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({
          surveyId: 'survey_123',
          surveyDescription: '',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(clearResponse.status).toBe(200)
    expect(tx.survey.update).toHaveBeenLastCalledWith({
      where: { id: 'survey_123' },
      data: expect.objectContaining({ description: null }),
    })
    // Description-only edits do not force question audio regeneration.
    expect(ensureSurveyQuestionAudioForSurveyMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the requested surveyId is not in the event', async () => {
    prismaMock.event.findFirst.mockResolvedValueOnce(voiceSurveyPackage)

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_missing', surveyName: 'Nope' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(404)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('archives a selected survey by deactivating its target and public link', async () => {
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce(voiceSurveyPackage)
    archiveEventVoiceSurveyMock.mockResolvedValue({
      survey: { id: 'survey_456', status: 'ARCHIVED' },
      target: { id: 'target_456', isActive: false },
      publicLink: { id: 'link_456', isActive: false },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_456', archived: true }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(archiveEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_456',
    })
    expect(ensureSurveyQuestionAudioForSurveyMock).not.toHaveBeenCalled()
  })

  it('restores an archived survey to draft without making it launchable', async () => {
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce({
        ...voiceSurveyPackage,
        surveys: [
          voiceSurveyPackage.surveys[0],
          {
            ...voiceSurveyPackage.surveys[1],
            status: 'DRAFT',
            surveyTarget: { ...voiceSurveyPackage.surveys[1].surveyTarget, isActive: true },
            publicSurveyLinks: [
              {
                ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0],
                isActive: false,
              },
            ],
          },
        ],
      })
    restoreArchivedEventVoiceSurveyMock.mockResolvedValue({
      survey: { id: 'survey_456', status: 'DRAFT' },
      target: { id: 'target_456', isActive: true },
      publicLink: { id: 'link_456', isActive: false },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_456', archived: false }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(restoreArchivedEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_456',
    })
    expect(json.data.surveys[1]).toMatchObject({
      status: 'DRAFT',
      publicLink: {
        isActive: false,
      },
    })
  })

  it('activates a selected draft survey through the shared service', async () => {
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce({
        ...voiceSurveyPackage,
        surveys: [
          voiceSurveyPackage.surveys[0],
          {
            ...voiceSurveyPackage.surveys[1],
            status: 'ACTIVE',
            publicSurveyLinks: [
              {
                ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0],
                isActive: true,
              },
            ],
          },
        ],
      })
    activateEventVoiceSurveyMock.mockResolvedValue({
      survey: { id: 'survey_456', status: 'ACTIVE' },
      target: { id: 'target_456', isActive: true },
      publicLink: { id: 'link_456', isActive: true },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_456', status: 'ACTIVE' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(activateEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_456',
    })
    expect(json.data.surveys[1]).toMatchObject({
      id: 'survey_456',
      status: 'ACTIVE',
      publicLink: {
        isActive: true,
        kioskPath: '/kiosk?token=session%20token',
      },
    })
    expect(ensureSurveyQuestionAudioForSurveyMock).not.toHaveBeenCalled()
  })

  it('unpublishes an active survey by making it draft and disabling its public link', async () => {
    prismaMock.event.findFirst
      .mockResolvedValueOnce(voiceSurveyPackage)
      .mockResolvedValueOnce({
        ...voiceSurveyPackage,
        surveys: [
          voiceSurveyPackage.surveys[0],
          {
            ...voiceSurveyPackage.surveys[1],
            status: 'DRAFT',
            publicSurveyLinks: [
              {
                ...voiceSurveyPackage.surveys[1].publicSurveyLinks[0],
                isActive: false,
              },
            ],
          },
        ],
      })
    unpublishEventVoiceSurveyMock.mockResolvedValue({
      survey: { id: 'survey_456', status: 'DRAFT' },
      target: { id: 'target_456', isActive: true },
      publicLink: { id: 'link_456', isActive: false },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_456', status: 'DRAFT' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(unpublishEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_456',
    })
    expect(json.data.surveys[1]).toMatchObject({
      status: 'DRAFT',
      publicLink: {
        isActive: false,
      },
    })
    expect(activateEventVoiceSurveyMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported survey status changes', async () => {
    prismaMock.event.findFirst.mockResolvedValueOnce(voiceSurveyPackage)

    const { PATCH } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_456', status: 'PAUSED' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.error).toBe('Only ACTIVE and DRAFT survey status updates are supported')
    expect(activateEventVoiceSurveyMock).not.toHaveBeenCalled()
    expect(unpublishEventVoiceSurveyMock).not.toHaveBeenCalled()
  })

  it('routes an unassigned draft delete directly to the survey deletion service', async () => {
    prismaMock.event.findFirst.mockResolvedValueOnce({
      ...voiceSurveyPackage,
      surveys: [{
      ...voiceSurveyPackage.surveys[0],
        id: 'survey_456',
        surveyTargetId: null,
        surveyTarget: null,
        publicSurveyLinks: [],
        status: 'DRAFT',
        _count: { responses: 0 },
      }],
    })
    deleteEventVoiceSurveyMock.mockResolvedValue({
      survey: { id: 'survey_456' },
    })

    const { DELETE } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await DELETE(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_456' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(deleteEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      accountId: 'acct_123',
      surveyId: 'survey_456',
    })
    expect(activateEventVoiceSurveyMock).not.toHaveBeenCalled()
    expect(unpublishEventVoiceSurveyMock).not.toHaveBeenCalled()
    expect(archiveEventVoiceSurveyMock).not.toHaveBeenCalled()
    expect(json.data.surveys).toHaveLength(1)
  })

  it('blocks deleting an event voice survey that already has responses', async () => {
    const { EventVoiceSurveyLifecycleError } = await import('@/lib/event-voice-surveys')
    deleteEventVoiceSurveyMock.mockRejectedValue(
      new EventVoiceSurveyLifecycleError(
        'This survey has responses, so it cannot be deleted. Archive it to preserve history.',
        409,
      ),
    )

    const { DELETE } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await DELETE(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
        json: async () => ({ surveyId: 'survey_123' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(409)
    expect(json.error).toBe('This survey has responses, so it cannot be deleted. Archive it to preserve history.')
  })

  it('marks surveys with an inactive target as archived in the serialized payload', async () => {
    prismaMock.event.findFirst.mockResolvedValue({
      ...voiceSurveyPackage,
      surveys: [
        voiceSurveyPackage.surveys[0],
        {
          ...voiceSurveyPackage.surveys[1],
          surveyTarget: { ...voiceSurveyPackage.surveys[1].surveyTarget, isActive: false },
        },
      ],
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/voice-surveys?account=acme'),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.surveys[0].isArchived).toBe(false)
    expect(json.data.surveys[1].isArchived).toBe(true)
  })
})
