import type { CollectionPhase } from '@prisma/client'
import type { EventPriorityLevel, EventOperationsTaxonomyKey } from '@/lib/event-intelligence/contract'

export interface EventIssueClusterWriteInput {
  accountId: string
  locationId: string
  eventId: string
  surveyId: string | null
  surveyTargetId: string | null
  responseId: string
  collectionPhase: CollectionPhase | null
  answerId: string
  questionId: string | null
  taxonomyKey: EventOperationsTaxonomyKey
  recommendedAction: string | null
  transcriptText: string
  representativeSnippet?: string | null
  sentimentScore: number | null
  priorityLevel: EventPriorityLevel
  legacyUrgency: string
  confidence: number | null
  now?: Date
}

interface PrismaClusterTx {
  eventIssueCluster: {
    upsert: (args: unknown) => Promise<{ id: string; firstSeenAt: Date }>
    update: (args: unknown) => Promise<unknown>
  }
  eventIssueEvidence: {
    upsert: (args: unknown) => Promise<unknown>
    findMany: (args: unknown) => Promise<Array<{ priorityLevel: string; createdAt: Date }>>
  }
}

const NON_OPERATIONAL_TAXONOMY = new Set<EventOperationsTaxonomyKey>([
  'general_positive',
  'general_other',
])

const PRIORITY_RANK: Record<EventPriorityLevel, number> = {
  Immediate: 0,
  Soon: 1,
  Watch: 2,
  Informational: 3,
}

const PRIORITY_IMPACT: Record<EventPriorityLevel, number> = {
  Immediate: 1,
  Soon: 0.75,
  Watch: 0.45,
  Informational: 0.15,
}

const PRIORITY_TIME_SENSITIVITY: Record<EventPriorityLevel, number> = {
  Immediate: 1,
  Soon: 0.7,
  Watch: 0.35,
  Informational: 0.1,
}

const PRIORITY_LEGACY_URGENCY: Record<EventPriorityLevel, string> = {
  Immediate: 'HIGH',
  Soon: 'MEDIUM',
  Watch: 'LOW',
  Informational: 'LOW',
}

function normalizeClusterPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function shouldWriteEventIssueCluster(input: Pick<EventIssueClusterWriteInput, 'taxonomyKey' | 'recommendedAction' | 'priorityLevel'>): boolean {
  return Boolean(
    input.recommendedAction?.trim() &&
    !NON_OPERATIONAL_TAXONOMY.has(input.taxonomyKey) &&
    input.priorityLevel !== 'Informational',
  )
}

export function buildEventIssueClusterKey(input: Pick<EventIssueClusterWriteInput, 'eventId' | 'surveyTargetId' | 'questionId' | 'taxonomyKey' | 'recommendedAction' | 'collectionPhase'>): string {
  const titleKey = normalizeClusterPart(input.recommendedAction ?? '') || 'issue'
  const targetScope = input.surveyTargetId ?? 'event'
  const questionScope = input.questionId ?? 'all_questions'
  return [
    input.eventId,
    input.collectionPhase ?? 'UNCLASSIFIED',
    input.taxonomyKey,
    targetScope,
    questionScope,
    titleKey,
  ].join(':')
}

export function buildTranscriptSnippet(transcriptText: string, maxLength = 320): string {
  const normalized = normalizeWhitespace(transcriptText)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

function highestPriority(values: string[]): EventPriorityLevel {
  const valid = values.filter((value): value is EventPriorityLevel => value in PRIORITY_RANK)
  return valid.sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b])[0] ?? 'Informational'
}

export async function writeEventIssueClusterEvidence(
  tx: PrismaClusterTx,
  input: EventIssueClusterWriteInput,
): Promise<{ wrote: boolean; clusterId?: string; clusterKey?: string; reason?: string }> {
  if (!shouldWriteEventIssueCluster(input)) {
    return { wrote: false, reason: 'not_actionable_operational_issue' }
  }

  const now = input.now ?? new Date()
  const title = normalizeWhitespace(input.recommendedAction ?? '')
  const clusterKey = buildEventIssueClusterKey(input)
  const transcriptSnippet = input.representativeSnippet?.trim()
    ? buildTranscriptSnippet(input.representativeSnippet)
    : buildTranscriptSnippet(input.transcriptText)

  const cluster = await tx.eventIssueCluster.upsert({
    where: { clusterKey },
    create: {
      clusterKey,
      accountId: input.accountId,
      locationId: input.locationId,
      eventId: input.eventId,
      surveyId: input.surveyId,
      surveyTargetId: input.surveyTargetId,
      questionId: input.questionId,
      taxonomyKey: input.taxonomyKey,
      title,
      summary: `Operational pattern detected in ${input.taxonomyKey.replace(/_/g, ' ')} feedback.`,
      priorityLevel: input.priorityLevel,
      legacyUrgency: input.legacyUrgency,
      impactScore: PRIORITY_IMPACT[input.priorityLevel],
      timeSensitivityScore: PRIORITY_TIME_SENSITIVITY[input.priorityLevel],
      confidence: input.confidence,
      evidenceCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      recommendedNextStep: title,
      status: 'NEW',
    },
    update: {
      surveyId: input.surveyId,
      surveyTargetId: input.surveyTargetId,
      questionId: input.questionId,
      title,
      summary: `Operational pattern detected in ${input.taxonomyKey.replace(/_/g, ' ')} feedback.`,
      recommendedNextStep: title,
      lastSeenAt: now,
      confidence: input.confidence,
    },
  }) as { id: string; firstSeenAt: Date }

  await tx.eventIssueEvidence.upsert({
    where: {
      clusterId_answerId: {
        clusterId: cluster.id,
        answerId: input.answerId,
      },
    },
    create: {
      clusterId: cluster.id,
      accountId: input.accountId,
      locationId: input.locationId,
      eventId: input.eventId,
      surveyId: input.surveyId,
      surveyTargetId: input.surveyTargetId,
      responseId: input.responseId,
      answerId: input.answerId,
      questionId: input.questionId,
      transcriptSnippet,
      sentimentScore: input.sentimentScore,
      priorityLevel: input.priorityLevel,
      createdAt: now,
    },
    update: {
      surveyId: input.surveyId,
      surveyTargetId: input.surveyTargetId,
      questionId: input.questionId,
      transcriptSnippet,
      sentimentScore: input.sentimentScore,
      priorityLevel: input.priorityLevel,
    },
  })

  const evidence = await tx.eventIssueEvidence.findMany({
    where: {
      clusterId: cluster.id,
    },
    select: {
      priorityLevel: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const rolledPriority = highestPriority(evidence.map((row) => row.priorityLevel))
  const firstSeenAt = evidence[0]?.createdAt ?? cluster.firstSeenAt ?? now
  const lastSeenAt = evidence[evidence.length - 1]?.createdAt ?? now

  await tx.eventIssueCluster.update({
    where: { id: cluster.id },
    data: {
      priorityLevel: rolledPriority,
      legacyUrgency: PRIORITY_LEGACY_URGENCY[rolledPriority],
      impactScore: PRIORITY_IMPACT[rolledPriority],
      timeSensitivityScore: PRIORITY_TIME_SENSITIVITY[rolledPriority],
      evidenceCount: evidence.length,
      firstSeenAt,
      lastSeenAt,
    },
  })

  return { wrote: true, clusterId: cluster.id, clusterKey }
}
