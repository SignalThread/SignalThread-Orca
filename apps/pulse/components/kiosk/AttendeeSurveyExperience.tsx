'use client'

import { ConsentScreen } from '@/components/kiosk/ConsentScreen'
import { KioskQuestionViewport } from '@/components/kiosk/KioskQuestionViewport'
import type { AttendeeQuestionPresentation } from '@/components/kiosk/SurveyQuestionExperience'
import type { AttendeeResponseMode } from '@/lib/response-mode'

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

type AnalysisInsights = {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: string[]
  keyQuote: string
}

/**
 * The single attendee screen renderer. It is intentionally shared by the
 * live kiosk and organizer previews; preview only makes its response actions
 * inert through the existing `preview` props on the canonical cards.
 */
export function AttendeeSurveyExperience({
  screen,
  branding,
  consent,
  contextLabel = null,
  surveyIntro = null,
  configuredResponseMode = 'VOICE_ONLY',
  configuredPresentationMode = 'READ_ALOUD',
  responseChoiceTiming = 'START',
  onStart,
  isStarting = false,
  startError = null,
  currentQuestion,
  questionIndex = 0,
  totalQuestions = 0,
  responseId = 'preview',
  responseMode = 'TEXT_ONLY',
  presentationMode = 'SCREEN',
  sessionContext = null,
  speakerName = null,
  speakers = [],
  isPresenterRatingsQuestion = false,
  displayAsStars = false,
  preview = false,
  isSpeaking = false,
  ttsDone = false,
  isMobileDevice = false,
  isIOSDevice = false,
  questionError = null,
  isCompleting = false,
  onHearQuestion,
  onComplete,
  onPresenterComplete,
  onUploadComplete,
  onSkip,
  onCancel,
  onRetry,
}: {
  screen: 'START' | 'QUESTION'
  branding?: Branding
  consent?: Consent
  contextLabel?: string | null
  surveyIntro?: string | null
  configuredResponseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  configuredPresentationMode?: 'SCREEN' | 'READ_ALOUD' | 'ATTENDEE_CHOOSES'
  responseChoiceTiming?: 'START' | 'PER_QUESTION'
  onStart?: (selection?: { responseMode?: AttendeeResponseMode; presentationMode?: 'SCREEN' | 'READ_ALOUD' }) => void | Promise<void>
  isStarting?: boolean
  startError?: string | null
  currentQuestion?: AttendeeQuestionPresentation | null
  questionIndex?: number
  totalQuestions?: number
  responseId?: string
  responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  presentationMode?: 'SCREEN' | 'READ_ALOUD'
  sessionContext?: { name: string; speakers: Array<{ id: string; name: string }> } | null
  speakerName?: string | null
  speakers?: Array<{ id: string; name: string }>
  isPresenterRatingsQuestion?: boolean
  displayAsStars?: boolean
  preview?: boolean
  isSpeaking?: boolean
  ttsDone?: boolean
  isMobileDevice?: boolean
  isIOSDevice?: boolean
  questionError?: string | null
  isCompleting?: boolean
  onHearQuestion?: () => Promise<void> | void
  onComplete?: (answerId: string, transcript?: string, analysis?: AnalysisInsights) => void | Promise<void>
  onPresenterComplete?: (answerIds: string[]) => Promise<void> | void
  onUploadComplete?: (answerId: string, success: boolean) => void
  onSkip?: () => Promise<void> | void
  onCancel?: () => void
  onRetry?: () => Promise<void> | void
}) {
  if (screen === 'START') {
    return <ConsentScreen
      onAccept={onStart ?? (() => undefined)}
      isLoading={isStarting}
      error={startError}
      branding={branding}
      consent={consent}
      responseMode={configuredResponseMode}
      presentationMode={configuredPresentationMode}
      responseChoiceTiming={responseChoiceTiming}
      contextLabel={contextLabel}
      surveyIntro={surveyIntro}
    />
  }

  if (!currentQuestion) return <div className="flex min-h-[100svh] items-center justify-center bg-white px-8 text-center text-gray-500">Questions will appear here as you add them.</div>

  return <KioskQuestionViewport
    currentQuestion={currentQuestion}
    questionIndex={questionIndex}
    totalQuestions={totalQuestions}
    responseId={responseId}
    responseMode={responseMode}
    presentationMode={presentationMode}
    branding={branding}
    sessionContext={sessionContext}
    speakerName={speakerName}
    speakers={speakers}
    isPresenterRatingsQuestion={isPresenterRatingsQuestion}
    displayAsStars={displayAsStars}
    preview={preview}
    isSpeaking={isSpeaking}
    ttsDone={ttsDone}
    isMobileDevice={isMobileDevice}
    isIOSDevice={isIOSDevice}
    error={questionError}
    isCompleting={isCompleting}
    onHearQuestion={onHearQuestion}
    onComplete={onComplete}
    onPresenterComplete={onPresenterComplete}
    onUploadComplete={onUploadComplete}
    onSkip={onSkip}
    onCancel={onCancel}
    onRetry={onRetry}
  />
}
