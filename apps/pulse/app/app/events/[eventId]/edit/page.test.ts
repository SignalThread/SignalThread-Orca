import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const surveyDetailPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/edit/page.tsx'),
  'utf8',
)

const retailEditPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/surveys/[surveyId]/edit/page.tsx'),
  'utf8',
)

describe('EVENTS survey detail page', () => {
  it('loads the event voice survey package for a scoped account', () => {
    expect(surveyDetailPageSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(surveyDetailPageSource).toContain('fetch(`/api/app/account?account=${accountSlug}`')
    expect(surveyDetailPageSource).toContain('if (!isEventsAccount(accountBody.account?.accountType))')
    expect(surveyDetailPageSource).toContain('router.replace(`/app/events/${eventId}/dashboard?account=${accountSlug}`)')
    expect(surveyDetailPageSource).toContain('fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    expect(surveyDetailPageSource).toContain('Event voice survey not found or access denied')
  })

  it('loads the event voice survey package only after account type is confirmed EVENTS', () => {
    const accountFetchIndex = surveyDetailPageSource.indexOf('fetch(`/api/app/account?account=${accountSlug}`')
    const productGateIndex = surveyDetailPageSource.indexOf('if (!isEventsAccount(accountBody.account?.accountType))')
    const voiceSurveysFetchIndex = surveyDetailPageSource.indexOf('fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')

    expect(accountFetchIndex).toBeGreaterThan(-1)
    expect(productGateIndex).toBeGreaterThan(accountFetchIndex)
    expect(voiceSurveysFetchIndex).toBeGreaterThan(productGateIndex)
  })

  it('opens the survey selected by the survey query param, not only the first survey', () => {
    expect(surveyDetailPageSource).toContain("const surveyIdParam = searchParams.get('survey')")
    expect(surveyDetailPageSource).toContain('surveys.find((candidate) => candidate.id === surveyIdParam)')
    expect(surveyDetailPageSource).toContain('...(survey ? { surveyId: survey.id } : {})')
  })

  it('renders a survey header with one lifecycle status and counts, without event-name editing', () => {
    expect(surveyDetailPageSource).toContain('function surveyLifecycleStatus(survey: EventVoiceSurveyDetail)')
    expect(surveyDetailPageSource).toContain("if (survey.status === 'COMPLETED') return { key: 'completed', label: 'Completed', tone: 'muted' }")
    expect(surveyDetailPageSource).toContain('<EventStatusPill tone={status.tone} label={status.label} size="sm" />')
    expect(surveyDetailPageSource).toContain('{survey.name}')
    expect(surveyDetailPageSource).toContain('{survey.target.name}')
    expect(surveyDetailPageSource).toContain('question{questionCount === 1')
    expect(surveyDetailPageSource).toContain('response{survey.responseCount === 1')
    // Event-name editing does not belong on Survey detail.
    expect(surveyDetailPageSource).not.toContain('setEventName')
    expect(surveyDetailPageSource).not.toContain('eventName,')
    expect(surveyDetailPageSource).not.toContain('Event name')
  })

  it('shows one state-specific primary action per lifecycle state', () => {
    expect(surveyDetailPageSource).toContain("{status.key === 'draft' && (")
    expect(surveyDetailPageSource).toContain('Publish Survey')
    expect(surveyDetailPageSource).toContain("const isLaunchable = status.key === 'live'")
    expect(surveyDetailPageSource).toContain('{isLaunchable && survey.publicLink && (')
    expect(surveyDetailPageSource).toContain('Launch Kiosk')
    expect(surveyDetailPageSource).toContain("{status.key === 'archived' && (")
    expect(surveyDetailPageSource).toContain('Restore to Draft')
    expect(surveyDetailPageSource).toContain('Completed — collection closed.')
    expect(surveyDetailPageSource).toContain('Completed surveys preserve their response history and cannot collect new responses.')
  })

  it('organizes the detail into Content, Voice, Deployment, and Lifecycle sections', () => {
    expect(surveyDetailPageSource).toContain("{ key: 'content', label: 'Content' }")
    expect(surveyDetailPageSource).toContain("{ key: 'voice', label: 'Voice' }")
    expect(surveyDetailPageSource).toContain("{ key: 'deployment', label: 'Deployment' }")
    expect(surveyDetailPageSource).toContain("{ key: 'lifecycle', label: 'Lifecycle' }")
    expect(surveyDetailPageSource).toContain("{activeSection === 'content' && (")
    expect(surveyDetailPageSource).toContain("{activeSection === 'voice' && (")
    expect(surveyDetailPageSource).toContain("{activeSection === 'deployment' && (")
    expect(surveyDetailPageSource).toContain("{activeSection === 'lifecycle' && (")
  })

  it('owns content editing with questions, AI generation, and optional description', () => {
    expect(surveyDetailPageSource).toContain('<QuestionBuilder')
    expect(surveyDetailPageSource).toContain('onChange={setQuestions}')
    expect(surveyDetailPageSource).toContain('enableMixedTypes')
    expect(surveyDetailPageSource).toContain('allowTypeChange={survey.responseCount === 0}')
    expect(surveyDetailPageSource).toContain("type: question.type ?? 'VOICE'")
    expect(surveyDetailPageSource).toContain('required: question.required ?? true')
    expect(surveyDetailPageSource).toContain('aiMode="events"')
    expect(surveyDetailPageSource).toContain('Survey description')
    expect(surveyDetailPageSource).toContain('surveyDescription: surveyDescription.trim()')
    expect(surveyDetailPageSource).toContain("method: 'PATCH'")
    expect(surveyDetailPageSource).toContain('questions: normalizedQuestions.map((question, index) => ({')
  })

  it('owns voice with a compact summary, Change voice disclosure, preview, and regeneration rules', () => {
    expect(surveyDetailPageSource).toContain("const [showVoiceOptions, setShowVoiceOptions] = useState(false)")
    expect(surveyDetailPageSource).toContain('Change voice')
    expect(surveyDetailPageSource).toContain('{showVoiceOptions && (')
    expect(surveyDetailPageSource).toContain('TTS_GENDER_OPTIONS')
    expect(surveyDetailPageSource).toContain('getVoiceSelectOptions(ttsVoice)')
    expect(surveyDetailPageSource).toContain('Preview Voice')
    expect(surveyDetailPageSource).toContain('Audio regenerates automatically when you save voice or question text changes.')
    expect(surveyDetailPageSource).toContain('ttsLocale: deriveLocaleFromVoice(ttsVoice')
  })

  it('owns deployment with reused QR primitives and state-valid actions only', () => {
    expect(surveyDetailPageSource).toContain('<SurveyQrCard')
    expect(surveyDetailPageSource).toContain('path={survey.publicLink.kioskPath}')
    expect(surveyDetailPageSource).toContain("const isLaunchable = status.key === 'live' && Boolean(survey.publicLink?.isActive)")
    expect(surveyDetailPageSource).toContain('isLaunchable && survey.publicLink ? (')
    expect(surveyDetailPageSource).toContain('Draft — not launchable.')
    expect(surveyDetailPageSource).toContain('Archived — launch disabled.')
    expect(surveyDetailPageSource).toContain('Disabled link: {survey.publicLink.kioskPath}')
  })

  it('makes unscheduled session deployment actionable without duplicating launch warnings', () => {
    expect(surveyDetailPageSource).toContain("const automaticSchedulingUnavailable = survey.availabilityMode === 'RELATIVE_TO_EVENT_AREA'")
    expect(surveyDetailPageSource).toContain("survey.target.category === 'SESSION'")
    expect(surveyDetailPageSource).toContain('data-testid="automatic-scheduling-unavailable"')
    expect(surveyDetailPageSource).toContain('Automatic scheduling unavailable')
    expect(surveyDetailPageSource).toContain('Add a session date and time to schedule this survey automatically. You can still publish it manually now.')
    expect(surveyDetailPageSource).toContain("Saving deployment changes does not publish this survey.")
    expect(surveyDetailPageSource).toContain("issue !== 'Survey is unpublished'")
    expect(surveyDetailPageSource).toContain("issue !== 'Public survey link is inactive'")
    expect(surveyDetailPageSource).toContain("issue !== 'Add a session date and time to enable automatic survey scheduling. You can still publish this survey manually.'")
    expect(surveyDetailPageSource).toContain("hasActivePublicLink && survey.publicLink && (")
    const automaticSchedulingPanel = surveyDetailPageSource.match(/data-testid="automatic-scheduling-unavailable"[\s\S]*?\n\s*\) : status\.key === 'archived'/)?.[0] || ''
    expect(automaticSchedulingPanel).toContain("status.key === 'draft'")
    expect(automaticSchedulingPanel).toContain("Publish Survey")
    expect(automaticSchedulingPanel).toContain('hasActivePublicLink && survey.publicLink')
    expect(automaticSchedulingPanel).toContain('Launch Kiosk')
  })

  it('offers the survey response method in Deployment and persists the shared responseMode', () => {
    expect(surveyDetailPageSource).toContain("responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'")
    expect(surveyDetailPageSource).toContain("const [responseMode, setResponseMode] = useState<EventVoiceSurveyDetail['responseMode']>('VOICE_ONLY')")
    expect(surveyDetailPageSource).toContain("setResponseMode(survey.responseMode ?? 'VOICE_ONLY')")
    expect(surveyDetailPageSource).toContain('Response method')
    expect(surveyDetailPageSource).toContain('Let attendee choose')
    expect(surveyDetailPageSource).toContain("responseMode === 'VOICE_AND_TEXT'")
    expect(surveyDetailPageSource).toContain('Attendees choose to speak or type once on the consent screen.')
    expect(surveyDetailPageSource).toContain('<SurveyResponseMethodPreview responseMode={responseMode} />')
    expect(surveyDetailPageSource).toContain("{savingAvailability ? 'Saving...' : 'Save deployment'}")
  })

  it('keeps lifecycle transitions on the canonical PATCH endpoint', () => {
    expect(surveyDetailPageSource).toContain("const handlePublish = () => handleLifecycle({ status: 'ACTIVE' }")
    expect(surveyDetailPageSource).toContain("const handleUnpublish = () => handleLifecycle({ status: 'DRAFT' }")
    expect(surveyDetailPageSource).toContain('const handleArchive = () => handleLifecycle({ archived: true }')
    expect(surveyDetailPageSource).toContain('const handleRestore = () => handleLifecycle({ archived: false }')
    expect(surveyDetailPageSource).toContain('Unpublish to Draft')
    expect(surveyDetailPageSource).toContain('Publishing activates the survey')
  })

  it('guards deletion in a Danger Zone with explicit confirmation and server authority', () => {
    expect(surveyDetailPageSource).toContain('Danger Zone')
    expect(surveyDetailPageSource).toContain("method: 'DELETE'")
    expect(surveyDetailPageSource).toContain('Delete survey?')
    expect(surveyDetailPageSource).toContain('Surveys with responses are blocked from deletion and should be archived instead.')
    expect(surveyDetailPageSource).toContain('setDeleteConfirmOpen(true)')
    expect(surveyDetailPageSource).toContain('router.push(surveysPath)')
  })

  it('navigates back to the Surveys index and keeps event-operator language', () => {
    expect(surveyDetailPageSource).toContain('Back to Surveys')
    expect(surveyDetailPageSource).toContain('tab=surveys')
    expect(surveyDetailPageSource).not.toMatch(/survey target/i)
    expect(surveyDetailPageSource).not.toContain('Google Review')
    expect(surveyDetailPageSource).not.toContain('storefront')
  })

  it('keeps retail survey edit unchanged', () => {
    expect(retailEditPageSource).toContain('export default function EditSurveyPage')
    expect(retailEditPageSource).toContain('fetch(`/api/app/events/${params.surveyId}?account=${accountSlug}`')
    expect(retailEditPageSource).toContain('<QuestionBuilder')
    expect(retailEditPageSource).not.toContain('Publish survey')
    expect(retailEditPageSource).not.toContain('Make draft')
    expect(retailEditPageSource).not.toContain('Delete survey?')
  })
})
