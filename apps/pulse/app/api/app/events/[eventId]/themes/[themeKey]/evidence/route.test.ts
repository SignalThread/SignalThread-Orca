import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, requireEventsEventAccessMock } = vi.hoisted(() => ({
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
    eventStructureItem: {
      findFirst: vi.fn(),
    },
    eventSpeakerProfile: {
      findFirst: vi.fn(),
    },
    survey: {
      findFirst: vi.fn(),
    },
    answerEventTheme: {
      findMany: vi.fn(),
    },
    eventIssueEvidence: {
      findMany: vi.fn(),
    },
  },
  requireEventsEventAccessMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: requireEventsEventAccessMock }))

const NON_EVENTS_ACCOUNT_TYPES = ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined] as const

const themeEvidenceRow = {
  themeKey: 'customer_engagement',
  label: 'Customer engagement',
  sentimentLabel: 'POSITIVE',
  confidence: 0.91,
  createdAt: new Date('2026-06-03T15:12:00.000Z'),
  intelligence: {
    answerId: 'answer_123',
    responseId: 'response_123',
    questionId: 'question_123',
    surveyTargetId: 'target_123',
    sentimentScore: 0.82,
    sentimentLabel: 'POSITIVE',
    createdAt: new Date('2026-06-03T15:10:00.000Z'),
    answer: {
      promptLabel: 'What worked well?',
      questionKey: 'worked_well',
      answerTranscript: {
        text: 'The networking prompts made it easy to meet other attendees after the keynote.',
      },
    },
    question: {
      id: 'question_123',
      key: 'worked_well',
      label: 'What worked well?',
    },
    surveyTarget: {
      id: 'target_123',
      name: 'Keynote',
      category: 'SESSION',
      eventStructureItem: { id: 'session_123', name: 'Opening Keynote' },
      speakerAssignment: {
        id: 'assignment_123',
        role: 'SPEAKER',
        speaker: { id: 'speaker_123', name: 'Ada Lovelace' },
      },
    },
    response: {
      id: 'response_123',
      anonymousId: 'anon_123',
      status: 'COMPLETED',
      startedAt: new Date('2026-06-03T15:00:00.000Z'),
      completedAt: new Date('2026-06-03T15:11:00.000Z'),
      surveyTarget: {
        id: 'target_123',
        name: 'Keynote',
        category: 'SESSION',
        eventStructureItem: { id: 'session_123', name: 'Opening Keynote' },
        speakerAssignment: {
          id: 'assignment_123',
          role: 'SPEAKER',
          speaker: { id: 'speaker_123', name: 'Ada Lovelace' },
        },
      },
      publicSurveyLink: null,
      survey: { surveyTarget: null },
    },
  },
}

describe('GET /api/app/events/[eventId]/themes/[themeKey]/evidence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventsEventAccessMock.mockResolvedValue({
      ok: true,
      account: { id: 'acct_123', accountType: 'EVENTS' },
      event: { id: 'event_123' },
    })
  })

  it('rejects callers without account membership', async () => {
    requireEventsEventAccessMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence?account=events-co') } as never,
      { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
    )
    expect(response.status).toBe(403)
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled()
  })

  it('requires an account query parameter', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.error).toBe('Account parameter required')
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled()
  })

  it('returns theme evidence rows for a matching event, account, and theme key', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
    prismaMock.eventSpeakerProfile.findFirst.mockResolvedValue({ id: 'speaker_123' })
    prismaMock.survey.findFirst.mockResolvedValue({
      id: 'survey_123',
      surveyTarget: { eventStructureItemId: null, eventStructureItem: null },
    })
    prismaMock.answerEventTheme.findMany.mockResolvedValue([themeEvidenceRow])

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence?account=events-co&surveyId=survey_123&surveyTargetId=target_123&questionId=question_123&speakerId=speaker_123'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(requireEventsEventAccessMock).toHaveBeenCalledWith('events-co', 'event_123')
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      eventId: 'event_123',
      themeKey: 'customer_engagement',
      themeLabel: 'Customer engagement',
      mentionCount: 1,
      evidence: [
        {
          themeKey: 'customer_engagement',
          themeLabel: 'Customer engagement',
          answerId: 'answer_123',
          responseId: 'response_123',
          questionId: 'question_123',
          surveyTargetId: 'target_123',
          transcriptSnippet: 'The networking prompts made it easy to meet other attendees after the keynote.',
          transcriptText: 'The networking prompts made it easy to meet other attendees after the keynote.',
          question: {
            id: 'question_123',
            key: 'worked_well',
            label: 'What worked well?',
            promptLabel: 'What worked well?',
          },
          target: {
            id: 'target_123',
            name: 'Keynote',
            category: 'SESSION',
            session: { id: 'session_123', name: 'Opening Keynote' },
            speaker: { assignmentId: 'assignment_123', id: 'speaker_123', name: 'Ada Lovelace', role: 'SPEAKER' },
          },
          response: {
            id: 'response_123',
            anonymousId: 'anon_123',
            status: 'COMPLETED',
            startedAt: '2026-06-03T15:00:00.000Z',
            completedAt: '2026-06-03T15:11:00.000Z',
          },
          sentimentScore: 0.82,
          sentimentLabel: 'POSITIVE',
          confidence: 0.91,
          createdAt: '2026-06-03T15:10:00.000Z',
        },
      ],
    })
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
    const evidenceQuery = prismaMock.answerEventTheme.findMany.mock.calls[0]?.[0]
    expect(evidenceQuery.where).toMatchObject({
      eventId: 'event_123',
      themeKey: 'customer_engagement',
      surveyId: 'survey_123',
      intelligence: {
        accountId: 'acct_123',
        eventId: 'event_123',
        surveyId: 'survey_123',
        questionId: 'question_123',
        AND: expect.arrayContaining([
          expect.objectContaining({ OR: expect.any(Array) }),
          { response: { collectionPhase: { in: [] } } },
        ]),
      },
    })
    const attribution = evidenceQuery.where.intelligence.AND[0]
    expect(attribution.OR).toHaveLength(3)
    expect(attribution.OR[0]).toMatchObject({
      AND: [
        { answer: { speakerId: 'speaker_123' } },
        { response: { OR: expect.arrayContaining([{ surveyTarget: { id: 'target_123' } }]) } },
      ],
    })
    expect(attribution.OR[1]).toMatchObject({
      response: { OR: expect.arrayContaining([{ surveyTarget: { id: 'target_123', category: 'SPEAKER', speakerId: 'speaker_123' } }]) },
    })
    expect(attribution.OR[2]).toMatchObject({
      response: { OR: expect.arrayContaining([{ surveyTarget: { id: 'target_123', speakerAssignment: { speakerId: 'speaker_123', eventId: 'event_123' } } }]) },
    })
    expect(prismaMock.survey.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'survey_123',
        eventId: 'event_123',
      },
      select: {
        id: true,
        surveyTarget: {
          select: {
            eventStructureItemId: true,
            eventStructureItem: {
              select: { kind: true },
            },
          },
        },
        publicSurveyLinks: {
          select: {
            surveyTarget: {
              select: {
                eventStructureItemId: true,
                eventStructureItem: {
                  select: { kind: true },
                },
              },
            },
          },
        },
      },
    })
    expect(prismaMock.eventSpeakerProfile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'speaker_123',
        accountId: 'acct_123',
        isArchived: false,
        sessionAssignments: { some: { eventId: 'event_123' } },
      },
      select: { id: true },
    })
  })

  it('returns the union of evidence taxonomy keys for a consolidated finding', async () => {
    prismaMock.answerEventTheme.findMany.mockResolvedValue([themeEvidenceRow])
    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/networking_and_expo/evidence?account=events-co&themeKeys=networking,networking_and_expo'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'networking_and_expo' } },
    )

    expect(response.status).toBe(200)
    expect(prismaMock.answerEventTheme.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_123',
        themeKey: { in: ['networking_and_expo', 'networking'] },
      }),
    }))
  })

  it('uses exact persisted issue-cluster evidence for post-event findings', async () => {
    const issueEvidence = {
      clusterId: 'cluster_wayfinding', answerId: 'answer_issue', responseId: 'response_issue', questionId: 'question_issue', surveyTargetId: 'target_123',
      transcriptSnippet: 'The blocked sign sent us around the expo floor twice.', sentimentScore: -0.7, createdAt: new Date('2026-06-03T15:12:00.000Z'),
      cluster: { taxonomyKey: 'wayfinding', title: 'Expo wayfinding needs attention', confidence: 0.88 },
      question: { id: 'question_issue', key: 'what_changed', label: 'What should change?' },
      surveyTarget: themeEvidenceRow.intelligence.surveyTarget,
      response: themeEvidenceRow.intelligence.response,
    }
    prismaMock.eventIssueEvidence.findMany.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      ...issueEvidence,
      answerId: `answer_issue_${index}`,
      responseId: `response_issue_${index}`,
    })))
    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/event_123/themes/wayfinding/evidence?account=events-co&issueClusterIds=cluster_wayfinding') } as never,
      { params: { eventId: 'event_123', themeKey: 'wayfinding' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toMatchObject({
      themeLabel: 'Expo wayfinding needs attention',
      mentionCount: 4,
    })
    expect(json.data.evidence).toHaveLength(4)
    expect(json.data.evidence[0]).toMatchObject({ answerId: 'answer_issue_0', responseId: 'response_issue_0', transcriptText: 'The blocked sign sent us around the expo floor twice.' })
    expect(prismaMock.eventIssueEvidence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ eventId: 'event_123', accountId: 'acct_123', clusterId: { in: ['cluster_wayfinding'] } }),
    }))
    expect(prismaMock.answerEventTheme.findMany).not.toHaveBeenCalled()
  })

  it('returns four Amara evidence rows from the same two responses as the consolidated finding', async () => {
    prismaMock.eventSpeakerProfile.findFirst.mockResolvedValue({ id: 'speaker_amara' })
    const directTarget = {
      id: 'target_amara',
      name: 'Amara Okafor',
      category: 'SPEAKER',
      eventStructureItem: null,
      speakerAssignment: null,
    }
    const evidenceRows = [
      ['theme_1', 'speaker_clarity_engagement', 'Speaker clarity and engagement', 'answer_1_feedback', 'response_1'],
      ['theme_2', 'speaker_clarity_engagement_rating', 'Speaker clarity and engagement rating', 'answer_1_rating', 'response_1'],
      ['theme_3', 'speaker_clarity_engagement', 'Speaker clarity and engagement', 'answer_2_feedback', 'response_2'],
      ['theme_4', 'speaker_clarity_engagement_rating', 'Speaker clarity and engagement rating', 'answer_2_rating', 'response_2'],
    ].map(([id, themeKey, label, answerId, responseId], index) => ({
      ...themeEvidenceRow,
      id,
      themeKey,
      label,
      createdAt: new Date(`2026-09-18T18:0${index}:00.000Z`),
      intelligence: {
        ...themeEvidenceRow.intelligence,
        answerId,
        responseId,
        surveyTargetId: 'target_amara',
        answer: {
          ...themeEvidenceRow.intelligence.answer,
          answerTranscript: { text: `${label} source for ${responseId}` },
        },
        surveyTarget: directTarget,
        response: {
          ...themeEvidenceRow.intelligence.response,
          id: responseId,
          surveyTarget: directTarget,
          publicSurveyLink: null,
          survey: { surveyTarget: null },
        },
      },
    }))
    prismaMock.answerEventTheme.findMany.mockResolvedValue(evidenceRows)

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')
    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/speaker_clarity_engagement/evidence?account=events-co&speakerId=speaker_amara&themeKeys=speaker_clarity_engagement,speaker_clarity_engagement_rating'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'speaker_clarity_engagement' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.data.mentionCount).toBe(4)
    expect(json.data.evidence.map((row: { answerId: string }) => row.answerId)).toEqual([
      'answer_1_feedback', 'answer_1_rating', 'answer_2_feedback', 'answer_2_rating',
    ])
    expect(new Set(json.data.evidence.map((row: { responseId: string }) => row.responseId))).toEqual(
      new Set(['response_1', 'response_2']),
    )
    expect(prismaMock.answerEventTheme.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        themeKey: { in: ['speaker_clarity_engagement', 'speaker_clarity_engagement_rating'] },
        intelligence: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.any(Array) }),
            { response: { collectionPhase: { in: [] } } },
          ]),
        }),
      }),
    }))
  })

  it('excludes speaker-attributed rows from a generic session evidence request', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({ id: 'session_123' })
    prismaMock.answerEventTheme.findMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')
    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence?account=events-co&eventStructureItemId=session_123'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
    )

    expect(response.status).toBe(200)
    const evidenceQuery = prismaMock.answerEventTheme.findMany.mock.calls[0]?.[0]
    const attribution = evidenceQuery.where.intelligence.AND[0]
    expect(attribution.response.OR).toContainEqual({
      surveyTarget: {
        eventStructureItemId: 'session_123',
        speakerAssignmentId: null,
      },
    })
  })

  it('rejects theme evidence for a survey outside the event', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
    prismaMock.survey.findFirst.mockResolvedValue(null)

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence?account=events-co&surveyId=survey_other'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.error).toBe('Survey not found for this event')
    expect(prismaMock.answerEventTheme.findMany).not.toHaveBeenCalled()
  })

  it('rejects a speaker evidence filter outside the current account and event', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
    prismaMock.eventSpeakerProfile.findFirst.mockResolvedValue(null)

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')
    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence?account=events-co&speakerId=speaker_other'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: 'Speaker not found for this event' })
    expect(prismaMock.answerEventTheme.findMany).not.toHaveBeenCalled()
  })

  it('rejects non-EVENTS accounts before loading theme evidence', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      requireEventsEventAccessMock.mockResolvedValue({
        ok: true,
        account: { id: 'acct_123', accountType },
        event: { id: 'event_123' },
      })

      const response = await GET(
        {
          nextUrl: new URL('http://localhost/api/app/events/event_123/themes/customer_engagement/evidence?account=retail-co'),
        } as never,
        { params: { eventId: 'event_123', themeKey: 'customer_engagement' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.error).toBe('Event intelligence is only available for EVENTS accounts')
      expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
      expect(prismaMock.answerEventTheme.findMany).not.toHaveBeenCalled()
    }
  })

  it('rejects mismatched account and event cleanly', async () => {
    requireEventsEventAccessMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Event not found or access denied' }), { status: 404 }),
    })

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/other_event/themes/customer_engagement/evidence?account=events-co'),
      } as never,
      { params: { eventId: 'other_event', themeKey: 'customer_engagement' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.error).toBe('Event not found or access denied')
    expect(prismaMock.answerEventTheme.findMany).not.toHaveBeenCalled()
  })

  it('returns a clean empty state when no source rows exist', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.event.findFirst.mockResolvedValue({ id: 'event_123' })
    prismaMock.answerEventTheme.findMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/app/events/[eventId]/themes/[themeKey]/evidence/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/themes/audience_energy/evidence?account=events-co'),
      } as never,
      { params: { eventId: 'event_123', themeKey: 'audience_energy' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      data: {
        eventId: 'event_123',
        themeKey: 'audience_energy',
        themeLabel: 'Audience Energy',
        mentionCount: 0,
        evidence: [],
      },
    })
  })
})
