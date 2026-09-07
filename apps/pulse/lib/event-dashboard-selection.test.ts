import { describe, expect, it } from 'vitest'
import {
  applyEventDashboardSelectionToUrl,
  hydrateEventDashboardSelection,
  serializeEventDashboardRequest,
  transitionEventDashboardSelection,
  type EventDashboardSelectionMetadata,
} from './event-dashboard-selection'

const metadata: EventDashboardSelectionMetadata = {
  surveys: [
    { id: 'survey_session', eventStructureItemIds: ['session_1'] },
    { id: 'survey_event', eventStructureItemIds: ['event_1'] },
    { id: 'survey_multi', eventStructureItemIds: ['event_1', 'session_1'] },
  ],
  structureItems: [
    { id: 'event_1', kind: 'EVENT' },
    { id: 'session_1', kind: 'SESSION' },
    { id: 'area_1', kind: 'AREA' },
  ],
}

const allSelection = hydrateEventDashboardSelection({
  lifecycle: 'in-event',
  intelligenceScope: 'event-areas',
  raw: {},
  metadata,
})

describe('Event dashboard canonical selection', () => {
  it('normalizes an incompatible survey + structure URL before request serialization', () => {
    const selection = hydrateEventDashboardSelection({
      lifecycle: 'in-event',
      intelligenceScope: 'event-areas',
      raw: { surveyId: 'survey_session', structureKind: 'EVENT' },
      metadata,
    })

    expect(selection.dataScope).toEqual({ type: 'survey', surveyId: 'survey_session' })
    for (const kind of ['analysis', 'timeline', 'intelligence', 'signals'] as const) {
      const params = serializeEventDashboardRequest({ kind, accountSlug: 'events-demo', selection, days: 30 })
      expect(params.get('surveyId')).toBe('survey_session')
      expect(params.has('structureKind')).toBe(false)
    }
  })

  it('makes survey → structure transitions atomic', () => {
    const surveySelection = transitionEventDashboardSelection(allSelection, { type: 'select-survey', surveyId: 'survey_session' }, metadata)
    const incompatibleStructure = transitionEventDashboardSelection(surveySelection, {
      type: 'select-structure',
      structure: { type: 'structure-kind', structureKind: 'EVENT' },
    }, metadata)

    expect(incompatibleStructure.dataScope).toEqual({ type: 'structure-kind', structureKind: 'EVENT' })
  })

  it('makes structure → survey transitions atomic', () => {
    const structureSelection = transitionEventDashboardSelection(allSelection, {
      type: 'select-structure',
      structure: { type: 'structure-kind', structureKind: 'EVENT' },
    }, metadata)
    const incompatibleSurvey = transitionEventDashboardSelection(structureSelection, { type: 'select-survey', surveyId: 'survey_session' }, metadata)

    expect(incompatibleSurvey.dataScope).toEqual({ type: 'survey', surveyId: 'survey_session' })
  })

  it('preserves a compatible survey + structure intersection', () => {
    const surveySelection = transitionEventDashboardSelection(allSelection, { type: 'select-survey', surveyId: 'survey_multi' }, metadata)
    const intersection = transitionEventDashboardSelection(surveySelection, {
      type: 'select-structure',
      structure: { type: 'structure-kind', structureKind: 'EVENT' },
    }, metadata)

    expect(intersection.dataScope).toEqual({
      type: 'survey-structure',
      surveyId: 'survey_multi',
      structure: { type: 'structure-kind', structureKind: 'EVENT' },
    })
  })

  it('clears dormant data filters across lifecycle transitions', () => {
    const scoped = transitionEventDashboardSelection(allSelection, { type: 'select-survey', surveyId: 'survey_session' }, metadata)
    const preEvent = transitionEventDashboardSelection(scoped, { type: 'set-lifecycle', lifecycle: 'pre-event' }, metadata)
    const inEventAgain = transitionEventDashboardSelection(preEvent, { type: 'set-lifecycle', lifecycle: 'in-event' }, metadata)

    expect(preEvent.dataScope).toEqual({ type: 'all' })
    expect(preEvent.intelligenceScope).toBe('event-areas')
    expect(inEventAgain.dataScope).toEqual({ type: 'all' })
  })

  it('keeps PRE event-wide by default while allowing a PRE survey to narrow it', () => {
    const preEvent = hydrateEventDashboardSelection({
      lifecycle: 'pre-event',
      intelligenceScope: 'sessions',
      raw: { surveyId: 'survey_session', eventStructureItemId: 'event_1', surveyTargetId: 'target_1' },
      metadata,
    })

    expect(preEvent).toEqual({
      lifecycle: 'pre-event',
      intelligenceScope: 'event-areas',
      dataScope: { type: 'survey', surveyId: 'survey_session' },
      evidenceScope: null,
    })

    const allPreEvent = transitionEventDashboardSelection(preEvent, { type: 'select-survey', surveyId: null }, metadata)
    expect(allPreEvent.dataScope).toEqual({ type: 'all' })
    expect(allPreEvent.evidenceScope).toBeNull()
  })

  it('keeps PRE event-wide while preserving Sessions and Speakers for During and Post', () => {
    for (const lifecycle of ['in-event', 'post-event'] as const) {
      for (const intelligenceScope of ['event-areas', 'sessions', 'speakers'] as const) {
        const selection = hydrateEventDashboardSelection({ lifecycle, intelligenceScope, raw: {}, metadata })
        expect(selection.intelligenceScope).toBe(intelligenceScope)
      }
    }

    const pre = hydrateEventDashboardSelection({ lifecycle: 'pre-event', intelligenceScope: 'sessions', raw: {}, metadata })
    expect(pre.intelligenceScope).toBe('event-areas')
  })

  it('keeps Post entity scopes and their canonical filters when navigating from During', () => {
    const duringSession = hydrateEventDashboardSelection({
      lifecycle: 'in-event',
      intelligenceScope: 'sessions',
      raw: { surveyId: 'survey_session', eventStructureItemId: 'session_1' },
      metadata,
    })
    const postSession = transitionEventDashboardSelection(duringSession, { type: 'set-lifecycle', lifecycle: 'post-event' }, metadata)
    const postSpeaker = transitionEventDashboardSelection(postSession, { type: 'set-intelligence-scope', intelligenceScope: 'speakers' }, metadata)

    expect(postSession).toMatchObject({ lifecycle: 'post-event', intelligenceScope: 'sessions' })
    expect(postSession.dataScope).toEqual({
      type: 'survey-structure',
      surveyId: 'survey_session',
      structure: { type: 'structure-item', eventStructureItemId: 'session_1' },
    })
    expect(postSpeaker).toMatchObject({ lifecycle: 'post-event', intelligenceScope: 'speakers', dataScope: { type: 'all' } })
  })

  it('clears Event Area filters when moving to Sessions or Speakers', () => {
    const scoped = transitionEventDashboardSelection(allSelection, { type: 'select-survey', surveyId: 'survey_session' }, metadata)
    const sessions = transitionEventDashboardSelection(scoped, { type: 'set-intelligence-scope', intelligenceScope: 'sessions' }, metadata)
    const speakers = transitionEventDashboardSelection(scoped, { type: 'set-intelligence-scope', intelligenceScope: 'speakers' }, metadata)

    expect(sessions.dataScope).toEqual({ type: 'all' })
    expect(speakers.dataScope).toEqual({ type: 'all' })
  })

  it('accepts Survey and Area selections once Speakers is the active in-event scope', () => {
    const speakers = transitionEventDashboardSelection(allSelection, {
      type: 'set-intelligence-scope',
      intelligenceScope: 'speakers',
    }, metadata)
    const survey = transitionEventDashboardSelection(speakers, {
      type: 'select-survey',
      surveyId: 'survey_session',
    }, metadata)
    const area = transitionEventDashboardSelection(speakers, {
      type: 'select-structure',
      structure: { type: 'structure-kind', structureKind: 'AREA' },
    }, metadata)

    expect(survey.dataScope).toEqual({ type: 'survey', surveyId: 'survey_session' })
    expect(area.dataScope).toEqual({ type: 'structure-kind', structureKind: 'AREA' })
  })

  it('reconciles Event Areas, Sessions, and Speakers as atomic scope transitions', () => {
    const area = transitionEventDashboardSelection(allSelection, {
      type: 'select-structure',
      structure: { type: 'structure-item', eventStructureItemId: 'area_1' },
    }, metadata)
    const sessions = transitionEventDashboardSelection(area, {
      type: 'set-intelligence-scope',
      intelligenceScope: 'sessions',
    }, metadata)
    const speakers = transitionEventDashboardSelection(sessions, {
      type: 'set-intelligence-scope',
      intelligenceScope: 'speakers',
    }, metadata)
    const eventAreas = transitionEventDashboardSelection(speakers, {
      type: 'set-intelligence-scope',
      intelligenceScope: 'event-areas',
    }, metadata)

    expect(area.dataScope).toEqual({ type: 'structure-item', eventStructureItemId: 'area_1' })
    expect(sessions).toMatchObject({ intelligenceScope: 'sessions', dataScope: { type: 'all' } })
    expect(speakers).toMatchObject({ intelligenceScope: 'speakers', dataScope: { type: 'all' } })
    expect(eventAreas).toMatchObject({ intelligenceScope: 'event-areas', dataScope: { type: 'all' } })
  })

  it('serializes the same canonical data scope for all four dashboard endpoints', () => {
    const selection = hydrateEventDashboardSelection({
      lifecycle: 'in-event',
      intelligenceScope: 'event-areas',
      raw: { surveyId: 'survey_multi', eventStructureItemId: 'event_1' },
      metadata,
    })

    const scopes = (['analysis', 'timeline', 'intelligence', 'signals'] as const).map((kind) => {
      const params = serializeEventDashboardRequest({ kind, accountSlug: 'events-demo', selection, days: 30 })
      return {
        surveyId: params.get('surveyId'),
        eventStructureItemId: params.get('eventStructureItemId'),
        structureKind: params.get('structureKind'),
      }
    })
    expect(new Set(scopes.map((scope) => JSON.stringify(scope))).size).toBe(1)
  })

  it('changes every applicable request when only the survey changes', () => {
    const first = transitionEventDashboardSelection(allSelection, { type: 'select-survey', surveyId: 'survey_session' }, metadata)
    const second = transitionEventDashboardSelection(first, { type: 'select-survey', surveyId: 'survey_event' }, metadata)

    for (const kind of ['analysis', 'timeline', 'intelligence', 'signals'] as const) {
      const firstQuery = serializeEventDashboardRequest({ kind, accountSlug: 'events-demo', selection: first }).toString()
      const secondQuery = serializeEventDashboardRequest({ kind, accountSlug: 'events-demo', selection: second }).toString()
      expect(firstQuery).not.toBe(secondQuery)
      expect(secondQuery).toContain('surveyId=survey_event')
    }
  })

  it('writes only the normalized canonical selection back to the URL', () => {
    const selection = hydrateEventDashboardSelection({
      lifecycle: 'in-event',
      intelligenceScope: 'event-areas',
      raw: { surveyId: 'survey_session', structureKind: 'EVENT' },
      metadata,
    })
    const query = applyEventDashboardSelectionToUrl(
      new URLSearchParams('account=events-demo&surveyId=survey_session&structureKind=EVENT'),
      selection,
      { defaultLifecycle: 'in-event' },
    )

    expect(query.get('surveyId')).toBe('survey_session')
    expect(query.has('structureKind')).toBe(false)
  })

  it('keeps the bootstrap request unscoped even when a bad deep link exists', () => {
    const deepLinked = hydrateEventDashboardSelection({
      lifecycle: 'in-event',
      intelligenceScope: 'event-areas',
      raw: { surveyId: 'survey_session', structureKind: 'EVENT' },
      metadata,
    })
    const query = serializeEventDashboardRequest({
      kind: 'analysis',
      accountSlug: 'events-demo',
      selection: deepLinked,
      bootstrap: true,
    })

    expect(query.get('scope')).toBe('bootstrap')
    expect(query.has('surveyId')).toBe(false)
    expect(query.has('structureKind')).toBe(false)
    expect(query.has('lifecycle')).toBe(false)
  })
})
