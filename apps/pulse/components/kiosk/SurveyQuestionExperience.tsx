'use client'

import { useState, type ReactNode } from 'react'
import { AudioRecorder } from '@/components/kiosk/AudioRecorder'
import { PresenterRatingsCard } from '@/components/kiosk/PresenterRatingsCard'
import { StructuredAnswerCard, type StructuredQuestionType } from '@/components/kiosk/StructuredAnswerCard'
import { TextAnswerCard } from '@/components/kiosk/TextAnswerCard'
import { resolveSpeakerFeedbackQuestionText } from '@/lib/speaker-feedback-question'

export type AttendeeQuestionPresentationType =
  | 'VOICE'
  | 'OPEN_RESPONSE'
  | StructuredQuestionType
  | 'YES_NO'
  | 'SINGLE_CHOICE'
  | 'SPEAKER_FEEDBACK'

export interface AttendeeQuestionPresentation {
  id: string
  questionId?: string
  text: string
  type: AttendeeQuestionPresentationType
  isRequired: boolean
  options?: string[]
  responseTarget?: 'GENERAL' | 'SESSION' | 'SPEAKERS'
}

type Branding = { primaryButtonColor?: string | null; primaryColor?: string | null } | null | undefined
type AnalysisInsights = {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: string[]
  keyQuote: string
}
type CompleteAnswer = (answerId: string, transcript?: string, analysis?: AnalysisInsights) => void | Promise<void>

function AnswerModeChoice({ mode, onChange }: { mode: 'VOICE_ONLY' | 'TEXT_ONLY'; onChange: (mode: 'VOICE_ONLY' | 'TEXT_ONLY') => void }) {
  return <fieldset aria-label="How do you want to answer?">
    <legend className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-gray-500">How do you want to answer?</legend>
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
      {([['VOICE_ONLY', 'Speak'], ['TEXT_ONLY', 'Type / tap']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => onChange(value)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${mode === value ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>)}
    </div>
  </fieldset>
}

function structuredVoicePrompt(type: AttendeeQuestionPresentationType): string {
  if (type === 'YES_NO') return 'Say yes or no.'
  if (type === 'SINGLE_CHOICE') return 'Say the one option that fits.'
  if (type === 'RECOMMENDATION_0_TO_10') return 'Say a number from zero to ten.'
  return 'Say a number from one to five.'
}

function VoicePresenterRatingsCard({
  responseId,
  questionId,
  questionText,
  speakers,
  branding,
  preview,
  answerModeChoice,
  onComplete,
  onSkip,
  onCancel,
}: {
  responseId: string
  questionId: string
  questionText: string
  speakers: Array<{ id: string; name: string }>
  branding?: Branding
  preview: boolean
  answerModeChoice?: ReactNode
  onComplete: (answerIds: string[]) => Promise<void> | void
  onSkip: () => Promise<void> | void
  onCancel: () => void
}) {
  const [speakerIndex, setSpeakerIndex] = useState(0)
  const [answerIds, setAnswerIds] = useState<string[]>([])
  const speaker = speakers[speakerIndex]
  if (!speaker) return null
  const prompt = resolveSpeakerFeedbackQuestionText(questionText, [speaker])
  return <AudioRecorder
    key={speaker.id}
    responseId={responseId}
    currentQuestion={{ id: questionId, text: prompt, order: speakerIndex + 1, isRequired: true }}
    questionNumber={speakerIndex + 1}
    totalQuestions={speakers.length}
    isLastQuestion={speakerIndex === speakers.length - 1}
    branding={branding}
    preview={preview}
    ttsDone
    structuredAnswer={{ type: 'SPEAKER_FEEDBACK', speakerId: speaker.id }}
    voiceAnswerPrompt={`Rate ${speaker.name} by saying a number from one to five.`}
    answerModeChoice={answerModeChoice}
    onComplete={async (answerId) => {
      const next = [...answerIds, answerId]
      setAnswerIds(next)
      if (speakerIndex < speakers.length - 1) setSpeakerIndex((index) => index + 1)
      else await onComplete(next)
    }}
    onSkip={onSkip}
    onCancel={onCancel}
  />
}

/**
 * This is the kiosk's single type-to-control decision point. It deliberately
 * uses the Question enum supplied by the response API; no component may infer
 * a rating from wording or from a non-VOICE fallback.
 */
export function attendeeQuestionPresentationKind(input: {
  type: AttendeeQuestionPresentationType
  isPresenterRatingsQuestion?: boolean
}): 'PRESENTER_RATINGS' | 'STRUCTURED_NUMERIC' | 'OPEN_RESPONSE' | 'STRUCTURED_CHOICE' {
  if (input.isPresenterRatingsQuestion) return 'PRESENTER_RATINGS'
  if (input.type === 'RATING_1_TO_5' || input.type === 'RECOMMENDATION_0_TO_10' || input.type === 'SPEAKER_FEEDBACK') return 'STRUCTURED_NUMERIC'
  if (input.type === 'VOICE' || input.type === 'OPEN_RESPONSE') return 'OPEN_RESPONSE'
  return 'STRUCTURED_CHOICE'
}

/**
 * Canonical question-type selection for both the public kiosk and the Builder
 * preview. Preview uses the same cards, but every submit path is inert.
 */
export function SurveyQuestionExperience({
  currentQuestion,
  responseId = 'preview',
  questionNumber = 1,
  totalQuestions = 1,
  isLastQuestion = true,
  responseMode = 'TEXT_ONLY',
  isSpeaking = false,
  ttsDone = false,
  isMobileDevice = false,
  isIOSDevice = false,
  branding,
  sessionContext = null,
  speakers = [],
  isPresenterRatingsQuestion = false,
  displayAsStars = false,
  preview = false,
  onHearQuestion,
  onComplete,
  onPresenterComplete,
  onUploadComplete,
  onSkip,
  onCancel,
}: {
  currentQuestion: AttendeeQuestionPresentation
  responseId?: string
  questionNumber?: number
  totalQuestions?: number
  isLastQuestion?: boolean
  responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  isSpeaking?: boolean
  ttsDone?: boolean
  isMobileDevice?: boolean
  isIOSDevice?: boolean
  branding?: Branding
  sessionContext?: { name: string; speakers: Array<{ id: string; name: string }> } | null
  speakers?: Array<{ id: string; name: string }>
  isPresenterRatingsQuestion?: boolean
  displayAsStars?: boolean
  preview?: boolean
  onHearQuestion?: () => Promise<void> | void
  onComplete?: CompleteAnswer
  onPresenterComplete?: (answerIds: string[]) => Promise<void> | void
  onUploadComplete?: (answerId: string, success: boolean) => void
  onSkip?: () => Promise<void> | void
  onCancel?: () => void
}) {
  const [chosenAnswerMode, setChosenAnswerMode] = useState<'VOICE_ONLY' | 'TEXT_ONLY'>('VOICE_ONLY')
  const complete = onComplete ?? (() => undefined)
  const skip = onSkip ?? (() => undefined)
  const cancel = onCancel ?? (() => undefined)
  const questionId = currentQuestion.questionId ?? currentQuestion.id
  const questionText = currentQuestion.type === 'SPEAKER_FEEDBACK' && !isPresenterRatingsQuestion
    ? resolveSpeakerFeedbackQuestionText(currentQuestion.text, speakers)
    : currentQuestion.text
  const presentation = attendeeQuestionPresentationKind({
    type: currentQuestion.type,
    isPresenterRatingsQuestion,
  })
  const effectiveResponseMode = responseMode === 'VOICE_AND_TEXT' ? chosenAnswerMode : responseMode
  const answerModeChoice = responseMode === 'VOICE_AND_TEXT'
    ? <AnswerModeChoice mode={chosenAnswerMode} onChange={setChosenAnswerMode} />
    : undefined

  if (presentation === 'PRESENTER_RATINGS') {
    if (effectiveResponseMode === 'VOICE_ONLY') {
      return <VoicePresenterRatingsCard responseId={responseId} questionId={currentQuestion.id} questionText={currentQuestion.text} speakers={speakers} branding={branding} preview={preview} answerModeChoice={answerModeChoice} onComplete={onPresenterComplete ?? (() => undefined)} onSkip={skip} onCancel={cancel} />
    }
    return <PresenterRatingsCard responseId={responseId} questionId={questionId} questionText={currentQuestion.text} speakers={speakers} branding={branding} preview={preview} answerModeChoice={answerModeChoice} onComplete={onPresenterComplete ?? (() => undefined)} />
  }

  if (presentation === 'STRUCTURED_NUMERIC') {
    const type = currentQuestion.type as StructuredQuestionType
    if (effectiveResponseMode === 'VOICE_ONLY') {
      return <AudioRecorder responseId={responseId} currentQuestion={{ id: currentQuestion.id, text: questionText, order: questionNumber, isRequired: currentQuestion.isRequired }} questionNumber={questionNumber} totalQuestions={totalQuestions} isLastQuestion={isLastQuestion} isSpeaking={isSpeaking} ttsDone={ttsDone} isMobileDevice={isMobileDevice} isIOSDevice={isIOSDevice} preview={preview} branding={branding} onSpeakQuestion={onHearQuestion} structuredAnswer={{ type }} voiceAnswerPrompt={structuredVoicePrompt(type)} answerModeChoice={answerModeChoice} onComplete={complete} onUploadComplete={onUploadComplete} onSkip={skip} onCancel={cancel} />
    }
    return <StructuredAnswerCard responseId={responseId} currentQuestion={{ id: currentQuestion.id, questionId, text: questionText, type, isRequired: currentQuestion.isRequired }} isLastQuestion={isLastQuestion} branding={branding} preview={preview} answerModeChoice={answerModeChoice} onHearQuestion={onHearQuestion} onComplete={(answerId) => complete(answerId)} onSkip={skip} onCancel={cancel} sessionContext={sessionContext} sectionLabel={sessionContext ? 'Overall session' : undefined} displayAsStars={displayAsStars} />
  }

  // OPEN_RESPONSE is intentionally rendered through the same voice/text
  // presentation as the legacy VOICE type; content and experience stay separate.
  if (presentation === 'OPEN_RESPONSE') {
    if (effectiveResponseMode === 'VOICE_ONLY') {
      return <AudioRecorder responseId={responseId} currentQuestion={{ id: currentQuestion.id, text: currentQuestion.text, order: questionNumber, isRequired: currentQuestion.isRequired }} questionNumber={questionNumber} totalQuestions={totalQuestions} isLastQuestion={isLastQuestion} isSpeaking={isSpeaking} ttsDone={ttsDone} isMobileDevice={isMobileDevice} isIOSDevice={isIOSDevice} preview={preview} branding={branding} onSpeakQuestion={onHearQuestion} answerModeChoice={answerModeChoice} onComplete={complete} onUploadComplete={onUploadComplete} onSkip={skip} onCancel={cancel} />
    }
    return <TextAnswerCard responseId={responseId} currentQuestion={{ id: currentQuestion.id, text: currentQuestion.text, order: questionNumber, isRequired: currentQuestion.isRequired }} isLastQuestion={isLastQuestion} branding={branding} preview={preview} answerModeChoice={answerModeChoice} onSpeakQuestion={onHearQuestion} onComplete={complete} onSkip={skip} onCancel={cancel} />
  }

  // Preserve the existing kiosk fallback for content types that have not yet
  // received a dedicated attendee card.
  if (effectiveResponseMode === 'VOICE_ONLY') {
    return <AudioRecorder responseId={responseId} currentQuestion={{ id: currentQuestion.id, text: currentQuestion.text, order: questionNumber, isRequired: currentQuestion.isRequired }} questionNumber={questionNumber} totalQuestions={totalQuestions} isLastQuestion={isLastQuestion} isSpeaking={isSpeaking} ttsDone={ttsDone} isMobileDevice={isMobileDevice} isIOSDevice={isIOSDevice} preview={preview} branding={branding} onSpeakQuestion={onHearQuestion} structuredAnswer={{ type: currentQuestion.type }} voiceAnswerPrompt={structuredVoicePrompt(currentQuestion.type)} answerModeChoice={answerModeChoice} onComplete={complete} onUploadComplete={onUploadComplete} onSkip={skip} onCancel={cancel} />
  }
  return <StructuredAnswerCard responseId={responseId} currentQuestion={{ id: currentQuestion.id, questionId, text: currentQuestion.text, type: currentQuestion.type as StructuredQuestionType, isRequired: currentQuestion.isRequired, options: currentQuestion.options }} isLastQuestion={isLastQuestion} branding={branding} preview={preview} answerModeChoice={answerModeChoice} onHearQuestion={onHearQuestion} onComplete={(answerId) => complete(answerId)} onSkip={skip} onCancel={cancel} />
}
