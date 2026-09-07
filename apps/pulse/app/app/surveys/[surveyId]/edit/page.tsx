'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { QuestionBuilder, Question } from '@/components/surveys/QuestionBuilder'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import type { ResolvedEventQuestion } from '@/lib/question-read'
import {
    DEFAULT_TTS_GENDER,
    DEFAULT_TTS_LOCALE_LITERAL,
    DEFAULT_TTS_PROVIDER,
    DEFAULT_TTS_VOICE_LITERAL,
    type TtsVoiceGender,
    deriveGenderFromVoice,
    deriveLocaleFromVoice,
    getPreferredVoiceForGender,
    getVoiceSelectOptions,
    QUESTION_AUDIO_PREVIEW_TEXT,
    TTS_GENDER_OPTIONS,
} from '@/lib/tts-voices'

const LOCATION_TEAM_TOOLTIP =
    'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

interface Event {
    id: string
    name: string
    description: string | null
    status: string
    ttsProvider?: string
    ttsVoice?: string
    ttsLocale?: string
    responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
    questions?: ResolvedEventQuestion[]
    questionsJson: any
    location: {
        id: string
        name: string
    }
    _count: {
        responses: number
        answers?: number
    }
}

export default function EditSurveyPage({ params }: { params: { surveyId: string } }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const accountSlug = searchParams.get('account')

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [event, setEvent] = useState<Event | null>(null)

    // Form state
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [questions, setQuestions] = useState<Question[]>([])
    const [ttsProvider, setTtsProvider] = useState(DEFAULT_TTS_PROVIDER)
    const [ttsGender, setTtsGender] = useState<TtsVoiceGender>(DEFAULT_TTS_GENDER)
    const [ttsVoice, setTtsVoice] = useState(DEFAULT_TTS_VOICE_LITERAL)
    const [previewingVoice, setPreviewingVoice] = useState(false)
    const [responseMode, setResponseMode] = useState<'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'>('VOICE_ONLY')
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null)

    // Load event on mount
    useEffect(() => {
        fetchEvent()
    }, [params.surveyId])

    const fetchEvent = async () => {
        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            const response = await fetch(`/api/app/events/${params.surveyId}?account=${accountSlug}`, {
                credentials: 'include',
                cache: 'no-store',
            })
            if (!response.ok) throw new Error('Failed to load survey')

            const data = await response.json()
            setEvent(data.event)
            setName(data.event.name)
            setDescription(data.event.description || '')
            setTtsProvider(data.event.ttsProvider || DEFAULT_TTS_PROVIDER)
            setTtsVoice(data.event.ttsVoice || DEFAULT_TTS_VOICE_LITERAL)
            setTtsGender(deriveGenderFromVoice(data.event.ttsVoice || DEFAULT_TTS_VOICE_LITERAL))
            setResponseMode(data.event.responseMode || 'VOICE_ONLY')
            setQuestions(
                (data.event.questions || []).map((question: ResolvedEventQuestion) => ({
                    id: question.key,
                    text: question.label,
                    order: question.order,
                }))
            )
        } catch (err: any) {
            console.error('Failed to load survey:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setError(null)

        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            return
        }

        if (!name.trim()) {
            setError('Survey name is required')
            return
        }

        if (!event) {
            setError('Survey not loaded')
            return
        }

        const hasCollectedData =
            event._count.responses > 0 || (event._count.answers ?? 0) > 0
        const canEditQuestionsForSave = event.status !== 'ACTIVE' && !hasCollectedData

        if (canEditQuestionsForSave && questions.length === 0) {
            setError('At least one question is required')
            return
        }

        if (canEditQuestionsForSave && questions.some(q => !q.text.trim())) {
            setError('All questions must have text')
            return
        }

        try {
            setSaving(true)

            const payload: any = {
                ttsProvider,
                ttsVoice,
                ttsLocale: deriveLocaleFromVoice(ttsVoice, event.ttsLocale || DEFAULT_TTS_LOCALE_LITERAL),
                name: name.trim(),
            }

            if (event.status === 'DRAFT') {
                payload.description = description
            }

            if (canEditQuestionsForSave) {
                payload.questions = questions.map(q => ({
                    id: q.id,
                    text: q.text,
                    order: q.order
                }))
            }
            payload.responseMode = responseMode

            const response = await fetch(`/api/app/events/${params.surveyId}?account=${accountSlug}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save survey')
            }

            if (data.event) {
                setEvent((current) =>
                    current
                        ? {
                              ...current,
                              ...data.event,
                              location: data.event.location ?? current.location,
                              _count: data.event._count ?? current._count,
                              questions: data.event.questions ?? current.questions,
                              questionsJson: data.event.questionsJson ?? current.questionsJson,
                          }
                        : data.event,
                )
                setTtsProvider(data.event.ttsProvider || DEFAULT_TTS_PROVIDER)
                setTtsVoice(data.event.ttsVoice || DEFAULT_TTS_VOICE_LITERAL)
                setTtsGender(deriveGenderFromVoice(data.event.ttsVoice || DEFAULT_TTS_VOICE_LITERAL))
                setResponseMode(data.event.responseMode || 'VOICE_ONLY')
            }

            router.push(`/app?account=${accountSlug}`)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleGenderChange = (gender: 'female' | 'male') => {
        setTtsGender(gender)
        setTtsVoice(getPreferredVoiceForGender(gender))
    }

    const handleVoiceChange = (voice: string) => {
        setTtsVoice(voice)
        setTtsGender(deriveGenderFromVoice(voice))
    }

    const handlePreviewVoice = async () => {
        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            return
        }

        try {
            setPreviewingVoice(true)
            setError(null)

            const response = await fetch(`/api/app/question-audio/preview?account=${accountSlug}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: ttsProvider,
                    voice: ttsVoice,
                    locale: deriveLocaleFromVoice(ttsVoice, event?.ttsLocale || DEFAULT_TTS_LOCALE_LITERAL),
                    text: QUESTION_AUDIO_PREVIEW_TEXT,
                }),
            })

            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Failed to preview voice')
            }

            audioPreviewRef.current?.pause()
            const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`)
            audioPreviewRef.current = audio
            await audio.play()
        } catch (err: any) {
            setError(err.message || 'Failed to preview voice')
        } finally {
            setPreviewingVoice(false)
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            return
        }

        try {
            setSaving(true)
            setError(null)

            const response = await fetch(`/api/app/events/${params.surveyId}?account=${accountSlug}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to update survey status')
            }

            // Refresh event data
            await fetchEvent()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this survey? This action cannot be undone.')) {
            return
        }

        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            return
        }

        try {
            setSaving(true)
            setError(null)

            const response = await fetch(`/api/app/events/${params.surveyId}?account=${accountSlug}`, {
                method: 'DELETE',
                credentials: 'include'
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to delete survey')
            }

            router.push(`/app?account=${accountSlug}`)
        } catch (err: any) {
            setError(err.message)
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        )
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-4">Survey not found</p>
                    <button
                        onClick={() => router.push('/app')}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Return to home
                    </button>
                </div>
            </div>
        )
    }

    const isDraft = event.status === 'DRAFT'
    const isActive = event.status === 'ACTIVE'
    const isCompleted = event.status === 'COMPLETED'
    const hasCollectedData =
        event._count.responses > 0 || (event._count.answers ?? 0) > 0
    const canEditQuestions = !isActive && !hasCollectedData
    const questionsLocked = !canEditQuestions

    let questionLockMessage: string | undefined
    if (questionsLocked) {
        if (isActive && hasCollectedData) {
            questionLockMessage =
                'Questions cannot be edited while the survey is active or after responses have been collected. Duplicate this survey to make changes safely.'
        } else if (isActive) {
            questionLockMessage =
                'Questions cannot be edited while the survey is active. Stop the survey first to make changes.'
        } else {
            questionLockMessage =
                'Questions cannot be edited after responses have been collected. Duplicate this survey to make changes safely.'
        }
    }

    const voiceOptions = getVoiceSelectOptions(ttsVoice)

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => router.back()}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
                    >
                        ← Back
                    </button>

                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                    Edit Survey
                                </h1>
                                <span className={`
                  px-3 py-1 rounded-full text-sm font-medium
                  ${isDraft ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' : ''}
                  ${isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''}
                  ${isCompleted ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}
                `}>
                                    {event.status}
                                </span>
                            </div>
                            <p className="mt-2 text-gray-600 dark:text-gray-400">
                                {event._count.responses} {event._count.responses === 1 ? 'response' : 'responses'}
                            </p>
                        </div>

                        {/* Status Actions */}
                        <div className="flex items-center gap-2">
                            {isDraft && (
                                <button
                                    onClick={() => handleStatusChange('ACTIVE')}
                                    disabled={saving}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Activate Survey
                                </button>
                            )}
                            {isActive && (
                                <button
                                    onClick={() => handleStatusChange('COMPLETED')}
                                    disabled={saving}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Close Survey
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}

                {/* Kiosk Link (Active only) */}
                {isActive && (
                    <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <label className="block text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                            Kiosk Link
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={`${window.location.origin}/kiosk?eventId=${event.id}`}
                                className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg text-sm"
                            />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/kiosk?eventId=${event.id}`)
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                )}

                {/* Form */}
                <div className="space-y-6">
                    {/* Survey Name */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Survey Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                                required
                            />
                        </div>

                        {isDraft && (
                            <div className="mt-4">
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Description
                                </label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                                />
                            </div>
                        )}
                    </div>

                    {/* Location/Team (Read-only) */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                        <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span>Location/Team</span>
                            <InfoTooltip content={LOCATION_TEAM_TOOLTIP} />
                        </label>
                        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <p className="text-gray-900 dark:text-white">{event.location.name}</p>
                        </div>
                    </div>

                    {/* Response mode */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                        <label htmlFor="responseMode" className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span>Response mode</span>
                            <InfoTooltip content="Choose how customers can respond to this survey. Voice is recommended for richer feedback." placement="top" />
                        </label>
                        <select
                            id="responseMode"
                            value={responseMode}
                            onChange={(e) => setResponseMode(e.target.value as typeof responseMode)}
                            disabled={saving}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <option value="VOICE_ONLY">Voice only</option>
                            <option value="TEXT_ONLY">Text only</option>
                            <option value="VOICE_AND_TEXT">Voice + text</option>
                        </select>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Choose how customers can respond to this survey.
                        </p>
                    </div>

                    {/* Questions */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                        <QuestionBuilder
                            questions={
                                questionsLocked
                                    ? (event.questions || []).map((q) => ({
                                          id: q.key,
                                          text: q.label,
                                          order: q.order
                                      }))
                                    : questions
                            }
                            onChange={questionsLocked ? () => {} : setQuestions}
                            disabled={questionsLocked}
                            disabledMessage={questionLockMessage}
                        />
                        <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Question Voice</h3>
                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                        Choose the voice used to read these questions aloud.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handlePreviewVoice}
                                    disabled={saving || previewingVoice}
                                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                    {previewingVoice ? 'Previewing Voice...' : 'Preview Voice'}
                                </button>
                            </div>

                            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                                Audio updates automatically when you save.
                            </p>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <div>
                                    <label htmlFor="tts-gender" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Gender
                                    </label>
                                    <select
                                        id="tts-gender"
                                        value={ttsGender}
                                        onChange={(e) => handleGenderChange(e.target.value as 'female' | 'male')}
                                        disabled={saving || previewingVoice}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        {TTS_GENDER_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="tts-voice" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Voice
                                    </label>
                                    <select
                                        id="tts-voice"
                                        value={ttsVoice}
                                        onChange={(e) => handleVoiceChange(e.target.value)}
                                        disabled={saving || previewingVoice}
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        {voiceOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
                        <div>
                            {isDraft && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={saving}
                                    className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Delete Survey
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                {isCompleted ? 'Close' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
