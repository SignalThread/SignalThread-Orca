import { describe, expect, it } from 'vitest'
import {
  EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES,
  EVENT_SESSION_STRONG_EVIDENCE_MINIMUM,
  buildEventSessionIntelligence,
} from '@/lib/event-session-intelligence'

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'session_1',
  name: 'Opening keynote',
  description: 'The opening session',
  startsAt: new Date('2026-09-17T13:00:00.000Z'),
  endsAt: new Date('2026-09-17T14:00:00.000Z'),
  timezone: 'America/New_York',
  metadata: { schemaVersion: 1, room: 'Main Hall', track: 'Leadership', format: 'Keynote' },
  speakerAssignments: [{
    id: 'assignment_1', role: 'SPEAKER',
    speaker: { id: 'speaker_1', name: 'Ada Lovelace', title: 'CTO', organization: 'Analytical Engines' },
  }],
  ...overrides,
})

const target = (responseCount: number, overrides: Record<string, unknown> = {}) => ({
  id: 'target_1',
  eventStructureItemId: 'session_1',
  plannerManaged: true,
  responseCount,
  publicSurveyLinks: [{ id: 'link_1', token: 'real-token', isActive: true, survey: { id: 'survey_1', name: 'Session pulse', status: 'ACTIVE' } }],
  ...overrides,
})

const intelligence = (index: number) => ({
  surveyTargetId: 'target_1',
  responseId: `response_${index}`,
  answerId: `answer_${index}`,
  confidence: 0.84,
  themes: [{ themeKey: 'practical_content', label: 'Practical content', sentimentLabel: 'POSITIVE', confidence: 0.84 }],
  actions: [{ title: 'Reuse the workshop format', actionWindow: 'LATER', confidence: 0.78 }],
})

describe('buildEventSessionIntelligence', () => {
  it('uses session surveys as the coverage denominator and canonical IDs as provenance', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1',
      sessions: [session(), session({ id: 'session_2', name: 'Unselected session' })],
      targets: [target(EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES)],
      intelligence: [1, 2, 3].map(intelligence),
      issues: [],
    })

    expect(result.summary).toMatchObject({
      agendaSessionCount: 2,
      selectedSessionCount: 1,
      sessionSurveysWithResponsesCount: 1,
      representedSessionCount: 1,
      underrepresentedSessionCount: 0,
      selectedCoverageLabel: '1 of 2 sessions currently collecting',
      evidenceCoverageLabel: '1 of 1 collecting sessions has responses',
    })
    expect(result.provenance).toContain('SurveyTarget.eventStructureItemId')
    expect(result.sessions[0]).toMatchObject({ id: 'session_1', title: 'Opening keynote', room: 'Main Hall', track: 'Leadership', state: 'REPRESENTED' })
    expect(result.sessions[1]).toMatchObject({ id: 'session_2', state: 'NOT_SELECTED', evidenceLabel: 'No analyzed feedback yet' })
  })

  it('keeps result-only session evidence without treating it as a listening selection', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1',
      sessions: [session(), session({ id: 'session_2', name: 'Result-only session' })],
      targets: [
        target(2),
        target(4, {
          id: 'result_target_2',
          eventStructureItemId: 'session_2',
          plannerManaged: false,
          publicSurveyLinks: [],
        }),
      ],
      intelligence: [1, 2, 3, 4].map((index) => ({
        ...intelligence(index),
        surveyTargetId: 'result_target_2',
      })),
      issues: [],
    })

    expect(result.summary).toMatchObject({
      selectedSessionCount: 1,
      representedSessionCount: 0,
      underrepresentedSessionCount: 1,
    })
    expect(result.sessions[1]).toMatchObject({
      selectedForListening: false,
      state: 'NOT_SELECTED',
      responseCount: 4,
      hasEnoughEvidence: true,
      evidenceState: 'DIRECTIONAL',
    })
    expect(result.sessions[1].findings).toHaveLength(1)
    expect(result.sessions[1].listening.targetIds).toEqual([])
  })

  it('uses analyzed supporting responses rather than completed volume for evidence', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1', sessions: [session()], targets: [target(2)], intelligence: [intelligence(1), intelligence(2)], issues: [],
    })

    expect(result.sessions[0]).toMatchObject({ state: 'UNDERREPRESENTED', evidenceState: 'DIRECTIONAL', evidenceLabel: 'Emerging' })
    expect(result.sessions[0].findings[0].evidence).toMatchObject({ evidenceTier: 'EMERGING', uniqueAnalyzedResponseCount: 2 })
  })

  it('reports one factual response separately from the representation threshold', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1', sessions: [session()], targets: [target(1)], intelligence: [], issues: [],
    })

    expect(result.summary).toMatchObject({
      sessionSurveysWithResponsesCount: 1,
      representedSessionCount: 0,
      underrepresentedSessionCount: 1,
      evidenceCoverageLabel: '1 of 1 collecting sessions has responses',
    })
    expect(result.sessions[0]).toMatchObject({ responseCount: 1, listeningResponseCount: 1, represented: false, evidenceState: 'NONE' })
  })

  it('reports zero responses without implying thresholded representation is response volume', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1', sessions: [session()], targets: [target(0)], intelligence: [], issues: [],
    })

    expect(result.summary).toMatchObject({
      sessionSurveysWithResponsesCount: 0,
      representedSessionCount: 0,
      evidenceCoverageLabel: '0 of 1 collecting sessions have responses',
    })
    expect(result.sessions[0]).toMatchObject({ responseCount: 0, represented: false })
  })

  it('classifies strong evidence only at the explicit higher threshold and keeps speaker joins', () => {
    const rows = Array.from({ length: EVENT_SESSION_STRONG_EVIDENCE_MINIMUM }, (_, index) => intelligence(index))
    const result = buildEventSessionIntelligence({
      eventId: 'event_1', sessions: [session()], targets: [target(rows.length)], intelligence: rows,
      issues: [{ id: 'issue_1', surveyTargetId: 'target_1', title: 'Adjust room audio', priorityLevel: 'Soon', status: 'NEW', evidenceCount: 4 }],
    })

    expect(result.sessions[0].evidenceState).toBe('STRONG')
    expect(result.sessions[0].findings[0]).toMatchObject({ themeKey: 'practical_content', responseCount: rows.length, sentimentLabel: 'POSITIVE' })
    expect(result.sessions[0].learning[0]).toMatchObject({ title: 'Reuse the workshop format', horizon: 'NEXT_EVENT', evidenceThemeKey: 'practical_content' })
    expect(result.sessions[0].speakers[0]).toMatchObject({ id: 'speaker_1', name: 'Ada Lovelace', role: 'SPEAKER' })
    expect(result.sessions[0].relatedIssues[0]).toMatchObject({ id: 'issue_1', active: true })
  })

  it('marks incomplete agenda details for review without treating a missing survey as a coverage failure', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1',
      sessions: [session({ metadata: { schemaVersion: 1, room: null, track: null, format: 'Panel' } })],
      targets: [target(0, { publicSurveyLinks: [] })], intelligence: [], issues: [],
    })

    expect(result.sessions[0]).toMatchObject({ state: 'NEEDS_REVIEW', room: null, track: null })
    expect(result.sessions[0].reviewIssues).toEqual(expect.arrayContaining(['Room is missing', 'Track is missing']))
    expect(result.sessions[0].reviewIssues).not.toContain('Listening point needs an attached survey')
  })

  it('canonicalizes rating-suffixed and qualitative labels before the session top-five limit', () => {
    const result = buildEventSessionIntelligence({
      eventId: 'event_1', sessions: [session()], targets: [target(2)], issues: [],
      intelligence: [
        { ...intelligence(1), themes: [{ id: 't1', themeKey: 'practical_content', label: 'Practical content', sentimentLabel: 'POSITIVE', confidence: 0.84 }] },
        { ...intelligence(2), themes: [{ id: 't2', themeKey: 'practical_content_rating', label: 'Practical content rating', sentimentLabel: 'POSITIVE', confidence: 0.84 }] },
      ],
    })
    expect(result.sessions[0].findings).toEqual([
      expect.objectContaining({ label: 'Practical content', mentionCount: 2, themeKeys: ['practical_content', 'practical_content_rating'] }),
    ])
  })
})
