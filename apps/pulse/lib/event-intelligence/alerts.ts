import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'
import {
  canTransitionEventIssueCluster,
  isEventIssueClusterStatus,
  type EventIssueClusterStatus,
} from '@/lib/event-intelligence/contract'
import type { MixedSignalCandidate } from '@/lib/event-intelligence/structured-intelligence'
import { getSampleStrength, STRUCTURED_SIGNAL_WINDOW_MINUTES } from '@/lib/event-intelligence/structured-intelligence'
import { resolveEffectiveResponseTarget } from '@/lib/effective-response-target'

type PrismaLike = typeof prisma | PrismaClient

export class EventAlertError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'EventAlertError'
  }
}

function priorityLevel(severity: MixedSignalCandidate['severity']) {
  if (severity === 'IMMEDIATE') return 'Immediate'
  if (severity === 'SOON') return 'Soon'
  return 'Watch'
}

function legacyUrgency(severity: MixedSignalCandidate['severity']) {
  if (severity === 'IMMEDIATE') return 'HIGH'
  if (severity === 'SOON') return 'MEDIUM'
  return 'LOW'
}

function metricSnapshot(candidate: MixedSignalCandidate): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({
    ruleType: candidate.ruleType,
    metric: candidate.metric,
    sampleStrength: candidate.sampleStrength,
    window: candidate.window,
    supportingResponseCount: candidate.supportingResponseCount,
  })) as Prisma.InputJsonValue
}

export async function reconcileEventAlerts(input: {
  accountId: string
  eventId: string
  candidates: MixedSignalCandidate[]
  now?: Date
}, db: PrismaLike = prisma) {
  const event = await db.event.findFirst({
    where: {
      id: input.eventId,
      location: {
        accountId: input.accountId,
        account: { accountType: 'EVENTS' },
      },
    },
    select: { id: true, locationId: true },
  })
  if (!event) throw new EventAlertError('Event not found or access denied', 404)

  const answerIds = [...new Set(input.candidates.flatMap((candidate) => [
    ...candidate.structuredAnswerIds,
    ...candidate.voiceAnswerIds,
  ]))]
  const answers = answerIds.length === 0 ? [] : await db.answer.findMany({
    where: {
      id: { in: answerIds },
      response: {
        eventId: input.eventId,
        event: { location: { accountId: input.accountId } },
      },
    },
    select: {
      id: true,
      questionId: true,
      numericValue: true,
      createdAt: true,
      response: {
        select: {
          id: true,
          surveyId: true,
          surveyTargetId: true,
          surveyTarget: { select: { id: true, category: true } },
          publicSurveyLink: { select: { surveyTarget: { select: { id: true, category: true } } } },
          survey: { select: { surveyTarget: { select: { id: true, category: true } } } },
        },
      },
      answerTranscript: { select: { text: true } },
      answerEventIntelligence: {
        select: { sentimentScore: true },
      },
    },
  })
  const answerById = new Map(answers.map((answer) => [answer.id, answer]))
  const now = input.now ?? new Date()

  return db.$transaction(async (tx) => {
    const reconciled: Array<{ id: string; key: string; status: string }> = []
    for (const candidate of input.candidates) {
      const matchingVoiceCluster = candidate.ruleType === 'REPEATED_NEGATIVE_THEME' && candidate.taxonomyKey
        ? await tx.eventIssueCluster.findFirst({
          where: {
            eventId: input.eventId,
            surveyTargetId: candidate.surveyTargetId,
            taxonomyKey: candidate.taxonomyKey,
            ruleType: 'VOICE_OPERATIONAL',
          },
          select: { id: true, clusterKey: true, status: true },
        })
        : null
      const create = {
          clusterKey: candidate.key,
          accountId: input.accountId,
          locationId: event.locationId,
          eventId: input.eventId,
          surveyId: candidate.surveyId,
          surveyTargetId: candidate.surveyTargetId,
          questionId: candidate.questionId,
          taxonomyKey: candidate.taxonomyKey ?? 'structured_score',
          title: candidate.title,
          summary: candidate.summary,
          priorityLevel: priorityLevel(candidate.severity),
          legacyUrgency: legacyUrgency(candidate.severity),
          confidence: null,
          evidenceCount: 0,
          firstSeenAt: now,
          lastSeenAt: now,
          recommendedNextStep: null,
          status: 'NEW',
          ruleType: candidate.ruleType,
          metricSnapshotJson: metricSnapshot(candidate),
          statusChangedAt: now,
        }
      const update = {
          surveyId: candidate.surveyId,
          surveyTargetId: candidate.surveyTargetId,
          questionId: candidate.questionId,
          taxonomyKey: candidate.taxonomyKey ?? 'structured_score',
          title: candidate.title,
          summary: candidate.summary,
          priorityLevel: priorityLevel(candidate.severity),
          legacyUrgency: legacyUrgency(candidate.severity),
          lastSeenAt: now,
          ruleType: candidate.ruleType,
          metricSnapshotJson: metricSnapshot(candidate),
        }
      const cluster = matchingVoiceCluster
        ? await tx.eventIssueCluster.update({
          where: { id: matchingVoiceCluster.id },
          data: update,
          select: { id: true, clusterKey: true, status: true },
        })
        : await tx.eventIssueCluster.upsert({
          where: { clusterKey: candidate.key },
          create,
          update,
          select: { id: true, clusterKey: true, status: true },
        })

      for (const answerId of [...candidate.structuredAnswerIds, ...candidate.voiceAnswerIds]) {
        const answer = answerById.get(answerId)
        if (!answer) continue
        const effectiveTarget = resolveEffectiveResponseTarget({
          publicSurveyLink: answer.response.publicSurveyLink,
          responseTarget: answer.response.surveyTarget,
          survey: answer.response.survey,
        })
        await tx.eventIssueEvidence.upsert({
          where: { clusterId_answerId: { clusterId: cluster.id, answerId } },
          create: {
            clusterId: cluster.id,
            accountId: input.accountId,
            locationId: event.locationId,
            eventId: input.eventId,
            surveyId: answer.response.surveyId,
            surveyTargetId: effectiveTarget?.targetId ?? answer.response.surveyTargetId,
            responseId: answer.response.id,
            answerId,
            questionId: answer.questionId,
            transcriptSnippet: answer.answerTranscript?.text?.slice(0, 320) ?? '',
            sentimentScore: answer.answerEventIntelligence?.sentimentScore ?? null,
            priorityLevel: priorityLevel(candidate.severity),
            createdAt: answer.createdAt,
          },
          update: {
            priorityLevel: priorityLevel(candidate.severity),
            transcriptSnippet: answer.answerTranscript?.text?.slice(0, 320) ?? '',
            sentimentScore: answer.answerEventIntelligence?.sentimentScore ?? null,
          },
        })
      }

      const evidence = await tx.eventIssueEvidence.findMany({
        where: { clusterId: cluster.id },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      await tx.eventIssueCluster.update({
        where: { id: cluster.id },
        data: {
          evidenceCount: evidence.length,
          firstSeenAt: evidence[0]?.createdAt ?? now,
          lastSeenAt: evidence[evidence.length - 1]?.createdAt ?? now,
        },
      })
      reconciled.push({ id: cluster.id, key: cluster.clusterKey, status: cluster.status })
    }
    return reconciled
  })
}

async function findScopedAlert(input: {
  accountId: string
  eventId: string
  clusterId: string
  lifecyclePhase?: ResolvedEventLifecyclePhase
}, db: PrismaLike) {
  const responsePhaseWhere = input.lifecyclePhase !== undefined
    ? responseCollectionPhaseWhere(input.lifecyclePhase)
    : null
  const alert = await db.eventIssueCluster.findFirst({
    where: {
      id: input.clusterId,
      eventId: input.eventId,
      accountId: input.accountId,
      ...(responsePhaseWhere ? { evidence: { some: { response: responsePhaseWhere } } } : {}),
      event: {
        location: {
          accountId: input.accountId,
          account: { accountType: 'EVENTS' },
        },
      },
    },
    include: {
      evidence: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        ...(responsePhaseWhere ? { where: { response: responsePhaseWhere } } : {}),
        include: {
          answer: {
            select: {
              numericValue: true,
              objectKey: true,
              promptLabel: true,
              answerTranscript: { select: { text: true } },
            },
          },
          question: { select: { id: true, label: true, type: true } },
          surveyTarget: { select: { id: true, name: true, eventStructureItemId: true } },
        },
      },
      notes: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!alert) throw new EventAlertError('Alert not found or access denied', 404)
  return alert
}

export async function getEventAlert(input: {
  accountId: string
  eventId: string
  clusterId: string
  lifecyclePhase?: ResolvedEventLifecyclePhase
  now?: Date
}, db: PrismaLike = prisma) {
  const alert = await findScopedAlert(input, db)
  const users = await db.user.findMany({
    where: { accountMemberships: { some: { accountId: input.accountId } }, isActive: true },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  const userById = new Map(users.map((user) => [user.id, user]))
  const snapshot = alert.metricSnapshotJson as {
    metric?: { questionId?: string; questionType?: string; surveyTargetId?: string | null }
  } | null
  const metric = snapshot?.metric
  let interventionMovement: {
    status: 'IMPROVED' | 'WORSENED' | 'NO_CLEAR_MOVEMENT' | 'NOT_ENOUGH_EVIDENCE'
    label: string
    before: { average: number | null; count: number }
    after: { average: number | null; count: number }
    change: number | null
    sampleStrength: ReturnType<typeof getSampleStrength>
  } | null = null
  if (alert.actingAt && metric?.questionId) {
    const beforeStart = new Date(alert.actingAt.getTime() - STRUCTURED_SIGNAL_WINDOW_MINUTES * 60_000)
    const now = input.now ?? new Date()
    const afterEnd = new Date(Math.min(now.getTime(), alert.actingAt.getTime() + STRUCTURED_SIGNAL_WINDOW_MINUTES * 60_000))
    const rows = await db.answer.findMany({
      where: {
        status: 'COMPLETED',
        numericValue: { not: null },
        questionId: metric.questionId,
        response: {
          eventId: input.eventId,
          status: 'COMPLETED',
          ...(input.lifecyclePhase !== undefined ? responseCollectionPhaseWhere(input.lifecyclePhase) : {}),
          ...(metric.surveyTargetId ? { surveyTargetId: metric.surveyTargetId } : {}),
          completedAt: { gte: beforeStart, lte: afterEnd },
          event: { location: { accountId: input.accountId } },
        },
      },
      select: {
        numericValue: true,
        response: { select: { completedAt: true } },
      },
    })
    const before = rows.filter((row) => row.response.completedAt && row.response.completedAt < alert.actingAt!)
    const after = rows.filter((row) => row.response.completedAt && row.response.completedAt >= alert.actingAt!)
    const avg = (values: typeof rows) => values.length === 0
      ? null
      : Math.round((values.reduce((sum, row) => sum + (row.numericValue ?? 0), 0) / values.length) * 100) / 100
    const beforeAverage = avg(before)
    const afterAverage = avg(after)
    const change = beforeAverage !== null && afterAverage !== null
      ? Math.round((afterAverage - beforeAverage) * 100) / 100
      : null
    const sampleStrength = getSampleStrength({
      count: before.length + after.length,
      precedingCount: before.length,
      recentCount: after.length,
    })
    const enough = before.length >= 3 && after.length >= 3
    const clearThreshold = metric.questionType === 'RECOMMENDATION_0_TO_10' ? 0.5 : 0.25
    const status = !enough || change === null
      ? 'NOT_ENOUGH_EVIDENCE'
      : change >= clearThreshold
        ? 'IMPROVED'
        : change <= -clearThreshold
          ? 'WORSENED'
          : 'NO_CLEAR_MOVEMENT'
    interventionMovement = {
      status,
      label: status === 'IMPROVED'
        ? 'Improved after action was recorded'
        : status === 'WORSENED'
          ? 'Worsened after action was recorded'
          : status === 'NO_CLEAR_MOVEMENT'
            ? 'No clear movement yet'
            : 'Not enough evidence',
      before: { average: beforeAverage, count: before.length },
      after: { average: afterAverage, count: after.length },
      change,
      sampleStrength,
    }
  }
  return {
    ...alert,
    owner: alert.ownerUserId ? userById.get(alert.ownerUserId) ?? null : null,
    availableOwners: users,
    notes: alert.notes.map((note) => ({ ...note, author: userById.get(note.authorUserId) ?? null })),
    interventionMovement,
  }
}

export async function transitionEventAlert(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  status: unknown
  reason?: unknown
  now?: Date
}, db: PrismaLike = prisma) {
  if (!isEventIssueClusterStatus(input.status)) throw new EventAlertError('Invalid alert status', 400)
  const alert = await findScopedAlert(input, db)
  const current = alert.status as EventIssueClusterStatus
  if (!isEventIssueClusterStatus(current)) throw new EventAlertError('Alert has an unsupported legacy status', 409)
  if (!canTransitionEventIssueCluster(current, input.status)) {
    throw new EventAlertError(`Cannot transition alert from ${current} to ${input.status}`, 409)
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if ((input.status === 'RESOLVED' || input.status === 'DISMISSED') && !reason) {
    throw new EventAlertError('A reason is required to resolve or dismiss an alert', 400)
  }
  const now = input.now ?? new Date()
  const data: Record<string, unknown> = { status: input.status, statusChangedAt: now }
  if (input.status === 'ACKNOWLEDGED') Object.assign(data, { acknowledgedAt: now, acknowledgedByUserId: input.actorUserId })
  if (input.status === 'ACTING') Object.assign(data, { actingAt: now, actingByUserId: input.actorUserId })
  if (input.status === 'RESOLVED') Object.assign(data, { resolvedAt: now, resolvedByUserId: input.actorUserId, resolutionReason: reason })
  if (input.status === 'DISMISSED') Object.assign(data, { dismissedAt: now, dismissedByUserId: input.actorUserId, dismissalReason: reason })
  if (input.status === 'NEW') Object.assign(data, {
    reopenedAt: now,
    reopenedByUserId: input.actorUserId,
    occurrenceCount: { increment: 1 },
    resolutionReason: null,
    dismissalReason: null,
  })
  return db.eventIssueCluster.update({ where: { id: alert.id }, data })
}

export async function assignEventAlert(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  ownerUserId: unknown
  now?: Date
}, db: PrismaLike = prisma) {
  const alert = await findScopedAlert(input, db)
  const ownerUserId = typeof input.ownerUserId === 'string' ? input.ownerUserId.trim() : ''
  if (!ownerUserId) throw new EventAlertError('ownerUserId is required', 400)
  const owner = await db.user.findFirst({
    where: {
      id: ownerUserId,
      isActive: true,
      accountMemberships: { some: { accountId: input.accountId } },
    },
    select: { id: true },
  })
  if (!owner) throw new EventAlertError('Owner not found in this account', 404)
  return db.eventIssueCluster.update({
    where: { id: alert.id },
    data: {
      ownerUserId: owner.id,
      ownerAssignedAt: input.now ?? new Date(),
      ownerAssignedByUserId: input.actorUserId,
    },
  })
}

export async function addEventAlertNote(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  body: unknown
}, db: PrismaLike = prisma) {
  const alert = await findScopedAlert(input, db)
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!body || body.length > 2000) throw new EventAlertError('Note must be between 1 and 2000 characters', 400)
  return db.eventAlertNote.create({
    data: {
      clusterId: alert.id,
      accountId: input.accountId,
      eventId: input.eventId,
      authorUserId: input.actorUserId,
      body,
    },
  })
}
