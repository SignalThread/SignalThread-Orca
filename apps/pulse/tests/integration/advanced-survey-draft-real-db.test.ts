import {
  AccountType,
  EventStatus,
  EventSpeakerRole,
  EventType,
  PrismaClient,
  QuestionType,
  SurveyPresentationMode,
} from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { generateAdvancedSurveyQuestions } from '../../lib/advanced-event-survey-ai'
import { loadAdvancedEventSurvey, publishAdvancedEventSurvey, reconcileAdvancedSurveyAssignments, saveAdvancedEventSurveyDraft } from '../../lib/advanced-event-survey-builder'
import { keepTemporaryAiSuggestions } from '../../lib/advanced-temporary-ai-suggestions'
import { createKioskLaunchResponse } from '../../lib/event'
import { getEventSurveyCoverage } from '../../lib/event-survey-coverage'
import { loadEventSurveyWorkspacePackage } from '../../lib/event-survey-workspace'
import { getEventAgendaWorkspace } from '../../lib/event-agenda-service'
import { bulkAssignExistingSurvey, clearExistingSurveyAssignment, getEventListeningPlan } from '../../lib/event-listening-plan'
import { submitStructuredAnswer } from '../../lib/mixed-survey-contract'
import { getAssignedSurveyForEntity } from '../../lib/survey-target-assignment'

const describeRealDatabase = process.env.REAL_DATABASE_TESTS === '1' ? describe : describe.skip
const ACCOUNT_ID = 'advanced-survey-draft-regression-account'
const LOCATION_ID = 'advanced-survey-draft-regression-location'
const EVENT_ID = 'advanced-survey-draft-regression-event'

describeRealDatabase('Advanced survey draft save and AI generation against migrated Postgres', () => {
  const db = new PrismaClient()

  const cleanup = async () => {
    await db.publicSurveyLink.deleteMany({
      where: { survey: { event: { location: { accountId: ACCOUNT_ID } } } },
    })
    await db.account.deleteMany({ where: { id: ACCOUNT_ID } })
  }

  beforeAll(async () => {
    await cleanup()
    await db.account.create({
      data: {
        id: ACCOUNT_ID,
        name: 'Advanced Survey Draft Regression',
        slug: ACCOUNT_ID,
        accountType: AccountType.EVENTS,
        locations: {
          create: {
            id: LOCATION_ID,
            name: 'Advanced Survey Test Venue',
            slug: LOCATION_ID,
            timezone: 'UTC',
            events: {
              create: {
                id: EVENT_ID,
                name: 'Advanced Survey Test Event',
                eventType: EventType.ADVANCED,
                status: EventStatus.DRAFT,
              },
            },
          },
        },
      },
    })
  })

  afterAll(async () => {
    await cleanup()
    await db.$disconnect()
  })

  it('saves an unassigned draft before AI generation and keeps persisted questions unchanged', async () => {
    const creationRequestId = crypto.randomUUID()
    const draft = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId,
      name: 'AI-assisted attendee pulse',
      presentationMode: SurveyPresentationMode.SCREEN,
      questions: [{
        id: 'existing-question',
        text: 'What should we improve?',
        type: QuestionType.OPEN_RESPONSE,
        required: true,
      }],
    }, db as never)

    expect(draft).toMatchObject({
      eventId: EVENT_ID,
      surveyTargetId: null,
      presentationMode: SurveyPresentationMode.SCREEN,
    })
    expect(draft.publicSurveyLinks).toEqual([])
    expect(draft.questions).toEqual([
      expect.objectContaining({
        label: 'What should we improve?',
        type: QuestionType.OPEN_RESPONSE,
        configurationJson: null,
      }),
    ])

    const complete = vi.fn().mockResolvedValue({
      questions: [{ text: 'Was registration easy?', type: QuestionType.YES_NO }],
    })
    const suggestions = await generateAdvancedSurveyQuestions({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: draft.id,
      goal: 'event operations',
      tone: 'friendly',
      count: 3,
    }, db as never, complete)

    expect(suggestions.questions).toEqual([
      expect.objectContaining({ text: 'Was registration easy?', type: QuestionType.YES_NO }),
    ])
    expect(complete).toHaveBeenCalledOnce()
    await expect(db.question.findMany({
      where: { surveyId: draft.id },
      orderBy: { order: 'asc' },
      select: { label: true, type: true },
    })).resolves.toEqual([
      { label: 'What should we improve?', type: QuestionType.OPEN_RESPONSE },
    ])

    const edited = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: draft.id,
      creationRequestId,
      name: 'Updated attendee pulse',
    }, db as never)
    expect(edited).toMatchObject({ id: draft.id, name: 'Updated attendee pulse' })
    expect(edited.questions).toEqual([
      expect.objectContaining({ label: 'What should we improve?', type: QuestionType.OPEN_RESPONSE }),
    ])

    const assigned = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId: crypto.randomUUID(),
      name: 'Assigned attendee pulse',
      questions: [{
        id: 'assigned-question',
        text: 'How was the event?',
        type: QuestionType.RATING_1_TO_5,
        required: true,
      }],
    }, db as never)
    await reconcileAdvancedSurveyAssignments({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: assigned.id,
      assignments: [{ kind: 'EVENT', selection: 'SELECTED' }],
    }, db)

    const workspace = await loadEventSurveyWorkspacePackage(EVENT_ID, ACCOUNT_ID, db as never)
    const coverage = await getEventSurveyCoverage({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db)

    expect(workspace?.surveys.map((survey) => survey.id)).toEqual(expect.arrayContaining([draft.id, assigned.id]))
    expect(workspace?.surveys.find((survey) => survey.id === draft.id)).toMatchObject({
      surveyTargetId: null,
      surveyTarget: null,
    })
    expect(coverage.surveyDeployments.map((survey) => survey.id)).toEqual(expect.arrayContaining([draft.id, assigned.id]))
    expect(coverage.summary.surveyCount).toBe(2)
  }, 30_000)

  it('keeps mixed AI suggestions through the canonical builder save and reload path', async () => {
    const creationRequestId = crypto.randomUUID()
    const existingQuestion = {
      id: 'existing-builder-question',
      text: 'What should we improve?',
      type: QuestionType.OPEN_RESPONSE,
      required: true,
    }
    const draft = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId,
      name: 'Mixed AI question persistence',
      questions: [existingQuestion],
    }, db as never)
    const generated = await generateAdvancedSurveyQuestions({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: draft.id,
      goal: 'event operations',
      tone: 'friendly',
      count: 3,
    }, db as never, vi.fn().mockResolvedValue({
      questions: [
        { text: 'What did you think of the venue?', type: QuestionType.OPEN_RESPONSE },
        { text: 'How satisfied were you with the sessions?', type: QuestionType.RATING_1_TO_5 },
        { text: 'Would you attend again?', type: QuestionType.YES_NO },
      ],
    }))

    const keptQuestions = keepTemporaryAiSuggestions(generated.questions, () => crypto.randomUUID())
    const saved = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: draft.id,
      creationRequestId,
      name: draft.name,
      questions: [existingQuestion, ...keptQuestions],
    }, db as never)
    expect(saved.questions.map((question) => [question.label, question.type])).toEqual([
      ['What should we improve?', QuestionType.OPEN_RESPONSE],
      ['What did you think of the venue?', QuestionType.OPEN_RESPONSE],
      ['How satisfied were you with the sessions?', QuestionType.RATING_1_TO_5],
      ['Would you attend again?', QuestionType.YES_NO],
    ])

    const reloaded = await loadAdvancedEventSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, surveyId: draft.id }, db)
    expect(reloaded.questions.map((question) => [question.label, question.type])).toEqual([
      ['What should we improve?', QuestionType.OPEN_RESPONSE],
      ['What did you think of the venue?', QuestionType.OPEN_RESPONSE],
      ['How satisfied were you with the sessions?', QuestionType.RATING_1_TO_5],
      ['Would you attend again?', QuestionType.YES_NO],
    ])
  }, 30_000)

  it('keeps an unassigned survey target-neutral and assigns that same record to a speaker', async () => {
    const speaker = await db.eventSpeakerProfile.create({
      data: {
        id: 'advanced-survey-draft-regression-speaker',
        accountId: ACCOUNT_ID,
        name: 'Regression Speaker',
        normalizedName: 'regression speaker',
      },
    })
    await db.eventSessionSpeakerAssignment.create({
      data: {
        id: 'advanced-survey-draft-regression-roster',
        accountId: ACCOUNT_ID,
        eventId: EVENT_ID,
        sessionId: null,
        speakerId: speaker.id,
        role: EventSpeakerRole.SPEAKER,
      },
    })
    const draft = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId: crypto.randomUUID(),
      name: 'Speaker-ready unassigned draft',
    }, db as never)
    const beforeCount = await db.survey.count({ where: { eventId: EVENT_ID } })
    const listeningPlan = await getEventListeningPlan({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)
    expect(listeningPlan.availableSurveys).toContainEqual(expect.objectContaining({ id: draft.id, targetType: null }))

    await bulkAssignExistingSurvey({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      targetType: 'SPEAKER',
      targetIds: [speaker.id],
      surveyId: draft.id,
      conflictMode: 'REPLACE_EXISTING',
    }, db as never)

    expect(await db.survey.count({ where: { eventId: EVENT_ID } })).toBe(beforeCount)
    const persisted = await db.survey.findUniqueOrThrow({ where: { id: draft.id }, include: { surveyTarget: true } })
    expect(persisted).toMatchObject({ id: draft.id, surveyTarget: { category: 'SPEAKER', speakerId: speaker.id } })
    const agenda = await getEventAgendaWorkspace({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)
    expect(agenda.speakers.find((item) => item.id === speaker.id)?.survey).toMatchObject({ id: draft.id, name: draft.name })
  }, 30_000)

  it('resolves persisted session, speaker, and area assignments through the same target link contract', async () => {
    const sessionId = 'advanced-assignment-contract-session'
    const areaId = 'advanced-assignment-contract-area'
    const speakerId = 'advanced-assignment-contract-speaker'
    await db.eventStructureItem.createMany({
      data: [
        { id: sessionId, eventId: EVENT_ID, kind: 'SESSION', name: 'Assignment Contract Session', slug: sessionId, locationId: LOCATION_ID, sortOrder: 20, isActive: true },
        { id: areaId, eventId: EVENT_ID, kind: 'AREA', name: 'Assignment Contract Area', slug: areaId, locationId: LOCATION_ID, sortOrder: 21, isActive: true },
      ],
    })
    await db.eventSpeakerProfile.create({
      data: { id: speakerId, accountId: ACCOUNT_ID, name: 'Assignment Contract Speaker', normalizedName: 'assignment contract speaker' },
    })
    await db.eventSessionSpeakerAssignment.create({
      data: { id: 'advanced-assignment-contract-roster', accountId: ACCOUNT_ID, eventId: EVENT_ID, sessionId: null, speakerId, role: EventSpeakerRole.SPEAKER },
    })
    // This is the historical row shape that caused the stale Attach state.
    // It shares the session identity but is deliberately excluded from planner reads.
    await db.surveyTarget.create({
      data: {
        id: 'advanced-assignment-contract-result-only-session', eventId: EVENT_ID, eventStructureItemId: sessionId,
        category: 'SESSION', name: 'Result-only session record', slug: 'assignment-contract-result-only-session',
        metadata: { listeningPoint: false, resultScope: 'SESSION' }, isActive: true,
      },
    })

    const createDraft = (name: string) => saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId: crypto.randomUUID(),
      name,
      questions: [{ id: `${name}-question`, text: 'How was it?', type: QuestionType.OPEN_RESPONSE, required: true }],
    }, db as never)
    const firstSessionSurvey = await createDraft('First session contract survey')
    const secondSessionSurvey = await createDraft('Second session contract survey')
    const speakerSurvey = await createDraft('Speaker contract survey')
    const areaSurvey = await createDraft('Area contract survey')

    // Starts unassigned: the row-model input makes the shared control render Attach.
    expect((await getEventListeningPlan({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)).sessions
      .find((item) => item.sessionId === sessionId)?.survey).toBeNull()

    await bulkAssignExistingSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'SESSION', targetIds: [sessionId], surveyId: firstSessionSurvey.id, conflictMode: 'REPLACE_EXISTING' }, db as never)
    const persistedSessionLink = await db.publicSurveyLink.findFirstOrThrow({
      where: { surveyId: firstSessionSurvey.id, surveyTarget: { eventStructureItemId: sessionId } },
      include: { surveyTarget: true },
    })
    expect(persistedSessionLink.surveyTarget).toMatchObject({ eventStructureItemId: sessionId, metadata: null })

    const refetchedSessionPlan = await getEventListeningPlan({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)
    expect(refetchedSessionPlan.sessions.find((item) => item.sessionId === sessionId)?.survey?.id).toBe(firstSessionSurvey.id)
    // Re-running the read simulates a full browser reload; it still resolves Swap from persistence.
    expect((await getEventListeningPlan({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)).sessions
      .find((item) => item.sessionId === sessionId)?.survey?.id).toBe(firstSessionSurvey.id)

    await bulkAssignExistingSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'SESSION', targetIds: [sessionId], surveyId: secondSessionSurvey.id, conflictMode: 'REPLACE_EXISTING' }, db as never)
    expect((await getEventListeningPlan({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)).sessions
      .find((item) => item.sessionId === sessionId)?.survey?.id).toBe(secondSessionSurvey.id)
    await clearExistingSurveyAssignment({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'SESSION', targetIds: [sessionId] }, db as never)
    expect((await getEventListeningPlan({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)).sessions
      .find((item) => item.sessionId === sessionId)?.survey).toBeNull()

    await bulkAssignExistingSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'SPEAKER', targetIds: [speakerId], surveyId: speakerSurvey.id, conflictMode: 'REPLACE_EXISTING' }, db as never)
    expect((await getEventAgendaWorkspace({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)).speakers
      .find((item) => item.id === speakerId)?.survey?.id).toBe(speakerSurvey.id)
    await clearExistingSurveyAssignment({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'SPEAKER', targetIds: [speakerId] }, db as never)
    expect((await getEventAgendaWorkspace({ accountId: ACCOUNT_ID, eventId: EVENT_ID }, db as never)).speakers
      .find((item) => item.id === speakerId)?.survey).toBeNull()

    await bulkAssignExistingSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'AREA', targetIds: [areaId], surveyId: areaSurvey.id, conflictMode: 'REPLACE_EXISTING' }, db as never)
    const areaLinks = await db.publicSurveyLink.findMany({ where: { survey: { eventId: EVENT_ID } }, include: { surveyTarget: true } })
    expect(getAssignedSurveyForEntity(EVENT_ID, 'AREA', areaId, areaLinks)?.surveyId).toBe(areaSurvey.id)
    const workspace = await loadEventSurveyWorkspacePackage(EVENT_ID, ACCOUNT_ID, db as never)
    expect(workspace?.surveys.find((survey) => survey.id === areaSurvey.id)?.publicSurveyLinks
      .some((link) => link.surveyTarget?.eventStructureItemId === areaId)).toBe(true)
    await clearExistingSurveyAssignment({ accountId: ACCOUNT_ID, eventId: EVENT_ID, targetType: 'AREA', targetIds: [areaId] }, db as never)
    const detachedAreaLinks = await db.publicSurveyLink.findMany({ where: { survey: { eventId: EVENT_ID } }, include: { surveyTarget: true } })
    expect(getAssignedSurveyForEntity(EVENT_ID, 'AREA', areaId, detachedAreaLinks)).toBeNull()
  }, 30_000)

  it('persists a builder rating in the database and accepts its kiosk structured answer', async () => {
    const draft = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId: crypto.randomUUID(),
      name: 'Persisted rating contract',
      questions: [{
        id: 'rating-contract-question',
        text: 'How would you rate this event?',
        type: QuestionType.RATING_1_TO_5,
        required: true,
      }],
    }, db as never)

    const persistedQuestion = await db.question.findFirstOrThrow({
      where: { surveyId: draft.id },
      select: { id: true, surveyId: true, type: true, configurationJson: true },
    })
    expect(persistedQuestion).toMatchObject({
      surveyId: draft.id,
      type: QuestionType.RATING_1_TO_5,
      configurationJson: {
        questionType: QuestionType.RATING_1_TO_5,
        answerFormat: 'NUMERIC',
        scale: { min: 1, max: 5 },
      },
    })

    await reconcileAdvancedSurveyAssignments({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: draft.id,
      assignments: [{ kind: 'EVENT', selection: 'SELECTED' }],
    }, db)
    await db.event.update({ where: { id: EVENT_ID }, data: { status: EventStatus.ACTIVE, isActive: true } })
    await db.survey.update({ where: { id: draft.id }, data: { status: EventStatus.ACTIVE } })
    await db.publicSurveyLink.updateMany({ where: { surveyId: draft.id }, data: { isActive: true } })
    const link = await db.publicSurveyLink.findFirstOrThrow({ where: { surveyId: draft.id, isActive: true }, select: { token: true } })

    const launch = await createKioskLaunchResponse({ token: link.token, selectedResponseMode: 'TEXT_ONLY' }, db as never)
    expect(launch.questions).toContainEqual(expect.objectContaining({ id: persistedQuestion.id, type: QuestionType.RATING_1_TO_5 }))
    const result = await submitStructuredAnswer({ responseId: launch.response.id, questionId: persistedQuestion.id, numericValue: 5 }, db as never)
    expect(result.answer).toMatchObject({ responseId: launch.response.id, questionId: persistedQuestion.id, numericValue: 5 })
    await expect(db.answer.findFirstOrThrow({ where: { id: result.answer.id }, select: { responseId: true, questionId: true, numericValue: true } })).resolves.toEqual({
      responseId: launch.response.id,
      questionId: persistedQuestion.id,
      numericValue: 5,
    })
  }, 30_000)

  it('publishes one speaker-feedback survey to 3 sessions and keeps every token context isolated', async () => {
    const sessions = ['a', 'b', 'c'].map((suffix, index) => ({
      id: `advanced-bulk-session-${suffix}`,
      eventId: EVENT_ID,
      kind: 'SESSION' as const,
      name: `Bulk Session ${suffix.toUpperCase()}`,
      slug: `advanced-bulk-session-${suffix}`,
      locationId: LOCATION_ID,
      sortOrder: index,
      isActive: true,
    }))
    await db.eventStructureItem.createMany({ data: sessions, skipDuplicates: true })
    for (const suffix of ['a', 'b', 'c']) {
      const speakerId = `advanced-bulk-speaker-${suffix}`
      await db.eventSpeakerProfile.upsert({
        where: { accountId_id: { accountId: ACCOUNT_ID, id: speakerId } },
        create: { id: speakerId, accountId: ACCOUNT_ID, name: `Speaker ${suffix.toUpperCase()}`, normalizedName: `speaker ${suffix}` },
        update: { name: `Speaker ${suffix.toUpperCase()}`, isArchived: false },
      })
      await db.eventSessionSpeakerAssignment.upsert({
        where: { sessionId_speakerId: { sessionId: `advanced-bulk-session-${suffix}`, speakerId } },
        create: { id: `advanced-bulk-assignment-${suffix}`, accountId: ACCOUNT_ID, eventId: EVENT_ID, sessionId: `advanced-bulk-session-${suffix}`, speakerId, role: EventSpeakerRole.SPEAKER },
        update: { role: EventSpeakerRole.SPEAKER },
      })
    }

    const draft = await saveAdvancedEventSurveyDraft({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      creationRequestId: crypto.randomUUID(),
      name: 'Bulk session speaker feedback',
      presentationMode: SurveyPresentationMode.SCREEN,
      questions: [{ id: 'speaker-feedback', text: 'How was the speaker?', type: QuestionType.SPEAKER_FEEDBACK, required: true }],
    }, db as never)
    expect(draft.review).toMatchObject({ ready: false })

    const assigned = await reconcileAdvancedSurveyAssignments({
      accountId: ACCOUNT_ID,
      eventId: EVENT_ID,
      surveyId: draft.id,
      assignments: [{ kind: 'SESSION', selection: 'ALL' }],
    }, db)
    expect(assigned.review).toEqual({ ready: true, issues: [] })
    expect(assigned.publicSurveyLinks).toHaveLength(3)

    await publishAdvancedEventSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, surveyId: draft.id }, db)
    await db.event.update({ where: { id: EVENT_ID }, data: { status: EventStatus.ACTIVE, isActive: true } })

    const reloaded = await loadAdvancedEventSurvey({ accountId: ACCOUNT_ID, eventId: EVENT_ID, surveyId: draft.id }, db)
    expect(reloaded.publicSurveyLinks.filter((link) => link.isActive)).toHaveLength(3)
    expect(reloaded.publicSurveyLinks.map((link) => link.surveyTarget?.eventStructureItemId).sort()).toEqual(sessions.map((session) => session.id).sort())

    const contexts = []
    for (const link of await db.publicSurveyLink.findMany({ where: { surveyId: draft.id, isActive: true }, orderBy: { createdAt: 'asc' } })) {
      const launch = await createKioskLaunchResponse({ token: link.token, selectedResponseMode: 'TEXT_ONLY' }, db as never)
      contexts.push({ targetId: launch.target?.id, session: launch.sessionContext?.session.name, speakers: launch.sessionContext?.speakers.map((speaker) => speaker.name) })
    }
    expect(contexts).toEqual(expect.arrayContaining([
      expect.objectContaining({ session: 'Bulk Session A', speakers: ['Speaker A'] }),
      expect.objectContaining({ session: 'Bulk Session B', speakers: ['Speaker B'] }),
      expect.objectContaining({ session: 'Bulk Session C', speakers: ['Speaker C'] }),
    ]))
    expect(contexts.every((context) => context.speakers?.length === 1)).toBe(true)
  }, 30_000)
})
