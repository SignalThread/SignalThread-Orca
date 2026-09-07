type SurveyResponseMode = 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'

/** A compact, non-interactive organizer preview of the kiosk consent choice. */
export function SurveyResponseMethodPreview({ responseMode }: { responseMode: SurveyResponseMode }) {
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/40" data-testid="survey-response-method-preview">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Consent preview</p>
      {responseMode === 'VOICE_AND_TEXT' ? (
        <>
          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">How would you like to respond?</p>
          <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Attendee response method preview">
            <span className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-center text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">Speak my answers</span>
            <span className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-center text-xs font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">Type my answers</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          {responseMode === 'TEXT_ONLY'
            ? 'Attendees continue to a typed answer screen without microphone access.'
            : 'Attendees continue to the voice response experience.'}
        </p>
      )}
    </div>
  )
}
