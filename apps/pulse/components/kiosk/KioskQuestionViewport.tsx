'use client'

import { SurveyQuestionExperience, type AttendeeQuestionPresentation } from '@/components/kiosk/SurveyQuestionExperience'

type Branding = {
  logoUrl?: string | null
  primaryColor?: string | null
  primaryButtonColor?: string | null
} | null | undefined

type AnalysisInsights = {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: string[]
  keyQuote: string
}

type CompleteAnswer = (answerId: string, transcript?: string, analysis?: AnalysisInsights) => void | Promise<void>

/**
 * The canonical attendee question screen, shared by the kiosk and both
 * organizer previews. Preview only changes mutation callbacks; it never
 * substitutes a smaller or alternate question UI.
 */
export function KioskQuestionViewport({
  currentQuestion,
  questionIndex,
  totalQuestions,
  responseId = 'preview',
  responseMode = 'TEXT_ONLY',
  presentationMode = 'SCREEN',
  branding,
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
  error = null,
  isCompleting = false,
  onHearQuestion,
  onComplete,
  onPresenterComplete,
  onUploadComplete,
  onSkip,
  onCancel,
  onRetry,
}: {
  currentQuestion: AttendeeQuestionPresentation
  questionIndex: number
  totalQuestions: number
  responseId?: string
  responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  presentationMode?: 'SCREEN' | 'READ_ALOUD'
  branding?: Branding
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
  error?: string | null
  isCompleting?: boolean
  onHearQuestion?: () => Promise<void> | void
  onComplete?: CompleteAnswer
  onPresenterComplete?: (answerIds: string[]) => Promise<void> | void
  onUploadComplete?: (answerId: string, success: boolean) => void
  onSkip?: () => Promise<void> | void
  onCancel?: () => void
  onRetry?: () => Promise<void> | void
}) {
  const isSessionSurvey = Boolean(sessionContext)
  const isSpeakerSurvey = Boolean(speakerName)
  const isLastQuestion = questionIndex === totalQuestions - 1
  return (
    <div data-testid="kiosk-question-viewport" className="h-[100svh] bg-white flex flex-col overflow-hidden">
      <header className="flex-shrink-0 sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="w-full max-w-[680px] mx-auto px-4 sm:px-6">
          {branding?.logoUrl && (
            <div className="pt-3 pb-2 sm:pt-4 sm:pb-2.5 flex items-center justify-center">
              <img src={branding.logoUrl} alt="Logo" className="max-h-7 sm:max-h-8 max-w-[120px] sm:max-w-[140px] w-auto object-contain object-center opacity-90" />
            </div>
          )}
          <div className={`flex items-center gap-3 py-1.5 sm:py-2 ${isSessionSurvey || isSpeakerSurvey ? 'justify-between' : 'justify-center'}`}>
            {isSessionSurvey && <span className="min-w-0 line-clamp-2 text-xs font-medium tracking-wide text-gray-500">{questionIndex > 0 ? sessionContext!.name : ''}</span>}
            {isSpeakerSurvey && !isSessionSurvey && <span className="min-w-0 line-clamp-2 text-xs font-medium tracking-wide text-gray-500">{speakerName}</span>}
            <span className="shrink-0 text-xs font-medium tracking-wide text-gray-400">{isSessionSurvey ? `${questionIndex + 1} of ${totalQuestions}` : `Question ${questionIndex + 1} of ${totalQuestions}`}</span>
          </div>
        </div>
        <div className="h-1 bg-gray-100"><div className="h-1 rounded-r-full transition-all duration-300" style={{ width: `${(questionIndex / totalQuestions) * 100}%`, backgroundColor: branding?.primaryColor || branding?.primaryButtonColor || '#171717' }} /></div>
      </header>

      {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center" role="alert"><span className="text-sm font-medium text-red-800">{error}</span>{onRetry && <button type="button" onClick={() => void onRetry()} disabled={isCompleting} className="ml-3 min-h-9 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-800 disabled:opacity-50">{isCompleting ? 'Trying again…' : 'Try again'}</button>}</div>}

      <main className={`flex min-h-0 flex-1 flex-col pt-2 sm:pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${isPresenterRatingsQuestion ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        <div className={`flex min-h-0 flex-1 flex-col ${isPresenterRatingsQuestion ? '' : 'overflow-hidden'}`}>
          <SurveyQuestionExperience
            currentQuestion={currentQuestion}
            responseId={responseId}
            questionNumber={questionIndex + 1}
            totalQuestions={totalQuestions}
            isLastQuestion={isLastQuestion}
            responseMode={responseMode}
            isSpeaking={isSpeaking}
            ttsDone={ttsDone}
            isMobileDevice={isMobileDevice}
            isIOSDevice={isIOSDevice}
            branding={branding}
            isPresenterRatingsQuestion={isPresenterRatingsQuestion}
            speakers={speakers}
            sessionContext={isSessionSurvey && questionIndex === 0 ? sessionContext : null}
            displayAsStars={displayAsStars}
            preview={preview}
            onHearQuestion={presentationMode === 'READ_ALOUD' ? onHearQuestion : undefined}
            onComplete={onComplete}
            onPresenterComplete={onPresenterComplete}
            onUploadComplete={onUploadComplete}
            onSkip={onSkip}
            onCancel={onCancel}
          />
        </div>
      </main>
    </div>
  )
}
