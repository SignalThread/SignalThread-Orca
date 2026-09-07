import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEventActionUpdate,
  assignEventAction,
  convertEventFindingToAction,
  EventActionError,
  listEventActions,
  retryEventActionAssignmentDelivery,
  transitionEventAction,
  updateEventActionField,
} from './service'

const now = new Date('2026-07-30T19:00:00.000Z')
const deepLink = 'https://voice.signalthread.ai/login?next=%2Fapp%2Fevents%2Fevent_1%2Fdashboard%3Faccount%3Devents-co%26tab%3Dactions%26actionId%3Dcluster_1'
const provider = {
  name: 'fake-email',
  send: vi.fn().mockResolvedValue({ messageId: 'email_1' }),
}

function cluster(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cluster_1',
    accountId: 'account_1',
    eventId: 'event_1',
    status: 'ACKNOWLEDGED',
    priorityLevel: 'Soon',
    ownerUserId: null,
    ownerAssignedAt: null,
    ownerAssignedByUserId: null,
    resolutionReason: null,
    dismissalReason: null,
    actionClassification: 'DURING_EVENT',
    actionStatus: 'OPEN',
    actionDueAt: null,
    actionBlockedReason: null,
    actionResolution: null,
    ...overrides,
  }
}

function dbMock(initial = cluster()) {
  const historyByKey = new Map<string, { id: string }>()
  let delivery: Record<string, any> | null = null
  const attemptsByKey = new Map<string, Record<string, any>>()
  const tx = {
    eventIssueCluster: {
      findFirst: vi.fn().mockResolvedValue(initial),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...initial, ...data })),
    },
    eventActionHistory: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => historyByKey.get(where.clusterId_idempotencyKey.idempotencyKey) ?? null),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `history_${historyByKey.size + 1}`, ...data }
        historyByKey.set(data.idempotencyKey, row)
        return row
      }),
    },
    eventActionUpdate: {
      create: vi.fn().mockResolvedValue({ id: 'update_1', kind: 'WRITTEN' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'update_1', kind: 'WRITTEN' }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'owner_1', email: 'owner@example.com', firstName: 'Alex', lastName: 'Rivera',
      }),
    },
    eventActionAssignmentDelivery: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        delivery = {
          id: 'delivery_1', status: 'PENDING', provider: null, providerMessageId: null,
          attemptCount: 0, lastAttemptAt: null, sentAt: null, failureCode: null, failureMessage: null,
          ...data,
        }
        return delivery
      }),
      findFirst: vi.fn().mockImplementation(async () => delivery),
      update: vi.fn().mockImplementation(async ({ data }: any) => {
        if (!delivery) return null
        const attemptCount = typeof data.attemptCount === 'object'
          ? Number(delivery.attemptCount) + data.attemptCount.increment
          : data.attemptCount ?? delivery.attemptCount
        delivery = { ...delivery, ...data, attemptCount }
        return delivery
      }),
    },
    eventActionDeliveryAttempt: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => attemptsByKey.get(where.deliveryId_idempotencyKey.idempotencyKey) ?? null),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const row = { id: `attempt_${attemptsByKey.size + 1}`, ...data }
        attemptsByKey.set(data.idempotencyKey, row)
        return row
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const entry = [...attemptsByKey.entries()].find(([, value]) => value.id === where.id)
        if (!entry) return null
        const row = { ...entry[1], ...data }
        attemptsByKey.set(entry[0], row)
        return row
      }),
    },
  }
  return {
    tx,
    get delivery() { return delivery },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  }
}

describe('canonical EventIssueCluster action service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('converts a finding explicitly and maps existing owner/status without a data backfill', async () => {
    const db = dbMock(cluster({
      status: 'ACTING',
      ownerUserId: 'owner_1',
      actionClassification: null,
      actionStatus: null,
    }))
    await convertEventFindingToAction({
      accountId: 'account_1',
      eventId: 'event_1',
      clusterId: 'cluster_1',
      actorUserId: 'actor_1',
      classification: 'DURING_EVENT',
      idempotencyKey: 'convert-request-1',
      now,
    }, db as never)

    expect(db.tx.eventIssueCluster.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actionClassification: 'DURING_EVENT',
        actionStatus: 'WORKING',
        ownerUserId: 'owner_1',
        actionConvertedAt: now,
      }),
    }))
    expect(db.tx.eventActionHistory.create).toHaveBeenCalledTimes(1)
    expect(db.tx.eventActionHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'CONVERTED', fromValue: 'ACTING', toValue: 'WORKING' }),
    }))
  })

  it('keeps conversion explicit while persisting editable action fields and an optional initial update', async () => {
    const db = dbMock(cluster({ actionClassification: null, actionStatus: null, status: 'NEW' }))
    await convertEventFindingToAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      classification: 'DURING_EVENT', title: 'Updated action title', priority: 'Immediate',
      ownerUserId: null, dueAt: '2026-08-01T10:00:00.000Z', initialUpdate: 'Team has started.',
      idempotencyKey: 'convert-with-fields-1', now,
    }, db as never)

    expect(db.tx.eventIssueCluster.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: 'Updated action title', priorityLevel: 'Immediate' }),
    }))
    expect(db.tx.eventActionUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'WRITTEN', body: 'Team has started.' }),
    }))
    expect(db.tx.eventActionHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'UPDATE_ADDED' }),
    }))
  })

  it('does not treat a pre-existing cluster owner as proof of conversion', async () => {
    const db = dbMock(cluster({ ownerUserId: 'owner_1', actionClassification: null, actionStatus: null, status: 'NEW' }))
    await expect(convertEventFindingToAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      classification: 'DURING_EVENT', idempotencyKey: 'convert-owner-only-1', now,
    }, db as never)).resolves.toMatchObject({ actionClassification: 'DURING_EVENT' })
  })

  it('lists only converted actions and separately exposes unconverted source findings', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ ...cluster(), _count: { evidence: 2, actionUpdates: 1 } }])
      .mockResolvedValueOnce([{ id: 'finding_1', title: 'Source finding', ownerUserId: null }])
    const db = {
      eventIssueCluster: { findMany },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'owner_1', email: 'owner@example.com' }]) },
    }
    const result = await listEventActions({
      accountId: 'account_1', eventId: 'event_1', lifecyclePhase: 'POST_EVENT',
    }, db as never)

    expect(findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        actionClassification: { not: null },
        actionStatus: { not: null },
        OR: [
          { ruleType: 'MANUAL_ACTION' },
          { evidence: { some: { response: { collectionPhase: { in: ['DURING', 'POST'] } } } } },
        ],
      }),
      include: expect.objectContaining({
        _count: { select: { evidence: { where: { response: { collectionPhase: { in: ['DURING', 'POST'] } } } }, actionUpdates: true } },
      }),
    }))
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        actionClassification: null,
        actionStatus: null,
        evidence: { some: { response: { collectionPhase: { in: ['DURING', 'POST'] } } } },
      }),
    }))
    expect(result.actions).toHaveLength(1)
    expect(result.availableFindings).toEqual([expect.objectContaining({ id: 'finding_1', owner: null })])
  })

  it('treats an identical idempotency key as a replay without another mutation or history row', async () => {
    const db = dbMock()
    db.tx.eventActionHistory.findUnique.mockResolvedValue({ id: 'history_existing' })
    await assignEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', ownerUserId: 'owner_1', idempotencyKey: 'assign-request-1', now,
      deepLink,
    }, db as never)
    expect(db.tx.eventIssueCluster.update).not.toHaveBeenCalled()
    expect(db.tx.eventActionHistory.create).not.toHaveBeenCalled()
  })

  it('rejects a cross-account or inactive owner and does not mutate the action', async () => {
    const db = dbMock()
    db.tx.user.findFirst.mockResolvedValue(null)
    await expect(assignEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', ownerUserId: 'other_account_user',
      idempotencyKey: 'assign-request-2', deepLink, now,
    }, db as never)).rejects.toMatchObject({ status: 404 })
    expect(db.tx.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'other_account_user', accountId: 'account_1', isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    })
    expect(db.tx.eventIssueCluster.update).not.toHaveBeenCalled()
  })

  it('persists an idempotency tombstone for a no-op assignment', async () => {
    const db = dbMock(cluster({ ownerUserId: 'owner_1' }))
    await assignEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', ownerUserId: 'owner_1', idempotencyKey: 'same-owner-request-1', now,
      deepLink,
    }, db as never)
    expect(db.tx.eventIssueCluster.update).not.toHaveBeenCalled()
    expect(db.tx.eventActionAssignmentDelivery.create).not.toHaveBeenCalled()
    expect(provider.send).not.toHaveBeenCalled()
    expect(db.tx.eventActionHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'NO_CHANGE', fromValue: 'owner_1', toValue: 'owner_1', idempotencyKey: 'same-owner-request-1',
      }),
    }))
  })

  it('creates one authoritative delivery and sends once for a first assignment or request replay', async () => {
    const db = dbMock(cluster({ ownerUserId: null, actionStatus: 'UNASSIGNED' }))
    const input = {
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', ownerUserId: 'owner_1', idempotencyKey: 'first-assignment-1',
      deepLink, now,
    }
    await assignEventAction(input, db as never, provider)
    await assignEventAction(input, db as never, provider)

    expect(db.tx.eventIssueCluster.update).toHaveBeenCalledTimes(1)
    expect(db.tx.eventActionAssignmentDelivery.create).toHaveBeenCalledTimes(1)
    expect(provider.send).toHaveBeenCalledTimes(1)
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'owner@example.com', deepLink,
    }))
    expect(db.delivery).toMatchObject({
      status: 'SENT', provider: 'fake-email', providerMessageId: 'email_1', attemptCount: 1,
    })
  })

  it('keeps the assignment when email fails and retries a failed delivery exactly once', async () => {
    const db = dbMock(cluster({ ownerUserId: null, actionStatus: 'UNASSIGNED' }))
    const failingProvider = {
      name: 'fake-email',
      send: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    }
    await assignEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', ownerUserId: 'owner_1', idempotencyKey: 'failed-assignment-1',
      deepLink, now,
    }, db as never, failingProvider)

    expect(db.tx.eventIssueCluster.update).toHaveBeenCalledTimes(1)
    expect(db.delivery).toMatchObject({
      status: 'FAILED', attemptCount: 1, failureCode: 'provider_request_failed',
    })

    const retryProvider = {
      name: 'fake-email',
      send: vi.fn().mockResolvedValue({ messageId: 'email_retry_1' }),
    }
    const retryInput = {
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      deliveryId: 'delivery_1', idempotencyKey: 'retry-delivery-1', now,
    }
    await retryEventActionAssignmentDelivery(retryInput, db as never, retryProvider)
    await retryEventActionAssignmentDelivery(retryInput, db as never, retryProvider)

    expect(retryProvider.send).toHaveBeenCalledTimes(1)
    expect(db.tx.eventIssueCluster.update).toHaveBeenCalledTimes(1)
    expect(db.delivery).toMatchObject({
      status: 'SENT', providerMessageId: 'email_retry_1', attemptCount: 2,
    })
  })

  it('records assignment, status, due date, priority, and classification mutations once each', async () => {
    const db = dbMock(cluster({ ownerUserId: 'owner_0', actionStatus: 'OPEN' }))
    await assignEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', ownerUserId: 'owner_1', idempotencyKey: 'assign-request-3', now,
      deepLink,
    }, db as never, provider)
    await transitionEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1',
      actorUserId: 'actor_1', status: 'WORKING', idempotencyKey: 'status-request-1', now,
    }, db as never)
    await updateEventActionField({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      field: 'DUE_DATE', value: '2026-08-01T15:00:00.000Z', idempotencyKey: 'due-request-1', now,
    }, db as never)
    await updateEventActionField({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      field: 'PRIORITY', value: 'Immediate', idempotencyKey: 'priority-request-1', now,
    }, db as never)
    await updateEventActionField({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      field: 'CLASSIFICATION', value: 'NEXT_EVENT_LEARNING', idempotencyKey: 'class-request-1', now,
    }, db as never)

    expect(db.tx.eventActionHistory.create).toHaveBeenCalledTimes(5)
    expect(db.tx.eventActionHistory.create.mock.calls.map(([value]) => value.data.type)).toEqual([
      'REASSIGNED', 'STATUS_CHANGED', 'DUE_DATE_CHANGED', 'PRIORITY_CHANGED', 'CLASSIFICATION_CHANGED',
    ])
    expect(db.tx.eventActionAssignmentDelivery.create).toHaveBeenCalledTimes(1)
    expect(provider.send).toHaveBeenCalledTimes(1)
  })

  it('enforces blocked context while allowing the simplified one-click completion', async () => {
    const db = dbMock(cluster({ ownerUserId: 'owner_1', actionStatus: 'OPEN' }))
    await expect(transitionEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      status: 'BLOCKED', idempotencyKey: 'blocked-request-1', now,
    }, db as never)).rejects.toMatchObject({ status: 400 })
    await expect(transitionEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      status: 'COMPLETE', idempotencyKey: 'complete-request-1', now,
    }, db as never)).resolves.toMatchObject({ actionStatus: 'COMPLETE', actionResolution: 'Marked done' })
    await expect(transitionEventAction({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      status: 'UNASSIGNED', idempotencyKey: 'unassign-request-1', now,
    }, db as never)).resolves.toMatchObject({ actionStatus: 'UNASSIGNED' })
  })

  it('stores written and scoped voice updates outside the attendee evidence pipeline', async () => {
    const db = dbMock()
    await addEventActionUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      kind: 'WRITTEN', body: 'Facilities has the replacement sign.',
      idempotencyKey: 'written-update-1', now,
    }, db as never)
    await addEventActionUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      kind: 'VOICE',
      voice: {
        objectKey: 'event-actions/account_1/event_1/cluster_1/updates/update.webm',
        mimeType: 'audio/webm',
        durationMs: 4200,
      },
      idempotencyKey: 'voice-update-1', now,
    }, db as never)

    expect(db.tx.eventActionUpdate.create).toHaveBeenCalledTimes(2)
    expect(db.tx.eventActionUpdate.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        kind: 'VOICE',
        voiceTranscriptionStatus: 'UPLOADED',
        voiceObjectKey: 'event-actions/account_1/event_1/cluster_1/updates/update.webm',
      }),
    }))
    expect(db.tx.eventActionHistory.create).toHaveBeenCalledTimes(2)
    expect('answer' in db.tx).toBe(false)
    expect('response' in db.tx).toBe(false)
    expect('eventIssueEvidence' in db.tx).toBe(false)
  })

  it('rejects voice object keys from attendee or another action scope', async () => {
    const db = dbMock()
    await expect(addEventActionUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      kind: 'VOICE',
      voice: { objectKey: 'answers/response_1/audio.webm', mimeType: 'audio/webm', durationMs: 1000 },
      idempotencyKey: 'voice-update-2', now,
    }, db as never)).rejects.toBeInstanceOf(EventActionError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('returns the existing canonical update on an idempotent update replay', async () => {
    const db = dbMock()
    db.tx.eventActionHistory.findUnique.mockResolvedValue({ id: 'history_existing' })
    db.tx.eventActionUpdate.findUnique.mockResolvedValue({ id: 'update_existing', kind: 'WRITTEN', body: 'Already saved' })
    await expect(addEventActionUpdate({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'cluster_1', actorUserId: 'actor_1',
      kind: 'WRITTEN', body: 'Already saved', idempotencyKey: 'written-update-replay', now,
    }, db as never)).resolves.toMatchObject({ id: 'update_existing' })
    expect(db.tx.eventActionUpdate.create).not.toHaveBeenCalled()
    expect(db.tx.eventActionHistory.create).not.toHaveBeenCalled()
  })
})
