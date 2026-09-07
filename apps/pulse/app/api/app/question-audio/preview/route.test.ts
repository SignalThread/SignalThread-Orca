import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUESTION_AUDIO_PREVIEW_TEXT } from '@/lib/tts-voices'

const createClientMock = vi.fn()
const previewQuestionAudioMock = vi.fn()

const prismaMock = {
  account: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  accountUserMembership: {
    findUnique: vi.fn(),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/question-audio', async () => {
  const actual = await vi.importActual<typeof import('@/lib/question-audio')>('@/lib/question-audio')
  return {
    ...actual,
    previewQuestionAudio: previewQuestionAudioMock,
  }
})

describe('POST /api/app/question-audio/preview', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.accountUserMembership.findUnique.mockResolvedValue({ id: 'membership_1' })
  })

  it('returns 200 for an authenticated user with access to the requested account', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: 'owner@example.com' } },
          error: null,
        }),
      },
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', slug: 'acme' })
    prismaMock.user.findUnique.mockResolvedValue({ accountId: 'acct_123', role: 'ADMIN', isActive: true })
    previewQuestionAudioMock.mockResolvedValue({
      buffer: Buffer.from('preview-audio'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    const { POST } = await import('@/app/api/app/question-audio/preview/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/question-audio/preview?account=acme'),
      json: async () => ({
        provider: 'google',
        voice: 'en-US-Neural2-J',
        locale: 'en-US',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      }),
    } as never)

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(previewQuestionAudioMock).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-US-Neural2-J',
      locale: 'en-US',
      text: QUESTION_AUDIO_PREVIEW_TEXT,
    })
    expect(json).toMatchObject({
      success: true,
      provider: 'google',
      voice: 'en-US-Neural2-J',
      locale: 'en-US',
      mimeType: 'audio/mpeg',
    })
  })

  it('derives en-GB locale from the selected voice for preview requests', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: 'owner@example.com' } },
          error: null,
        }),
      },
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', slug: 'acme' })
    prismaMock.user.findUnique.mockResolvedValue({ accountId: 'acct_123', role: 'ADMIN', isActive: true })
    previewQuestionAudioMock.mockResolvedValue({
      buffer: Buffer.from('preview-audio'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    const { POST } = await import('@/app/api/app/question-audio/preview/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/question-audio/preview?account=acme'),
      json: async () => ({
        provider: 'google',
        voice: 'en-GB-Neural2-A',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      }),
    } as never)

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(previewQuestionAudioMock).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-GB-Neural2-A',
      locale: 'en-GB',
      text: QUESTION_AUDIO_PREVIEW_TEXT,
    })
    expect(json.locale).toBe('en-GB')
  })

  it('derives en-AU locale from the selected voice for preview requests', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: 'owner@example.com' } },
          error: null,
        }),
      },
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', slug: 'acme' })
    prismaMock.user.findUnique.mockResolvedValue({ accountId: 'acct_123', role: 'ADMIN', isActive: true })
    previewQuestionAudioMock.mockResolvedValue({
      buffer: Buffer.from('preview-audio'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    const { POST } = await import('@/app/api/app/question-audio/preview/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/question-audio/preview?account=acme'),
      json: async () => ({
        provider: 'google',
        voice: 'en-AU-Neural2-A',
        locale: 'en-US',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      }),
    } as never)

    const json = await response.json()

    expect(response.status).toBe(200)
    expect(previewQuestionAudioMock).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-AU-Neural2-A',
      locale: 'en-AU',
      text: QUESTION_AUDIO_PREVIEW_TEXT,
    })
    expect(json.locale).toBe('en-AU')
  })

  it('returns 403 when the authenticated user belongs to a different account', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: 'owner@example.com' } },
          error: null,
        }),
      },
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', slug: 'acme' })
    prismaMock.user.findUnique.mockResolvedValue({ accountId: 'acct_other', role: 'ADMIN', isActive: true })
    prismaMock.accountUserMembership.findUnique.mockResolvedValue(null)

    const { POST } = await import('@/app/api/app/question-audio/preview/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/question-audio/preview?account=acme'),
      json: async () => ({
        provider: 'google',
        voice: 'en-US-Neural2-J',
        locale: 'en-US',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      }),
    } as never)

    const json = await response.json()

    expect(response.status).toBe(403)
    expect(previewQuestionAudioMock).not.toHaveBeenCalled()
    expect(json).toEqual({ success: false, error: 'Forbidden' })
  })

  it('returns 400 when preview request validation fails', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: 'owner@example.com' } },
          error: null,
        }),
      },
    })
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', slug: 'acme' })
    prismaMock.user.findUnique.mockResolvedValue({ accountId: 'acct_123', role: 'ADMIN', isActive: true })

    const { POST } = await import('@/app/api/app/question-audio/preview/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/app/question-audio/preview?account=acme'),
      json: async () => ({
        provider: 'google',
        voice: '',
        locale: 'en-US',
      }),
    } as never)

    const json = await response.json()

    expect(response.status).toBe(400)
    expect(previewQuestionAudioMock).not.toHaveBeenCalled()
    expect(json.success).toBe(false)
    expect(json.error).toContain('voice')
    expect(json.error).toContain('text')
  })
})
