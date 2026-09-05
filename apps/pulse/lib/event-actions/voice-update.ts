import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { transcribeAudio, type TranscriptionResult } from '@/lib/transcription'

type VoiceUpdateDb = Pick<PrismaClient, 'eventActionUpdate'>
type VoiceTranscriber = (objectKey: string, mimeType: string) => Promise<TranscriptionResult>

export async function transcribeEventActionVoiceUpdate(
  input: { accountId: string; eventId: string; clusterId: string; updateId: string },
  db: VoiceUpdateDb = prisma,
  transcribe: VoiceTranscriber = transcribeAudio,
) {
  const update = await db.eventActionUpdate.findFirst({
    where: {
      id: input.updateId,
      accountId: input.accountId,
      eventId: input.eventId,
      clusterId: input.clusterId,
      kind: 'VOICE',
    },
  })
  if (!update?.voiceObjectKey || !update.voiceMimeType) return null
  if (update.voiceTranscriptionStatus === 'COMPLETED') return update

  await db.eventActionUpdate.update({
    where: { id: update.id },
    data: { voiceTranscriptionStatus: 'TRANSCRIBING', voiceFailureReason: null },
  })

  try {
    const result = await transcribe(update.voiceObjectKey, update.voiceMimeType)
    return await db.eventActionUpdate.update({
      where: { id: update.id },
      data: {
        voiceTranscript: result.text.trim(),
        voiceTranscriptionStatus: 'COMPLETED',
        voiceFailureReason: null,
      },
    })
  } catch (error) {
    await db.eventActionUpdate.update({
      where: { id: update.id },
      data: {
        voiceTranscriptionStatus: 'FAILED',
        voiceFailureReason: error instanceof Error ? error.message : 'Voice transcription failed',
      },
    })
    return null
  }
}
