export type EventDashboardLifecycleView = 'pre-event' | 'in-event' | 'post-event'
export type EventDashboardIntelligenceScope = 'event-areas' | 'sessions' | 'speakers'
export type EventDashboardStructureKind = 'EVENT' | 'SESSION' | 'AREA' | 'SPONSOR_ACTIVATION' | 'CUSTOM_TOUCHPOINT'

export type EventDashboardStructureScope =
  | { type: 'structure-item'; eventStructureItemId: string }
  | { type: 'structure-kind'; structureKind: EventDashboardStructureKind }

export type EventDashboardDataScope =
  | { type: 'all' }
  | { type: 'survey'; surveyId: string }
  | EventDashboardStructureScope
  | { type: 'survey-structure'; surveyId: string; structure: EventDashboardStructureScope }

export type EventDashboardEvidenceScope =
  | { type: 'target'; surveyTargetId: string }
  | { type: 'question'; questionId: string }
  | null

export interface EventDashboardSelection {
  lifecycle: EventDashboardLifecycleView
  intelligenceScope: EventDashboardIntelligenceScope
  dataScope: EventDashboardDataScope
  evidenceScope: EventDashboardEvidenceScope
}

export interface EventDashboardSurveyScopeMetadata {
  id: string
  eventStructureItemIds: readonly string[]
}

export interface EventDashboardStructureScopeMetadata {
  id: string
  kind: EventDashboardStructureKind
}

export interface EventDashboardSelectionMetadata {
  surveys: readonly EventDashboardSurveyScopeMetadata[]
  structureItems: readonly EventDashboardStructureScopeMetadata[]
}

export interface EventDashboardRawSelection {
  surveyId?: string | null
  eventStructureItemId?: string | null
  structureKind?: string | null
  surveyTargetId?: string | null
  questionId?: string | null
}

const STRUCTURE_KINDS: readonly EventDashboardStructureKind[] = [
  'EVENT',
  'SESSION',
  'AREA',
  'SPONSOR_ACTIVATION',
  'CUSTOM_TOUCHPOINT',
]

function trimmed(value: string | null | undefined) {
  return value?.trim() || null
}

export function eventDashboardSelectionStructureScope(scope: EventDashboardDataScope): EventDashboardStructureScope | null {
  if (scope.type === 'structure-item' || scope.type === 'structure-kind') return scope
  if (scope.type === 'survey-structure') return scope.structure
  return null
}

export function eventDashboardSelectionSurveyId(scope: EventDashboardDataScope) {
  return scope.type === 'survey' || scope.type === 'survey-structure' ? scope.surveyId : null
}

function surveyMetadata(metadata: EventDashboardSelectionMetadata, surveyId: string) {
  return metadata.surveys.find((survey) => survey.id === surveyId) ?? null
}

function structureItemMetadata(metadata: EventDashboardSelectionMetadata, eventStructureItemId: string) {
  return metadata.structureItems.find((item) => item.id === eventStructureItemId) ?? null
}

export function isSurveyCompatibleWithStructureScope(
  surveyId: string,
  structure: EventDashboardStructureScope,
  metadata: EventDashboardSelectionMetadata,
) {
  const survey = surveyMetadata(metadata, surveyId)
  if (!survey) return false
  if (structure.type === 'structure-item') {
    return survey.eventStructureItemIds.includes(structure.eventStructureItemId)
  }

  return survey.eventStructureItemIds.some((itemId) => (
    structureItemMetadata(metadata, itemId)?.kind === structure.structureKind
  ))
}

function validStructureScope(
  raw: Pick<EventDashboardRawSelection, 'eventStructureItemId' | 'structureKind'>,
  metadata: EventDashboardSelectionMetadata,
): EventDashboardStructureScope | null {
  const eventStructureItemId = trimmed(raw.eventStructureItemId)
  if (eventStructureItemId && structureItemMetadata(metadata, eventStructureItemId)) {
    return { type: 'structure-item', eventStructureItemId }
  }

  const structureKind = trimmed(raw.structureKind)
  if (structureKind && STRUCTURE_KINDS.includes(structureKind as EventDashboardStructureKind)) {
    return { type: 'structure-kind', structureKind: structureKind as EventDashboardStructureKind }
  }
  return null
}

function evidenceScopeFromRaw(raw: EventDashboardRawSelection): EventDashboardEvidenceScope {
  const surveyTargetId = trimmed(raw.surveyTargetId)
  if (surveyTargetId) return { type: 'target', surveyTargetId }
  const questionId = trimmed(raw.questionId)
  return questionId ? { type: 'question', questionId } : null
}

/**
 * Hydrates URL state only after the caller has loaded survey and structure metadata.
 * A survey wins when a legacy/deep-linked URL contains an incompatible structure
 * filter because it is the more specific attendee-feedback selection.
 */
export function hydrateEventDashboardSelection(input: {
  lifecycle: EventDashboardLifecycleView
  intelligenceScope: EventDashboardIntelligenceScope
  raw: EventDashboardRawSelection
  metadata: EventDashboardSelectionMetadata
}): EventDashboardSelection {
  const base: EventDashboardSelection = {
    lifecycle: input.lifecycle,
    intelligenceScope: input.intelligenceScope,
    dataScope: { type: 'all' },
    evidenceScope: null,
  }

  const requestedSurveyId = trimmed(input.raw.surveyId)
  const surveyId = requestedSurveyId && surveyMetadata(input.metadata, requestedSurveyId)
    ? requestedSurveyId
    : null

  // Pre-event intelligence is event-wide by default, but can be narrowed to a
  // single PRE survey. It deliberately never accepts a structure or evidence
  // scope: those controls describe live-event operational views.
  if (input.lifecycle === 'pre-event') {
    return {
      ...base,
      intelligenceScope: 'event-areas',
      dataScope: surveyId ? { type: 'survey', surveyId } : { type: 'all' },
    }
  }

  if (input.lifecycle !== 'in-event') {
    return { ...base, intelligenceScope: 'event-areas' }
  }
  const structure = validStructureScope(input.raw, input.metadata)

  if (surveyId && structure && isSurveyCompatibleWithStructureScope(surveyId, structure, input.metadata)) {
    base.dataScope = { type: 'survey-structure', surveyId, structure }
  } else if (surveyId) {
    base.dataScope = { type: 'survey', surveyId }
  } else if (structure) {
    base.dataScope = structure
  }
  base.evidenceScope = evidenceScopeFromRaw(input.raw)
  return base
}

export type EventDashboardSelectionTransition =
  | { type: 'select-survey'; surveyId: string | null }
  | { type: 'select-structure'; structure: EventDashboardStructureScope | null }
  | { type: 'set-intelligence-scope'; intelligenceScope: EventDashboardIntelligenceScope }
  | { type: 'set-lifecycle'; lifecycle: EventDashboardLifecycleView }
  | { type: 'set-evidence-scope'; evidenceScope: EventDashboardEvidenceScope }

export function transitionEventDashboardSelection(
  selection: EventDashboardSelection,
  transition: EventDashboardSelectionTransition,
  metadata: EventDashboardSelectionMetadata,
): EventDashboardSelection {
  if (transition.type === 'set-lifecycle') {
    const retainDataScope = selection.lifecycle === 'in-event' && transition.lifecycle === 'in-event'
    return {
      ...selection,
      lifecycle: transition.lifecycle,
      intelligenceScope: transition.lifecycle === 'in-event' ? selection.intelligenceScope : 'event-areas',
      dataScope: retainDataScope ? selection.dataScope : { type: 'all' },
      evidenceScope: retainDataScope ? selection.evidenceScope : null,
    }
  }

  if (transition.type === 'set-intelligence-scope') {
    const retainDataScope = transition.intelligenceScope === 'event-areas'
      && selection.intelligenceScope === 'event-areas'
      && selection.lifecycle === 'in-event'
    return {
      ...selection,
      intelligenceScope: transition.intelligenceScope,
      dataScope: retainDataScope ? selection.dataScope : { type: 'all' },
      evidenceScope: retainDataScope ? selection.evidenceScope : null,
    }
  }

  if (transition.type === 'set-evidence-scope') {
    return { ...selection, evidenceScope: transition.evidenceScope }
  }

  if (selection.lifecycle === 'pre-event' && transition.type === 'select-survey') {
    const surveyId = trimmed(transition.surveyId)
    return {
      ...selection,
      intelligenceScope: 'event-areas',
      dataScope: surveyId && surveyMetadata(metadata, surveyId) ? { type: 'survey', surveyId } : { type: 'all' },
      evidenceScope: null,
    }
  }

  if (selection.lifecycle !== 'in-event') {
    return { ...selection, dataScope: { type: 'all' }, evidenceScope: null }
  }

  if (transition.type === 'select-survey') {
    const surveyId = trimmed(transition.surveyId)
    const structure = eventDashboardSelectionStructureScope(selection.dataScope)
    if (!surveyId || !surveyMetadata(metadata, surveyId)) {
      return { ...selection, dataScope: structure ?? { type: 'all' }, evidenceScope: null }
    }
    return {
      ...selection,
      dataScope: structure && isSurveyCompatibleWithStructureScope(surveyId, structure, metadata)
        ? { type: 'survey-structure', surveyId, structure }
        : { type: 'survey', surveyId },
      evidenceScope: null,
    }
  }

  const surveyId = eventDashboardSelectionSurveyId(selection.dataScope)
  const structure = transition.structure
  if (!structure) {
    return {
      ...selection,
      dataScope: surveyId ? { type: 'survey', surveyId } : { type: 'all' },
      evidenceScope: null,
    }
  }

  return {
    ...selection,
    dataScope: surveyId && isSurveyCompatibleWithStructureScope(surveyId, structure, metadata)
      ? { type: 'survey-structure', surveyId, structure }
      : structure,
    evidenceScope: null,
  }
}

export function eventDashboardSelectionScopeKey(selection: EventDashboardSelection) {
  const data = selection.dataScope
  const dataKey = data.type === 'all'
    ? 'all'
    : data.type === 'survey'
      ? `survey:${data.surveyId}`
      : data.type === 'structure-item'
        ? `item:${data.eventStructureItemId}`
        : data.type === 'structure-kind'
          ? `kind:${data.structureKind}`
          : `survey:${data.surveyId}/${data.structure.type === 'structure-item' ? `item:${data.structure.eventStructureItemId}` : `kind:${data.structure.structureKind}`}`
  return `${selection.lifecycle}/${selection.intelligenceScope}/${dataKey}`
}

export function appendEventDashboardDataScope(params: URLSearchParams, scope: EventDashboardDataScope) {
  const surveyId = eventDashboardSelectionSurveyId(scope)
  const structure = eventDashboardSelectionStructureScope(scope)
  if (surveyId) params.set('surveyId', surveyId)
  if (structure?.type === 'structure-item') params.set('eventStructureItemId', structure.eventStructureItemId)
  if (structure?.type === 'structure-kind') params.set('structureKind', structure.structureKind)
  return params
}

export function applyEventDashboardSelectionToUrl(
  source: URLSearchParams,
  selection: EventDashboardSelection,
  _options: { defaultLifecycle?: EventDashboardLifecycleView | null } = {},
) {
  const params = new URLSearchParams(source)
  for (const key of ['surveyId', 'eventStructureItemId', 'structureKind', 'surveyTargetId', 'questionId', 'intelligenceScope', 'lifecycle']) {
    params.delete(key)
  }
  appendEventDashboardDataScope(params, selection.dataScope)
  if (selection.evidenceScope?.type === 'target') params.set('surveyTargetId', selection.evidenceScope.surveyTargetId)
  if (selection.evidenceScope?.type === 'question') params.set('questionId', selection.evidenceScope.questionId)
  if (selection.intelligenceScope !== 'event-areas') params.set('intelligenceScope', selection.intelligenceScope)
  // Lifecycle comes from the event's current dates; navigation must never
  // create a user-selected lifecycle query parameter.
  return params
}

export type EventDashboardRequestKind = 'analysis' | 'timeline' | 'intelligence' | 'signals' | 'evidence'

export function serializeEventDashboardRequest(input: {
  kind: EventDashboardRequestKind
  accountSlug: string
  selection: EventDashboardSelection
  days?: number
  cacheBust?: number
  bootstrap?: boolean
  intelligenceView?: boolean
}) {
  const params = new URLSearchParams({ account: input.accountSlug })
  if (input.kind === 'signals') params.set('windowDays', String(input.days ?? 30))
  else if (input.kind !== 'evidence') params.set('days', String(input.days ?? 30))
  // The server resolves lifecycle from dates. Do not send client lifecycle
  // state, including from old deep links.
  if (input.kind === 'analysis' && input.bootstrap) params.set('scope', 'bootstrap')
  if (input.kind === 'intelligence' && input.intelligenceView) params.set('view', 'intelligence')
  if (input.cacheBust) params.set('cacheBust', String(input.cacheBust))

  if (!input.bootstrap) appendEventDashboardDataScope(params, input.selection.dataScope)
  if (input.kind === 'intelligence' || input.kind === 'evidence') {
    if (input.selection.evidenceScope?.type === 'target') params.set('surveyTargetId', input.selection.evidenceScope.surveyTargetId)
    if (input.selection.evidenceScope?.type === 'question') params.set('questionId', input.selection.evidenceScope.questionId)
  }
  return params
}
