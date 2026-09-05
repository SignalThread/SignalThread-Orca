import { SurveyTargetCategory, type Prisma } from '@prisma/client'
import { buildEffectiveResponseTargetWhere } from '@/lib/effective-response-target'

/**
 * Canonical speaker attribution order for persisted Events intelligence.
 * Answer identity wins, followed by the current direct SPEAKER target and the
 * legacy assignment-scoped target retained for historical data.
 */
export function resolveCanonicalEventSpeakerId(input: {
  answerSpeakerId?: string | null
  answerSpeakerIsValid?: boolean
  directTargetSpeakerId?: string | null
  legacyTargetSpeakerId?: string | null
}) {
  if (input.answerSpeakerId && input.answerSpeakerIsValid !== false) return input.answerSpeakerId
  return input.directTargetSpeakerId ?? input.legacyTargetSpeakerId ?? null
}

/** Prisma form of the same canonical attribution rule used by drilldowns. */
export function buildCanonicalSpeakerEvidenceWhere(input: {
  speakerId: string
  eventId: string
  targetScope?: Prisma.SurveyTargetWhereInput
}): Prisma.AnswerEventIntelligenceWhereInput {
  const targetScope = input.targetScope ?? {}
  const hasAdditionalTargetScope = Object.keys(targetScope).length > 0
  const answerAttribution: Prisma.AnswerEventIntelligenceWhereInput = hasAdditionalTargetScope
    ? {
        AND: [
          { answer: { speakerId: input.speakerId } },
          { response: buildEffectiveResponseTargetWhere(targetScope) },
        ],
      }
    : { answer: { speakerId: input.speakerId } }

  return {
    OR: [
      answerAttribution,
      {
        response: buildEffectiveResponseTargetWhere({
          ...targetScope,
          category: SurveyTargetCategory.SPEAKER,
          speakerId: input.speakerId,
        }),
      },
      {
        response: buildEffectiveResponseTargetWhere({
          ...targetScope,
          speakerAssignment: { speakerId: input.speakerId, eventId: input.eventId },
        }),
      },
    ],
  }
}
