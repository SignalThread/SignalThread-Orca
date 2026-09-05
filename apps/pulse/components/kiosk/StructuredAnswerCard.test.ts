import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { getStructuredChoices } from './StructuredAnswerCard'

const source = fs.readFileSync(path.join(process.cwd(), 'components/kiosk/StructuredAnswerCard.tsx'), 'utf8')

describe('StructuredAnswerCard', () => {
  it('provides the fixed canonical rating and recommendation ranges', () => {
    expect(getStructuredChoices('RATING_1_TO_5')).toEqual([1, 2, 3, 4, 5])
    expect(getStructuredChoices('RECOMMENDATION_0_TO_10')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('uses accessible selection semantics, touch targets, retry-safe submission, and optional skip', () => {
    expect(source).toContain('role="radiogroup"')
    expect(source).toContain('role="radio"')
    expect(source).toContain('aria-checked={isSelected}')
    expect(source).toContain('min-h-12')
    expect(source).toContain("fetch('/api/answer/structured'")
    expect(source).toContain('Choose an answer before continuing.')
    expect(source).toContain("!currentQuestion.isRequired")
    expect(source).toContain('Skip this question')
    expect(source).toContain('Not at all likely')
    expect(source).toContain('Extremely likely')
  })
})
