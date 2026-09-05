import { AnswerStatus, EventStructureItemKind, QuestionResponseTarget, QuestionType, ResponseStatus, SurveyTargetCategory } from '@prisma/client'
import { requireAgendaEventScope } from '@/lib/event-agenda-service'
import {
  EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES,
  EVENT_SESSION_STRONG_EVIDENCE_MINIMUM,
} from '@/lib/event-session-intelligence'
import { prisma } from '@/lib/prisma'
import { buildEventEvidenceModel, evidenceTierLabel, type EventEvidenceModel } from '@/lib/event-intelligence/evidence-model'
import { buildEventIntelligenceFindings } from '@/lib/event-intelligence/intelligence-view'
import { resolveCanonicalEventSpeakerId } from '@/lib/event-speaker-attribution'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

type PrismaLike = typeof prisma

export type EventSpeakerEvidenceState = 'NONE' | 'NOT_ENOUGH' | 'DIRECTIONAL' | 'STRONG'

interface SpeakerRecord {
  id: string
  name: string
  title: string | null
  organization: string | null
  assignments: Array<{
    id: string
    role: string
    session: {
      id: string
      name: string
      startsAt: Date | null
      endsAt: Date | null
      timezone: string | null
    }
  }>
}

interface SpeakerTargetRecord {
  id: string
  category?: SurveyTargetCategory
  speakerId?: string | null
  eventStructureItemId: string | null
  speakerAssignmentId: string | null
  responseCount: number
  responseIds?: string[]
}

interface SpeakerIntelligenceRecord {
  surveyTargetId: string | null
  responseId: string
  answerId?: string
  confidence: number | null
  speakerId?: string | null
  sessionId?: string | null
  themes: Array<{
    id?: string
    themeKey: string
    label: string
    sentimentLabel: string | null
    confidence: number | null
  }>
}

interface SpeakerAnswerRecord {
  id: string
  responseId: string
  speakerId: string
  sessionId: string
  numericValue: number
}

function average(values: number[]) {
  if (values.length === 0) return null
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 1000) / 1000
}

function mostCommon(values: Array<string | null>) {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

function evidenceState(evidence: EventEvidenceModel, hasSpeakerQuestion: boolean): EventSpeakerEvidenceState {
  if (evidence.evidenceTier === 'NONE') return hasSpeakerQuestion ? 'NOT_ENOUGH' : 'NONE'
  if (evidence.evidenceTier === 'STRONG') return 'STRONG'
  if (evidence.evidenceTier === 'REPEATED' || evidence.evidenceTier === 'EMERGING') return 'DIRECTIONAL'
  return 'NOT_ENOUGH'
}

export function buildEventSpeakerIntelligence(input: {
  eventId: string
  speakers: SpeakerRecord[]
  targets: SpeakerTargetRecord[]
  intelligence: SpeakerIntelligenceRecord[]
  speakerAnswers?: SpeakerAnswerRecord[]
}) {
  const assignmentContext = new Map<string, { speakerId: string; sessionId: string }>()
  for (const speaker of input.speakers) {
    for (const assignment of speaker.assignments) {
      assignmentContext.set(assignment.id, { speakerId: speaker.id, sessionId: assignment.session.id })
    }
  }

  // Direct SPEAKER targets are the canonical path. The legacy assignment
  // target remains readable so existing historical analysis is preserved.
  const validTargets = input.targets.filter((target) => {
    if (target.category === SurveyTargetCategory.SPEAKER) return Boolean(target.speakerId && input.speakers.some((speaker) => speaker.id === target.speakerId))
    if (!target.speakerAssignmentId || !target.eventStructureItemId) return false
    const context = assignmentContext.get(target.speakerAssignmentId)
    return Boolean(context && context.sessionId === target.eventStructureItemId)
  })
  const targetsBySpeaker = new Map<string, SpeakerTargetRecord[]>()
  const targetAttribution = new Map<string, { directSpeakerId: string | null; legacySpeakerId: string | null }>()
  for (const target of validTargets) {
    const directSpeakerId = target.category === SurveyTargetCategory.SPEAKER ? target.speakerId! : null
    const legacySpeakerId = target.speakerAssignmentId
      ? assignmentContext.get(target.speakerAssignmentId)?.speakerId ?? null
      : null
    const speakerId = resolveCanonicalEventSpeakerId({ directTargetSpeakerId: directSpeakerId, legacyTargetSpeakerId: legacySpeakerId })!
    targetsBySpeaker.set(speakerId, [...(targetsBySpeaker.get(speakerId) ?? []), target])
    targetAttribution.set(target.id, { directSpeakerId, legacySpeakerId })
  }

  const intelligenceBySpeaker = new Map<string, SpeakerIntelligenceRecord[]>()
  const seenIntelligenceAnswerIds = new Set<string>()
  for (const row of input.intelligence) {
    if (row.answerId && seenIntelligenceAnswerIds.has(row.answerId)) continue
    if (row.answerId) seenIntelligenceAnswerIds.add(row.answerId)
    const answerSpeakerIsValid = Boolean(row.speakerId && input.speakers.some((speaker) => (
      speaker.id === row.speakerId
      && (!row.sessionId || speaker.assignments.some((assignment) => assignment.session.id === row.sessionId))
    )))
    const target = row.surveyTargetId ? targetAttribution.get(row.surveyTargetId) : null
    const speakerId = resolveCanonicalEventSpeakerId({
      answerSpeakerId: row.speakerId,
      answerSpeakerIsValid,
      directTargetSpeakerId: target?.directSpeakerId,
      legacyTargetSpeakerId: target?.legacySpeakerId,
    })
    if (speakerId) intelligenceBySpeaker.set(speakerId, [...(intelligenceBySpeaker.get(speakerId) ?? []), row])
  }

  const answersBySpeaker = new Map<string, SpeakerAnswerRecord[]>()
  const seenSpeakerAnswerIds = new Set<string>()
  for (const answer of input.speakerAnswers ?? []) {
    if (seenSpeakerAnswerIds.has(answer.id)) continue
    const speaker = input.speakers.find((candidate) => candidate.id === answer.speakerId)
    if (!speaker?.assignments.some((assignment) => assignment.session.id === answer.sessionId)) continue
    seenSpeakerAnswerIds.add(answer.id)
    answersBySpeaker.set(answer.speakerId, [...(answersBySpeaker.get(answer.speakerId) ?? []), answer])
  }

  const speakers = input.speakers.map((speaker) => {
    const targets = targetsBySpeaker.get(speaker.id) ?? []
    const rows = intelligenceBySpeaker.get(speaker.id) ?? []
    const speakerAnswers = answersBySpeaker.get(speaker.id) ?? []
    const knownResponseIds = new Set([
      ...targets.flatMap((target) => target.responseIds ?? []),
      ...speakerAnswers.map((answer) => answer.responseId),
    ])
    const responseCountWithoutIds = targets.reduce((total, target) => (
      total + (target.responseIds ? 0 : target.responseCount)
    ), 0)
    const responseCount = knownResponseIds.size + responseCountWithoutIds
    const hasSpeakerQuestion = targets.length > 0 || speakerAnswers.length > 0
    const analyzedEligibleResponseIds = [...new Set(rows.map((row) => row.responseId))]
    const speakerEvidence = buildEventEvidenceModel({
      mentionCount: rows.length,
      supportingResponseIds: rows.map((row) => row.responseId),
      analyzedEligibleResponseIds,
      completedEligibleResponseCount: responseCount,
      extractionConfidence: average(rows.map((row) => row.confidence).filter((value): value is number => typeof value === 'number')),
    })
    const state = evidenceState(speakerEvidence, hasSpeakerQuestion)
    const supported = speakerEvidence.evidenceTier !== 'NONE'
    const themeGroups = new Map<string, Array<{ row: SpeakerIntelligenceRecord; theme: SpeakerIntelligenceRecord['themes'][number] }>>()
    if (supported) {
      for (const row of rows) for (const theme of row.themes) {
        themeGroups.set(theme.themeKey, [...(themeGroups.get(theme.themeKey) ?? []), { row, theme }])
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
        sentimentLabel: mostCommon(group.map((item) => item.theme.sentimentLabel)),
        confidence,
        evidence,
        supportingAnswerIds: group.map((item) => item.row.answerId).filter((id): id is string => Boolean(id)),
        supportingResponseIds: group.map((item) => item.row.responseId),
        supportingEvidenceIds: group.map((item) => item.theme.id).filter((id): id is string => Boolean(id)),
        supportingTargetIds: group.map((item) => item.row.surveyTargetId).filter((id): id is string => Boolean(id)),
        targetIdentity: `speaker:${speaker.id}`,
        targetName: speaker.name,
        targetKind: 'SPEAKER',
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

    return {
      id: speaker.id,
      name: speaker.name,
      title: speaker.title,
      organization: speaker.organization,
      sessions: speaker.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        role: assignment.role,
        id: assignment.session.id,
        title: assignment.session.name,
        startsAt: assignment.session.startsAt?.toISOString() ?? null,
        endsAt: assignment.session.endsAt?.toISOString() ?? null,
        timezone: assignment.session.timezone,
      })),
      speakerSpecificTargetIds: targets.map((target) => target.id),
      responseCount,
      hasSpeakerQuestion,
      speakerRatingCount: speakerAnswers.length,
      speakerRatingAverage: average(speakerAnswers.map((answer) => answer.numericValue)),
      analyzedAnswerCount: rows.length,
      evidence: speakerEvidence,
      evidenceState: state,
      evidenceLabel: evidenceTierLabel(speakerEvidence.evidenceTier),
      minimumEvidenceResponses: EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES,
      confidence: average(rows.map((row) => row.confidence).filter((value): value is number => typeof value === 'number')),
      findings,
    }
  })

  return {
    eventId: input.eventId,
    minimumEvidenceResponses: EVENT_SESSION_MINIMUM_EVIDENCE_RESPONSES,
    strongEvidenceMinimum: EVENT_SESSION_STRONG_EVIDENCE_MINIMUM,
    provenance: 'Answer.speakerId or SurveyTarget.speakerId + Event.id, constrained by the assigned Event session',
    summary: {
      speakerCount: speakers.length,
      speakersWithFeedbackCount: speakers.filter((speaker) => speaker.responseCount > 0).length,
      speakerSpecificResponseCount: speakers.reduce((total, speaker) => total + speaker.responseCount, 0),
    },
    speakers,
  }
}

export type EventSpeakerIntelligenceResult = ReturnType<typeof buildEventSpeakerIntelligence>

export async function getEventSpeakerIntelligence(
  input: { accountId: string; eventId: string; lifecyclePhase?: ResolvedEventLifecyclePhase },
  db: PrismaLike = prisma,
) {
  const scope = await requireAgendaEventScope(input, db)
  const rawSpeakers = await db.eventSpeakerProfile.findMany({
    where: {
      accountId: scope.accountId,
      isArchived: false,
      sessionAssignments: {
        some: { eventId: scope.eventId, session: { isActive: true, kind: EventStructureItemKind.SESSION } },
      },
    },
    select: {
      id: true,
      name: true,
      title: true,
      organization: true,
      sessionAssignments: {
        where: { eventId: scope.eventId, session: { isActive: true, kind: EventStructureItemKind.SESSION } },
        select: {
          id: true,
          role: true,
          session: { select: { id: true, name: true, startsAt: true, endsAt: true, timezone: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  const speakers = rawSpeakers.map((speaker) => ({
    id: speaker.id,
    name: speaker.name,
    title: speaker.title,
    organization: speaker.organization,
    assignments: speaker.sessionAssignments.flatMap((assignment) => assignment.session ? [assignment as typeof assignment & { session: NonNullable<typeof assignment.session> }] : []),
  }))
  const assignmentIds = speakers.flatMap((speaker) => speaker.assignments.map((assignment) => assignment.id))
  const phaseWhere = responseCollectionPhaseWhere(input.lifecyclePhase)
  const rawTargets = assignmentIds.length === 0 ? [] : await db.surveyTarget.findMany({
    where: {
      eventId: scope.eventId,
      isActive: true,
      OR: [
        { category: SurveyTargetCategory.SPEAKER, speakerId: { in: speakers.map((speaker) => speaker.id) } },
        { category: SurveyTargetCategory.SESSION, speakerAssignmentId: { in: assignmentIds } },
      ],
    },
    select: {
      id: true,
      category: true,
      speakerId: true,
      eventStructureItemId: true,
      speakerAssignmentId: true,
      _count: { select: { responses: { where: { status: ResponseStatus.COMPLETED, ...phaseWhere } } } },
      responses: { where: { status: ResponseStatus.COMPLETED, ...phaseWhere }, select: { id: true } },
    },
  })
  const targets = rawTargets.map((target) => ({
    id: target.id,
    category: target.category,
    speakerId: target.speakerId,
    eventStructureItemId: target.eventStructureItemId,
    speakerAssignmentId: target.speakerAssignmentId,
    responseCount: target._count.responses,
    responseIds: target.responses.map((response) => response.id),
  }))
  const targetIds = targets.map((target) => target.id)
  const speakerIds = speakers.map((speaker) => speaker.id)
  const intelligence = speakerIds.length === 0 ? [] : await db.answerEventIntelligence.findMany({
    where: {
      accountId: scope.accountId,
      eventId: scope.eventId,
      OR: [
        { surveyTargetId: { in: targetIds } },
        { answer: { speakerId: { in: speakerIds } } },
      ],
      response: { status: ResponseStatus.COMPLETED, ...phaseWhere },
    },
    select: {
      surveyTargetId: true,
      responseId: true,
      answerId: true,
      confidence: true,
      answer: { select: { speakerId: true } },
      response: { select: { surveyTarget: { select: { category: true, eventStructureItemId: true } } } },
      themes: { select: { id: true, themeKey: true, label: true, sentimentLabel: true, confidence: true } },
    },
  })
  const speakerAnswers = speakerIds.length === 0 ? [] : await db.answer.findMany({
    where: {
      speakerId: { in: speakerIds },
      numericValue: { not: null },
      status: AnswerStatus.COMPLETED,
      question: {
        eventId: scope.eventId,
        type: QuestionType.SPEAKER_FEEDBACK,
        responseTarget: QuestionResponseTarget.SPEAKERS,
      },
      response: {
        eventId: scope.eventId,
        status: ResponseStatus.COMPLETED,
        ...phaseWhere,
        surveyTarget: { eventId: scope.eventId, category: SurveyTargetCategory.SESSION },
      },
    },
    select: {
      id: true,
      responseId: true,
      speakerId: true,
      numericValue: true,
      response: { select: { surveyTarget: { select: { eventStructureItemId: true } } } },
    },
  })
  return buildEventSpeakerIntelligence({
    eventId: scope.eventId,
    speakers,
    targets,
    intelligence: intelligence.map((row) => ({
      surveyTargetId: row.surveyTargetId,
      responseId: row.responseId,
      answerId: row.answerId,
      confidence: row.confidence,
      speakerId: row.answer.speakerId,
      sessionId: row.response.surveyTarget?.category === SurveyTargetCategory.SESSION
        ? row.response.surveyTarget.eventStructureItemId
        : null,
      themes: row.themes,
    })),
    speakerAnswers: speakerAnswers.flatMap((answer) => (
      answer.speakerId && answer.numericValue != null && answer.response.surveyTarget?.eventStructureItemId
        ? [{
          id: answer.id,
          responseId: answer.responseId,
          speakerId: answer.speakerId,
          sessionId: answer.response.surveyTarget.eventStructureItemId,
          numericValue: answer.numericValue,
        }]
        : []
    )),
  })
}
