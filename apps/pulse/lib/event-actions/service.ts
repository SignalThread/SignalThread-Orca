import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isEventIssueClusterStatus } from '@/lib/event-intelligence/contract'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'
import {
  ActionAssignmentEmailProviderError,
  getActionAssignmentEmailProvider,
  type ActionAssignmentEmailProvider,
} from './assignment-email'
import {
  canTransitionEventAction,
  eventActionVoiceObjectPrefix,
  isEventActionClassification,
  isEventActionStatus,
  mapIssueStatusToActionStatus,
  parseEventActionPriority,
  parseIdempotencyKey,
  parseOptionalDate,
  type EventActionClassification,
  type EventActionStatus,
} from './contract'

type PrismaLike = typeof prisma | PrismaClient
type Transaction = Prisma.TransactionClient

export class EventActionError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'EventActionError'
  }
}

const actionInclude = {
  evidence: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      answer: {
        select: {
          id: true,
          questionKey: true,
          numericValue: true,
          objectKey: true,
          promptLabel: true,
          answerTranscript: { select: { text: true } },
        },
      },
      question: { select: { id: true, label: true, type: true } },
      response: {
        select: {
          id: true,
          anonymousId: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      },
      surveyTarget: {
        select: {
          id: true,
          name: true,
          category: true,
          eventStructureItemId: true,
          speakerAssignmentId: true,
          eventStructureItem: { select: { id: true, name: true } },
          speakerAssignment: {
            select: {
              id: true,
              role: true,
              speaker: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  actionHistory: { orderBy: { createdAt: 'asc' as const } },
  actionUpdates: { orderBy: { createdAt: 'asc' as const } },
  actionDeliveries: {
    orderBy: { createdAt: 'desc' as const },
    include: { attempts: { orderBy: { attemptNumber: 'asc' as const } } },
  },
} satisfies Prisma.EventIssueClusterInclude

function scopedWhere(accountId: string, eventId: string, clusterId?: string) {
  return {
    ...(clusterId ? { id: clusterId } : {}),
    accountId,
    eventId,
    event: {
      location: {
        accountId,
        account: { accountType: 'EVENTS' as const },
      },
    },
  }
}

async function findScopedCluster(
  tx: Transaction,
  input: { accountId: string; eventId: string; clusterId: string },
  requireAction = true,
) {
  const cluster = await tx.eventIssueCluster.findFirst({
    where: {
      ...scopedWhere(input.accountId, input.eventId, input.clusterId),
      ...(requireAction ? { actionClassification: { not: null } } : {}),
    },
  })
  if (!cluster) {
    throw new EventActionError(
      requireAction ? 'Action not found or access denied' : 'Finding not found or access denied',
      404,
    )
  }
  return cluster
}

function requiredIdempotencyKey(value: unknown) {
  const key = parseIdempotencyKey(value)
  if (!key) throw new EventActionError('A valid idempotencyKey is required', 400)
  return key
}

async function isReplay(tx: Transaction, clusterId: string, idempotencyKey: string) {
  return Boolean(await tx.eventActionHistory.findUnique({
    where: { clusterId_idempotencyKey: { clusterId, idempotencyKey } },
    select: { id: true },
  }))
}

async function scopedOwner(tx: Transaction, accountId: string, ownerUserId: unknown) {
  if (ownerUserId === null) return null
  const id = typeof ownerUserId === 'string' ? ownerUserId.trim() : ''
  if (!id) throw new EventActionError('ownerUserId must be an active user or null', 400)
  const owner = await tx.user.findFirst({
    where: { id, accountId, isActive: true },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  if (!owner) throw new EventActionError('Owner not found in this account', 404)
  return owner
}

function requiredDeepLink(value: unknown) {
  const deepLink = typeof value === 'string' ? value.trim() : ''
  try {
    const url = new URL(deepLink)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid protocol')
  } catch {
    throw new EventActionError('A valid action deepLink is required', 400)
  }
  return deepLink
}

function deliveryFailure(error: unknown) {
  if (error instanceof ActionAssignmentEmailProviderError) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'provider_request_failed',
    message: error instanceof Error ? error.message : 'Assignment email delivery failed',
  }
}

async function attemptAssignmentDelivery(input: {
  accountId: string
  eventId: string
  clusterId: string
  deliveryId: string
  idempotencyKey: string
  now: Date
}, provider: ActionAssignmentEmailProvider, db: PrismaLike) {
  const prepared = await db.$transaction(async (tx) => {
    const delivery = await tx.eventActionAssignmentDelivery.findFirst({
      where: {
        id: input.deliveryId,
        clusterId: input.clusterId,
        accountId: input.accountId,
        eventId: input.eventId,
      },
    })
    if (!delivery) throw new EventActionError('Assignment delivery not found or access denied', 404)
    if (delivery.status === 'SENT') return { delivery, attempt: null }
    const existingAttempt = await tx.eventActionDeliveryAttempt.findUnique({
      where: {
        deliveryId_idempotencyKey: {
          deliveryId: delivery.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    })
    if (existingAttempt) return { delivery, attempt: null }
    const activeRecipient = await tx.user.findFirst({
      where: {
        id: delivery.recipientUserId,
        isActive: true,
        accountMemberships: { some: { accountId: input.accountId } },
      },
      select: { id: true },
    })
    if (!activeRecipient) throw new EventActionError('Assignment recipient is no longer active in this account', 409)
    const counted = await tx.eventActionAssignmentDelivery.update({
      where: { id: delivery.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: input.now,
        provider: provider.name,
        status: 'PENDING',
        failureCode: null,
        failureMessage: null,
      },
    })
    const attempt = await tx.eventActionDeliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        accountId: input.accountId,
        eventId: input.eventId,
        idempotencyKey: input.idempotencyKey,
        attemptNumber: counted.attemptCount,
        status: 'PENDING',
        provider: provider.name,
        attemptedAt: input.now,
      },
    })
    return { delivery: counted, attempt }
  })
  if (!prepared.attempt) return prepared.delivery

  // Keep one provider key for the lifetime of a delivery. If the provider
  // accepted a send but our status write was interrupted, a later explicit
  // retry asks for the same message instead of creating a duplicate.
  const providerIdempotencyKey = `action-assignment/${prepared.delivery.id}`
  try {
    const sent = await provider.send({
      recipientEmail: prepared.delivery.recipientEmail,
      recipientName: prepared.delivery.recipientName,
      actionTitle: prepared.delivery.actionTitle,
      priority: prepared.delivery.actionPriority,
      dueAt: prepared.delivery.actionDueAt,
      deepLink: prepared.delivery.deepLink,
      idempotencyKey: providerIdempotencyKey,
    })
    return db.$transaction(async (tx) => {
      await tx.eventActionDeliveryAttempt.update({
        where: { id: prepared.attempt!.id },
        data: {
          status: 'SENT',
          providerMessageId: sent.messageId,
          completedAt: input.now,
        },
      })
      return tx.eventActionAssignmentDelivery.update({
        where: { id: prepared.delivery.id },
        data: {
          status: 'SENT',
          providerMessageId: sent.messageId,
          sentAt: input.now,
          failureCode: null,
          failureMessage: null,
        },
      })
    })
  } catch (error) {
    const failure = deliveryFailure(error)
    return db.$transaction(async (tx) => {
      await tx.eventActionDeliveryAttempt.update({
        where: { id: prepared.attempt!.id },
        data: {
          status: 'FAILED',
          failureCode: failure.code,
          failureMessage: failure.message,
          completedAt: input.now,
        },
      })
      return tx.eventActionAssignmentDelivery.update({
        where: { id: prepared.delivery.id },
        data: {
          status: 'FAILED',
          failureCode: failure.code,
          failureMessage: failure.message,
        },
      })
    })
  }
}

function historyJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function loadActionAfterReplay(
  tx: Transaction,
  input: { accountId: string; eventId: string; clusterId: string },
) {
  return findScopedCluster(tx, input, true)
}

async function recordNoChange(
  tx: Transaction,
  input: { accountId: string; eventId: string; clusterId: string; actorUserId: string },
  idempotencyKey: string,
  operation: string,
  value: string | null,
  now: Date,
) {
  await tx.eventActionHistory.create({
    data: {
      clusterId: input.clusterId,
      accountId: input.accountId,
      eventId: input.eventId,
      actorUserId: input.actorUserId,
      idempotencyKey,
      type: 'NO_CHANGE',
      fromValue: value,
      toValue: value,
      detailsJson: historyJson({ operation }),
      createdAt: now,
    },
  })
}

export async function listEventActions(input: {
  accountId: string
  eventId: string
  lifecyclePhase?: ResolvedEventLifecyclePhase
}, db: PrismaLike = prisma) {
  const responsePhaseWhere = responseCollectionPhaseWhere(input.lifecyclePhase)
  const evidenceScope = { evidence: { some: { response: responsePhaseWhere } } }
  const [actions, availableFindings, owners] = await Promise.all([
    db.eventIssueCluster.findMany({
      where: {
        ...scopedWhere(input.accountId, input.eventId),
        actionClassification: { not: null },
        actionStatus: { not: null },
        ...evidenceScope,
      },
      orderBy: [{ actionDueAt: 'asc' }, { lastSeenAt: 'desc' }],
      include: {
        _count: { select: { evidence: { where: { response: responsePhaseWhere } }, actionUpdates: true } },
      },
    }),
    db.eventIssueCluster.findMany({
      where: {
        ...scopedWhere(input.accountId, input.eventId),
        actionClassification: null,
        actionStatus: null,
        ...evidenceScope,
      },
      orderBy: [{ lastSeenAt: 'desc' }],
      select: {
        id: true,
        title: true,
        summary: true,
        taxonomyKey: true,
        priorityLevel: true,
        status: true,
        ownerUserId: true,
        _count: { select: { evidence: { where: { response: responsePhaseWhere } } } },
        lastSeenAt: true,
      },
      take: 50,
    }),
    db.user.findMany({
      where: { accountMemberships: { some: { accountId: input.accountId } }, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    }),
  ])
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]))
  return {
    actions: actions.map((action) => ({
      ...action,
      owner: action.ownerUserId ? ownerById.get(action.ownerUserId) ?? null : null,
    })),
    availableFindings: availableFindings.map((finding) => ({
      ...finding,
      evidenceCount: finding._count?.evidence ?? 0,
      owner: finding.ownerUserId ? ownerById.get(finding.ownerUserId) ?? null : null,
    })),
    availableOwners: owners,
  }
}

export async function getEventAction(input: {
  accountId: string
  eventId: string
  clusterId: string
  lifecyclePhase?: ResolvedEventLifecyclePhase
}, db: PrismaLike = prisma) {
  const responsePhaseWhere = responseCollectionPhaseWhere(input.lifecyclePhase)
  const [action, owners] = await Promise.all([
    db.eventIssueCluster.findFirst({
      where: {
        ...scopedWhere(input.accountId, input.eventId, input.clusterId),
        actionClassification: { not: null },
        actionStatus: { not: null },
        evidence: { some: { response: responsePhaseWhere } },
      },
      include: {
        ...actionInclude,
        evidence: {
          ...actionInclude.evidence,
          where: { response: responsePhaseWhere },
        },
      },
    }),
    db.user.findMany({
      where: { accountMemberships: { some: { accountId: input.accountId } }, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
    }),
  ])
  if (!action) throw new EventActionError('Action not found or access denied', 404)
  return {
    ...action,
    owner: action.ownerUserId ? owners.find((owner) => owner.id === action.ownerUserId) ?? null : null,
    availableOwners: owners,
  }
}

export async function convertEventFindingToAction(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  classification: unknown
  title?: unknown
  ownerUserId?: unknown
  priority?: unknown
  dueAt?: unknown
  initialUpdate?: unknown
  idempotencyKey: unknown
  now?: Date
}, db: PrismaLike = prisma) {
  if (!isEventActionClassification(input.classification)) {
    throw new EventActionError('Invalid action classification', 400)
  }
  const classification = input.classification
  const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey)
  const title = input.title === undefined ? undefined : (typeof input.title === 'string' ? input.title.trim() : '')
  if (title !== undefined && (!title || title.length > 500)) {
    throw new EventActionError('Action title must be between 1 and 500 characters', 400)
  }
  const priority = input.priority === undefined ? undefined : parseEventActionPriority(input.priority)
  if (input.priority !== undefined && !priority) throw new EventActionError('Invalid action priority', 400)
  const initialUpdate = input.initialUpdate === undefined ? '' : (typeof input.initialUpdate === 'string' ? input.initialUpdate.trim() : '')
  if (initialUpdate.length > 4000) throw new EventActionError('Initial update must be 4000 characters or fewer', 400)
  const dueAt = input.dueAt === undefined ? null : parseOptionalDate(input.dueAt)
  if (dueAt === undefined) throw new EventActionError('Invalid dueAt value', 400)
  const now = input.now ?? new Date()

  return db.$transaction(async (tx) => {
    if (await isReplay(tx, input.clusterId, idempotencyKey)) {
      return loadActionAfterReplay(tx, input)
    }
    const cluster = await findScopedCluster(tx, input, false)
    if (cluster.actionClassification !== null || cluster.actionStatus !== null) {
      throw new EventActionError('Finding has already been converted to an action', 409)
    }
    if (!isEventIssueClusterStatus(cluster.status)) {
      throw new EventActionError('Finding has an unsupported legacy status', 409)
    }
    const ownerUserId = input.ownerUserId === undefined
      ? cluster.ownerUserId
      : (await scopedOwner(tx, input.accountId, input.ownerUserId))?.id ?? null
    if (ownerUserId && input.ownerUserId === undefined) {
      await scopedOwner(tx, input.accountId, ownerUserId)
    }
    const actionStatus = mapIssueStatusToActionStatus(
      cluster.status,
      Boolean(ownerUserId),
      classification,
    )
    const actionResolution = classification === 'INFORMATIONAL'
      ? 'No action required'
      : actionStatus === 'COMPLETE'
        ? cluster.resolutionReason
        : actionStatus === 'DISMISSED'
          ? cluster.dismissalReason
          : null

    const action = await tx.eventIssueCluster.update({
      where: { id: cluster.id },
      data: {
        actionClassification: classification,
        actionStatus,
        actionDueAt: dueAt,
        ...(title !== undefined ? { title } : {}),
        ...(priority ? { priorityLevel: priority } : {}),
        actionResolution,
        actionConvertedAt: now,
        actionConvertedByUserId: input.actorUserId,
        ownerUserId,
        ...(ownerUserId && ownerUserId !== cluster.ownerUserId
          ? { ownerAssignedAt: now, ownerAssignedByUserId: input.actorUserId }
          : {}),
      },
    })
    await tx.eventActionHistory.create({
      data: {
        clusterId: cluster.id,
        accountId: input.accountId,
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        idempotencyKey,
        type: 'CONVERTED',
        fromValue: cluster.status,
        toValue: actionStatus,
        detailsJson: historyJson({
          classification,
          ownerUserId,
          dueAt: dueAt?.toISOString() ?? null,
        }),
        createdAt: now,
      },
    })
    if (initialUpdate) {
      const update = await tx.eventActionUpdate.create({
        data: {
          clusterId: cluster.id,
          accountId: input.accountId,
          eventId: input.eventId,
          authorUserId: input.actorUserId,
          idempotencyKey: `${idempotencyKey}:initial-update`,
          kind: 'WRITTEN',
          body: initialUpdate,
          createdAt: now,
        },
      })
      await tx.eventActionHistory.create({
        data: {
          clusterId: cluster.id,
          accountId: input.accountId,
          eventId: input.eventId,
          actorUserId: input.actorUserId,
          idempotencyKey: `${idempotencyKey}:initial-update-history`,
          type: 'UPDATE_ADDED',
          toValue: 'WRITTEN',
          detailsJson: historyJson({ updateId: update.id }),
          createdAt: now,
        },
      })
    }
    return action
  })
}

export async function assignEventAction(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  ownerUserId: unknown
  idempotencyKey: unknown
  deepLink: unknown
  now?: Date
}, db: PrismaLike = prisma, provider: ActionAssignmentEmailProvider = getActionAssignmentEmailProvider()) {
  const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey)
  const deepLink = requiredDeepLink(input.deepLink)
  const now = input.now ?? new Date()
  const result = await db.$transaction(async (tx) => {
    if (await isReplay(tx, input.clusterId, idempotencyKey)) {
      return { action: await loadActionAfterReplay(tx, input), delivery: null }
    }
    const action = await findScopedCluster(tx, input)
    const owner = await scopedOwner(tx, input.accountId, input.ownerUserId)
    const ownerUserId = owner?.id ?? null
    if (action.ownerUserId === ownerUserId) {
      await recordNoChange(tx, input, idempotencyKey, 'ASSIGN', ownerUserId, now)
      return { action, delivery: null }
    }
    const currentStatus = action.actionStatus as EventActionStatus
    const nextStatus = ownerUserId
      ? currentStatus === 'UNASSIGNED' ? 'OPEN' : currentStatus
      : 'UNASSIGNED'
    const updated = await tx.eventIssueCluster.update({
      where: { id: action.id },
      data: {
        ownerUserId,
        ownerAssignedAt: ownerUserId ? now : null,
        ownerAssignedByUserId: ownerUserId ? input.actorUserId : null,
        actionStatus: nextStatus,
        actionBlockedReason: nextStatus === 'UNASSIGNED' ? null : action.actionBlockedReason,
      },
    })
    const history = await tx.eventActionHistory.create({
      data: {
        clusterId: action.id,
        accountId: input.accountId,
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        idempotencyKey,
        type: ownerUserId ? (action.ownerUserId ? 'REASSIGNED' : 'ASSIGNED') : 'UNASSIGNED',
        fromValue: action.ownerUserId,
        toValue: ownerUserId,
        detailsJson: historyJson({ fromStatus: currentStatus, toStatus: nextStatus }),
        createdAt: now,
      },
    })
    const delivery = owner ? await tx.eventActionAssignmentDelivery.create({
      data: {
        clusterId: action.id,
        accountId: input.accountId,
        eventId: input.eventId,
        recipientUserId: owner.id,
        recipientEmail: owner.email,
        recipientName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null,
        assignedByUserId: input.actorUserId,
        idempotencyKey,
        deepLink,
        actionTitle: action.title,
        actionPriority: action.priorityLevel,
        actionDueAt: action.actionDueAt,
        createdAt: now,
      },
    }) : null
    return { action: updated, delivery, history }
  })
  if (result.delivery) {
    await attemptAssignmentDelivery({
      accountId: input.accountId,
      eventId: input.eventId,
      clusterId: input.clusterId,
      deliveryId: result.delivery.id,
      idempotencyKey,
      now,
    }, provider, db)
  }
  return result.action
}

export async function retryEventActionAssignmentDelivery(input: {
  accountId: string
  eventId: string
  clusterId: string
  deliveryId: unknown
  idempotencyKey: unknown
  now?: Date
}, db: PrismaLike = prisma, provider: ActionAssignmentEmailProvider = getActionAssignmentEmailProvider()) {
  const deliveryId = typeof input.deliveryId === 'string' ? input.deliveryId.trim() : ''
  if (!deliveryId) throw new EventActionError('deliveryId is required', 400)
  const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey)
  return attemptAssignmentDelivery({
    accountId: input.accountId,
    eventId: input.eventId,
    clusterId: input.clusterId,
    deliveryId,
    idempotencyKey,
    now: input.now ?? new Date(),
  }, provider, db)
}

export async function transitionEventAction(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  status: unknown
  blockedReason?: unknown
  resolution?: unknown
  idempotencyKey: unknown
  now?: Date
}, db: PrismaLike = prisma) {
  if (!isEventActionStatus(input.status)) throw new EventActionError('Invalid action status', 400)
  const nextStatus = input.status
  const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey)
  const blockedReason = typeof input.blockedReason === 'string' ? input.blockedReason.trim() : ''
  const resolution = typeof input.resolution === 'string' ? input.resolution.trim() : ''
  if (nextStatus === 'BLOCKED' && !blockedReason) {
    throw new EventActionError('A blocked reason is required', 400)
  }
  if (['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(nextStatus) && !resolution) {
    throw new EventActionError('A resolution is required for a terminal status', 400)
  }
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    if (await isReplay(tx, input.clusterId, idempotencyKey)) return loadActionAfterReplay(tx, input)
    const action = await findScopedCluster(tx, input)
    const current = action.actionStatus
    if (!isEventActionStatus(current)) throw new EventActionError('Action has no canonical status', 409)
    if (!canTransitionEventAction(current, nextStatus)) {
      throw new EventActionError(`Cannot transition action from ${current} to ${nextStatus}`, 409)
    }
    if (['OPEN', 'WORKING', 'BLOCKED'].includes(nextStatus) && !action.ownerUserId) {
      throw new EventActionError('Assign an owner before moving this action into active work', 409)
    }
    const updated = await tx.eventIssueCluster.update({
      where: { id: action.id },
      data: {
        actionStatus: nextStatus,
        actionBlockedReason: nextStatus === 'BLOCKED' ? blockedReason : null,
        actionResolution: ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(nextStatus) ? resolution : null,
        ...(nextStatus === 'UNASSIGNED'
          ? { ownerUserId: null, ownerAssignedAt: null, ownerAssignedByUserId: null }
          : {}),
      },
    })
    await tx.eventActionHistory.create({
      data: {
        clusterId: action.id,
        accountId: input.accountId,
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        idempotencyKey,
        type: 'STATUS_CHANGED',
        fromValue: current,
        toValue: nextStatus,
        detailsJson: historyJson({ blockedReason: blockedReason || null, resolution: resolution || null }),
        createdAt: now,
      },
    })
    return updated
  })
}

export async function updateEventActionField(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  field: 'DUE_DATE' | 'PRIORITY' | 'CLASSIFICATION'
  value: unknown
  idempotencyKey: unknown
  now?: Date
}, db: PrismaLike = prisma) {
  const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey)
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    if (await isReplay(tx, input.clusterId, idempotencyKey)) return loadActionAfterReplay(tx, input)
    const action = await findScopedCluster(tx, input)
    let fromValue: string | null
    let toValue: string | null
    let data: Prisma.EventIssueClusterUpdateInput
    let type: 'DUE_DATE_CHANGED' | 'PRIORITY_CHANGED' | 'CLASSIFICATION_CHANGED'
    if (input.field === 'DUE_DATE') {
      const dueAt = parseOptionalDate(input.value)
      if (dueAt === undefined) throw new EventActionError('Invalid due date', 400)
      fromValue = action.actionDueAt?.toISOString() ?? null
      toValue = dueAt?.toISOString() ?? null
      data = { actionDueAt: dueAt }
      type = 'DUE_DATE_CHANGED'
    } else if (input.field === 'PRIORITY') {
      const priority = parseEventActionPriority(input.value)
      if (!priority) throw new EventActionError('Invalid action priority', 400)
      fromValue = action.priorityLevel
      toValue = priority
      data = { priorityLevel: priority }
      type = 'PRIORITY_CHANGED'
    } else {
      if (!isEventActionClassification(input.value)) {
        throw new EventActionError('Invalid action classification', 400)
      }
      fromValue = action.actionClassification
      toValue = input.value
      data = { actionClassification: input.value }
      type = 'CLASSIFICATION_CHANGED'
    }
    if (fromValue === toValue) {
      await recordNoChange(tx, input, idempotencyKey, input.field, toValue, now)
      return action
    }
    const updated = await tx.eventIssueCluster.update({ where: { id: action.id }, data })
    await tx.eventActionHistory.create({
      data: {
        clusterId: action.id,
        accountId: input.accountId,
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        idempotencyKey,
        type,
        fromValue,
        toValue,
        createdAt: now,
      },
    })
    return updated
  })
}

export async function addEventActionUpdate(input: {
  accountId: string
  eventId: string
  clusterId: string
  actorUserId: string
  kind: unknown
  body?: unknown
  voice?: { objectKey?: unknown; mimeType?: unknown; durationMs?: unknown }
  idempotencyKey: unknown
  now?: Date
}, db: PrismaLike = prisma) {
  const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey)
  const kind = input.kind
  if (kind !== 'WRITTEN' && kind !== 'VOICE') throw new EventActionError('Invalid update kind', 400)
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (kind === 'WRITTEN' && (!body || body.length > 4000)) {
    throw new EventActionError('Written update must be between 1 and 4000 characters', 400)
  }
  const objectKey = typeof input.voice?.objectKey === 'string' ? input.voice.objectKey.trim() : ''
  const mimeType = typeof input.voice?.mimeType === 'string' ? input.voice.mimeType.trim() : ''
  const durationMs = typeof input.voice?.durationMs === 'number' && Number.isInteger(input.voice.durationMs)
    ? input.voice.durationMs
    : null
  if (kind === 'VOICE') {
    const prefix = eventActionVoiceObjectPrefix(input.accountId, input.eventId, input.clusterId)
    if (!objectKey.startsWith(prefix) || !mimeType.startsWith('audio/') || !durationMs || durationMs <= 0) {
      throw new EventActionError('Voice update metadata is invalid or outside this action scope', 400)
    }
  }
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    if (await isReplay(tx, input.clusterId, idempotencyKey)) {
      const existingUpdate = await tx.eventActionUpdate.findUnique({
        where: { clusterId_idempotencyKey: { clusterId: input.clusterId, idempotencyKey } },
      })
      if (!existingUpdate) throw new EventActionError('Action update replay could not be resolved', 409)
      return existingUpdate
    }
    const action = await findScopedCluster(tx, input)
    const update = await tx.eventActionUpdate.create({
      data: {
        clusterId: action.id,
        accountId: input.accountId,
        eventId: input.eventId,
        authorUserId: input.actorUserId,
        idempotencyKey,
        kind,
        body: body || null,
        voiceObjectKey: kind === 'VOICE' ? objectKey : null,
        voiceMimeType: kind === 'VOICE' ? mimeType : null,
        voiceDurationMs: kind === 'VOICE' ? durationMs : null,
        voiceTranscriptionStatus: kind === 'VOICE' ? 'UPLOADED' : null,
        createdAt: now,
      },
    })
    await tx.eventActionHistory.create({
      data: {
        clusterId: action.id,
        accountId: input.accountId,
        eventId: input.eventId,
        actorUserId: input.actorUserId,
        idempotencyKey,
        type: 'UPDATE_ADDED',
        toValue: kind,
        detailsJson: historyJson({ updateId: update.id }),
        createdAt: now,
      },
    })
    return update
  })
}
