import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/SurveyResponseMethodPreview.tsx', 'utf8')

describe('SurveyResponseMethodPreview', () => {
  it('renders the attendee-choice consent options and distinct voice/text previews', () => {
    expect(source).toContain("responseMode === 'VOICE_AND_TEXT'")
    expect(source).toContain('How would you like to respond?')
    expect(source).toContain('Speak my answers')
    expect(source).toContain('Type my answers')
    expect(source).toContain("responseMode === 'TEXT_ONLY'")
  })
})
