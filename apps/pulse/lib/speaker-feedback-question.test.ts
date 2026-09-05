import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEAKER_FEEDBACK_QUESTION, SPEAKER_NAME_TOKEN, resolveSpeakerFeedbackQuestionText } from './speaker-feedback-question'

const presenterRatingsCardSource = fs.readFileSync(
  path.join(process.cwd(), 'components/kiosk/PresenterRatingsCard.tsx'),
  'utf8',
)

describe('speaker feedback question text', () => {
  it('stores the dynamic token and resolves it only from the live runtime roster', () => {
    const liveRoster = [{ name: 'Ada Lovelace' }]

    expect(DEFAULT_SPEAKER_FEEDBACK_QUESTION).toBe(`How would you rate ${SPEAKER_NAME_TOKEN}?`)
    expect(DEFAULT_SPEAKER_FEEDBACK_QUESTION).not.toContain(liveRoster[0].name)
    expect(resolveSpeakerFeedbackQuestionText(DEFAULT_SPEAKER_FEEDBACK_QUESTION, liveRoster)).toBe('How would you rate Ada Lovelace?')
    expect(presenterRatingsCardSource).toContain('resolveSpeakerFeedbackQuestionText(questionText, speakers)')
    expect(presenterRatingsCardSource).toContain('{resolvedQuestionText}')
  })
})
