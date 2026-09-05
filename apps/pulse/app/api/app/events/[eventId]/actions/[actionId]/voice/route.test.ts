import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireEventsEventAccessMock = vi.fn()
const getEventActionMock = vi.fn()
const addEventActionUpdateMock = vi.fn()
const presignPutMock = vi.fn()
const verifyObjectExistsMock = vi.fn()
const transcribeMock = vi.fn()

vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: requireEventsEventAccessMock }))
vi.mock('@/lib/event-actions/service', async () => ({
  ...(await vi.importActual<typeof import('@/lib/event-actions/service')>('@/lib/event-actions/service')),
  getEventAction: getEventActionMock,
  addEventActionUpdate: addEventActionUpdateMock,
}))
vi.mock('@/lib/event-actions/voice-update', () => ({ transcribeEventActionVoiceUpdate: transcribeMock }))
vi.mock('@/lib/objectStorage', () => ({
  getStorageConfig: vi.fn(() => ({ provider: 'test' })),
  presignPut: presignPutMock,
  verifyObjectExists: verifyObjectExistsMock,
}))

const params = { params: { eventId: 'event_1', actionId: 'cluster_1' } }
function request(body: unknown, account = 'events-co') {
  return { nextUrl: new URL(`http://localhost/api/app/events/event_1/actions/cluster_1/voice?account=${account}`), json: vi.fn().mockResolvedValue(body) } as never
}

describe('event action voice update route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.S3_BUCKET_NAME = 'test-bucket'
    requireEventsEventAccessMock.mockResolvedValue({ ok: true, userId: 'actor_1', account: { id: 'account_1' } })
    getEventActionMock.mockResolvedValue({ id: 'cluster_1' })
    presignPutMock.mockResolvedValue('https://storage.test/upload')
    verifyObjectExistsMock.mockResolvedValue(true)
    addEventActionUpdateMock.mockResolvedValue({ id: 'update_1' })
    transcribeMock.mockResolvedValue(undefined)
  })

  it('presigns only inside the authorized account, event, and action prefix', async () => {
    const { POST } = await import('./route')
    const response = await POST(request({ operation: 'PRESIGN', fileName: 'update.webm', fileSize: 12000, mimeType: 'audio/webm;codecs=opus' }), params)
    expect(response.status).toBe(200)
    expect(getEventActionMock).toHaveBeenCalledWith({ accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1' })
    expect(presignPutMock).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'test-bucket', key: expect.stringMatching(/^event-actions\/account_1\/event_1\/cluster_1\/updates\//), contentType: 'audio/webm',
    }))
  })

  it('confirms a real scoped object into EventActionUpdate and queues transcription', async () => {
    const { POST } = await import('./route')
    const objectKey = 'event-actions/account_1/event_1/cluster_1/updates/update.webm'
    const response = await POST(request({
      operation: 'CONFIRM', objectKey, mimeType: 'audio/webm', durationMs: 2200, idempotencyKey: 'voice-update-1',
    }), params)
    expect(response.status).toBe(202)
    expect(verifyObjectExistsMock).toHaveBeenCalledWith('test-bucket', objectKey)
    expect(addEventActionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1', kind: 'VOICE',
      voice: { objectKey, mimeType: 'audio/webm', durationMs: 2200 },
    }))
    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ updateId: 'update_1' }))
  })

  it('rejects cross-action keys before storage or persistence', async () => {
    const { POST } = await import('./route')
    const response = await POST(request({
      operation: 'CONFIRM', objectKey: 'event-actions/account_1/event_1/other/updates/update.webm',
      mimeType: 'audio/webm', durationMs: 2200, idempotencyKey: 'voice-update-2',
    }), params)
    expect(response.status).toBe(400)
    expect(verifyObjectExistsMock).not.toHaveBeenCalled()
    expect(addEventActionUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects unauthorized access without presigning', async () => {
    requireEventsEventAccessMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 404 }) })
    const { POST } = await import('./route')
    const response = await POST(request({ operation: 'PRESIGN', fileName: 'update.webm', fileSize: 12000, mimeType: 'audio/webm' }), params)
    expect(response.status).toBe(404)
    expect(presignPutMock).not.toHaveBeenCalled()
  })
})
