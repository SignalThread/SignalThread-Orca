import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatSessionFeedbackFooter, getSessionCollectionBadge } from '@/components/events/EventSessionsIntelligence'

const source = readFileSync('components/events/EventSessionsIntelligence.tsx', 'utf8')
const dashboardPageSource = readFileSync('app/app/events/[eventId]/dashboard/page.tsx', 'utf8')

describe('EventSessionsIntelligence setup language', () => {
  it('separates a missing survey from missing agenda details', () => {
    expect(source).toContain("{ key: 'needs-review', label: 'Missing details' }")
    expect(source).toContain("{ key: 'needs-survey', label: 'Needs survey' }")
    expect(source).toContain('Session details to complete')
    expect(source).not.toContain("NOT_SELECTED: 'No survey'")
  })

  it('makes the missing-survey next step explicit', () => {
    expect(source).toContain('Feedback is not set up for this session. Attach a survey when you want to collect feedback.')
    expect(source).toContain('Open in Setup')
  })

  it('renders the approved primary session states while retaining the operational filters', () => {
    for (const label of ['All', 'Needs attention', 'Strong', 'Needs more feedback']) {
      expect(source).toContain(label)
    }
    for (const label of ['Strong', 'Needs attention', 'Needs more feedback', 'No clear conclusion', 'Coverage']) {
      expect(source).toContain(label)
    }
    expect(source).toContain('sessionDisplayState')
    expect(source).toContain('insufficient current feedback is not a performance judgment')
    expect(source).toContain('Collection state, evidence thresholds, and missing agenda details remain available here.')
    expect(source).toContain('aria-label="Agenda sessions"')
  })

  it('supports search, URL-backed selection, keyboard buttons, and the responsive detail drawer', () => {
    expect(source).toContain('Search sessions, rooms, speakers')
    expect(source).toContain("searchParams.get('sessionId')")
    expect(source).toContain("query.set('tab', 'intelligence')")
    expect(source).toContain("query.set('intelligenceScope', 'sessions')")
    expect(source).toContain('aria-pressed={selectedSessionId === session.id}')
    expect(source).toContain('w-[min(560px,100vw)]')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-label="Close session detail"')
  })

  it('uses the compact shared scope, survey, and area control bar for Intelligence scopes that need it', () => {
    expect(dashboardPageSource).toContain("intelligenceScope !== 'sessions'")
    expect(dashboardPageSource).toContain("intelligenceScope !== 'event-areas' && intelligenceScope !== 'speakers'")
    expect(dashboardPageSource).toContain('label="Survey"')
    expect(dashboardPageSource).toContain('label="Area"')
    expect(dashboardPageSource).toContain('data-testid="intelligence-scope-controls"')
  })

  it('keeps content-driven compact session rows with a non-overlapping response region', () => {
    expect(source).toContain('data-testid="session-intelligence-row"')
    expect(source).toContain('data-testid="session-intelligence-row-summary"')
    expect(source).toContain('data-testid="session-intelligence-row-response"')
    expect(source).toContain('grid-cols-[2px_minmax(0,1fr)_auto_1rem]')
    expect(source).toContain('px-5 py-3.5')
    expect(source).toContain('self-stretch rounded-full')
    expect(source).not.toContain('min-h-[6rem]')
    expect(source).toContain('event-sessions-intelligence')
    expect(source).toContain('event-sessions-header')
    expect(source).toContain('event-sessions-controls')
    expect(source).toContain('Strong session')
    expect(source).toContain('Insufficient evidence')
    expect(source).toContain('Showing {visibleSessions.length} of {data.summary.agendaSessionCount} agenda sessions')
    expect(source).not.toContain('Session survey coverage')
    expect(source).not.toContain('xl:grid-cols-[minmax(0,1fr)_minmax(22rem,.72fr)]')
  })

  it('explains analysis coverage below the evidence threshold and opens canonical theme evidence', () => {
    expect(source).toContain('Findings use analyzed supporting responses')
    expect(source).toContain('eligible responses are analyzed')
    expect(source).toContain('selectedSession.hasEnoughEvidence ?')
    expect(source).toContain('selectedSession.listeningResponseCount')
    expect(source).toContain('<EventThemeEvidencePanel')
    expect(source).toContain('<EventEvidenceDrawer')
    expect(source).toContain('eventStructureItemId: selectedSession.id')
    expect(source).not.toContain('ref={evidenceRef}')
  })

  it('links session context back to canonical Setup, Survey, and Overview surfaces', () => {
    expect(source).toContain('&tab=operations&sessionId=')
    expect(source).toContain('Open in Setup')
    expect(source).toContain('Open survey')
    expect(source).toContain('&tab=intelligence&eventStructureItemId=')
  })

  it('labels each collection state from the existing current and historical payload fields', () => {
    const badgeFor = (overrides: Partial<{ selectedForListening: boolean; responseCount: number; listeningResponseCount: number }> = {}) => getSessionCollectionBadge({
      selectedForListening: false,
      responseCount: 0,
      listeningResponseCount: 0,
      ...overrides,
    }, 3)

    expect(badgeFor({ selectedForListening: true, listeningResponseCount: 3 })).toBeNull()
    expect(badgeFor({ selectedForListening: true, listeningResponseCount: 1 })).toEqual({ label: 'Underrepresented · 1 of 3 responses', tone: 'attention' })
    expect(badgeFor({ selectedForListening: true })).toEqual({ label: 'Awaiting responses', tone: 'attention' })
    expect(badgeFor({ responseCount: 1 })).toEqual({ label: 'Not collecting · 1 earlier response', tone: 'lifecycle' })
    expect(badgeFor({ responseCount: 2 })).toEqual({ label: 'Not collecting · 2 earlier responses', tone: 'lifecycle' })
    expect(badgeFor()).toEqual({ label: 'Needs survey', tone: 'lifecycle' })
  })

  it('names current-or-earlier feedback in the visible-session footer', () => {
    expect(formatSessionFeedbackFooter(2, 2, 2)).toBe('Showing 2 of 2 sessions · 2 have feedback, current or earlier')
  })
})
