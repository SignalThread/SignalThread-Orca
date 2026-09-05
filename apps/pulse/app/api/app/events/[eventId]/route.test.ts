import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClientMock = vi.fn()
const requireEventAccessMock = vi.fn()
const syncEventQuestionsMock = vi.fn()
const ensureEventQuestionAudioForEventMock = vi.fn()
const requireAccountAdminMock = vi.fn()
const deleteEventForAccountMock = vi.fn()

const prismaMock = {
  account: {
    findUnique: vi.fn(),
  },
  event: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  response: {
    count: vi.fn(),
  },
  answer: {
    count: vi.fn(),
  },
  survey: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  surveyTarget: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  eventSessionSpeakerAssignment: {
    count: vi.fn(),
  },
  eventSpeakerProfile: {
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/auth/require-events-event-access', () => ({
  requireEventAccess: requireEventAccessMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
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

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

vi.mock('@/lib/event-deletion', async () => {
  const actual = await vi.importActual<typeof import('@/lib/event-deletion')>('@/lib/event-deletion')
  return { ...actual, deleteEventForAccount: deleteEventForAccountMock }
})

describe('PATCH /api/app/events/[eventId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.response.count.mockResolvedValue(0)
    prismaMock.answer.count.mockResolvedValue(0)
    prismaMock.survey.findMany.mockResolvedValue([])
    prismaMock.survey.count.mockResolvedValue(0)
    prismaMock.surveyTarget.findMany.mockResolvedValue([])
    prismaMock.surveyTarget.count.mockResolvedValue(0)
    prismaMock.eventSpeakerProfile.count.mockResolvedValue(0)
    requireEventAccessMock.mockImplementation(async (accountSlug: string | null, eventId: string) => ({
      ok: true,
      userId: 'user_123',
      account: await prismaMock.account.findUnique({ where: { slug: accountSlug } }),
      event: { id: eventId },
    }))
  })

  it('rejects cross-account mutations before reading the request body or event', async () => {
    const { NextResponse } = await import('next/server')
    requireEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event not found or access denied' }, { status: 404 }),
    })
    const json = vi.fn()
    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/other_event?account=acme'),
        json,
      } as never,
      { params: { eventId: 'other_event' } },
    )

    expect(response.status).toBe(404)
    expect(json).not.toHaveBeenCalled()
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it('keeps questionsJson unchanged and dual-writes draft question edits through the shared sync helper', async () => {
    const questions = [
      { key: 'q-1', label: 'Updated question', order: 0, required: true },
      { key: 'q-2', label: 'Second question', order: 1, required: false },
    ]

    const tx = {
      event: {
        update: vi.fn().mockResolvedValue({
          id: 'evt_123',
          name: 'Updated survey',
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
    prismaMock.surveyTarget.findMany.mockResolvedValue([
      { metadata: { listeningPoint: true } },
      { metadata: null },
      { metadata: { listeningPoint: false, resultScope: 'SESSION' } },
    ])
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'DRAFT',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: questions,
      questions: [
        { key: 'q-1', label: 'Old question', ttsText: null, order: 0, required: true },
        { key: 'q-2', label: 'Second question', ttsText: null, order: 1, required: false },
      ],
    })
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    syncEventQuestionsMock.mockResolvedValue(undefined)

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          name: '  Updated survey  ',
          description: '  Updated description  ',
          questions,
          status: 'ACTIVE',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'evt_123' },
      data: {
        name: 'Updated survey',
        description: 'Updated description',
        questionsJson: questions,
        status: 'ACTIVE',
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
    expect(tx.event.update.mock.calls[0][0].data.questionsJson).toBe(questions)
    expect(syncEventQuestionsMock).toHaveBeenCalledWith(tx, 'evt_123', questions)
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_123', {
      provider: 'google',
      voice: 'en-US-Neural2-F',
      locale: 'en-US',
    })
  })

  it('rejects question updates for a draft survey after responses or answers exist', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'DRAFT',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: [{ id: 'q-1', text: 'How was your visit?', order: 0 }],
      questions: [{ key: 'q-1', label: 'How was your visit?', ttsText: null, order: 0, required: true }],
    })
    prismaMock.response.count.mockResolvedValue(3)
    prismaMock.answer.count.mockResolvedValue(0)
    prismaMock.survey.findMany.mockResolvedValue([])

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          questions: [{ key: 'q-1', label: 'Updated?', order: 0, required: true }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('responses have been collected')
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
  })

  it('rejects question updates while survey is active (zero responses)', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'ACTIVE',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [],
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          questions: [{ key: 'q-1', label: 'New Q', order: 0, required: true }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('active')
    expect(json.error).toContain('Stop the survey first')
  })

  it('rejects question updates when active and responses exist (combined message)', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'ACTIVE',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [],
    })
    prismaMock.response.count.mockResolvedValue(2)

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          questions: [{ key: 'q-1', label: 'New Q', order: 0, required: true }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('active')
    expect(json.error).toContain('responses have been collected')
    expect(json.error).toContain('Duplicate this survey')
  })

  it('allows responseMode updates while survey is active with collected responses (questions still protected)', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'ACTIVE',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [{ key: 'q-1', label: 'Q1', ttsText: null, order: 0, required: true }],
    })
    prismaMock.response.count.mockResolvedValue(4)
    prismaMock.answer.count.mockResolvedValue(2)

    prismaMock.event.update.mockResolvedValue({
      id: 'evt_123',
      status: 'ACTIVE',
      responseMode: 'TEXT_ONLY',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const ok = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({ responseMode: 'TEXT_ONLY' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(ok.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt_123' },
        data: expect.objectContaining({ responseMode: 'TEXT_ONLY' }),
      }),
    )

    prismaMock.event.update.mockClear()

    const blocked = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          questions: [{ key: 'q-1', label: 'Hacked', order: 0, required: true }],
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(blocked.status).toBe(400)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it('saves draft TTS settings without changing question write behavior', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'DRAFT',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: [{ id: 'q-1', text: 'How was your visit?', order: 0 }],
      questions: [{ key: 'q-1', label: 'How was your visit?', ttsText: null, order: 0, required: true }],
    })
    prismaMock.event.update.mockResolvedValue({
      id: 'evt_123',
      name: 'Updated survey',
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          name: '  Updated survey  ',
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Studio-C',
          ttsLocale: 'en-US',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { id: 'evt_123' },
      data: {
        name: 'Updated survey',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
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
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_123', {
      provider: 'google',
      voice: 'en-GB-Studio-C',
      locale: 'en-GB',
    })
    expect(json.event).toMatchObject({
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
    })
  })

  it('allows active surveys to update TTS settings without unlocking question edits', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'ACTIVE',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [],
    })
    prismaMock.event.update.mockResolvedValue({
      id: 'evt_123',
      name: 'Active survey',
      ttsProvider: 'google',
      ttsVoice: 'en-AU-Neural2-A',
      ttsLocale: 'en-AU',
      location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          ttsProvider: 'google',
          ttsVoice: 'en-AU-Neural2-A',
          ttsLocale: 'en-US',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { id: 'evt_123' },
      data: {
        ttsProvider: 'google',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-AU',
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
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
    expect(ensureEventQuestionAudioForEventMock).toHaveBeenCalledWith('evt_123', {
      provider: 'google',
      voice: 'en-AU-Neural2-A',
      locale: 'en-AU',
    })
  })

  it('allows completed surveys to update TTS settings while keeping content read-only', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      status: 'COMPLETED',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [],
    })
    prismaMock.event.update.mockResolvedValue({
      id: 'evt_123',
      name: 'Completed survey',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-J',
          ttsLocale: 'en-US',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { id: 'evt_123' },
      data: {
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-J',
        ttsLocale: 'en-US',
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
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
    expect(ensureEventQuestionAudioForEventMock).not.toHaveBeenCalled()
  })

  it('does not regenerate audio when a draft save changes only non-audio fields', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_456',
      status: 'DRAFT',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: [{ id: 'q-1', text: 'How was your visit?', order: 0 }],
      questions: [{ key: 'q-1', label: 'How was your visit?', ttsText: null, order: 0, required: true }],
    })
    prismaMock.event.update.mockResolvedValue({
      id: 'evt_456',
      name: 'Updated name only',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      location: { id: 'loc_123', name: 'Downtown', slug: 'downtown' },
    })

    const { PATCH } = await import('@/app/api/app/events/[eventId]/route')

    const response = await PATCH(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_456?account=acme'),
        json: async () => ({
          name: '  Updated name only  ',
        }),
      } as never,
      { params: { eventId: 'evt_456' } },
    )

    expect(response.status).toBe(200)
    expect(syncEventQuestionsMock).not.toHaveBeenCalled()
    expect(ensureEventQuestionAudioForEventMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/app/events/[eventId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      account: { id: 'acct_123', slug: 'acme' },
    })
    deleteEventForAccountMock.mockResolvedValue({ eventId: 'evt_123', eventName: 'Northstar Summit' })
  })

  it('uses the canonical admin-scoped deletion service with the exact confirmation name', async () => {
    const { DELETE } = await import('@/app/api/app/events/[eventId]/route')

    const response = await DELETE(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123?account=acme'),
        json: async () => ({ confirmationName: 'Northstar Summit' }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(200)
    expect(requireAccountAdminMock).toHaveBeenCalledWith('acme')
    expect(deleteEventForAccountMock).toHaveBeenCalledWith({
      accountId: 'acct_123',
      eventId: 'evt_123',
      confirmationName: 'Northstar Summit',
    })
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { eventId: 'evt_123' } })
  })

  it('rejects a wrong-account or insufficient-role delete before the deletion service runs', async () => {
    const { NextResponse } = await import('next/server')
    requireAccountAdminMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Account admin access is required' }, { status: 403 }),
    })
    const { DELETE } = await import('@/app/api/app/events/[eventId]/route')

    const response = await DELETE(
      { nextUrl: new URL('http://localhost/api/app/events/evt_123?account=other'), json: vi.fn() } as never,
      { params: { eventId: 'evt_123' } },
    )

    expect(response.status).toBe(403)
    expect(deleteEventForAccountMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/app/events/[eventId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.answer.count.mockResolvedValue(0)
    prismaMock.surveyTarget.findMany.mockResolvedValue([])
    prismaMock.eventSpeakerProfile.count.mockResolvedValue(0)
    requireEventAccessMock.mockImplementation(async (accountSlug: string | null, eventId: string) => ({
      ok: true,
      userId: 'user_123',
      account: await prismaMock.account.findUnique({ where: { slug: accountSlug } }),
      event: { id: eventId },
    }))
  })

  it('rejects cross-account event reads before querying event detail', async () => {
    const { NextResponse } = await import('next/server')
    requireEventAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event not found or access denied' }, { status: 404 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/route')

    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/other_event?account=acme') } as never,
      { params: { eventId: 'other_event' } },
    )

    expect(response.status).toBe(404)
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it('returns the saved TTS voice and locale for edit-page reloads', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123' } },
          error: null,
        }),
      },
    })

    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.surveyTarget.findMany.mockResolvedValue([
      { id: 'target-1', metadata: { listeningPoint: true } },
      { id: 'target-2', metadata: null },
      { id: 'result-target', metadata: { listeningPoint: false, resultScope: 'SESSION' } },
    ])
    prismaMock.survey.count.mockResolvedValue(2)
    prismaMock.surveyTarget.count.mockResolvedValue(2)
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_999',
      name: 'Saved survey',
      description: null,
      status: 'ACTIVE',
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      questionsJson: [{ id: 'q-1', text: 'How was your visit?', order: 0 }],
      location: { id: 'loc_123', name: 'Downtown', slug: 'downtown', accountId: 'acct_123' },
      questions: [{ key: 'q-1', label: 'How was your visit?', ttsText: null, order: 0, required: true }],
      _count: {
        responses: 4,
        surveyTargets: 2,
        questions: 5,
      },
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_999?account=acme'),
      } as never,
      { params: { eventId: 'evt_999' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        _count: {
          select: expect.objectContaining({ surveyTargets: { where: { isActive: true } } }),
        },
      }),
    }))
    expect(json.event).toMatchObject({
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      _count: {
        responses: 4,
        answers: 0,
        surveys: 2,
        surveyTargets: 2,
        questions: 5,
      },
    })
  })

  it('returns zero for the Speakers tab when the event has no event-scoped speaker memberships', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue(eventDetailFixture())
    prismaMock.eventSpeakerProfile.count.mockResolvedValue(0)
    const { GET } = await import('@/app/api/app/events/[eventId]/route')

    const response = await GET({ nextUrl: new URL('http://localhost/api/app/events/evt_999?account=acme') } as never, { params: { eventId: 'evt_999' } })

    expect((await response.json()).event._count.assignedSpeakerCount).toBe(0)
    expect(prismaMock.eventSpeakerProfile.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        accountId: 'acct_123',
        sessionAssignments: { some: { eventId: 'evt_999', sessionId: { not: null } } },
      }),
    })
  })

  it('returns the Template session-driven speaker count, excluding reusable account speakers not used here', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue(eventDetailFixture())
    prismaMock.eventSpeakerProfile.count.mockResolvedValue(22)
    const { GET } = await import('@/app/api/app/events/[eventId]/route')

    const response = await GET({ nextUrl: new URL('http://localhost/api/app/events/evt_999?account=acme') } as never, { params: { eventId: 'evt_999' } })

    expect((await response.json()).event._count.assignedSpeakerCount).toBe(22)
    expect(prismaMock.eventSpeakerProfile.count).toHaveBeenCalled()
  })

  it('reflects event-speaker additions and removals on the next event-summary read', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123' })
    prismaMock.event.findFirst.mockResolvedValue(eventDetailFixture())
    prismaMock.eventSpeakerProfile.count.mockResolvedValueOnce(22).mockResolvedValueOnce(21)
    const { GET } = await import('@/app/api/app/events/[eventId]/route')

    const added = await GET({ nextUrl: new URL('http://localhost/api/app/events/evt_999?account=acme') } as never, { params: { eventId: 'evt_999' } })
    const removed = await GET({ nextUrl: new URL('http://localhost/api/app/events/evt_999?account=acme') } as never, { params: { eventId: 'evt_999' } })

    expect((await added.json()).event._count.assignedSpeakerCount).toBe(22)
    expect((await removed.json()).event._count.assignedSpeakerCount).toBe(21)
  })
})

function eventDetailFixture() {
  return {
    id: 'evt_999', name: 'Saved survey', description: null, status: 'ACTIVE', eventType: 'TEMPLATE', ttsProvider: 'google', ttsVoice: 'en-GB-Studio-C', ttsLocale: 'en-GB', questionsJson: [],
    location: { id: 'loc_123', name: 'Downtown', slug: 'downtown', accountId: 'acct_123' }, questions: [],
    _count: { responses: 0, surveyTargets: 0, questions: 0 },
  }
}
