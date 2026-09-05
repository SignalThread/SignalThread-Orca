'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SurveyQrCard } from '@/components/ui/SurveyQrCard'
import { QuestionBuilder, type Question } from '@/components/surveys/QuestionBuilder'
import { isEventsAccount } from '@/lib/account-product-mode'
import { EventCard, EventStatusPill, EventTabs, EventEmptyState, type EventStatusTone } from '@/components/app/events'
import { SurveyResponseMethodPreview } from '@/components/events/SurveyResponseMethodPreview'
import {
  SurveyAvailabilityEditor,
  defaultSurveyAvailability,
  type SurveyAvailabilityFormValue,
} from '@/components/app/events/SurveyAvailabilityEditor'
import {
  DEFAULT_TTS_GENDER,
  DEFAULT_TTS_LOCALE_LITERAL,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE_LITERAL,
  QUESTION_AUDIO_PREVIEW_TEXT,
  TTS_GENDER_OPTIONS,
  deriveGenderFromVoice,
  deriveLocaleFromVoice,
  getPreferredVoiceForGender,
  getVoiceSelectOptions,
  type TtsVoiceGender,
} from '@/lib/tts-voices'

interface EventVoiceSurveyDetail {
  id: string
  name: string
  description: string | null
  status: string
  isArchived: boolean
  responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  responseCount: number
  ttsProvider: string | null
  ttsVoice: string | null
  ttsLocale: string | null
  availabilityMode: SurveyAvailabilityFormValue['mode']
  availabilityTimezone: string | null
  availabilityOpensAt: string | null
  availabilityClosesAt: string | null
  availabilityOpenAnchor: SurveyAvailabilityFormValue['openAnchor']
  availabilityCloseAnchor: SurveyAvailabilityFormValue['closeAnchor']
  availabilityOpenOffsetMinutes: number | null
  availabilityCloseOffsetMinutes: number | null
  availabilityOverride: SurveyAvailabilityFormValue['override']
  availability: {
    state: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED' | 'INVALID'
    message: string
    effectiveOpensAt: string | null
    effectiveClosesAt: string | null
  }
  readiness: {
    responseEligible: boolean
    issues: string[]
  }
  target: {
    id: string
    name: string
    category: string
    eventStructureItemId?: string | null
    eventStructureItem?: { startsAt: string | null; endsAt: string | null } | null
  }
  questions: Array<{
    id: string
    key: string
    label: string
    order: number
    required: boolean
    type: 'VOICE' | 'RATING_1_TO_5' | 'RECOMMENDATION_0_TO_10'
    responseTarget?: 'GENERAL' | 'SESSION' | 'SPEAKERS'
  }>
  publicLink: {
    id: string
    kioskPath: string
    isActive: boolean
  } | null
}

interface VoiceSurveyPackageData {
  event?: {
    id: string
    name: string
    status: string
    startDate: string | null
    endDate: string | null
    ttsProvider: string | null
    ttsVoice: string | null
    ttsLocale: string | null
  }
  surveys?: EventVoiceSurveyDetail[]
}

// One lifecycle status per survey; launchable state is expressed through the
// valid actions for that state, not a second badge.
function surveyLifecycleStatus(survey: EventVoiceSurveyDetail): { key: 'live' | 'draft' | 'completed' | 'archived'; label: string; tone: EventStatusTone } {
  if (survey.isArchived) return { key: 'archived', label: 'Archived', tone: 'muted' }
  if (survey.status === 'ACTIVE') return { key: 'live', label: 'Live', tone: 'live' }
  if (survey.status === 'COMPLETED') return { key: 'completed', label: 'Completed', tone: 'muted' }
  return { key: 'draft', label: 'Draft', tone: 'attention' }
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

function EventSurveyDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const accountSlug = searchParams.get('account')
  const surveyIdParam = searchParams.get('survey')
  const eventId = typeof params.eventId === 'string' ? params.eventId : ''
  const accountPath = accountSlug ? `/app?account=${accountSlug}` : '/app'
  const surveysPath = accountSlug
    ? `/app/events/${eventId}?account=${accountSlug}&tab=surveys`
    : `/app/events/${eventId}?tab=surveys`
  const newSurveyPath = accountSlug
    ? `/app/events/${eventId}/surveys/new?account=${accountSlug}`
    : `/app/events/${eventId}/surveys/new`

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pkgEvent, setPkgEvent] = useState<VoiceSurveyPackageData['event'] | null>(null)
  const [surveys, setSurveys] = useState<EventVoiceSurveyDetail[]>([])

  const [activeSection, setActiveSection] = useState<'content' | 'voice' | 'deployment' | 'lifecycle'>('content')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  // Content form state, hydrated from the selected canonical survey.
  const [surveyName, setSurveyName] = useState('')
  const [surveyDescription, setSurveyDescription] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [savingContent, setSavingContent] = useState(false)

  // Voice state — picker stays behind Change voice.
  const [ttsProvider, setTtsProvider] = useState(DEFAULT_TTS_PROVIDER)
  const [ttsGender, setTtsGender] = useState<TtsVoiceGender>(DEFAULT_TTS_GENDER)
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_TTS_VOICE_LITERAL)
  const [showVoiceOptions, setShowVoiceOptions] = useState(false)
  const [savingVoice, setSavingVoice] = useState(false)
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null)
  const [availability, setAvailability] = useState<SurveyAvailabilityFormValue>(() => defaultSurveyAvailability())
  const [responseMode, setResponseMode] = useState<EventVoiceSurveyDetail['responseMode']>('VOICE_ONLY')
  const [savingAvailability, setSavingAvailability] = useState(false)

  // Lifecycle + danger-zone state. All transitions stay server-authoritative.
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadPackage = useCallback(async () => {
    if (!accountSlug || !eventId) {
      setLoadError('Missing account or event parameter.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const accountResponse = await fetch(`/api/app/account?account=${accountSlug}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const accountBody = await accountResponse.json().catch(() => ({}))
      if (!accountResponse.ok || !accountBody?.success) {
        throw new Error(accountBody?.error || 'Failed to load account')
      }
      if (!isEventsAccount(accountBody.account?.accountType)) {
        router.replace(`/app/events/${eventId}/dashboard?account=${accountSlug}`)
        return
      }

      const response = await fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Event voice survey not found or access denied')
      }

      const data = body.data as VoiceSurveyPackageData
      setPkgEvent(data.event ?? null)
      setSurveys(data.surveys ?? [])
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load event voice survey')
    } finally {
      setLoading(false)
    }
  }, [accountSlug, eventId, router])

  useEffect(() => {
    loadPackage()
  }, [loadPackage])

  // The survey query param selects the survey; unknown ids fall back to the
  // first survey (current behavior, preserved).
  const survey =
    (surveyIdParam && surveys.find((candidate) => candidate.id === surveyIdParam)) ||
    surveys[0] ||
    null

  useEffect(() => {
    if (!survey) return
    setSurveyName(survey.name)
    setSurveyDescription(survey.description ?? '')
    setQuestions(
      survey.questions.map((question) => ({
        id: question.id,
        text: question.label,
        order: question.order,
        type: question.type ?? 'VOICE',
        required: question.required,
        responseTarget: question.responseTarget,
      })),
    )
    const resolvedVoice = survey.ttsVoice || pkgEvent?.ttsVoice || DEFAULT_TTS_VOICE_LITERAL
    setTtsProvider(survey.ttsProvider || pkgEvent?.ttsProvider || DEFAULT_TTS_PROVIDER)
    setTtsVoice(resolvedVoice)
    setTtsGender(deriveGenderFromVoice(resolvedVoice))
    setAvailability({
      mode: survey.availabilityMode ?? 'OPEN_IMMEDIATELY',
      timezone: survey.availabilityTimezone,
      opensAt: survey.availabilityOpensAt,
      closesAt: survey.availabilityClosesAt,
      openAnchor: survey.availabilityOpenAnchor,
      closeAnchor: survey.availabilityCloseAnchor,
      openOffsetMinutes: survey.availabilityOpenOffsetMinutes,
      closeOffsetMinutes: survey.availabilityCloseOffsetMinutes,
      override: survey.availabilityOverride,
    })
    setResponseMode(survey.responseMode ?? 'VOICE_ONLY')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey?.id])

  const applyPackage = (data: VoiceSurveyPackageData) => {
    if (data.event) setPkgEvent(data.event)
    setSurveys(data.surveys ?? [])
  }

  const patchSurvey = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(survey ? { surveyId: survey.id } : {}), ...payload }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body?.success) {
      throw new Error(body?.error || 'Failed to update survey')
    }
    applyPackage(body.data as VoiceSurveyPackageData)
  }

  const handleSaveContent = async () => {
    if (!accountSlug || !eventId || !survey || savingContent) return

    if (!surveyName.trim()) {
      setActionError('Survey name is required')
      return
    }

    const normalizedQuestions = questions
      .map((question) => ({ ...question, text: question.text.trim() }))
      .filter((question) => question.text.length > 0)
      .sort((a, b) => a.order - b.order)

    if (normalizedQuestions.length === 0) {
      setActionError('At least one question is required')
      return
    }

    try {
      setSavingContent(true)
      setActionError(null)
      setActionNotice(null)
      await patchSurvey({
        surveyName,
        surveyDescription: surveyDescription.trim(),
        questions: normalizedQuestions.map((question, index) => ({
          id: question.id,
          text: question.text,
          type: question.type ?? 'VOICE',
          order: index,
          required: question.required ?? true,
          responseTarget: question.responseTarget ?? 'GENERAL',
        })),
      })
      setActionNotice('Survey content saved.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save survey content')
    } finally {
      setSavingContent(false)
    }
  }

  const handleSaveVoice = async () => {
    if (!accountSlug || !eventId || !survey || savingVoice) return

    try {
      setSavingVoice(true)
      setActionError(null)
      setActionNotice(null)
      await patchSurvey({
        ttsProvider,
        ttsVoice,
        ttsLocale: deriveLocaleFromVoice(ttsVoice, pkgEvent?.ttsLocale || DEFAULT_TTS_LOCALE_LITERAL),
      })
      setActionNotice('Survey voice saved. Question audio regenerates automatically when the voice changes.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save survey voice')
    } finally {
      setSavingVoice(false)
    }
  }

  const handleSaveAvailability = async () => {
    if (!survey || savingAvailability) return
    try {
      setSavingAvailability(true)
      setActionError(null)
      setActionNotice(null)
      await patchSurvey({
        availability,
        responseMode,
      })
      setActionNotice('Survey deployment settings saved.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save survey availability')
    } finally {
      setSavingAvailability(false)
    }
  }

  const handleLifecycle = async (payload: { status?: 'ACTIVE' | 'DRAFT'; archived?: boolean }, notice: string) => {
    if (!accountSlug || !eventId || !survey || lifecycleBusy) return

    try {
      setLifecycleBusy(true)
      setActionError(null)
      setActionNotice(null)
      await patchSurvey(payload)
      setActionNotice(notice)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update survey lifecycle')
    } finally {
      setLifecycleBusy(false)
    }
  }

  const handlePublish = () => handleLifecycle({ status: 'ACTIVE' }, 'Survey published. Its kiosk link and QR code are live.')
  const handleUnpublish = () => handleLifecycle({ status: 'DRAFT' }, 'Survey returned to draft. Its kiosk link is disabled.')
  const handleArchive = () => handleLifecycle({ archived: true }, 'Survey archived. Launch is disabled and response history is preserved.')
  const handleRestore = () => handleLifecycle({ archived: false }, 'Survey restored to draft. Publish it again when ready.')

  const handleDeleteSurvey = async () => {
    if (!accountSlug || !eventId || !survey || deleting) return

    try {
      setDeleting(true)
      setActionError(null)
      const response = await fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: survey.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Failed to delete survey')
      }
      router.push(surveysPath)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete survey')
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  const handleGenderChange = (gender: TtsVoiceGender) => {
    setTtsGender(gender)
    setTtsVoice(getPreferredVoiceForGender(gender))
  }

  const handleVoiceChange = (voice: string) => {
    setTtsVoice(voice)
    setTtsGender(deriveGenderFromVoice(voice))
  }

  const handlePreviewVoice = async () => {
    if (!accountSlug || previewingVoice) return

    try {
      setPreviewingVoice(true)
      setActionError(null)

      const response = await fetch(`/api/app/question-audio/preview?account=${accountSlug}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: ttsProvider,
          voice: ttsVoice,
          locale: deriveLocaleFromVoice(ttsVoice, pkgEvent?.ttsLocale || DEFAULT_TTS_LOCALE_LITERAL),
          text: QUESTION_AUDIO_PREVIEW_TEXT,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to preview voice')
      }

      audioPreviewRef.current?.pause()
      const audio = new Audio(`data:${body.mimeType};base64,${body.audioBase64}`)
      audioPreviewRef.current = audio
      await audio.play()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to preview voice')
    } finally {
      setPreviewingVoice(false)
    }
  }

  const voiceOptions = getVoiceSelectOptions(ttsVoice)
  const selectedVoiceLabel = voiceOptions.find((option) => option.value === ttsVoice)?.label ?? ttsVoice

  if (loading) {
    return (
      <AdminLayout homePath={accountPath}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-zinc-500 dark:text-zinc-400">Loading survey...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (loadError) {
    return (
      <AdminLayout homePath={accountPath}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <EventCard className="max-w-md">
            <div className="text-center">
              <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Survey Not Found
              </h1>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{loadError}</p>
              <Button onClick={() => router.push(accountPath)}>Back to Events</Button>
            </div>
          </EventCard>
        </div>
      </AdminLayout>
    )
  }

  if (!survey) {
    return (
      <AdminLayout homePath={accountPath}>
        <div className="mx-auto max-w-2xl pt-10">
          <EventEmptyState
            title="No surveys in this Event yet."
            description="Create the first survey to generate a token-based kiosk link for this Event."
            actions={[
              { label: 'New Survey', variant: 'primary', onClick: () => router.push(newSurveyPath) },
              { label: 'Back to Surveys', variant: 'secondary', onClick: () => router.push(surveysPath) },
            ]}
          />
        </div>
      </AdminLayout>
    )
  }

  const status = surveyLifecycleStatus(survey)
  const isLaunchable = status.key === 'live' && Boolean(survey.publicLink?.isActive) && survey.readiness.responseEligible
  const hasActivePublicLink = status.key === 'live' && Boolean(survey.publicLink?.isActive)
  const automaticSchedulingUnavailable = survey.availabilityMode === 'RELATIVE_TO_EVENT_AREA'
    && survey.target.category === 'SESSION'
    && Boolean(survey.target.eventStructureItemId)
    && (!survey.target.eventStructureItem?.startsAt || !survey.target.eventStructureItem?.endsAt)
  const deploymentReadinessIssues = automaticSchedulingUnavailable
    ? survey.readiness.issues.filter((issue) => issue !== 'Survey is unpublished'
      && issue !== 'Public survey link is inactive'
      && issue !== 'Add a session date and time to enable automatic survey scheduling. You can still publish this survey manually.')
    : survey.readiness.issues
  const responseWindowContext = survey.target.category === 'SESSION'
    ? survey.target.eventStructureItem?.startsAt && survey.target.eventStructureItem?.endsAt
      ? { label: survey.target.name, startsAt: survey.target.eventStructureItem.startsAt, endsAt: survey.target.eventStructureItem.endsAt }
      : null
    : pkgEvent?.startDate && pkgEvent?.endDate
      ? { label: pkgEvent.name, startsAt: pkgEvent.startDate, endsAt: pkgEvent.endDate }
      : null
  const questionCount = survey.questions.length

  return (
    <AdminLayout homePath={accountPath}>
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <a
            href={surveysPath}
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-blue-700 dark:text-zinc-400 dark:hover:text-blue-300"
          >
            ← Back to Surveys
          </a>
        </div>

        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EventStatusPill tone={status.tone} label={status.label} size="sm" />
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
                {survey.name}
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
              {survey.target.name} · {questionCount} question{questionCount === 1 ? '' : 's'} · {survey.responseCount} response{survey.responseCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="shrink-0">
            {/* One state-specific primary action. */}
            {status.key === 'draft' && (
              <Button type="button" onClick={handlePublish} disabled={lifecycleBusy}>
                {lifecycleBusy ? 'Publishing...' : 'Publish Survey'}
              </Button>
            )}
            {isLaunchable && survey.publicLink && (
              <a
                href={survey.publicLink.kioskPath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-900"
              >
                Launch Kiosk
              </a>
            )}
            {status.key === 'archived' && (
              <Button type="button" onClick={handleRestore} disabled={lifecycleBusy}>
                {lifecycleBusy ? 'Restoring...' : 'Restore to Draft'}
              </Button>
            )}
          </div>
        </header>

        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {actionError}
          </div>
        )}
        {actionNotice && !actionError && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {actionNotice}
          </div>
        )}

        <EventTabs
          tabs={[
            { key: 'content', label: 'Content' },
            { key: 'voice', label: 'Voice' },
            { key: 'deployment', label: 'Deployment' },
            { key: 'lifecycle', label: 'Lifecycle' },
          ]}
          activeKey={activeSection}
          onSelect={(key) => setActiveSection(key as typeof activeSection)}
        />

        {activeSection === 'content' && (
          <EventCard padding="md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Survey Content</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Name, description, and the questions attendees answer in the kiosk.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="survey-detail-name" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Survey name
                </label>
                <input
                  id="survey-detail-name"
                  value={surveyName}
                  onChange={(currentEvent) => setSurveyName(currentEvent.target.value)}
                  disabled={savingContent}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="survey-detail-description" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Survey description <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  id="survey-detail-description"
                  value={surveyDescription}
                  onChange={(currentEvent) => setSurveyDescription(currentEvent.target.value)}
                  placeholder="Internal context for this survey"
                  disabled={savingContent}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <QuestionBuilder
                questions={questions}
                onChange={setQuestions}
                enableMixedTypes
                enablePresenterRatingTarget={survey.target.category === 'SESSION'}
                allowTypeChange={survey.responseCount === 0}
                surveyName={surveyName}
                description={`${pkgEvent?.name ?? ''}. ${surveyDescription || survey.target.name}`}
                aiMode="events"
                aiGenerateDescription="Generate attendee feedback questions for this Event survey."
                aiContextLabel="Event context"
                aiContextPlaceholder="e.g., conference session, expo hall, check-in"
                aiDefaultContext="event"
                aiGoalOptions={[
                  { value: 'feedback', label: 'Live feedback' },
                  { value: 'session_quality', label: 'Session quality' },
                  { value: 'event_operations', label: 'Event operations' },
                  { value: 'attendee_satisfaction', label: 'Attendee satisfaction' },
                ]}
              />
            </div>

            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Question audio regenerates automatically when you save question text changes.
            </p>

            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={handleSaveContent} disabled={savingContent}>
                {savingContent ? 'Saving...' : 'Save Content'}
              </Button>
            </div>
          </EventCard>
        )}

        {activeSection === 'voice' && (
          <EventCard padding="md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Survey Voice</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              The voice that reads this survey's questions aloud in the kiosk.
            </p>

            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Selected voice
                </p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedVoiceLabel}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowVoiceOptions((current) => !current)}
                aria-expanded={showVoiceOptions}
              >
                {showVoiceOptions ? 'Hide voice options' : 'Change voice'}
              </Button>
            </div>

            {showVoiceOptions && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="survey-detail-tts-gender" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Gender
                    </label>
                    <select
                      id="survey-detail-tts-gender"
                      value={ttsGender}
                      onChange={(currentEvent) => handleGenderChange(currentEvent.target.value as TtsVoiceGender)}
                      disabled={savingVoice || previewingVoice}
                      className={inputClass}
                    >
                      {TTS_GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="survey-detail-tts-voice" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Voice
                    </label>
                    <select
                      id="survey-detail-tts-voice"
                      value={ttsVoice}
                      onChange={(currentEvent) => handleVoiceChange(currentEvent.target.value)}
                      disabled={savingVoice || previewingVoice}
                      className={inputClass}
                    >
                      {voiceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handlePreviewVoice}
                    disabled={savingVoice || previewingVoice}
                  >
                    {previewingVoice ? 'Previewing Voice...' : 'Preview Voice'}
                  </Button>
                </div>
              </div>
            )}

            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Audio regenerates automatically when you save voice or question text changes.
            </p>

            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={handleSaveVoice} disabled={savingVoice}>
                {savingVoice ? 'Saving...' : 'Save Voice'}
              </Button>
            </div>
          </EventCard>
        )}

        {activeSection === 'deployment' && (
          <EventCard padding="md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Deployment</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Where attendees reach this survey: its token-based kiosk link and QR code.
            </p>

            <div className="mt-4">
              <SurveyAvailabilityEditor
                value={availability}
                onChange={setAvailability}
                scheduleContext={responseWindowContext}
                disabled={savingAvailability || status.key === 'archived'}
              />
              <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
                <label htmlFor="survey-response-method" className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">Response method</label>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Choose how attendees complete this survey.</p>
                <select
                  id="survey-response-method"
                  value={responseMode}
                  onChange={(currentEvent) => setResponseMode(currentEvent.target.value as EventVoiceSurveyDetail['responseMode'])}
                  disabled={savingAvailability || status.key === 'archived'}
                  className={`${inputClass} mt-3`}
                >
                  <option value="VOICE_ONLY">Voice</option>
                  <option value="TEXT_ONLY">Text</option>
                  <option value="VOICE_AND_TEXT">Let attendee choose</option>
                </select>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {responseMode === 'VOICE_AND_TEXT'
                    ? 'Attendees choose to speak or type once on the consent screen.'
                    : responseMode === 'TEXT_ONLY'
                      ? 'Attendees type answers on screen. No microphone is requested.'
                      : 'Attendees answer using the existing voice flow.'}
                </p>
                <SurveyResponseMethodPreview responseMode={responseMode} />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {automaticSchedulingUnavailable
                    ? 'Saving deployment changes does not publish this survey.'
                    : survey.availability.message}
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={handleSaveAvailability} disabled={savingAvailability || status.key === 'archived'}>
                  {savingAvailability ? 'Saving...' : 'Save deployment'}
                </Button>
              </div>
              {deploymentReadinessIssues.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300" data-testid="survey-readiness-issues">
                  {deploymentReadinessIssues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              )}
            </div>

            {automaticSchedulingUnavailable ? (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100" data-testid="automatic-scheduling-unavailable">
                <p className="font-semibold">Automatic scheduling unavailable</p>
                <p className="mt-1">
                  {status.key === 'draft'
                    ? 'Add a session date and time to schedule this survey automatically. You can still publish it manually now.'
                    : 'Add a session date and time to schedule this survey automatically. This survey remains published for manual use.'}
                </p>
                {status.key === 'draft' && (
                  <Button type="button" className="mt-3" onClick={handlePublish} disabled={lifecycleBusy}>
                    {lifecycleBusy ? 'Publishing...' : 'Publish Survey'}
                  </Button>
                )}
                {hasActivePublicLink && survey.publicLink && (
                  <div className="mt-4 space-y-3 border-t border-amber-300 pt-4 dark:border-amber-900/60">
                    <SurveyQrCard
                      surveyName={survey.name}
                      path={survey.publicLink.kioskPath}
                      fileName={`survey-qr-${survey.id}.png`}
                    />
                    <a
                      href={survey.publicLink.kioskPath}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-900"
                    >
                      Launch Kiosk
                    </a>
                  </div>
                )}
              </div>
            ) : status.key === 'archived' ? (
              <div className="mt-4 rounded-lg border border-dashed border-amber-300 px-3 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:text-amber-300">
                <p className="font-semibold">Archived — launch disabled.</p>
                <p className="mt-1 text-xs">
                  Restore this survey to draft from the Lifecycle section, then publish it to re-enable its kiosk link.
                </p>
              </div>
            ) : isLaunchable && survey.publicLink ? (
              <div className="mt-4 space-y-3">
                <SurveyQrCard
                  surveyName={survey.name}
                  path={survey.publicLink.kioskPath}
                  fileName={`survey-qr-${survey.id}.png`}
                />
                <a
                  href={survey.publicLink.kioskPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-900"
                >
                  Launch Kiosk
                </a>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-amber-300 px-3 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:text-amber-300">
                <p className="font-semibold">
                  {status.key === 'draft'
                    ? 'Draft — not launchable.'
                    : status.key === 'completed'
                      ? 'Completed — collection closed.'
                    : survey.availability.state === 'NOT_YET_OPEN'
                      ? 'Published — not yet open.'
                      : survey.availability.state === 'CLOSED'
                        ? 'Published — collection closed.'
                        : 'Published — schedule needs attention.'}
                </p>
                <p className="mt-1 text-xs">
                  {status.key === 'draft'
                    ? 'Publish this survey to activate its kiosk link and QR code.'
                    : status.key === 'completed'
                      ? 'Completed surveys preserve their response history and cannot collect new responses.'
                    : survey.availability.message}
                </p>
                {survey.publicLink && !survey.publicLink.isActive && (
                  <p className="mt-2 break-all font-mono text-xs text-amber-800 dark:text-amber-200">
                    Disabled link: {survey.publicLink.kioskPath}
                  </p>
                )}
              </div>
            )}
          </EventCard>
        )}

        {activeSection === 'lifecycle' && (
          <div className="space-y-4">
            <EventCard padding="md">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Lifecycle</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Publishing activates the survey's existing public link. Unpublishing returns it to draft and
                disables the link. Archiving disables launch while preserving response history.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {status.key === 'draft' && (
                  <>
                    <Button type="button" onClick={handlePublish} disabled={lifecycleBusy}>
                      {lifecycleBusy ? 'Working...' : 'Publish Survey'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleArchive} disabled={lifecycleBusy}>
                      Archive
                    </Button>
                  </>
                )}
                {status.key === 'live' && (
                  <>
                    <Button type="button" variant="secondary" onClick={handleUnpublish} disabled={lifecycleBusy}>
                      {lifecycleBusy ? 'Working...' : 'Unpublish to Draft'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleArchive} disabled={lifecycleBusy}>
                      Archive
                    </Button>
                  </>
                )}
                {status.key === 'archived' && (
                  <Button type="button" onClick={handleRestore} disabled={lifecycleBusy}>
                    {lifecycleBusy ? 'Working...' : 'Restore to Draft'}
                  </Button>
                )}
                {status.key === 'completed' && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Collection is complete. Response history remains available.</p>
                )}
              </div>
            </EventCard>

            {/* Danger Zone: deletion stays guarded by server-side rules. */}
            <EventCard padding="md" className="border-red-200 dark:border-red-900/50">
              <h2 className="text-base font-bold text-red-700 dark:text-red-300">Danger Zone</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Delete removes this survey and its kiosk token link. Surveys with responses are blocked from
                deletion by the server and should be archived instead.
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleting}
                >
                  Delete Survey
                </Button>
              </div>
            </EventCard>
          </div>
        )}

        <Modal
          isOpen={deleteConfirmOpen}
          onClose={() => {
            if (!deleting) setDeleteConfirmOpen(false)
          }}
          title="Delete survey?"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Delete removes "{survey.name}" from this Event and removes its kiosk token link.
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Archive is different: it disables launch while preserving response history. Surveys with responses are blocked from deletion and should be archived instead.
              </p>
            </div>
            {survey.responseCount > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                This survey has {survey.responseCount} response{survey.responseCount === 1 ? '' : 's'}, so the server will block deletion. Use Archive to retire it and keep history.
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteSurvey}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete survey'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AdminLayout>
  )
}

export default function EventSurveyDetailPage() {
  return (
    <Suspense fallback={
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-zinc-500 dark:text-zinc-400">Loading survey...</p>
          </div>
        </div>
      </AdminLayout>
    }>
      <EventSurveyDetailContent />
    </Suspense>
  )
}
