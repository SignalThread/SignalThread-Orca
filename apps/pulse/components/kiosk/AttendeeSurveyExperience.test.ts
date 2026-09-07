import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/kiosk/AttendeeSurveyExperience.tsx', 'utf8')
const kioskSource = readFileSync('app/kiosk/page.tsx', 'utf8')
const organizerPreviewSource = readFileSync('components/kiosk/OrganizerSurveyPreview.tsx', 'utf8')

describe('AttendeeSurveyExperience', () => {
  it('is the single canonical attendee renderer for start and question screens', () => {
    expect(source).toContain("import { ConsentScreen } from '@/components/kiosk/ConsentScreen'")
    expect(source).toContain("import { KioskQuestionViewport } from '@/components/kiosk/KioskQuestionViewport'")
    expect(source).toContain("screen: 'START' | 'QUESTION'")
    expect(source).toContain("if (screen === 'START')")
    expect(source).toContain('<ConsentScreen')
    expect(source).toContain('<KioskQuestionViewport')
  })

  it('keeps preview mode limited to the existing inert question-card path', () => {
    expect(source).toContain('preview={preview}')
    expect(source).not.toContain('/api/response/create')
    expect(source).not.toContain('fetch(')
  })

  it('does not pass question content or Additional text into the T&C screen', () => {
    const startBranch = source.match(/if \(screen === 'START'\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''
    expect(startBranch).toContain('<ConsentScreen')
    expect(startBranch).not.toContain('currentQuestion')
  })

  it('is reached by both the live kiosk and organizer preview instead of duplicating attendee markup', () => {
    expect(kioskSource).toContain("import { AttendeeSurveyExperience } from '@/components/kiosk/AttendeeSurveyExperience'")
    expect(kioskSource).toContain('<AttendeeSurveyExperience')
    expect(organizerPreviewSource).toContain("import { AttendeeSurveyExperience } from '@/components/kiosk/AttendeeSurveyExperience'")
    expect(organizerPreviewSource).toContain('<AttendeeSurveyExperience')
    expect(organizerPreviewSource).not.toContain('<ConsentScreen')
    expect(organizerPreviewSource).not.toContain('<KioskQuestionViewport')
  })
})
