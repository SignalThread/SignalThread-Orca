import { EventStatus, EventStructureItemKind, ResponseStatus, SurveyTargetCategory } from '@prisma/client'
import { parseEventAgendaSessionMetadata } from '@/lib/event-agenda-contract'
import { requireAgendaEventScope } from '@/lib/event-agenda-service'
import { EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM } from '@/lib/event-listening-plan'
import { isActiveEventIssueClusterStatus } from '@/lib/event-intelligence/contract'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'
import { prisma } from '@/lib/prisma'
import { buildEventEvidenceModel, evidenceTierLabel, type EventEvidenceModel } from '@/lib/event-intelligence/evidence-model'
import { buildEventIntelligenceFindings } from '@/lib/event-intelligence/intelligence-view'
import { buildEffectiveResponseTargetWhere, resolveEffectiveResponseTarget } from '@/lib/effective-response-target'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

type PrismaLike = typeof prisma

const SESSION_RESPONSE_TARGET_SELECT = {
  id: true,
  category: true,
  name: true,
  eventStructureItemId: true,
  eventStructureItem: { select: { id: true, name: true, kind: true } },
} as const

export const EVENT_SESSION_STRONG_EVIDENCE_MINIMUM = 8
export const EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES = EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM

export type EventSessionCoverageState = 'NOT_SELECTED' | 'UNDERREPRESENTED' | 'REPRESENTED' | 'NEEDS_REVIEW'
export type EventSessionEvidenceState = 'NONE' | 'NOT_ENOUGH' | 'DIRECTIONAL' | 'STRONG'

interface SessionRecord {
  id: string
  name: string
  description: string | null
  startsAt: Date | null
  endsAt: Date | null
  timezone: string | null
  metadata: unknown
  speakerAssignments: Array<{
    id: string
    role: string
    speaker: { id: string; name: string; title: string | null; organization: string | null }
  }>
}

interface TargetRecord {
  id: string
  eventStructureItemId: string | null
  plannerManaged: boolean
  responseCount: number
  publicSurveyLinks: Array<{
    id: string
    token: string
    isActive: boolean
    survey: { id: string; name: string; status: string }
  }>
}

interface IntelligenceRecord {
  surveyTargetId: string | null
  responseId: string
  answerId?: string
  confidence: number | null
  themes: Array<{ id?: string; themeKey: string; label: string; sentimentLabel: string | null; confidence: number | null }>
  actions: Array<{ title: string; actionWindow: string | null; confidence: number | null }>
}

interface IssueRecord {
  id: string
  surveyTargetId: string | null
  title: string
  priorityLevel: string
  status: string
  evidenceCount: number
}

function average(values: number[]) {
  if (values.length === 0) return null
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 1000) / 1000
}

function topValue(values: Array<string | null>) {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

function evidenceState(evidence: EventEvidenceModel): EventSessionEvidenceState {
  if (evidence.evidenceTier === 'NONE') return 'NONE'
  if (evidence.evidenceTier === 'STRONG') return 'STRONG'
  if (evidence.evidenceTier === 'REPEATED' || evidence.evidenceTier === 'EMERGING') return 'DIRECTIONAL'
  return 'NOT_ENOUGH'
}

function sessionReviewIssues(session: SessionRecord) {
  const issues: string[] = []
  let metadata: ReturnType<typeof parseEventAgendaSessionMetadata>
  try {
    metadata = parseEventAgendaSessionMetadata(session.metadata)
  } catch {
    metadata = { schemaVersion: 1 }
    issues.push('Agenda metadata needs review')
  }
  if (!session.startsAt) issues.push('Start time is missing')
  if (!session.endsAt) issues.push('End time is missing')
  if (!session.timezone) issues.push('Timezone is missing')
  if (!metadata.room) issues.push('Room is missing')
  if (!metadata.track) issues.push('Track is missing')
  return { metadata, issues }
}

function actionHorizon(actionWindow: string | null) {
  const normalized = actionWindow?.trim().toUpperCase() ?? ''
  return normalized === 'LATER' ? 'NEXT_EVENT' as const : normalized === 'WATCH' ? 'INFORMATIONAL' as const : 'CURRENT_EVENT' as const
}

export function buildEventSessionIntelligence(input: {
  eventId: string
  sessions: SessionRecord[]
  targets: TargetRecord[]
  intelligence: IntelligenceRecord[]
  issues: IssueRecord[]
}) {
  const targetsBySession = new Map<string, TargetRecord[]>()
  const targetToSession = new Map<string, string>()
  for (const target of input.targets) {
    if (!target.eventStructureItemId) continue
    targetsBySession.set(target.eventStructureItemId, [...(targetsBySession.get(target.eventStructureItemId) ?? []), target])
    targetToSession.set(target.id, target.eventStructureItemId)
  }

  const intelligenceBySession = new Map<string, IntelligenceRecord[]>()
  for (const row of input.intelligence) {
    const sessionId = row.surveyTargetId ? targetToSession.get(row.surveyTargetId) : null
    if (sessionId) intelligenceBySession.set(sessionId, [...(intelligenceBySession.get(sessionId) ?? []), row])
  }

  const issuesBySession = new Map<string, IssueRecord[]>()
  for (const issue of input.issues) {
    const sessionId = issue.surveyTargetId ? targetToSession.get(issue.surveyTargetId) : null
    if (sessionId) issuesBySession.set(sessionId, [...(issuesBySession.get(sessionId) ?? []), issue])
  }

  const sessions = input.sessions.map((session) => {
    const targets = targetsBySession.get(session.id) ?? []
    const listeningTargets = targets.filter((target) => target.plannerManaged)
    const sessionSurveyTargets = listeningTargets.filter((target) => target.publicSurveyLinks.length > 0)
    const selectedForListening = sessionSurveyTargets.length > 0
    const responseCount = targets.reduce((total, target) => total + target.responseCount, 0)
    const listeningResponseCount = sessionSurveyTargets.reduce((total, target) => total + target.responseCount, 0)
    const links = sessionSurveyTargets.flatMap((target) => target.publicSurveyLinks)
      .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.survey.name.localeCompare(right.survey.name))
    const deployment = links[0] ?? null
    const review = sessionReviewIssues(session)
    const rows = intelligenceBySession.get(session.id) ?? []
    const analyzedEligibleResponseIds = [...new Set(rows.map((row) => row.responseId))]
    const sessionEvidence = buildEventEvidenceModel({
      mentionCount: rows.length,
      supportingResponseIds: rows.map((row) => row.responseId),
      analyzedEligibleResponseIds,
      completedEligibleResponseCount: responseCount,
      extractionConfidence: average(rows.map((row) => row.confidence).filter((value): value is number => typeof value === 'number')),
    })
    const evidence = evidenceState(sessionEvidence)
    const enoughEvidence = sessionEvidence.evidenceTier !== 'NONE'
    const listeningRepresented = selectedForListening
      && listeningResponseCount >= EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES

    const themeGroups = new Map<string, Array<{ row: IntelligenceRecord; theme: IntelligenceRecord['themes'][number] }>>()
    if (enoughEvidence) {
      for (const row of rows) {
        for (const theme of row.themes) {
          themeGroups.set(theme.themeKey, [...(themeGroups.get(theme.themeKey) ?? []), { row, theme }])
        }
      }
    }
    const findingCandidates = [...themeGroups.entries()].map(([themeKey, group]) => {
      const confidence = average(group.map((item) => item.theme.confidence).filter((value): value is number => typeof value === 'number'))
      const evidence = buildEventEvidenceModel({
        mentionCount: group.length,
        supportingResponseIds: group.map((item) => item.row.responseId),
        analyzedEligibleResponseIds,
        completedEligibleResponseCount: responseCount,
        extractionConfidence: confidence,
      })
      return {
        themeKey,
        label: group[0].theme.label,
        count: evidence.mentionCount,
        sentimentLabel: topValue(group.map((item) => item.theme.sentimentLabel)),
        confidence,
        evidence,
        supportingAnswerIds: group.map((item) => item.row.answerId).filter((id): id is string => Boolean(id)),
        supportingResponseIds: group.map((item) => item.row.responseId),
        supportingEvidenceIds: group.map((item) => item.theme.id).filter((id): id is string => Boolean(id)),
        supportingTargetIds: group.map((item) => item.row.surveyTargetId).filter((id): id is string => Boolean(id)),
        targetIdentity: `session:${session.id}`,
        targetName: session.name,
        targetKind: 'SESSION',
      }
    })
    const findings = buildEventIntelligenceFindings({
      themes: findingCandidates,
      actions: [],
      targets: [],
      issues: [],
    }).filter((finding) => finding.kind !== 'opportunity').slice(0, 5).map((finding) => ({
      themeKey: finding.evidenceThemeKey,
      themeKeys: finding.evidenceThemeKeys,
      label: finding.title,
      mentionCount: finding.mentionCount,
      responseCount: finding.evidence.uniqueAnalyzedResponseCount,
      sentimentLabel: finding.sentimentLabel,
      confidence: finding.confidence,
      evidence: finding.evidence,
    }))

    const learningCandidates = enoughEvidence ? rows.flatMap((row) => row.actions.flatMap((action) => {
      const themeKey = topValue(row.themes.map((theme) => theme.themeKey))
      if (!themeKey || !action.title.trim()) return []
      return [{
        themeKey,
        title: action.title,
        description: null,
        count: 1,
        actionWindow: action.actionWindow,
        confidence: action.confidence,
        supportingAnswerIds: row.answerId ? [row.answerId] : [],
        supportingResponseIds: [row.responseId],
        supportingTargetIds: row.surveyTargetId ? [row.surveyTargetId] : [],
        targetIdentity: `session:${session.id}`,
        targetName: session.name,
        targetKind: 'SESSION',
      }]
    })) : []
    const learning = buildEventIntelligenceFindings({
      themes: [],
      actions: learningCandidates,
      targets: [],
      issues: [],
    }).filter((finding) => finding.kind === 'opportunity').slice(0, 4).map((finding) => ({
      title: finding.title,
      horizon: actionHorizon(finding.classification === 'next-event' ? 'LATER' : finding.classification === 'current-event' ? 'NOW' : null),
      mentionCount: finding.mentionCount,
      confidence: finding.confidence,
      evidenceThemeKey: finding.evidenceThemeKey,
      evidenceThemeKeys: finding.evidenceThemeKeys,
    }))

    const state: EventSessionCoverageState = review.issues.length > 0
      ? 'NEEDS_REVIEW'
      : !selectedForListening
        ? 'NOT_SELECTED'
        : listeningRepresented
          ? 'REPRESENTED'
          : 'UNDERREPRESENTED'

    return {
      id: session.id,
      title: session.name,
      description: session.description,
      startsAt: session.startsAt?.toISOString() ?? null,
      endsAt: session.endsAt?.toISOString() ?? null,
      timezone: session.timezone,
      room: review.metadata.room ?? null,
      track: review.metadata.track ?? null,
      format: review.metadata.format ?? null,
      state,
      selectedForListening,
      represented: listeningRepresented,
      underrepresented: selectedForListening && !listeningRepresented,
      responseCount,
      listeningResponseCount,
      hasEnoughEvidence: enoughEvidence,
      analyzedAnswerCount: rows.length,
      evidence: sessionEvidence,
      evidenceState: evidence,
      evidenceLabel: evidenceTierLabel(sessionEvidence.evidenceTier),
      minimumEvidenceResponses: EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES,
      reviewIssues: review.issues,
      speakers: session.speakerAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        role: assignment.role,
        ...assignment.speaker,
      })),
      listening: {
        targetIds: sessionSurveyTargets.map((target) => target.id),
        collectionState: !selectedForListening
          ? 'NOT_SELECTED'
          : !deployment
            ? 'NEEDS_SURVEY'
            : deployment.survey.status === EventStatus.ACTIVE && deployment.isActive
              ? 'COLLECTING'
              : 'SURVEY_ATTACHED',
        survey: deployment ? { id: deployment.survey.id, name: deployment.survey.name, status: deployment.survey.status } : null,
        publicLink: deployment ? { id: deployment.id, token: deployment.token, isActive: deployment.isActive } : null,
      },
      findings,
      learning,
      relatedIssues: (issuesBySession.get(session.id) ?? []).map((issue) => ({
        id: issue.id,
        title: issue.title,
        priorityLevel: issue.priorityLevel,
        status: issue.status,
        evidenceCount: issue.evidenceCount,
        active: isActiveEventIssueClusterStatus(issue.status),
      })),
    }
  })

  const selected = sessions.filter((session) => session.selectedForListening)
  const represented = selected.filter((session) => session.represented)
  const sessionSurveysWithResponses = selected.filter((session) => session.listeningResponseCount > 0)
  return {
    eventId: input.eventId,
    minimumEvidenceResponses: EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES,
    strongEvidenceMinimum: EVENT_SESSION_STRONG_EVIDENCE_MINIMUM,
    provenance: 'PublicSurveyLink.surveyTargetId → Response.surveyTargetId → Survey.surveyTargetId → SurveyTarget.eventStructureItemId → EventStructureItem.id',
    summary: {
      agendaSessionCount: sessions.length,
      selectedSessionCount: selected.length,
      sessionSurveysWithResponsesCount: sessionSurveysWithResponses.length,
      representedSessionCount: represented.length,
      underrepresentedSessionCount: selected.length - represented.length,
      needsReviewSessionCount: sessions.filter((session) => session.reviewIssues.length > 0).length,
      selectedCoverageLabel: `${selected.length} of ${sessions.length} sessions currently collecting`,
      evidenceCoverageLabel: `${sessionSurveysWithResponses.length} of ${selected.length} collecting sessions ${sessionSurveysWithResponses.length === 1 ? 'has' : 'have'} responses`,
    },
    sessions,
  }
}

export type EventSessionIntelligenceResult = ReturnType<typeof buildEventSessionIntelligence>

export async function getEventSessionIntelligence(
  input: { accountId: string; eventId: string; lifecyclePhase?: ResolvedEventLifecyclePhase },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const sessions = await db.eventStructureItem.findMany({
    where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
    select: {
      id: true, name: true, description: true, startsAt: true, endsAt: true, timezone: true, metadata: true,
      speakerAssignments: {
        select: { id: true, role: true, speaker: { select: { id: true, name: true, title: true, organization: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })
  const sessionIds = sessions.map((session) => session.id)
  const targets = sessionIds.length === 0 ? [] : await db.surveyTarget.findMany({
    where: {
      eventId: scope.eventId,
      category: SurveyTargetCategory.SESSION,
      isActive: true,
      eventStructureItemId: { in: sessionIds },
      speakerAssignmentId: null,
    },
    select: {
      id: true,
      eventStructureItemId: true,
      metadata: true,
      publicSurveyLinks: {
        where: { survey: { status: { not: EventStatus.ARCHIVED } } },
        select: { id: true, token: true, isActive: true, survey: { select: { id: true, name: true, status: true } } },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      },
    },
  })
  const targetIds = targets.map((target) => target.id)
  const phaseWhere = responseCollectionPhaseWhere(input.lifecyclePhase)
  const [completedResponses, intelligenceRows, issues] = targetIds.length === 0 ? [[], [], []] : await Promise.all([
    db.response.findMany({
      where: {
        eventId: scope.eventId,
        status: ResponseStatus.COMPLETED,
        ...phaseWhere,
        ...buildEffectiveResponseTargetWhere({ id: { in: targetIds } }),
      },
      select: {
        surveyTarget: { select: SESSION_RESPONSE_TARGET_SELECT },
        publicSurveyLink: { select: { surveyTarget: { select: SESSION_RESPONSE_TARGET_SELECT } } },
        survey: { select: { surveyTarget: { select: SESSION_RESPONSE_TARGET_SELECT } } },
      },
    }),
    db.answerEventIntelligence.findMany({
      where: {
        accountId: scope.accountId,
        eventId: scope.eventId,
        response: {
          status: ResponseStatus.COMPLETED,
          ...phaseWhere,
          ...buildEffectiveResponseTargetWhere({ id: { in: targetIds } }),
        },
      },
      select: {
        surveyTargetId: true, responseId: true, answerId: true, confidence: true,
        themes: { select: { id: true, themeKey: true, label: true, sentimentLabel: true, confidence: true } },
        actions: { select: { title: true, actionWindow: true, confidence: true } },
        response: {
          select: {
            surveyTarget: { select: SESSION_RESPONSE_TARGET_SELECT },
            publicSurveyLink: { select: { surveyTarget: { select: SESSION_RESPONSE_TARGET_SELECT } } },
            survey: { select: { surveyTarget: { select: SESSION_RESPONSE_TARGET_SELECT } } },
          },
        },
      },
    }),
    db.eventIssueCluster.findMany({
      where: { accountId: scope.accountId, eventId: scope.eventId, surveyTargetId: { in: targetIds }, evidence: { some: { response: phaseWhere } } },
      select: { id: true, surveyTargetId: true, title: true, priorityLevel: true, status: true, _count: { select: { evidence: { where: { response: phaseWhere } } } } },
      orderBy: { lastSeenAt: 'desc' },
    }),
  ])
  const responseCountsByTarget = new Map<string, number>()
  for (const response of completedResponses) {
    const targetId = resolveEffectiveResponseTarget({
      publicSurveyLink: response.publicSurveyLink,
      responseTarget: response.surveyTarget,
      survey: response.survey,
    })?.targetId
    if (targetId) responseCountsByTarget.set(targetId, (responseCountsByTarget.get(targetId) ?? 0) + 1)
  }
  const intelligence = intelligenceRows.map((row) => {
    const targetId = resolveEffectiveResponseTarget({
      publicSurveyLink: row.response.publicSurveyLink,
      responseTarget: row.response.surveyTarget,
      survey: row.response.survey,
    })?.targetId
    const { response: _response, ...record } = row
    return { ...record, surveyTargetId: targetId ?? row.surveyTargetId }
  })

  return buildEventSessionIntelligence({
    eventId: scope.eventId,
    sessions,
    targets: targets.map((target) => ({
      ...target,
      plannerManaged: isPlannerManagedSurveyTarget(target),
      responseCount: responseCountsByTarget.get(target.id) ?? 0,
    })),
    intelligence,
    issues: issues.map((issue) => ({ ...issue, evidenceCount: issue._count.evidence })),
  })
}
