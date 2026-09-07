import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    event: { findUnique: vi.fn() },
    response: { count: vi.fn() },
    answer: { count: vi.fn() },
    answerAnalysis: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('computeEventAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.event.findUnique.mockResolvedValue({
      id: 'event_1', name: 'Event', status: 'ACTIVE',
    })
    prismaMock.response.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2)
    prismaMock.answer.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
    prismaMock.answerAnalysis.findMany.mockResolvedValue([{
      summary: 'Registration was clear.',
      sentimentLabel: 'POSITIVE',
      sentimentScore: 0.8,
      themesJson: { themes: ['Registration'] },
      actionsJson: { actionItems: ['Keep staffed check-in'] },
    }])
  })

  it('loads analyzed rows through the event-scoped analysis relation without an answer-id batch', async () => {
    const { computeEventAnalysis } = await import('./event-analysis')

    const result = await computeEventAnalysis('event_1')

    expect(prismaMock.answerAnalysis.findMany).toHaveBeenCalledWith({
      where: {
        answer: {
          response: { eventId: 'event_1' },
          status: 'COMPLETED',
          answerTranscript: { is: { text: { not: '' } } },
        },
      },
      select: {
        summary: true,
        sentimentLabel: true,
        sentimentScore: true,
        themesJson: true,
        actionsJson: true,
      },
    })
    expect(result).toMatchObject({
      totalResponses: 2,
      totalAnswers: 3,
      overallSentiment: 'POSITIVE',
      topThemes: [{ theme: 'Registration', count: 1 }],
      topActionItems: ['Keep staffed check-in'],
    })
  })
})
