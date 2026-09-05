import { QuestionType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  advancedQuestionConfiguration,
  inferStructuredTypeFromConfiguration,
  reconcileMalformedAdvancedQuestionTypes,
} from './advanced-question-content'

describe('advanced question content contract', () => {
  it('writes explicit numeric scale metadata for new Advanced rating questions', () => {
    expect(advancedQuestionConfiguration(QuestionType.RATING_1_TO_5)).toEqual({
      questionType: QuestionType.RATING_1_TO_5,
      answerFormat: 'NUMERIC',
      scale: { min: 1, max: 5 },
    })
  })

  it('repairs only an OPEN_RESPONSE row whose metadata proves a rating type', async () => {
    const question = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'legacy_rating', configurationJson: { answerFormat: 'NUMERIC', scale: { min: 1, max: 5 } } },
        { id: 'genuine_open_response', configurationJson: null },
        { id: 'unrelated_configuration', configurationJson: { options: ['Yes', 'No'] } },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
    }

    const result = await reconcileMalformedAdvancedQuestionTypes({ eventId: 'event_1' }, { question } as never)

    expect(result).toEqual({ inspected: 3, reconciled: 1, questionIds: ['legacy_rating'] })
    expect(question.update).toHaveBeenCalledWith({
      where: { id: 'legacy_rating' },
      data: { type: QuestionType.RATING_1_TO_5 },
    })
    expect(inferStructuredTypeFromConfiguration(null)).toBeNull()
    expect(inferStructuredTypeFromConfiguration({ options: ['Yes', 'No'] })).toBeNull()
  })
})
