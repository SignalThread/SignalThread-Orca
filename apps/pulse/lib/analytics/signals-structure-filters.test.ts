import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
    response: {
      findMany: vi.fn(),
    },
    answer: { findMany: vi.fn() },
    answerTranscript: { findMany: vi.fn() },
    answerAnalysis: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('analytics signals structure filters', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.response.findMany.mockResolvedValue([])
    prismaMock.answer.findMany.mockResolvedValue([])
    prismaMock.answerTranscript.findMany.mockResolvedValue([])
    prismaMock.answerAnalysis.findMany.mockResolvedValue([])
  })

  it('filters window and previous-period signal response queries by EventStructureItem kind', async () => {
    const { computeSignalsWithData } = await import('./signals')

    await computeSignalsWithData({
      eventId: 'event_123',
      windowDays: 30,
      structureKind: 'AREA',
    })

    expect(prismaMock.response.findMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.response.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_123',
        OR: expect.arrayContaining([{ surveyTarget: { eventStructureItem: { kind: 'AREA' } } }]),
      }),
    }))
    expect(prismaMock.response.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_123',
        OR: expect.arrayContaining([{ surveyTarget: { eventStructureItem: { kind: 'AREA' } } }]),
      }),
    }))
    expect(prismaMock.response.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      select: { id: true, startedAt: true, status: true },
    }))
    expect(prismaMock.answer.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        response: expect.objectContaining({
          eventId: 'event_123',
          OR: expect.arrayContaining([{ surveyTarget: { eventStructureItem: { kind: 'AREA' } } }]),
        }),
      },
    }))
  })

  it('filters lifetime signal data by EventStructureItem id', async () => {
    const { fetchEventDataLifetime } = await import('./signals')

    await fetchEventDataLifetime('event_123', null, {
      eventStructureItemId: 'structure_123',
    })

    expect(prismaMock.response.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_123',
        OR: expect.arrayContaining([{ surveyTarget: { eventStructureItemId: 'structure_123' } }]),
      }),
    }))
  })

  it('applies the explicit lifecycle cohort before every Events signal aggregation read', async () => {
    const { computeSignalsWithData } = await import('./signals')

    await computeSignalsWithData({
      eventId: 'event_123',
      windowDays: 30,
      lifecyclePhase: 'IN_EVENT',
    })

    for (const call of prismaMock.response.findMany.mock.calls) {
      expect(call[0].where).toMatchObject({ collectionPhase: { in: ['DURING'] } })
    }
    for (const call of prismaMock.answer.findMany.mock.calls) {
      expect(call[0].where.response).toMatchObject({ collectionPhase: { in: ['DURING'] } })
    }
    for (const model of [prismaMock.answerTranscript, prismaMock.answerAnalysis]) {
      for (const call of model.findMany.mock.calls) {
        expect(call[0].where.answer.response).toMatchObject({ collectionPhase: { in: ['DURING'] } })
      }
    }
  })
})
