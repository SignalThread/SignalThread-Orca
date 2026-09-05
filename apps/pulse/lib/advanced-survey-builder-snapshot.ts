import { surveyAssignmentRule, surveyAssignmentState } from '@/lib/survey-target-assignment'

export type AdvancedSurveyAssignmentTarget = {
  id: string
  category: string
  name: string
  eventStructureItemId?: string | null
  speakerId?: string | null
  metadata?: unknown
}

export type AdvancedSurveyAssignmentSpecSnapshot = {
  kind: 'EVENT' | 'SESSION' | 'SPEAKER' | 'LOCATION' | 'CUSTOM'
  selection: 'ALL' | 'SELECTED'
  targetIds?: string[]
  customKey?: string
  customName?: string
}

export type AdvancedSurveyBuilderSnapshot = {
  surveyId: string
  surveyStatus: string
  responseCount: number
  reviewIssues: string[]
  assignmentTargets: AdvancedSurveyAssignmentTarget[]
  assignmentSpecs: AdvancedSurveyAssignmentSpecSnapshot[]
  hasSessionContext: boolean
  assignedSession: { id: string; name: string; startsAt: string | null; endsAt: string | null; timezone: string | null } | null
  sessionSpeakers: Array<{ id: string; name: string; title?: string | null; organization?: string | null }>
}

export function buildAdvancedSurveyBuilderSnapshot(survey: any): AdvancedSurveyBuilderSnapshot | null {
  if (!survey?.id) return null

  const currentLinks = (survey.publicSurveyLinks ?? [])
    .filter((link: { metadata?: any }) => surveyAssignmentState(link) !== 'SUPERSEDED')
  const assignmentEntries = currentLinks.length > 0
    ? currentLinks
    : survey.surveyTarget
      ? [{ surveyTarget: survey.surveyTarget, metadata: null }]
      : []
  const targets = assignmentEntries
    .flatMap((link: { surveyTarget?: any }) => !link.surveyTarget ? [] : [link.surveyTarget])
  if (targets.length === 0 && survey.surveyTarget) targets.push(survey.surveyTarget)

  const assignmentTargets = targets.filter((target: { id: string }, index: number, all: Array<{ id: string }>) => (
    all.findIndex((candidate) => candidate.id === target.id) === index
  ))
  const sessionTarget = assignmentTargets.find((target: { category?: string; eventStructureItem?: unknown }) => target.category === 'SESSION' && target.eventStructureItem)
    ?? (survey.surveyTarget?.category === 'SESSION' ? survey.surveyTarget : null)
  const session = sessionTarget?.eventStructureItem
  const assignmentSpecGroups = new Map<string, AdvancedSurveyAssignmentSpecSnapshot>()
  assignmentEntries.forEach((link: { metadata?: any; surveyTarget?: any }) => {
    const target = link.surveyTarget
    if (!target) return
    const inferredKind = target.category === 'EVENT'
      ? 'EVENT'
      : target.category === 'SESSION'
        ? 'SESSION'
        : target.category === 'SPEAKER'
          ? 'SPEAKER'
          : target.category === 'LOCATION'
            ? 'LOCATION'
            : 'CUSTOM'
    const rule = surveyAssignmentRule(link) ?? { kind: inferredKind, selection: 'SELECTED' as const }
    const key = rule.kind
    const existing = assignmentSpecGroups.get(key) ?? { kind: rule.kind, selection: rule.selection }
    existing.selection = existing.selection === 'ALL' || rule.selection === 'ALL' ? 'ALL' : 'SELECTED'
    if (existing.selection === 'SELECTED') {
      const targetId = rule.kind === 'SPEAKER' ? target.speakerId : target.eventStructureItemId
      if (targetId) existing.targetIds = [...new Set([...(existing.targetIds ?? []), targetId])]
    }
    if (rule.kind === 'CUSTOM') {
      const targetRule = target.metadata?.advancedAssignment
      existing.customKey = typeof targetRule?.customKey === 'string' ? targetRule.customKey : target.id
      existing.customName = target.name
    }
    assignmentSpecGroups.set(key, existing)
  })

  return {
    surveyId: survey.id,
    surveyStatus: survey.status ?? 'DRAFT',
    responseCount: survey._count?.responses ?? 0,
    reviewIssues: survey.review?.issues ?? [],
    assignmentTargets,
    assignmentSpecs: [...assignmentSpecGroups.values()],
    hasSessionContext: Boolean(sessionTarget),
    assignedSession: session ? {
      id: session.id,
      name: session.name,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timezone: session.timezone,
    } : null,
    sessionSpeakers: (session?.speakerAssignments ?? [])
      .map((assignment: { speaker?: { id?: string; name?: string; title?: string | null; organization?: string | null; isArchived?: boolean } }) => assignment.speaker)
      .filter((speaker: { id?: string; name?: string; isArchived?: boolean } | undefined) => Boolean(speaker?.id && speaker?.name && !speaker.isArchived)),
  }
}

function snapshotFingerprint(snapshot: AdvancedSurveyBuilderSnapshot) {
  return JSON.stringify({
    surveyId: snapshot.surveyId,
    surveyStatus: snapshot.surveyStatus,
    responseCount: snapshot.responseCount,
    reviewIssues: snapshot.reviewIssues,
    assignmentTargets: snapshot.assignmentTargets.map((target) => ({
      id: target.id,
      category: target.category,
      name: target.name,
      eventStructureItemId: target.eventStructureItemId ?? null,
      speakerId: target.speakerId ?? null,
      metadata: target.metadata ?? null,
    })),
    assignmentSpecs: snapshot.assignmentSpecs,
    hasSessionContext: snapshot.hasSessionContext,
    assignedSession: snapshot.assignedSession,
    sessionSpeakers: snapshot.sessionSpeakers,
  })
}

export function applyAdvancedSurveyBuilderSnapshot(
  previousFingerprint: string | null,
  snapshot: AdvancedSurveyBuilderSnapshot,
  write: (snapshot: AdvancedSurveyBuilderSnapshot) => void,
) {
  const fingerprint = snapshotFingerprint(snapshot)
  if (fingerprint === previousFingerprint) return { applied: false as const, fingerprint }
  write(snapshot)
  return { applied: true as const, fingerprint }
}
