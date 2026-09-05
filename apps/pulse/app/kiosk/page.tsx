'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AttendeeSurveyExperience } from '@/components/kiosk/AttendeeSurveyExperience'
import { GoogleReviewHelper } from '@/components/kiosk/GoogleReviewHelper'
import type { AttendeeQuestionPresentationType } from '@/components/kiosk/SurveyQuestionExperience'
import { playRuntimeQuestionAudio } from '@/lib/kiosk-question-audio'
import type { AttendeeResponseMode } from '@/lib/response-mode'
import { beginBrowserAudioSession, type BrowserAudioSession } from '@/lib/tts'

interface AnalysisInsights {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: string[]
  keyQuote: string
}

interface Question {
  id: string
  questionId: string
  text: string
  order: number
  type: AttendeeQuestionPresentationType
  responseTarget?: 'GENERAL' | 'SESSION' | 'SPEAKERS'
  isRequired: boolean
  audioUrl?: string | null
  ttsProvider?: string | null
  ttsVoice?: string | null
  ttsLocale?: string | null
  fallbackReason?: string | null
}

interface SessionSurveyContext {
  session: { id: string; name: string }
  speakers: Array<{ id: string; name: string }>
  presenterRatingQuestionId: string | null
}

type KioskResponseMode = 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
type KioskPresentationMode = 'SCREEN' | 'READ_ALOUD' | 'ATTENDEE_CHOOSES'
type EventDetailsStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface CompletedAnswer {
  answerId: string
  questionText: string
  transcript?: string
  analysis?: AnalysisInsights
}

function isValidGoogleReviewUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim()
  return Boolean(trimmed && trimmed.startsWith('https://'))
}

function KioskEventDetailsLoading() {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-white px-6">
      <div className="w-full max-w-md" aria-busy="true" aria-live="polite">
        <div className="mx-auto mb-8 h-12 w-40 animate-pulse rounded-lg bg-gray-100" />
        <div className="space-y-3">
          <div className="mx-auto h-8 w-3/4 animate-pulse rounded bg-gray-100" />
          <div className="mx-auto h-4 w-1/2 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="mt-10 space-y-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-4">
              <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-gray-100" />
              <div className="h-5 flex-1 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="mt-10 h-14 w-full animate-pulse rounded-2xl bg-gray-100" />
        <p className="sr-only">Loading kiosk details</p>
      </div>
    </div>
  )
}

function KioskLaunchError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-white p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Unable to Load Kiosk</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}

function KioskContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const targetEventId = searchParams.get('eventId')?.trim() || ''
  const targetToken = searchParams.get('token')?.trim() || ''
  const hasEventLaunch = Boolean(targetEventId)
  const hasTokenLaunch = Boolean(targetToken)
  const hasValidLaunchIdentifier = hasEventLaunch !== hasTokenLaunch
  const launchQuery = hasEventLaunch
    ? `eventId=${encodeURIComponent(targetEventId)}`
    : hasTokenLaunch
      ? `token=${encodeURIComponent(targetToken)}`
      : null

  const [consentGiven, setConsentGiven] = useState(false)
  const [allQuestionsCompleted, setAllQuestionsCompleted] = useState(false)
  const [isResponseCompleted, setIsResponseCompleted] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [responseId, setResponseId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [completedAnswers, setCompletedAnswers] = useState<CompletedAnswer[]>([])
  const [isCreatingResponse, setIsCreatingResponse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<Set<string>>(new Set())
  const [responseMode, setResponseMode] = useState<KioskResponseMode>('VOICE_ONLY')
  const [questionPresentationMode, setQuestionPresentationMode] = useState<'SCREEN' | 'READ_ALOUD'>('READ_ALOUD')
  const [sessionSurveyContext, setSessionSurveyContext] = useState<SessionSurveyContext | null>(null)

  // Event details (branding, consent, retail) — fetched when we have eventId
  const [eventDetailsStatus, setEventDetailsStatus] = useState<EventDetailsStatus>('idle')
  const [eventDetailsError, setEventDetailsError] = useState<string | null>(null)
  const [eventDetails, setEventDetails] = useState<{
    responseMode?: KioskResponseMode
    presentationMode?: KioskPresentationMode
    accountType: string
    googleReviewUrl?: string | null
    speakerContext?: { speaker: { id: string; name: string } } | null
    sessionContext?: { session: { id: string; name: string }; speakers: Array<{ id: string; name: string }> } | null
    surveyIntro?: string | null
    targetContext?: { category: string; name: string; kind: string | null } | null
    branding?: {
      logoUrl: string | null
      primaryColor: string | null
      primaryButtonColor: string | null
    }
    consent?: {
      title: string
      subtitle: string
      items: string[]
      buttonText: string
      bulletStyle: string
    }
  } | null>(null)

  // TTS state (simplified - no voice loading needed)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [ttsDone, setTtsDone] = useState(false) // Tracks when TTS audio has fully completed
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [isIOSDevice, setIsIOSDevice] = useState(false)
  const currentAudioRef = useRef<AbortController | null>(null)
  // Holds the browser audio session started during the consent/start gesture.
  // Mobile browsers can reject playback after the response-creation request
  // resolves, so we unlock this element synchronously and reuse it for the
  // first Voice-first question rather than asking for a second play tap.
  const audioSessionRef = useRef<BrowserAudioSession | null>(null)

  // Detect mobile/iOS on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase()
      // iOS detection (iPhone, iPad, iPod, or iPadOS reporting as Mac with touch)
      const isIOS = /iphone|ipad|ipod/.test(ua) ||
        (/macintosh/.test(ua) && 'ontouchend' in document && navigator.maxTouchPoints > 1)
      // Android and other mobile detection
      const isMobile = isIOS || /android|mobile|tablet/.test(ua)
      setIsMobileDevice(isMobile)
      setIsIOSDevice(isIOS)
    }
  }, [])

  // Auto-read each eligible question once (per responseId+questionId). The
  // consent/start tap has already unlocked audio for the first spoken prompt.
  useEffect(() => {
    if (
      consentGiven &&
      responseId &&
      questions.length > 0 &&
      currentQuestionIndex < questions.length &&
      typeof window !== 'undefined'
    ) {
      const currentQuestion = questions[currentQuestionIndex]
      if (responseMode === 'TEXT_ONLY' || questionPresentationMode === 'SCREEN') {
        setTtsDone(true)
        return
      }
      const sessionKey = `tts-autoplay-${responseId}-${currentQuestion.id}`
      const hasPlayedThisQuestion = sessionStorage.getItem(sessionKey)

      if (!hasPlayedThisQuestion) {
        sessionStorage.setItem(sessionKey, 'true')
        void speakText(currentQuestion)
      } else {
        // TTS already played for this question in this session - enable recording immediately
        setTtsDone(true)
      }
    }
  }, [consentGiven, responseId, currentQuestionIndex, questions, questionPresentationMode, responseMode])

  // Fetch event details (branding, consent, retail) when we have a launch link.
  useEffect(() => {
    if (!launchQuery) return

    let cancelled = false

    const fetchEventDetails = async () => {
      setEventDetailsStatus('loading')
      setEventDetailsError(null)
      setEventDetails(null)

      try {
        const res = await fetch(`/api/kiosk/event-details?${launchQuery}`)
        const data = await res.json().catch(() => null)

        if (!res.ok || !data?.success || !data.event) {
          throw new Error(data?.error || 'Failed to load kiosk details')
        }

        if (!cancelled) {
          setEventDetails({
            responseMode: data.event.responseMode,
            presentationMode: data.event.presentationMode,
            accountType: data.event.accountType,
            googleReviewUrl: data.event.location?.googleReviewUrl,
            speakerContext: data.event.speakerContext ?? null,
            sessionContext: data.event.sessionContext ?? null,
            surveyIntro: data.event.surveyIntro ?? null,
            targetContext: data.event.targetContext ?? null,
            branding: data.event.branding,
            consent: data.event.consent,
          })
          setEventDetailsStatus('loaded')
        }
      } catch (err) {
        console.error('Failed to fetch event details:', err)
        if (!cancelled) {
          setEventDetails(null)
          setEventDetailsError(err instanceof Error ? err.message : 'Failed to load kiosk details')
          setEventDetailsStatus('error')
        }
      }
    }

    fetchEventDetails()

    return () => {
      cancelled = true
    }
  }, [launchQuery])

  // When advancing voice questions, re-run the TTS gate for the microphone.
  useEffect(() => {
    if (!consentGiven || !responseId || questions.length === 0) return
    if (responseMode !== 'TEXT_ONLY' && questionPresentationMode === 'READ_ALOUD') {
      setTtsDone(false)
    }
  }, [questionPresentationMode, responseMode, currentQuestionIndex, consentGiven, responseId, questions.length])

  // Server-side TTS handler
  const speakText = async (question: Question) => {
    if (!question.text) return

    console.log('[Kiosk] tts-start', {
      questionIndex: currentQuestionIndex,
      questionId: question.id,
      textPreview: question.text.slice(0, 40),
      voice: question.ttsVoice ?? null,
      locale: question.ttsLocale ?? null,
      hasAudioUrl: Boolean(question.audioUrl),
    })

    // Cancel any ongoing speech
    stopSpeaking()

    // Create new abort controller for this speech
    const abortController = new AbortController()
    currentAudioRef.current = abortController

    setIsSpeaking(true) // Set speaking state immediately

    try {
      // Reuse the element unlocked by the consent/start gesture for the first
      // prompt; subsequent questions can use ordinary runtime playback.
      const audioSession = audioSessionRef.current ?? undefined
      // Clear the ref so it's only used once (for the first question)
      if (audioSession) audioSessionRef.current = null

      await playRuntimeQuestionAudio(question, {
        signal: abortController.signal,
        audioSession,
        onStart: () => {
          // Already set isSpeaking above
        },
        onEnd: () => {
          console.log('[Kiosk] tts-end', { questionIndex: currentQuestionIndex })
          setIsSpeaking(false)
          setTtsDone(true) // CRITICAL: Signal that TTS has fully completed
          if (currentAudioRef.current === abortController) {
            currentAudioRef.current = null
          }
        },
        onError: (error) => {
          console.error('[TTS] Playback error:', error)
          setIsSpeaking(false)
          setTtsDone(true) // Also set ttsDone on error as fallback
          if (currentAudioRef.current === abortController) {
            currentAudioRef.current = null
          }
        },
      })
    } catch (error) {
      console.error('[TTS] Failed to play audio:', error)
      setIsSpeaking(false)
      setTtsDone(true) // Set ttsDone on catch as fallback
      if (currentAudioRef.current === abortController) {
        currentAudioRef.current = null
      }
    }
  }

  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.abort()
      currentAudioRef.current = null
    }
    setIsSpeaking(false)
  }

  const handleListenToggle = () => {
    if (currentQuestionIndex < questions.length) {
      const currentQuestion = questions[currentQuestionIndex]
      if (isSpeaking) {
        stopSpeaking()
      } else {
        // Fire and forget - don't await
        speakText(currentQuestion).catch(err => {
          console.error('[Kiosk] TTS error:', err)
        })
      }
    }
  }

  const handleConsentAccept = async (selection?: { responseMode?: AttendeeResponseMode; presentationMode?: 'SCREEN' | 'READ_ALOUD' }) => {
    const selectedResponseMode = selection?.responseMode
    const selectedPresentationMode = selection?.presentationMode
    // Unlock an HTMLAudioElement synchronously inside the existing consent
    // gesture. The response request below is asynchronous, so preserving this
    // element lets Voice-first play question one without an extra tap on iOS,
    // Android, and browsers with strict media-gesture policies.
    const effectivePresentationMode = selectedPresentationMode ?? (eventDetails?.presentationMode === 'SCREEN' ? 'SCREEN' : 'READ_ALOUD')
    const selectedVoiceMode = effectivePresentationMode === 'READ_ALOUD' && (selectedResponseMode === 'VOICE_ONLY' ||
      (!selectedResponseMode && eventDetails?.responseMode !== 'TEXT_ONLY'))
    if (selectedVoiceMode) {
      try {
        const audio = new Audio()
        // Minimal valid silent MP3 (1 frame of silence, ~140 bytes)
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlPUGiAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlPUGiAAAAAAAAAAAAAAAAAAAA'
        audio.volume = 0.01
        audioSessionRef.current = beginBrowserAudioSession(audio)
        void audioSessionRef.current.ready.then((ready) => {
          if (!ready) console.warn('[Kiosk] Silent audio unlock failed — first TTS may not autoplay')
        })
      } catch {
        console.warn('[Kiosk] Could not create unlock audio element')
      }
    }

    setIsCreatingResponse(true)
    setError(null)

    try {
      if (!hasValidLaunchIdentifier) {
        throw new Error('Provide either an eventId or token kiosk launch link.')
      }

      // Create response for this kiosk session
      // eventId can be passed via URL param: /kiosk?eventId=...
      // Event voice surveys can launch via public token: /kiosk?token=...
      const launchBody = hasEventLaunch
        ? { eventId: targetEventId, ...(selectedResponseMode ? { selectedResponseMode } : {}) }
        : { token: targetToken, ...(selectedResponseMode ? { selectedResponseMode } : {}) }
      const response = await fetch('/api/response/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(launchBody),
      })

      if (!response.ok) {
        throw new Error('Failed to create response')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Failed to create response')
      }

      const fetchedQuestions = data.data.questions || []

      setResponseId(data.data.responseId)
      setEventId(data.data.eventId)
      const mode = (data.data.responseMode as KioskResponseMode) || 'VOICE_ONLY'
      setResponseMode(mode)
      setQuestionPresentationMode(effectivePresentationMode)
      setQuestions(fetchedQuestions)
      setSessionSurveyContext(data.data.sessionContext ?? null)
      setCurrentQuestionIndex(0)
      setConsentGiven(true)

      // A launch can legitimately have no runnable questions when its only
      // speaker-scoped questions no longer have a live speaker roster. Complete
      // the empty response immediately so the kiosk reaches its normal terminal
      // confirmation without manufacturing an Answer row.
      if (fetchedQuestions.length === 0) {
        const completion = await fetch(`/api/response/${data.data.responseId}/complete`, { method: 'POST' })
        const completionBody = await completion.json().catch(() => null)
        if (!completion.ok || !completionBody?.success) {
          throw new Error(completionBody?.message || 'We could not finish your response. Please try again.')
        }
        setIsResponseCompleted(true)
        setAllQuestionsCompleted(true)
      }
    } catch (err) {
      console.error('Error creating response:', err)
      setError(err instanceof Error ? err.message : 'Failed to start recording session')
    } finally {
      setIsCreatingResponse(false)
    }
  }

  const finalizeResponse = async () => {
    if (!responseId || isCompleting) return
    setIsCompleting(true)
    setError(null)
    try {
      const response = await fetch(`/api/response/${responseId}/complete`, { method: 'POST' })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || 'We could not finish your response. Please try again.')
      }
      setIsResponseCompleted(true)
      setAllQuestionsCompleted(true)
    } catch (completionError) {
      setError(completionError instanceof Error ? completionError.message : 'We could not finish your response. Please try again.')
    } finally {
      setIsCompleting(false)
    }
  }

  const handleAnswerComplete = async (answerId: string, transcriptText?: string, analysisData?: AnalysisInsights) => {
    const currentQuestion = questions[currentQuestionIndex]

    // Stop any ongoing speech
    stopSpeaking()

    // Track pending upload
    if (answerId.startsWith('pending-')) {
      setPendingUploads(prev => new Set(prev).add(answerId))
    }

    // Store completed answer
    setCompletedAnswers(prev => [...prev, {
      answerId,
      questionText: currentQuestion.text,
      transcript: transcriptText,
      analysis: analysisData,
    }])

    // Reset ttsDone for next question, then move to next question or thank-you screen
    setTtsDone(false)

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    } else {
      await finalizeResponse()
    }
  }

  const handleOptionalSkip = async () => {
    stopSpeaking()
    setError(null)
    setTtsDone(false)
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((index) => index + 1)
      return
    }
    await finalizeResponse()
  }

  const handlePresenterRatingsComplete = async (answerIds: string[]) => {
    const currentQuestion = questions[currentQuestionIndex]
    setCompletedAnswers((previous) => [
      ...previous,
      ...answerIds.map((answerId) => ({ answerId, questionText: currentQuestion.text })),
    ])
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((index) => index + 1)
      return
    }
    await finalizeResponse()
  }



  const handleUploadComplete = (answerId: string, success: boolean) => {
    console.log(`[Kiosk] Upload ${success ? 'completed' : 'failed'} for ${answerId}`)

    // Remove from pending
    setPendingUploads(prev => {
      const next = new Set(prev)
      next.delete(answerId)
      return next
    })

    if (!success) {
      console.error(`[Kiosk] Upload failed for answer ${answerId}, but continuing anyway`)
    }
  }

  const handleReset = () => {
    stopSpeaking()
    setConsentGiven(false)
    setAllQuestionsCompleted(false)
    setIsResponseCompleted(false)
    setIsCompleting(false)
    setResponseId(null)
    setEventId(null)
    setQuestions([])
    setCurrentQuestionIndex(0)
    setCompletedAnswers([])
    setError(null)
    setPendingUploads(new Set())
    setResponseMode('VOICE_ONLY')
    setSessionSurveyContext(null)
  }

  if (allQuestionsCompleted) {
    const showGoogleReview =
      eventDetails?.accountType === 'RETAIL' &&
      isValidGoogleReviewUrl(eventDetails?.googleReviewUrl)

    // Telemetry: which thank-you path was taken
    if (showGoogleReview) {
      console.log('[Kiosk] thank_you_google — routing to Google review flow')
    } else {
      console.log('[Kiosk] thank_you_generic — routing to generic thank-you (no valid Google review link)')
    }

    // No valid Google review link → redirect to generic thank-you page (auto-reset)
    if (!showGoogleReview) {
      const thankYouUrl = eventId 
        ? `/kiosk/thank-you?eventId=${encodeURIComponent(eventId)}&responseId=${responseId}` 
        : `/kiosk/thank-you?responseId=${responseId}`
      console.log('[Kiosk] thank-you navigation triggered')
      router.replace(thankYouUrl)
      return (
        <div className="min-h-[100svh] flex items-center justify-center bg-gray-50">
          <div className="animate-spin h-12 w-12 border-4 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      )
    }

    console.log('[Kiosk] thank-you navigation triggered')

    // Google review flow (existing behavior)
    return (
      <div className="min-h-[100svh] bg-gray-50">
        <div className="flex min-h-[100svh] flex-col items-center overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,12px))] pt-3 sm:px-6 sm:pb-10 sm:pt-6 md:py-10 lg:py-12">

          {/* Success header — compact on mobile */}
          <div className="mb-3 flex w-full max-w-lg shrink-0 items-center gap-3 sm:mb-5 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500 shadow-md sm:h-14 sm:w-14 md:h-16 md:w-16">
              <svg className="h-6 w-6 text-white sm:h-7 sm:w-7 md:h-8 md:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-gray-900 sm:text-xl md:text-2xl">
                You Made Our Day!
              </h1>
              <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                Help others discover us on Google
              </p>
            </div>
          </div>

          {/* Social proof — desktop/tablet only so review copy stays above fold on phones */}
          <div className="mb-4 hidden w-full max-w-lg items-center gap-3 sm:mb-6 sm:flex">
            <div className="flex -space-x-2 flex-shrink-0">
              <div className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-br from-blue-400 to-blue-600 shadow-sm" />
              <div className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm" />
              <div className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-br from-purple-400 to-purple-600 shadow-sm" />
            </div>
            <p className="text-sm text-gray-500">
              Join 1,200+ happy customers who&apos;ve shared their experience
            </p>
          </div>

          {/* Google Review Card */}
          <GoogleReviewHelper
            completedAnswers={completedAnswers}
            googleReviewUrl={eventDetails!.googleReviewUrl}
            eventId={eventId}
            responseId={responseId}
          />
        </div>
      </div>
    )
  }

  if (!hasValidLaunchIdentifier) {
    const hasBothLaunchIdentifiers = hasEventLaunch && hasTokenLaunch

    return (
      <div className="min-h-[100svh] bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {hasBothLaunchIdentifiers ? 'Invalid Kiosk Link' : 'Missing Kiosk Link'}
          </h1>
          <p className="text-gray-600 mb-6">
            {hasBothLaunchIdentifiers ? (
              <>
                This kiosk link includes both <code className="px-1.5 py-0.5 bg-gray-100 rounded text-sm">eventId</code> and <code className="px-1.5 py-0.5 bg-gray-100 rounded text-sm">token</code>. Please use the link provided by your administrator.
              </>
            ) : (
              <>
                This kiosk link is missing a required launch identifier. Please use the link provided by your administrator.
              </>
            )}
          </p>
          <p className="text-sm text-gray-400">
            Expected format: /kiosk?eventId=your-event-id or /kiosk?token=public-survey-token
          </p>
        </div>
      </div>
    )
  }

  if (!consentGiven) {
    if (eventDetailsStatus === 'idle' || eventDetailsStatus === 'loading') {
      return <KioskEventDetailsLoading />
    }

    if (eventDetailsStatus === 'error' || !eventDetails) {
      return <KioskLaunchError message={eventDetailsError || 'Please use the kiosk link provided by your administrator.'} />
    }

    return (
      <AttendeeSurveyExperience
        screen="START"
        onStart={handleConsentAccept}
        isStarting={isCreatingResponse}
        startError={error}
        branding={eventDetails.branding}
        consent={eventDetails.consent}
        configuredResponseMode={eventDetails.responseMode ?? 'VOICE_ONLY'}
        configuredPresentationMode={eventDetails.presentationMode ?? 'READ_ALOUD'}
        responseChoiceTiming={eventDetails.accountType === 'EVENTS' ? 'PER_QUESTION' : 'START'}
        contextLabel={eventDetails.speakerContext
          ? `Feedback for ${eventDetails.speakerContext.speaker.name}`
          : eventDetails.sessionContext
            ? [
                `Session · ${eventDetails.sessionContext.session.name}`,
                ...eventDetails.sessionContext.speakers.map((speaker) => speaker.name),
              ].join(' · ')
          : eventDetails.targetContext?.category === 'SESSION'
            ? `Session · ${eventDetails.targetContext.name}`
            : eventDetails.targetContext?.category === 'LOCATION'
              ? `Event Area · ${eventDetails.targetContext.name}`
              : eventDetails.targetContext?.category === 'EVENT'
                ? 'Overall event feedback'
                : eventDetails.targetContext?.name
                  ? `Feedback for ${eventDetails.targetContext.name}`
                  : null}
        surveyIntro={eventDetails.surveyIntro}
      />
    )
  }

  if (!responseId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Preparing recording session...</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center text-gray-600">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p>Finishing your response…</p>
          {error && <button type="button" onClick={() => void finalizeResponse()} disabled={isCompleting} className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50">{isCompleting ? 'Finishing…' : 'Try again'}</button>}
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const totalQuestions = questions.length
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1
  const isSessionSurvey = Boolean(sessionSurveyContext)
  const isSpeakerSurvey = Boolean(eventDetails?.speakerContext)
  const isPresenterRatingsQuestion = Boolean(
    sessionSurveyContext
    && sessionSurveyContext.presenterRatingQuestionId === currentQuestion.questionId
    && currentQuestion.responseTarget === 'SPEAKERS'
    && sessionSurveyContext.speakers.length > 0,
  )
  return (
    <AttendeeSurveyExperience
      screen="QUESTION"
      key={`${currentQuestion.questionId}-${isPresenterRatingsQuestion ? 'presenters' : responseMode}`}
      currentQuestion={currentQuestion}
      questionIndex={currentQuestionIndex}
      totalQuestions={totalQuestions}
      responseId={responseId}
      responseMode={responseMode}
      presentationMode={questionPresentationMode}
      branding={eventDetails?.branding}
      speakerName={eventDetails?.speakerContext?.speaker.name ?? null}
      isPresenterRatingsQuestion={isPresenterRatingsQuestion}
      speakers={sessionSurveyContext?.speakers ?? []}
      sessionContext={isSessionSurvey ? { name: sessionSurveyContext!.session.name, speakers: sessionSurveyContext!.speakers } : null}
      displayAsStars={isSessionSurvey && currentQuestionIndex === 0 && currentQuestion.type === 'RATING_1_TO_5'}
      isSpeaking={isSpeaking}
      ttsDone={ttsDone}
      isMobileDevice={isMobileDevice}
      isIOSDevice={isIOSDevice}
      questionError={error}
      isCompleting={isCompleting}
      onRetry={finalizeResponse}
      onHearQuestion={() => speakText(currentQuestion)}
      onComplete={handleAnswerComplete}
      onPresenterComplete={handlePresenterRatingsComplete}
      onUploadComplete={handleUploadComplete}
      onSkip={handleOptionalSkip}
      onCancel={handleReset}
    />
  )
}

export default function KioskPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <KioskContent />
    </Suspense>
  )
}
