import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/kiosk/KioskQuestionViewport.tsx', 'utf8')

describe('KioskQuestionViewport', () => {
  it('owns the kiosk progress header and delegates all question types to the shared attendee renderer', () => {
    expect(source).toContain("import { SurveyQuestionExperience")
    expect(source).toContain('data-testid="kiosk-question-viewport"')
    expect(source).toContain('Question ${questionIndex + 1} of ${totalQuestions}')
    expect(source).toContain('<SurveyQuestionExperience')
    expect(source).toContain('isPresenterRatingsQuestion={isPresenterRatingsQuestion}')
    expect(source).toContain('displayAsStars={displayAsStars}')
  })

  it('keeps the actual attendee viewport self-contained without preview sizing overrides', () => {
    expect(source).not.toContain('viewportHeight')
    expect(source).not.toContain('kiosk-viewport-height')
    expect(source).toContain('className="h-[100svh]')
    expect(source).toContain('preview={preview}')
  })
})
