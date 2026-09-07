'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AttendeeSurveyExperience } from '@/components/kiosk/AttendeeSurveyExperience'
import { CanonicalAttendeeViewportFrame } from '@/components/kiosk/CanonicalAttendeeViewportFrame'
import type { AttendeeQuestionPresentation } from '@/components/kiosk/SurveyQuestionExperience'
import { filterAnswerableAttendeeQuestions } from '@/lib/attendee-question-eligibility'
import {
  buildAdvancedSurveyPreviewScreens,
  resolveAdvancedSurveyPreviewPosition,
  type AdvancedSurveyPreviewPosition,
} from '@/lib/advanced-survey-preview-navigation'

type Branding = {
  logoUrl?: string | null
  primaryColor?: string | null
  primaryButtonColor?: string | null
} | null | undefined

type Consent = {
  title: string
  subtitle: string
  items: string[]
  buttonText: string
  bulletStyle?: string | null
} | null | undefined

/**
 * Preview chrome only. The screen inside this frame is always the same kiosk
 * start or question viewport used by attendees; the controls below it belong
 * to organizers and are deliberately outside the simulated device.
 */
export function OrganizerSurveyPreview({
  variant,
  questions,
  branding,
  consent,
  contextLabel = null,
  surveyIntro = null,
  responseMode,
  presentationMode,
  speakers = [],
  sessionContext = null,
  speakerName = null,
}: {
  variant: 'inline' | 'full'
  questions: AttendeeQuestionPresentation[]
  branding?: Branding
  consent?: Consent
  contextLabel?: string | null
  surveyIntro?: string | null
  responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  presentationMode: 'SCREEN' | 'READ_ALOUD' | 'ATTENDEE_CHOOSES'
  speakers?: Array<{ id: string; name: string }>
  sessionContext?: { name: string; speakers: Array<{ id: string; name: string }> } | null
  speakerName?: string | null
}) {
  const answerableQuestions = filterAnswerableAttendeeQuestions(questions, { speakers })
  const previewScreens = buildAdvancedSurveyPreviewScreens(
    answerableQuestions.map((question) => question.id),
    { presentationMode, responseMode },
  )
  const [previewPosition, setPreviewPosition] = useState<AdvancedSurveyPreviewPosition>(() => previewScreens[0])
  const [attendeeSelection, setAttendeeSelection] = useState<{
    responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY'
    presentationMode?: 'SCREEN' | 'READ_ALOUD'
  }>({})
  const attendeeChoiceConfigured = responseMode === 'VOICE_AND_TEXT' || presentationMode === 'ATTENDEE_CHOOSES'
  const selectedResponseMode = responseMode === 'VOICE_AND_TEXT'
    ? 'VOICE_AND_TEXT'
    : attendeeChoiceConfigured
      ? attendeeSelection.responseMode ?? (responseMode === 'TEXT_ONLY' ? 'TEXT_ONLY' : 'VOICE_ONLY')
      : responseMode === 'TEXT_ONLY' ? 'TEXT_ONLY' : 'VOICE_ONLY'
  const selectedPresentationMode = attendeeChoiceConfigured
    ? attendeeSelection.presentationMode ?? (presentationMode === 'SCREEN' ? 'SCREEN' : 'READ_ALOUD')
    : presentationMode === 'SCREEN' ? 'SCREEN' : 'READ_ALOUD'
  const resolvedPosition = resolveAdvancedSurveyPreviewPosition(previewScreens, previewPosition)
  const screenIndex = resolvedPosition.index
  const activeScreen = resolvedPosition.screen
  const screenCount = previewScreens.length
  const currentQuestionIndex = activeScreen.screen === 'QUESTION' ? activeScreen.questionIndex : -1
  const currentQuestion = currentQuestionIndex >= 0 ? answerableQuestions[currentQuestionIndex] ?? null : null
  const resolvedQuestionId = activeScreen.screen === 'QUESTION' ? activeScreen.questionId : null
  const resolvedQuestionIndex = activeScreen.screen === 'QUESTION' ? activeScreen.questionIndex : -1

  useEffect(() => {
    setPreviewPosition((current) => {
      const positionMatches = current.screen === activeScreen.screen
        && (current.screen === 'START'
          || (activeScreen.screen === 'QUESTION'
            && current.questionId === resolvedQuestionId
            && current.questionIndex === resolvedQuestionIndex))
      if (positionMatches) return current
      return activeScreen.screen === 'START'
        ? { screen: 'START' }
        : { screen: 'QUESTION', questionId: resolvedQuestionId, questionIndex: resolvedQuestionIndex }
    })
  }, [activeScreen.screen, resolvedQuestionId, resolvedQuestionIndex])

  const goToScreen = (index: number) => {
    const screen = previewScreens[Math.max(0, Math.min(index, screenCount - 1))]
    if (screen) setPreviewPosition(screen)
  }
  const next = () => goToScreen(screenIndex + 1)
  const previous = () => goToScreen(screenIndex - 1)
  const screenLabel = activeScreen.screen === 'START'
    ? 'Start screen'
    : `Question ${currentQuestionIndex + 1} of ${answerableQuestions.length}`

  const attendeeScreen = (
    <CanonicalAttendeeViewportFrame variant={variant}>
      <AttendeeSurveyExperience
        screen={activeScreen.screen}
        onStart={(selection) => {
          setAttendeeSelection(selection ?? {})
          next()
        }}
        branding={branding}
        consent={consent}
        contextLabel={contextLabel}
        surveyIntro={surveyIntro}
        configuredResponseMode={responseMode}
        configuredPresentationMode={presentationMode}
        responseChoiceTiming="PER_QUESTION"
        currentQuestion={currentQuestion}
        questionIndex={currentQuestionIndex}
        totalQuestions={answerableQuestions.length}
        responseMode={selectedResponseMode}
        presentationMode={selectedPresentationMode}
        sessionContext={sessionContext}
        speakerName={speakerName}
        speakers={speakers}
        isPresenterRatingsQuestion={currentQuestion?.type === 'SPEAKER_FEEDBACK' && currentQuestion.responseTarget === 'SPEAKERS' && speakers.length > 0}
        displayAsStars={currentQuestion?.type === 'RATING_1_TO_5' && Boolean(sessionContext)}
        preview
      />
    </CanonicalAttendeeViewportFrame>
  )

  return (
    <div data-testid={`organizer-survey-preview-${variant}`}>
      {attendeeScreen}
      <nav aria-label={`${variant === 'inline' ? 'Inline' : 'Full'} preview navigation`} className="mt-3 flex items-center justify-between gap-3">
        <button type="button" aria-label="Preview previous screen" disabled={screenIndex === 0} onClick={previous} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous screen</button>
        <span aria-live="polite" className="text-center text-xs font-medium text-slate-500">{screenLabel}</span>
        <button type="button" aria-label="Preview next screen" disabled={screenIndex === screenCount - 1} onClick={next} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Next screen<ChevronRight className="h-4 w-4" /></button>
      </nav>
    </div>
  )
}
