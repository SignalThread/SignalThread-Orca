import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAccountAdminMock = vi.fn()
const syncEventQuestionsMock = vi.fn()
const ensureEventQuestionAudioForEventMock = vi.fn()

const prismaMock = {
  account: {
    findUnique: vi.fn(),
  },
  event: {
    findFirst: vi.fn(),
  },
  location: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

vi.mock('@/lib/questions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/questions')>('@/lib/questions')
  return {
    ...actual,
    syncEventQuestions: syncEventQuestionsMock,
  }
})

vi.mock('@/lib/question-audio', () => ({
  ensureEventQuestionAudioForEvent: ensureEventQuestionAudioForEventMock,
}))

describe('POST /api/app/events/[eventId]/copy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.account.findUnique.mockResolvedValue({ accountType: 'RETAIL', tier: 'starter' })
  })

  it('successfully copies a survey to another location/team in the same account', async () => {
    const tx = {
      event: {
        create: vi.fn().mockResolvedValue({
          id: 'evt_copy_123',
          name: 'Copy of January Customer Feedback',
          eventType: 'SURVEY',
          status: 'DRAFT',
          isActive: true,
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-F',
          ttsLocale: 'en-US',
          location: { id: 'loc_target', name: 'Midtown', slug: 'midtown' },
        }),
      },
      question: {},
    }

    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme Coffee' },
    })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_source',
      name: 'January Customer Feedback',
      description: 'Original description',
      eventType: 'SURVEY',
      startDate: null,
      endDate: null,
      status: 'ACTIVE',
      isActive: true,
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [
        { key: 'q-1', label: 'How was your visit?', ttsText: null, order: 0, required: true },
        { key: 'q-2', label: 'Anything we should improve?', ttsText: 'What should we improve?', order: 1, required: false },
      ],
    })
    prismaMock.location.findUnique.mockResolvedValue({
      id: 'loc_target',
      accountId: 'acct_123',
      name: 'Midtown',
    })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))

    const { POST } = await import('@/app/api/app/events/[eventId]/copy/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_source/copy?account=acme'),
        json: async () => ({
          name: 'Copy of January Customer Feedback',
          locationId: 'loc_target',
        }),
      } as never,
      { params: { eventId: 'evt_source' } },
    )

    const json = await response.json()

    expect(response.status).toBe(201)
    expect(tx.event.create).toHaveBeenCalledWith({
      data: {
        locationId: 'loc_target',
        name: 'Copy of January Customer Feedback',
        description: 'Original description',
        eventType: 'SURVEY',
        startDate: null,
        endDate: null,
        status: 'DRAFT',
        isActive: true,
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        questionsJson: [
          { id: 'q-1', text: 'How was your visit?', order: 0, required: true },
          { id: 'q-2', text: 'Anything we should improve?', order: 1, required: false, ttsText: 'What should we improve?' },
        ],
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
    expect(syncEventQuestionsMock).toHaveBeenCalledWith(tx, 'evt_copy_123', [
      { id: 'q-1', text: 'How was your visit?', order: 0, required: true },
      { id: 'q-2', text: 'Anything we should improve?', order: 1, required: false, ttsText: 'What should we improve?' },
    ])
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_copy_123', {
      provider: 'google',
      voice: 'en-US-Neural2-F',
      locale: 'en-US',
    })
    expect(json.event.id).toBe('evt_copy_123')
  })

  it('copies survey settings but does not copy responses, answers, or analysis', async () => {
    const tx = {
      event: {
        create: vi.fn().mockResolvedValue({
          id: 'evt_copy_456',
          name: 'Copy of Event',
          eventType: 'SURVEY',
          status: 'DRAFT',
          isActive: true,
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Neural2-A',
          ttsLocale: 'en-GB',
          location: { id: 'loc_target', name: 'Uptown', slug: 'uptown' },
        }),
      },
      question: {},
    }

    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme Coffee' },
    })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_source',
      name: 'Source Event',
      description: null,
      eventType: 'SURVEY',
      startDate: new Date('2026-01-15T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      status: 'COMPLETED',
      isActive: false,
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Neural2-A',
      ttsLocale: 'en-GB',
      questionsJson: [{ id: 'q-legacy', text: 'Legacy prompt', order: 0 }],
      questions: [],
    })
    prismaMock.location.findUnique.mockResolvedValue({
      id: 'loc_target',
      accountId: 'acct_123',
      name: 'Uptown',
    })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))

    const { POST } = await import('@/app/api/app/events/[eventId]/copy/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_source/copy?account=acme'),
        json: async () => ({
          name: 'Copy of Event',
          locationId: 'loc_target',
        }),
      } as never,
      { params: { eventId: 'evt_source' } },
    )

    expect(response.status).toBe(201)
    const createData = tx.event.create.mock.calls[0][0].data
    expect(createData).toMatchObject({
      eventType: 'SURVEY',
      startDate: new Date('2026-01-15T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      status: 'DRAFT',
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Neural2-A',
      ttsLocale: 'en-GB',
    })
    expect(createData.responses).toBeUndefined()
    expect(createData.answers).toBeUndefined()
    expect(createData.analysis).toBeUndefined()
    expect(createData.insights).toBeUndefined()
  })

  it('blocks EVENTS starter accounts from copying a second event', async () => {
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'events-co', name: 'Events Co' },
    })
    prismaMock.account.findUnique.mockResolvedValue({
      accountType: 'EVENTS',
      tier: 'starter',
    })

    const { POST } = await import('@/app/api/app/events/[eventId]/copy/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_source/copy?account=events-co'),
        json: async () => ({
          name: 'Copy of Event',
          locationId: 'loc_target',
        }),
      } as never,
      { params: { eventId: 'evt_source' } },
    )

    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe('Event Launch accounts can only create one event')
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a cross-account target location/team', async () => {
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme Coffee' },
    })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_source',
      description: null,
      eventType: 'SURVEY',
      startDate: null,
      endDate: null,
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: [{ id: 'q-1', text: 'How was your visit?', order: 0 }],
      questions: [],
    })
    prismaMock.location.findUnique.mockResolvedValue({
      id: 'loc_other',
      accountId: 'acct_other',
      name: 'Other account location',
    })

    const { POST } = await import('@/app/api/app/events/[eventId]/copy/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_source/copy?account=acme'),
        json: async () => ({
          name: 'Copy of Source Event',
          locationId: 'loc_other',
        }),
      } as never,
      { params: { eventId: 'evt_source' } },
    )

    expect(response.status).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(ensureEventQuestionAudioForEventMock).not.toHaveBeenCalled()
  })

  it('rejects unauthorized users', async () => {
    requireAccountAdminMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    })

    const { POST } = await import('@/app/api/app/events/[eventId]/copy/route')

    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_source/copy?account=acme'),
        json: async () => ({
          name: 'Copy of Source Event',
          locationId: 'loc_target',
        }),
      } as never,
      { params: { eventId: 'evt_source' } },
    )

    expect(response.status).toBe(403)
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
