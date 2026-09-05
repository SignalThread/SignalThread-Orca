import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildEventSpeakerIntelligence, getEventSpeakerIntelligence } from '@/lib/event-speaker-intelligence'

const speakers = [
  {
    id: 'speaker_ada', name: 'Ada Lovelace', title: 'CTO', organization: 'Analytical Engines',
    assignments: [{
      id: 'assignment_ada', role: 'SPEAKER',
      session: { id: 'session_keynote', name: 'Opening Keynote', startsAt: new Date('2026-09-17T14:00:00.000Z'), endsAt: new Date('2026-09-17T15:00:00.000Z'), timezone: 'America/New_York' },
    }],
  },
  {
    id: 'speaker_grace', name: 'Grace Hopper', title: null, organization: null,
    assignments: [{
      id: 'assignment_grace', role: 'MODERATOR',
      session: { id: 'session_panel', name: 'Operator Panel', startsAt: null, endsAt: null, timezone: null },
    }],
  },
]

function intelligence(surveyTargetId: string, index: number) {
  return {
    surveyTargetId,
    responseId: `response_${index}`,
    answerId: `answer_${index}`,
    confidence: 0.9,
    themes: [{ themeKey: 'practical_examples', label: 'Practical examples', sentimentLabel: 'POSITIVE', confidence: 0.88 }],
  }
}

describe('event speaker intelligence', () => {
  it('uses the exact speaker assignment and agenda session as the only attribution authority', () => {
    const result = buildEventSpeakerIntelligence({
      eventId: 'event_1',
      speakers,
      targets: [
        { id: 'target_generic', eventStructureItemId: 'session_keynote', speakerAssignmentId: null, responseCount: 25 },
        { id: 'target_wrong_session', eventStructureItemId: 'session_panel', speakerAssignmentId: 'assignment_ada', responseCount: 20 },
        { id: 'target_ada', eventStructureItemId: 'session_keynote', speakerAssignmentId: 'assignment_ada', responseCount: 3 },
      ],
      intelligence: [intelligence('target_generic', 1), intelligence('target_wrong_session', 2), intelligence('target_ada', 3)],
    })

    expect(result.provenance).toContain('SurveyTarget.speakerId')
    expect(result.speakers[0]).toMatchObject({
      id: 'speaker_ada', responseCount: 3, analyzedAnswerCount: 1, evidenceState: 'NOT_ENOUGH',
      speakerSpecificTargetIds: ['target_ada'],
    })
    expect(result.speakers[0].findings).toEqual([expect.objectContaining({ themeKey: 'practical_examples', responseCount: 1 })])
    expect(result.speakers[1]).toMatchObject({
      id: 'speaker_grace', responseCount: 0, findings: [],
      evidenceLabel: 'No analyzed feedback yet',
    })
  })

  it('returns the canonical emerging tier from analyzed responses', () => {
    const result = buildEventSpeakerIntelligence({
      eventId: 'event_1', speakers: speakers.slice(0, 1),
      targets: [{ id: 'target_ada', eventStructureItemId: 'session_keynote', speakerAssignmentId: 'assignment_ada', responseCount: 2 }],
      intelligence: [intelligence('target_ada', 1), intelligence('target_ada', 2)],
    })
    expect(result.speakers[0]).toMatchObject({ evidenceState: 'DIRECTIONAL' })
    expect(result.speakers[0].findings[0].evidence).toMatchObject({ evidenceTier: 'EMERGING', uniqueAnalyzedResponseCount: 2 })
  })

  it('never ranks or compares speakers and preserves canonical assignment order', () => {
    const result = buildEventSpeakerIntelligence({ eventId: 'event_1', speakers, targets: [], intelligence: [] })
    expect(result.speakers.map((speaker) => speaker.name)).toEqual(['Ada Lovelace', 'Grace Hopper'])
    expect(JSON.stringify(result)).not.toMatch(/leaderboard|rank/i)
    expect(result.speakers[0].sessions[0]).toMatchObject({ assignmentId: 'assignment_ada', id: 'session_keynote', role: 'SPEAKER' })
  })

  it('matches the seeded Amara invariant across qualitative and rating evidence', () => {
    const amara = [{
      ...speakers[0],
      id: 'speaker_amara',
      name: 'Amara Okafor',
      assignments: speakers[0].assignments.map((assignment) => ({ ...assignment, id: 'assignment_amara' })),
    }]
    const result = buildEventSpeakerIntelligence({
      eventId: 'event_1', speakers: amara,
      targets: [{
        id: 'target_amara', category: 'SPEAKER' as const, speakerId: 'speaker_amara',
        eventStructureItemId: null, speakerAssignmentId: null, responseCount: 2,
        responseIds: ['response_1', 'response_2'],
      }],
      intelligence: [
        { ...intelligence('target_amara', 1), answerId: 'answer_1_feedback', speakerId: 'speaker_amara', themes: [{ id: 'theme_1', themeKey: 'speaker_clarity_engagement', label: 'Speaker clarity and engagement', sentimentLabel: 'POSITIVE', confidence: 0.88 }] },
        { ...intelligence('target_amara', 1), answerId: 'answer_1_rating', speakerId: 'speaker_amara', themes: [{ id: 'theme_2', themeKey: 'speaker_clarity_engagement_rating', label: 'Speaker clarity and engagement rating', sentimentLabel: 'POSITIVE', confidence: 0.9 }] },
        { ...intelligence('target_amara', 2), answerId: 'answer_2_feedback', speakerId: 'speaker_amara', themes: [{ id: 'theme_3', themeKey: 'speaker_clarity_engagement', label: 'Speaker clarity and engagement', sentimentLabel: 'POSITIVE', confidence: 0.88 }] },
        { ...intelligence('target_amara', 2), answerId: 'answer_2_rating', speakerId: 'speaker_amara', themes: [{ id: 'theme_4', themeKey: 'speaker_clarity_engagement_rating', label: 'Speaker clarity and engagement rating', sentimentLabel: 'POSITIVE', confidence: 0.9 }] },
      ],
    })
    expect(result.speakers[0].findings).toEqual([
      expect.objectContaining({
        label: 'Speaker clarity and engagement', mentionCount: 4, responseCount: 2,
        themeKeys: ['speaker_clarity_engagement', 'speaker_clarity_engagement_rating'],
      }),
    ])
  })

  it('attributes session-survey speaker ratings by Answer.speakerId without leakage or double counting', () => {
    const sessionSpeakers = speakers.map((speaker, index) => ({
      ...speaker,
      assignments: [{
        ...speaker.assignments[0],
        id: `assignment_${index}`,
        session: { ...speaker.assignments[0].session, id: 'session_panel', name: 'Operator Panel' },
      }],
    }))
    const result = buildEventSpeakerIntelligence({
      eventId: 'event_1',
      speakers: sessionSpeakers,
      targets: [],
      intelligence: [],
      speakerAnswers: [
        { id: 'answer_ada', responseId: 'response_shared', speakerId: 'speaker_ada', sessionId: 'session_panel', numericValue: 5 },
        { id: 'answer_grace', responseId: 'response_shared', speakerId: 'speaker_grace', sessionId: 'session_panel', numericValue: 3 },
        { id: 'answer_wrong_session', responseId: 'response_wrong', speakerId: 'speaker_ada', sessionId: 'session_other', numericValue: 1 },
      ],
    })

    expect(result.speakers[0]).toMatchObject({
      id: 'speaker_ada', responseCount: 1, hasSpeakerQuestion: true,
      speakerRatingCount: 1, speakerRatingAverage: 5, evidenceState: 'NOT_ENOUGH',
    })
    expect(result.speakers[1]).toMatchObject({
      id: 'speaker_grace', responseCount: 1, hasSpeakerQuestion: true,
      speakerRatingCount: 1, speakerRatingAverage: 3, evidenceState: 'NOT_ENOUGH',
    })
    expect(result.summary).toMatchObject({ speakersWithFeedbackCount: 2, speakerSpecificResponseCount: 2 })
  })

  it('deduplicates a completed response reached through direct-target and answer attribution', () => {
    const result = buildEventSpeakerIntelligence({
      eventId: 'event_1',
      speakers: speakers.slice(0, 1),
      targets: [{
        id: 'target_ada', category: 'SPEAKER' as const, speakerId: 'speaker_ada',
        eventStructureItemId: null, speakerAssignmentId: null,
        responseCount: 1, responseIds: ['response_1'],
      }],
      intelligence: [],
      speakerAnswers: [{
        id: 'answer_ada', responseId: 'response_1', speakerId: 'speaker_ada',
        sessionId: 'session_keynote', numericValue: 4,
      }],
    })

    expect(result.speakers[0]).toMatchObject({
      responseCount: 1, speakerSpecificTargetIds: ['target_ada'],
      speakerRatingCount: 1, speakerRatingAverage: 4,
    })
  })

  it('uses answer attribution once when intelligence is also reachable through a target', () => {
    const attributed = {
      ...intelligence('target_ada', 1),
      speakerId: 'speaker_ada',
      sessionId: 'session_keynote',
    }
    const result = buildEventSpeakerIntelligence({
      eventId: 'event_1',
      speakers: speakers.slice(0, 1),
      targets: [{
        id: 'target_ada', category: 'SPEAKER' as const, speakerId: 'speaker_ada',
        eventStructureItemId: null, speakerAssignmentId: null, responseCount: 1,
      }],
      intelligence: [attributed, { ...attributed }],
    })

    expect(result.speakers[0].analyzedAnswerCount).toBe(1)
    expect(result.speakers[0].findings[0]).toMatchObject({ mentionCount: 1, responseCount: 1 })
  })

  it('loads only completed event/session-scoped speaker-feedback answers for attribution', async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({
        id: 'event_1', name: 'Summit', eventType: 'ADVANCED', status: 'ACTIVE',
        startDate: new Date('2026-09-17T13:00:00.000Z'), endDate: new Date('2026-09-17T21:00:00.000Z'),
        location: { accountId: 'account_1', timezone: 'America/New_York' },
      }) },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([{
        id: 'speaker_ada', name: 'Ada Lovelace', title: 'CTO', organization: 'Analytical Engines',
        sessionAssignments: [{
          id: 'assignment_ada', role: 'SPEAKER',
          session: { id: 'session_keynote', name: 'Opening Keynote', startsAt: null, endsAt: null, timezone: 'America/New_York' },
        }],
      }]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([]) },
      answerEventIntelligence: { findMany: vi.fn().mockResolvedValue([]) },
      answer: { findMany: vi.fn().mockResolvedValue([{
        id: 'answer_ada', responseId: 'response_1', speakerId: 'speaker_ada', numericValue: 5,
        response: { surveyTarget: { eventStructureItemId: 'session_keynote' } },
      }]) },
    }

    const result = await getEventSpeakerIntelligence({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(db.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        speakerId: { in: ['speaker_ada'] },
        numericValue: { not: null },
        status: 'COMPLETED',
        question: expect.objectContaining({ eventId: 'event_1', type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS' }),
        response: expect.objectContaining({
          eventId: 'event_1', status: 'COMPLETED',
          surveyTarget: { eventId: 'event_1', category: 'SESSION' },
        }),
      }),
    }))
    expect(result.speakers[0]).toMatchObject({
      responseCount: 1, speakerRatingCount: 1, speakerRatingAverage: 5,
    })
  })

  it('adds a nullable, production-safe canonical relation without inferring legacy evidence', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')
    const migration = readFileSync('prisma/migrations/20260730170000_add_speaker_scoped_listening_target/migration.sql', 'utf8')
    expect(schema).toContain('speakerAssignmentId  String?')
    expect(schema).toContain('@relation("SurveyTargetSpeakerAssignment"')
    expect(migration).toContain('ADD COLUMN "speakerAssignmentId" TEXT')
    expect(migration).toContain('ON DELETE SET NULL')
    expect(migration).not.toMatch(/UPDATE "SurveyTarget"/)
  })
})
