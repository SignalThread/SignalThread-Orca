import { describe, expect, it, vi } from 'vitest'
import { transcribeEventActionVoiceUpdate } from './voice-update'

function db(status: 'UPLOADED' | 'COMPLETED' = 'UPLOADED') {
  const eventActionUpdate = {
    findFirst: vi.fn().mockResolvedValue({
      id: 'update_1', accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      kind: 'VOICE', voiceObjectKey: 'event-actions/account_1/event_1/cluster_1/updates/update.webm',
      voiceMimeType: 'audio/webm', voiceTranscriptionStatus: status,
    }),
    update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'update_1', ...data })),
  }
  return { eventActionUpdate }
}

describe('event action voice transcription', () => {
  it('transcribes scoped action media without creating attendee answers', async () => {
    const database = db()
    const transcribe = vi.fn().mockResolvedValue({ text: 'Facilities moved the sign.' })
    await transcribeEventActionVoiceUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', updateId: 'update_1',
    }, database as never, transcribe)

    expect(database.eventActionUpdate.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', kind: 'VOICE' }),
    })
    expect(transcribe).toHaveBeenCalledWith(
      'event-actions/account_1/event_1/cluster_1/updates/update.webm', 'audio/webm',
    )
    expect(database.eventActionUpdate.update).toHaveBeenLastCalledWith({
      where: { id: 'update_1' },
      data: expect.objectContaining({ voiceTranscript: 'Facilities moved the sign.', voiceTranscriptionStatus: 'COMPLETED' }),
    })
    expect('answer' in database).toBe(false)
  })

  it('records a durable failure without contaminating attendee evidence', async () => {
    const database = db()
    await transcribeEventActionVoiceUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', updateId: 'update_1',
    }, database as never, vi.fn().mockRejectedValue(new Error('provider unavailable')))
    expect(database.eventActionUpdate.update).toHaveBeenLastCalledWith({
      where: { id: 'update_1' },
      data: { voiceTranscriptionStatus: 'FAILED', voiceFailureReason: 'provider unavailable' },
    })
  })

  it('does not retranscribe completed updates', async () => {
    const database = db('COMPLETED')
    const transcribe = vi.fn()
    await transcribeEventActionVoiceUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', updateId: 'update_1',
    }, database as never, transcribe)
    expect(transcribe).not.toHaveBeenCalled()
    expect(database.eventActionUpdate.update).not.toHaveBeenCalled()
  })
})
