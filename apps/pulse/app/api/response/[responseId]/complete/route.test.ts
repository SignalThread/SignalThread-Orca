import { beforeEach, describe, expect, it, vi } from 'vitest'

const { completeResponseMock, MockResponseCompletionError } = vi.hoisted(() => ({
  completeResponseMock: vi.fn(),
  MockResponseCompletionError: class extends Error {
    constructor(message: string, public readonly status: number) {
      super(message)
    }
  },
}))

vi.mock('@/lib/event', () => ({
  completeResponse: completeResponseMock,
  ResponseCompletionError: MockResponseCompletionError,
}))

describe('POST /api/response/[responseId]/complete', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('marks a response complete through the canonical event helper', async () => {
    completeResponseMock.mockResolvedValue({
      id: 'resp_123',
      status: 'COMPLETED',
      completedAt: new Date('2026-01-01T12:00:00.000Z'),
    })

    const { POST } = await import('./route')
    const response = await POST({} as never, { params: { responseId: 'resp_123' } })

    expect(response.status).toBe(200)
    expect(completeResponseMock).toHaveBeenCalledWith('resp_123')
    const json = await response.json()
    expect(json.data).toMatchObject({ responseId: 'resp_123', status: 'COMPLETED' })
  })

  it('returns an explicit incomplete-response conflict', async () => {
    const { ResponseCompletionError } = await import('@/lib/event')
    completeResponseMock.mockRejectedValue(new ResponseCompletionError('Required questions are incomplete: rating', 409))

    const { POST } = await import('./route')
    const response = await POST({} as never, { params: { responseId: 'resp_missing' } })

    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.message).toBe('Required questions are incomplete: rating')
  })
})
