import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAccountMembershipMock = vi.fn()
const ensureEventQuestionAudioAssetsMock = vi.fn()

const prismaMock = {
  event: {
    findFirst: vi.fn(),
  },
}

vi.mock('@/lib/auth/require-account-membership', () => ({
  requireAccountMembership: requireAccountMembershipMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/question-audio', async () => {
  const actual = await vi.importActual<typeof import('@/lib/question-audio')>('@/lib/question-audio')
  return {
    ...actual,
    ensureEventQuestionAudioAssets: ensureEventQuestionAudioAssetsMock,
  }
})

describe('POST /api/app/events/[eventId]/question-audio', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.TTS_DEFAULT_VOICE = 'en-US-Neural2-F'
    process.env.TTS_DEFAULT_LOCALE = 'en-US'
  })

  it('uses event-level TTS settings and returns question audio metadata when the request does not override them', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme', email: null, tier: 'growth', trialEndsAt: null, stripeCustomerId: null, stripeSubscriptionId: null, billingJson: null },
    })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      name: 'Survey',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-D',
      ttsLocale: 'en-GB',
      questions: [
        { id: 'q1', key: 'q-1', label: 'How was your visit?', ttsText: null, order: 1, required: true },
      ],
    })
    ensureEventQuestionAudioAssetsMock.mockResolvedValue([
      {
        question: { id: 'q1', key: 'q-1', label: 'How was your visit?', ttsText: null, order: 1, required: true },
        sourceText: 'How was your visit?',
        cached: true,
        asset: {
          id: 'asset_1',
          questionId: 'q1',
          provider: 'google',
          voice: 'en-US-Neural2-D',
          language: 'en',
          locale: 'en-US',
          textHash: 'hash',
          sourceText: 'How was your visit?',
          objectKey: 'question-audio/q1/hash.mp3',
          storageUrl: 'https://storage.example/question-audio/q1/hash.mp3',
          mimeType: 'audio/mpeg',
          durationMs: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      },
    ])

    const { POST } = await import('@/app/api/app/events/[eventId]/question-audio/route')
    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/question-audio?account=acme'),
        json: async () => ({}),
      } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(ensureEventQuestionAudioAssetsMock).toHaveBeenCalledWith(
      [
        { id: 'q1', key: 'q-1', label: 'How was your visit?', ttsText: null, order: 1, required: true },
      ],
      {
        provider: 'google',
        voice: 'en-US-Neural2-D',
        locale: 'en-US',
      },
    )
    expect(json.provider).toBe('google')
    expect(json.voice).toBe('en-US-Neural2-D')
    expect(json.locale).toBe('en-US')
    expect(json.questions).toHaveLength(1)
    expect(json.questions[0]).toMatchObject({
      key: 'q-1',
      cached: true,
      audio: {
        provider: 'google',
        voice: 'en-US-Neural2-D',
        locale: 'en-US',
      },
    })
  })

  it('prefers request body overrides over event settings', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
      account: { id: 'acct_123', slug: 'acme', name: 'Acme', email: null, tier: 'growth', trialEndsAt: null, stripeCustomerId: null, stripeSubscriptionId: null, billingJson: null },
    })
    prismaMock.event.findFirst.mockResolvedValue({
      id: 'evt_123',
      name: 'Survey',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-J',
      ttsLocale: 'en-US',
      questions: [
        { id: 'q1', key: 'q-1', label: 'How was your visit?', ttsText: null, order: 1, required: true },
      ],
    })
    ensureEventQuestionAudioAssetsMock.mockResolvedValue([])

    const { POST } = await import('@/app/api/app/events/[eventId]/question-audio/route')
    const response = await POST(
      {
        nextUrl: new URL('http://localhost/api/app/events/evt_123/question-audio?account=acme'),
        json: async () => ({
          voice: 'en-AU-Neural2-A',
          locale: 'en-US',
        }),
      } as never,
      { params: { eventId: 'evt_123' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(ensureEventQuestionAudioAssetsMock).toHaveBeenCalledWith(
      [
        { id: 'q1', key: 'q-1', label: 'How was your visit?', ttsText: null, order: 1, required: true },
      ],
      {
        provider: 'google',
        voice: 'en-AU-Neural2-A',
        locale: 'en-AU',
      },
    )
    expect(json.voice).toBe('en-AU-Neural2-A')
    expect(json.locale).toBe('en-AU')
  })
})
