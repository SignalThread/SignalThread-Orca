import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component = readFileSync('components/events/EventSpeakersIntelligence.tsx', 'utf8')
const dashboard = readFileSync('app/app/events/[eventId]/dashboard/page.tsx', 'utf8')
const agenda = readFileSync('components/events/EventAgendaWorkspace.tsx', 'utf8')
const service = readFileSync('lib/event-speaker-intelligence.ts', 'utf8')

describe('EventSpeakersIntelligence', () => {
  it('is URL-backed through the Intelligence speaker scope', () => {
    expect(component).toContain("query.set('tab', 'intelligence')")
    expect(component).toContain("query.set('intelligenceScope', 'speakers')")
    expect(component).toContain("searchParams.get('speakerId')")
    expect(component).toContain("searchParams.get('speakerView')")
    expect(dashboard).toContain("['speakers', 'Speakers']")
    expect(dashboard).toContain('<EventSpeakersIntelligence')
  })

  it('uses the approved compact speaker hierarchy and keeps operational evidence behind Filters', () => {
    for (const label of ['All', 'Needs attention', 'Strong', 'Needs more feedback', 'Praised for', 'Coaching', 'Speaker responses']) {
      expect(component).toContain(label)
    }
    expect(component).toContain('Speaker status legend')
    expect(component).toContain('Operational evidence states stay separate from performance interpretation.')
    expect(component).toContain('Directional evidence')
    expect(component).toContain('No speaker question')
    expect(component).toContain('speaker.responseCount')
    expect(component).toContain('Performance dimensions')
    expect(service).toContain('buildEventEvidenceModel')
    expect(component).toContain('Findings use analyzed supporting responses')
    expect(component).toContain('Speaker · supporting evidence')
    expect(component).toContain("if (state === 'DIRECTIONAL') return 'attention'")
    expect(component).toContain("return 'lifecycle'")
    expect(component).toContain('function speakerDisplayState')
    expect(component).toContain('function speakerStatusPresentation')
    expect(component).toContain('event-speaker-row-button')
    expect(component).toContain('grid-cols-[2px_2rem_minmax(0,1fr)_auto_1rem]')
    expect(component).toContain('data-testid="speaker-intelligence-row-summary"')
    expect(component).not.toContain('View speaker intelligence')
    expect(component).not.toContain('With speaker evidence')
    expect(component).not.toContain('xl:grid-cols-[48px')
  })

  it('scopes shared evidence by canonical speaker id inside the responsive detail drawer', () => {
    expect(component).toContain("speakerId: selectedSpeaker.id")
    expect(component).toContain('<EventThemeEvidencePanel')
    expect(component).toContain('<EventEvidenceDrawer')
    expect(component).toContain('w-[min(560px,100vw)]')
    expect(component).toContain('role="dialog"')
    expect(component).toContain('aria-label="Close speaker detail"')
  })

  it('deep-links to the exact canonical Setup speaker profile', () => {
    expect(component).toContain('operationsView=speakers&speakerId=')
    expect(component).toContain("query.set('tab', 'intelligence')")
    expect(component).toContain("query.set('sessionId', sessionId)")
    expect(agenda).toContain("searchParams.get('speakerId')")
    expect(agenda).toContain("query.set('speakerId', speaker.id)")
  })
})
