import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const kioskSource = fs.readFileSync(
  path.join(process.cwd(), 'app/kiosk/page.tsx'),
  'utf8',
)

describe('kiosk launch wiring', () => {
  it('reads token alongside eventId and requires exactly one launch identifier', () => {
    expect(kioskSource).toContain("searchParams.get('eventId')")
    expect(kioskSource).toContain("searchParams.get('token')")
    expect(kioskSource).toContain('hasValidLaunchIdentifier = hasEventLaunch !== hasTokenLaunch')
    expect(kioskSource).toContain('Expected format: /kiosk?eventId=your-event-id or /kiosk?token=public-survey-token')
  })

  it('passes eventId or token and the consent-screen choice to the existing response creation endpoint', () => {
    expect(kioskSource).toContain('const launchBody = hasEventLaunch')
    expect(kioskSource).toContain('selectedResponseMode')
    expect(kioskSource).toContain("? { eventId: targetEventId, ...(selectedResponseMode ? { selectedResponseMode } : {}) }")
    expect(kioskSource).toContain(": { token: targetToken, ...(selectedResponseMode ? { selectedResponseMode } : {}) }")
    expect(kioskSource).toContain("fetch('/api/response/create'")
    expect(kioskSource).toContain('body: JSON.stringify(launchBody)')
  })

  it('loads event details by launch query and renders returned questions from response creation', () => {
    expect(kioskSource).toContain('fetch(`/api/kiosk/event-details?${launchQuery}`)')
    expect(kioskSource).toContain('const fetchedQuestions = data.data.questions || []')
    expect(kioskSource).toContain('setQuestions(fetchedQuestions)')
  })

  it('shows a neutral loading state before event details and branding are resolved', () => {
    const loadingGate = kioskSource.indexOf("eventDetailsStatus === 'idle' || eventDetailsStatus === 'loading'")
    const consentRender = kioskSource.indexOf('<AttendeeSurveyExperience')

    expect(kioskSource).toContain("type EventDetailsStatus = 'idle' | 'loading' | 'loaded' | 'error'")
    expect(kioskSource).toContain('function KioskEventDetailsLoading()')
    expect(kioskSource).toContain('Loading kiosk details')
    expect(loadingGate).toBeGreaterThan(-1)
    expect(consentRender).toBeGreaterThan(-1)
    expect(loadingGate).toBeLessThan(consentRender)
  })

  it('passes only resolved event branding and consent into the consent screen', () => {
    const consentScreenBlock = kioskSource.match(/<AttendeeSurveyExperience[\s\S]*?\/>/)?.[0] || ''

    expect(consentScreenBlock).toContain('branding={eventDetails.branding}')
    expect(consentScreenBlock).toContain('consent={eventDetails.consent}')
    expect(consentScreenBlock).toContain("configuredResponseMode={eventDetails.responseMode ?? 'VOICE_ONLY'}")
    expect(consentScreenBlock).toContain("configuredPresentationMode={eventDetails.presentationMode ?? 'READ_ALOUD'}")
    expect(consentScreenBlock).not.toContain('branding={eventDetails?.branding}')
    expect(consentScreenBlock).not.toContain('consent={eventDetails?.consent}')
  })

  it('shows a clean error state when event details fail instead of falling back to generic consent', () => {
    const errorGate = kioskSource.indexOf("eventDetailsStatus === 'error' || !eventDetails")
    const consentRender = kioskSource.indexOf('<AttendeeSurveyExperience')

    expect(kioskSource).toContain("throw new Error(data?.error || 'Failed to load kiosk details')")
    expect(kioskSource).toContain('function KioskLaunchError')
    expect(kioskSource).toContain('<KioskLaunchError message={eventDetailsError')
    expect(errorGate).toBeGreaterThan(-1)
    expect(consentRender).toBeGreaterThan(-1)
    expect(errorGate).toBeLessThan(consentRender)
  })

  it('uses one type-aware kiosk flow and waits for authoritative completion', () => {
    expect(kioskSource).toContain("import { AttendeeSurveyExperience } from '@/components/kiosk/AttendeeSurveyExperience'")
    expect(kioskSource).toContain('<AttendeeSurveyExperience')
    expect(kioskSource).toContain('onComplete={handleAnswerComplete}')
    expect(kioskSource).toContain('onUploadComplete={handleUploadComplete}')
    expect(kioskSource).toContain('await finalizeResponse()')
    expect(kioskSource).toContain('if (!response.ok || !body?.success)')
    expect(kioskSource).not.toContain('keepalive: true')
  })

  it('uses delegated attendee choices once and keeps screen presentation out of autoplay', () => {
    expect(kioskSource).toContain("const [questionPresentationMode, setQuestionPresentationMode] = useState<'SCREEN' | 'READ_ALOUD'>('READ_ALOUD')")
    expect(kioskSource).toContain("const handleConsentAccept = async (selection?: { responseMode?: AttendeeResponseMode; presentationMode?: 'SCREEN' | 'READ_ALOUD' })")
    expect(kioskSource).toContain("responseMode !== 'TEXT_ONLY'")
    expect(kioskSource).toContain("responseMode === 'TEXT_ONLY' || questionPresentationMode === 'SCREEN'")
    expect(kioskSource).toContain("questionPresentationMode === 'READ_ALOUD'")
    expect(kioskSource).toContain('responseMode={responseMode}')
    expect(kioskSource).toContain('onHearQuestion={() => speakText(currentQuestion)}')
    expect(kioskSource).toContain("responseChoiceTiming={eventDetails.accountType === 'EVENTS' ? 'PER_QUESTION' : 'START'}")
  })

  it('autoplays Voice-first organizer questions after consent without a platform-specific exclusion', () => {
    const autoplayBlock = kioskSource.match(/\/\/ Auto-read each eligible question[\s\S]*?\n  \}, \[consentGiven[\s\S]*?\]\)/)?.[0] || ''

    expect(autoplayBlock).toContain("questionPresentationMode === 'SCREEN'")
    expect(autoplayBlock).toContain("responseMode === 'TEXT_ONLY'")
    expect(autoplayBlock).toContain('const sessionKey = `tts-autoplay-${responseId}-${currentQuestion.id}`')
    expect(autoplayBlock).toContain('currentQuestionIndex')
    expect(autoplayBlock).not.toContain('isMobileDevice && !isIOSDevice')
    expect(kioskSource).toContain('const audioSessionRef = useRef<BrowserAudioSession | null>(null)')
    expect(kioskSource).toContain('if (selectedVoiceMode)')
    expect(kioskSource).not.toContain('if (isIOSDevice && selectedVoiceMode)')
    expect(kioskSource).toContain('audioSession,')
    expect(kioskSource).toContain('beginBrowserAudioSession(audio)')
    expect(kioskSource).not.toContain('setTimeout(() => {\n          speakText(currentQuestion)')
    expect(kioskSource).toContain('voice: question.ttsVoice ?? null')
  })

  it('advances Voice-first questions through the same autoplay gate while preserving attendee and custom choices', () => {
    expect(kioskSource).toContain('setCurrentQuestionIndex(prev => prev + 1)')
    expect(kioskSource).toContain('setTtsDone(false)')
    expect(kioskSource).toContain('setQuestionPresentationMode(effectivePresentationMode)')
    expect(kioskSource).toContain('const selectedResponseMode = selection?.responseMode')
    expect(kioskSource).toContain('const selectedPresentationMode = selection?.presentationMode')
  })

  it('does not autoplay spoken prompts for structured questions and passes the shared optional skip path to every answer mode', () => {
    expect(kioskSource).toContain('onSkip={handleOptionalSkip}')
    expect(kioskSource).toContain("setCurrentQuestionIndex((index) => index + 1)")
    expect(kioskSource).toContain('await finalizeResponse()')
  })

  it('uses session context only for linked surveys and expands the structured presenter question into live speaker cards', () => {
    expect(kioskSource).toContain('setSessionSurveyContext(data.data.sessionContext ?? null)')
    expect(kioskSource).toContain('Feedback for ${eventDetails.speakerContext.speaker.name}')
    expect(kioskSource).toContain('speakerName={eventDetails?.speakerContext?.speaker.name ?? null}')
    expect(kioskSource).toContain('sessionSurveyContext.presenterRatingQuestionId === currentQuestion.questionId')
    expect(kioskSource).toContain('isPresenterRatingsQuestion={isPresenterRatingsQuestion}')
    expect(kioskSource).toContain('speakers={sessionSurveyContext?.speakers ?? []}')
    expect(kioskSource).toContain('sessionContext={isSessionSurvey ? { name: sessionSurveyContext!.session.name, speakers: sessionSurveyContext!.speakers } : null}')
    expect(kioskSource).toContain("displayAsStars={isSessionSurvey && currentQuestionIndex === 0 && currentQuestion.type === 'RATING_1_TO_5'}")
    expect(kioskSource).not.toContain("isPresenterRatingsQuestion ? 'overflow-y-auto' : 'overflow-hidden'")
  })

  it('shows the token-scoped survey intro and effective Session or Event Area context before the survey', () => {
    expect(kioskSource).toContain('surveyIntro: data.event.surveyIntro ?? null')
    expect(kioskSource).toContain('targetContext: data.event.targetContext ?? null')
    expect(kioskSource).toContain("`Session · ${eventDetails.targetContext.name}`")
    expect(kioskSource).toContain("`Event Area · ${eventDetails.targetContext.name}`")
    expect(kioskSource).toContain('surveyIntro={eventDetails.surveyIntro}')
  })

  it('finishes a launch with no runnable questions instead of rendering an empty question screen', () => {
    expect(kioskSource).not.toContain("throw new Error('No questions available for this event. Please contact support.')")
    expect(kioskSource).toContain('if (fetchedQuestions.length === 0)')
    expect(kioskSource).toContain('setAllQuestionsCompleted(true)')
    expect(kioskSource).toContain('Finishing your response…')
  })
})
