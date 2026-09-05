import { EventStatus, EventType, ResponseMode, SurveyTargetCategory } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createEventVoiceSurveyInTransactionMock, createUniquePublicSurveyTokenMock, ensureSurveyAudioMock, reconcileAdvancedMock } = vi.hoisted(() => ({
  createEventVoiceSurveyInTransactionMock: vi.fn(),
  ensureSurveyAudioMock: vi.fn().mockResolvedValue([]),
  createUniquePublicSurveyTokenMock: vi.fn()
    .mockResolvedValueOnce('token_1')
    .mockResolvedValueOnce('token_2')
    .mockResolvedValueOnce('token_3'),
  reconcileAdvancedMock: vi.fn(),
}))

vi.mock('@/lib/event-voice-surveys', () => ({
  createEventVoiceSurveyInTransaction: createEventVoiceSurveyInTransactionMock,
  createUniquePublicSurveyToken: createUniquePublicSurveyTokenMock,
  mapEventStructureItemKindToSurveyTargetCategory: (kind: string) => kind === 'EVENT'
      ? SurveyTargetCategory.EVENT
      : kind === 'CUSTOM_TOUCHPOINT'
        ? SurveyTargetCategory.CUSTOM
        : SurveyTargetCategory.LOCATION,
}))
vi.mock('@/lib/question-audio', () => ({ ensureSurveyQuestionAudioForSurvey: ensureSurveyAudioMock }))
vi.mock('@/lib/advanced-event-survey-builder', () => ({ reconcileAdvancedSurveyAssignments: reconcileAdvancedMock }))

import {
  EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM,
  attachSurveyToListeningSessions,
  bulkAssignExistingSurvey,
  clearExistingSurveyAssignment,
  createBulkSurveyConfigurationForSessions,
  createSurveyForListeningSessions,
  getEventListeningPlan,
  getEventListeningPlanSummary,
  removeSessionsFromListeningPlan,
} from './event-listening-plan'

const eventScope = {
  id: 'event_1',
  status: EventStatus.ACTIVE,
  location: { accountId: 'account_1' },
}

function survey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'survey_1',
    name: 'Reusable session pulse',
    eventId: 'event_1',
    surveyTargetId: 'target_primary',
    status: EventStatus.ACTIVE,
    collectionPhase: 'DURING',
    responseMode: ResponseMode.VOICE_ONLY,
    availabilityMode: 'OPEN_IMMEDIATELY',
    availabilityTimezone: null,
    availabilityOpensAt: null,
    availabilityClosesAt: null,
    availabilityOpenAnchor: null,
    availabilityCloseAnchor: null,
    availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null,
    availabilityOverride: null,
    event: { name: 'Event one' },
    surveyTarget: { category: 'SESSION' },
    _count: { questions: 1 },
    ...overrides,
  }
}

function target(input: {
  id: string
  sessionId: string
  responseCount?: number
  survey?: ReturnType<typeof survey> | null
  linkActive?: boolean
  endsAt?: Date | null
}) {
  const linkedSurvey = input.survey === undefined ? survey() : input.survey
  return {
    id: input.id,
    eventId: 'event_1',
    eventStructureItemId: input.sessionId,
    isActive: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    eventStructureItem: {
      startsAt: new Date('2026-09-17T14:00:00.000Z'),
      endsAt: input.endsAt ?? new Date('2026-09-17T16:00:00.000Z'),
      timezone: 'America/New_York',
    },
    publicSurveyLinks: linkedSurvey ? [{
      id: `link_${input.id}`,
      token: `token_${input.id}`,
      isActive: input.linkActive ?? true,
      expiresAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      survey: linkedSurvey,
    }] : [],
    _count: { responses: input.responseCount ?? 0 },
  }
}

describe('event listening plan', () => {
  beforeEach(() => {
    createEventVoiceSurveyInTransactionMock.mockReset()
    reconcileAdvancedMock.mockReset()
  })
  it('loads a bounded Setup summary with survey existence, without hydrating response rows', async () => {
    const targetFindMany = vi.fn()
      .mockResolvedValueOnce([
        { id: 'planner-1', metadata: null },
        { id: 'planner-2', metadata: { listeningPoint: true } },
        { id: 'result-only', metadata: { listeningPoint: false, resultScope: 'SESSION' } },
      ])
      .mockResolvedValueOnce([
        { id: 'planner-1', eventStructureItemId: 'session-1', _count: { responses: 2 }, surveys: [{ id: 'survey-1' }] },
        { id: 'planner-duplicate', eventStructureItemId: 'session-1', _count: { responses: 1 }, surveys: [{ id: 'survey-duplicate' }] },
        { id: 'planner-2', eventStructureItemId: 'session-2', _count: { responses: 1 }, surveys: [{ id: 'survey-2' }] },
      ])
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(eventScope) },
      eventStructureItem: { count: vi.fn().mockResolvedValue(48) },
      surveyTarget: { findMany: targetFindMany },
    }

    const summary = await getEventListeningPlanSummary({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(summary).toMatchObject({
      agendaSessionCount: 48,
      selectedSessionCount: 2,
      representedSessionCount: 1,
      selectedCoverageLabel: '2 of 48 sessions have surveys',
    })
    expect(targetFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: { in: ['planner-1', 'planner-2'] } }),
      select: expect.objectContaining({ id: true, eventStructureItemId: true, surveys: expect.any(Object), _count: { select: { responses: { where: { status: 'COMPLETED' } } } } }),
    }))
    expect(db).not.toHaveProperty('response')
    expect(db).not.toHaveProperty('survey')
  })

  it('does not turn result-only intelligence targets into listening-plan selections', async () => {
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue(eventScope),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ location: { timezone: 'America/New_York' } }),
      },
      eventStructureItem: {
        findMany: vi.fn().mockResolvedValue([{ id: 'session_1', name: 'Opening', startsAt: null, endsAt: null }]),
      },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue([{
          ...target({ id: 'result_target', sessionId: 'session_1', responseCount: 4 }),
          metadata: { listeningPoint: false, resultScope: 'SESSION' },
        }]),
      },
      survey: {
        findMany: vi.fn().mockResolvedValue([{
          ...survey({ id: 'result_survey' }),
          surveyTarget: { category: 'SESSION', metadata: { listeningPoint: false, resultScope: 'SESSION' } },
        }]),
      },
    }

    const plan = await getEventListeningPlan({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(plan.summary).toMatchObject({ selectedSessionCount: 0, representedSessionCount: 0 })
    expect(plan.sessions[0]).toMatchObject({ sessionId: 'session_1', state: 'NOT_SELECTED', targetId: null })
    expect(plan.surveys).toEqual([])
  })

  it('includes same-event unassigned drafts in the session attachment library before questions are added', async () => {
    const targetFindMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const surveyFindMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        survey({
          id: 'survey_unassigned',
          name: 'Unassigned session feedback',
          surveyTargetId: null,
          surveyTarget: null,
          status: EventStatus.DRAFT,
          _count: { questions: 0 },
        }),
        survey({
          id: 'survey_active_unassigned',
          name: 'Active unassigned feedback',
          surveyTargetId: null,
          surveyTarget: null,
          status: EventStatus.ACTIVE,
        }),
      ])
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue(eventScope),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ location: { timezone: 'America/New_York' } }),
      },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([]) },
      surveyTarget: { findMany: targetFindMany },
      survey: { findMany: surveyFindMany },
    }

    const plan = await getEventListeningPlan({ accountId: 'account_1', eventId: 'event_1' }, db as never)

    expect(plan.availableSurveys).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'survey_unassigned',
        name: 'Unassigned session feedback',
        status: EventStatus.DRAFT,
        targetType: null,
        eventId: 'event_1',
        _count: { questions: 0 },
      }),
      expect.objectContaining({ id: 'survey_active_unassigned', status: EventStatus.ACTIVE, targetType: null }),
    ]))
    expect(surveyFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_1',
        status: { not: EventStatus.ARCHIVED },
      }),
    }))
    expect(surveyFindMany.mock.calls[1][0].where).not.toHaveProperty('surveyTarget')
  })

  it('derives all eight states without converting unselected agenda sessions into targets', async () => {
    const now = new Date('2026-09-17T15:00:00.000Z')
    const sessions = [
      'unselected', 'needs', 'attached', 'ready', 'collecting', 'low', 'represented', 'closed',
    ].map((id) => ({
      id,
      name: id,
      startsAt: new Date('2026-09-17T14:00:00.000Z'),
      endsAt: id === 'low' ? new Date('2026-09-17T14:30:00.000Z') : new Date('2026-09-17T16:00:00.000Z'),
    }))
    const targets = [
      target({ id: 'target_needs', sessionId: 'needs', survey: null }),
      target({ id: 'target_attached', sessionId: 'attached', survey: survey({ status: EventStatus.DRAFT }), linkActive: false }),
      target({ id: 'target_ready', sessionId: 'ready' }),
      target({ id: 'target_collecting', sessionId: 'collecting', responseCount: 1 }),
      target({ id: 'target_low', sessionId: 'low', responseCount: 2, endsAt: new Date('2026-09-17T14:30:00.000Z') }),
      target({ id: 'target_represented', sessionId: 'represented', responseCount: EVENT_LISTENING_REPRESENTED_RESPONSE_MINIMUM }),
      target({ id: 'target_closed', sessionId: 'closed', survey: survey({ availabilityOverride: 'FORCE_CLOSED' }) }),
    ]
    const db = {
      event: {
        findFirst: vi.fn().mockResolvedValue(eventScope),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ location: { timezone: 'America/New_York' } }),
      },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(sessions) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue(targets) },
      survey: { findMany: vi.fn().mockResolvedValue([survey()]) },
    }

    const plan = await getEventListeningPlan({ accountId: 'account_1', eventId: 'event_1', now }, db as never)

    expect(plan.sessions.map((row) => [row.sessionId, row.state])).toEqual([
      ['unselected', 'NOT_SELECTED'],
      ['needs', 'NEEDS_SURVEY'],
      ['attached', 'SURVEY_ATTACHED'],
      ['ready', 'READY_TO_COLLECT'],
      ['collecting', 'COLLECTING'],
      ['low', 'LOW_RESPONSE'],
      ['represented', 'REPRESENTED'],
      ['closed', 'CLOSED'],
    ])
    expect(plan.summary).toMatchObject({
      agendaSessionCount: 8,
      selectedSessionCount: 6,
      representedSessionCount: 1,
      sessionSurveyCount: 6,
      sessionSurveyResponseCount: 3,
      selectedCoverageLabel: '6 of 8 sessions have surveys',
      evidenceCoverageLabel: '3 session surveys have responses',
    })
    expect(db.surveyTarget.findMany).toHaveBeenCalledTimes(2)
    expect(db.surveyTarget.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: { in: targets.map((item) => item.id) } }),
    }))
    expect(db.surveyTarget).not.toHaveProperty('create')
  })

  it('clones a question template into a distinct survey for each selected session', async () => {
    const sessions = [
      { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null },
      { id: 'session_2', name: 'Closing', slug: 'closing', description: null, locationId: null, metadata: null },
    ]
    const targets = sessions.map((session, index) => ({
      id: `target_${index + 1}`,
      eventStructureItemId: session.id,
      name: session.name,
    }))
    const tx = {
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(sessions) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue(targets),
        update: vi.fn().mockImplementation(({ where }) => Promise.resolve(targets.find((item) => item.id === where.id))),
        updateMany: vi.fn().mockResolvedValue({ count: targets.length }),
        findUnique: vi.fn(),
      },
      survey: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...survey(), questions: [{ label: 'How was this session?', type: 'VOICE', required: true, order: 0 }] })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
      },
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(eventScope) },
      $transaction: vi.fn((callback) => callback(tx)),
    }
    createEventVoiceSurveyInTransactionMock
      .mockResolvedValueOnce({ survey: { id: 'survey_clone_1' }, publicLink: { id: 'link_clone_1' } })
      .mockResolvedValueOnce({ survey: { id: 'survey_clone_2' }, publicLink: { id: 'link_clone_2' } })

    const result = await attachSurveyToListeningSessions({
      accountId: 'account_1', eventId: 'event_1', sessionIds: ['session_1', 'session_2'], surveyId: 'survey_1',
    }, db as never)

    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenCalledTimes(2)
    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ surveyTargetId: 'target_1', questions: [expect.objectContaining({ prompt: 'How was this session?' })] }), tx)
    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ surveyTargetId: 'target_2', questions: [expect.objectContaining({ prompt: 'How was this session?' })] }), tx)
    expect(result.targetIds).toEqual(['target_1', 'target_2'])
  })

  it('creates a separate survey and public link for every selected session', async () => {
    const sessions = [
      { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null },
      { id: 'session_2', name: 'Closing', slug: 'closing', description: null, locationId: null, metadata: null },
    ]
    const targets = sessions.map((session, index) => ({ id: `target_${index + 1}`, eventStructureItemId: session.id, name: session.name }))
    const tx = {
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(sessions) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue(targets),
        update: vi.fn().mockImplementation(({ where }) => Promise.resolve(targets.find((item) => item.id === where.id))),
        updateMany: vi.fn().mockResolvedValue({ count: targets.length }),
        findUnique: vi.fn(),
      },
      survey: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    createEventVoiceSurveyInTransactionMock
      .mockResolvedValueOnce({ survey: { id: 'survey_new_1', status: EventStatus.DRAFT }, publicLink: { id: 'link_target_1' } })
      .mockResolvedValueOnce({ survey: { id: 'survey_new_2', status: EventStatus.DRAFT }, publicLink: { id: 'link_target_2' } })
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(eventScope) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    const result = await createSurveyForListeningSessions({
      accountId: 'account_1', eventId: 'event_1', sessionIds: ['session_1', 'session_2'],
      surveyName: 'Session pulse', questionPrompt: 'What should we know?', publish: false,
      collectionPhase: 'DURING',
    }, db as never)

    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenCalledTimes(2)
    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventId: 'event_1', surveyTargetId: 'target_1', surveyName: 'Session pulse — Opening', surveyStatus: EventStatus.DRAFT,
    }), tx)
    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ surveyTargetId: 'target_2', surveyName: 'Session pulse — Closing' }), tx)
    expect(result).toEqual({
      surveyIds: ['survey_new_1', 'survey_new_2'], targetIds: ['target_1', 'target_2'], publicLinkIds: ['link_target_1', 'link_target_2'], skippedTargetIds: [],
    })
  })

  it('removes only the listening deployment and preserves targets, surveys, responses, and history', async () => {
    const tx = {
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([{ id: 'session_1' }]) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue([{ id: 'target_1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      publicSurveyLink: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      survey: { deleteMany: vi.fn() },
      response: { deleteMany: vi.fn() },
    }
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(eventScope) },
      $transaction: vi.fn((callback) => callback(tx)),
    }

    await expect(removeSessionsFromListeningPlan({
      accountId: 'account_1', eventId: 'event_1', sessionIds: ['session_1'],
    }, db as never)).resolves.toEqual({ removedSessionCount: 1, historyPreserved: true })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({ where: { surveyTargetId: { in: ['target_1'] } }, data: { isActive: false } })
    expect(tx.surveyTarget.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['target_1'] } }, data: { isActive: false } })
    expect(tx.survey.deleteMany).not.toHaveBeenCalled()
    expect(tx.response.deleteMany).not.toHaveBeenCalled()
  })

  it('detaches only current target links, preserving the target, survey, and historical records for a later swap', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const sessionTarget = { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const tx = {
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([sessionTarget]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      publicSurveyLink: {
        findMany: vi.fn().mockResolvedValue([{ id: 'link_current', metadata: { assignmentState: 'CURRENT' } }, { id: 'link_history', metadata: { assignmentState: 'SUPERSEDED' } }]),
        update: vi.fn().mockResolvedValue({ id: 'link_current' }),
      },
      survey: { deleteMany: vi.fn() },
      response: { deleteMany: vi.fn() },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(clearExistingSurveyAssignment({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'],
    }, db as never)).resolves.toEqual({ targetIds: ['target_1'], detached: 1 })

    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'link_current' },
      data: expect.objectContaining({ isActive: false, metadata: expect.objectContaining({ assignmentState: 'SUPERSEDED' }) }),
    }))
    expect(tx.surveyTarget.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['target_1'] } }, data: { isActive: true } })
    expect(tx.survey.deleteMany).not.toHaveBeenCalled()
    expect(tx.response.deleteMany).not.toHaveBeenCalled()
  })

  it('reuses one existing survey for selected session targets without publishing, cloning, or duplicating it on retry', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const sessionTarget = { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const links: Array<{ id: string; surveyId: string; surveyTargetId: string; isActive: boolean }> = []
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_1', name: 'Reusable', _count: { questions: 1 } }), updateMany: vi.fn(), create: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([sessionTarget]), update: vi.fn().mockResolvedValue(sessionTarget), updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn() },
      publicSurveyLink: {
        findMany: vi.fn().mockImplementation(async () => links),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const link = { id: `link_${links.length + 1}`, surveyId: data.surveyId, surveyTargetId: data.surveyTargetId, isActive: data.isActive }
          links.push(link)
          return link
        }),
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          for (const item of data) links.push({ id: `link_${links.length + 1}`, surveyId: item.surveyId, surveyTargetId: item.surveyTargetId, isActive: item.isActive })
          return { count: data.length }
        }),
        updateMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_1',
    }, db as never)).resolves.toMatchObject({ counts: { requested: 1, attached: 1, alreadyAttached: 0, skipped: 0, replaced: 0, failed: 0 } })
    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_1',
    }, db as never)).resolves.toMatchObject({ counts: { requested: 1, attached: 0, alreadyAttached: 1 } })

    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ surveyId: 'survey_1', surveyTargetId: 'target_1', isActive: false })]) }))
    expect(tx.survey.create).not.toHaveBeenCalled()
    expect(createEventVoiceSurveyInTransactionMock).not.toHaveBeenCalled()
  })

  it('routes Advanced agenda assignment through the canonical forward-only reconciliation', async () => {
    reconcileAdvancedMock.mockResolvedValue({
      id: 'survey_1',
      publicSurveyLinks: [{ metadata: { assignmentState: 'CURRENT' }, surveyTarget: { id: 'target_new' } }],
    })
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ ...eventScope, eventType: EventType.ADVANCED }) },
      $transaction: vi.fn(),
    }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_new'], surveyId: 'survey_1', conflictMode: 'REPLACE_EXISTING',
    }, db as never)).resolves.toEqual({
      counts: { requested: 1, attached: 1, alreadyAttached: 0, skipped: 0, replaced: 0, failed: 0 },
      targetIds: ['target_new'],
      assignments: [{ targetId: 'target_new', surveyId: 'survey_1' }],
    })

    expect(reconcileAdvancedMock).toHaveBeenCalledWith({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1',
      assignments: [{ kind: 'SESSION', selection: 'SELECTED', targetIds: ['session_new'] }],
    }, db)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('attaches an unassigned survey record to one session without creating a duplicate survey', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const sessionTarget = { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const tx = {
      survey: {
        findFirst: vi.fn().mockResolvedValue({ id: 'survey_unassigned', name: 'Unassigned feedback', status: EventStatus.DRAFT, surveyTargetId: null, _count: { questions: 0 } }),
        update: vi.fn().mockResolvedValue({ id: 'survey_unassigned', surveyTargetId: 'target_1' }),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([sessionTarget]), update: vi.fn().mockResolvedValue(sessionTarget), updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn() },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_unassigned',
    }, db as never)).resolves.toMatchObject({ counts: { requested: 1, attached: 1, alreadyAttached: 0, skipped: 0, replaced: 0, failed: 0 } })

    expect(tx.survey.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'survey_unassigned', eventId: 'event_1', status: { not: EventStatus.ARCHIVED } },
    }))
    expect(tx.survey.update).toHaveBeenCalledWith({
      where: { id: 'survey_unassigned' },
      data: { surveyTargetId: 'target_1' },
    })
    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ surveyId: 'survey_unassigned', surveyTargetId: 'target_1', isActive: false })],
    }))
    expect(tx.survey.create).not.toHaveBeenCalled()
    expect(createEventVoiceSurveyInTransactionMock).not.toHaveBeenCalled()
  })

  it('reuses an Overall Event survey for a session while keeping a target-specific link', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const sessionTarget = { id: 'target_session_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_overall', name: '2026 Event Feedback', _count: { questions: 2 } }), updateMany: vi.fn(), create: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([sessionTarget]), update: vi.fn().mockResolvedValue(sessionTarget), updateMany: vi.fn(), create: vi.fn() },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_overall',
    }, db as never)).resolves.toMatchObject({ counts: { attached: 1, alreadyAttached: 0 } })

    expect(tx.survey.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'survey_overall', eventId: 'event_1', status: { not: EventStatus.ARCHIVED } },
    }))
    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ surveyId: 'survey_overall', surveyTargetId: 'target_session_1' })],
    }))
    expect(tx.survey.create).not.toHaveBeenCalled()
  })

  it('creates an active target link immediately when assigning an active survey', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const target = { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_active', name: 'Ready feedback', status: EventStatus.ACTIVE, surveyTargetId: null, _count: { questions: 1 } }), update: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([target]), updateMany: vi.fn(), createMany: vi.fn() },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_active',
    }, db as never)

    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ surveyId: 'survey_active', surveyTargetId: 'target_1', isActive: true })],
    }))
  })

  it('bulk assigns one active survey to 50 launchable session links without displacement or cloning', async () => {
    const sessions = Array.from({ length: 50 }, (_, index) => ({
      id: `session_${index + 1}`,
      name: `Session ${index + 1}`,
      slug: `session-${index + 1}`,
      description: null,
      locationId: null,
      metadata: null,
    }))
    const targets = sessions.map((session, index) => ({
      id: `target_${index + 1}`,
      eventStructureItemId: session.id,
      name: session.name,
    }))
    const tx = {
      survey: {
        findFirst: vi.fn().mockResolvedValue({ id: 'survey_reusable', name: 'Reusable', status: EventStatus.ACTIVE, surveyTargetId: 'target_1', _count: { questions: 3 } }),
        update: vi.fn(), updateMany: vi.fn(), create: vi.fn(),
      },
      question: { create: vi.fn(), createMany: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(sessions) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue(targets), updateMany: vi.fn(), createMany: vi.fn() },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 50 }) },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    const result = await bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION',
      targetIds: sessions.map((session) => session.id), surveyId: 'survey_reusable',
    }, db as never)

    expect(result.counts).toMatchObject({ requested: 50, attached: 50, alreadyAttached: 0, skipped: 0 })
    const assignments = tx.publicSurveyLink.createMany.mock.calls[0][0].data
    expect(assignments).toHaveLength(50)
    expect(new Set(assignments.map((link: { surveyId: string }) => link.surveyId))).toEqual(new Set(['survey_reusable']))
    expect(new Set(assignments.map((link: { surveyTargetId: string }) => link.surveyTargetId)).size).toBe(50)
    expect(assignments.every((link: { isActive: boolean }) => link.isActive)).toBe(true)
    expect(tx.survey.create).not.toHaveBeenCalled()
    expect(tx.question.create).not.toHaveBeenCalled()
    expect(tx.question.createMany).not.toHaveBeenCalled()
  })

  it('keeps a session assignment while reusing that same survey for two Event Areas', async () => {
    const areas = [
      { id: 'area_registration', name: 'Registration', slug: 'registration', description: null, locationId: null, metadata: null, kind: 'AREA' },
      { id: 'area_expo', name: 'Expo Hall', slug: 'expo-hall', description: null, locationId: null, metadata: null, kind: 'AREA' },
    ]
    const targets = [
      { id: 'target_registration', eventStructureItemId: 'area_registration', name: 'Registration' },
      { id: 'target_expo', eventStructureItemId: 'area_expo', name: 'Expo Hall' },
    ]
    const sessionAssignment = { id: 'link_session_1', surveyId: 'survey_a', surveyTargetId: 'target_session_1', metadata: { assignmentState: 'CURRENT' } }
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_a', name: 'Reusable feedback', surveyTargetId: 'target_session_1', status: EventStatus.DRAFT, _count: { questions: 2 } }), update: vi.fn(), create: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(areas) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue(targets),
        update: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(targets.find((target) => target.id === where.id))),
        create: vi.fn(),
      },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'AREA', targetIds: areas.map((area) => area.id), surveyId: 'survey_a', conflictMode: 'REPLACE_EXISTING',
    }, db as never)).resolves.toMatchObject({
      counts: { requested: 2, attached: 2, alreadyAttached: 0, replaced: 0 },
      assignments: [
        { targetId: 'target_registration', surveyId: 'survey_a' },
        { targetId: 'target_expo', surveyId: 'survey_a' },
      ],
    })

    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
      expect.objectContaining({ surveyId: 'survey_a', surveyTargetId: 'target_registration' }),
      expect.objectContaining({ surveyId: 'survey_a', surveyTargetId: 'target_expo' }),
    ]) }))
    expect(sessionAssignment).toMatchObject({ surveyId: 'survey_a', surveyTargetId: 'target_session_1' })
    expect(tx.survey.create).not.toHaveBeenCalled()
  })

  it('replaces one target assignment without disturbing the same survey on another target', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const target = { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const otherTargetLink = { id: 'link_a_target_2', surveyId: 'survey_a', surveyTargetId: 'target_2', isActive: false, metadata: { assignmentState: 'CURRENT' } }
    const targetLinks = [{ id: 'link_a_target_1', surveyId: 'survey_a', surveyTargetId: 'target_1', isActive: false, metadata: { assignmentState: 'CURRENT' } }]
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_b', name: 'Survey B', status: EventStatus.DRAFT, surveyTargetId: null, _count: { questions: 1 } }), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([target]), updateMany: vi.fn(), createMany: vi.fn() },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue(targetLinks), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_b', conflictMode: 'REPLACE_EXISTING',
    }, db as never)).resolves.toMatchObject({ assignments: [{ targetId: 'target_1', surveyId: 'survey_b' }] })

    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['link_a_target_1'] } }, data: { isActive: false } })
    expect(otherTargetLink).toMatchObject({ surveyId: 'survey_a', surveyTargetId: 'target_2', metadata: { assignmentState: 'CURRENT' } })
    expect(tx.survey.updateMany).not.toHaveBeenCalled()
  })

  it('skips or explicitly replaces different existing assignments with exact counts', async () => {
    const sessions = [
      { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null },
      { id: 'session_2', name: 'Closing', slug: 'closing', description: null, locationId: null, metadata: null },
    ]
    const targets = [
      { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' },
      { id: 'target_2', eventStructureItemId: 'session_2', name: 'Closing' },
    ]
    const links = [
      { id: 'old_link', surveyId: 'survey_old', surveyTargetId: 'target_1', isActive: true },
      { id: 'same_link', surveyId: 'survey_1', surveyTargetId: 'target_2', isActive: false },
    ]
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_1', name: 'Reusable', _count: { questions: 1 } }), updateMany: vi.fn() },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(sessions) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue(targets), update: vi.fn(({ where }) => Promise.resolve(targets.find((target) => target.id === where.id))), updateMany: vi.fn().mockResolvedValue({ count: targets.length }), create: vi.fn() },
      publicSurveyLink: {
        findMany: vi.fn().mockResolvedValue(links),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1', 'session_2'], surveyId: 'survey_1', conflictMode: 'SKIP_EXISTING',
    }, db as never)).resolves.toMatchObject({ counts: { requested: 2, attached: 0, alreadyAttached: 1, skipped: 1, replaced: 0, failed: 0 } })
    expect(tx.publicSurveyLink.createMany).not.toHaveBeenCalled()

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1', 'session_2'], surveyId: 'survey_1', conflictMode: 'REPLACE_EXISTING',
    }, db as never)).resolves.toMatchObject({ counts: { requested: 2, attached: 1, alreadyAttached: 1, skipped: 0, replaced: 1, failed: 0 } })
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['old_link'] } }, data: { isActive: false } })
    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ surveyId: 'survey_1', surveyTargetId: 'target_1', isActive: false })]),
    }))
  })

  it('replaces a session survey when the requested survey has an inactive historical link', async () => {
    const session = { id: 'session_1', name: 'Opening', slug: 'opening', description: null, locationId: null, metadata: null }
    const sessionTarget = { id: 'target_1', eventStructureItemId: 'session_1', name: 'Opening' }
    const links: Array<{ id: string; surveyId: string; surveyTargetId: string; isActive: boolean; metadata: Record<string, unknown> }> = [
      { id: 'link_a', surveyId: 'survey_a', surveyTargetId: 'target_1', isActive: false, metadata: { assignmentState: 'CURRENT' } },
      { id: 'link_b', surveyId: 'survey_b', surveyTargetId: 'target_1', isActive: false, metadata: { assignmentState: 'SUPERSEDED' } },
    ]
    const tx = {
      survey: {
        findFirst: vi.fn().mockResolvedValue({ id: 'survey_b', name: 'Survey B', status: EventStatus.DRAFT, surveyTargetId: 'target_1', _count: { questions: 0 } }),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      eventStructureItem: { findMany: vi.fn().mockResolvedValue([session]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([sessionTarget]), updateMany: vi.fn(), create: vi.fn() },
      publicSurveyLink: {
        findMany: vi.fn().mockImplementation(async () => links),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const link = links.find((candidate) => candidate.id === where.id)!
          link.metadata = data.metadata
          return link
        }),
        createMany: vi.fn(),
      },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    const replacement = await bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_b', conflictMode: 'REPLACE_EXISTING',
    }, db as never)

    expect(replacement).toMatchObject({
      counts: { requested: 1, attached: 0, alreadyAttached: 0, skipped: 0, replaced: 1, failed: 0 },
      assignments: [{ targetId: 'target_1', surveyId: 'survey_b' }],
    })
    expect(tx.publicSurveyLink.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }))
    expect(tx.publicSurveyLink.createMany).not.toHaveBeenCalled()
    expect(tx.publicSurveyLink.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['link_a'] } }, data: { isActive: false } })
    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'link_a' }, data: { metadata: expect.objectContaining({ assignmentState: 'SUPERSEDED' }) } }))
    expect(tx.publicSurveyLink.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'link_b' }, data: { metadata: expect.objectContaining({ assignmentState: 'CURRENT' }) } }))
    expect(tx.survey.updateMany).not.toHaveBeenCalled()

    await expect(bulkAssignExistingSurvey({
      accountId: 'account_1', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_b', conflictMode: 'REPLACE_EXISTING',
    }, db as never)).resolves.toMatchObject({
      counts: { requested: 1, attached: 0, alreadyAttached: 1, skipped: 0, replaced: 0, failed: 0 },
      assignments: [{ targetId: 'target_1', surveyId: 'survey_b' }],
    })
  })

  it('bulk assigns one survey definition to distinct canonical speaker targets and links', async () => {
    const targets = [
      { id: 'speaker_target_1', speakerId: 'speaker_1', name: 'Jane Smith', createdAt: new Date('2026-01-01') },
      { id: 'speaker_target_2', speakerId: 'speaker_2', name: 'Alex Rivera', createdAt: new Date('2026-01-01') },
    ]
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_1', name: 'Speaker feedback', status: EventStatus.ACTIVE, _count: { questions: 1 } }), updateMany: vi.fn() },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([{ id: 'speaker_1', name: 'Jane Smith' }, { id: 'speaker_2', name: 'Alex Rivera' }]) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(targets),
        updateMany: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({ accountId: 'account_1', eventId: 'event_1', targetType: 'SPEAKER', targetIds: ['speaker_1', 'speaker_2'], surveyId: 'survey_1' }, db as never))
      .resolves.toMatchObject({ counts: { requested: 2, attached: 2 }, targetIds: ['speaker_target_1', 'speaker_target_2'] })
    expect(tx.surveyTarget.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [
      expect.objectContaining({ speakerId: 'speaker_1', category: SurveyTargetCategory.SPEAKER }),
      expect.objectContaining({ speakerId: 'speaker_2', category: SurveyTargetCategory.SPEAKER }),
    ] }))
    const createdLinks = tx.publicSurveyLink.createMany.mock.calls[0][0].data
    expect(new Set(createdLinks.map((link: { surveyTargetId: string }) => link.surveyTargetId))).toEqual(new Set(['speaker_target_1', 'speaker_target_2']))
    expect(new Set(createdLinks.map((link: { token: string }) => link.token)).size).toBe(2)
    expect(createdLinks.every((link: { isActive: boolean }) => link.isActive)).toBe(true)
  })

  it('keeps bulk speaker reassignment idempotent and reuses existing target links', async () => {
    const target = { id: 'speaker_target_1', speakerId: 'speaker_1', name: 'Jane Smith', createdAt: new Date('2026-01-01') }
    const tx = {
      survey: { findFirst: vi.fn().mockResolvedValue({ id: 'survey_1', name: 'Speaker feedback', status: EventStatus.ACTIVE, _count: { questions: 1 } }), updateMany: vi.fn() },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([{ id: 'speaker_1', name: 'Jane Smith' }]) },
      surveyTarget: { findMany: vi.fn().mockResolvedValue([target]), updateMany: vi.fn(), createMany: vi.fn() },
      publicSurveyLink: { findMany: vi.fn().mockResolvedValue([{ id: 'stable_link', surveyId: 'survey_1', surveyTargetId: target.id, isActive: true }]), updateMany: vi.fn(), createMany: vi.fn() },
    }
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    await expect(bulkAssignExistingSurvey({ accountId: 'account_1', eventId: 'event_1', targetType: 'SPEAKER', targetIds: ['speaker_1', 'speaker_1'], surveyId: 'survey_1' }, db as never))
      .resolves.toMatchObject({ counts: { requested: 1, attached: 0, alreadyAttached: 1 } })
    expect(tx.surveyTarget.createMany).not.toHaveBeenCalled()
    expect(tx.publicSurveyLink.createMany).not.toHaveBeenCalled()
  })

  it('creates one question configuration and batch-links it across 500 session targets without N+1 writes', async () => {
    const sessions = Array.from({ length: 500 }, (_, index) => ({ id: `session_${index}`, name: `Session ${index}`, slug: `session-${index}`, description: null, locationId: null, metadata: null }))
    const targets = sessions.map((session, index) => ({ id: `target_${index}`, eventStructureItemId: session.id, name: session.name, metadata: null }))
    const tx = {
      eventStructureItem: { findMany: vi.fn().mockResolvedValue(sessions) },
      surveyTarget: {
        findMany: vi.fn().mockResolvedValue(targets),
        updateMany: vi.fn().mockResolvedValue({ count: 500 }),
        createMany: vi.fn(),
      },
      publicSurveyLink: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 499 }),
      },
      survey: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    createEventVoiceSurveyInTransactionMock.mockResolvedValueOnce({
      target: targets[0],
      survey: { id: 'survey_bulk', status: EventStatus.DRAFT, responseMode: ResponseMode.VOICE_ONLY, ttsProvider: 'openai', ttsVoice: 'alloy', ttsLocale: 'en-US' },
      questions: [{ id: 'question_1' }],
      publicLink: { id: 'link_1', token: 'token_1' },
    })
    const db = { event: { findFirst: vi.fn().mockResolvedValue(eventScope) }, $transaction: vi.fn((callback) => callback(tx)) }

    const result = await createBulkSurveyConfigurationForSessions({
      accountId: 'account_1',
      eventId: 'event_1',
      sessionIds: sessions.map((session) => session.id),
      survey: { surveyName: 'Session feedback', creationRequestId: 'request_1', questions: [{ prompt: 'How was it?' }] },
    }, db as never)

    expect(result.counts).toEqual({ requested: 500, attached: 500, alreadyAttached: 0, skipped: 0 })
    expect(createEventVoiceSurveyInTransactionMock).toHaveBeenCalledTimes(1)
    expect(tx.surveyTarget.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledTimes(1)
    expect(tx.publicSurveyLink.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ surveyId: 'survey_bulk' })]) }))
    expect(ensureSurveyAudioMock).toHaveBeenCalledTimes(1)
  })

  it('rejects cross-account event access before a listening mutation transaction begins', async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    }

    await expect(attachSurveyToListeningSessions({
      accountId: 'other_account', eventId: 'event_1', sessionIds: ['session_1'], surveyId: 'survey_1',
    }, db as never)).rejects.toMatchObject({ status: 404, code: 'EVENT_NOT_FOUND' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('rejects cross-account bulk survey attachment before a transaction begins', async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    }

    await expect(bulkAssignExistingSurvey({
      accountId: 'other_account', eventId: 'event_1', targetType: 'SESSION', targetIds: ['session_1'], surveyId: 'survey_unassigned',
    }, db as never)).rejects.toMatchObject({ status: 404, code: 'EVENT_NOT_FOUND' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
