'use client'

import { useState } from 'react'
import { getConsentBulletGlyph, normalizeConsentBulletStyle } from '@/lib/consent-bullet-style'
import type { AttendeeResponseMode } from '@/lib/response-mode'

interface Branding {
  logoUrl?: string | null
  primaryColor?: string | null
  primaryButtonColor?: string | null
}

interface Consent {
  title: string
  subtitle: string
  items: string[]
  buttonText: string
  bulletStyle?: string | null
}

interface ConsentScreenProps {
  onAccept: (selection?: { responseMode?: AttendeeResponseMode; presentationMode?: 'SCREEN' | 'READ_ALOUD' }) => void
  isLoading?: boolean
  error?: string | null
  eventId?: string | null
  branding?: Branding | null
  consent?: Consent | null
  /** From event; adjusts default bullets when not heavily customized */
  responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  presentationMode?: 'SCREEN' | 'READ_ALOUD' | 'ATTENDEE_CHOOSES'
  /** Builder preview uses the canonical consent content before showing choices on the next screen. */
  showExperienceChoices?: boolean
  responseChoiceTiming?: 'START' | 'PER_QUESTION'
  contextLabel?: string | null
  surveyIntro?: string | null
}

const DEFAULT_CONSENT: Consent = {
  title: "SignalThread",
  subtitle: "We'd love to hear from you",
  items: [
    "Answer a few questions by voice",
    "Takes just a few minutes",
    "We'll ask for microphone access",
    "Your responses stay anonymous",
  ],
  buttonText: "I Agree, Let's Start",
  bulletStyle: 'CHECKMARK',
}

const TEXT_ONLY_ITEMS = [
  'Answer one question at a time in your own words',
  'Takes just a few minutes',
  'Type your responses — no microphone needed',
  'Your responses stay anonymous',
]

const VOICE_AND_TEXT_ITEMS = [
  'Answer one question at a time',
  'Choose whether to speak or type your answers',
  'We only ask for microphone access if you choose to speak',
  'Your responses stay anonymous',
]

export type AttendeeExperienceSelection = {
  responseMode?: AttendeeResponseMode
  presentationMode?: 'SCREEN' | 'READ_ALOUD'
}

/** Shared attendee-start choice controls for the kiosk and the builder preview. */
export function AttendeeExperienceChoice({
  responseMode,
  presentationMode,
  selection,
  onChange,
}: {
  responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  presentationMode: 'SCREEN' | 'READ_ALOUD' | 'ATTENDEE_CHOOSES'
  selection: AttendeeExperienceSelection
  onChange: (selection: AttendeeExperienceSelection) => void
}) {
  const attendeeChoosesResponse = responseMode === 'VOICE_AND_TEXT'
  const attendeeChoosesPresentation = presentationMode === 'ATTENDEE_CHOOSES'

  if (attendeeChoosesResponse && attendeeChoosesPresentation) return <fieldset className="mx-auto mt-7 w-full max-w-xl" aria-describedby="experience-choice-help"><legend className="text-center text-lg font-bold text-gray-900">How would you like to take this survey?</legend><p id="experience-choice-help" className="mt-1 text-center text-sm text-gray-500">Choose one experience for this survey.</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{([['READ_ALOUD', 'VOICE_ONLY', 'Speak with me', 'Questions are read aloud and you can speak your answers.'], ['SCREEN', 'TEXT_ONLY', 'Read & type', 'Read questions on screen and type your answers.']] as const).map(([nextPresentationMode, nextResponseMode, label, description]) => { const selected = selection.presentationMode === nextPresentationMode && selection.responseMode === nextResponseMode; return <button key={label} type="button" role="radio" aria-checked={selected} onClick={() => onChange({ presentationMode: nextPresentationMode, responseMode: nextResponseMode })} className={`rounded-2xl border-2 px-4 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${selected ? 'border-gray-900 bg-gray-900 text-white shadow-md' : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400'}`}><span className="block text-base font-semibold">{label}</span><span className={`mt-1 block text-sm ${selected ? 'text-gray-200' : 'text-gray-500'}`}>{description}</span></button> })}</div></fieldset>

  if (attendeeChoosesPresentation) return <fieldset className="mx-auto mt-7 w-full max-w-xl" aria-describedby="presentation-choice-help"><legend className="text-center text-lg font-bold text-gray-900">How would you like questions presented?</legend><p id="presentation-choice-help" className="mt-1 text-center text-sm text-gray-500">Choose one presentation for this survey.</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{([['READ_ALOUD', 'Read aloud', 'Hear each question while it stays visible.'], ['SCREEN', 'Read on screen', 'Read each question at your own pace.']] as const).map(([mode, label, description]) => <button key={mode} type="button" role="radio" aria-checked={selection.presentationMode === mode} onClick={() => onChange({ ...selection, presentationMode: mode })} className={`rounded-2xl border-2 px-4 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${selection.presentationMode === mode ? 'border-gray-900 bg-gray-900 text-white shadow-md' : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400'}`}><span className="block text-base font-semibold">{label}</span><span className={`mt-1 block text-sm ${selection.presentationMode === mode ? 'text-gray-200' : 'text-gray-500'}`}>{description}</span></button>)}</div></fieldset>

  if (attendeeChoosesResponse) return <fieldset className="mx-auto mt-7 w-full max-w-xl" aria-describedby="response-method-help"><legend className="text-center text-lg font-bold text-gray-900">How would you like to respond?</legend><p id="response-method-help" className="mt-1 text-center text-sm text-gray-500">Choose one method for this survey.</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{([['VOICE_ONLY', 'Speak my answers', 'Use your microphone to record each answer.'], ['TEXT_ONLY', 'Type my answers', 'Write each answer on screen.']] as const).map(([mode, label, description]) => <button key={mode} type="button" role="radio" aria-checked={selection.responseMode === mode} onClick={() => onChange({ ...selection, responseMode: mode })} className={`rounded-2xl border-2 px-4 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${selection.responseMode === mode ? 'border-gray-900 bg-gray-900 text-white shadow-md' : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400'}`}><span className="block text-base font-semibold">{label}</span><span className={`mt-1 block text-sm ${selection.responseMode === mode ? 'text-gray-200' : 'text-gray-500'}`}>{description}</span></button>)}</div></fieldset>

  return null
}

export function ConsentScreen({ onAccept, isLoading, error, branding, consent, responseMode = 'VOICE_ONLY', presentationMode = 'READ_ALOUD', showExperienceChoices = true, responseChoiceTiming = 'START', contextLabel, surveyIntro }: ConsentScreenProps) {
  const c = consent || DEFAULT_CONSENT
  const primaryButtonColor = branding?.primaryButtonColor || undefined
  const primaryColor = branding?.primaryColor || undefined
  const bulletStyle = normalizeConsentBulletStyle(c.bulletStyle)
  const bulletGlyph = getConsentBulletGlyph(bulletStyle)
  const [selectedResponseMode, setSelectedResponseMode] = useState<AttendeeResponseMode | null>(null)
  const [selectedPresentationMode, setSelectedPresentationMode] = useState<'SCREEN' | 'READ_ALOUD' | null>(null)
  const attendeeChooses = responseMode === 'VOICE_AND_TEXT' && responseChoiceTiming === 'START'
  const attendeeChoosesPresentation = presentationMode === 'ATTENDEE_CHOOSES'

  const items =
    responseMode === 'TEXT_ONLY'
      ? TEXT_ONLY_ITEMS
      : responseMode === 'VOICE_AND_TEXT'
        ? VOICE_AND_TEXT_ITEMS
        : c.items

  return (
    <div className="min-h-[100svh] bg-white flex flex-col">
      {/* Sticky logo header */}
      {branding?.logoUrl && (
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-6 py-4">
          <div className="mx-auto max-w-3xl flex items-center justify-center">
            <img
              src={branding.logoUrl}
              alt="Logo"
              className="max-h-14 max-w-[220px] w-auto object-contain object-center"
              style={{ maxHeight: 56 }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 mx-auto flex min-h-0 w-full max-w-3xl flex-col px-6 pb-8 pt-6 sm:px-10 sm:pt-8">
        <div className="text-center">
          {!branding?.logoUrl && (
            <div className="mx-auto mb-6 flex items-center justify-center">
              <img src="/brand/logov2.png" alt="Logo" className="max-h-10 max-w-[180px] w-auto object-contain object-center" />
            </div>
          )}

          {contextLabel && <p className="mx-auto mb-4 w-fit rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{contextLabel}</p>}

          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            {c.title}
          </h1>
          <p className="mt-2 text-sm text-gray-500 sm:text-base">
            {c.subtitle}
          </p>
          {surveyIntro && <p data-testid="survey-intro" className="mx-auto mt-4 max-w-xl text-base leading-6 text-gray-700">{surveyIntro}</p>}
        </div>

        <div className="mt-6 sm:mt-8">
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-800 sm:text-base">{error}</p>
            </div>
          )}

          <div className="mx-auto w-full max-w-xl space-y-3 sm:space-y-4">
            {items.map((item, index) => (
              <div key={index} className={`flex items-start ${bulletGlyph ? 'gap-4' : ''}`}>
                {bulletGlyph && (
                  <span
                    data-testid={`consent-bullet-${bulletStyle.toLowerCase()}`}
                    className={bulletStyle === 'CHECKMARK'
                      ? 'mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white'
                      : 'mt-0.5 inline-flex h-6 w-6 items-center justify-center text-lg font-bold'}
                    style={bulletStyle === 'CHECKMARK'
                      ? { backgroundColor: primaryColor || '#059669' }
                      : { color: primaryColor || '#059669' }}
                  >
                    {bulletGlyph}
                  </span>
                )}
                <p className="text-base text-gray-700 sm:text-lg">{item}</p>
              </div>
            ))}
          </div>

          {showExperienceChoices && <AttendeeExperienceChoice responseMode={responseChoiceTiming === 'PER_QUESTION' ? 'VOICE_ONLY' : responseMode} presentationMode={presentationMode} selection={{ responseMode: selectedResponseMode ?? undefined, presentationMode: selectedPresentationMode ?? undefined }} onChange={(selection) => { setSelectedResponseMode(selection.responseMode ?? null); setSelectedPresentationMode(selection.presentationMode ?? null) }} />}
        </div>

        <div className="mt-8 pt-4">
          <div className="mx-auto w-full max-w-xl">
            <button
              onClick={() => onAccept({ responseMode: selectedResponseMode ?? undefined, presentationMode: selectedPresentationMode ?? undefined })}
              disabled={isLoading || (showExperienceChoices && attendeeChooses && !selectedResponseMode) || (showExperienceChoices && attendeeChoosesPresentation && !selectedPresentationMode)}
              className={`w-full rounded-2xl px-8 py-5 text-base font-semibold shadow-lg transition sm:text-lg ${
                isLoading || (showExperienceChoices && attendeeChooses && !selectedResponseMode) || (showExperienceChoices && attendeeChoosesPresentation && !selectedPresentationMode)
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'text-white hover:opacity-95'
              }`}
              style={
                !isLoading
                  ? { backgroundColor: primaryButtonColor || '#059669' }
                  : undefined
              }
            >
              {isLoading ? 'Loading…' : c.buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
