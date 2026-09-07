import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { expandEventTemplateSurveys } from './event-template-expansion'
import { createEventVoiceSurveyInTransaction } from './event-voice-surveys'

vi.mock('./event-voice-surveys', () => ({
  createEventVoiceSurveyInTransaction: vi.fn(),
}))

const createSurveyMock = vi.mocked(createEventVoiceSurveyInTransaction)

function createDb(options?: {
  existingRecommendationKey?: string
  templateKey?: string
}) {
  const surveyUpdate = vi.fn(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    name: where.id === 'survey-overall' ? 'Overall Event Experience' : 'Keynote Feedback',
  }))
  const tx = { survey: { update: surveyUpdate } }
  const db = {
    event: {
      findUnique: vi.fn(async () => ({
        id: 'event-1',
        templateKey: options?.templateKey ?? 'conference',
        location: { account: { accountType: 'EVENTS' } },
        structureItems: [
          { id: 'area-keynotes', kind: 'SESSION', name: 'Keynotes' },
          { id: 'area-sessions', kind: 'SESSION', name: 'Sessions' },
          { id: 'area-registration', kind: 'EVENT', name: 'Registration' },
        ],
        surveys: options?.existingRecommendationKey
          ? [{
              settingsJson: {
                templateRecommendation: {
                  templateKey: 'conference',
                  recommendationKey: options.existingRecommendationKey,
                },
              },
            }]
          : [],
      })),
    },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  }

  return { db: db as unknown as PrismaClient, surveyUpdate }
}

describe('event template expansion', () => {
  beforeEach(() => {
    createSurveyMock.mockReset()
    createSurveyMock.mockImplementation(async (input) => ({
      survey: {
        id: input.surveyName === 'Overall Event Experience' ? 'survey-overall' : 'survey-keynote',
        settingsJson: null,
      },
    } as Awaited<ReturnType<typeof createEventVoiceSurveyInTransaction>>))
  })

  it('creates selected recommendations as draft mixed Surveys through the canonical service', async () => {
    const { db, surveyUpdate } = createDb()
    const result = await expandEventTemplateSurveys({
      eventId: 'event-1',
      templateKey: 'conference',
      selections: [
        { key: 'overall-event-experience', collectionPhase: 'DURING' },
        { key: 'keynote-feedback', surveyName: 'Executive keynote pulse', collectionPhase: 'DURING' },
      ],
    }, db)

    expect(result).toEqual({
      created: [
        { key: 'overall-event-experience', surveyId: 'survey-overall', surveyName: 'Overall Event Experience' },
        { key: 'keynote-feedback', surveyId: 'survey-keynote', surveyName: 'Keynote Feedback' },
      ],
      skipped: [],
      failed: [],
    })
    expect(createSurveyMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventId: 'event-1',
      eventStructureItemId: null,
      targetName: 'Overall Event Experience',
      surveyStatus: 'DRAFT',
      questions: expect.arrayContaining([
        expect.objectContaining({ type: 'RATING_1_TO_5' }),
        expect.objectContaining({ type: 'VOICE' }),
      ]),
    }), expect.anything())
    expect(createSurveyMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventStructureItemId: 'area-keynotes',
      surveyName: 'Executive keynote pulse',
    }), expect.anything())
    expect(surveyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        settingsJson: {
          templateRecommendation: {
            templateKey: 'conference',
            recommendationKey: 'overall-event-experience',
          },
        },
      },
    }))
  })

  it('skips already expanded and duplicate recommendations on retry', async () => {
    const { db } = createDb({ existingRecommendationKey: 'keynote-feedback' })
    const result = await expandEventTemplateSurveys({
      eventId: 'event-1',
      templateKey: 'conference',
      selections: [
        { key: 'keynote-feedback', collectionPhase: 'DURING' },
        { key: 'keynote-feedback', collectionPhase: 'DURING' },
      ],
    }, db)

    expect(result.created).toEqual([])
    expect(result.skipped).toEqual([
      { key: 'keynote-feedback', reason: 'Recommended survey already exists' },
      { key: 'keynote-feedback', reason: 'Duplicate selection in this request' },
    ])
    expect(createSurveyMock).not.toHaveBeenCalled()
  })

  it('reports invalid selections without creating partial fake records', async () => {
    const { db } = createDb()
    const result = await expandEventTemplateSurveys({
      eventId: 'event-1',
      templateKey: 'conference',
      selections: [{ key: 'not-in-template', collectionPhase: 'DURING' }],
    }, db)

    expect(result.failed).toEqual([
      { key: 'not-in-template', reason: 'Recommendation is not part of this template' },
    ])
    expect(createSurveyMock).not.toHaveBeenCalled()
  })
})
