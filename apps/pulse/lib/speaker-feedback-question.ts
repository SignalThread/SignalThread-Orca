export const SPEAKER_NAME_TOKEN = '{speaker_name}'
export const DEFAULT_SPEAKER_FEEDBACK_QUESTION = `How would you rate ${SPEAKER_NAME_TOKEN}?`

/** Resolves the live roster only when the attendee-facing question is rendered. */
export function resolveSpeakerFeedbackQuestionText(questionText: string, speakers: Array<{ name: string }>): string {
  const names = speakers.map((speaker) => speaker.name.trim()).filter(Boolean)
  if (!questionText.includes(SPEAKER_NAME_TOKEN) || names.length === 0) return questionText
  const speakerName = names.length === 1 ? names[0] : names.join(' and ')
  return questionText.replaceAll(SPEAKER_NAME_TOKEN, speakerName)
}
