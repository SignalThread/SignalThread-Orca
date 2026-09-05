import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/kiosk/OrganizerSurveyPreview.tsx', 'utf8')

describe('OrganizerSurveyPreview', () => {
  it('uses canonical kiosk start and question renderers for every preview screen', () => {
    expect(source).toContain("import { AttendeeSurveyExperience } from '@/components/kiosk/AttendeeSurveyExperience'")
    expect(source).toContain("import { CanonicalAttendeeViewportFrame } from '@/components/kiosk/CanonicalAttendeeViewportFrame'")
    expect(source).toContain('<CanonicalAttendeeViewportFrame variant={variant}>')
    expect(source).toContain('<AttendeeSurveyExperience')
    expect(source).toContain('screen={activeScreen.screen}')
    expect(source).toContain('branding={branding}')
    expect(source).toContain('consent={consent}')
    expect(source).toContain('contextLabel={contextLabel}')
    expect(source).toContain('surveyIntro={surveyIntro}')
  })

  it('delegates mobile viewport sizing and uniform scaling to the canonical frame', () => {
    expect(source).not.toContain('KIOSK_PREVIEW_VIEWPORT')
    expect(source).not.toContain('viewportHeight=')
    expect(source).not.toContain('overflow-y-auto')
    expect(source).not.toContain('transform: `scale(${scale})`')
  })

  it('keeps organizer navigation outside the attendee viewport and bounded to all screens', () => {
    expect(source).toContain('aria-label={`${variant === \'inline\' ? \'Inline\' : \'Full\'} preview navigation`}')
    expect(source).toContain('aria-label="Preview previous screen"')
    expect(source).toContain('aria-label="Preview next screen"')
    expect(source).toContain('const answerableQuestions = filterAnswerableAttendeeQuestions(questions, { speakers })')
    expect(source).toContain('const previewScreens = buildAdvancedSurveyPreviewScreens(')
    expect(source).toContain('const currentQuestionIndex = activeScreen.screen === \'QUESTION\' ? activeScreen.questionIndex : -1')
    expect(source).not.toContain('Previous | Question')
    expect(source).not.toContain('/api/response/create')
    expect(source).not.toContain('fetch(')
    expect(source).toContain('useState<AdvancedSurveyPreviewPosition>(() => previewScreens[0])')
    expect(source).toContain('const previous = () => goToScreen(screenIndex - 1)')
    expect(source).toContain('const next = () => goToScreen(screenIndex + 1)')
  })

  it('uses the same answerable question set as the kiosk when a session has no speakers', () => {
    expect(source).toContain("import { filterAnswerableAttendeeQuestions } from '@/lib/attendee-question-eligibility'")
    expect(source).toContain('totalQuestions={answerableQuestions.length}')
  })

  it('repeats speaker feedback only when its persisted response target is individual speakers', () => {
    expect(source).toContain("currentQuestion.responseTarget === 'SPEAKERS'")
  })

  it('keeps attendee actions preview-only while allowing the canonical start CTA to move to question one', () => {
    expect(source).toContain('preview')
    expect(source).toContain('next()')
    expect(source).toContain('setAttendeeSelection(selection ?? {})')
  })

  it('owns stable preview navigation independently from live survey content', () => {
    expect(source).toContain('const [previewPosition, setPreviewPosition] = useState<AdvancedSurveyPreviewPosition>')
    expect(source).toContain('resolveAdvancedSurveyPreviewPosition(previewScreens, previewPosition)')
    expect(source).toContain("? { screen: 'START' }")
    expect(source).toContain("{ screen: 'QUESTION', questionId: resolvedQuestionId, questionIndex: resolvedQuestionIndex }")
    expect(source).not.toContain("setPreviewPosition({ screen: 'START' })")
  })
})
