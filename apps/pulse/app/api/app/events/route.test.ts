import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClientMock = vi.fn()
const requireAccountMembershipMock = vi.fn()
const syncEventQuestionsMock = vi.fn()
const ensureEventQuestionAudioForEventMock = vi.fn()
const createEventVoiceSurveyInTransactionMock = vi.fn()
const expandEventTemplateSurveysMock = vi.fn()
const createEventWithReviewedAgendaMock = vi.fn()

const prismaMock = {
  account: {
    findUnique: vi.fn(),
  },
  location: {
    findUnique: vi.fn(),
  },
  event: {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    findFirstOrThrow: vi.fn(),
  },
  eventStructureItem: {
    createMany: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/auth/require-account-membership', () => ({
  requireAccountMembership: requireAccountMembershipMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/questions', () => ({
  syncEventQuestions: syncEventQuestionsMock,
}))

vi.mock('@/lib/question-audio', () => ({
  getDefaultEventTtsSettings: vi.fn(() => ({
    provider: 'google',
    voice: process.env.TTS_DEFAULT_VOICE || 'en-US-Neural2-F',
    locale: process.env.TTS_DEFAULT_LOCALE || 'en-US',
  })),
  ensureEventQuestionAudioForEvent: ensureEventQuestionAudioForEventMock,
}))

vi.mock('@/lib/event-voice-surveys', () => ({
  createEventVoiceSurveyInTransaction: createEventVoiceSurveyInTransactionMock,
}))

vi.mock('@/lib/event-template-expansion', () => ({
  expandEventTemplateSurveys: expandEventTemplateSurveysMock,
}))

vi.mock('@/lib/create-event-with-reviewed-agenda', () => ({
  createEventWithReviewedAgenda: createEventWithReviewedAgendaMock,
}))

describe('GET /api/app/events', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('lists events for an authenticated same-account member', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: true,
      userId: 'member_123',
      account: { id: 'acct_123', slug: 'events-co', accountType: 'EVENTS' },
    })
    prismaMock.event.findMany.mockResolvedValue([{ id: 'event_123', name: 'Annual Summit' }])
    const { GET } = await import('@/app/api/app/events/route')

    const response = await GET({ nextUrl: new URL('http://localhost/api/app/events?account=events-co') } as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, events: [{ id: 'event_123', name: 'Annual Summit' }] })
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { location: { accountId: 'acct_123' } },
    }))
  })

  it.each([
    ['unauthenticated', 401],
    ['cross-account', 403],
  ])('rejects an %s request before listing events', async (_label, status) => {
    const { NextResponse } = await import('next/server')
    requireAccountMembershipMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status }),
    })
    const { GET } = await import('@/app/api/app/events/route')

    const response = await GET({ nextUrl: new URL('http://localhost/api/app/events?account=events-co') } as never)

    expect(response.status).toBe(status)
    expect(prismaMock.event.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/app/events', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    expandEventTemplateSurveysMock.mockResolvedValue({ created: [], skipped: [], failed: [] })
    requireAccountMembershipMock.mockImplementation(async (accountSlug: string | null) => {
      const account = await prismaMock.account.findUnique({ where: { slug: accountSlug } })
      return { ok: true, userId: 'user_123', account }
    })
  })

  it('uses the transactional reviewed-agenda path exactly once for creation with an agenda', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    createEventWithReviewedAgendaMock.mockResolvedValue({ eventId: 'creation_request_123456', idempotentReplay: false, sessionCount: 1 })
    prismaMock.event.findFirstOrThrow.mockResolvedValue({ id: 'creation_request_123456', name: 'Summit' })
    const { POST } = await import('@/app/api/app/events/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'Summit', locationId: 'loc_123', setupType: 'ADVANCED',
        initialSetup: {
          requestId: 'creation_request_123456', eventAreaNames: ['Registration'],
          agenda: { sourceFileName: 'agenda.csv', rows: [{ sourceRowNumber: 2, normalized: { title: 'Opening', startsAt: null, endsAt: null, timezone: null, externalId: null, description: null, room: null, track: null, format: null, capacity: null, tags: [], speakers: [] } }] },
        },
      }),
    } as never)
    expect(response.status).toBe(201)
    expect(createEventWithReviewedAgendaMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('rejects cross-account creation before reading or writing event data', async () => {
    const { NextResponse } = await import('next/server')
    requireAccountMembershipMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })
    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=other-account'),
      json: vi.fn(),
    } as never)

    expect(response.status).toBe(403)
    expect(prismaMock.location.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('keeps questionsJson unchanged, persists TTS settings, and dual-writes through the shared sync helper', async () => {
    const questions = [
      { id: 'q-1', text: 'How was your visit?', order: 0 },
      { key: 'q-2', label: 'What should we improve?', order: 1, required: false },
    ]

    const tx = {
      event: {
        create: vi.fn().mockResolvedValue({
          id: 'evt_123',
          name: 'New survey',
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Neural2-A',
          ttsLocale: 'en-GB',
          location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
        }),
      },
      question: {},
    }

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    syncEventQuestionsMock.mockResolvedValue(undefined)

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=acme'),
      json: async () => ({
        name: '  New survey  ',
        description: '  Helpful description  ',
        locationId: 'loc_123',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Neural2-A',
        ttsLocale: 'en-GB',
        questions,
      }),
    } as never)

    expect(response.status).toBe(201)
    expect(tx.event.create).toHaveBeenCalledWith({
      data: {
        name: 'New survey',
        description: 'Helpful description',
        locationId: 'loc_123',
        status: 'DRAFT',
        eventType: 'SURVEY',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Neural2-A',
        ttsLocale: 'en-GB',
        responseMode: 'VOICE_ONLY',
        questionsJson: questions,
        isActive: true,
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })
    expect(tx.event.create.mock.calls[0][0].data.questionsJson).toBe(questions)
    expect(syncEventQuestionsMock).toHaveBeenCalledWith(tx, 'evt_123', questions)
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_123', {
      provider: 'google',
      voice: 'en-GB-Neural2-A',
      locale: 'en-GB',
    })
  })

  it('defaults new surveys to the curated Google voice when TTS settings are omitted', async () => {
    const questions = [{ id: 'q-1', text: 'How was your visit?', order: 0 }]

    const tx = {
      event: {
        create: vi.fn().mockResolvedValue({
          id: 'evt_456',
          name: 'New survey',
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-F',
          ttsLocale: 'en-US',
          location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
        }),
      },
      question: {},
    }

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    syncEventQuestionsMock.mockResolvedValue(undefined)
    process.env.TTS_DEFAULT_VOICE = 'en-US-Neural2-F'
    process.env.TTS_DEFAULT_LOCALE = 'en-US'

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=acme'),
      json: async () => ({
        name: 'New survey',
        locationId: 'loc_123',
        questions,
      }),
    } as never)

    expect(response.status).toBe(201)
    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        responseMode: 'VOICE_ONLY',
      }),
      include: {
        location: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_456', {
      provider: 'google',
      voice: 'en-US-Neural2-F',
      locale: 'en-US',
    })
  })

  it('stores derived locale from voice when the incoming locale is mismatched', async () => {
    const questions = [{ id: 'q-1', text: 'How was your visit?', order: 0 }]

    const tx = {
      event: {
        create: vi.fn().mockResolvedValue({
          id: 'evt_789',
          name: 'New survey',
          ttsProvider: 'google',
          ttsVoice: 'en-AU-Neural2-A',
          ttsLocale: 'en-AU',
          location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
        }),
      },
      question: {},
    }

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    syncEventQuestionsMock.mockResolvedValue(undefined)

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=acme'),
      json: async () => ({
        name: 'New survey',
        locationId: 'loc_123',
        ttsProvider: 'google',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-US',
        questions,
      }),
    } as never)

    expect(response.status).toBe(201)
    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ttsProvider: 'google',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-AU',
        responseMode: 'VOICE_ONLY',
      }),
      include: {
        location: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_789', {
      provider: 'google',
      voice: 'en-AU-Neural2-A',
      locale: 'en-AU',
    })
  })

  it('creates an Event container only for EVENTS accounts', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.event.create.mockResolvedValue({
      id: 'evt_events_123',
      name: 'WEC San Antonio',
      description: 'Annual conference',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      location: { id: 'loc_123', name: 'Main Event', slug: 'main-event' },
      _count: { surveyTargets: 0, surveys: 0, questions: 0 },
    })

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'WEC San Antonio',
        description: 'Annual conference',
        locationId: 'loc_123',
      }),
    } as never)

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: {
        name: 'WEC San Antonio',
        description: 'Annual conference',
        locationId: 'loc_123',
        status: 'ACTIVE',
        eventType: 'SURVEY',
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        responseMode: 'VOICE_ONLY',
        questionsJson: [],
        isActive: true,
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            surveyTargets: true,
            surveys: true,
            questions: true,
          },
        },
      },
    })
    expect(prismaMock.event.count).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(createEventVoiceSurveyInTransactionMock).not.toHaveBeenCalled()
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
    expect(ensureEventQuestionAudioForEventMock).not.toHaveBeenCalled()
    expect(body.event.id).toBe('evt_events_123')
    expect(body.voiceSurvey).toBeUndefined()
    expect(body.event._count).toEqual({ surveyTargets: 0, surveys: 0, questions: 0 })
  })

  it.each([
    ['Basic Event', 'BLANK'],
    ['Advanced Event', 'ADVANCED'],
    ['existing Template caller', 'TEMPLATE'],
  ] as const)('persists %s as %s on the canonical Event', async (_label, setupType) => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.event.create.mockResolvedValue({
      id: `evt_${setupType.toLowerCase()}`,
      name: 'New Event',
      location: { id: 'loc_123', name: 'Main Event', slug: 'main-event' },
      _count: { surveyTargets: 0, surveys: 0, questions: 0 },
    })

    const { POST } = await import('@/app/api/app/events/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({ name: 'New Event', locationId: 'loc_123', setupType }),
    } as never)

    expect(response.status).toBe(201)
    expect(prismaMock.event.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: setupType }),
    }))
    expect(prismaMock.eventStructureItem.createMany).not.toHaveBeenCalled()
  })

  it('rejects setup types outside the three customer-facing choices', async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })

    const { POST } = await import('@/app/api/app/events/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({ name: 'New Event', locationId: 'loc_123', setupType: 'CONFERENCE' }),
    } as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid event setup type' })
    expect(prismaMock.location.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })

  it('allows EVENTS accounts to create multiple Event containers', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.event.create.mockResolvedValue({
      id: 'evt_second',
      name: 'Second Event',
      description: null,
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      location: { id: 'loc_123', name: 'Main Event', slug: 'main-event' },
      _count: { surveyTargets: 0, surveys: 0, questions: 0 },
    })

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'Second Event',
        locationId: 'loc_123',
      }),
    } as never)

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.event.id).toBe('evt_second')
    expect(prismaMock.event.count).not.toHaveBeenCalled()
    expect(prismaMock.event.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Second Event',
        questionsJson: [],
      }),
    }))
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(createEventVoiceSurveyInTransactionMock).not.toHaveBeenCalled()
  })

  it('seeds starter event structure from a non-blank template and records templateKey', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.event.create.mockResolvedValue({
      id: 'evt_conf',
      name: 'WEC',
      location: { id: 'loc_123', name: 'Main', slug: 'main' },
      _count: { surveyTargets: 0, surveys: 0, questions: 0 },
    })
    prismaMock.eventStructureItem.createMany.mockResolvedValue({ count: 5 })

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'WEC',
        locationId: 'loc_123',
        template: 'conference',
        venue: 'Convention Center',
        startDate: '2026-09-01',
      }),
    } as never)

    expect(response.status).toBe(201)
    // templateKey + venue + startDate are persisted on the event.
    expect(prismaMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'WEC',
          templateKey: 'conference',
          venue: 'Convention Center',
          questionsJson: [],
        }),
      }),
    )
    // Real structure is seeded — no surveys/responses/analytics created.
    expect(prismaMock.eventStructureItem.createMany).toHaveBeenCalledTimes(1)
    const seedArg = prismaMock.eventStructureItem.createMany.mock.calls[0][0]
    expect(seedArg.data).toHaveLength(5)
    expect(seedArg.data[0]).toMatchObject({ eventId: 'evt_conf', kind: 'EVENT', name: 'Registration', sortOrder: 0 })
    expect(createEventVoiceSurveyInTransactionMock).not.toHaveBeenCalled()
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
  })

  it('expands selected recommendations through the canonical template service and returns explicit results', async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_123' } }, error: null }) },
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS', tier: 'starter' })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.event.create.mockResolvedValue({
      id: 'evt_conf',
      name: 'WEC',
      location: { id: 'loc_123', name: 'Main', slug: 'main' },
      _count: { surveyTargets: 0, surveys: 0, questions: 0 },
    })
    prismaMock.eventStructureItem.createMany.mockResolvedValue({ count: 5 })
    expandEventTemplateSurveysMock.mockResolvedValue({
      created: [{ key: 'keynote-feedback', surveyId: 'survey-1', surveyName: 'Executive keynote pulse' }],
      skipped: [],
      failed: [],
    })

    const { POST } = await import('@/app/api/app/events/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'WEC',
        locationId: 'loc_123',
        template: 'conference',
        templateSurveyRecommendations: [
          { key: 'keynote-feedback', surveyName: 'Executive keynote pulse' },
        ],
      }),
    } as never)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(expandEventTemplateSurveysMock).toHaveBeenCalledWith({
      eventId: 'evt_conf',
      templateKey: 'conference',
      selections: [{ key: 'keynote-feedback', surveyName: 'Executive keynote pulse' }],
    })
    expect(body.templateExpansion.created).toEqual([
      { key: 'keynote-feedback', surveyId: 'survey-1', surveyName: 'Executive keynote pulse' },
    ])
  })

  it('creates no starter areas for the blank template', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })
    prismaMock.location.findUnique.mockResolvedValue({ id: 'loc_123', accountId: 'acct_123' })
    prismaMock.event.create.mockResolvedValue({
      id: 'evt_blank',
      name: 'Blank',
      location: { id: 'loc_123', name: 'Main', slug: 'main' },
      _count: { surveyTargets: 0, surveys: 0, questions: 0 },
    })

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'Blank',
        locationId: 'loc_123',
        template: 'blank',
      }),
    } as never)

    expect(response.status).toBe(201)
    expect(prismaMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ templateKey: 'blank' }),
      }),
    )
    expect(prismaMock.eventStructureItem.createMany).not.toHaveBeenCalled()
  })

  it('rejects an unknown template before creating the event', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({
      id: 'acct_123',
      accountType: 'EVENTS',
      tier: 'starter',
    })

    const { POST } = await import('@/app/api/app/events/route')

    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/events?account=events-co'),
      json: async () => ({
        name: 'Bad Template',
        locationId: 'loc_123',
        template: 'not-a-real-template',
      }),
    } as never)

    expect(response.status).toBe(400)
    expect(prismaMock.event.create).not.toHaveBeenCalled()
  })
})
