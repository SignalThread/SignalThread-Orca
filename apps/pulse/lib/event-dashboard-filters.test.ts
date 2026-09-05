import { describe, expect, it, vi } from 'vitest'
import { validateEventDashboardFilters } from './event-dashboard-filters'

describe('validateEventDashboardFilters', () => {
  it('continues to reject a genuinely incompatible survey and structure kind', async () => {
    const db = {
      eventStructureItem: { findFirst: vi.fn() },
      survey: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'survey_session',
          surveyTarget: {
            eventStructureItemId: 'session_1',
            eventStructureItem: { kind: 'SESSION' },
          },
          publicSurveyLinks: [],
        }),
      },
    }

    await expect(validateEventDashboardFilters({
      accountId: 'account_1',
      accountType: 'EVENTS',
      eventId: 'event_1',
      filters: { surveyId: 'survey_session', structureKind: 'EVENT' },
    }, db as never)).rejects.toMatchObject({
      message: 'surveyId conflicts with structureKind',
      status: 400,
    })
  })
})
