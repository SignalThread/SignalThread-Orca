import { randomUUID } from 'crypto'

export type TestAccountType = 'RETAIL' | 'EVENTS'
export type TestRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'VIEWER'

export type TestAccount = {
  id: string
  slug: string
  name: string
  email: string
  accountType: TestAccountType
  tier: string
  settingsJson: Record<string, unknown>
}

export type TestUser = {
  id: string
  email: string
  accountId: string | null
  role: TestRole
  isActive: boolean
}

export type TestLocation = {
  id: string
  accountId: string
  name: string
  slug: string
  googleReviewUrl: string | null
  isActive: boolean
}

export type TestEvent = {
  id: string
  locationId: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  eventType: string
  responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  isActive: boolean
  questionsJson: Array<Record<string, unknown>>
  ttsProvider: string
  ttsVoice: string
  ttsLocale: string
}

export type TestQuestion = {
  id: string
  eventId: string
  surveyId?: string | null
  key: string
  label: string
  ttsText: string | null
  order: number
  required: boolean
}

export type TestResponse = {
  id: string
  eventId: string
  surveyId?: string | null
  surveyTargetId?: string | null
  publicSurveyLinkId?: string | null
  anonymousId: string
  status: 'IN_PROGRESS' | 'COMPLETED'
  startedAt: Date
  completedAt: Date | null
}

export type TestAnswer = {
  id: string
  responseId: string
  questionId?: string | null
  questionKey: string
  promptLabel: string
  objectKey: string | null
  mimeType: string
  fileSizeBytes: number
  status: string
}

export type TestSurveyTarget = {
  id: string
  eventId: string
  category: 'EVENT' | 'SESSION' | 'LOCATION' | 'CUSTOM'
  name: string
  slug: string
  isActive: boolean
}

export type TestSurvey = {
  id: string
  eventId: string
  surveyTargetId: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  responseMode: 'VOICE_ONLY' | 'TEXT_ONLY' | 'VOICE_AND_TEXT'
  ttsProvider: string
  ttsVoice: string
  ttsLocale: string
}

export type TestPublicSurveyLink = {
  id: string
  surveyId: string
  token: string
  isActive: boolean
  expiresAt: Date | null
}

export function testId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 18)}`
}

export function createTestAccount(overrides: Partial<TestAccount> = {}): TestAccount {
  const id = overrides.id ?? testId('acct')
  const slug = overrides.slug ?? `acct-${id.slice(-8)}`
  return {
    id,
    slug,
    name: overrides.name ?? 'Test Voice Account',
    email: overrides.email ?? `owner+${slug}@example.com`,
    accountType: overrides.accountType ?? 'RETAIL',
    tier: overrides.tier ?? 'starter',
    settingsJson: overrides.settingsJson ?? {
      branding: {
        logoUrl: null,
        primaryColor: '#2563eb',
        primaryButtonColor: '#2563eb',
      },
      consent: {
        title: 'SignalThread',
        subtitle: "We'd love to hear from you",
        items: ['Answer a few questions by voice'],
        buttonText: "I Agree, Let's Start",
      },
    },
  }
}

export function createEventsAccount(overrides: Partial<TestAccount> = {}): TestAccount {
  return createTestAccount({
    name: 'Test Events Account',
    slug: 'events-test',
    accountType: 'EVENTS',
    ...overrides,
  })
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: overrides.id ?? testId('user'),
    email: overrides.email ?? 'owner@example.com',
    accountId: overrides.accountId ?? null,
    role: overrides.role ?? 'ADMIN',
    isActive: overrides.isActive ?? true,
  }
}

export function createTestLocation(account: Pick<TestAccount, 'id'>, overrides: Partial<TestLocation> = {}): TestLocation {
  const id = overrides.id ?? testId('loc')
  return {
    id,
    accountId: overrides.accountId ?? account.id,
    name: overrides.name ?? 'Main Team',
    slug: overrides.slug ?? `main-team-${id.slice(-6)}`,
    googleReviewUrl: overrides.googleReviewUrl ?? 'https://example.com/review',
    isActive: overrides.isActive ?? true,
  }
}

export function createTestSurveyQuestions(
  eventId: string,
  count = 2,
  overrides: Partial<TestQuestion> = {},
): TestQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: overrides.id ?? testId('question'),
    eventId,
    surveyId: overrides.surveyId ?? null,
    key: overrides.key ?? `q-${index + 1}`,
    label: overrides.label ?? `Question ${index + 1}?`,
    ttsText: overrides.ttsText ?? null,
    order: overrides.order ?? index,
    required: overrides.required ?? true,
  }))
}

export function createTestEvent(location: Pick<TestLocation, 'id'>, overrides: Partial<TestEvent> = {}): TestEvent {
  const id = overrides.id ?? testId('event')
  const questionsJson = overrides.questionsJson ?? [
    { id: 'q-1', text: 'How was your visit?', order: 0, required: true },
    { id: 'q-2', text: 'What should we improve?', order: 1, required: true },
  ]
  return {
    id,
    locationId: overrides.locationId ?? location.id,
    name: overrides.name ?? 'Customer Feedback',
    status: overrides.status ?? 'ACTIVE',
    eventType: overrides.eventType ?? 'SURVEY',
    responseMode: overrides.responseMode ?? 'VOICE_ONLY',
    isActive: overrides.isActive ?? true,
    questionsJson,
    ttsProvider: overrides.ttsProvider ?? 'google',
    ttsVoice: overrides.ttsVoice ?? 'en-US-Neural2-F',
    ttsLocale: overrides.ttsLocale ?? 'en-US',
  }
}

export function createTestResponse(event: Pick<TestEvent, 'id'>, overrides: Partial<TestResponse> = {}): TestResponse {
  return {
    id: overrides.id ?? testId('resp'),
    eventId: overrides.eventId ?? event.id,
    surveyId: overrides.surveyId ?? null,
    surveyTargetId: overrides.surveyTargetId ?? null,
    publicSurveyLinkId: overrides.publicSurveyLinkId ?? null,
    anonymousId: overrides.anonymousId ?? testId('anon'),
    status: overrides.status ?? 'IN_PROGRESS',
    startedAt: overrides.startedAt ?? new Date('2026-01-01T12:00:00.000Z'),
    completedAt: overrides.completedAt ?? null,
  }
}

export function createTestAnswer(response: Pick<TestResponse, 'id'>, overrides: Partial<TestAnswer> = {}): TestAnswer {
  return {
    id: overrides.id ?? testId('answer'),
    responseId: overrides.responseId ?? response.id,
    questionId: overrides.questionId ?? null,
    questionKey: overrides.questionKey ?? 'q-1',
    promptLabel: overrides.promptLabel ?? 'How was your visit?',
    objectKey: overrides.objectKey ?? 'recordings/test-answer.webm',
    mimeType: overrides.mimeType ?? 'audio/webm',
    fileSizeBytes: overrides.fileSizeBytes ?? 1024,
    status: overrides.status ?? 'UPLOADED',
  }
}

export function createProcessedAnswer(response: Pick<TestResponse, 'id'>, overrides: Partial<TestAnswer> = {}) {
  const answer = createTestAnswer(response, { status: 'COMPLETED', ...overrides })
  return {
    answer,
    transcript: {
      id: testId('transcript'),
      answerId: answer.id,
      provider: 'openai',
      model: 'whisper-1',
      text: 'The staff were helpful and the line moved quickly.',
    },
    analysis: {
      id: testId('analysis'),
      answerId: answer.id,
      summary: 'Positive visit with efficient service.',
      sentimentLabel: 'POSITIVE',
      sentimentScore: 0.7,
      themesJson: { themes: ['Service'], keyQuote: 'The line moved quickly.' },
      actionsJson: { actionItems: [{ text: 'Keep staffing level steady', priority: 'Low' }] },
    },
  }
}

export function createEventVoiceSurveyFixture(event: Pick<TestEvent, 'id'>, overrides: {
  target?: Partial<TestSurveyTarget>
  survey?: Partial<TestSurvey>
  publicLink?: Partial<TestPublicSurveyLink>
  questions?: Partial<TestQuestion>[]
} = {}) {
  const target: TestSurveyTarget = {
    id: overrides.target?.id ?? testId('target'),
    eventId: overrides.target?.eventId ?? event.id,
    category: overrides.target?.category ?? 'EVENT',
    name: overrides.target?.name ?? 'Overall Event Experience',
    slug: overrides.target?.slug ?? 'overall-event-experience',
    isActive: overrides.target?.isActive ?? true,
  }
  const survey: TestSurvey = {
    id: overrides.survey?.id ?? testId('survey'),
    eventId: overrides.survey?.eventId ?? event.id,
    surveyTargetId: overrides.survey?.surveyTargetId ?? target.id,
    name: overrides.survey?.name ?? 'Attendee Voice Survey',
    status: overrides.survey?.status ?? 'ACTIVE',
    responseMode: overrides.survey?.responseMode ?? 'VOICE_ONLY',
    ttsProvider: overrides.survey?.ttsProvider ?? 'google',
    ttsVoice: overrides.survey?.ttsVoice ?? 'en-US-Neural2-F',
    ttsLocale: overrides.survey?.ttsLocale ?? 'en-US',
  }
  const publicLink = createPublicSurveyLinkFixture(survey, overrides.publicLink)
  const questions = overrides.questions?.map((question, index) => ({
    ...createTestSurveyQuestions(event.id, 1, {
      surveyId: survey.id,
      key: `survey-q-${index + 1}`,
      label: `Survey question ${index + 1}?`,
      order: index,
      ...question,
    })[0],
  })) ?? createTestSurveyQuestions(event.id, 2, { surveyId: survey.id })
  return { target, survey, publicLink, questions }
}

export function createPublicSurveyLinkFixture(
  survey: Pick<TestSurvey, 'id'>,
  overrides: Partial<TestPublicSurveyLink> = {},
): TestPublicSurveyLink {
  return {
    id: overrides.id ?? testId('link'),
    surveyId: overrides.surveyId ?? survey.id,
    token: overrides.token ?? `token-${randomUUID()}`,
    isActive: overrides.isActive ?? true,
    expiresAt: overrides.expiresAt ?? null,
  }
}

export async function cleanupTestData(
  db: {
    answerProcessingLog?: { deleteMany(args: unknown): Promise<unknown> }
    answerAnalysis?: { deleteMany(args: unknown): Promise<unknown> }
    answerTranscript?: { deleteMany(args: unknown): Promise<unknown> }
    answer?: { deleteMany(args: unknown): Promise<unknown> }
    response?: { deleteMany(args: unknown): Promise<unknown> }
    publicSurveyLink?: { deleteMany(args: unknown): Promise<unknown> }
    question?: { deleteMany(args: unknown): Promise<unknown> }
    survey?: { deleteMany(args: unknown): Promise<unknown> }
    surveyTarget?: { deleteMany(args: unknown): Promise<unknown> }
    eventStructureItem?: { deleteMany(args: unknown): Promise<unknown> }
    event?: { deleteMany(args: unknown): Promise<unknown> }
    location?: { deleteMany(args: unknown): Promise<unknown> }
    user?: { deleteMany(args: unknown): Promise<unknown> }
    pendingProvision?: { deleteMany(args: unknown): Promise<unknown> }
    account?: { deleteMany(args: unknown): Promise<unknown> }
  },
  scope: { accountIds?: string[]; locationIds?: string[]; eventIds?: string[]; responseIds?: string[] },
) {
  const responseWhere = scope.responseIds?.length ? { responseId: { in: scope.responseIds } } : undefined
  const eventWhere = scope.eventIds?.length ? { eventId: { in: scope.eventIds } } : undefined

  if (responseWhere) {
    await db.answerProcessingLog?.deleteMany({ where: { answer: responseWhere } })
    await db.answerAnalysis?.deleteMany({ where: { answer: responseWhere } })
    await db.answerTranscript?.deleteMany({ where: { answer: responseWhere } })
    await db.answer?.deleteMany({ where: responseWhere })
    await db.response?.deleteMany({ where: { id: { in: scope.responseIds } } })
  }
  if (eventWhere) {
    await db.publicSurveyLink?.deleteMany({ where: { survey: eventWhere } })
    await db.question?.deleteMany({ where: eventWhere })
    await db.survey?.deleteMany({ where: eventWhere })
    await db.surveyTarget?.deleteMany({ where: eventWhere })
    await db.eventStructureItem?.deleteMany({ where: eventWhere })
    await db.event?.deleteMany({ where: { id: { in: scope.eventIds } } })
  }
  if (scope.locationIds?.length) {
    await db.location?.deleteMany({ where: { id: { in: scope.locationIds } } })
  }
  if (scope.accountIds?.length) {
    await db.user?.deleteMany({ where: { accountId: { in: scope.accountIds } } })
    await db.pendingProvision?.deleteMany({ where: { accountId: { in: scope.accountIds } } })
    await db.account?.deleteMany({ where: { id: { in: scope.accountIds } } })
  }
}
