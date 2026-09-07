import {
  AccountType,
  EventSpeakerRole,
  EventStatus,
  EventStructureItemKind,
  EventType,
  PrismaClient,
  QuestionType,
  ResponseMode,
} from '@prisma/client'
import {
  publishAdvancedEventSurvey,
  reconcileAdvancedSurveyAssignments,
  saveAdvancedEventSurveyDraft,
} from '../../lib/advanced-event-survey-builder'

export const ADVANCED_E2E_ACCOUNT_ID = 'advanced-e2e-account'
export const ADVANCED_E2E_EVENT_ID = 'advanced-e2e-event'
export const ADVANCED_E2E_LEGACY_EVENT_ID = 'advanced-e2e-legacy-event'

export interface AdvancedSurveyE2EFixture {
  accountId: string
  eventId: string
  legacyEventId: string
  surveyId: string
  registrationSurveyId: string
  session1: { id: string; name: string; token: string; targetId: string; publicLinkId: string; speakerIds: string[] }
  session2: { id: string; name: string; token: string; targetId: string; publicLinkId: string; speakerIds: string[] }
  registration: { id: string; name: string; token: string; targetId: string; publicLinkId: string }
  questions: Array<{ id: string; key: string; label: string; type: QuestionType; configurationJson: unknown }>
}

export async function seedAdvancedSurveyE2EFixture(db: PrismaClient): Promise<AdvancedSurveyE2EFixture> {
  await cleanupAdvancedSurveyE2EFixture(db)

  const startsAt = new Date(Date.now() - 60 * 60 * 1000)
  const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const account = await db.account.create({
    data: {
      id: ADVANCED_E2E_ACCOUNT_ID,
      name: 'Advanced E2E Account',
      slug: 'advanced-e2e-account',
      accountType: AccountType.EVENTS,
      settingsJson: {
        consent: {
          title: 'Advanced E2E Survey',
          subtitle: 'Production-path survey verification.',
          items: ['Real application requests', 'Real object storage'],
          buttonText: 'Start Advanced E2E',
          bulletStyle: 'CHECKMARK',
        },
      },
      locations: {
        create: {
          name: 'Advanced E2E Venue',
          slug: 'advanced-e2e-venue',
          timezone: 'America/New_York',
          events: {
            create: [
              {
                id: ADVANCED_E2E_EVENT_ID,
                name: 'Advanced E2E Event',
                eventType: EventType.ADVANCED,
                status: EventStatus.ACTIVE,
                isActive: true,
                responseMode: ResponseMode.VOICE_AND_TEXT,
                startDate: startsAt,
                endDate: endsAt,
              },
              {
                id: ADVANCED_E2E_LEGACY_EVENT_ID,
                name: 'Advanced E2E Legacy Kiosk',
                eventType: EventType.FEEDBACK,
                status: EventStatus.ACTIVE,
                isActive: true,
                responseMode: ResponseMode.VOICE_ONLY,
                startDate: startsAt,
                endDate: endsAt,
                questions: {
                  create: {
                    key: 'advanced-e2e-legacy-question',
                    label: 'Legacy kiosk compatibility question',
                    type: QuestionType.VOICE,
                    order: 0,
                    required: true,
                  },
                },
              },
            ],
          },
        },
      },
    },
  })

  const [session1, session2, registration] = await Promise.all([
    db.eventStructureItem.create({ data: {
      eventId: ADVANCED_E2E_EVENT_ID, kind: EventStructureItemKind.SESSION,
      name: 'Opening Keynote', slug: 'opening-keynote', startsAt, endsAt, timezone: 'America/New_York', isActive: true,
    } }),
    db.eventStructureItem.create({ data: {
      eventId: ADVANCED_E2E_EVENT_ID, kind: EventStructureItemKind.SESSION,
      name: 'Future of Events', slug: 'future-of-events', startsAt, endsAt, timezone: 'America/New_York', isActive: true,
    } }),
    db.eventStructureItem.create({ data: {
      eventId: ADVANCED_E2E_EVENT_ID, kind: EventStructureItemKind.AREA,
      name: 'Registration', slug: 'registration', isActive: true,
    } }),
  ])

  const [jane, marcus, sarah] = await Promise.all([
    db.eventSpeakerProfile.create({ data: { accountId: account.id, name: 'Jane Smith', normalizedName: 'jane smith' } }),
    db.eventSpeakerProfile.create({ data: { accountId: account.id, name: 'Marcus Lee', normalizedName: 'marcus lee' } }),
    db.eventSpeakerProfile.create({ data: { accountId: account.id, name: 'Sarah Jones', normalizedName: 'sarah jones' } }),
  ])
  await db.eventSessionSpeakerAssignment.createMany({ data: [
    { accountId: account.id, eventId: ADVANCED_E2E_EVENT_ID, sessionId: session1.id, speakerId: jane.id, role: EventSpeakerRole.SPEAKER, sortOrder: 0 },
    { accountId: account.id, eventId: ADVANCED_E2E_EVENT_ID, sessionId: session1.id, speakerId: marcus.id, role: EventSpeakerRole.SPEAKER, sortOrder: 1 },
    { accountId: account.id, eventId: ADVANCED_E2E_EVENT_ID, sessionId: session2.id, speakerId: sarah.id, role: EventSpeakerRole.SPEAKER, sortOrder: 0 },
  ] })

  const creationRequestId = 'a4ca0d36-0d4e-4c23-9c39-ea794679c100'
  const initial = await saveAdvancedEventSurveyDraft({
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    creationRequestId,
    name: 'Advanced E2E Survey',
    description: 'One reusable speaker-feedback survey across two sessions.',
    responseMode: ResponseMode.VOICE_AND_TEXT,
    questions: [
      { id: 'rating', text: 'How was this experience?', type: QuestionType.RATING_1_TO_5 },
    ],
  }, db)

  await reconcileAdvancedSurveyAssignments({
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    surveyId: initial.id,
    assignments: [
      { kind: 'SESSION', selection: 'SELECTED', targetIds: [session1.id, session2.id] },
    ],
  }, db)

  await saveAdvancedEventSurveyDraft({
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    surveyId: initial.id,
    creationRequestId,
    name: 'Advanced E2E Survey',
    description: 'One reusable speaker-feedback survey across two sessions.',
    responseMode: ResponseMode.VOICE_AND_TEXT,
    questions: [
      { id: 'rating', text: 'How was this experience?', type: QuestionType.RATING_1_TO_5 },
      { id: 'recommendation', text: 'How likely are you to recommend this event?', type: QuestionType.RECOMMENDATION_0_TO_10 },
      { id: 'open-text', text: 'What worked especially well?', type: QuestionType.OPEN_RESPONSE },
      { id: 'open-voice', text: 'What should we improve next?', type: QuestionType.OPEN_RESPONSE },
      { id: 'yes-no', text: 'Would you attend again?', type: QuestionType.YES_NO },
      { id: 'single-choice', text: 'Which part mattered most?', type: QuestionType.SINGLE_CHOICE, options: ['Content', 'Speakers', 'Networking'] },
      { id: 'speaker-rating', text: 'How would you rate each presenter?', type: QuestionType.SPEAKER_FEEDBACK, required: false },
    ],
  }, db)
  await publishAdvancedEventSurvey({ accountId: account.id, eventId: ADVANCED_E2E_EVENT_ID, surveyId: initial.id }, db)

  const registrationCreationRequestId = 'a4ca0d36-0d4e-4c23-9c39-ea794679c101'
  const registrationSurvey = await saveAdvancedEventSurveyDraft({
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    creationRequestId: registrationCreationRequestId,
    name: 'Advanced E2E Event Area Survey',
    description: 'Event Area coverage without speaker-relative questions.',
    responseMode: ResponseMode.VOICE_AND_TEXT,
    questions: [
      { id: 'rating', text: 'How was this experience?', type: QuestionType.RATING_1_TO_5 },
      { id: 'recommendation', text: 'How likely are you to recommend this event?', type: QuestionType.RECOMMENDATION_0_TO_10 },
      { id: 'open-text', text: 'What worked especially well?', type: QuestionType.OPEN_RESPONSE },
      { id: 'open-voice', text: 'What should we improve next?', type: QuestionType.OPEN_RESPONSE },
      { id: 'yes-no', text: 'Would you attend again?', type: QuestionType.YES_NO },
      { id: 'single-choice', text: 'Which part mattered most?', type: QuestionType.SINGLE_CHOICE, options: ['Content', 'Speakers', 'Networking'] },
    ],
  }, db)
  await reconcileAdvancedSurveyAssignments({
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    surveyId: registrationSurvey.id,
    assignments: [{ kind: 'LOCATION', selection: 'SELECTED', targetIds: [registration.id] }],
  }, db)
  await publishAdvancedEventSurvey({
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    surveyId: registrationSurvey.id,
  }, db)

  const survey = await db.survey.findUniqueOrThrow({
    where: { id: initial.id },
    include: {
      questions: { orderBy: { order: 'asc' } },
      publicSurveyLinks: { include: { surveyTarget: true } },
    },
  })
  const deployment = (structureId: string) => {
    const link = survey.publicSurveyLinks.find((candidate) => candidate.surveyTarget?.eventStructureItemId === structureId)
    if (!link?.surveyTarget) throw new Error(`Missing Advanced E2E deployment for ${structureId}`)
    return { token: link.token, targetId: link.surveyTarget.id, publicLinkId: link.id }
  }
  const registrationDeployment = await db.publicSurveyLink.findFirstOrThrow({
    where: {
      surveyId: registrationSurvey.id,
      surveyTarget: { eventStructureItemId: registration.id },
      isActive: true,
    },
    include: { surveyTarget: true },
  })
  if (!registrationDeployment.surveyTarget) throw new Error('Missing Advanced E2E Registration deployment')

  return {
    accountId: account.id,
    eventId: ADVANCED_E2E_EVENT_ID,
    legacyEventId: ADVANCED_E2E_LEGACY_EVENT_ID,
    surveyId: survey.id,
    registrationSurveyId: registrationSurvey.id,
    session1: { id: session1.id, name: session1.name, ...deployment(session1.id), speakerIds: [jane.id, marcus.id] },
    session2: { id: session2.id, name: session2.name, ...deployment(session2.id), speakerIds: [sarah.id] },
    registration: {
      id: registration.id,
      name: registration.name,
      token: registrationDeployment.token,
      targetId: registrationDeployment.surveyTarget.id,
      publicLinkId: registrationDeployment.id,
    },
    questions: survey.questions.map((question) => ({
      id: question.id,
      key: question.key,
      label: question.label,
      type: question.type,
      configurationJson: question.configurationJson,
    })),
  }
}

export async function cleanupAdvancedSurveyE2EFixture(db: PrismaClient) {
  await db.publicSurveyLink.deleteMany({ where: { survey: { event: { location: { accountId: ADVANCED_E2E_ACCOUNT_ID } } } } })
  await db.account.deleteMany({ where: { id: ADVANCED_E2E_ACCOUNT_ID } })
}
