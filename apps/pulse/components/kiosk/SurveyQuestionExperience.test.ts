import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { attendeeQuestionPresentationKind } from './SurveyQuestionExperience'

const source = fs.readFileSync(path.join(process.cwd(), 'components/kiosk/SurveyQuestionExperience.tsx'), 'utf8')

describe('SurveyQuestionExperience', () => {
  it('keeps a persisted OPEN_RESPONSE out of the structured numeric card', () => {
    expect(attendeeQuestionPresentationKind({ type: 'OPEN_RESPONSE' })).toBe('OPEN_RESPONSE')
    expect(attendeeQuestionPresentationKind({ type: 'RATING_1_TO_5' })).toBe('STRUCTURED_NUMERIC')
    expect(attendeeQuestionPresentationKind({ type: 'RECOMMENDATION_0_TO_10' })).toBe('STRUCTURED_NUMERIC')
    expect(attendeeQuestionPresentationKind({ type: 'SPEAKER_FEEDBACK' })).toBe('STRUCTURED_NUMERIC')
  })

  it('uses the canonical attendee cards for preview and live question types', () => {
    expect(source).toContain("import { AudioRecorder } from '@/components/kiosk/AudioRecorder'")
    expect(source).toContain("import { TextAnswerCard } from '@/components/kiosk/TextAnswerCard'")
    expect(source).toContain("import { StructuredAnswerCard")
    expect(source).toContain("import { PresenterRatingsCard } from '@/components/kiosk/PresenterRatingsCard'")
    expect(source).toContain("input.type === 'RATING_1_TO_5'")
    expect(source).toContain("input.type === 'OPEN_RESPONSE'")
    expect(source).toContain("presentation === 'STRUCTURED_NUMERIC'")
    expect(source).toContain('isPresenterRatingsQuestion')
    expect(source).toContain('preview={preview}')
  })

  it('keeps previews inert while preserving the live submission callbacks', () => {
    expect(source).toContain("responseId = 'preview'")
    expect(source).toContain('onUploadComplete={onUploadComplete}')
    expect(source).toContain('onPresenterComplete')
  })

  it('uses voice for structured questions and switches per question when attendees choose', () => {
    expect(source).toContain("const [chosenAnswerMode, setChosenAnswerMode] = useState<'VOICE_ONLY' | 'TEXT_ONLY'>('VOICE_ONLY')")
    expect(source).toContain("responseMode === 'VOICE_AND_TEXT'")
    expect(source).toContain('How do you want to answer?')
    expect(source).toContain("structuredAnswer={{ type }}")
    expect(source).toContain("structuredAnswer={{ type: currentQuestion.type }}")
    expect(source).toContain("structuredAnswer={{ type: 'SPEAKER_FEEDBACK', speakerId: speaker.id }}")
    expect(source).toContain("input.type === 'RATING_1_TO_5' || input.type === 'RECOMMENDATION_0_TO_10' || input.type === 'SPEAKER_FEEDBACK'")
  })
})
