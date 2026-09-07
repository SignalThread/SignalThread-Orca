import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, requireEventsEventAccessMock } = vi.hoisted(() => ({
  prismaMock: {
    account: {
      findUnique: vi.fn(),
    },
    eventIssueEvidence: {
      findFirst: vi.fn(),
    },
  },
  requireEventsEventAccessMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
vi.mock('@/lib/auth/require-events-event-access', () => ({ requireEventsEventAccess: requireEventsEventAccessMock }))

const NON_EVENTS_ACCOUNT_TYPES = ['RETAIL', 'HOSPITALITY', 'UNKNOWN', null, undefined] as const

const evidenceRow = {
  id: 'evidence_123',
  clusterId: 'cluster_123',
  eventId: 'event_123',
  responseId: 'response_123',
  answerId: 'answer_123',
  questionId: 'question_123',
  surveyTargetId: 'target_123',
  transcriptSnippet: 'The registration line wrapped around the lobby.',
  sentimentScore: -0.72,
  priorityLevel: 'Immediate',
  createdAt: new Date('2026-06-03T15:10:00.000Z'),
  cluster: {
    title: 'Add more registration staff',
    taxonomyKey: 'access_checkin',
    recommendedNextStep: 'Add two more badge pickup stations near the entrance.',
  },
  answer: {
    promptLabel: 'What could we improve?',
    questionKey: 'improve',
    answerTranscript: {
      text: 'The registration line wrapped around the lobby and made me miss the first session.',
    },
  },
  question: {
    id: 'question_123',
    key: 'improve',
    label: 'What could we improve?',
  },
  surveyTarget: {
    id: 'target_123',
    name: 'Registration desk',
    category: 'Access',
  },
  response: {
    surveyTarget: {
      id: 'target_123',
      name: 'Registration desk',
      category: 'Access',
    },
    publicSurveyLink: null,
    survey: { surveyTarget: null },
  },
}

describe('GET /api/app/events/[eventId]/evidence/[evidenceId]', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireEventsEventAccessMock.mockResolvedValue({
      ok: true,
      account: { id: 'acct_123', slug: 'events-co' },
      event: {
        id: 'event_123',
        startDate: new Date('2099-09-10T09:00:00.000Z'),
        endDate: new Date('2099-09-12T17:00:00.000Z'),
        location: { timezone: 'America/New_York' },
      },
    })
  })

  it('rejects callers without account membership', async () => {
    requireEventsEventAccessMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    })
    const { GET } = await import('@/app/api/app/events/[eventId]/evidence/[evidenceId]/route')
    const response = await GET(
      { nextUrl: new URL('http://localhost/api/app/events/event_123/evidence/evidence_123?account=events-co') } as never,
      { params: { eventId: 'event_123', evidenceId: 'evidence_123' } },
    )
    expect(response.status).toBe(403)
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled()
  })

  it('requires an account query parameter', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/evidence/[evidenceId]/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/evidence/evidence_123'),
      } as never,
      { params: { eventId: 'event_123', evidenceId: 'evidence_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.error).toBe('Account parameter required')
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled()
  })

  it('returns evidence detail for matching account, event, and evidence', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.eventIssueEvidence.findFirst.mockResolvedValue(evidenceRow)

    const { GET } = await import('@/app/api/app/events/[eventId]/evidence/[evidenceId]/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/evidence/evidence_123?account=events-co'),
      } as never,
      { params: { eventId: 'event_123', evidenceId: 'evidence_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(requireEventsEventAccessMock).toHaveBeenCalledWith('events-co', 'event_123')
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      evidenceId: 'evidence_123',
      clusterId: 'cluster_123',
      eventId: 'event_123',
      responseId: 'response_123',
      answerId: 'answer_123',
      questionId: 'question_123',
      surveyTargetId: 'target_123',
      transcriptSnippet: 'The registration line wrapped around the lobby.',
      transcriptText: 'The registration line wrapped around the lobby and made me miss the first session.',
      priorityLevel: 'Immediate',
      recommendedNextStep: 'Add two more badge pickup stations near the entrance.',
      clusterTitle: 'Add more registration staff',
      taxonomyLabel: 'Access and check-in',
      question: {
        id: 'question_123',
        key: 'improve',
        label: 'What could we improve?',
        promptLabel: 'What could we improve?',
      },
      target: {
        id: 'target_123',
        name: 'Registration desk',
        category: 'Access',
      },
    })
    expect(json.data.createdAt).toBe('2026-06-03T15:10:00.000Z')
    expect(prismaMock.eventIssueEvidence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'evidence_123',
          eventId: 'event_123',
          response: { collectionPhase: { in: ['PRE'] } },
          event: {
            location: {
              accountId: 'acct_123',
            },
          },
        },
      }),
    )
  })

  it('rejects mismatched account, event, or evidence cleanly', async () => {
    prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType: 'EVENTS' })
    prismaMock.eventIssueEvidence.findFirst.mockResolvedValue(null)

    const { GET } = await import('@/app/api/app/events/[eventId]/evidence/[evidenceId]/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/other_event/evidence/evidence_123?account=events-co'),
      } as never,
      { params: { eventId: 'other_event', evidenceId: 'evidence_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.error).toBe('Evidence not found or access denied')
  })

  it('rejects non-EVENTS accounts before loading evidence detail', async () => {
    const { GET } = await import('@/app/api/app/events/[eventId]/evidence/[evidenceId]/route')

    for (const accountType of NON_EVENTS_ACCOUNT_TYPES) {
      vi.clearAllMocks()
      prismaMock.account.findUnique.mockResolvedValue({ id: 'acct_123', accountType })

      const response = await GET(
        {
          nextUrl: new URL('http://localhost/api/app/events/event_123/evidence/evidence_123?account=retail-co'),
        } as never,
        { params: { eventId: 'event_123', evidenceId: 'evidence_123' } },
      )

      const json = await response.json()
      expect(response.status).toBe(403)
      expect(json.error).toBe('Event intelligence is only available for EVENTS accounts')
      expect(prismaMock.eventIssueEvidence.findFirst).not.toHaveBeenCalled()
    }
  })

  it('returns not found when the account slug is unknown', async () => {
    prismaMock.account.findUnique.mockResolvedValue(null)

    const { GET } = await import('@/app/api/app/events/[eventId]/evidence/[evidenceId]/route')

    const response = await GET(
      {
        nextUrl: new URL('http://localhost/api/app/events/event_123/evidence/evidence_123?account=missing'),
      } as never,
      { params: { eventId: 'event_123', evidenceId: 'evidence_123' } },
    )

    const json = await response.json()
    expect(response.status).toBe(404)
    expect(json.error).toBe('Account not found')
    expect(prismaMock.eventIssueEvidence.findFirst).not.toHaveBeenCalled()
  })
})
