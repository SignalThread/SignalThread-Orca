import { describe, expect, it, vi } from 'vitest'
import { reconcileActiveEventSurveyDeployments } from './event-survey-deployment-lifecycle'

describe('active Event survey deployment lifecycle', () => {
  it('reactivates only current, unexpired links for malformed active assignments', async () => {
    const tx = {
      publicSurveyLink: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'session-link',
            metadata: { assignmentState: 'CURRENT' },
            surveyTarget: { publicSurveyLinks: [{ id: 'session-link', metadata: { assignmentState: 'CURRENT' } }] },
          },
          {
            id: 'superseded-link',
            metadata: { assignmentState: 'SUPERSEDED' },
            surveyTarget: { publicSurveyLinks: [
              { id: 'replacement-link', metadata: { assignmentState: 'CURRENT' } },
              { id: 'superseded-link', metadata: { assignmentState: 'SUPERSEDED' } },
            ] },
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn(),
      },
      survey: { findMany: vi.fn().mockResolvedValue([]) },
    }
    const db = { $transaction: vi.fn((callback) => callback(tx)) }

    const result = await reconcileActiveEventSurveyDeployments({ eventId: 'event_1', surveyId: 'survey_active' }, db as never)

    expect(result).toEqual({ activatedLinkIds: ['session-link'], createdLinkCount: 0 })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['session-link'] } },
      data: { isActive: true },
    })
    expect(tx.publicSurveyLink.createMany).not.toHaveBeenCalled()
  })

  it('creates an active link for a valid legacy primary assignment with no links', async () => {
    const tx = {
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      survey: { findMany: vi.fn().mockResolvedValue([{ id: 'legacy-active', surveyTargetId: 'target_1' }]) },
    }
    const db = { $transaction: vi.fn((callback) => callback(tx)) }

    const result = await reconcileActiveEventSurveyDeployments({ eventId: 'event_1' }, db as never)

    expect(result).toMatchObject({ activatedLinkIds: [], createdLinkCount: 1 })
    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ surveyId: 'legacy-active', surveyTargetId: 'target_1', isActive: true })],
      skipDuplicates: true,
    }))
  })
})
