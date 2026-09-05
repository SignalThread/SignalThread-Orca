import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEventIntelligenceSummary,
  parseEventIntelligenceFilters,
} from './aggregation'

const now = new Date('2026-06-02T12:00:00.000Z')

function createDbMock() {
  return {
    $transaction: vi.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
    account: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'account_123',
        accountType: 'EVENTS',
      }),
    },
    event: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'event_123',
        name: 'WEC Voice Survey',
        status: 'ACTIVE',
        eventType: 'SURVEY',
        startDate: null,
        endDate: null,
        location: { timezone: null },
      }),
    },
    survey: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'survey_123',
        surveyTarget: {
          eventStructureItemId: 'structure_123',
          eventStructureItem: { kind: 'SESSION' },
        },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    eventStructureItem: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'structure_123',
        kind: 'SESSION',
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    answerEventIntelligence: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    answerEventTheme: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    answerEventAction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    surveyTarget: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    question: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    response: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    answer: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    eventIssueCluster: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
}

function intelligenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intel_1',
    surveyId: 'survey_123',
    surveyTargetId: 'target_123',
    responseId: 'response_1',
    answerId: 'answer_1',
    questionId: 'question_1',
    sentimentLabel: 'MIXED',
    sentimentScore: 0,
    urgency: 'LOW',
    recommendedAction: null,
    confidence: 0.75,
    createdAt: new Date('2026-06-02T10:00:00.000Z'),
    surveyTarget: {
      id: 'target_123',
      name: 'Main Stage',
      category: 'EVENT',
      slug: 'main-stage',
    },
    question: {
      id: 'question_1',
      key: 'q1',
      label: 'What was valuable?',
      order: 0,
    },
    themes: [],
    actions: [],
    ...overrides,
  }
}

describe('getEventIntelligenceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enforces account-scoped event access before aggregation', async () => {
    const db = createDbMock()

    await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
    }, db as never)

    expect(db.account.findUnique).toHaveBeenCalledWith({
      where: { slug: 'events-co' },
      select: { id: true, accountType: true },
    })
    expect(db.event.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'event_123',
        location: {
          accountId: 'account_123',
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        eventType: true,
        startDate: true,
        endDate: true,
        location: { select: { timezone: true } },
      },
    })
  })

  it('reuses authorized account and event context from the route', async () => {
    const db = createDbMock()

    await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
      authorized: {
        account: { id: 'account_123', accountType: 'EVENTS' },
        event: {
          id: 'event_123',
          name: 'WEC Voice Survey',
          status: 'ACTIVE',
          eventType: 'SURVEY',
          startDate: null,
          endDate: null,
          location: { timezone: null },
        },
      },
    }, db as never)

    expect(db.account.findUnique).not.toHaveBeenCalled()
    expect(db.event.findFirst).not.toHaveBeenCalled()
  })

  it('returns safe defaults for an empty event', async () => {
    const db = createDbMock()

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
    }, db as never)

    expect(summary).toMatchObject({
      eventId: 'event_123',
      eventName: 'WEC Voice Survey',
      responseCount: 0,
      capturedAnswerCount: 0,
      answerCount: 0,
      avgSentiment: null,
      highUrgencyCount: 0,
      topThemes: [],
      topActions: [],
      targetBreakdown: [],
      questionBreakdown: [],
      urgentIssues: [],
      attentionQueue: [],
      structuredMetrics: [],
      pagination: {
        attention: { limit: 25, hasMore: false, nextCursor: null },
      },
      eventPulse: {
        status: 'NO_DATA',
        sentimentLabel: 'NO_DATA',
        urgency: 'NO_DATA',
        priorityLevel: 'Informational',
      },
    })
  })

  it('adds scoped structured metrics without returning reconciliation candidates', async () => {
    const db = createDbMock()
    db.question.findMany.mockResolvedValue([{
      id: 'question_rating', key: 'rating', label: 'How was registration?', order: 0, type: 'RATING_1_TO_5',
    }])
    db.survey.findMany.mockResolvedValue([{ id: 'survey_123', name: 'Arrival pulse' }])
    db.eventStructureItem.findMany.mockResolvedValue([{
      id: 'structure_123', kind: 'SESSION', name: 'Registration hall',
    }])
    db.surveyTarget.findMany.mockResolvedValue([{
      id: 'target_123', name: 'Registration', category: 'EVENT', slug: 'registration', eventStructureItemId: 'structure_123',
    }])
    db.response.findMany.mockResolvedValue([1, 2, 3].map((_, index) => ({
      id: `response_${index}`,
      completedAt: new Date(`2026-06-02T11:5${index}:00.000Z`),
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
    })))
    db.answer.findMany.mockResolvedValue([
      ...[1, 2, 2].map((numericValue, index) => ({
        id: `answer_${index}`,
        responseId: `response_${index}`,
        questionId: 'question_rating',
        numericValue,
        createdAt: new Date(`2026-06-02T11:5${index}:00.000Z`),
      })),
    ])

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
      now,
    }, db as never)

    expect(summary.structuredMetrics).toHaveLength(1)
    expect(summary.structuredMetrics[0]).toMatchObject({
      questionId: 'question_rating',
      count: 3,
      average: 1.67,
      distribution: { '1': 1, '2': 2, '3': 0, '4': 0, '5': 0 },
      eventStructureItemId: 'structure_123',
      sampleStrength: { level: 'DIRECTIONAL' },
    })
    expect(summary).not.toHaveProperty('signalCandidates')
    expect(db.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'COMPLETED',
        numericValue: { not: null },
        question: expect.objectContaining({ type: { in: ['RATING_1_TO_5', 'RECOMMENDATION_0_TO_10', 'YES_NO'] } }),
        response: expect.objectContaining({
          eventId: 'event_123',
          status: 'COMPLETED',
          event: { location: { accountId: 'account_123' } },
        }),
      }),
    }))
  })

  it('aggregates normalized event intelligence rows into dashboard summaries', async () => {
    const db = createDbMock()
    db.response.count.mockResolvedValue(2)
    db.eventIssueCluster.findMany.mockResolvedValue([
      {
        id: 'cluster_1',
        taxonomyKey: 'access_checkin',
        title: 'Shorten registration lines',
        summary: 'Operational pattern detected in access checkin feedback.',
        priorityLevel: 'Immediate',
        legacyUrgency: 'HIGH',
        impactScore: 1,
        timeSensitivityScore: 1,
        confidence: 0.9,
        evidenceCount: 2,
        firstSeenAt: new Date('2026-06-02T09:00:00.000Z'),
        lastSeenAt: new Date('2026-06-02T11:00:00.000Z'),
        recommendedNextStep: 'Shorten registration lines',
        status: 'NEW',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        questionId: 'question_2',
        surveyTarget: {
          id: 'target_123',
          name: 'Main Stage',
          category: 'EVENT',
        },
        question: {
          id: 'question_2',
          key: 'q2',
          label: 'What could improve?',
          order: 1,
        },
        evidence: [
          {
            id: 'evidence_1',
            responseId: 'response_1',
            answerId: 'answer_2',
            questionId: 'question_2',
            surveyTargetId: 'target_123',
            transcriptSnippet: 'Badge pickup was slow and the line was too long.',
            sentimentScore: -0.7,
            priorityLevel: 'Immediate',
            createdAt: new Date('2026-06-02T11:00:00.000Z'),
          },
        ],
      },
    ])
    db.answerEventIntelligence.findMany.mockResolvedValue([
      intelligenceRow({
        id: 'intel_1',
        responseId: 'response_1',
        answerId: 'answer_1',
        sentimentScore: 0.8,
        urgency: 'LOW',
        themes: [
          { themeKey: 'session_content', label: 'Session Content', sentimentLabel: 'POSITIVE', confidence: 0.8 },
        ],
        actions: [
          {
            id: 'action_1',
            title: 'Share the strongest session format',
            description: null,
            priority: 'LOW',
            urgency: 'LOW',
            actionWindow: 'LATER',
            status: 'OPEN',
            confidence: 0.7,
            answerId: 'answer_1',
            surveyId: 'survey_123',
            surveyTargetId: 'target_123',
            createdAt: new Date('2026-06-02T09:00:00.000Z'),
          },
        ],
      }),
      intelligenceRow({
        id: 'intel_2',
        responseId: 'response_1',
        answerId: 'answer_2',
        questionId: 'question_2',
        sentimentScore: -0.7,
        urgency: 'HIGH',
        question: {
          id: 'question_2',
          key: 'q2',
          label: 'What could improve?',
          order: 1,
        },
        themes: [
          { themeKey: 'registration_lines', label: 'Registration Lines', sentimentLabel: 'NEGATIVE', confidence: 0.9 },
        ],
        actions: [
          {
            id: 'action_2',
            title: 'Shorten registration lines',
            description: 'Add more badge pickup stations.',
            priority: 'HIGH',
            urgency: 'HIGH',
            actionWindow: 'IMMEDIATE',
            status: 'OPEN',
            confidence: 0.85,
            answerId: 'answer_2',
            surveyId: 'survey_123',
            surveyTargetId: 'target_123',
            createdAt: new Date('2026-06-02T11:00:00.000Z'),
          },
        ],
      }),
      intelligenceRow({
        id: 'intel_3',
        responseId: 'response_2',
        answerId: 'answer_3',
        sentimentScore: -0.2,
        urgency: 'MEDIUM',
        themes: [
          { themeKey: 'registration_lines', label: 'Registration Lines', sentimentLabel: 'MIXED', confidence: 0.7 },
        ],
        actions: [],
      }),
    ])

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
    }, db as never)

    expect(summary.responseCount).toBe(2)
    expect(summary.answerCount).toBe(3)
    expect(summary.avgSentiment).toBe(-0.033)
    expect(summary.highUrgencyCount).toBe(1)
    expect(summary.eventPulse).toMatchObject({
      status: 'ATTENTION',
      sentimentLabel: 'POSITIVE',
      urgency: 'HIGH',
      priorityLevel: 'Immediate',
    })
    expect(summary.topThemes[0]).toMatchObject({
      themeKey: 'registration_lines',
      label: 'Registration Lines',
      count: 2,
    })
    expect(summary.topActions[0]).toMatchObject({
      themeKey: 'registration_lines',
      title: 'Shorten registration lines',
      priority: 'HIGH',
      urgency: 'HIGH',
      priorityLevel: 'Immediate',
    })
    expect(summary.targetBreakdown[0]).toMatchObject({
      surveyTargetId: 'target_123',
      name: 'Main Stage',
      responseCount: 2,
      answerCount: 3,
      highUrgencyCount: 1,
    })
    expect(summary.questionBreakdown).toHaveLength(2)
    expect(summary.urgentIssues[0]).toMatchObject({
      id: 'action_2',
      title: 'Shorten registration lines',
      priority: 'HIGH',
      priorityLevel: 'Immediate',
    })
    expect(summary.attentionQueue[0]).toMatchObject({
      id: 'cluster_1',
      taxonomyKey: 'access_checkin',
      title: 'Shorten registration lines',
      priorityLevel: 'Immediate',
      legacyUrgency: 'HIGH',
      evidenceCount: 1,
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      questionId: 'question_2',
      affectedTarget: {
        id: 'target_123',
        name: 'Main Stage',
      },
      affectedQuestion: {
        id: 'question_2',
        key: 'q2',
      },
      representativeEvidence: [],
    })
    expect(summary.activeAttentionCount).toBe(1)
  })

  it('preserves rich analysis, question context, and answer provenance in canonical theme findings', async () => {
    const db = createDbMock()
    db.response.count.mockResolvedValue(2)
    db.answerEventIntelligence.findMany.mockResolvedValue([
      intelligenceRow({
        id: 'intel_1', responseId: 'response_1', answerId: 'answer_1', sentimentLabel: 'POSITIVE', sentimentScore: 0.8,
        answer: { promptLabel: 'What was most valuable?', answerAnalysis: { summary: 'I valued the structured introductions because they led to useful peer conversations.' } },
        themes: [{ id: 'theme_1', themeKey: 'networking', label: 'Networking', sentimentLabel: 'POSITIVE', confidence: 0.85 }],
      }),
      intelligenceRow({
        id: 'intel_2', responseId: 'response_2', answerId: 'answer_2', sentimentLabel: 'POSITIVE', sentimentScore: 0.7,
        answer: { promptLabel: 'What was most valuable?', answerAnalysis: { summary: 'I appreciated the quality of the networking conversations.' } },
        themes: [{ id: 'theme_2', themeKey: 'networking', label: 'Networking', sentimentLabel: 'POSITIVE', confidence: 0.8 }],
      }),
    ])

    const summary = await getEventIntelligenceSummary({ accountSlug: 'events-co', eventId: 'event_123' }, db as never)

    expect(summary.topThemes[0]).toMatchObject({
      themeKey: 'networking',
      label: 'Networking',
      statement: 'A few attendees appreciated the quality of the networking conversations.',
      questionIntent: 'strength',
      supportingAnswerIds: ['answer_1', 'answer_2'],
      supportingResponseIds: ['response_1', 'response_2'],
      supportingEvidenceIds: ['theme_1', 'theme_2'],
      evidence: { evidenceTier: 'EMERGING', uniqueAnalyzedResponseCount: 2 },
    })
    expect(summary.canonicalFindings).toEqual([
      expect.objectContaining({
        title: 'Networking',
        semanticDimension: 'networking_quality',
        supportingAnswerIds: ['answer_1', 'answer_2'],
        evidenceThemeKeys: ['networking'],
      }),
    ])
  })

  it('counts scoped event responses independently from analysis completion', async () => {
    const db = createDbMock()
    db.response.count.mockResolvedValue(12)
    db.answer.count.mockResolvedValue(18)
    db.answerEventIntelligence.findMany.mockResolvedValue([
      intelligenceRow({ responseId: 'response_analyzed' }),
    ])

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
      now,
      filters: {
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        eventStructureItemId: 'structure_123',
        structureKind: 'SESSION',
        days: 7,
      },
    }, db as never)

    expect(summary.responseCount).toBe(12)
    expect(summary.capturedAnswerCount).toBe(18)
    expect(summary.answerCount).toBe(1)
    expect(db.response.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        eventId: 'event_123',
        status: 'COMPLETED',
        surveyId: 'survey_123',
        AND: expect.arrayContaining([
          expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { id: 'target_123' } }]) }),
          expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { eventStructureItemId: 'structure_123', eventStructureItem: { kind: 'SESSION' } } }]) }),
        ]),
        startedAt: { gte: new Date('2026-05-26T12:00:00.000Z') },
      }),
    })
    expect(db.answer.count).toHaveBeenCalledWith({
      where: {
        response: expect.objectContaining({
          eventId: 'event_123',
          status: 'COMPLETED',
          surveyId: 'survey_123',
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { id: 'target_123' } }]) }),
            expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { eventStructureItemId: 'structure_123', eventStructureItem: { kind: 'SESSION' } } }]) }),
          ]),
          startedAt: { gte: new Date('2026-05-26T12:00:00.000Z') },
        }),
      },
    })
    expect(db.answerEventIntelligence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        response: expect.objectContaining({
          eventId: 'event_123',
          status: 'COMPLETED',
          surveyId: 'survey_123',
        }),
      }),
    }))
    expect(db.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        response: expect.objectContaining({
          eventId: 'event_123',
          status: 'COMPLETED',
          surveyId: 'survey_123',
        }),
      }),
    }))
  })

  it('keeps pre-event intelligence isolated from During and Post evidence, including issue clusters', async () => {
    const db = createDbMock()
    const event = {
      id: 'event_123', name: 'WEC Voice Survey', status: 'ACTIVE', eventType: 'SURVEY',
      startDate: new Date('2026-09-17T13:00:00.000Z'),
      endDate: new Date('2026-09-18T22:00:00.000Z'),
      location: { timezone: 'America/New_York' },
    }

    await getEventIntelligenceSummary({
      accountSlug: 'events-co', eventId: 'event_123', lifecyclePhase: 'PRE_EVENT',
      authorized: { account: { id: 'account_123', accountType: 'EVENTS' }, event },
    }, db as never)

    const preCohort = { collectionPhase: { in: ['PRE'] } }
    expect(db.response.count).toHaveBeenCalledWith({
      where: expect.objectContaining(preCohort),
    })
    expect(db.answerEventIntelligence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ response: expect.objectContaining(preCohort) }),
    }))
    expect(db.eventIssueCluster.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ evidence: { some: { response: preCohort } } }),
    }))
  })

  it('returns attendee-authored questions from analyzed PRE evidence', async () => {
    const db = createDbMock()
    db.response.count.mockResolvedValue(1)
    db.answerEventIntelligence.findMany.mockResolvedValue([intelligenceRow({
      answer: {
        promptLabel: 'What question do you want speakers to answer?',
        answerTranscript: { text: 'How are companies measuring ROI from AI initiatives?' },
        answerAnalysis: { summary: 'How are companies measuring ROI from AI initiatives?' },
      },
    })])
    const event = {
      id: 'event_123', name: 'WEC Voice Survey', status: 'ACTIVE', eventType: 'SURVEY',
      startDate: new Date('2026-09-17T13:00:00.000Z'), endDate: new Date('2026-09-18T22:00:00.000Z'),
      location: { timezone: 'America/New_York' },
    }

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co', eventId: 'event_123', lifecyclePhase: 'PRE_EVENT',
      authorized: { account: { id: 'account_123', accountType: 'EVENTS' }, event },
    }, db as never)

    expect(summary.attendeeQuestions).toEqual(['How are companies measuring ROI from AI initiatives?'])
    expect(db.answerEventIntelligence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ response: expect.objectContaining({ collectionPhase: { in: ['PRE'] } }) }),
    }))
  })

  it('uses explicit DURING evidence in the live view and DURING + POST evidence in the Post view', async () => {
    const db = createDbMock()
    const event = {
      id: 'event_123', name: 'WEC Voice Survey', status: 'ACTIVE', eventType: 'SURVEY',
      startDate: new Date('2026-09-17T13:00:00.000Z'),
      endDate: new Date('2026-09-18T22:00:00.000Z'),
      location: { timezone: 'America/New_York' },
    }

    await getEventIntelligenceSummary({
      accountSlug: 'events-co', eventId: 'event_123', lifecyclePhase: 'IN_EVENT',
      authorized: { account: { id: 'account_123', accountType: 'EVENTS' }, event },
    }, db as never)
    expect(db.response.count).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ collectionPhase: { in: ['DURING'] } }),
    })

    await getEventIntelligenceSummary({
      accountSlug: 'events-co', eventId: 'event_123', lifecyclePhase: 'POST_EVENT',
      authorized: { account: { id: 'account_123', accountType: 'EVENTS' }, event },
    }, db as never)
    expect(db.response.count).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ collectionPhase: { in: ['DURING', 'POST'] } }),
    })
  })

  it('includes active configured targets without evidence in the coverage denominator', async () => {
    const db = createDbMock()
    db.response.count.mockResolvedValue(1)
    db.surveyTarget.findMany.mockResolvedValue([
      { id: 'target_123', name: 'Main Stage', category: 'EVENT', slug: 'main-stage', eventStructureItemId: null },
      { id: 'target_empty', name: 'Quiet Room', category: 'SESSION', slug: 'quiet-room', eventStructureItemId: null },
    ])
    db.answerEventIntelligence.findMany.mockResolvedValue([intelligenceRow({ sentimentScore: 0.8 })])

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
    }, db as never)

    expect(summary.targetBreakdown).toHaveLength(2)
    expect(summary.targetBreakdown.find((target) => target.surveyTargetId === 'target_empty')).toMatchObject({
      responseCount: 0,
      answerCount: 0,
      avgSentiment: null,
    })
    expect(db.surveyTarget.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: 'event_123', isActive: true },
    }))
  })

  it('excludes resolved and dismissed clusters from active attention counts', async () => {
    const db = createDbMock()
    const clusterBase = {
      taxonomyKey: 'access_checkin',
      title: 'Shorten registration lines',
      summary: null,
      priorityLevel: 'Immediate',
      legacyUrgency: 'HIGH',
      impactScore: 1,
      timeSensitivityScore: 1,
      confidence: 0.9,
      evidenceCount: 1,
      firstSeenAt: new Date('2026-06-02T09:00:00.000Z'),
      lastSeenAt: new Date('2026-06-02T11:00:00.000Z'),
      recommendedNextStep: null,
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      questionId: 'question_2',
      surveyTarget: null,
      question: null,
      evidence: [],
    }
    db.eventIssueCluster.findMany.mockResolvedValue([
      { ...clusterBase, id: 'cluster_new', status: 'NEW' },
      { ...clusterBase, id: 'cluster_investigating', status: 'INVESTIGATING' },
      { ...clusterBase, id: 'cluster_monitoring', status: 'MONITORING' },
      { ...clusterBase, id: 'cluster_resolved', status: 'RESOLVED' },
      { ...clusterBase, id: 'cluster_dismissed', status: 'DISMISSED' },
    ])

    const summary = await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
    }, db as never)

    expect(summary.attentionQueue).toHaveLength(5)
    expect(summary.activeAttentionCount).toBe(3)
    expect(db.eventIssueCluster.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 26,
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    }))
  })

  it('applies supported filters to normalized intelligence queries', async () => {
    const db = createDbMock()

    await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
      now,
      filters: {
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        questionId: 'question_123',
        sentimentLabel: 'NEGATIVE',
        urgency: 'HIGH',
        days: 7,
      },
    }, db as never)

    expect(db.answerEventIntelligence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'account_123',
          eventId: 'event_123',
          surveyId: 'survey_123',
          questionId: 'question_123',
          sentimentLabel: 'NEGATIVE',
          urgency: 'HIGH',
          response: {
            eventId: 'event_123',
            status: 'COMPLETED',
            collectionPhase: { in: [] },
            surveyId: 'survey_123',
            AND: expect.arrayContaining([
              expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { id: 'target_123' } }]) }),
            ]),
            startedAt: {
              gte: new Date('2026-05-26T12:00:00.000Z'),
            },
            answerEventIntelligence: {
              some: {
                questionId: 'question_123',
                sentimentLabel: 'NEGATIVE',
                urgency: 'HIGH',
              },
            },
          },
        }),
      }),
    )
    expect(db.eventIssueCluster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'account_123',
          eventId: 'event_123',
          surveyId: 'survey_123',
          surveyTargetId: 'target_123',
          questionId: 'question_123',
          lastSeenAt: {
            gte: new Date('2026-05-26T12:00:00.000Z'),
          },
        }),
      }),
    )
    expect(db.survey.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'survey_123',
        eventId: 'event_123',
      },
      select: expect.objectContaining({
        id: true,
        surveyTarget: {
          select: {
            eventStructureItemId: true,
            eventStructureItem: {
              select: {
                kind: true,
              },
            },
          },
        },
      }),
    }))
  })

  it('applies EventStructureItem filters to normalized intelligence rows and clusters', async () => {
    const db = createDbMock()

    await getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
      now,
      filters: {
        eventStructureItemId: 'structure_123',
        structureKind: 'SESSION',
      },
    }, db as never)

    expect(db.eventStructureItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'structure_123',
        eventId: 'event_123',
        event: {
          location: {
            accountId: 'account_123',
          },
        },
      },
      select: {
        id: true,
        kind: true,
      },
    })
    expect(db.answerEventIntelligence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_123',
          response: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { eventStructureItemId: 'structure_123', eventStructureItem: { kind: 'SESSION' } } }]) }),
            ]),
          }),
        }),
      }),
    )
    expect(db.eventIssueCluster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event_123',
          surveyTarget: {
            eventStructureItemId: 'structure_123',
            eventStructureItem: {
              kind: 'SESSION',
            },
          },
        }),
      }),
    )
  })

  it('rejects a survey filter that does not belong to the selected event', async () => {
    const db = createDbMock()
    db.survey.findFirst.mockResolvedValue(null)

    await expect(getEventIntelligenceSummary({
      accountSlug: 'events-co',
      eventId: 'event_123',
      filters: {
        surveyId: 'survey_other',
      },
    }, db as never)).rejects.toMatchObject({
      message: 'Survey not found for this event',
      status: 404,
    })

    expect(db.answerEventIntelligence.findMany).not.toHaveBeenCalled()
    expect(db.eventIssueCluster.findMany).not.toHaveBeenCalled()
  })

  it('rejects retail accounts before querying event intelligence rows', async () => {
    const db = createDbMock()
    db.account.findUnique.mockResolvedValue({
      id: 'account_123',
      accountType: 'RETAIL',
    })

    await expect(getEventIntelligenceSummary({
      accountSlug: 'retail-co',
      eventId: 'event_123',
    }, db as never)).rejects.toMatchObject({
      message: 'Event intelligence is only available for EVENTS accounts',
      status: 403,
    })

    expect(db.event.findFirst).not.toHaveBeenCalled()
    expect(db.answerEventIntelligence.findMany).not.toHaveBeenCalled()
    expect(db.eventIssueCluster.findMany).not.toHaveBeenCalled()
  })
})

describe('parseEventIntelligenceFilters', () => {
  it('normalizes query-string filters', () => {
    const filters = parseEventIntelligenceFilters(new URLSearchParams({
      surveyId: ' survey_123 ',
      surveyTargetId: 'target_123',
      questionId: 'question_123',
      eventStructureItemId: 'structure_123',
      structureKind: 'AREA',
      sentimentLabel: 'negative',
      urgency: 'high',
      days: '14',
    }))

    expect(filters).toEqual({
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      questionId: 'question_123',
      eventStructureItemId: 'structure_123',
      structureKind: 'AREA',
      sentimentLabel: 'NEGATIVE',
      urgency: 'HIGH',
      days: 14,
    })
  })
})
