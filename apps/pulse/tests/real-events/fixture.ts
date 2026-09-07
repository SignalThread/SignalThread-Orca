import {
  AccountType,
  EventSpeakerRole,
  EventStatus,
  EventStructureItemKind,
  PrismaClient,
  QuestionType,
  ResponseMode,
  SurveyTargetCategory,
} from '@prisma/client'
import { createEventVoiceSurvey } from '../../lib/event-voice-surveys'

export const REAL_EVENTS_FIXTURE_ACCOUNT_ID = 'events-real-journey-account'

export interface RealEventsSurveyFixture {
  surveyId: string
  targetId: string
  publicLinkId: string
  token: string
  questionId: string
  questionKey: string
  questionLabel: string
}

export interface RealEventsFixture {
  accountId: string
  eventId: string
  legacyEventId: string
  sessionId: string
  areaId: string
  speakerId: string
  speakerAssignmentId: string
  voice: RealEventsSurveyFixture
  text: RealEventsSurveyFixture
  choice: RealEventsSurveyFixture
  targeted: RealEventsSurveyFixture
  sessionHandoff: RealEventsSurveyFixture
  areaHandoff: RealEventsSurveyFixture
  speakerHandoff: RealEventsSurveyFixture
  inactiveToken: string
  expiredToken: string
}

/**
 * Creates a deterministic, isolated EVENTS account. Survey/link rows are
 * intentionally provisioned through the canonical organizer service so the
 * attendee tests exercise the real setup -> generated link -> launch handoff.
 */
export async function seedRealEventsFixture(db: PrismaClient): Promise<RealEventsFixture> {
  await cleanupRealEventsFixture(db)

  const now = Date.now()
  const startsAt = new Date(now - 60 * 60 * 1000)
  const endsAt = new Date(now + 24 * 60 * 60 * 1000)

  const account = await db.account.create({
    data: {
      id: REAL_EVENTS_FIXTURE_ACCOUNT_ID,
      name: 'Real Events Journey Account',
      slug: 'real-events-journey-account',
      accountType: AccountType.EVENTS,
      settingsJson: {
        branding: {
          primaryColor: '#1d4ed8',
          primaryButtonColor: '#1d4ed8',
        },
        consent: {
          title: 'Real Events Journey',
          subtitle: 'Consent and launch are backed by the test database.',
          items: ['One real application request per launch', 'No customer data is used'],
          buttonText: "Let's Go!",
          bulletStyle: 'CHECKMARK',
        },
      },
      locations: {
        create: {
          id: 'events-real-journey-location',
          name: 'Real Events Test Venue',
          slug: 'real-events-test-venue',
          timezone: 'UTC',
          events: {
            create: [
              {
                id: 'events-real-journey-event',
                name: 'Real Events Critical Journey',
                status: EventStatus.ACTIVE,
                isActive: true,
                responseMode: ResponseMode.VOICE_ONLY,
                startDate: startsAt,
                endDate: endsAt,
              },
              {
                id: 'events-real-legacy-event',
                name: 'Real Events Legacy Kiosk',
                status: EventStatus.ACTIVE,
                isActive: true,
                responseMode: ResponseMode.VOICE_ONLY,
                startDate: startsAt,
                endDate: endsAt,
                questions: {
                  create: {
                    key: 'legacy-real-question',
                    label: 'Legacy real kiosk question',
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
    select: { id: true },
  })

  const eventId = 'events-real-journey-event'
  const session = await db.eventStructureItem.create({
    data: {
      id: 'events-real-session',
      eventId,
      kind: EventStructureItemKind.SESSION,
      name: 'Real persisted agenda session',
      slug: 'real-persisted-agenda-session',
      startsAt,
      endsAt,
      timezone: 'UTC',
      isActive: true,
    },
  })
  const area = await db.eventStructureItem.create({
    data: {
      id: 'events-real-area',
      eventId,
      kind: EventStructureItemKind.AREA,
      name: 'Real persisted Event Area',
      slug: 'real-persisted-event-area',
      isActive: true,
    },
  })
  const speaker = await db.eventSpeakerProfile.create({
    data: {
      id: 'events-real-speaker',
      accountId: account.id,
      name: 'Real Journey Speaker',
      normalizedName: 'real journey speaker',
      email: 'real-journey-speaker@example.test',
      normalizedEmail: 'real-journey-speaker@example.test',
    },
  })
  const speakerAssignment = await db.eventSessionSpeakerAssignment.create({
    data: {
      id: 'events-real-speaker-assignment',
      accountId: account.id,
      eventId,
      sessionId: session.id,
      speakerId: speaker.id,
      role: EventSpeakerRole.SPEAKER,
    },
  })

  const voice = await createCanonicalSurvey(db, {
    eventId,
    targetName: 'Real voice target',
    surveyName: 'Real Voice Survey',
    responseMode: ResponseMode.VOICE_ONLY,
    questionLabel: 'Real voice journey question',
    requestKey: 'real-voice-survey',
  })
  const text = await createCanonicalSurvey(db, {
    eventId,
    targetName: 'Real text target',
    surveyName: 'Real Text Survey',
    responseMode: ResponseMode.TEXT_ONLY,
    questionLabel: 'Real text journey question',
    requestKey: 'real-text-survey',
  })
  const choice = await createCanonicalSurvey(db, {
    eventId,
    targetName: 'Real choice target',
    surveyName: 'Real Attendee Choice Survey',
    responseMode: ResponseMode.VOICE_AND_TEXT,
    questionLabel: 'Real attendee choice question',
    requestKey: 'real-choice-survey',
  })
  const targeted = await createCanonicalSurvey(db, {
    eventId,
    targetName: 'Real isolated target',
    surveyName: 'Real Target Integrity Survey',
    responseMode: ResponseMode.TEXT_ONLY,
    questionLabel: 'Only this targeted question may load',
    requestKey: 'real-targeted-survey',
  })
  const sessionHandoff = await createCanonicalSurvey(db, {
    eventId,
    eventStructureItemId: session.id,
    surveyName: 'Real Session Handoff Survey',
    responseMode: ResponseMode.TEXT_ONLY,
    questionLabel: 'Real attached session question',
    requestKey: 'real-session-handoff-survey',
  })
  const areaHandoff = await createCanonicalSurvey(db, {
    eventId,
    eventStructureItemId: area.id,
    surveyName: 'Real Event Area Handoff Survey',
    responseMode: ResponseMode.TEXT_ONLY,
    questionLabel: 'Real attached Event Area question',
    requestKey: 'real-area-handoff-survey',
  })
  const speakerHandoff = await createCanonicalSurvey(db, {
    eventId,
    speakerId: speaker.id,
    surveyName: 'Real Speaker Handoff Survey',
    responseMode: ResponseMode.TEXT_ONLY,
    questionLabel: 'Real attached speaker question',
    requestKey: 'real-speaker-handoff-survey',
  })
  const inactive = await createCanonicalSurvey(db, {
    eventId,
    targetName: 'Real inactive target',
    surveyName: 'Real Inactive Link Survey',
    responseMode: ResponseMode.VOICE_ONLY,
    questionLabel: 'Inactive link question',
    requestKey: 'real-inactive-survey',
  })
  const expired = await createCanonicalSurvey(db, {
    eventId,
    targetName: 'Real expired target',
    surveyName: 'Real Expired Link Survey',
    responseMode: ResponseMode.VOICE_ONLY,
    questionLabel: 'Expired link question',
    requestKey: 'real-expired-survey',
  })
  await db.publicSurveyLink.update({ where: { id: inactive.publicLinkId }, data: { isActive: false } })
  await db.publicSurveyLink.update({
    where: { id: expired.publicLinkId },
    data: { expiresAt: new Date(now - 60_000) },
  })

  return {
    accountId: account.id,
    eventId,
    legacyEventId: 'events-real-legacy-event',
    sessionId: session.id,
    areaId: area.id,
    speakerId: speaker.id,
    speakerAssignmentId: speakerAssignment.id,
    voice,
    text,
    choice,
    targeted,
    sessionHandoff,
    areaHandoff,
    speakerHandoff,
    inactiveToken: inactive.token,
    expiredToken: expired.token,
  }
}

export async function cleanupRealEventsFixture(db: PrismaClient) {
  // PublicSurveyLink.surveyTargetId deliberately uses RESTRICT. Remove only
  // this fixture account's links before relying on the remaining cascades.
  await db.publicSurveyLink.deleteMany({
    where: {
      survey: {
        event: {
          location: { accountId: REAL_EVENTS_FIXTURE_ACCOUNT_ID },
        },
      },
    },
  })
  await db.account.deleteMany({ where: { id: REAL_EVENTS_FIXTURE_ACCOUNT_ID } })
}

async function createCanonicalSurvey(
  db: PrismaClient,
  input: {
    eventId: string
    targetName?: string
    eventStructureItemId?: string
    speakerId?: string
    surveyName: string
    responseMode: ResponseMode
    questionLabel: string
    requestKey: string
  },
): Promise<RealEventsSurveyFixture> {
  const result = await createEventVoiceSurvey(
    {
      eventId: input.eventId,
      collectionPhase: 'DURING',
      eventStructureItemId: input.eventStructureItemId,
      speakerId: input.speakerId,
      targetCategory: input.speakerId
        ? SurveyTargetCategory.SPEAKER
        : input.eventStructureItemId
          ? undefined
          : SurveyTargetCategory.EVENT,
      targetName: input.targetName,
      surveyName: input.surveyName,
      responseMode: input.responseMode,
      surveyStatus: EventStatus.ACTIVE,
      availability: { mode: 'OPEN_IMMEDIATELY' },
      creationRequestId: input.requestKey,
      questions: [{ prompt: input.questionLabel, type: QuestionType.VOICE, required: true }],
    },
    db,
    async () => [],
  )
  const question = result.questions[0]
  if (!question) throw new Error(`Fixture survey ${input.surveyName} has no question`)
  return {
    surveyId: result.survey.id,
    targetId: result.target.id,
    publicLinkId: result.publicLink.id,
    token: result.publicLink.token,
    questionId: question.id,
    questionKey: question.key,
    questionLabel: question.label,
  }
}
