import { prisma } from '@/lib/prisma'
import { AccountProductModeError, requireEventsAccountType } from '@/lib/account-product-mode'
import {
  EventDashboardFilterError,
  buildEffectiveResponseStructureWhere,
  buildSurveyTargetStructureWhere,
  parseEventDashboardStructureFilters,
  validateEventDashboardFilters,
} from '@/lib/event-dashboard-filters'
import type { EventStructureItemKind } from '@prisma/client'
import {
  isActiveEventIssueClusterStatus,
  mapLegacyUrgencyToEventPriority,
} from '@/lib/event-intelligence/contract'
import {
  buildStructuredMetrics,
  type StructuredAnswerRow,
} from '@/lib/event-intelligence/structured-intelligence'
import { getInferredSatisfactionSummaryFromBreakdown } from '@/lib/analytics/satisfaction'
import { QuestionType } from '@prisma/client'
import { buildEventEvidenceModel } from '@/lib/event-intelligence/evidence-model'
import {
  normalizeFindingKey,
  synthesizeEventFinding,
  type EventFindingEvidenceSource,
} from '@/lib/event-intelligence/finding-synthesis'
import { buildEventIntelligenceFindings } from '@/lib/event-intelligence/intelligence-view'
import { synthesizeEventEditorial } from '@/lib/event-intelligence/editorial-engine'
import { buildEffectiveResponseTargetWhere, resolveEffectiveResponseTarget } from '@/lib/effective-response-target'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

type PrismaLike = typeof prisma

const AGGREGATION_RESPONSE_TARGET_SELECT = {
  id: true,
  category: true,
  name: true,
  eventStructureItemId: true,
} as const

export interface EventIntelligenceFilters {
  surveyId?: string
  surveyTargetId?: string
  questionId?: string
  eventStructureItemId?: string | null
  structureKind?: EventStructureItemKind | null
  sentimentLabel?: string
  urgency?: string
  days?: number
}

interface EventIntelligenceSummaryInput {
  accountSlug: string
  eventId: string
  filters?: EventIntelligenceFilters
  now?: Date
  initialView?: 'intelligence'
  /** The dashboard phase maps to explicit persisted Response.collectionPhase values. */
  lifecyclePhase?: ResolvedEventLifecyclePhase
  /** Reuse the route's canonical authorization lookup instead of resolving it twice. */
  authorized?: {
    account: { id: string; accountType: string }
    event: {
      id: string
      name: string
      status: string
      eventType: string
      startDate: Date | null
      endDate: Date | null
      location: { timezone: string | null }
    }
  }
  attention?: {
    limit?: number
    cursor?: string | null
  }
}

export class EventIntelligenceAggregationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'EventIntelligenceAggregationError'
  }
}

function optionalTrimmed(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeLabel(value: unknown) {
  return optionalTrimmed(value)?.toUpperCase()
}

export function parseEventIntelligenceFilters(searchParams: URLSearchParams): EventIntelligenceFilters {
  const daysRaw = searchParams.get('days')
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : undefined
  let structureFilters: ReturnType<typeof parseEventDashboardStructureFilters>
  try {
    structureFilters = parseEventDashboardStructureFilters(searchParams)
  } catch (error) {
    if (error instanceof EventDashboardFilterError) {
      throw new EventIntelligenceAggregationError(error.message, error.status)
    }
    throw error
  }

  return {
    surveyId: optionalTrimmed(searchParams.get('surveyId')),
    surveyTargetId: optionalTrimmed(searchParams.get('surveyTargetId')),
    questionId: optionalTrimmed(searchParams.get('questionId')),
    ...structureFilters,
    sentimentLabel: normalizeLabel(searchParams.get('sentimentLabel')),
    urgency: normalizeLabel(searchParams.get('urgency')),
    days: Number.isFinite(days) && days && days > 0 ? days : undefined,
  }
}

function average(values: number[]) {
  if (values.length === 0) return null
  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function isHighUrgency(urgency: string | null | undefined) {
  const normalized = urgency?.toUpperCase()
  return normalized === 'HIGH' || normalized === 'CRITICAL' || normalized === 'URGENT'
}

function priorityRank(priority: string | null | undefined) {
  const normalized = priority?.toUpperCase()
  if (normalized === 'CRITICAL') return 0
  if (normalized === 'HIGH') return 1
  if (normalized === 'MEDIUM') return 2
  return 3
}

function priorityLevelRank(priorityLevel: string | null | undefined) {
  if (priorityLevel === 'Immediate') return 0
  if (priorityLevel === 'Soon') return 1
  if (priorityLevel === 'Watch') return 2
  return 3
}

function sentimentForSatisfaction(scorePercent: number | null) {
  if (scorePercent === null) return 'NO_DATA'
  if (scorePercent >= 60) return 'POSITIVE'
  if (scorePercent >= 40) return 'MIXED'
  return 'NEGATIVE'
}

function createEmptySummary(event: {
  id: string
  name: string
  status: string
  eventType: string
}, accountType: string, filters: EventIntelligenceFilters) {
  return {
    eventId: event.id,
    eventName: event.name,
    eventStatus: event.status,
    eventType: event.eventType,
    accountType,
    filters,
    eventPulse: {
      status: 'NO_DATA',
      sentimentLabel: 'NO_DATA',
      urgency: 'NO_DATA',
      priorityLevel: 'Informational',
      summary: 'No normalized event intelligence is available yet.',
      lastComputedAt: new Date().toISOString(),
    },
    responseCount: 0,
    capturedAnswerCount: 0,
    answerCount: 0,
    avgSentiment: null,
    highUrgencyCount: 0,
    topThemes: [],
    topActions: [],
    canonicalFindings: [],
    attendeeQuestions: [],
    targetBreakdown: [],
    questionBreakdown: [],
    urgentIssues: [],
    attentionQueue: [],
    activeAttentionCount: 0,
  }
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function topThemeCounts(
  themes: Array<{
    themeKey: string
    label: string
    sentimentLabel: string | null
    confidence: number | null
    responseId: string
    answerId?: string
    id?: string
    surveyTargetId?: string | null
    summary?: string | null
    questionLabel?: string | null
    questionType?: string | null
    targetName?: string | null
    targetKind?: string | null
  }>,
  coverage: { completedEligibleResponseCount: number; analyzedEligibleResponseIds: string[] },
  // Keep a broader ranked evidence set for downstream Intelligence and the
  // closing brief. Individual surfaces still select their own compact slices.
  limit = 100,
) {
  const byKey = new Map<string, {
    themeKey: string
    label: string
    count: number
    confidenceValues: number[]
    sentimentCounts: Map<string, number>
    responseIds: string[]
    answerIds: string[]
    evidenceIds: string[]
    surveyTargetIds: string[]
    sources: EventFindingEvidenceSource[]
    evidenceText: string[]
    questionTypes: string[]
    targetNames: string[]
    targetKinds: string[]
  }>()

  for (const theme of themes) {
    const key = normalizeFindingKey(theme.themeKey || theme.label)
    const existing = byKey.get(key) ?? {
      themeKey: key,
      label: theme.label,
      count: 0,
      confidenceValues: [],
      sentimentCounts: new Map<string, number>(),
      responseIds: [],
      answerIds: [],
      evidenceIds: [],
      surveyTargetIds: [],
      sources: [],
      evidenceText: [],
      questionTypes: [],
      targetNames: [],
      targetKinds: [],
    }
    existing.count += 1
    if (typeof theme.confidence === 'number') {
      existing.confidenceValues.push(theme.confidence)
    }
    if (theme.sentimentLabel) {
      incrementCount(existing.sentimentCounts, theme.sentimentLabel)
    }
    existing.responseIds.push(theme.responseId)
    if (theme.answerId) existing.answerIds.push(theme.answerId)
    if (theme.id) existing.evidenceIds.push(theme.id)
    if (theme.surveyTargetId) existing.surveyTargetIds.push(theme.surveyTargetId)
    if (theme.answerId) {
      existing.sources.push({
        answerId: theme.answerId,
        responseId: theme.responseId,
        summary: theme.summary ?? null,
        questionLabel: theme.questionLabel ?? null,
      })
    }
    if (theme.summary) existing.evidenceText.push(theme.summary)
    if (theme.questionType) existing.questionTypes.push(theme.questionType)
    if (theme.targetName) existing.targetNames.push(theme.targetName)
    if (theme.targetKind) existing.targetKinds.push(theme.targetKind)
    byKey.set(key, existing)
  }

  return Array.from(byKey.values())
    .map((theme) => {
      const evidence = buildEventEvidenceModel({
        mentionCount: theme.count,
        supportingResponseIds: theme.responseIds,
        analyzedEligibleResponseIds: coverage.analyzedEligibleResponseIds,
        completedEligibleResponseCount: coverage.completedEligibleResponseCount,
        extractionConfidence: average(theme.confidenceValues),
      })
      const finding = synthesizeEventFinding({
        themeKey: theme.themeKey,
        label: theme.label,
        evidenceTier: evidence.evidenceTier,
        sources: theme.sources,
      })
      return {
        themeKey: theme.themeKey,
        label: theme.label,
        statement: finding.statement,
        questionIntent: finding.questionIntent,
        supportingAnswerIds: finding.supportingAnswerIds,
        supportingResponseIds: [...new Set(theme.responseIds)],
        supportingEvidenceIds: [...new Set(theme.evidenceIds)],
        supportingTargetIds: [...new Set(theme.surveyTargetIds)],
        evidenceText: [...new Set(theme.evidenceText)],
        questionTypes: [...new Set(theme.questionTypes)],
        targetName: [...new Set(theme.targetNames)].length === 1 ? theme.targetNames[0] : null,
        targetKind: [...new Set(theme.targetKinds)].length === 1 ? theme.targetKinds[0] : null,
        // Kept temporarily for legacy display consumers; canonical surfaces use evidence.*.
        count: evidence.mentionCount,
        sentimentLabel: topCount(theme.sentimentCounts)?.key ?? null,
        confidence: evidence.extractionConfidence,
        evidence,
      }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

function topCount(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0]
}

function aggregateActions(actions: Array<{
  themeKeys: string[]
  title: string
  description: string | null
  priority: string
  urgency: string
  actionWindow: string | null
  status: string
  confidence: number | null
  responseId: string
  answerId?: string
  surveyTargetId?: string | null
}>, coverage: { completedEligibleResponseCount: number; analyzedEligibleResponseIds: string[] }, limit = 100) {
  const byTitle = new Map<string, {
    title: string
    descriptions: string[]
    count: number
    priorities: Map<string, number>
    urgencies: Map<string, number>
    windows: Map<string, number>
    statuses: Map<string, number>
    confidenceValues: number[]
    themeKeys: Map<string, number>
    responseIds: string[]
    answerIds: string[]
    surveyTargetIds: string[]
  }>()

  for (const action of actions) {
    const key = action.title.trim().toLowerCase()
    if (!key) continue

    const existing = byTitle.get(key) ?? {
      title: action.title,
      descriptions: [],
      count: 0,
      priorities: new Map<string, number>(),
      urgencies: new Map<string, number>(),
      windows: new Map<string, number>(),
      statuses: new Map<string, number>(),
      confidenceValues: [],
      themeKeys: new Map<string, number>(),
      responseIds: [],
      answerIds: [],
      surveyTargetIds: [],
    }
    existing.count += 1
    if (action.description) existing.descriptions.push(action.description)
    incrementCount(existing.priorities, action.priority)
    incrementCount(existing.urgencies, action.urgency)
    if (action.actionWindow) incrementCount(existing.windows, action.actionWindow)
    incrementCount(existing.statuses, action.status)
    if (typeof action.confidence === 'number') existing.confidenceValues.push(action.confidence)
    for (const themeKey of action.themeKeys) incrementCount(existing.themeKeys, themeKey)
    existing.responseIds.push(action.responseId)
    if (action.answerId) existing.answerIds.push(action.answerId)
    if (action.surveyTargetId) existing.surveyTargetIds.push(action.surveyTargetId)
    byTitle.set(key, existing)
  }

  return Array.from(byTitle.values())
    .map((action) => {
      const priority = topCount(action.priorities)?.key ?? 'LOW'
      const urgency = topCount(action.urgencies)?.key ?? 'LOW'
      const evidence = buildEventEvidenceModel({
        mentionCount: action.count,
        supportingResponseIds: action.responseIds,
        analyzedEligibleResponseIds: coverage.analyzedEligibleResponseIds,
        completedEligibleResponseCount: coverage.completedEligibleResponseCount,
        extractionConfidence: average(action.confidenceValues),
      })
      return {
        themeKey: topCount(action.themeKeys)?.key,
        title: action.title,
        description: action.descriptions[0] ?? null,
        count: evidence.mentionCount,
        priority,
        priorityLevel: mapLegacyUrgencyToEventPriority(urgency),
        urgency,
        actionWindow: topCount(action.windows)?.key ?? null,
        status: topCount(action.statuses)?.key ?? 'OPEN',
        confidence: evidence.extractionConfidence,
        evidence,
        supportingAnswerIds: [...new Set(action.answerIds)],
        supportingResponseIds: [...new Set(action.responseIds)],
        supportingTargetIds: [...new Set(action.surveyTargetIds)],
      }
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit)
}

const BREAKDOWN_LIMIT = 150

function buildBreakdowns(rows: any[], groupBy: 'surveyTargetId' | 'questionId') {
  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = row[groupBy] ?? 'unassigned'
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return Array.from(groups.entries())
    .map(([id, groupRows]) => {
      const sentimentValues = groupRows
        .map((row) => row.sentimentScore)
        .filter((value): value is number => typeof value === 'number')
      const themes = groupRows.flatMap((row) => row.themes.map((theme: any) => ({
        ...theme,
        responseId: row.responseId,
        answerId: row.answerId,
        surveyTargetId: row.surveyTargetId,
        summary: row.answer?.answerAnalysis?.summary ?? null,
        questionLabel: row.question?.label ?? row.answer?.promptLabel ?? null,
      })))
      const first = groupRows[0]
      const responseIds = new Set(groupRows.map((row) => row.responseId))
      const coverage = {
        completedEligibleResponseCount: responseIds.size,
        analyzedEligibleResponseIds: [...responseIds],
      }

      if (groupBy === 'surveyTargetId') {
        return {
          surveyTargetId: id === 'unassigned' ? null : id,
          name: first.surveyTarget?.name ?? 'Event-level feedback',
          category: first.surveyTarget?.category ?? null,
          eventStructureItemId: first.surveyTarget?.eventStructureItem?.id ?? null,
          eventStructureItemKind: first.surveyTarget?.eventStructureItem?.kind ?? null,
          responseCount: responseIds.size,
          answerCount: groupRows.length,
          avgSentiment: average(sentimentValues),
          highUrgencyCount: groupRows.filter((row) => isHighUrgency(row.urgency)).length,
          topThemes: topThemeCounts(themes, coverage, 5),
        }
      }

      return {
        questionId: id === 'unassigned' ? null : id,
        key: first.question?.key ?? null,
        label: first.question?.label ?? 'Unassigned question',
        order: first.question?.order ?? null,
        responseCount: responseIds.size,
        answerCount: groupRows.length,
        avgSentiment: average(sentimentValues),
        highUrgencyCount: groupRows.filter((row) => isHighUrgency(row.urgency)).length,
        topThemes: topThemeCounts(themes, coverage, 5),
      }
    })
    .sort((a, b) => {
      const countDifference = b.answerCount - a.answerCount
      if (countDifference !== 0) return countDifference
      const left = 'name' in a ? a.name : a.label
      const right = 'name' in b ? b.name : b.label
      return left.localeCompare(right)
    })
    .slice(0, BREAKDOWN_LIMIT)
}

function buildAttentionQueue(clusters: any[]) {
  return clusters
    .map((cluster) => {
      const eligibleEvidence = cluster.evidence
      return ({
      id: cluster.id,
      taxonomyKey: cluster.taxonomyKey,
      title: cluster.title,
      summary: cluster.summary,
      priorityLevel: cluster.priorityLevel,
      legacyUrgency: cluster.legacyUrgency,
      impactScore: cluster.impactScore,
      timeSensitivityScore: cluster.timeSensitivityScore,
      confidence: cluster.confidence,
      evidenceCount: eligibleEvidence ? eligibleEvidence.length : cluster.evidenceCount,
      firstSeenAt: (eligibleEvidence?.[0]?.createdAt ?? cluster.firstSeenAt).toISOString(),
      lastSeenAt: (eligibleEvidence?.at(-1)?.createdAt ?? cluster.lastSeenAt).toISOString(),
      recommendedNextStep: cluster.recommendedNextStep,
      status: cluster.status,
      ruleType: cluster.ruleType,
      metricSnapshot: cluster.metricSnapshotJson,
      ownerUserId: cluster.ownerUserId,
      acknowledgedAt: cluster.acknowledgedAt?.toISOString() ?? null,
      actingAt: cluster.actingAt?.toISOString() ?? null,
      resolvedAt: cluster.resolvedAt?.toISOString() ?? null,
      dismissedAt: cluster.dismissedAt?.toISOString() ?? null,
      resolutionReason: cluster.resolutionReason,
      dismissalReason: cluster.dismissalReason,
      noteCount: cluster._count?.notes ?? 0,
      surveyId: cluster.surveyId,
      surveyTargetId: cluster.surveyTargetId,
      questionId: cluster.questionId,
      affectedTarget: cluster.surveyTarget
        ? {
            id: cluster.surveyTarget.id,
            name: cluster.surveyTarget.name,
            category: cluster.surveyTarget.category,
          }
        : null,
      affectedQuestion: cluster.question
        ? {
            id: cluster.question.id,
            key: cluster.question.key,
            label: cluster.question.label,
            order: cluster.question.order,
          }
        : null,
      // Evidence/transcripts are drawer-only and load from the scoped cluster
      // detail endpoint. Keep a compatibility array without shipping quotes in
      // the initial Intelligence payload.
      representativeEvidence: [],
      })
    })
    .sort((a, b) => {
      const priorityDiff = priorityLevelRank(a.priorityLevel) - priorityLevelRank(b.priorityLevel)
      if (priorityDiff !== 0) return priorityDiff
      const evidenceDiff = b.evidenceCount - a.evidenceCount
      if (evidenceDiff !== 0) return evidenceDiff
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    })
}

export async function getEventAttentionQueue(input: {
  accountId: string
  eventId: string
  filters?: EventIntelligenceFilters
  now?: Date
  limit?: number
  cursor?: string | null
  lifecyclePhase?: ResolvedEventLifecyclePhase
}, db: PrismaLike = prisma) {
  const page = await getEventAttentionQueuePage(input, db)
  return page.items
}

export async function getEventAttentionQueuePage(input: {
  accountId: string
  eventId: string
  filters?: EventIntelligenceFilters
  now?: Date
  limit?: number
  cursor?: string | null
  lifecyclePhase?: ResolvedEventLifecyclePhase
}, db: PrismaLike = prisma) {
  const filters = input.filters ?? {}
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50)
  const clusterWhere: Record<string, unknown> = {
    accountId: input.accountId,
    eventId: input.eventId,
    ...buildSurveyTargetStructureWhere(filters),
  }
  if (filters.surveyId) clusterWhere.surveyId = filters.surveyId
  if (filters.surveyTargetId) clusterWhere.surveyTargetId = filters.surveyTargetId
  if (filters.questionId) clusterWhere.questionId = filters.questionId
  if (filters.days) {
    clusterWhere.lastSeenAt = {
      gte: new Date((input.now ?? new Date()).getTime() - filters.days * 24 * 60 * 60 * 1000),
    }
  }
  const responseCohortWhere = responseCollectionPhaseWhere(input.lifecyclePhase)
  clusterWhere.evidence = { some: { response: responseCohortWhere } }

  const clusters = await db.eventIssueCluster.findMany({
    where: clusterWhere,
    select: {
      id: true,
      taxonomyKey: true,
      title: true,
      summary: true,
      priorityLevel: true,
      legacyUrgency: true,
      impactScore: true,
      timeSensitivityScore: true,
      confidence: true,
      evidenceCount: true,
      firstSeenAt: true,
      lastSeenAt: true,
      recommendedNextStep: true,
      status: true,
      ruleType: true,
      metricSnapshotJson: true,
      ownerUserId: true,
      acknowledgedAt: true,
      actingAt: true,
      resolvedAt: true,
      dismissedAt: true,
      resolutionReason: true,
      dismissalReason: true,
      surveyId: true,
      surveyTargetId: true,
      questionId: true,
      surveyTarget: {
        select: { id: true, name: true, category: true },
      },
      question: {
        select: { id: true, key: true, label: true, order: true },
      },
      evidence: {
        where: { response: responseCohortWhere },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      _count: { select: { notes: true } },
    },
    orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  })

  const hasMore = clusters.length > limit
  const pageRows = hasMore ? clusters.slice(0, limit) : clusters
  return {
    items: buildAttentionQueue(pageRows),
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore ? pageRows.at(-1)?.id ?? null : null,
    },
  }
}

export async function getEventIntelligenceSummary(
  input: EventIntelligenceSummaryInput,
  db: PrismaLike = prisma,
) {
  const accountSlug = input.accountSlug.trim()
  const eventId = input.eventId.trim()
  if (!accountSlug) {
    throw new EventIntelligenceAggregationError('Account parameter required', 400)
  }
  if (!eventId) {
    throw new EventIntelligenceAggregationError('eventId is required', 400)
  }

  const account = input.authorized?.account ?? await db.account.findUnique({
    where: { slug: accountSlug },
    select: {
      id: true,
      accountType: true,
    },
  })
  if (!account) {
    throw new EventIntelligenceAggregationError('Account not found', 404)
  }

  try {
    requireEventsAccountType(
      account.accountType,
      'Event intelligence is only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      throw new EventIntelligenceAggregationError(error.message, error.status)
    }
    throw error
  }

  const event = input.authorized?.event ?? await db.event.findFirst({
    where: {
      id: eventId,
      location: {
        accountId: account.id,
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      eventType: true,
      startDate: true,
      endDate: true,
      location: { select: { timezone: true } },
    },
  })
  if (!event) {
    throw new EventIntelligenceAggregationError('Event not found or access denied', 404)
  }

  const filters = input.filters ?? {}
  try {
    await validateEventDashboardFilters({
      accountId: account.id,
      accountType: account.accountType,
      eventId,
      filters,
    }, db)
  } catch (error) {
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      throw new EventIntelligenceAggregationError(error.message, error.status)
    }
    throw error
  }
  const structureWhere = buildEffectiveResponseStructureWhere(filters)
  const responseCohortWhere = responseCollectionPhaseWhere(input.lifecyclePhase)
  const effectiveTargetScopes = [
    ...(filters.surveyTargetId ? [buildEffectiveResponseTargetWhere({ id: filters.surveyTargetId })] : []),
    ...(Object.keys(structureWhere).length > 0 ? [structureWhere] : []),
  ]
  const threshold = filters.days
    ? new Date((input.now ?? new Date()).getTime() - filters.days * 24 * 60 * 60 * 1000)
    : null

  // Responses are the canonical denominator for the Command Center. Keep this
  // scope independent of asynchronous answer analysis so a completed attendee
  // response does not disappear while its answers are awaiting analysis.
  const responseWhere: Record<string, unknown> = {
    eventId,
    status: 'COMPLETED',
    ...(filters.surveyId ? { surveyId: filters.surveyId } : {}),
    ...(effectiveTargetScopes.length > 0 ? { AND: effectiveTargetScopes } : {}),
    ...(threshold ? { startedAt: { gte: threshold } } : {}),
    ...responseCohortWhere,
  }
  const responseIntelligenceWhere: Record<string, unknown> = {
    ...(filters.questionId ? { questionId: filters.questionId } : {}),
    ...(filters.sentimentLabel ? { sentimentLabel: filters.sentimentLabel } : {}),
    ...(filters.urgency ? { urgency: filters.urgency } : {}),
  }
  if (Object.keys(responseIntelligenceWhere).length > 0) {
    responseWhere.answerEventIntelligence = { some: responseIntelligenceWhere }
  }

  const where: Record<string, unknown> = {
    accountId: account.id,
    eventId,
  }
  if (filters.surveyId) where.surveyId = filters.surveyId
  if (filters.questionId) where.questionId = filters.questionId
  if (filters.sentimentLabel) where.sentimentLabel = filters.sentimentLabel
  if (filters.urgency) where.urgency = filters.urgency
  where.response = responseWhere

  const responseCountPromise = db.response.count({ where: responseWhere })
  const capturedAnswerCountPromise = db.answer.count({ where: { response: responseWhere } })
  const attentionPagePromise = getEventAttentionQueuePage({
    accountId: account.id,
    eventId,
    filters,
    now: input.now,
    limit: input.attention?.limit,
    cursor: input.attention?.cursor,
    lifecyclePhase: input.lifecyclePhase,
  }, db)

  const intelligenceRowsPromise = db.answerEventIntelligence.findMany({
    where,
    select: {
      id: true,
      surveyId: true,
      surveyTargetId: true,
      responseId: true,
      answerId: true,
      questionId: true,
      sentimentLabel: true,
      sentimentScore: true,
      urgency: true,
      recommendedAction: true,
      confidence: true,
      createdAt: true,
      answer: {
        select: {
          promptLabel: true,
          answerTranscript: {
            select: { text: true },
          },
          answerAnalysis: {
            select: { summary: true },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Load event-scoped child/lookup tables directly. Prisma's nested relation
  // loader turns a broad event read into `id IN (...)` queries with one bind
  // parameter per intelligence row; large events were producing 500+ binds.
  // These queries keep account/event scoping in SQL and have bounded params.
  const relatedRowsPromise = Promise.all([
    db.answerEventTheme.findMany({
      where: { eventId, intelligence: { is: where } },
      select: {
        id: true,
        intelligenceId: true,
        themeKey: true,
        label: true,
        sentimentLabel: true,
        confidence: true,
      },
    }),
    db.answerEventAction.findMany({
      where: { eventId, intelligence: { is: where } },
      select: {
        intelligenceId: true,
        id: true,
        title: true,
        description: true,
        priority: true,
        urgency: true,
        actionWindow: true,
        status: true,
        confidence: true,
        answerId: true,
        surveyId: true,
        surveyTargetId: true,
        createdAt: true,
      },
    }),
    db.surveyTarget.findMany({
      where: { eventId, isActive: true },
      select: { id: true, name: true, category: true, slug: true, eventStructureItemId: true },
    }),
    db.eventStructureItem.findMany({
      where: { eventId },
      select: { id: true, kind: true, name: true },
    }),
    db.question.findMany({
      where: { eventId },
      select: { id: true, key: true, label: true, order: true, type: true },
    }),
    db.survey.findMany({
      where: { eventId },
      select: { id: true, name: true },
    }),
    db.response.findMany({
      where: responseWhere,
      select: {
        id: true,
        completedAt: true,
        surveyId: true,
        surveyTargetId: true,
        surveyTarget: { select: AGGREGATION_RESPONSE_TARGET_SELECT },
        publicSurveyLink: { select: { surveyTarget: { select: AGGREGATION_RESPONSE_TARGET_SELECT } } },
        survey: { select: { surveyTarget: { select: AGGREGATION_RESPONSE_TARGET_SELECT } } },
      },
    }),
  ])
  const structuredAnswersPromise = input.initialView === 'intelligence' || filters.sentimentLabel || filters.urgency
    ? Promise.resolve([])
    : db.answer.findMany({
      where: {
        status: 'COMPLETED',
        numericValue: { not: null },
        ...(filters.questionId ? { questionId: filters.questionId } : {}),
        question: {
          eventId,
          type: {
            in: [QuestionType.RATING_1_TO_5, QuestionType.RECOMMENDATION_0_TO_10, QuestionType.YES_NO],
          },
        },
        response: {
          ...responseWhere,
          status: 'COMPLETED',
          event: {
            location: {
              accountId: account.id,
            },
          },
        },
      },
      select: {
        id: true,
        responseId: true,
        questionId: true,
        numericValue: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

  // Every read below is independent once authorization and filter validation
  // complete. Starting them together removes the previous four-stage DB
  // waterfall, which is especially costly against a remote pooled database.
  const [responseCount, capturedAnswerCount, attentionPage, intelligenceRows, relatedRows, structuredAnswers] = await Promise.all([
    responseCountPromise,
    capturedAnswerCountPromise,
    attentionPagePromise,
    intelligenceRowsPromise,
    relatedRowsPromise,
    structuredAnswersPromise,
  ])
  const [themeRows, actionRows, surveyTargets, eventStructureItems, questions, surveys, scopedResponses] = relatedRows
  const attentionQueue = attentionPage.items
  const activeAttentionCount = attentionQueue.filter((item) => isActiveEventIssueClusterStatus(item.status)).length
  const themesByIntelligenceId = new Map<string, typeof themeRows>()
  for (const theme of themeRows) {
    themesByIntelligenceId.set(theme.intelligenceId, [
      ...(themesByIntelligenceId.get(theme.intelligenceId) ?? []),
      theme,
    ])
  }
  const actionsByIntelligenceId = new Map<string, typeof actionRows>()
  for (const action of actionRows) {
    actionsByIntelligenceId.set(action.intelligenceId, [
      ...(actionsByIntelligenceId.get(action.intelligenceId) ?? []),
      action,
    ])
  }
  const structureItemById = new Map(eventStructureItems.map((item) => [item.id, item]))
  const surveyTargetById = new Map(surveyTargets.map((target) => [target.id, {
    id: target.id,
    name: target.name,
    category: target.category,
    slug: target.slug,
    eventStructureItem: target.eventStructureItemId
      ? structureItemById.get(target.eventStructureItemId) ?? null
      : null,
  }]))
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const surveyById = new Map(surveys.map((survey) => [survey.id, survey]))
  const responseById = new Map(scopedResponses.map((response) => [response.id, response]))
  const rows = intelligenceRows.map((row) => {
    // The fallback properties keep lightweight Prisma mocks source-compatible;
    // real query results use the event-scoped maps above.
    const mockCompatibleRow = row as typeof row & {
      surveyTarget?: ReturnType<typeof surveyTargetById.get>
      question?: ReturnType<typeof questionById.get>
      themes?: typeof themeRows
      actions?: typeof actionRows
      answer?: { promptLabel?: string | null; answerTranscript?: { text?: string | null } | null; answerAnalysis?: { summary?: string | null } | null }
    }
    const response = responseById.get(row.responseId)
    const effectiveTargetId = response ? resolveEffectiveResponseTarget({
      publicSurveyLink: response.publicSurveyLink,
      responseTarget: response.surveyTarget,
      survey: response.survey,
    })?.targetId ?? row.surveyTargetId : row.surveyTargetId
    return {
      ...row,
      surveyTargetId: effectiveTargetId,
      surveyTarget: effectiveTargetId
        ? surveyTargetById.get(effectiveTargetId) ?? mockCompatibleRow.surveyTarget ?? null
        : null,
      question: row.questionId
        ? questionById.get(row.questionId) ?? mockCompatibleRow.question ?? null
        : null,
      themes: themesByIntelligenceId.get(row.id) ?? mockCompatibleRow.themes ?? [],
      actions: (actionsByIntelligenceId.get(row.id) ?? mockCompatibleRow.actions ?? [])
        .map((action) => ({ ...action, surveyTargetId: effectiveTargetId })),
      answer: row.answer ?? mockCompatibleRow.answer ?? null,
    }
  })

  const structuredRows: StructuredAnswerRow[] = structuredAnswers.flatMap((answer) => {
    const response = responseById.get(answer.responseId)
    const question = answer.questionId ? questionById.get(answer.questionId) : null
    if (!response || !question) return []
    const effectiveTargetId = resolveEffectiveResponseTarget({
      publicSurveyLink: response.publicSurveyLink,
      responseTarget: response.surveyTarget,
      survey: response.survey,
    })?.targetId ?? response.surveyTargetId
    const target = effectiveTargetId ? surveyTargetById.get(effectiveTargetId) : null
    const structureItem = target?.eventStructureItem ?? null
    return [{
      answerId: answer.id,
      responseId: response.id,
      completedAt: response.completedAt ?? answer.createdAt,
      numericValue: answer.numericValue as number,
      questionId: question.id,
      questionType: question.type,
      questionLabel: question.label,
      surveyId: response.surveyId,
      surveyName: response.surveyId ? surveyById.get(response.surveyId)?.name ?? null : null,
      surveyTargetId: effectiveTargetId,
      surveyTargetName: target?.name ?? null,
      eventStructureItemId: target?.eventStructureItem?.id ?? null,
      eventStructureItemName: structureItem?.name ?? null,
    }]
  })
  // Evidence answer IDs remain internal, while the compact complete
  // distribution is returned so organizers can interpret every metric.
  const structuredMetrics = buildStructuredMetrics(structuredRows, input.now).map((metric) => ({
    key: metric.key,
    questionId: metric.questionId,
    questionType: metric.questionType,
    questionLabel: metric.questionLabel,
    surveyId: metric.surveyId,
    surveyName: metric.surveyName,
    surveyTargetId: metric.surveyTargetId,
    surveyTargetName: metric.surveyTargetName,
    eventStructureItemId: metric.eventStructureItemId,
    eventStructureItemName: metric.eventStructureItemName,
    count: metric.count,
    average: metric.average,
    distribution: metric.distribution,
    recent: metric.recent,
    preceding: metric.preceding,
    change: metric.change,
    direction: metric.direction,
    sampleStrength: metric.sampleStrength,
  }))
  const includeAllConfiguredTargets = !filters.surveyId
    && !filters.surveyTargetId
    && !filters.questionId
    && !filters.eventStructureItemId
    && !filters.structureKind
    && !filters.sentimentLabel
    && !filters.urgency
  const emptyConfiguredTargets = includeAllConfiguredTargets
    ? surveyTargets.map((target) => ({
        surveyTargetId: target.id,
        name: target.name,
        category: target.category,
        eventStructureItemId: target.eventStructureItemId,
        eventStructureItemKind: target.eventStructureItemId
          ? structureItemById.get(target.eventStructureItemId)?.kind ?? null
          : null,
        responseCount: 0,
        answerCount: 0,
        avgSentiment: null,
        highUrgencyCount: 0,
        topThemes: [],
      }))
    : []

  if (rows.length === 0 && structuredRows.length === 0) {
    return {
      ...createEmptySummary(event, account.accountType, filters),
      responseCount,
      capturedAnswerCount,
      targetBreakdown: emptyConfiguredTargets,
      attentionQueue,
      activeAttentionCount,
      pagination: { attention: attentionPage.pagination },
      structuredMetrics,
    }
  }

  const answerCount = rows.length
  const sentimentValues = rows
    .map((row) => row.sentimentScore)
    .filter((value): value is number => typeof value === 'number')
  const avgSentiment = average(sentimentValues)
  const highUrgencyCount = rows.filter((row) => isHighUrgency(row.urgency)).length
  const analyzedEligibleResponseIds = [...new Set(rows.map((row) => row.responseId))]
  const evidenceCoverage = {
    completedEligibleResponseCount: responseCount,
    analyzedEligibleResponseIds,
  }
  const allThemes = rows.flatMap((row) => row.themes.map((theme) => ({
    ...theme,
    responseId: row.responseId,
    answerId: row.answerId,
    surveyTargetId: row.surveyTargetId,
    summary: row.answer?.answerAnalysis?.summary ?? null,
    questionLabel: row.question?.label ?? row.answer?.promptLabel ?? null,
    questionType: row.question?.type ?? null,
    targetName: row.surveyTarget?.name ?? null,
    targetKind: row.surveyTarget?.eventStructureItem?.kind ?? row.surveyTarget?.category ?? null,
  })))
  const allActions = rows.flatMap((row) => row.actions.map((action) => ({
    ...action,
    themeKeys: row.themes.map((theme) => theme.themeKey).filter(Boolean),
    responseId: row.responseId,
    surveyTargetId: row.surveyTargetId,
  })))
  const topThemes = topThemeCounts(allThemes, evidenceCoverage)
  const topActions = aggregateActions(allActions, evidenceCoverage)
  const urgentIssues = allActions
    .filter((action) => isHighUrgency(action.urgency) || priorityRank(action.priority) <= 1)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((action) => ({
      id: action.id,
      title: action.title,
      description: action.description,
      priority: action.priority,
      priorityLevel: mapLegacyUrgencyToEventPriority(action.urgency),
      urgency: action.urgency,
      actionWindow: action.actionWindow,
      status: action.status,
      confidence: action.confidence,
      answerId: action.answerId,
      surveyId: action.surveyId,
      surveyTargetId: action.surveyTargetId,
      createdAt: action.createdAt.toISOString(),
    }))

  const analyzedTargetBreakdown = buildBreakdowns(rows, 'surveyTargetId')
  const analyzedTargetIds = new Set(analyzedTargetBreakdown.map((target) => target.surveyTargetId).filter(Boolean))
  const targetBreakdown = includeAllConfiguredTargets
    ? [
        ...analyzedTargetBreakdown,
        ...emptyConfiguredTargets.filter((target) => !analyzedTargetIds.has(target.surveyTargetId)),
      ].sort((left, right) => right.answerCount - left.answerCount || left.name.localeCompare(right.name))
    : analyzedTargetBreakdown
  const questionBreakdown = buildBreakdowns(rows, 'questionId')
  // This is intentionally sourced from attendee answer transcripts rather
  // than finding summaries: questions are a survey-data planning surface,
  // not a synthesized dashboard claim. Lifecycle cohorting above makes this
  // the attendee-authored questions for the selected event phase.
  const attendeeQuestions = [...new Set(rows
    .map((row) => row.answer?.answerTranscript?.text?.trim() || row.answer?.answerAnalysis?.summary?.trim() || '')
    .filter((question) => question.length >= 12 && question.length <= 180 && question.endsWith('?')),
  )].slice(0, 8)
  const inferredSatisfaction = getInferredSatisfactionSummaryFromBreakdown({
    answerCount,
    avgSentiment,
    targetBreakdown,
    questionBreakdown,
  })
  const sentimentLabel = sentimentForSatisfaction(inferredSatisfaction.scorePercent)
  const pulseUrgency = highUrgencyCount > 0
    ? 'HIGH'
    : rows.some((row) => row.urgency === 'MEDIUM')
      ? 'MEDIUM'
      : 'LOW'
  const compactTargetBreakdown = input.initialView === 'intelligence'
    ? targetBreakdown.map(({ topThemes: targetThemes, ...target }) => ({
      ...target,
      topThemes: [],
      topThemeKeys: targetThemes.map((theme) => theme.themeKey),
    }))
    : targetBreakdown
  const compactQuestionBreakdown = input.initialView === 'intelligence'
    ? questionBreakdown.map((question) => ({ ...question, topThemes: [] }))
    : questionBreakdown
  const canonicalFindings = buildEventIntelligenceFindings({
    themes: topThemes,
    actions: topActions,
    targets: targetBreakdown,
    issues: attentionQueue,
    context: {
      eventName: event.name,
      eventType: event.eventType,
      ...(input.lifecyclePhase ? { lifecycle: input.lifecyclePhase } : {}),
    },
  }).slice(0, 50)
  const editorialLifecycle = input.lifecyclePhase === 'PRE_EVENT'
    ? 'PRE_EVENT'
    : input.lifecyclePhase === 'POST_EVENT'
      ? 'POST_EVENT'
      : 'DURING_EVENT'
  const eventEditorial = synthesizeEventEditorial({
    lifecycle: editorialLifecycle,
    eventName: event.name,
    facts: canonicalFindings.map((finding) => ({
      title: finding.title,
      statement: finding.description,
      kind: finding.kind,
      evidenceTier: finding.evidenceTier,
      mentionCount: finding.mentionCount,
      sentimentLabel: finding.sentimentLabel,
      scope: finding.targetKind,
    })),
  })

  return {
    eventId: event.id,
    eventName: event.name,
    eventStatus: event.status,
    eventType: event.eventType,
    accountType: account.accountType,
    filters,
    eventPulse: {
      status: highUrgencyCount > 0 ? 'ATTENTION' : 'STABLE',
      sentimentLabel,
      urgency: pulseUrgency,
      priorityLevel: mapLegacyUrgencyToEventPriority(pulseUrgency),
      summary: eventEditorial.synopsis,
      lastComputedAt: new Date().toISOString(),
    },
    responseCount,
    capturedAnswerCount,
    answerCount,
    avgSentiment,
    highUrgencyCount,
    topThemes: topThemes.slice(0, 15),
    topActions: topActions.slice(0, 10),
    canonicalFindings,
    attendeeQuestions,
    targetBreakdown: compactTargetBreakdown,
    questionBreakdown: compactQuestionBreakdown,
    urgentIssues,
    attentionQueue,
    activeAttentionCount,
    pagination: { attention: attentionPage.pagination },
    structuredMetrics: input.initialView === 'intelligence' ? [] : structuredMetrics,
  }
}
