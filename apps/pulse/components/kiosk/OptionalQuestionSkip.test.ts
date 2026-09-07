import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const audioSource = read('components/kiosk/AudioRecorder.tsx')
const textSource = read('components/kiosk/TextAnswerCard.tsx')

describe('optional kiosk question skip controls', () => {
  it('shows the secondary skip action only for optional voice questions', () => {
    expect(audioSource).toContain('onSkip?: () => void | Promise<void>')
    expect(audioSource).toContain('!currentQuestion.isRequired && onSkip')
    expect(audioSource).toContain('Skip this question')
  })

  it('shows the same secondary action only for optional typed questions', () => {
    expect(textSource).toContain('onSkip: () => Promise<void> | void')
    expect(textSource).toContain('!currentQuestion.isRequired')
    expect(textSource).toContain('Skip this question')
  })
})
