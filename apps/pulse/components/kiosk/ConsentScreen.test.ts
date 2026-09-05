import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/kiosk/ConsentScreen.tsx', 'utf8')

describe('ConsentScreen bullet rendering', () => {
  it('renders backend-resolved survey target context when provided', () => {
    expect(source).toContain('{contextLabel &&')
    expect(source).toContain('{contextLabel}</p>')
  })

  it('renders the survey-specific intro once without replacing account consent copy', () => {
    expect(source).toContain('surveyIntro?: string | null')
    expect(source).toContain('data-testid="survey-intro"')
    expect(source.match(/\{surveyIntro\}/g)).toHaveLength(1)
    expect(source).toContain('{c.subtitle}')
    expect(source).toContain('{items.map((item, index)')
  })

  it('uses the shared saved bullet-style resolver with the legacy checkmark default', () => {
    expect(source).toContain("import { getConsentBulletGlyph, normalizeConsentBulletStyle } from '@/lib/consent-bullet-style'")
    expect(source).toContain("bulletStyle: 'CHECKMARK'")
    expect(source).toContain('const bulletStyle = normalizeConsentBulletStyle(c.bulletStyle)')
    expect(source).toContain('const bulletGlyph = getConsentBulletGlyph(bulletStyle)')
  })

  it('uses the brand accent for every visible style and keeps None aligned without a bullet', () => {
    expect(source).toContain("data-testid={`consent-bullet-${bulletStyle.toLowerCase()}`}")
    expect(source).toContain("primaryColor || '#059669'")
    expect(source).toContain("bulletGlyph ? 'gap-4' : ''")
  })

  it('shows only the attendee choices delegated by the survey and keeps Start disabled until selected', () => {
    expect(source).toContain('export function AttendeeExperienceChoice')
    expect(source).toContain("const attendeeChoosesResponse = responseMode === 'VOICE_AND_TEXT'")
    expect(source).toContain("const attendeeChoosesPresentation = presentationMode === 'ATTENDEE_CHOOSES'")
    expect(source).toContain('How would you like to respond?')
    expect(source).toContain('Speak my answers')
    expect(source).toContain('Type my answers')
    expect(source).toContain('Speak with me')
    expect(source).toContain('Read & type')
    expect(source).toContain('aria-checked={selection.responseMode === mode}')
    expect(source).toContain('showExperienceChoices = true')
    expect(source).toContain('(showExperienceChoices && attendeeChoosesPresentation && !selectedPresentationMode)')
    expect(source).toContain('onAccept({ responseMode: selectedResponseMode ?? undefined, presentationMode: selectedPresentationMode ?? undefined })')
  })

  it('does not create an experience-choice step for organizer-set Voice-first settings', () => {
    expect(source).toContain("const attendeeChooses = responseMode === 'VOICE_AND_TEXT'")
    expect(source).toContain("const attendeeChoosesPresentation = presentationMode === 'ATTENDEE_CHOOSES'")
    expect(source).toContain('if (attendeeChoosesResponse && attendeeChoosesPresentation)')
    expect(source).toContain('if (attendeeChoosesPresentation)')
    expect(source).toContain('if (attendeeChoosesResponse)')
  })
})
