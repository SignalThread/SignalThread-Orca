import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { jsonRequest } from '@/tests/helpers/route'

const { requireAuthenticatedPulseUserMock, createMock } = vi.hoisted(() => ({
  requireAuthenticatedPulseUserMock: vi.fn(),
  createMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-authenticated-user', () => ({ requireAuthenticatedPulseUser: requireAuthenticatedPulseUserMock }))
vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } }
  },
}))

describe('POST /api/ai/generate-questions (access boundary)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-key'
    createMock.mockResolvedValue({ choices: [{ message: { content: '["How was your visit?"]' } }] })
  })

  it('refuses anonymous callers before spending on the model', async () => {
    requireAuthenticatedPulseUserMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    })
    const { POST } = await import('./route')
    const response = await POST(jsonRequest({ body: { businessType: 'coffee shop', goal: 'reviews' } }))
    expect(response.status).toBe(401)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('refuses a Supabase identity that is not an active Pulse user', async () => {
    requireAuthenticatedPulseUserMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    })
    const { POST } = await import('./route')
    const response = await POST(jsonRequest({ body: { businessType: 'coffee shop' } }))
    expect(response.status).toBe(403)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('generates for an active Pulse organizer with the retail payload unchanged', async () => {
    requireAuthenticatedPulseUserMock.mockResolvedValue({ ok: true, userId: 'user_1', email: 'owner@a.test', isSuperAdmin: false })
    const { POST } = await import('./route')
    const response = await POST(jsonRequest({ body: { businessType: 'coffee shop', goal: 'reviews' } }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(['How was your visit?'])
    expect(createMock).toHaveBeenCalledTimes(1)
  })
})
