import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSpeakerEvidenceWhere,
  resolveCanonicalEventSpeakerId,
} from './event-speaker-attribution'

describe('canonical Event speaker attribution', () => {
  it('uses answer identity before direct target and legacy assignment identity', () => {
    expect(resolveCanonicalEventSpeakerId({
      answerSpeakerId: 'speaker_answer',
      directTargetSpeakerId: 'speaker_direct',
      legacyTargetSpeakerId: 'speaker_legacy',
    })).toBe('speaker_answer')
    expect(resolveCanonicalEventSpeakerId({
      answerSpeakerId: 'speaker_invalid',
      answerSpeakerIsValid: false,
      directTargetSpeakerId: 'speaker_direct',
      legacyTargetSpeakerId: 'speaker_legacy',
    })).toBe('speaker_direct')
    expect(resolveCanonicalEventSpeakerId({ legacyTargetSpeakerId: 'speaker_legacy' })).toBe('speaker_legacy')
  })

  it('queries answer, direct SPEAKER target, and legacy assignment attribution', () => {
    const where = buildCanonicalSpeakerEvidenceWhere({ speakerId: 'speaker_amara', eventId: 'event_demo' })

    expect(where.OR).toHaveLength(3)
    expect(where.OR?.[0]).toEqual({ answer: { speakerId: 'speaker_amara' } })
    expect(where.OR?.[1]).toMatchObject({
      response: {
        OR: expect.arrayContaining([
          { surveyTarget: { category: 'SPEAKER', speakerId: 'speaker_amara' } },
        ]),
      },
    })
    expect(where.OR?.[2]).toMatchObject({
      response: {
        OR: expect.arrayContaining([
          { surveyTarget: { speakerAssignment: { speakerId: 'speaker_amara', eventId: 'event_demo' } } },
        ]),
      },
    })
    expect(JSON.stringify(where)).not.toContain('speaker_other')
  })

  it('keeps an explicit target scope on every attribution path', () => {
    const where = buildCanonicalSpeakerEvidenceWhere({
      speakerId: 'speaker_amara',
      eventId: 'event_demo',
      targetScope: { id: 'target_amara' },
    })

    expect(where.OR?.[0]).toMatchObject({
      AND: [
        { answer: { speakerId: 'speaker_amara' } },
        { response: { OR: expect.arrayContaining([{ surveyTarget: { id: 'target_amara' } }]) } },
      ],
    })
    expect(where.OR?.[1]).toMatchObject({
      response: { OR: expect.arrayContaining([{ surveyTarget: { id: 'target_amara', category: 'SPEAKER', speakerId: 'speaker_amara' } }]) },
    })
    expect(where.OR?.[2]).toMatchObject({
      response: { OR: expect.arrayContaining([{ surveyTarget: { id: 'target_amara', speakerAssignment: { speakerId: 'speaker_amara', eventId: 'event_demo' } } }]) },
    })
  })
})
