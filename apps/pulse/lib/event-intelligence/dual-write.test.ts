import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeEventIntelligenceForAnalyzedAnswer } from './dual-write'
import type { AnalysisResult } from '@/lib/analysis'

const { prismaMock, txMock } = vi.hoisted(() => {
  const prismaMock = {
    answer: {
      findUnique: vi.fn(),
    },
    answerEventIntelligence: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  const txMock = {
    answerEventIntelligence: {
      upsert: vi.fn(),
    },
    answerEventTheme: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    answerEventEntity: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    answerEventAction: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    eventIssueCluster: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    eventIssueEvidence: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  }

  return { prismaMock, txMock }
})

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

const baseAnalysis: AnalysisResult = {
  summary: 'Attendees liked the content but want shorter registration lines.',
  sentiment: 'MIXED',
  sentimentScore: -0.35,
  themes: ['Session Content', 'Registration Lines'],
  actionItems: [{ text: 'Shorten registration lines', priority: 'High' }],
  keyQuote: 'The content was great but check-in was slow',
}

function answerContext(overrides: {
  accountType?: string
  surveyId?: string | null
  surveyTargetId?: string | null
  publicLinkTargetId?: string | null
  surveyFallbackTargetId?: string | null
  questionId?: string | null
  collectionPhase?: 'PRE' | 'DURING' | 'POST' | null
} = {}) {
  const questionId = Object.prototype.hasOwnProperty.call(overrides, 'questionId')
    ? overrides.questionId
    : 'question_123'

  return {
    id: 'answer_123',
    responseId: 'response_123',
    questionId,
    response: {
      id: 'response_123',
      eventId: 'event_123',
      surveyId: overrides.surveyId ?? null,
      surveyTargetId: overrides.surveyTargetId ?? null,
      publicSurveyLinkId: null,
      collectionPhase: overrides.collectionPhase ?? (overrides.accountType === 'EVENTS' ? 'DURING' : null),
      surveyTarget: overrides.surveyTargetId ? { id: overrides.surveyTargetId, category: 'SESSION', name: 'Response target', eventStructureItemId: 'session_response' } : null,
      publicSurveyLink: overrides.publicLinkTargetId ? { surveyTarget: { id: overrides.publicLinkTargetId, category: 'SESSION', name: 'Link target', eventStructureItemId: 'session_link' } } : null,
      survey: overrides.surveyFallbackTargetId ? { surveyTarget: { id: overrides.surveyFallbackTargetId, category: 'SESSION', name: 'Survey target', eventStructureItemId: 'session_survey' } } : null,
      event: {
        id: 'event_123',
        locationId: 'location_123',
        location: {
          id: 'location_123',
          accountId: 'account_123',
          account: {
            id: 'account_123',
            accountType: overrides.accountType ?? 'RETAIL',
          },
        },
      },
    },
  }
}

describe('writeEventIntelligenceForAnalyzedAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    txMock.answerEventIntelligence.upsert.mockResolvedValue({ id: 'intel_123' })
    txMock.answerEventTheme.deleteMany.mockResolvedValue({ count: 0 })
    txMock.answerEventEntity.deleteMany.mockResolvedValue({ count: 0 })
    txMock.answerEventAction.deleteMany.mockResolvedValue({ count: 0 })
    txMock.answerEventTheme.createMany.mockResolvedValue({ count: 0 })
    txMock.answerEventEntity.createMany.mockResolvedValue({ count: 0 })
    txMock.answerEventAction.createMany.mockResolvedValue({ count: 0 })
    txMock.eventIssueCluster.upsert.mockResolvedValue({
      id: 'cluster_123',
      firstSeenAt: new Date('2026-06-03T10:00:00.000Z'),
    })
    txMock.eventIssueCluster.update.mockResolvedValue({})
    txMock.eventIssueEvidence.upsert.mockResolvedValue({})
    txMock.eventIssueEvidence.findMany.mockResolvedValue([
      {
        priorityLevel: 'Immediate',
        createdAt: new Date('2026-06-03T10:00:00.000Z'),
      },
    ])
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock))
    prismaMock.answerEventIntelligence.deleteMany.mockResolvedValue({ count: 0 })
  })

  it('does not write normalized intelligence for legacy retail answers', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(answerContext())

    const result = await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Retail customer feedback.',
      analysis: baseAnalysis,
      promptVersion: 'review-synopsis-fast-v1',
      model: 'gpt-4o-mini',
    })

    expect(result).toEqual({ wrote: false, reason: 'not_event_intelligence_scope' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.answerEventIntelligence.upsert).not.toHaveBeenCalled()
  })

  it('writes answer intelligence, themes, and actions for survey-scoped event answers', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'EVENTS',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
      }),
    )

    const result = await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'The content was great but check-in was slow.',
      analysis: baseAnalysis,
      promptVersion: 'review-synopsis-fast-v1',
      model: 'gpt-4o-mini',
    })

    expect(result).toEqual({ wrote: true, intelligenceId: 'intel_123' })
    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalledWith({
      where: { answerId: 'answer_123' },
      create: expect.objectContaining({
        accountId: 'account_123',
        locationId: 'location_123',
        eventId: 'event_123',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        responseId: 'response_123',
        answerId: 'answer_123',
        questionId: 'question_123',
        sentimentLabel: 'MIXED',
        sentimentScore: -0.35,
        urgency: 'HIGH',
        frictionCategory: 'access_checkin',
        actionWindow: 'IMMEDIATE',
        recommendedAction: 'Shorten registration lines',
        promptVersion: 'review-synopsis-fast-v1',
        model: 'gpt-4o-mini',
      }),
      update: expect.objectContaining({
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        questionId: 'question_123',
        sentimentLabel: 'MIXED',
      }),
    })
    expect(txMock.answerEventTheme.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          intelligenceId: 'intel_123',
          themeKey: 'session_content',
          label: 'Session Content',
          surveyId: 'survey_123',
          surveyTargetId: 'target_123',
        }),
      ]),
    })
    expect(txMock.answerEventAction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          intelligenceId: 'intel_123',
          title: 'Shorten registration lines',
          priority: 'HIGH',
          urgency: 'HIGH',
          actionWindow: 'IMMEDIATE',
        }),
      ],
    })
    expect(txMock.eventIssueCluster.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clusterKey: 'event_123:DURING:access_checkin:target_123:question_123:shorten_registration_lines',
        },
        create: expect.objectContaining({
          accountId: 'account_123',
          locationId: 'location_123',
          eventId: 'event_123',
          surveyId: 'survey_123',
          surveyTargetId: 'target_123',
          questionId: 'question_123',
          taxonomyKey: 'access_checkin',
          title: 'Shorten registration lines',
          priorityLevel: 'Immediate',
          legacyUrgency: 'HIGH',
          evidenceCount: 0,
          recommendedNextStep: 'Shorten registration lines',
          status: 'NEW',
        }),
      }),
    )
    expect(txMock.eventIssueEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clusterId_answerId: {
            clusterId: 'cluster_123',
            answerId: 'answer_123',
          },
        },
        create: expect.objectContaining({
          clusterId: 'cluster_123',
          accountId: 'account_123',
          locationId: 'location_123',
          eventId: 'event_123',
          surveyId: 'survey_123',
          surveyTargetId: 'target_123',
          responseId: 'response_123',
          answerId: 'answer_123',
          questionId: 'question_123',
          sentimentScore: -0.35,
          priorityLevel: 'Immediate',
        }),
      }),
    )
  })

  it('removes prior derived intelligence and writes no themes for insufficient Event evidence', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(answerContext({
      accountType: 'EVENTS', surveyId: 'survey_123', surveyTargetId: 'target_123',
    }))

    const result = await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Lancaster PA',
      analysis: {
        evidenceState: 'INSUFFICIENT_EVIDENCE', summary: '', sentiment: 'NEUTRAL', sentimentScore: 0,
        themes: [], actionItems: [], keyQuote: '',
      },
      promptVersion: 'events-analysis-v2.0',
      model: 'gpt-5.6-sol',
    }, prismaMock as never)

    expect(result).toEqual({ wrote: false, reason: 'insufficient_evidence' })
    expect(prismaMock.answerEventIntelligence.deleteMany).toHaveBeenCalledWith({ where: { answerId: 'answer_123' } })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.answerEventTheme.createMany).not.toHaveBeenCalled()
    expect(txMock.answerEventIntelligence.upsert).not.toHaveBeenCalled()
  })

  it('writes the immutable response target through every downstream intelligence row', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(answerContext({
      accountType: 'EVENTS',
      surveyId: 'shared_survey',
      surveyTargetId: 'opening_target',
      publicLinkTargetId: 'breakout_b_target',
      surveyFallbackTargetId: 'breakout_a_target',
    }))

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123', transcriptText: 'Breakout B feedback.', analysis: baseAnalysis,
      promptVersion: 'review-synopsis-fast-v1', model: 'gpt-4o-mini',
    })

    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ surveyTargetId: 'opening_target' }),
      update: expect.objectContaining({ surveyTargetId: 'opening_target' }),
    }))
    expect(txMock.answerEventTheme.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ surveyTargetId: 'opening_target' })]) })
    expect(txMock.answerEventAction.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ surveyTargetId: 'opening_target' })]) })
  })

  it('does not write event intelligence rows for survey-scoped non-EVENTS answers', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'RETAIL',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
      }),
    )

    const result = await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Retail survey feedback with survey linkage.',
      analysis: baseAnalysis,
      promptVersion: 'review-synopsis-fast-v1',
      model: 'gpt-4o-mini',
    })

    expect(result).toEqual({ wrote: false, reason: 'not_event_intelligence_scope' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(txMock.answerEventIntelligence.upsert).not.toHaveBeenCalled()
    expect(txMock.answerEventTheme.createMany).not.toHaveBeenCalled()
    expect(txMock.answerEventAction.createMany).not.toHaveBeenCalled()
    expect(txMock.eventIssueCluster.upsert).not.toHaveBeenCalled()
    expect(txMock.eventIssueEvidence.upsert).not.toHaveBeenCalled()
  })

  it('uses event extraction output to create normalized actions, entities, clusters, and evidence', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'EVENTS',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
      }),
    )

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'The microphone kept cutting out in Room A and attendees could not hear the panel.',
      analysis: {
        ...baseAnalysis,
        themes: [],
        actionItems: [],
        sentiment: 'NEGATIVE',
        sentimentScore: -0.5,
      },
      eventExtraction: {
        taxonomyKey: 'room_environment_av',
        taxonomyLabel: 'Room environment and AV',
        priorityLevel: 'Soon',
        impactScore: 0.78,
        timeSensitivityScore: 0.72,
        recommendedNextStep: 'Send AV staff to verify room setup and sound levels',
        actionWindow: 'NEXT_24_HOURS',
        representativeSnippet: 'The microphone kept cutting out in Room A.',
        confidence: 0.88,
        entities: ['Panel Audio'],
        mentions: {
          sponsors: [],
          exhibitors: [],
          sessions: ['Main Stage Panel'],
          locations: ['Room A'],
        },
      },
      promptVersion: 'event-command-center-v1',
      model: 'gpt-4o-mini',
    })

    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          frictionCategory: 'room_environment_av',
          urgency: 'MEDIUM',
          actionWindow: 'NEXT_24_HOURS',
          recommendedAction: 'Send AV staff to verify room setup and sound levels',
          confidence: 0.88,
        }),
      }),
    )
    expect(txMock.answerEventTheme.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          themeKey: 'room_environment_and_av',
          label: 'Room environment and AV',
        }),
      ],
    })
    expect(txMock.answerEventAction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          title: 'Send AV staff to verify room setup and sound levels',
          priority: 'MEDIUM',
          urgency: 'MEDIUM',
          actionWindow: 'NEXT_24_HOURS',
          confidence: 0.88,
        }),
      ],
    })
    expect(txMock.answerEventEntity.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entityType: 'ENTITY',
          label: 'Panel Audio',
        }),
        expect.objectContaining({
          entityType: 'SESSION',
          label: 'Main Stage Panel',
        }),
        expect.objectContaining({
          entityType: 'LOCATION',
          label: 'Room A',
        }),
      ]),
    })
    expect(txMock.eventIssueCluster.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clusterKey: 'event_123:DURING:room_environment_av:target_123:question_123:send_av_staff_to_verify_room_setup_and_sound_levels',
        },
      }),
    )
    expect(txMock.eventIssueEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          transcriptSnippet: 'The microphone kept cutting out in Room A.',
          priorityLevel: 'Soon',
        }),
      }),
    )
  })

  it('does not create a noisy issue cluster for positive event extraction', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'EVENTS',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
      }),
    )

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'The keynote was excellent and the speaker was inspiring.',
      analysis: {
        ...baseAnalysis,
        sentiment: 'POSITIVE',
        sentimentScore: 0.85,
        themes: ['Keynote'],
        actionItems: [],
      },
      eventExtraction: {
        taxonomyKey: 'general_positive',
        taxonomyLabel: 'General positive feedback',
        priorityLevel: 'Informational',
        impactScore: 0.15,
        timeSensitivityScore: 0.1,
        recommendedNextStep: null,
        actionWindow: null,
        representativeSnippet: 'The keynote was excellent.',
        confidence: 0.82,
        entities: [],
        mentions: {
          sponsors: [],
          exhibitors: [],
          sessions: ['Keynote'],
          locations: [],
        },
      },
      promptVersion: 'event-command-center-v1',
      model: 'gpt-4o-mini',
    })

    expect(txMock.answerEventAction.createMany).not.toHaveBeenCalled()
    expect(txMock.eventIssueCluster.upsert).not.toHaveBeenCalled()
    expect(txMock.eventIssueEvidence.upsert).not.toHaveBeenCalled()
  })

  it('uses account type EVENTS as a dual-write condition even without surveyId', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(answerContext({ accountType: 'EVENTS' }))

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Event-level feedback.',
      analysis: baseAnalysis,
      promptVersion: 'review-synopsis-fast-v1',
      model: 'gpt-4o-mini',
    })

    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalled()
  })

  it('uses the same deterministic cluster key for repeated similar operational issues', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'EVENTS',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
      }),
    )

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Registration line was long and badge pickup was slow.',
      analysis: baseAnalysis,
      promptVersion: 'event-command-center-v1',
      model: 'gpt-4o-mini',
    })
    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Badge pickup line was still too slow.',
      analysis: {
        ...baseAnalysis,
        actionItems: [{ text: 'Shorten registration lines', priority: 'High' }],
      },
      promptVersion: 'event-command-center-v1',
      model: 'gpt-4o-mini',
    })

    expect(txMock.eventIssueCluster.upsert).toHaveBeenCalledTimes(2)
    expect(txMock.eventIssueCluster.upsert.mock.calls.map((call) => call[0].where.clusterKey)).toEqual([
      'event_123:DURING:access_checkin:target_123:question_123:shorten_registration_lines',
      'event_123:DURING:access_checkin:target_123:question_123:shorten_registration_lines',
    ])
  })

  it('does not escalate negative sentiment alone into high urgency', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'EVENTS',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
      }),
    )

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'The breakout topic did not land for me and felt disappointing.',
      analysis: {
        ...baseAnalysis,
        sentiment: 'NEGATIVE',
        sentimentScore: -0.85,
        themes: ['Session Content'],
        actionItems: [],
      },
      promptVersion: 'event-command-center-v1',
      model: 'gpt-4o-mini',
    })

    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          urgency: 'LOW',
          frictionCategory: 'session_content_speakers',
          actionWindow: null,
          recommendedAction: null,
        }),
      }),
    )
    expect(txMock.answerEventAction.createMany).not.toHaveBeenCalled()
    expect(txMock.eventIssueCluster.upsert).not.toHaveBeenCalled()
    expect(txMock.eventIssueEvidence.upsert).not.toHaveBeenCalled()
  })

  it('is idempotent and replaces child rows on recompute', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(answerContext({ accountType: 'EVENTS', surveyId: 'survey_123' }))

    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'First run',
      analysis: baseAnalysis,
      promptVersion: 'review-synopsis-fast-v1',
      model: 'gpt-4o-mini',
    })
    await writeEventIntelligenceForAnalyzedAnswer({
      answerId: 'answer_123',
      transcriptText: 'Second run',
      analysis: {
        ...baseAnalysis,
        themes: ['Wayfinding'],
        actionItems: [{ text: 'Add clearer hallway signs', priority: 'Medium' }],
      },
      promptVersion: 'review-synopsis-fast-v1',
      model: 'gpt-4o-mini',
    })

    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalledTimes(2)
    expect(txMock.answerEventTheme.deleteMany).toHaveBeenCalledTimes(2)
    expect(txMock.answerEventEntity.deleteMany).toHaveBeenCalledTimes(2)
    expect(txMock.answerEventAction.deleteMany).toHaveBeenCalledTimes(2)
    expect(txMock.answerEventTheme.createMany.mock.calls[1][0]).toEqual({
      data: [
        expect.objectContaining({
          themeKey: 'wayfinding',
          label: 'Wayfinding',
        }),
      ],
    })
    expect(txMock.answerEventAction.createMany.mock.calls[1][0]).toEqual({
      data: [
        expect.objectContaining({
          title: 'Add clearer hallway signs',
          priority: 'MEDIUM',
        }),
      ],
    })
  })

  it('handles missing optional survey target and question context', async () => {
    prismaMock.answer.findUnique.mockResolvedValue(
      answerContext({
        accountType: 'EVENTS',
        surveyId: 'survey_123',
        surveyTargetId: null,
        questionId: null,
      }),
    )

    await expect(
      writeEventIntelligenceForAnalyzedAnswer({
        answerId: 'answer_123',
        transcriptText: 'Survey feedback with missing optional links.',
        analysis: baseAnalysis,
        promptVersion: 'review-synopsis-fast-v1',
        model: 'gpt-4o-mini',
      }),
    ).resolves.toEqual({ wrote: true, intelligenceId: 'intel_123' })

    expect(txMock.answerEventIntelligence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          surveyTargetId: null,
          questionId: null,
        }),
      }),
    )
  })
})
