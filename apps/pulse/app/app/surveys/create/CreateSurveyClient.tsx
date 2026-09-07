'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { QuestionBuilder, Question } from '@/components/surveys/QuestionBuilder'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
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

interface Location {
    id: string
    name: string
    slug: string
}

export default function CreateSurveyClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const accountSlug = searchParams.get('account')

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [locations, setLocations] = useState<Location[]>([])
    const [loadingLocations, setLoadingLocations] = useState(true)
    const [showLocationForm, setShowLocationForm] = useState(false)

    // Form state
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [locationId, setLocationId] = useState('')
    const [questions, setQuestions] = useState<Question[]>([])
    const [ttsProvider, setTtsProvider] = useState(DEFAULT_TTS_PROVIDER)
    const [ttsGender, setTtsGender] = useState<TtsVoiceGender>(DEFAULT_TTS_GENDER)
    const [ttsVoice, setTtsVoice] = useState(DEFAULT_TTS_VOICE_LITERAL)
    const [responseMode, setResponseMode] = useState<'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'>('VOICE_ONLY')
    const [previewingVoice, setPreviewingVoice] = useState(false)
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null)

    // Location form state
    const [locationName, setLocationName] = useState('')
    const [locationAddress, setLocationAddress] = useState('')
    const [locationCity, setLocationCity] = useState('')
    const [locationState, setLocationState] = useState('')
    const [locationPostalCode, setLocationPostalCode] = useState('')
    const [creatingLocation, setCreatingLocation] = useState(false)

    // Load locations on mount
    useEffect(() => {
        fetchLocations()
    }, [])

    const fetchLocations = async () => {
        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            setLoadingLocations(false)
            return
        }

        try {
            setLoadingLocations(true)
            const response = await fetch(`/api/app/locations?account=${accountSlug}`, {
                credentials: 'include'
            })
            if (!response.ok) throw new Error('Failed to load locations/teams')

            const data = await response.json()
            setLocations(data.locations || [])

            // If no locations exist, show location form
            if (data.locations.length === 0) {
                setShowLocationForm(true)
            } else {
                setLocationId(data.locations[0].id)
            }
        } catch (err: any) {
            console.error('Failed to load locations/teams:', err)
            setError(err.message)
        } finally {
            setLoadingLocations(false)
        }
    }

    const handleCreateLocation = async () => {
        if (!locationName.trim()) {
            setError('Location/Team name is required')
            return
        }

        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            return
        }

        try {
            setCreatingLocation(true)
            setError(null)

            const response = await fetch(`/api/app/locations?account=${accountSlug}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: locationName,
                    address: locationAddress,
                    city: locationCity,
                    state: locationState,
                    postalCode: locationPostalCode
                })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to create location/team')
            }

            const data = await response.json()
            setLocations([data.location])
            setLocationId(data.location.id)
            setShowLocationForm(false)

            // Clear form
            setLocationName('')
            setLocationAddress('')
            setLocationCity('')
            setLocationState('')
            setLocationPostalCode('')
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCreatingLocation(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!accountSlug) {
            setError('Missing account parameter. Please navigate from the main app page.')
            return
        }

        if (!name.trim()) {
            setError('Survey name is required')
            return
        }

        if (!locationId) {
            setError('Please select or create a location/team')
            return
        }

        if (questions.length === 0) {
            setError('At least one question is required')
            return
        }

        if (questions.some(q => !q.text.trim())) {
            setError('All questions must have text')
            return
        }

        try {
            setLoading(true)

            const response = await fetch(`/api/app/events?account=${accountSlug}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description,
                    locationId,
                    ttsProvider,
                    ttsVoice,
                    ttsLocale: deriveLocaleFromVoice(ttsVoice, DEFAULT_TTS_LOCALE_LITERAL),
                    questions: questions.map(q => ({
                        id: q.id,
                        text: q.text,
                        order: q.order
                    })),
                    responseMode,
                })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to create survey')
            }

            const data = await response.json()

            // Redirect to app home
            router.push(`/app?account=${accountSlug}`)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
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
                    locale: deriveLocaleFromVoice(ttsVoice, DEFAULT_TTS_LOCALE_LITERAL),
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

    if (loadingLocations) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        )
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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Survey</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Set up a new survey to collect feedback
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
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
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                placeholder="e.g., Customer Satisfaction Survey"
                                required
                            />
                        </div>

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
                                placeholder="Optional description of what this survey is for..."
                            />
                        </div>
                    </div>

                    {/* Location/Team */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                        <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span>Location/Team <span className="text-red-500">*</span></span>
                            <InfoTooltip content={LOCATION_TEAM_TOOLTIP} />
                        </label>

                        {showLocationForm ? (
                            <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">Create Your Location/Team</p>

                                <div>
                                    <input
                                        type="text"
                                        value={locationName}
                                        onChange={(e) => setLocationName(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                        placeholder="Location/Team name *"
                                        required
                                    />
                                </div>

                                <div>
                                    <input
                                        type="text"
                                        value={locationAddress}
                                        onChange={(e) => setLocationAddress(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                        placeholder="Address"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <input
                                        type="text"
                                        value={locationCity}
                                        onChange={(e) => setLocationCity(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                        placeholder="City"
                                    />
                                    <input
                                        type="text"
                                        value={locationState}
                                        onChange={(e) => setLocationState(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                        placeholder="State"
                                    />
                                </div>

                                <div>
                                    <input
                                        type="text"
                                        value={locationPostalCode}
                                        onChange={(e) => setLocationPostalCode(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                        placeholder="Postal Code"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCreateLocation}
                                    disabled={creatingLocation}
                                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creatingLocation ? 'Creating...' : 'Create Location/Team'}
                                </button>
                            </div>
                        ) : (
                            <select
                                value={locationId}
                                onChange={(e) => setLocationId(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                required
                            >
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        )}
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
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
                            questions={questions}
                            onChange={setQuestions}
                            surveyName={name}
                            description={description}
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
                                    disabled={previewingVoice || loading}
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
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating...' : 'Create Survey'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
