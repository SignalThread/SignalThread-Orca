import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EventStatus, PrismaClient, ResponseMode, SurveyTargetCategory } from '@prisma/client'
import { NextRequest } from 'next/server'
import { createKioskLaunchResponse } from '../../lib/event'
import { resolveAnswerQuestionContext } from '../../lib/answer-question-context'
import { deleteEventForAccount } from '../../lib/event-deletion'
import {
  cleanupRealEventsFixture,
  REAL_EVENTS_FIXTURE_ACCOUNT_ID,
  seedRealEventsFixture,
  type RealEventsFixture,
} from '../real-events/fixture'

// Authentication is the external boundary in the organizer API integration.
// The route, validation, canonical service, Prisma transaction, and database
// remain real and account-scoped to this isolated fixture.
vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: vi.fn(async () => ({
    ok: true,
    userId: 'real-events-test-admin',
    account: { id: 'events-real-journey-account', accountType: 'EVENTS' },
  })),
}))

const describeRealDatabase = process.env.REAL_DATABASE_TESTS === '1' ? describe : describe.skip

describeRealDatabase('Voice Events critical journeys against migrated Postgres', () => {
  const db = new PrismaClient()
  let fixture: RealEventsFixture

  beforeAll(async () => {
    fixture = await seedRealEventsFixture(db)
  }, 60_000)

  afterAll(async () => {
    await cleanupRealEventsFixture(db)
    await db.$disconnect()
  })

  it('proves the migration-created Response.responseMode column exists', async () => {
    const rows = await db.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Response'
          AND column_name = 'responseMode'
      ) AS "exists"
    `
    expect(rows).toEqual([{ exists: true }])
  })

  it.each([
    ['voice', ResponseMode.VOICE_ONLY],
    ['text', ResponseMode.TEXT_ONLY],
  ] as const)('persists a real attendee-choice %s launch with canonical linkage', async (_label, selectedResponseMode) => {
    const launch = await createKioskLaunchResponse(
      { token: fixture.choice.token, selectedResponseMode },
      db as never,
    )

    const persisted = await db.response.findUniqueOrThrow({ where: { id: launch.response.id } })
    expect(persisted).toMatchObject({
      eventId: fixture.eventId,
      surveyId: fixture.choice.surveyId,
      surveyTargetId: fixture.choice.targetId,
      publicSurveyLinkId: fixture.choice.publicLinkId,
      responseMode: selectedResponseMode,
    })
    expect(launch.questions.map((question) => question.id)).toEqual([fixture.choice.questionId])
  })

  it('keeps multiple survey targets isolated and rejects a question from another survey', async () => {
    const launch = await createKioskLaunchResponse({ token: fixture.targeted.token }, db as never)
    expect(launch.questions).toHaveLength(1)
    expect(launch.questions[0]).toMatchObject({
      id: fixture.targeted.questionId,
      key: fixture.targeted.questionKey,
      label: fixture.targeted.questionLabel,
    })
    expect(launch.questions.some((question) => question.id === fixture.text.questionId)).toBe(false)

    await expect(resolveAnswerQuestionContext(
      { responseId: launch.response.id, questionKey: fixture.text.questionKey },
      db as never,
    )).rejects.toThrow('does not belong')
    expect(await db.answer.count({ where: { responseId: launch.response.id } })).toBe(0)
  })

  it('preserves the legacy eventId kiosk launch path', async () => {
    const launch = await createKioskLaunchResponse({ eventId: fixture.legacyEventId })
    const persisted = await db.response.findUniqueOrThrow({ where: { id: launch.response.id } })
    expect(launch.mode).toBe('eventId')
    expect(launch.questions.map((question) => question.key)).toEqual(['legacy-real-question'])
    expect(persisted).toMatchObject({
      eventId: fixture.legacyEventId,
      surveyId: null,
      surveyTargetId: null,
      publicSurveyLinkId: null,
      responseMode: ResponseMode.VOICE_ONLY,
    })
  })

  it('rejects inactive, expired, and invalid public links without creating a Response', async () => {
    const before = await db.response.count({ where: { eventId: fixture.eventId } })
    await expect(createKioskLaunchResponse({ token: fixture.inactiveToken }, db as never)).rejects.toThrow('inactive')
    await expect(createKioskLaunchResponse({ token: fixture.expiredToken }, db as never)).rejects.toThrow('expired')
    await expect(createKioskLaunchResponse({ token: 'not-a-real-public-token' }, db as never)).rejects.toThrow('not found')
    expect(await db.response.count({ where: { eventId: fixture.eventId } })).toBe(before)
  })

  it('persists organizer setup that the generated attendee link consumes', async () => {
    const [session, area, speakerAssignment, survey, areaSurvey, speakerSurvey] = await Promise.all([
      db.eventStructureItem.findUniqueOrThrow({ where: { id: fixture.sessionId } }),
      db.eventStructureItem.findUniqueOrThrow({ where: { id: fixture.areaId } }),
      db.eventSessionSpeakerAssignment.findUniqueOrThrow({ where: { id: fixture.speakerAssignmentId } }),
      db.survey.findUniqueOrThrow({
        where: { id: fixture.sessionHandoff.surveyId },
        include: { surveyTarget: true, publicSurveyLinks: true },
      }),
      db.survey.findUniqueOrThrow({
        where: { id: fixture.areaHandoff.surveyId },
        include: { surveyTarget: true },
      }),
      db.survey.findUniqueOrThrow({
        where: { id: fixture.speakerHandoff.surveyId },
        include: { surveyTarget: true },
      }),
    ])

    expect(session.eventId).toBe(fixture.eventId)
    expect(area.eventId).toBe(fixture.eventId)
    expect(speakerAssignment).toMatchObject({
      eventId: fixture.eventId,
      sessionId: fixture.sessionId,
      speakerId: fixture.speakerId,
    })
    expect(survey.surveyTarget).toMatchObject({
      eventId: fixture.eventId,
      eventStructureItemId: fixture.sessionId,
      category: 'SESSION',
    })
    expect(survey.publicSurveyLinks[0]?.token).toBe(fixture.sessionHandoff.token)
    expect(areaSurvey.surveyTarget).toMatchObject({
      eventId: fixture.eventId,
      eventStructureItemId: fixture.areaId,
      category: 'LOCATION',
    })
    expect(speakerSurvey.surveyTarget).toMatchObject({
      eventId: fixture.eventId,
      speakerId: fixture.speakerId,
      category: 'SPEAKER',
    })

    const attendeeLaunch = await createKioskLaunchResponse({ token: fixture.sessionHandoff.token }, db as never)
    expect(attendeeLaunch).toMatchObject({
      survey: { id: fixture.sessionHandoff.surveyId },
      target: { id: fixture.sessionHandoff.targetId },
      publicLink: { id: fixture.sessionHandoff.publicLinkId },
    })
  })

  it('runs the real organizer create/publish API before attendee launch', async () => {
    const voiceSurveyRoute = await import('../../app/api/app/events/[eventId]/voice-surveys/route')
    const createRequest = new NextRequest(
      `http://localhost/api/app/events/${fixture.eventId}/voice-surveys?account=real-events-journey-account`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          creationRequestId: crypto.randomUUID(),
          eventStructureItemId: fixture.areaId,
          surveyName: 'Real organizer API handoff',
          responseMode: 'TEXT_ONLY',
          availability: { mode: 'OPEN_IMMEDIATELY' },
          questions: [{ prompt: 'Real organizer route question', type: 'VOICE', required: true }],
        }),
      },
    )
    const createResponse = await voiceSurveyRoute.POST(createRequest, { params: { eventId: fixture.eventId } })
    const created = await createResponse.json()
    expect(createResponse.status).toBe(201)
    expect(created.success).toBe(true)
    expect(created.data.publicLink.isActive).toBe(false)

    const publishRequest = new NextRequest(
      `http://localhost/api/app/events/${fixture.eventId}/voice-surveys?account=real-events-journey-account`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ surveyId: created.data.survey.id, status: 'ACTIVE' }),
      },
    )
    const publishResponse = await voiceSurveyRoute.PATCH(publishRequest, { params: { eventId: fixture.eventId } })
    expect(publishResponse.status).toBe(200)

    const publishedLink = await db.publicSurveyLink.findUniqueOrThrow({
      where: { id: created.data.publicLink.id },
      include: { survey: { include: { surveyTarget: true, questions: true } } },
    })
    expect(publishedLink.isActive).toBe(true)
    expect(publishedLink.survey).toMatchObject({
      eventId: fixture.eventId,
      responseMode: 'TEXT_ONLY',
      status: 'ACTIVE',
      surveyTarget: { eventStructureItemId: fixture.areaId, category: 'LOCATION' },
    })

    const attendeeLaunch = await createKioskLaunchResponse({ token: publishedLink.token }, db as never)
    expect(attendeeLaunch).toMatchObject({
      survey: { id: publishedLink.surveyId },
      target: { id: publishedLink.survey.surveyTargetId },
      publicLink: { id: publishedLink.id },
      response: { responseMode: 'TEXT_ONLY' },
    })
    expect(attendeeLaunch.questions.map((question) => question.id)).toEqual([
      publishedLink.survey.questions[0]?.id,
    ])
  })

  it('deletes the production targeted-link dependency set without leaving Event-owned records', async () => {
    const ids = await seedDeletionFixture(db, 'events-real-delete-success')
    const eventRoute = await import('../../app/api/app/events/[eventId]/route')
    const request = new NextRequest(
      `http://localhost/api/app/events/${ids.eventId}?account=real-events-journey-account`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmationName: ids.eventName }),
      },
    )

    const response = await eventRoute.DELETE(request, { params: { eventId: ids.eventId } })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { eventId: ids.eventId, eventName: ids.eventName },
    })
    expect(response.status).toBe(200)

    await expect(db.event.findUnique({ where: { id: ids.eventId } })).resolves.toBeNull()
    const eventsHomeRows = await db.event.findMany({
      where: { location: { accountId: fixture.accountId } },
      select: { id: true },
    })
    expect(eventsHomeRows.map((event) => event.id)).not.toContain(ids.eventId)
    await expect(Promise.all([
      db.publicSurveyLink.count({ where: { id: ids.publicLinkId } }),
      db.surveyTarget.count({ where: { id: ids.targetId } }),
      db.survey.count({ where: { id: ids.surveyId } }),
      db.question.count({ where: { id: ids.questionId } }),
      db.response.count({ where: { id: ids.responseId } }),
      db.answer.count({ where: { id: ids.answerId } }),
      db.eventClosingBriefSnapshot.count({ where: { eventId: ids.eventId } }),
      db.session.count({ where: { eventId: ids.eventId } }),
    ])).resolves.toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('rolls back all Event deletion work when the transaction fails after final verification', async () => {
    const ids = await seedDeletionFixture(db, 'events-real-delete-rollback')
    const rollbackError = new Error('force deletion rollback')
    const rollbackDb = {
      $transaction: (callback: (transaction: unknown) => Promise<unknown>) => db.$transaction(async (transaction) => {
        await callback(transaction)
        throw rollbackError
      }),
    }

    await expect(deleteEventForAccount({
      accountId: fixture.accountId,
      eventId: ids.eventId,
      confirmationName: ids.eventName,
    }, rollbackDb as never)).rejects.toBe(rollbackError)

    await expect(db.event.findUnique({ where: { id: ids.eventId } })).resolves.toMatchObject({ id: ids.eventId })
    await expect(Promise.all([
      db.publicSurveyLink.count({ where: { id: ids.publicLinkId } }),
      db.surveyTarget.count({ where: { id: ids.targetId } }),
      db.survey.count({ where: { id: ids.surveyId } }),
      db.response.count({ where: { id: ids.responseId } }),
      db.session.count({ where: { eventId: ids.eventId } }),
    ])).resolves.toEqual([1, 1, 1, 1, 1])
  })
})

async function seedDeletionFixture(db: PrismaClient, eventId: string) {
  const eventName = `Deletion fixture ${eventId}`
  const targetId = `${eventId}-target`
  const surveyId = `${eventId}-survey`
  const questionId = `${eventId}-question`
  const publicLinkId = `${eventId}-link`
  const responseId = `${eventId}-response`
  const answerId = `${eventId}-answer`

  await db.event.create({
    data: {
      id: eventId,
      locationId: 'events-real-journey-location',
      name: eventName,
      status: EventStatus.ACTIVE,
      closingBriefSnapshots: {
        create: {
          accountId: REAL_EVENTS_FIXTURE_ACCOUNT_ID,
          lifecyclePhase: 'POST_EVENT',
          sourceHash: `${eventId}-source`,
          briefHash: `${eventId}-brief`,
          briefJson: { headline: 'Production-shaped brief' },
          generatedAt: new Date(),
        },
      },
    },
  })
  await db.surveyTarget.create({
    data: {
      id: targetId,
      eventId,
      category: SurveyTargetCategory.EVENT,
      name: 'Production-shaped targeted link',
      slug: `${eventId}-target`,
    },
  })
  await db.survey.create({
    data: { id: surveyId, eventId, surveyTargetId: targetId, name: 'Production-shaped survey', status: EventStatus.ACTIVE },
  })
  await db.question.create({
    data: { id: questionId, eventId, surveyId, key: `${eventId}-question`, label: 'Production-shaped question', order: 0 },
  })
  await db.publicSurveyLink.create({
    data: { id: publicLinkId, surveyId, surveyTargetId: targetId, token: `${eventId}-token` },
  })
  await db.response.create({
    data: { id: responseId, eventId, surveyId, surveyTargetId: targetId, publicSurveyLinkId: publicLinkId },
  })
  await db.answer.create({
    data: {
      id: answerId,
      responseId,
      questionId,
      questionKey: `${eventId}-question`,
      promptLabel: 'Production-shaped question',
      answerTranscript: { create: { provider: 'test', model: 'test', text: 'Production-shaped response' } },
    },
  })
  await db.session.create({
    data: {
      id: `${eventId}-legacy-session`,
      eventId,
      locationId: 'events-real-journey-location',
      consentVersion: 'test',
    },
  })

  return { eventId, eventName, targetId, surveyId, questionId, publicLinkId, responseId, answerId }
}
