import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEventAlertNote,
  assignEventAlert,
  EventAlertError,
  getEventAlert,
  reconcileEventAlerts,
  transitionEventAlert,
} from './alerts'
import type { MixedSignalCandidate } from './structured-intelligence'

const now = new Date('2026-07-20T18:00:00.000Z')

function candidate(): MixedSignalCandidate {
  return {
    key: 'event_1:low_score:question_1:target_1',
    ruleType: 'LOW_SCORE',
    severity: 'SOON',
    title: 'Low score for registration',
    summary: 'Recent average is 2 from 3 completed responses.',
    surveyId: 'survey_1',
    surveyTargetId: 'target_1',
    eventStructureItemId: 'area_1',
    questionId: 'question_1',
    taxonomyKey: null,
    metric: null,
    window: {
      start: '2026-07-20T17:30:00.000Z',
      end: '2026-07-20T18:00:00.000Z',
      precedingStart: '2026-07-20T17:00:00.000Z',
    },
    supportingResponseCount: 3,
    sampleStrength: {
      level: 'DIRECTIONAL',
      label: 'Directional signal',
      reason: '3 completed responses.',
    },
    structuredAnswerIds: ['answer_1'],
    voiceAnswerIds: ['answer_2'],
  }
}

function alertRecord(status = 'NEW') {
  return {
    id: 'alert_1',
    status,
    ownerUserId: null,
    notes: [],
    evidence: [],
  }
}

function dbMock() {
  const tx = {
    eventIssueCluster: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: 'alert_1',
        clusterKey: candidate().key,
        status: 'ACTING',
      }),
      update: vi.fn().mockResolvedValue({ id: 'alert_1' }),
    },
    eventIssueEvidence: {
      upsert: vi.fn().mockResolvedValue({ id: 'evidence_1' }),
      findMany: vi.fn().mockResolvedValue([
        { createdAt: new Date('2026-07-20T17:50:00.000Z') },
        { createdAt: new Date('2026-07-20T17:55:00.000Z') },
      ]),
    },
  }
  return {
    tx,
    event: {
      findFirst: vi.fn().mockResolvedValue({ id: 'event_1', locationId: 'location_1' }),
    },
    answer: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'answer_1', questionId: 'question_1', numericValue: 2, createdAt: now,
          response: { id: 'response_1', surveyId: 'survey_1', surveyTargetId: 'target_1' },
          answerTranscript: null, answerEventIntelligence: null,
        },
        {
          id: 'answer_2', questionId: 'question_2', numericValue: null, createdAt: now,
          response: { id: 'response_2', surveyId: 'survey_1', surveyTargetId: 'target_1' },
          answerTranscript: { text: 'The registration line was too long.' },
          answerEventIntelligence: { sentimentScore: -0.7 },
        },
      ]),
    },
    eventIssueCluster: {
      findFirst: vi.fn().mockResolvedValue(alertRecord()),
      update: vi.fn().mockResolvedValue({ id: 'alert_1' }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'owner_1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    eventAlertNote: {
      create: vi.fn().mockResolvedValue({ id: 'note_1' }),
    },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  }
}

describe('event alert persistence and workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconciles a deterministic candidate without overwriting operator status', async () => {
    const db = dbMock()
    const result = await reconcileEventAlerts({
      accountId: 'account_1', eventId: 'event_1', candidates: [candidate()], now,
    }, db as never)

    expect(result).toEqual([{ id: 'alert_1', key: candidate().key, status: 'ACTING' }])
    expect(db.tx.eventIssueCluster.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { clusterKey: candidate().key },
      create: expect.objectContaining({ status: 'NEW', ruleType: 'LOW_SCORE' }),
      update: expect.not.objectContaining({ status: expect.anything() }),
    }))
    expect(db.tx.eventIssueEvidence.upsert).toHaveBeenCalledTimes(2)
    expect(db.tx.eventIssueCluster.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ evidenceCount: 2 }),
    }))
  })

  it('is retry-safe through cluster and evidence unique upserts', async () => {
    const db = dbMock()
    await reconcileEventAlerts({ accountId: 'account_1', eventId: 'event_1', candidates: [candidate()], now }, db as never)
    await reconcileEventAlerts({ accountId: 'account_1', eventId: 'event_1', candidates: [candidate()], now }, db as never)
    expect(db.tx.eventIssueCluster.upsert).toHaveBeenCalledTimes(2)
    expect(db.tx.eventIssueEvidence.upsert).toHaveBeenCalledTimes(4)
    expect(db.tx.eventIssueCluster.upsert.mock.calls[0][0].where).toEqual(
      db.tx.eventIssueCluster.upsert.mock.calls[1][0].where,
    )
  })

  it('enforces allowed transitions and records actor timestamps', async () => {
    const db = dbMock()
    db.eventIssueCluster.findFirst.mockResolvedValue(alertRecord('NEW'))
    await transitionEventAlert({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', status: 'ACKNOWLEDGED', now,
    }, db as never)
    expect(db.eventIssueCluster.update).toHaveBeenCalledWith({
      where: { id: 'alert_1' },
      data: {
        status: 'ACKNOWLEDGED', statusChangedAt: now,
        acknowledgedAt: now, acknowledgedByUserId: 'user_1',
      },
    })

    await expect(transitionEventAlert({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', status: 'RESOLVED', reason: 'Fixed', now,
    }, db as never)).rejects.toMatchObject({ status: 409 })
  })

  it('requires reasons for terminal states and supports explicit reopen', async () => {
    const db = dbMock()
    db.eventIssueCluster.findFirst.mockResolvedValue(alertRecord('ACTING'))
    await expect(transitionEventAlert({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', status: 'RESOLVED', now,
    }, db as never)).rejects.toMatchObject({ status: 400 })

    db.eventIssueCluster.findFirst.mockResolvedValue(alertRecord('RESOLVED'))
    await transitionEventAlert({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', status: 'NEW', now,
    }, db as never)
    expect(db.eventIssueCluster.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ occurrenceCount: { increment: 1 }, reopenedByUserId: 'user_1' }),
    }))
  })

  it('validates an owner in the same account and persists assignment audit', async () => {
    const db = dbMock()
    await assignEventAlert({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', ownerUserId: 'owner_1', now,
    }, db as never)
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owner_1',
        isActive: true,
        accountMemberships: { some: { accountId: 'account_1' } },
      },
      select: { id: true },
    })
    expect(db.eventIssueCluster.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ownerUserId: 'owner_1', ownerAssignedByUserId: 'user_1' }),
    }))
  })

  it('persists scoped immutable notes and rejects invalid note bodies', async () => {
    const db = dbMock()
    await addEventAlertNote({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', body: 'Opened a second registration lane.',
    }, db as never)
    expect(db.eventAlertNote.create).toHaveBeenCalledWith({
      data: {
        clusterId: 'alert_1', accountId: 'account_1', eventId: 'event_1',
        authorUserId: 'user_1', body: 'Opened a second registration lane.',
      },
    })
    await expect(addEventAlertNote({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1',
      actorUserId: 'user_1', body: ' ',
    }, db as never)).rejects.toBeInstanceOf(EventAlertError)
  })

  it('derives honest before-and-after movement from canonical answers around Acting', async () => {
    const db = dbMock()
    db.eventIssueCluster.findFirst.mockResolvedValue({
      ...alertRecord('ACTING'),
      actingAt: new Date('2026-07-20T17:30:00.000Z'),
      metricSnapshotJson: {
        metric: {
          questionId: 'question_1',
          questionType: 'RATING_1_TO_5',
          surveyTargetId: 'target_1',
        },
      },
    })
    db.answer.findMany.mockResolvedValue([
      ...[2, 2, 3].map((numericValue, index) => ({
        numericValue,
        response: { completedAt: new Date(`2026-07-20T17:2${index}:00.000Z`) },
      })),
      ...[3, 4, 4].map((numericValue, index) => ({
        numericValue,
        response: { completedAt: new Date(`2026-07-20T17:4${index}:00.000Z`) },
      })),
    ])

    const detail = await getEventAlert({
      accountId: 'account_1', eventId: 'event_1', clusterId: 'alert_1', now,
    }, db as never)

    expect(detail.interventionMovement).toMatchObject({
      status: 'IMPROVED',
      label: 'Improved after action was recorded',
      before: { average: 2.33, count: 3 },
      after: { average: 3.67, count: 3 },
      change: 1.34,
      sampleStrength: { level: 'DIRECTIONAL' },
    })
  })

  it('rejects alert and evidence reconciliation outside the account event scope', async () => {
    const db = dbMock()
    db.event.findFirst.mockResolvedValue(null)
    await expect(reconcileEventAlerts({
      accountId: 'other_account', eventId: 'event_1', candidates: [candidate()], now,
    }, db as never)).rejects.toMatchObject({ status: 404 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
