'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  GripVertical,
  MonitorSmartphone,
  Plus,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { QuestionBuilder, type Question } from '@/components/surveys/QuestionBuilder'
import { Button } from '@/components/ui/Button'
import { isEventsAccount } from '@/lib/account-product-mode'
import { EventCard } from '@/components/app/events'
import { EventRowActionOverflow } from '@/components/events/EventRowActionControl'
import { EventConfirmDialog } from '@/components/events/EventConfirmDialog'
import { SurveyResponseMethodPreview } from '@/components/events/SurveyResponseMethodPreview'
import { OrganizerSurveyPreview } from '@/components/kiosk/OrganizerSurveyPreview'
import { SimpleEventSurveyStartingPoint } from '@/components/events/SimpleEventSurveyStartingPoint'
import { Modal } from '@/components/ui/Modal'
import { buildEventVoiceSurveyCreatePayload } from '@/lib/event-survey-builder-payload'
import { resolveAdvancedSurveyBuilderLifecyclePresentation } from '@/lib/advanced-survey-builder-presentation'
import { applyAdvancedSurveyBuilderSnapshot, buildAdvancedSurveyBuilderSnapshot } from '@/lib/advanced-survey-builder-snapshot'
import { advancedSurveyQuestionValidationIssues, type AdvancedSurveyQuestionValidationIssue } from '@/lib/advanced-survey-question-validation'
import { keepTemporaryAiSuggestions, removeTemporaryAiSuggestion, replaceTemporaryAiSuggestion, updateTemporaryAiSuggestionText, type AdvancedBuilderQuestion, type AdvancedQuestionType } from '@/lib/advanced-temporary-ai-suggestions'
import { changeAdvancedQuestionType } from '@/lib/advanced-survey-question-type'
import {
  advancedSurveyQuestionTypeLabel,
  advancedSurveyQuestionTypeOptions,
  defaultAdvancedSurveyQuestion,
  inferAdvancedSurveyContextFromTargets,
  readAdvancedSpeakerFeedbackMode,
  readAdvancedSurveyContext,
  type AdvancedSpeakerFeedbackMode,
  type AdvancedSurveyContext,
} from '@/lib/advanced-survey-default-question'
import {
  defaultNewEventSurveyExperience,
  presentationModeForResponseMode,
} from '@/lib/advanced-survey-experience'
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
  TTS_LOCALE_LABELS,
  TTS_VOICE_PROFILE_OPTIONS,
  deriveGenderFromVoice,
  deriveLocaleFromVoice,
  getCuratedVoiceOption,
  getCuratedVoiceOptionsForLocale,
  getCuratedVoiceOptionsForGender,
  getPreferredVoiceForGender,
  getVoiceSelectOptions,
  normalizeCuratedTtsVoice,
  type TtsVoiceGender,
} from '@/lib/tts-voices'

type EventStructureItemKind = 'EVENT' | 'SESSION' | 'AREA' | 'SPONSOR_ACTIVATION' | 'CUSTOM_TOUCHPOINT'
type CollectionPhase = 'PRE' | 'DURING' | 'POST'

const COLLECTION_PHASE_OPTIONS: Array<{ value: CollectionPhase; label: string; description: string }> = [
  { value: 'PRE', label: 'Before event', description: 'Planning, expectations, and readiness.' },
  { value: 'DURING', label: 'During event', description: 'Live attendee experience and operations.' },
  { value: 'POST', label: 'After event', description: 'Outcomes, reflection, and follow-up.' },
]

function responseErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback
  const response = body as { error?: unknown; message?: unknown }
  if (typeof response.message === 'string' && response.message.trim()) return response.message
  if (typeof response.error === 'string' && response.error.trim()) return response.error
  return fallback
}

interface EventSummary {
  id: string
  name: string
  eventType: string
  ttsVoice?: string | null
  startDate: string | null
  endDate: string | null
  location?: { timezone?: string | null } | null
}

interface EventStructureItem {
  id: string
  kind: EventStructureItemKind
  name: string
  startsAt: string | null
  endsAt: string | null
  timezone: string | null
}

interface SpeakerTargetSummary {
  id: string
  name: string
}

const STRUCTURE_KIND_OPTIONS: Array<{ value: EventStructureItemKind; label: string; groupLabel: string }> = [
  { value: 'EVENT', label: 'Event-wide', groupLabel: 'Event-wide' },
  { value: 'SESSION', label: 'Session', groupLabel: 'Sessions' },
  { value: 'AREA', label: 'Location', groupLabel: 'Locations' },
  { value: 'SPONSOR_ACTIVATION', label: 'Sponsor Activation', groupLabel: 'Sponsor Activations' },
  { value: 'CUSTOM_TOUCHPOINT', label: 'Custom Touchpoint', groupLabel: 'Custom Touchpoints' },
]

const STEPS = [
  { number: 1, label: 'Survey' },
  { number: 2, label: 'Voice & Review' },
] as const

type StepNumber = (typeof STEPS)[number]['number']

const ADVANCED_BUILDER_TABS = [
  { id: 'QUESTIONS', label: 'Questions' },
  { id: 'EXPERIENCE', label: 'Experience' },
  { id: 'AVAILABILITY', label: 'Availability' },
  { id: 'REVIEW', label: 'Review' },
] as const

type AdvancedBuilderTab = (typeof ADVANCED_BUILDER_TABS)[number]['id']

function formatStructureKind(kind: EventStructureItemKind) {
  return STRUCTURE_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind
}

const inputClass =
  'event-type-input w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

function AdvancedEventSurveyBuilder({
  accountSlug,
  event,
  surveysPath,
  structureItems,
  initialSurveyId,
  isSimpleEvent = false,
  simpleCreationFlow = false,
  simpleStartingPointPath,
}: {
  accountSlug: string
  event: EventSummary
  surveysPath: string
  structureItems: EventStructureItem[]
  initialSurveyId?: string | null
  isSimpleEvent?: boolean
  simpleCreationFlow?: boolean
  simpleStartingPointPath?: string
}) {
  const router = useRouter()
  const backPath = isSimpleEvent && simpleCreationFlow && simpleStartingPointPath ? simpleStartingPointPath : surveysPath
  const backLabel = isSimpleEvent && simpleCreationFlow ? 'Survey starting points' : 'Surveys'
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [surveyStatus, setSurveyStatus] = useState<string>('DRAFT')
  const [surveyName, setSurveyName] = useState('')
  const [collectionPhase, setCollectionPhase] = useState<CollectionPhase | null>(null)
  const [activeTab, setActiveTab] = useState<AdvancedBuilderTab>('QUESTIONS')
  const [questions, setQuestions] = useState<AdvancedBuilderQuestion[]>([])
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)
  const [typeChooserOpen, setTypeChooserOpen] = useState(false)
  const [typeSearch, setTypeSearch] = useState('')
  const [activeTypeIndex, setActiveTypeIndex] = useState(0)
  const [deletedQuestion, setDeletedQuestion] = useState<{ question: AdvancedBuilderQuestion; index: number } | null>(null)
  const [hasSessionContext, setHasSessionContext] = useState(false)
  const [surveyContext, setSurveyContext] = useState<AdvancedSurveyContext>(isSimpleEvent ? 'EVENT' : 'NOT_SURE')
  const [sessionSpeakers, setSessionSpeakers] = useState<Array<{ id: string; name: string; title?: string | null; organization?: string | null }>>([])
  const [speakerFeedbackMode, setSpeakerFeedbackMode] = useState<AdvancedSpeakerFeedbackMode>('EACH_SPEAKER')
  const [openResponseMethod, setOpenResponseMethod] = useState<'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'>(defaultNewEventSurveyExperience.responseMode)
  const [questionVoice, setQuestionVoice] = useState(() => normalizeCuratedTtsVoice(event.ttsVoice))
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [questionVoicePreviewError, setQuestionVoicePreviewError] = useState<string | null>(null)
  const [fullSurveyPreviewOpen, setFullSurveyPreviewOpen] = useState(false)
  const [previewStartDetails, setPreviewStartDetails] = useState<{
    branding: { logoUrl: string | null; primaryColor: string | null; primaryButtonColor: string | null } | null
    consent: { title: string; subtitle: string; items: string[]; buttonText: string; bulletStyle?: string | null } | null
  } | null>(null)
  const [availability, setAvailability] = useState<SurveyAvailabilityFormValue>(() => defaultSurveyAvailability(event.location?.timezone))
  const [assignedSession, setAssignedSession] = useState<{ id: string; name: string; startsAt: string | null; endsAt: string | null; timezone: string | null } | null>(null)
  const [assignmentPanelOpen, setAssignmentPanelOpen] = useState(false)
  const [assignmentKind, setAssignmentKind] = useState<'EVENT' | 'SESSION' | 'SPEAKER' | 'LOCATION' | 'CUSTOM'>('SESSION')
  const [assignmentSelection, setAssignmentSelection] = useState<'ALL' | 'SELECTED'>('SELECTED')
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([])
  const [customAssignmentName, setCustomAssignmentName] = useState('')
  const [assignmentSpecs, setAssignmentSpecs] = useState<Array<{ kind: 'EVENT' | 'SESSION' | 'SPEAKER' | 'LOCATION' | 'CUSTOM'; selection: 'ALL' | 'SELECTED'; targetIds?: string[]; customKey?: string; customName?: string }>>([])
  const [assignmentTargets, setAssignmentTargets] = useState<Array<{ id: string; category: string; name: string; eventStructureItemId?: string | null; speakerId?: string | null; metadata?: unknown }>>([])
  const [agendaSpeakers, setAgendaSpeakers] = useState<Array<{ id: string; name: string; title: string | null; organization: string | null }>>([])
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [assignmentWarning, setAssignmentWarning] = useState<string | null>(null)
  const [responseCount, setResponseCount] = useState(0)
  const [pendingResponseHistoryAssignment, setPendingResponseHistoryAssignment] = useState<Array<{ kind: 'EVENT' | 'SESSION' | 'SPEAKER' | 'LOCATION' | 'CUSTOM'; selection: 'ALL' | 'SELECTED'; targetIds?: string[]; customKey?: string; customName?: string }> | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiGoal, setAiGoal] = useState('feedback')
  const [aiTone, setAiTone] = useState<'friendly' | 'direct' | 'premium'>('friendly')
  const [aiCount, setAiCount] = useState(5)
  const [aiLoading, setAiLoading] = useState(false)
  const [regeneratingSuggestionIds, setRegeneratingSuggestionIds] = useState<string[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<AdvancedBuilderQuestion[]>([])
  // This only enables Escape for the active field; aiSuggestions remains the value kept by the drawer.
  const [editingAiSuggestion, setEditingAiSuggestion] = useState<{ id: string; previousText: string } | null>(null)
  const [serverAiContextChips, setServerAiContextChips] = useState<Array<{ key: string; label: string }>>([])
  const [excludedAiContextKeys, setExcludedAiContextKeys] = useState<string[]>([])
  const [rewriteQuestionId, setRewriteQuestionId] = useState<string | null>(null)
  const [rewriteInstruction, setRewriteInstruction] = useState('')
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteProposal, setRewriteProposal] = useState<{ original: string; text: string; summary: string } | null>(null)
  const [persistedReviewIssues, setPersistedReviewIssues] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [existingSurveyLoad, setExistingSurveyLoad] = useState<{
    surveyId: string | null
    status: 'loading' | 'ready' | 'error'
    error: string | null
  }>(() => initialSurveyId
    ? { surveyId: initialSurveyId, status: 'loading', error: null }
    : { surveyId: null, status: 'ready', error: null })
  const creationRequestIdRef = useRef<string | null>(null)
  const draftIdRef = useRef<string | null>(null)
  const editedRef = useRef(false)
  const saveSequenceRef = useRef(0)
  const appliedSurveySnapshotFingerprintRef = useRef<string | null>(null)
  const typeSearchRef = useRef<HTMLInputElement | null>(null)
  const draggedQuestionIndexRef = useRef<number | null>(null)
  const questionVoicePreviewRef = useRef<HTMLAudioElement | null>(null)
  const previewVoiceRequestIdRef = useRef(0)

  useEffect(() => {
    if (!initialSurveyId) {
      setExistingSurveyLoad({ surveyId: null, status: 'ready', error: null })
      return
    }
    let cancelled = false
    editedRef.current = false
    setExistingSurveyLoad({ surveyId: initialSurveyId, status: 'loading', error: null })
    fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}&survey=${encodeURIComponent(initialSurveyId)}`, {
      credentials: 'include', cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body?.success || !body.data?.survey) throw new Error(body?.error || 'Survey could not be loaded')
        if (cancelled) return
        const survey = body.data.survey
        editedRef.current = false
        creationRequestIdRef.current = survey.creationRequestId || crypto.randomUUID()
        setSurveyName(survey.name ?? '')
        setCollectionPhase(survey.collectionPhase ?? null)
        setOpenResponseMethod(survey.responseMode ?? defaultNewEventSurveyExperience.responseMode)
        // Keep persisted legacy values untouched until the user saves, while
        // ensuring this editor and its preview only use curated voices.
        setQuestionVoice(normalizeCuratedTtsVoice(survey.ttsVoice || event.ttsVoice))
        const persistedTargets = (survey.publicSurveyLinks ?? [])
          .map((link: any) => link.surveyTarget)
          .filter(Boolean)
        if (survey.surveyTarget) persistedTargets.push(survey.surveyTarget)
        setSurveyContext(readAdvancedSurveyContext(
          survey.settingsJson,
          isSimpleEvent ? 'EVENT' : inferAdvancedSurveyContextFromTargets(persistedTargets),
        ))
        setSpeakerFeedbackMode(readAdvancedSpeakerFeedbackMode(survey.settingsJson))
        setAvailability({
          mode: survey.availabilityMode ?? 'OPEN_IMMEDIATELY',
          timezone: survey.availabilityTimezone ?? event.location?.timezone ?? null,
          opensAt: survey.availabilityOpensAt ?? null,
          closesAt: survey.availabilityClosesAt ?? null,
          openAnchor: survey.availabilityOpenAnchor ?? null,
          closeAnchor: survey.availabilityCloseAnchor ?? null,
          openOffsetMinutes: survey.availabilityOpenOffsetMinutes ?? null,
          closeOffsetMinutes: survey.availabilityCloseOffsetMinutes ?? null,
          override: survey.availabilityOverride ?? null,
        })
        setQuestions((survey.questions ?? []).map((question: any) => ({
          id: question.id,
          text: question.label,
          type: question.type,
          required: question.required,
          options: Array.isArray(question.configurationJson?.options) ? question.configurationJson.options : [],
        })))
        applySurveySnapshot(survey)
        setSaveError(null)
        setSaveState('saved')
        setExistingSurveyLoad({ surveyId: initialSurveyId, status: 'ready', error: null })
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Survey could not be loaded'
        setSaveError(message)
        setSaveState('error')
        setExistingSurveyLoad({ surveyId: initialSurveyId, status: 'error', error: message })
      })
    return () => { cancelled = true }
  }, [accountSlug, event.id, event.location?.timezone, initialSurveyId])

  useEffect(() => () => {
    previewVoiceRequestIdRef.current += 1
    questionVoicePreviewRef.current?.pause()
    questionVoicePreviewRef.current = null
  }, [])

  const applySurveySnapshot = (survey: any) => {
    const snapshot = buildAdvancedSurveyBuilderSnapshot(survey)
    if (!snapshot) return
    draftIdRef.current = snapshot.surveyId
    const result = applyAdvancedSurveyBuilderSnapshot(appliedSurveySnapshotFingerprintRef.current, snapshot, (next) => {
      setSurveyId(next.surveyId)
      setSurveyStatus(next.surveyStatus)
      setResponseCount(next.responseCount)
      setPersistedReviewIssues(next.reviewIssues)
      setAssignmentTargets(next.assignmentTargets)
      setAssignmentSpecs(next.assignmentSpecs)
      setHasSessionContext(next.hasSessionContext)
      setAssignedSession(next.assignedSession)
      setSessionSpeakers(next.sessionSpeakers)
    })
    appliedSurveySnapshotFingerprintRef.current = result.fingerprint
  }

  useEffect(() => {
    if (!editedRef.current || !accountSlug || !collectionPhase) return
    const sequence = ++saveSequenceRef.current
    setSaveState('saving')
    const timeout = window.setTimeout(async () => {
      const creationRequestId = creationRequestIdRef.current ?? crypto.randomUUID()
      creationRequestIdRef.current = creationRequestId
      try {
        const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ surveyId: draftIdRef.current, creationRequestId, name: surveyName, collectionPhase, questions, responseMode: openResponseMethod, surveyContext, speakerFeedbackMode, ttsVoice: questionVoice, availability }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body?.success || !body.data?.survey?.id) throw new Error(responseErrorMessage(body, 'Draft could not be saved'))
        if (sequence !== saveSequenceRef.current) return
        editedRef.current = false
        applySurveySnapshot(body.data.survey)
        setSaveError(null)
        setSaveState('saved')
      } catch (error) {
        if (sequence !== saveSequenceRef.current) return
        setSaveError(error instanceof Error ? error.message : 'Draft could not be saved')
        setSaveState('error')
      }
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [accountSlug, availability, collectionPhase, event.id, openResponseMethod, questionVoice, questions, speakerFeedbackMode, surveyContext, surveyName])

  useEffect(() => {
    if ((!assignmentPanelOpen && surveyContext !== 'SESSIONS' && surveyContext !== 'SPEAKERS') || agendaSpeakers.length > 0) return
    fetch(`/api/app/events/${event.id}/agenda?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include', cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (body?.success) setAgendaSpeakers(body.data?.speakers ?? []) })
      .catch(() => undefined)
  }, [accountSlug, agendaSpeakers.length, assignmentPanelOpen, event.id, surveyContext])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/kiosk/event-details?eventId=${encodeURIComponent(event.id)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && body?.success && body?.event) setPreviewStartDetails({ branding: body.event.branding ?? null, consent: body.event.consent ?? null })
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [event.id])

  const markEdited = () => { editedRef.current = true }
  const advancedFieldClass = `${inputClass} rounded-xl px-4 py-3`
  const questionsLocked = responseCount > 0
  const questionVoiceProfile = deriveGenderFromVoice(questionVoice)
  const questionVoiceToneOptions = getCuratedVoiceOptionsForGender(questionVoiceProfile)
  const selectedQuestionVoiceOption = getCuratedVoiceOption(questionVoice)
  const selectedQuestionVoiceToneLabel = selectedQuestionVoiceOption?.label ?? 'Friendly & Welcoming'
  const questionVoiceLocale = deriveLocaleFromVoice(questionVoice, DEFAULT_TTS_LOCALE_LITERAL)
  const presentationMode = presentationModeForResponseMode(openResponseMethod)
  const previewAssignmentTarget = assignedSession
    ? { category: 'SESSION', name: assignedSession.name }
    : assignmentTargets.find((target) => target.category === 'SPEAKER' || target.category === 'LOCATION' || target.category === 'EVENT') ?? null
  const previewContextLabel = previewAssignmentTarget?.category === 'SESSION'
    ? `Session · ${previewAssignmentTarget.name}`
    : previewAssignmentTarget?.category === 'SPEAKER'
      ? `Feedback for ${previewAssignmentTarget.name}`
      : previewAssignmentTarget?.category === 'LOCATION'
        ? `Event Area · ${previewAssignmentTarget.name}`
        : previewAssignmentTarget?.category === 'EVENT'
          ? 'Overall event feedback'
          : null
  const previewSpeakerName = previewAssignmentTarget?.category === 'SPEAKER' ? previewAssignmentTarget.name : null

  const openFullSurveyPreview = () => {
    setFullSurveyPreviewOpen(true)
    void fetch(`/api/kiosk/event-details?eventId=${encodeURIComponent(event.id)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (body?.success && body?.event) setPreviewStartDetails({ branding: body.event.branding ?? null, consent: body.event.consent ?? null })
      })
      .catch(() => undefined)
  }

  const handleQuestionVoiceProfileChange = (nextProfile: TtsVoiceGender) => {
    markEdited()
    setQuestionVoice(getPreferredVoiceForGender(nextProfile))
  }

  const handleQuestionVoiceLocaleChange = (nextLocale: string) => {
    const matchingVoice = getCuratedVoiceOptionsForLocale(nextLocale)
      .find((option) => option.gender === questionVoiceProfile)
    if (!matchingVoice) return
    markEdited()
    setQuestionVoice(matchingVoice.value)
  }

  const handleQuestionVoiceToneChange = (nextVoice: string) => {
    markEdited()
    setQuestionVoice(normalizeCuratedTtsVoice(nextVoice))
  }

  const handlePreviewQuestionVoice = async (voice = questionVoice) => {
    if (!accountSlug) return
    const requestId = ++previewVoiceRequestIdRef.current
    setPreviewingVoiceId(voice)
    setQuestionVoicePreviewError(null)
    questionVoicePreviewRef.current?.pause()
    questionVoicePreviewRef.current = null
    try {
      const response = await fetch(`/api/app/question-audio/preview?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: DEFAULT_TTS_PROVIDER,
          voice,
          locale: deriveLocaleFromVoice(voice, DEFAULT_TTS_LOCALE_LITERAL),
          text: QUESTION_AUDIO_PREVIEW_TEXT,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success || !body.audioBase64 || !body.mimeType) {
        throw new Error(body?.error || 'Voice preview could not be generated')
      }
      if (requestId !== previewVoiceRequestIdRef.current) return
      const audio = new Audio(`data:${body.mimeType};base64,${body.audioBase64}`)
      questionVoicePreviewRef.current = audio
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve()
        audio.onerror = () => reject(new Error('Voice preview could not be played'))
        void audio.play().catch(reject)
      })
    } catch (error) {
      if (requestId === previewVoiceRequestIdRef.current) {
        setQuestionVoicePreviewError(error instanceof Error ? error.message : 'Voice preview could not be played')
      }
    } finally {
      if (requestId === previewVoiceRequestIdRef.current) {
        questionVoicePreviewRef.current = null
        setPreviewingVoiceId((current) => current === voice ? null : current)
      }
    }
  }
  const questionTypeOptions = advancedSurveyQuestionTypeOptions(surveyContext)
  const sessionSpeakerFeedbackAvailable = surveyContext === 'SESSIONS'
  const speakerAwareContext = surveyContext === 'SESSIONS' || surveyContext === 'SPEAKERS'
  const assignedSpeakerCount = assignmentTargets.filter((target) => target.category === 'SPEAKER').length
  const resolvedSpeakerCount = assignedSession
    ? sessionSpeakers.length
    : assignedSpeakerCount > 0
      ? assignedSpeakerCount
      : agendaSpeakers.length
  const showSpeakerFeedbackMode = speakerAwareContext && resolvedSpeakerCount > 1
  const visibleQuestionTypes = questionTypeOptions.filter((option) =>
    `${option.label} ${option.hint}`.toLowerCase().includes(typeSearch.trim().toLowerCase()),
  )

  const updateQuestions = (next: AdvancedBuilderQuestion[]) => {
    if (questionsLocked) return
    markEdited()
    setQuestions(next)
  }

  const openTypeChooser = () => {
    if (questionsLocked) return
    setTypeChooserOpen(true)
    setTypeSearch('')
    setActiveTypeIndex(0)
    window.setTimeout(() => typeSearchRef.current?.focus(), 0)
  }

  const addQuestion = (type: AdvancedQuestionType) => {
    if (questionsLocked) return
    const id = crypto.randomUUID()
    const question: AdvancedBuilderQuestion = {
      id,
      text: defaultAdvancedSurveyQuestion({ context: surveyContext, type, eventName: event.name }),
      type,
      required: type !== 'SPEAKER_FEEDBACK',
      ...(type === 'SINGLE_CHOICE' ? { options: ['Option one', 'Option two'] } : {}),
    }
    updateQuestions([...questions, question])
    setTypeChooserOpen(false)
    setExpandedQuestionId(id)
    window.setTimeout(() => document.getElementById(`advanced-question-${id}`)?.focus(), 0)
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    if (questionsLocked) return
    const destination = index + direction
    if (destination < 0 || destination >= questions.length) return
    const next = [...questions]
    const [question] = next.splice(index, 1)
    next.splice(destination, 0, question)
    updateQuestions(next)
  }

  const deleteQuestion = (index: number) => {
    if (questionsLocked) return
    const question = questions[index]
    if (!question) return
    setDeletedQuestion({ question, index })
    setExpandedQuestionId((current) => current === question.id ? null : current)
    updateQuestions(questions.filter((_, questionIndex) => questionIndex !== index))
  }

  const undoDelete = () => {
    if (questionsLocked) return
    if (!deletedQuestion) return
    const next = [...questions]
    next.splice(Math.min(deletedQuestion.index, next.length), 0, deletedQuestion.question)
    updateQuestions(next)
    setDeletedQuestion(null)
  }

  const assignmentOptions = assignmentKind === 'SESSION'
    ? structureItems.filter((item) => item.kind === 'SESSION').map((item) => ({ id: item.id, name: item.name, detail: item.startsAt ? new Date(item.startsAt).toLocaleString() : 'Time not set' }))
    : assignmentKind === 'LOCATION'
      ? structureItems.filter((item) => item.kind === 'AREA' || item.kind === 'SPONSOR_ACTIVATION').map((item) => ({ id: item.id, name: item.name, detail: formatStructureKind(item.kind) }))
      : assignmentKind === 'SPEAKER'
        ? agendaSpeakers.map((speaker) => ({ id: speaker.id, name: speaker.name, detail: [speaker.title, speaker.organization].filter(Boolean).join(' · ') }))
        : []

  const ensureAdvancedDraft = async () => {
    if (draftIdRef.current) return draftIdRef.current
    if (!collectionPhase) throw new Error('Choose when this survey will be collected')
    const creationRequestId = creationRequestIdRef.current ?? crypto.randomUUID()
    creationRequestIdRef.current = creationRequestId
    const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creationRequestId, name: surveyName, collectionPhase, questions, responseMode: openResponseMethod, surveyContext, speakerFeedbackMode, ttsVoice: questionVoice, availability }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body?.success || !body.data?.survey?.id) throw new Error(responseErrorMessage(body, 'Draft could not be saved'))
    editedRef.current = false
    applySurveySnapshot(body.data.survey)
    return body.data.survey.id as string
  }

  const saveAdvancedDraftNow = async () => {
    if (!collectionPhase) throw new Error('Choose when this survey will be collected')
    const creationRequestId = creationRequestIdRef.current ?? crypto.randomUUID()
    creationRequestIdRef.current = creationRequestId
    const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surveyId: draftIdRef.current, creationRequestId, name: surveyName, collectionPhase, questions, responseMode: openResponseMethod, surveyContext, speakerFeedbackMode, ttsVoice: questionVoice, availability }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body?.success || !body.data?.survey?.id) throw new Error(body?.error || 'Draft could not be saved')
    applySurveySnapshot(body.data.survey)
    setSaveState('saved')
    return body.data.survey.id as string
  }

  const persistAssignmentSpecs = async (nextSpecs: typeof assignmentSpecs) => {
    setAssignmentSaving(true)
    setSaveError(null)
    try {
      const draftId = await ensureAdvancedDraft()
      const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: draftId, assignments: nextSpecs }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Assignments could not be saved')
      setAssignmentSpecs(nextSpecs)
      applySurveySnapshot(body.data.survey)
      setAssignmentWarning(body.data.assignmentWarnings?.map((warning: { message?: string }) => warning.message).filter(Boolean).join(' ') || null)
      setSaveState('saved')
      return true
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Assignments could not be saved')
      setSaveState('error')
      return false
    } finally {
      setAssignmentSaving(false)
    }
  }

  const saveAssignmentSpecs = async (nextSpecs: typeof assignmentSpecs) => {
    if (!await persistAssignmentSpecs(nextSpecs)) return
    setSelectedAssignmentIds([])
    setCustomAssignmentName('')
    setAssignmentPanelOpen(false)
  }

  const saveCurrentAssignment = async () => {
    const spec = assignmentKind === 'EVENT'
      ? { kind: 'EVENT' as const, selection: 'SELECTED' as const }
      : assignmentKind === 'CUSTOM'
        ? { kind: 'CUSTOM' as const, selection: 'SELECTED' as const, customKey: crypto.randomUUID(), customName: customAssignmentName.trim() }
        : { kind: assignmentKind, selection: assignmentSelection, ...(assignmentSelection === 'SELECTED' ? { targetIds: selectedAssignmentIds } : {}) }
    if (assignmentKind === 'CUSTOM' && !customAssignmentName.trim()) { setSaveError('Enter a custom assignment name'); return }
    if (!['EVENT', 'CUSTOM'].includes(assignmentKind) && assignmentSelection === 'SELECTED' && selectedAssignmentIds.length === 0) { setSaveError(`Select at least one ${assignmentKind.toLowerCase()}`); return }
    const nextSpecs = [...assignmentSpecs.filter((existing) => existing.kind !== assignmentKind), spec]
    if (responseCount > 0) {
      setPendingResponseHistoryAssignment(nextSpecs)
      return
    }
    await saveAssignmentSpecs(nextSpecs)
  }

  const removeAssignmentTarget = async (target: typeof assignmentTargets[number]) => {
    const kind = target.category === 'EVENT' ? 'EVENT' : target.category === 'SESSION' ? 'SESSION' : target.category === 'SPEAKER' ? 'SPEAKER' : target.category === 'LOCATION' ? 'LOCATION' : 'CUSTOM'
    const spec = assignmentSpecs.find((candidate) => candidate.kind === kind)
    if (!spec || spec.selection === 'ALL' || kind === 'EVENT' || kind === 'CUSTOM') {
      const nextSpecs = assignmentSpecs.filter((candidate) => candidate.kind !== kind)
      if (responseCount > 0) setPendingResponseHistoryAssignment(nextSpecs)
      else await persistAssignmentSpecs(nextSpecs)
      return
    }
    const removeId = kind === 'SPEAKER' ? target.speakerId : target.eventStructureItemId
    const remaining = (spec.targetIds ?? []).filter((id) => id !== removeId)
    const nextSpecs = remaining.length > 0
      ? assignmentSpecs.map((candidate) => candidate.kind === kind ? { ...candidate, targetIds: remaining } : candidate)
      : assignmentSpecs.filter((candidate) => candidate.kind !== kind)
    if (responseCount > 0) setPendingResponseHistoryAssignment(nextSpecs)
    else await persistAssignmentSpecs(nextSpecs)
  }

  const localAiContextChips = [
    { key: `event:${event.id}`, label: `Event: ${event.name}` },
    ...assignmentTargets.map((target) => ({ key: `target:${target.id}`, label: `${target.category === 'SESSION' ? 'Session' : target.category === 'SPEAKER' ? 'Speaker' : 'Assignment'}: ${target.name}` })),
    ...sessionSpeakers.map((speaker) => ({ key: `speaker:${speaker.id}`, label: `Speaker: ${speaker.name}` })),
  ].filter((chip, index, all) => all.findIndex((candidate) => candidate.key === chip.key) === index)
  const activeAiContextChips = (serverAiContextChips.length > 0 ? serverAiContextChips : localAiContextChips)
    .filter((chip) => !excludedAiContextKeys.includes(chip.key))

  const generateWithAi = async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const draftId = await saveAdvancedDraftNow()
      const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GENERATE_AI', surveyId: draftId, goal: aiGoal, tone: aiTone, count: aiCount, excludedContextKeys: excludedAiContextKeys }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Questions could not be generated')
      setAiSuggestions((body.data?.questions ?? []).map((question: AdvancedBuilderQuestion) => ({ ...question, id: crypto.randomUUID() })))
      setServerAiContextChips(body.data?.contextChips ?? [])
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Questions could not be generated')
    } finally {
      setAiLoading(false)
    }
  }

  const regenerateAiSuggestion = async (suggestion: AdvancedBuilderQuestion) => {
    if (aiLoading || regeneratingSuggestionIds.includes(suggestion.id)) return
    setRegeneratingSuggestionIds((current) => [...new Set([...current, suggestion.id])])
    setAiError(null)
    try {
      const draftId = await saveAdvancedDraftNow()
      const avoidQuestions = [...questions, ...aiSuggestions].map((question) => question.text).filter(Boolean)
      const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REGENERATE_AI_SUGGESTION', surveyId: draftId, goal: aiGoal, tone: aiTone, excludedContextKeys: excludedAiContextKeys, avoidQuestions }),
      })
      const body = await response.json().catch(() => ({}))
      const replacement = body.data?.questions?.[0] as AdvancedBuilderQuestion | undefined
      if (!response.ok || !body?.success || !replacement) throw new Error(body?.error || 'Suggestion could not be regenerated')
      setAiSuggestions((current) => replaceTemporaryAiSuggestion(current, suggestion.id, replacement))
      setEditingAiSuggestion((current) => current?.id === suggestion.id ? null : current)
      setServerAiContextChips(body.data?.contextChips ?? [])
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Suggestion could not be regenerated')
    } finally {
      setRegeneratingSuggestionIds((current) => current.filter((id) => id !== suggestion.id))
    }
  }

  const keepAiSuggestions = () => {
    try {
      // Invoke on Crypto so browser implementations that require the receiver
      // can create canonical builder ids before we mark the draft edited.
      const keptQuestions = keepTemporaryAiSuggestions(aiSuggestions, () => crypto.randomUUID())
      updateQuestions([...questions, ...keptQuestions])
      setAiSuggestions([])
      setEditingAiSuggestion(null)
      setAiPanelOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Questions could not be kept'
      setAiError(message)
      setSaveError(message)
      setSaveState('error')
    }
  }

  const requestQuestionRewrite = async (question: AdvancedBuilderQuestion) => {
    setRewriteLoading(true)
    setRewriteProposal(null)
    setAiError(null)
    try {
      const draftId = await saveAdvancedDraftNow()
      const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REWRITE_AI', surveyId: draftId, text: question.text, instruction: rewriteInstruction, excludedContextKeys: excludedAiContextKeys }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Question could not be rewritten')
      setRewriteProposal(body.data)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Question could not be rewritten')
    } finally {
      setRewriteLoading(false)
    }
  }

  const questionReviewIssues = questions.map((question, index) => ({
    questionId: question.id,
    issues: advancedSurveyQuestionValidationIssues(question, index),
  }))
  const questionReviewIssueByMessage = new Map(questionReviewIssues.flatMap(({ questionId, issues }) => (
    issues.map((issue) => [issue.message, { ...issue, questionId }] as const)
  )))
  const localReviewIssues = [
    ...(!collectionPhase ? ['Choose when this survey will be collected.'] : []),
    ...(!surveyName.trim() ? ['Add a survey name.'] : []),
    ...(questions.length === 0 ? ['Add at least one question.'] : []),
    ...questionReviewIssues.flatMap(({ issues }) => issues.map((issue) => issue.message)),
    ...(availability.mode === 'RELATIVE_TO_EVENT_AREA' && !assignedSession ? ['Assign a specific session for session-relative availability.'] : []),
    ...(availability.mode === 'RELATIVE_TO_EVENT_AREA' && assignedSession && (!assignedSession.startsAt || !assignedSession.endsAt) ? ['Add start and end times to the assigned session.'] : []),
    ...(availability.mode === 'CUSTOM_WINDOW' && (!availability.opensAt || !availability.closesAt) ? ['Choose both dates and times for the fixed availability window.'] : []),
    ...(availability.mode === 'CUSTOM_WINDOW' && availability.opensAt && availability.closesAt && new Date(availability.opensAt) >= new Date(availability.closesAt) ? ['Set the fixed window end after its start.'] : []),
  ]
  const reviewIssues = !editedRef.current && saveState === 'saved'
    ? persistedReviewIssues
    : [...new Set(localReviewIssues)]
  const publishReadinessPending = editedRef.current || saveState !== 'saved'
  const lifecyclePresentation = resolveAdvancedSurveyBuilderLifecyclePresentation(surveyStatus)
  const existingSurveyIsLoading = Boolean(initialSurveyId && (
    existingSurveyLoad.surveyId !== initialSurveyId || existingSurveyLoad.status === 'loading'
  ))
  const existingSurveyLoadFailed = Boolean(initialSurveyId
    && existingSurveyLoad.surveyId === initialSurveyId
    && existingSurveyLoad.status === 'error')

  const focusQuestionReviewIssue = (issue: AdvancedSurveyQuestionValidationIssue & { questionId: string }) => {
    setExpandedQuestionId(issue.questionId)
    const question = questions.find((candidate) => candidate.id === issue.questionId)
    const targetId = issue.field === 'text'
      ? `advanced-question-${issue.questionId}`
      : question?.options?.length
        ? `advanced-question-${issue.questionId}-choice-0`
        : `advanced-question-${issue.questionId}-add-choice`
    window.setTimeout(() => document.getElementById(targetId)?.focus(), 0)
  }

  const publishSurvey = async () => {
    setPublishing(true)
    setPublishError(null)
    try {
      const draftId = await saveAdvancedDraftNow()
      const response = await fetch(`/api/app/events/${event.id}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PUBLISH', surveyId: draftId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Survey could not be published')
      applySurveySnapshot(body.data.survey)
      router.push(surveysPath)
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Survey could not be published')
    } finally {
      setPublishing(false)
    }
  }

  const saveAndFinish = async () => {
    try {
      setSaveState('saving')
      await saveAdvancedDraftNow()
      router.push(surveysPath)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Draft could not be saved')
      setSaveState('error')
    }
  }

  if (existingSurveyIsLoading) {
    return (
      <main className="mx-auto max-w-[1240px] pb-20" data-testid="advanced-survey-loading" aria-busy="true">
        <div className="space-y-4" aria-label="Loading existing survey">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-zinc-800" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-zinc-900" />
              <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-zinc-900" />
            </div>
            <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-zinc-900" />
          </div>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Loading existing survey…</p>
        </div>
      </main>
    )
  }

  if (existingSurveyLoadFailed) {
    return (
      <main className="mx-auto max-w-[1240px] pb-20" data-testid="advanced-survey-load-error">
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          <h1 className="text-lg font-bold">Survey could not be loaded</h1>
          <p className="mt-2 text-sm">{existingSurveyLoad.error}</p>
          <a href={backPath} className="mt-4 inline-flex rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/40">Back to {backLabel}</a>
        </div>
      </main>
    )
  }

  return (
    <main className="event-workspace-type mx-auto max-w-[1240px] pb-20" data-testid="advanced-event-survey-builder" data-survey-id={surveyId ?? undefined}>
      {lifecyclePresentation.isDraft && !questionsLocked && aiPanelOpen && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Generate survey with AI">
        <div className="h-full w-full max-w-xl overflow-y-auto border-l border-violet-200 bg-white p-6 shadow-2xl dark:border-violet-900 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-4"><div><span className="event-type-pill inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-violet-700 dark:bg-violet-950 dark:text-violet-200"><Sparkles className="h-3.5 w-3.5" /> AI assist</span><h2 className="event-type-section-title mt-3 text-slate-950 dark:text-white">Generate survey questions</h2><p className="event-type-summary mt-1 text-slate-500">Suggestions stay temporary until you keep them. Existing questions are never replaced.</p></div><button type="button" onClick={() => { setAiPanelOpen(false); setAiSuggestions([]) }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close AI generation"><X className="h-5 w-5" /></button></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Goal<select value={aiGoal} onChange={(event) => setAiGoal(event.target.value)} className={`${inputClass} mt-2 text-sm`}><option value="feedback">Live feedback</option><option value="session_quality">Session quality</option><option value="event_operations">Event operations</option><option value="attendee_satisfaction">Attendee satisfaction</option></select></label>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Questions<select value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))} className={`${inputClass} mt-2 text-sm`}>{[3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">Tone<select value={aiTone} onChange={(event) => setAiTone(event.target.value as typeof aiTone)} className={`${inputClass} mt-2 text-sm`}><option value="friendly">Friendly</option><option value="direct">Direct</option><option value="premium">Premium</option></select></label>
          </div>
          <div className="mt-5"><p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Pulse context</p><div className="mt-2 flex flex-wrap gap-2">{activeAiContextChips.length === 0 ? <span className="text-xs text-slate-400">No optional context selected.</span> : activeAiContextChips.map((chip) => <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">{chip.label}<button type="button" onClick={() => setExcludedAiContextKeys((current) => [...current, chip.key])} aria-label={`Remove ${chip.label} context`}><X className="h-3 w-3" /></button></span>)}</div></div>
          {aiError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>}
          {aiSuggestions.length > 0 && <div className="mt-6 space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-violet-700">Temporary suggestions</p>{aiSuggestions.map((question, index) => {
            const isRegenerating = regeneratingSuggestionIds.includes(question.id)
            const suggestionActionDisabled = aiLoading || isRegenerating
            const isEditing = editingAiSuggestion?.id === question.id
            const finishEditing = () => setEditingAiSuggestion(null)
            return <article key={question.id} aria-busy={isRegenerating} className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20"><div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-violet-700 dark:bg-zinc-900">{index + 1}</span><div className="min-w-0 flex-1"><span className="text-[11px] font-bold text-violet-700">{advancedSurveyQuestionTypeLabel(surveyContext, question.type)}</span>{isEditing ? <input autoFocus aria-label={`Edit suggestion ${index + 1}`} value={question.text} onChange={(event) => setAiSuggestions((current) => updateTemporaryAiSuggestionText(current, question.id, event.target.value))} onBlur={finishEditing} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { event.preventDefault(); setAiSuggestions((current) => updateTemporaryAiSuggestionText(current, question.id, editingAiSuggestion?.previousText ?? question.text)); event.currentTarget.blur() } }} className="mt-1 h-5 w-full rounded border border-violet-300 bg-white px-1.5 text-sm font-semibold text-slate-900 outline-none ring-2 ring-violet-500/20 dark:bg-zinc-900 dark:text-white" /> : <button type="button" onClick={() => setEditingAiSuggestion({ id: question.id, previousText: question.text })} className="mt-1 block w-full rounded px-1.5 text-left text-sm font-semibold text-slate-900 hover:bg-violet-100/70 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:text-white" aria-label={`Edit suggestion ${index + 1}`}>{question.text}</button>}{question.options && <p className="mt-1 text-xs text-slate-500">{question.options.join(' · ')}</p>}</div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => void regenerateAiSuggestion(question)} disabled={suggestionActionDisabled} className="rounded p-1 text-slate-400 hover:bg-violet-100 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Regenerate suggestion ${index + 1}`}><RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} /></button><button type="button" onClick={() => { setAiSuggestions((current) => removeTemporaryAiSuggestion(current, question.id)); setEditingAiSuggestion((current) => current?.id === question.id ? null : current) }} disabled={suggestionActionDisabled} className="rounded p-1 text-slate-400 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Remove suggestion ${index + 1}`}><X className="h-4 w-4" /></button></div></div></article>
          })}</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setAiSuggestions([]); setAiPanelOpen(false) }} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500">Discard</button>{aiSuggestions.length > 0 && <button type="button" onClick={generateWithAi} disabled={aiLoading} className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-bold text-violet-700 disabled:opacity-50">Regenerate</button>}<button type="button" onClick={aiSuggestions.length > 0 ? keepAiSuggestions : generateWithAi} disabled={aiLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Sparkles className="h-4 w-4" />{aiLoading ? 'Generating…' : aiSuggestions.length > 0 ? 'Keep questions' : 'Generate'}</button></div>
        </div>
      </div>}
      <header className="border-b border-slate-200 pb-5 dark:border-zinc-800">
        <a href={backPath} data-testid="simple-creation-builder-back" className="event-type-control inline-flex items-center gap-1.5 text-slate-500 hover:text-blue-700 dark:text-zinc-400">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {backLabel}
        </a>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="event-type-page-title text-slate-950 dark:text-white">{surveyName.trim() || 'Untitled survey'}</h1>
              <span className="event-type-pill rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{surveyStatus === 'ACTIVE' ? 'Active' : surveyStatus === 'DRAFT' ? 'Draft' : surveyStatus.toLowerCase().replace(/(^|_)\w/g, (value) => value.replace('_', ' ').toUpperCase())}</span>
              <span className="event-type-pill rounded-full bg-slate-100 px-2.5 py-1 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">{isSimpleEvent ? 'Whole event' : assignmentTargets.length > 0 ? `${assignmentTargets.length} assignment${assignmentTargets.length === 1 ? '' : 's'}` : 'Not assigned'}</span>
            </div>
            <p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">{event.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3"><div aria-live="polite" className="event-type-meta flex min-h-8 items-center gap-2 text-slate-500 dark:text-zinc-400">
            {saveState === 'saving' && <><Clock3 className="h-4 w-4" aria-hidden="true" /> Saving…</>}
            {saveState === 'saved' && <><Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Saved</>}
            {saveState === 'idle' && <><Save className="h-4 w-4" aria-hidden="true" /> {lifecyclePresentation.isDraft ? 'Autosaved draft' : 'Autosaved'}</>}
            {saveState === 'error' && <span className="text-red-600 dark:text-red-400">{saveError}</span>}
          </div>{isSimpleEvent && <button type="button" onClick={() => { void saveAndFinish() }} disabled={saveState === 'saving'} className="event-type-control rounded-xl bg-blue-700 px-4 py-2 text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Save &amp; Finish</button>}</div>
        </div>
      </header>

      <nav className="mt-5 flex w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-zinc-800 dark:bg-zinc-900" aria-label="Survey builder sections">
        {ADVANCED_BUILDER_TABS.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`event-type-control inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 transition ${active ? 'bg-[#eef2fb] text-[#28439A] shadow-sm dark:bg-blue-950/40 dark:text-blue-200' : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'}`}
            >
              {tab.label}
              {tab.id === 'QUESTIONS' && <span className={`event-type-pill min-w-5 rounded-full px-1.5 py-0.5 text-[11px] ${active ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-zinc-200'}`}>{questions.length}</span>}
            </button>
          )
        })}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-5">
          {(activeTab === 'QUESTIONS' || activeTab === 'AVAILABILITY') && <>
          {activeTab === 'AVAILABILITY' && (!isSimpleEvent ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="event-type-section-title text-slate-950 dark:text-white">Assignment</p>
                <p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">Optional — build the survey now and decide where it is used later.</p>
              </div>
              <button type="button" onClick={() => setAssignmentPanelOpen((open) => !open)} className="event-type-control inline-flex w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-blue-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-blue-300">{assignmentTargets.length > 0 ? 'Change assignment' : 'Assign'}</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {assignmentTargets.length === 0
                ? <span className="event-type-pill inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">Not assigned</span>
                : assignmentTargets.map((target) => <span key={target.id} className="event-type-pill inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">{target.name}<button type="button" disabled={assignmentSaving} onClick={() => removeAssignmentTarget(target)} className="rounded-full p-0.5 hover:bg-blue-100" aria-label={`Remove ${target.name} assignment`}><X className="h-3 w-3" /></button></span>)}
            </div>
            {assignmentTargets.length === 0 && <p className="event-type-summary mt-4 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-100">Assignment is optional. It controls where this survey runs.</p>}
            {assignmentWarning && <p role="status" className="event-type-summary mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">{assignmentWarning}</p>}

            {assignmentPanelOpen && (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-700">
                <div className="border-b border-slate-100 px-4 py-3 dark:border-zinc-800"><p className="text-sm font-bold text-slate-900 dark:text-white">Where this survey is used</p><p className="mt-0.5 text-xs text-slate-500">Choose more than one kind over time. Existing assignments stay in place.</p></div>
                <div className="grid sm:grid-cols-[170px_minmax(0,1fr)]">
                  <div className="border-b border-slate-100 bg-slate-50 p-2 sm:border-b-0 sm:border-r dark:border-zinc-800 dark:bg-zinc-950/50">
                    {[
                      ['EVENT', 'Event-wide'], ['SESSION', 'Sessions'], ['SPEAKER', 'Speakers'], ['LOCATION', 'Event Areas'], ['CUSTOM', 'Custom'],
                    ].map(([kind, label]) => <button key={kind} type="button" onClick={() => { setAssignmentKind(kind as typeof assignmentKind); setAssignmentSelection('SELECTED'); setSelectedAssignmentIds([]) }} className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${assignmentKind === kind ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200' : 'text-slate-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-900'}`}>{label}</button>)}
                  </div>
                  <div className="p-4">
                    {!['EVENT', 'CUSTOM'].includes(assignmentKind) && <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-zinc-800"><button type="button" onClick={() => setAssignmentSelection('ALL')} className={`rounded-md px-3 py-2 text-xs font-semibold ${assignmentSelection === 'ALL' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-slate-500'}`}>All {assignmentKind === 'LOCATION' ? 'areas' : `${assignmentKind.toLowerCase()}s`}</button><button type="button" onClick={() => setAssignmentSelection('SELECTED')} className={`rounded-md px-3 py-2 text-xs font-semibold ${assignmentSelection === 'SELECTED' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-slate-500'}`}>Selected</button></div>}
                    {assignmentKind === 'EVENT' && <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:bg-zinc-950 dark:text-zinc-300">Use this survey across {event.name}.</p>}
                    {assignmentKind === 'CUSTOM' && <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Custom touchpoint<input value={customAssignmentName} onChange={(e) => setCustomAssignmentName(e.target.value)} placeholder="VIP lounge follow-up" className={`${inputClass} mt-2`} /></label>}
                    {!['EVENT', 'CUSTOM'].includes(assignmentKind) && assignmentSelection === 'ALL' && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">This rule follows future {assignmentKind === 'LOCATION' ? 'event area' : assignmentKind.toLowerCase()} additions automatically.</p>}
                    {!['EVENT', 'CUSTOM'].includes(assignmentKind) && assignmentSelection === 'SELECTED' && <div className="mt-3 max-h-52 space-y-1 overflow-auto">{assignmentOptions.length === 0 ? <p className="text-xs text-slate-500">No compatible {assignmentKind.toLowerCase()} records yet.</p> : assignmentOptions.map((option) => <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800"><input type="checkbox" checked={selectedAssignmentIds.includes(option.id)} onChange={(e) => setSelectedAssignmentIds((current) => e.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" /><span><span className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">{option.name}</span><span className="block text-xs text-slate-400">{option.detail}</span></span></label>)}</div>}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-zinc-800"><button type="button" onClick={() => setAssignmentPanelOpen(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button><button type="button" onClick={saveCurrentAssignment} disabled={assignmentSaving} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{assignmentSaving ? 'Saving…' : 'Save assignment'}</button></div>
              </div>
            )}
          </section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70" data-testid="simple-event-wide-survey-context"><p className="event-type-section-title text-slate-950 dark:text-white">Whole event survey</p><p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">This survey covers the whole event — nothing to assign.</p></section>)}

          {activeTab === 'QUESTIONS' && <>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70" data-testid="survey-collection-phase">
            <h2 className="event-type-section-title text-slate-950 dark:text-white">When will responses be collected?</h2>
            <p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">Choose the evidence cohort for this survey. This is stored on every response and is not inferred from dates.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Survey phase">
              {COLLECTION_PHASE_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={collectionPhase === option.value} onClick={() => { markEdited(); setCollectionPhase(option.value) }} className={`rounded-xl border p-3 text-left transition ${collectionPhase === option.value ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/10 dark:bg-blue-950/30' : 'border-slate-200 bg-white hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950'}`}><span className="block text-sm font-bold text-slate-900 dark:text-white">{option.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-zinc-400">{option.description}</span></button>)}
            </div>
          </section>

          {!isSimpleEvent && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70" data-testid="advanced-survey-context">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="event-type-section-title text-slate-950 dark:text-white">Survey context</h2>
              <p className="event-type-summary text-slate-500 dark:text-zinc-400">Choose what event data your questions can use. Assignment controls where the survey runs.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Survey context">
              {([
                ['NOT_SURE', 'Not sure yet'],
                ['EVENT', 'Event-wide'],
                ['SESSIONS', 'Sessions'],
                ['SPEAKERS', 'Speakers'],
                ['EVENT_AREAS', 'Event areas'],
                ['CUSTOM', 'Custom'],
              ] as Array<[AdvancedSurveyContext, string]>).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={surveyContext === value} onClick={() => { markEdited(); setSurveyContext(value) }} className={`event-type-control inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 transition ${surveyContext === value ? 'border-blue-700 bg-blue-50 text-slate-950 ring-2 ring-blue-700/10 dark:bg-blue-950/30 dark:text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'}`}><span className={`h-3.5 w-3.5 rounded-full border ${surveyContext === value ? 'border-[4px] border-blue-700' : 'border-slate-300'}`} />{label}</button>)}
            </div>
            {(surveyContext === 'SESSIONS' || surveyContext === 'SPEAKERS' || surveyContext === 'EVENT_AREAS') && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-zinc-200">{surveyContext === 'SESSIONS' ? <>Questions can use <code className="text-blue-800 dark:text-blue-200">{'{session_name}'}</code> and <code className="text-blue-800 dark:text-blue-200">{'{speaker_name}'}</code>; both resolve from the agenda at delivery.</> : surveyContext === 'SPEAKERS' ? <>Questions can use <code className="text-blue-800 dark:text-blue-200">{'{speaker_name}'}</code>, resolved from live event speaker data at delivery.</> : <>Questions can use <code className="text-blue-800 dark:text-blue-200">{'{area_name}'}</code>, resolved from the assigned event area at delivery.</>}</div>}
            {showSpeakerFeedbackMode && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-zinc-700" data-testid="advanced-multiple-speaker-mode">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Multiple speakers detected</p>
              <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-zinc-700 dark:bg-zinc-950" role="radiogroup" aria-label="Speaker feedback mode">
                {([
                  ['EACH_SPEAKER', 'Each speaker'],
                  ['SPEAKERS_AS_GROUP', 'Speakers as a group'],
                ] as Array<[AdvancedSpeakerFeedbackMode, string]>).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={speakerFeedbackMode === value} onClick={() => { markEdited(); setSpeakerFeedbackMode(value) }} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${speakerFeedbackMode === value ? 'bg-white text-blue-700 shadow-sm dark:bg-zinc-800 dark:text-blue-200' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`}>{label}</button>)}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">{speakerFeedbackMode === 'EACH_SPEAKER' ? 'Ask once per speaker.' : 'Ask once about all speakers.'}</p>
            </div>}
          </section>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="event-type-section-title text-slate-950 dark:text-white">Survey content</h2><p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">Name the survey and add questions for attendees.</p></div>
              <div className="flex flex-wrap items-center justify-end gap-2"><span className="event-type-meta text-slate-400">{questions.length} question{questions.length === 1 ? '' : 's'}</span>{lifecyclePresentation.isDraft && <button type="button" onClick={() => { setAiPanelOpen(true); setAiError(null) }} disabled={questionsLocked} className="event-type-control inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-700 hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-45 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200"><Sparkles className="h-3.5 w-3.5" /> Generate with AI</button>}</div>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="advanced-survey-name" className="event-type-control mb-2 block text-slate-700 dark:text-zinc-300">Survey name</label>
                <input id="advanced-survey-name" value={surveyName} onChange={(e) => { markEdited(); setSurveyName(e.target.value) }} placeholder="Attendee feedback survey" className={advancedFieldClass} />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <span className="font-semibold text-slate-800 dark:text-zinc-100">{openResponseMethod === 'VOICE_ONLY' ? 'Voice first' : openResponseMethod === 'TEXT_ONLY' ? 'Text / tap' : 'Attendee chooses'}</span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <button type="button" onClick={() => setActiveTab('EXPERIENCE')} className="font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300">Change in Experience</button>
            </div>
            {questionsLocked && <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">Questions are locked because this survey has responses. Survey details and voice settings can still be updated.</p>}
            <div className="mt-5 space-y-2">
              {questions.map((question, index) => {
                const expanded = expandedQuestionId === question.id
                const validationIssues = questionReviewIssues[index]?.issues ?? []
                const hasValidationIssue = validationIssues.length > 0
                const selectableQuestionTypes = questionTypeOptions.some((option) => option.type === question.type)
                  ? questionTypeOptions
                  : [...questionTypeOptions, { type: question.type, label: advancedSurveyQuestionTypeLabel(surveyContext, question.type), hint: '', stores: '' }]
                return (
                  <article
                    key={question.id}
                    draggable={!questionsLocked}
                    onDragStart={() => { if (!questionsLocked) draggedQuestionIndexRef.current = index }}
                    onDragOver={(event) => { if (!questionsLocked) event.preventDefault() }}
                    onDrop={() => {
                      if (questionsLocked) return
                      const source = draggedQuestionIndexRef.current
                      draggedQuestionIndexRef.current = null
                      if (source == null || source === index) return
                      const next = [...questions]
                      const [moved] = next.splice(source, 1)
                      next.splice(index, 0, moved)
                      updateQuestions(next)
                    }}
                    onKeyDown={(event) => {
                      if (!event.altKey || questionsLocked) return
                      if (event.key === 'ArrowUp') { event.preventDefault(); moveQuestion(index, -1) }
                      if (event.key === 'ArrowDown') { event.preventDefault(); moveQuestion(index, 1) }
                    }}
                    data-validation-state={hasValidationIssue ? 'invalid' : 'valid'}
                    className={`overflow-hidden rounded-xl border bg-white transition dark:bg-zinc-950 ${expanded ? 'border-blue-500 ring-2 ring-blue-500/10' : hasValidationIssue ? 'border-red-400 ring-1 ring-red-200 dark:border-red-800 dark:ring-red-950' : 'border-slate-200 dark:border-zinc-700'}`}
                  >
                    <div className="flex min-h-[62px] items-center gap-2 px-3">
                      <GripVertical className={`h-4 w-4 shrink-0 text-slate-300 ${questionsLocked ? 'cursor-not-allowed opacity-40' : 'cursor-grab'}`} aria-label={questionsLocked ? 'Question order locked' : 'Drag to reorder'} />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{index + 1}</span>
                      <button type="button" onClick={() => setExpandedQuestionId(expanded ? null : question.id)} className="min-w-0 flex-1 py-2 text-left">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="event-type-pill rounded-md bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">{advancedSurveyQuestionTypeLabel(surveyContext, question.type)}</span>
                          <span className="event-type-pill text-slate-400">{question.required ? 'Required' : 'Optional'}</span>
                          {hasValidationIssue && <span className="event-type-pill rounded-md bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-200">Needs attention</span>}
                        </span>
                        <span className="event-type-row-title mt-1 block truncate text-slate-900 dark:text-zinc-100">{question.text.trim() || 'Untitled question'}</span>
                        {hasValidationIssue && !expanded && <span className="event-type-meta mt-1 block text-red-600 dark:text-red-300">{validationIssues.map((issue) => issue.message).join(' ')}</span>}
                      </button>
                      <button type="button" onClick={() => moveQuestion(index, -1)} disabled={questionsLocked || index === 0} className="rounded p-1 text-slate-400 disabled:cursor-not-allowed disabled:opacity-25" aria-label={`Move question ${index + 1} up`}><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => moveQuestion(index, 1)} disabled={questionsLocked || index === questions.length - 1} className="rounded p-1 text-slate-400 disabled:cursor-not-allowed disabled:opacity-25" aria-label={`Move question ${index + 1} down`}><ArrowDown className="h-3.5 w-3.5" /></button>
                      {!questionsLocked && <EventRowActionOverflow label={`Question ${index + 1} actions`} menuClassName="w-36">
                          <button type="button" onClick={() => {
                            const duplicate = { ...question, id: crypto.randomUUID(), text: question.text ? `${question.text} (copy)` : '' }
                            const next = [...questions]
                            next.splice(index + 1, 0, duplicate)
                            updateQuestions(next)
                            setExpandedQuestionId(duplicate.id)
                          }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-zinc-800"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                          <button type="button" onClick={() => deleteQuestion(index)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                      </EventRowActionOverflow>}
                      <button type="button" onClick={() => setExpandedQuestionId(expanded ? null : question.id)} className="rounded p-1 text-slate-400" aria-label={expanded ? 'Collapse question' : 'Expand question'}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-100 px-4 py-4 dark:border-zinc-800">
                        <div className="flex items-center justify-between gap-3"><label htmlFor={`advanced-question-${question.id}`} className="text-xs font-bold text-slate-600 dark:text-zinc-300">Question</label>{lifecyclePresentation.isDraft && !questionsLocked && <button type="button" onClick={() => { setRewriteQuestionId(rewriteQuestionId === question.id ? null : question.id); setRewriteProposal(null); setRewriteInstruction(''); setAiError(null) }} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-200"><Sparkles className="h-3.5 w-3.5" /> Rewrite</button>}</div>
                        <textarea
                          id={`advanced-question-${question.id}`}
                          value={question.text}
                          readOnly={questionsLocked}
                          onChange={(event) => updateQuestions(questions.map((item) => item.id === question.id ? { ...item, text: event.target.value } : item))}
                          rows={2}
                          placeholder="What would you like to ask?"
                          aria-invalid={validationIssues.some((issue) => issue.field === 'text')}
                          className={`${advancedFieldClass} mt-2 ${questionsLocked ? 'cursor-not-allowed bg-slate-50 text-slate-600 dark:bg-zinc-900' : ''}`}
                        />
                        {validationIssues.filter((issue) => issue.field === 'text').map((issue) => <p key={issue.message} className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">{issue.message}</p>)}
                        <label className="mt-4 block text-xs font-bold text-slate-600 dark:text-zinc-300">Question type
                          <select aria-label={`Question ${index + 1} type`} value={question.type} disabled={questionsLocked} onChange={(event) => updateQuestions(questions.map((item) => item.id === question.id ? changeAdvancedQuestionType(item, event.target.value as AdvancedQuestionType) : item))} className={`${inputClass} mt-2 text-sm`}>
                            {selectableQuestionTypes.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
                          </select>
                        </label>
                        {lifecyclePresentation.isDraft && rewriteQuestionId === question.id && <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20"><label className="text-xs font-bold text-violet-800 dark:text-violet-200">Rewrite direction <span className="font-normal">Optional</span><input value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="Shorter, warmer, more specific…" className={`${inputClass} mt-2 text-sm`} /></label>{rewriteProposal && <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-white p-3 dark:bg-zinc-950"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Original</p><p className="mt-1 text-sm text-slate-700 dark:text-zinc-200">{rewriteProposal.original}</p></div><div className="rounded-lg border border-violet-200 bg-white p-3 dark:bg-zinc-950"><p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Suggested</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{rewriteProposal.text}</p><p className="mt-2 text-xs text-slate-500">{rewriteProposal.summary}</p></div></div>}{aiError && <p className="mt-2 text-xs text-red-600">{aiError}</p>}<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => { setRewriteQuestionId(null); setRewriteProposal(null) }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500">Cancel</button><button type="button" onClick={() => requestQuestionRewrite(question)} disabled={rewriteLoading} className="rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-bold text-violet-700 disabled:opacity-50">{rewriteLoading ? 'Rewriting…' : rewriteProposal ? 'Try again' : 'Suggest rewrite'}</button>{rewriteProposal && <button type="button" onClick={() => { updateQuestions(questions.map((item) => item.id === question.id ? { ...item, text: rewriteProposal.text } : item)); setRewriteQuestionId(null); setRewriteProposal(null) }} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white">Accept wording</button>}</div></div>}
                        {question.type === 'SINGLE_CHOICE' && (
                          <div className="mt-4 space-y-2">
                            <p className="text-xs font-bold text-slate-600 dark:text-zinc-300">Choices</p>
                            {(question.options ?? []).map((option, optionIndex) => (
                              <div key={`${question.id}-option-${optionIndex}`} className="flex gap-2">
                                <input id={`advanced-question-${question.id}-choice-${optionIndex}`} value={option} readOnly={questionsLocked} onChange={(event) => updateQuestions(questions.map((item) => item.id === question.id ? { ...item, options: (item.options ?? []).map((value, indexValue) => indexValue === optionIndex ? event.target.value : value) } : item))} className={`${inputClass} py-2 text-sm ${questionsLocked ? 'cursor-not-allowed bg-slate-50 dark:bg-zinc-900' : ''}`} aria-label={`Choice ${optionIndex + 1}`} />
                                <button type="button" onClick={() => updateQuestions(questions.map((item) => item.id === question.id ? { ...item, options: (item.options ?? []).filter((_, indexValue) => indexValue !== optionIndex) } : item))} disabled={questionsLocked} className="rounded-lg border border-slate-200 px-2 text-slate-400 disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Remove choice ${optionIndex + 1}`}><X className="h-4 w-4" /></button>
                              </div>
                            ))}
                            {validationIssues.filter((issue) => issue.field === 'options').map((issue) => <p key={issue.message} className="text-xs font-medium text-red-600 dark:text-red-300">{issue.message}</p>)}
                            <button id={`advanced-question-${question.id}-add-choice`} type="button" onClick={() => updateQuestions(questions.map((item) => item.id === question.id ? { ...item, options: [...(item.options ?? []), `Option ${(item.options?.length ?? 0) + 1}`] } : item))} disabled={questionsLocked} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"><Plus className="h-3.5 w-3.5" /> Add choice</button>
                          </div>
                        )}
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-zinc-300"><input type="checkbox" checked={question.required} disabled={questionsLocked} onChange={(event) => updateQuestions(questions.map((item) => item.id === question.id ? { ...item, required: event.target.checked } : item))} className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:cursor-not-allowed disabled:opacity-50" /> Required</label>
                          <button type="button" onClick={() => setExpandedQuestionId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-zinc-700 dark:text-zinc-200">Done</button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            {questions.length === 0 && (
              <div className="mt-5 rounded-xl border-2 border-dashed border-slate-200 px-5 py-8 text-center dark:border-zinc-700">
                <Sparkles className="mx-auto h-5 w-5 text-blue-600" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-zinc-100">Add the first question</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-zinc-400">Question types follow the selected Survey context. Assignment decides where the survey runs.</p>
              </div>
            )}

            <div className="mt-4">
              <button type="button" onClick={openTypeChooser} disabled={questionsLocked} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"><Plus className="h-4 w-4" /> Add question</button>
              {typeChooserOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[1px]" onKeyDown={(event) => { if (event.key === 'Escape') setTypeChooserOpen(false) }}>
                  <div role="dialog" aria-modal="true" aria-label="Choose question type" className="max-h-[calc(100dvh-2rem)] w-full max-w-[900px] -translate-y-[6vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-zinc-800">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        ref={typeSearchRef}
                        value={typeSearch}
                        onChange={(event) => { setTypeSearch(event.target.value); setActiveTypeIndex(0) }}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowDown') { event.preventDefault(); setActiveTypeIndex((current) => Math.min(current + 1, visibleQuestionTypes.length - 1)) }
                          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveTypeIndex((current) => Math.max(current - 1, 0)) }
                          if (event.key === 'Enter' && visibleQuestionTypes[activeTypeIndex]) { event.preventDefault(); addQuestion(visibleQuestionTypes[activeTypeIndex].type) }
                          if (event.key === 'Escape') setTypeChooserOpen(false)
                        }}
                        placeholder="Search question types"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                      <span className="hidden text-[11px] text-slate-400 sm:inline">↑↓ move · ↵ add</span>
                      <button type="button" onClick={() => setTypeChooserOpen(false)} className="rounded p-1 text-slate-400" aria-label="Close question type chooser"><X className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {visibleQuestionTypes.map((option, optionIndex) => (
                        <button key={option.type} type="button" onMouseEnter={() => setActiveTypeIndex(optionIndex)} onClick={() => addQuestion(option.type)} className={`rounded-xl border p-3 text-left transition ${activeTypeIndex === optionIndex ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/10 dark:bg-blue-950/20' : 'border-slate-200 hover:border-blue-300 dark:border-zinc-700'}`}>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-zinc-400">{option.hint}</span>
                          <span className="mt-3 block text-xs text-slate-500">{option.stores}</span>
                        </button>
                      ))}
                    </div>
                    {!sessionSpeakerFeedbackAvailable && !isSimpleEvent && <p className="mt-3 text-xs text-slate-500">Speaker feedback becomes available when Survey context is set to Sessions.</p>}
                  </div>
                </div>
              )}
            </div>
            {deletedQuestion && <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs text-white"><span>Question deleted</span><button type="button" onClick={undoDelete} className="inline-flex items-center gap-1 font-semibold"><Undo2 className="h-3.5 w-3.5" /> Undo</button></div>}
          </section>
          </>}
          </>}

          {activeTab === 'EXPERIENCE' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="event-type-section-title text-slate-950 dark:text-white">Experience</h2><p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">Configure how attendees answer, then tailor the Pulse voice used where applicable.</p></div>
              <button type="button" onClick={openFullSurveyPreview} className="event-type-control inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"><MonitorSmartphone className="h-4 w-4" aria-hidden="true" />Survey Preview</button>
            </div>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200" aria-labelledby="advanced-response-mode-title">
              <div className="bg-[#0B1638] px-5 py-4 text-white">
                <h3 id="advanced-response-mode-title" className="event-type-section-title text-white">Response mode</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-100">Choose how attendees answer this survey.</p>
              </div>
              <div className="bg-slate-50 p-4 dark:bg-zinc-950/60">
                <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Response mode">
                  {([
                    ['VOICE_ONLY', 'Voice first', 'Questions are read aloud and attendees answer by voice. Ratings, Yes/No, and other structured answers are still stored as structured data.', 'Default'],
                    ['TEXT_ONLY', 'Text / tap', 'Questions are shown on screen and attendees answer using tap or text controls.', ''],
                    ['VOICE_AND_TEXT', 'Attendee chooses', 'Attendees can switch between speaking and tap/text during the survey.', ''],
                  ] as Array<[typeof openResponseMethod, string, string, string]>).map(([value, label, detail, tag]) => <button key={value} type="button" role="radio" aria-checked={openResponseMethod === value} onClick={() => { markEdited(); setOpenResponseMethod(value) }} className={`rounded-xl border p-4 text-left transition ${openResponseMethod === value ? 'border-blue-700 bg-blue-50 ring-2 ring-blue-700/10 dark:bg-blue-950/30' : 'border-slate-200 bg-white hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900'}`}><span className="flex items-center gap-2"><span className={`h-3.5 w-3.5 rounded-full border ${openResponseMethod === value ? 'border-[4px] border-blue-700' : 'border-slate-300'}`} /><span className="event-type-control font-bold text-slate-950 dark:text-white">{label}</span>{tag && <span className="event-type-pill rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-800">{tag}</span>}</span><span className="mt-2 block pl-[22px] text-xs leading-5 text-slate-500 dark:text-zinc-400">{detail}</span></button>)}
                </div>
              </div>
            </section>

            <fieldset className={`mt-5 ${openResponseMethod === 'TEXT_ONLY' ? 'opacity-75' : ''}`}>
              <legend className="event-type-row-title text-slate-800 dark:text-zinc-100">Language</legend>
              <p className="event-type-meta mt-1 text-slate-500">Choose the supported language variant Pulse uses when it speaks.</p>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Pulse language">
                {Object.entries(TTS_LOCALE_LABELS).map(([locale, label]) => <button key={locale} type="button" role="radio" aria-checked={questionVoiceLocale === locale} onClick={() => handleQuestionVoiceLocaleChange(locale)} disabled={Boolean(previewingVoiceId)} className={`event-type-control rounded-xl border px-3.5 py-2 transition ${questionVoiceLocale === locale ? 'border-blue-700 bg-blue-50 text-slate-950 ring-2 ring-blue-700/10 dark:bg-blue-950/30 dark:text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'}`}>{label}</button>)}
              </div>
            </fieldset>

            <section className={`mt-5 border-t border-slate-200 pt-5 dark:border-zinc-700 ${openResponseMethod === 'TEXT_ONLY' ? 'opacity-75' : ''}`} aria-labelledby="advanced-question-voice-title">
              <div><h3 id="advanced-question-voice-title" className="text-sm font-bold text-slate-800 dark:text-zinc-100">Pulse voice</h3><p className="mt-1 text-xs text-slate-500">Choose the voice used for Voice first and Attendee chooses. Text / tap keeps questions on screen.</p></div>
              <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Pulse voice group">{TTS_VOICE_PROFILE_OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={questionVoiceProfile === option.value} onClick={() => handleQuestionVoiceProfileChange(option.value)} disabled={Boolean(previewingVoiceId)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${questionVoiceProfile === option.value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-300'}`}>{option.label}</button>)}</div>
              <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-zinc-800 dark:border-zinc-700">{questionVoiceToneOptions.map((option) => <div key={option.value} className={`flex items-center gap-3 px-3 py-3 ${questionVoice === option.value ? 'bg-blue-50/60 dark:bg-blue-950/20' : 'bg-white dark:bg-zinc-950'}`}><label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"><input type="radio" name="advanced-question-voice" checked={questionVoice === option.value} onChange={() => handleQuestionVoiceToneChange(option.value)} disabled={Boolean(previewingVoiceId)} className="mt-1" /><span><span className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">{option.name ?? option.label}</span><span className="mt-0.5 block text-xs text-slate-500">{option.description ?? option.label}</span></span></label><button type="button" onClick={() => void handlePreviewQuestionVoice(option.value)} disabled={!accountSlug} className="shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50 dark:text-blue-300">{previewingVoiceId === option.value ? 'Previewing…' : 'Preview'}</button></div>)}</div>
              <p className="mt-3 text-xs text-slate-500">{selectedQuestionVoiceToneLabel} · Preview plays a short sample only.</p>
              {questionVoicePreviewError && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{questionVoicePreviewError}</p>}
            </section>
          </section>
          }

          {activeTab === 'AVAILABILITY' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="event-type-section-title text-slate-950 dark:text-white">Availability</h2>
            <p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">When attendees can answer. Fixed times use {event.location?.timezone || 'the event timezone'}.</p>
            <div className="mt-4">
              <SurveyAvailabilityEditor
                value={availability}
                onChange={(value) => { markEdited(); setAvailability(value) }}
                scheduleContext={assignedSession ? { label: assignedSession.name, startsAt: assignedSession.startsAt, endsAt: assignedSession.endsAt, timezone: assignedSession.timezone } : null}
                scheduleUnavailableReason={isSimpleEvent ? 'Simple Event surveys use event-wide scheduling.' : 'Assign this survey to a scheduled session to use session-relative timing.'}
                advancedLabels
                lockTimezone
              />
            </div>
          </section>
          }

          {activeTab === 'REVIEW' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70" aria-labelledby="advanced-review-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="advanced-review-title" className="event-type-section-title text-slate-950 dark:text-white">{lifecyclePresentation.reviewTitle}</h2><p className="event-type-summary mt-1 text-slate-500 dark:text-zinc-400">{lifecyclePresentation.reviewDescription}</p></div>{lifecyclePresentation.isDraft && <button type="button" onClick={publishSurvey} disabled={publishing || publishReadinessPending || reviewIssues.length > 0} className="event-type-control inline-flex items-center justify-center rounded-xl bg-blue-700 px-5 py-2.5 text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45">{publishing ? 'Publishing…' : 'Publish survey'}</button>}</div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-950"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Content</dt><dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">{questions.length} question{questions.length === 1 ? '' : 's'}</dd><dd className="mt-1 text-xs text-slate-500">{questions.length > 0 ? [...new Set(questions.map((question) => advancedSurveyQuestionTypeLabel(surveyContext, question.type)))].join(' · ') : 'No questions yet'}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-950"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Collection phase</dt><dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">{COLLECTION_PHASE_OPTIONS.find((option) => option.value === collectionPhase)?.label ?? 'Not selected'}</dd><dd className="mt-1 text-xs text-slate-500">Copied to each response as immutable evidence provenance.</dd></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-950"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Response mode</dt><dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">{openResponseMethod === 'VOICE_ONLY' ? 'Voice first' : openResponseMethod === 'TEXT_ONLY' ? 'Text / tap' : 'Attendee chooses'}</dd><dd className="mt-1 text-xs text-slate-500">{openResponseMethod === 'VOICE_ONLY' ? 'Spoken answers stay structured.' : openResponseMethod === 'TEXT_ONLY' ? 'Native tap and text controls.' : 'Voice and tap are available per question.'}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-950"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Availability</dt><dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">{availability.mode === 'OPEN_IMMEDIATELY' ? 'Always open' : availability.mode === 'CUSTOM_WINDOW' ? 'Fixed window' : 'Relative to session'}</dd><dd className="mt-1 text-xs text-slate-500">{event.location?.timezone || 'Event timezone'}</dd></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-950"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Assignment / audience</dt><dd className="mt-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">{isSimpleEvent ? 'Whole event' : assignmentTargets.length > 0 ? assignmentTargets.map((target) => target.name).join(' · ') : 'Not assigned'}</dd><dd className="mt-1 text-xs text-slate-500">{isSimpleEvent ? 'Applies automatically to every attendee.' : assignmentTargets.length > 0 ? 'Uses canonical Event targets.' : 'Assignment is optional and can be added later.'}</dd></div>
            </dl>
            {lifecyclePresentation.isDraft && <>{publishError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-200">{publishError}</p>}{publishReadinessPending ? <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">Checking publish readiness…</p> : reviewIssues.length > 0 ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-950/20"><p className="text-xs font-bold text-amber-900 dark:text-amber-200">Resolve before publishing</p><ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">{reviewIssues.map((issue) => { const questionIssue = questionReviewIssueByMessage.get(issue); return <li key={issue}>{questionIssue ? <button type="button" onClick={() => focusQuestionReviewIssue(questionIssue)} className="text-left underline decoration-amber-400 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-50">{issue}</button> : <>• {issue}</>}</li> })}</ul></div> : <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/20 dark:text-emerald-200">{assignmentTargets.length > 0 ? 'Ready to publish.' : 'Ready to publish. Assignment may remain empty.'}</p>}</>}
          </section>
          }
        </div>

        <aside className="lg:sticky lg:top-5" aria-label="Attendee preview">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-zinc-400"><MonitorSmartphone className="h-4 w-4" aria-hidden="true" /> Attendee preview</span>
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Live preview</span>
            </div>
            <div className="mx-auto mt-4 w-fit">
              <OrganizerSurveyPreview
                variant="inline"
                questions={questions.map((question) => ({ id: question.id, questionId: question.id, text: question.text.trim() || 'Your question appears here', type: question.type, isRequired: question.required, options: question.options, responseTarget: question.type === 'SPEAKER_FEEDBACK' && speakerFeedbackMode === 'EACH_SPEAKER' ? 'SPEAKERS' : 'GENERAL' }))}
                branding={previewStartDetails?.branding}
                consent={previewStartDetails?.consent}
                contextLabel={previewContextLabel}
                responseMode={openResponseMethod}
                presentationMode={presentationMode}
                speakers={sessionSpeakers}
                sessionContext={assignedSession ? { name: assignedSession.name, speakers: sessionSpeakers } : null}
                speakerName={previewSpeakerName}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-zinc-400">{isSimpleEvent ? 'This preview represents the whole event survey.' : assignedSession ? 'Session context and speakers come from the live agenda.' : previewContextLabel ? 'Assignment context is shown in the preview.' : 'No assignment context is shown until this survey is assigned.'}</p>
            {openResponseMethod === 'VOICE_AND_TEXT' ? <p className="mt-1 text-xs font-medium text-slate-600 dark:text-zinc-300">Attendees can switch between the selected {selectedQuestionVoiceToneLabel.toLowerCase()} voice and tap or text controls.</p> : openResponseMethod === 'VOICE_ONLY' && <p className="mt-1 text-xs font-medium text-slate-600 dark:text-zinc-300">Questions are read aloud with the selected {selectedQuestionVoiceToneLabel.toLowerCase()} delivery.</p>}
          </div>
        </aside>
      </div>
      <EventConfirmDialog
        open={Boolean(pendingResponseHistoryAssignment)}
        title="Change survey assignment?"
        body="This survey already has responses. Changing its assignment will affect future responses only. Existing responses will remain associated with their original assignment."
        confirmLabel="Change assignment"
        busy={assignmentSaving}
        onCancel={() => setPendingResponseHistoryAssignment(null)}
        onConfirm={() => {
          const nextSpecs = pendingResponseHistoryAssignment
          if (!nextSpecs) return
          setPendingResponseHistoryAssignment(null)
          void saveAssignmentSpecs(nextSpecs)
        }}
      />
      <Modal isOpen={fullSurveyPreviewOpen} onClose={() => setFullSurveyPreviewOpen(false)} title="Survey Preview" overlayZIndexClassName="z-[110]">
        <div data-testid="advanced-full-survey-preview">
          <p className="text-sm text-slate-500">Preview only — responses are not recorded.</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{openResponseMethod === 'VOICE_ONLY' ? 'Voice first' : openResponseMethod === 'TEXT_ONLY' ? 'Text / tap' : 'Attendee chooses'} · {selectedQuestionVoiceToneLabel}</p>
          <div className="mx-auto mt-5 w-fit max-w-full overflow-auto">
            <OrganizerSurveyPreview
              variant="full"
              questions={questions.map((question) => ({ id: question.id, questionId: question.id, text: question.text.trim() || 'Your question appears here', type: question.type, isRequired: question.required, options: question.options, responseTarget: question.type === 'SPEAKER_FEEDBACK' && speakerFeedbackMode === 'EACH_SPEAKER' ? 'SPEAKERS' : 'GENERAL' }))}
              branding={previewStartDetails?.branding}
              consent={previewStartDetails?.consent}
              contextLabel={previewContextLabel}
              responseMode={openResponseMethod}
              presentationMode={presentationMode}
              speakers={sessionSpeakers}
              sessionContext={assignedSession ? { name: assignedSession.name, speakers: sessionSpeakers } : null}
              speakerName={previewSpeakerName}
            />
          </div>
        </div>
      </Modal>
    </main>
  )
}

function NewEventSurveyContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = typeof params.eventId === 'string' ? params.eventId : ''
  const accountSlug = searchParams.get('account')
  const preselectedAreaId = searchParams.get('area')
  const preselectedSpeakerId = searchParams.get('speakerId')?.trim() || ''
  const preselectedTargetId = searchParams.get('target')?.trim() || ''
  const preselectedTargetName = searchParams.get('targetName')?.trim() || ''
  const existingSurveyId = searchParams.get('survey')?.trim() || ''
  const startFromScratch = searchParams.get('scratch') === '1'
  const simpleCreationFlow = searchParams.get('simpleCreation') === '1'
  const bulkSessionIds = [...new Set((searchParams.get('sessions') ?? '').split(',').map((id) => id.trim()).filter(Boolean))].slice(0, 500)
  const isBulkSessionSurvey = bulkSessionIds.length > 0
  const accountPath = accountSlug ? `/app?account=${accountSlug}` : '/app'
  const dashboardPath = accountSlug
    ? `/app/events/${eventId}/dashboard?account=${accountSlug}`
    : `/app/events/${eventId}/dashboard`
  const surveysPath = accountSlug
    ? `/app/events/${eventId}?account=${accountSlug}&tab=surveys`
    : `/app/events/${eventId}?tab=surveys`
  const simpleStartingPointPath = (() => {
    const query = new URLSearchParams()
    if (accountSlug) query.set('account', accountSlug)
    if (simpleCreationFlow) query.set('simpleCreation', '1')
    return `/app/events/${eventId}/surveys/new?${query.toString()}`
  })()
  const surveyEditPath = (surveyId: string) =>
    accountSlug
      ? `/app/events/${eventId}/edit?account=${accountSlug}&survey=${surveyId}`
      : `/app/events/${eventId}/edit?survey=${surveyId}`

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [event, setEvent] = useState<EventSummary | null>(null)
  const [structureItems, setStructureItems] = useState<EventStructureItem[]>([])
  const [speakerTarget, setSpeakerTarget] = useState<SpeakerTargetSummary | null>(null)

  const [step, setStep] = useState<StepNumber>(1)
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [selectedStructureItemId, setSelectedStructureItemId] = useState('')
  const [targetName, setTargetName] = useState('Overall Event')

  // Step 2 — Content. Survey description stays behind Advanced details.
  const [surveyName, setSurveyName] = useState(searchParams.get('surveyName')?.trim() || '')
  const [collectionPhase, setCollectionPhase] = useState<CollectionPhase | null>(null)
  const [surveyDescription, setSurveyDescription] = useState('')
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [availability, setAvailability] = useState<SurveyAvailabilityFormValue>(() => defaultSurveyAvailability())
  const [responseMode, setResponseMode] = useState<'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'>('VOICE_ONLY')

  // Step 2 — Voice & Review. Picker stays behind Change voice.
  const [ttsProvider, setTtsProvider] = useState(DEFAULT_TTS_PROVIDER)
  const [ttsGender, setTtsGender] = useState<TtsVoiceGender>(DEFAULT_TTS_GENDER)
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_TTS_VOICE_LITERAL)
  const [showVoiceOptions, setShowVoiceOptions] = useState(false)
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null)
  const createRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function loadCreationContext() {
      if (!accountSlug || !eventId) {
        setLoadError('Missing account or event parameter.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setLoadError(null)

        const accountRes = await fetch(`/api/app/account?account=${accountSlug}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const accountBody = await accountRes.json().catch(() => ({}))
        if (!accountRes.ok || !accountBody?.success) {
          throw new Error(accountBody?.error || 'Failed to load account')
        }
        if (!isEventsAccount(accountBody.account?.accountType)) {
          router.replace(dashboardPath)
          return
        }

        const [eventRes, structureRes, speakerRes] = await Promise.all([
          fetch(`/api/app/events/${eventId}?account=${accountSlug}`, {
            credentials: 'include',
            cache: 'no-store',
          }),
          fetch(`/api/app/events/${eventId}/structure?account=${accountSlug}`, {
            credentials: 'include',
            cache: 'no-store',
          }),
          preselectedSpeakerId
            ? fetch(`/api/app/events/${eventId}/speakers/${encodeURIComponent(preselectedSpeakerId)}/survey?account=${encodeURIComponent(accountSlug)}`, {
                credentials: 'include',
                cache: 'no-store',
              })
            : Promise.resolve(null),
        ])

        const eventBody = await eventRes.json().catch(() => ({}))
        if (!eventRes.ok || !eventBody?.success) {
          throw new Error(eventBody?.error || 'Failed to load event')
        }

        const structureBody = await structureRes.json().catch(() => ({}))
        if (!structureRes.ok || !structureBody?.success) {
          throw new Error(structureBody?.error || 'Failed to load event structure')
        }

        const items = (structureBody.data?.items ?? []) as EventStructureItem[]
        setEvent(eventBody.event as EventSummary)
        setStructureItems(items)

        if (speakerRes) {
          const speakerBody = await speakerRes.json().catch(() => ({}))
          if (!speakerRes.ok || !speakerBody?.success || !speakerBody.data?.speaker) {
            throw new Error(speakerBody?.error || 'Speaker was not found in this event')
          }
          setSpeakerTarget(speakerBody.data.speaker as SpeakerTargetSummary)
        } else {
          setSpeakerTarget(null)
        }

        // Legacy Event Area handoff preselects the known destination.
        if (preselectedAreaId && items.some((item) => item.id === preselectedAreaId)) {
          setSelectedStructureItemId(preselectedAreaId)
        }
        if (!preselectedAreaId && !preselectedTargetId && !preselectedSpeakerId && !isBulkSessionSurvey) {
          setTargetName(eventBody.event?.name || 'Overall Event')
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    loadCreationContext()
  }, [accountSlug, dashboardPath, eventId, preselectedAreaId, preselectedSpeakerId, preselectedTargetId, isBulkSessionSurvey, router])

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
      setFormError(null)

      const response = await fetch(`/api/app/question-audio/preview?account=${accountSlug}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: ttsProvider,
          voice: ttsVoice,
          locale: deriveLocaleFromVoice(ttsVoice, DEFAULT_TTS_LOCALE_LITERAL),
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
      setFormError(err instanceof Error ? err.message : 'Failed to preview voice')
    } finally {
      setPreviewingVoice(false)
    }
  }

  const selectedStructureItem = selectedStructureItemId
    ? structureItems.find((item) => item.id === selectedStructureItemId) ?? null
    : null
  const responseWindowContext = selectedStructureItem?.kind === 'SESSION'
    ? selectedStructureItem.startsAt && selectedStructureItem.endsAt
      ? { label: selectedStructureItem.name, startsAt: selectedStructureItem.startsAt, endsAt: selectedStructureItem.endsAt, timezone: selectedStructureItem.timezone }
      : null
    : event?.startDate && event?.endDate
      ? { label: event.name, startsAt: event.startDate, endsAt: event.endDate, timezone: event.location?.timezone }
      : null

  const trimmedQuestionCount = questions.filter((question) => question.text.trim().length > 0).length

  const validateStep = (target: StepNumber): string | null => {
    if (target >= 2) {
      if (!collectionPhase) {
        return 'Choose when this survey will be collected.'
      }
      if (!surveyName.trim()) {
        return 'Survey name is required.'
      }
      if (trimmedQuestionCount === 0) {
        return 'At least one question is required.'
      }
    }
    return null
  }

  const handleContinue = () => {
    const error = validateStep((step + 1) as StepNumber)
    if (error) {
      setFormError(error)
      return
    }
    setFormError(null)
    setStep((current) => (current < 2 ? ((current + 1) as StepNumber) : current))
  }

  const handleBack = () => {
    setFormError(null)
    setStep((current) => (current > 1 ? ((current - 1) as StepNumber) : current))
  }

  const handleCreateSurvey = async () => {
    if (!accountSlug || !eventId || creating) return

    const stepError = validateStep(2)
    if (stepError) {
      setFormError(stepError)
      return
    }

    // The launch context identifies the destination. The canonical builder
    // validates it server-side before creating any survey or link.
    const createSurveyPayload = buildEventVoiceSurveyCreatePayload({
      selectedSurveyStructureItemId: preselectedSpeakerId ? '' : selectedStructureItemId,
      targetCategory: preselectedSpeakerId ? 'SPEAKER' : 'EVENT',
      targetName: preselectedSpeakerId ? speakerTarget?.name ?? '' : targetName,
      targetDescription: '',
      surveyName,
      surveyDescription,
      ttsProvider,
      ttsVoice,
      defaultTtsLocale: DEFAULT_TTS_LOCALE_LITERAL,
      responseMode,
      questions,
    })
    if (preselectedTargetId) {
      ;(createSurveyPayload as Record<string, unknown>).surveyTargetId = preselectedTargetId
      ;(createSurveyPayload as Record<string, unknown>).eventStructureItemId = undefined
      ;(createSurveyPayload as Record<string, unknown>).targetCategory = undefined
      ;(createSurveyPayload as Record<string, unknown>).targetName = undefined
    }
    if (preselectedSpeakerId) {
      ;(createSurveyPayload as Record<string, unknown>).speakerId = preselectedSpeakerId
      ;(createSurveyPayload as Record<string, unknown>).targetCategory = 'SPEAKER'
      ;(createSurveyPayload as Record<string, unknown>).targetName = undefined
      ;(createSurveyPayload as Record<string, unknown>).eventStructureItemId = undefined
    }
    if (isBulkSessionSurvey) {
      ;(createSurveyPayload as Record<string, unknown>).sessionIds = bulkSessionIds
      ;(createSurveyPayload as Record<string, unknown>).eventStructureItemId = undefined
      ;(createSurveyPayload as Record<string, unknown>).targetCategory = undefined
      ;(createSurveyPayload as Record<string, unknown>).targetName = undefined
    }

    try {
      setCreating(true)
      setFormError(null)
      const creationRequestId = createRequestIdRef.current ?? crypto.randomUUID()
      createRequestIdRef.current = creationRequestId

      const response = await fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createSurveyPayload, collectionPhase, availability, creationRequestId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || 'Failed to create survey')
      }

      const createdSurveyId = body.data?.survey?.id as string | undefined
      createRequestIdRef.current = null
      // Creation produces a draft; publishing and deployment stay deliberate
      // post-create actions on the survey destination.
      router.push(createdSurveyId ? surveyEditPath(createdSurveyId) : surveysPath)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create survey')
      setCreating(false)
    }
  }

  const voiceOptions = getVoiceSelectOptions(ttsVoice)
  const selectedVoiceLabel = voiceOptions.find((option) => option.value === ttsVoice)?.label ?? ttsVoice
  const targetLabel = isBulkSessionSurvey
    ? `${bulkSessionIds.length} sessions`
    : preselectedSpeakerId
      ? speakerTarget?.name ? `Speaker: ${speakerTarget.name}` : 'Selected speaker'
    : preselectedTargetId
      ? preselectedTargetName || 'Selected target'
      : selectedStructureItem
        ? `${formatStructureKind(selectedStructureItem.kind)}: ${selectedStructureItem.name}`
        : 'Overall Event'
  const scheduleUnavailableReason = selectedStructureItem?.kind === 'SESSION'
    ? selectedStructureItem.startsAt && !selectedStructureItem.endsAt
      ? 'Add an end time to this session to use this option.'
      : !selectedStructureItem.startsAt && selectedStructureItem.endsAt
        ? 'Add a start time to this session to use this option.'
        : 'Add a start and end time to this session to use this option.'
    : event?.startDate && !event?.endDate
      ? 'Add an event end date to use this option.'
      : !event?.startDate && event?.endDate
        ? 'Add an event start date to use this option.'
        : 'Add event start and end dates to use this option.'

  if (loading) {
    return (
      <AdminLayout homePath={accountPath}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-zinc-500 dark:text-zinc-400">Loading survey setup...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (loadError || !event) {
    return (
      <AdminLayout homePath={accountPath}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <EventCard className="max-w-md">
            <div className="text-center">
              <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Event Not Found
              </h1>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">{loadError}</p>
              <Button onClick={() => router.push(accountPath)}>Back to Events</Button>
            </div>
          </EventCard>
        </div>
      </AdminLayout>
    )
  }

  const isSimpleEvent = event.eventType === 'BLANK'

  if (isSimpleEvent && !existingSurveyId && !startFromScratch) {
    return (
      <AdminLayout homePath={accountPath}>
        <SimpleEventSurveyStartingPoint
          eventId={eventId}
          accountSlug={accountSlug ?? ''}
          onStartFromScratch={() => {
            const query = new URLSearchParams()
            if (accountSlug) query.set('account', accountSlug)
            query.set('scratch', '1')
            if (simpleCreationFlow) query.set('simpleCreation', '1')
            router.push(`/app/events/${eventId}/surveys/new?${query.toString()}`)
          }}
          onTemplateCreated={(surveyId) => {
            const query = new URLSearchParams()
            if (accountSlug) query.set('account', accountSlug)
            query.set('survey', surveyId)
            if (simpleCreationFlow) query.set('simpleCreation', '1')
            router.push(`/app/events/${eventId}/surveys/new?${query.toString()}`)
          }}
        />
      </AdminLayout>
    )
  }

  if (event.eventType === 'ADVANCED' || isSimpleEvent) {
    return (
      <AdminLayout homePath={accountPath}>
        <AdvancedEventSurveyBuilder
          accountSlug={accountSlug ?? ''}
          event={event}
          surveysPath={surveysPath}
          structureItems={structureItems}
          initialSurveyId={existingSurveyId}
          isSimpleEvent={isSimpleEvent}
          simpleCreationFlow={simpleCreationFlow}
          simpleStartingPointPath={simpleStartingPointPath}
        />
      </AdminLayout>
    )
  }

  return (
    <AdminLayout homePath={accountPath}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <a
            href={surveysPath}
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-blue-700 dark:text-zinc-400 dark:hover:text-blue-300"
          >
            ← Back to Surveys
          </a>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">New Survey</h1>
          <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">{targetLabel}</span>
        </div>

        {/* Stepper: full labels on desktop, compact progress on mobile. */}
        <nav aria-label="Survey creation steps">
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 sm:hidden">
            Step {step} of {STEPS.length}
          </p>
          <ol className="hidden items-center gap-2 sm:flex">
            {STEPS.map((stepOption, index) => {
              const isActive = stepOption.number === step
              const isComplete = stepOption.number < step
              return (
                <li key={stepOption.number} className="flex items-center gap-2">
                  {index > 0 && <span aria-hidden="true" className="h-px w-8 bg-slate-300 dark:bg-zinc-700" />}
                  <span
                    aria-current={isActive ? 'step' : undefined}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      isActive
                        ? 'text-blue-700 dark:text-blue-300'
                        : isComplete
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-slate-400 dark:text-zinc-500'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                        isActive
                          ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40'
                          : isComplete
                            ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40'
                            : 'border-slate-300 dark:border-zinc-700'
                      }`}
                      aria-hidden="true"
                    >
                      {isComplete ? '✓' : stepOption.number}
                    </span>
                    {stepOption.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </nav>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {formError}
          </div>
        )}

        {step === 1 && (
          <EventCard padding="md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Survey</h2>

            <div className="mt-4">
              <label htmlFor="new-survey-name" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Survey name
              </label>
              <input
                id="new-survey-name"
                value={surveyName}
                onChange={(currentEvent) => setSurveyName(currentEvent.target.value)}
                placeholder="Opening Keynote Feedback"
                className={inputClass}
              />
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">When will responses be collected?</legend>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">This phase is copied to every response and is never inferred from event dates.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {COLLECTION_PHASE_OPTIONS.map((option) => <label key={option.value} className={`cursor-pointer rounded-lg border p-3 ${collectionPhase === option.value ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30' : 'border-zinc-200 dark:border-zinc-800'}`}><input type="radio" name="collection-phase" value={option.value} checked={collectionPhase === option.value} onChange={() => setCollectionPhase(option.value)} className="sr-only" /><span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{option.label}</span><span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{option.description}</span></label>)}
              </div>
            </fieldset>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <QuestionBuilder
                questions={questions}
                onChange={setQuestions}
                enableMixedTypes
                enablePresenterRatingTarget={selectedStructureItem?.kind === 'SESSION'}
                surveyName={surveyName}
                description={`${event.name}. ${surveyDescription || preselectedTargetName || selectedStructureItem?.name || targetName}`}
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

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowAdvancedDetails((current) => !current)}
                aria-expanded={showAdvancedDetails}
                className="text-xs font-semibold text-blue-700 transition-colors hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
              >
                {showAdvancedDetails ? 'Hide advanced details' : 'Advanced details'}
              </button>
              {showAdvancedDetails && (
                <div className="mt-2">
                  <label htmlFor="new-survey-description" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Survey description
                  </label>
                  <input
                    id="new-survey-description"
                    value={surveyDescription}
                    onChange={(currentEvent) => setSurveyDescription(currentEvent.target.value)}
                    placeholder="Optional internal context for this survey"
                    className={inputClass}
                  />
                </div>
              )}
            </div>

          </EventCard>
        )}

        {step === 2 && (
          <EventCard padding="md">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Response method &amp; review</h2>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <label htmlFor="new-survey-response-method" className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">Response method</label>
              <select
                id="new-survey-response-method"
                value={responseMode}
                onChange={(currentEvent) => setResponseMode(currentEvent.target.value as typeof responseMode)}
                disabled={creating}
                className={`${inputClass} mt-2`}
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

            <div className="mt-4">
              <SurveyAvailabilityEditor
                value={availability}
                onChange={setAvailability}
                scheduleContext={responseWindowContext}
                scheduleUnavailableReason={scheduleUnavailableReason}
                disabled={creating}
              />
            </div>

            {responseMode !== 'TEXT_ONLY' && <div className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Survey voice
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
            </div>}

            {responseMode !== 'TEXT_ONLY' && showVoiceOptions && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="new-survey-tts-gender" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Gender
                    </label>
                    <select
                      id="new-survey-tts-gender"
                      value={ttsGender}
                      onChange={(currentEvent) => handleGenderChange(currentEvent.target.value as TtsVoiceGender)}
                      disabled={creating || previewingVoice}
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
                    <label htmlFor="new-survey-tts-voice" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Voice
                    </label>
                    <select
                      id="new-survey-tts-voice"
                      value={ttsVoice}
                      onChange={(currentEvent) => handleVoiceChange(currentEvent.target.value)}
                      disabled={creating || previewingVoice}
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
                    disabled={creating || previewingVoice}
                  >
                    {previewingVoice ? 'Previewing Voice...' : 'Preview Voice'}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Review</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Target</dt>
                  <dd className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {targetLabel}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Survey name</dt>
                  <dd className="font-semibold text-zinc-900 dark:text-zinc-100">{surveyName.trim() || 'Untitled'}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Collection phase</dt>
                  <dd className="font-semibold text-zinc-900 dark:text-zinc-100">{COLLECTION_PHASE_OPTIONS.find((option) => option.value === collectionPhase)?.label ?? 'Not selected'}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Questions</dt>
                  <dd className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {trimmedQuestionCount} question{trimmedQuestionCount === 1 ? '' : 's'}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Response method</dt>
                  <dd className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {responseMode === 'VOICE_AND_TEXT' ? 'Let attendee choose' : responseMode === 'TEXT_ONLY' ? 'Text' : 'Voice'}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                The survey is created as a draft. Publish it from the survey page when you are ready to launch.
              </p>
            </div>
          </EventCard>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(surveysPath)}
            disabled={creating}
          >
            Cancel
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {step > 1 && (
              <Button type="button" variant="secondary" onClick={handleBack} disabled={creating}>
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button type="button" onClick={handleContinue}>
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={handleCreateSurvey} disabled={creating}>
                {creating ? 'Creating...' : 'Create Survey'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default function NewEventSurveyPage() {
  return (
    <Suspense fallback={
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-zinc-500 dark:text-zinc-400">Loading survey setup...</p>
          </div>
        </div>
      </AdminLayout>
    }>
      <NewEventSurveyContent />
    </Suspense>
  )
}
