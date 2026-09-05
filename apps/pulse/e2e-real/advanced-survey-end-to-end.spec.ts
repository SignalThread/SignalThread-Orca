import { expect, test, type Page } from '@playwright/test'
import { PrismaClient, QuestionType, ResponseStatus } from '@prisma/client'
import { computeSignalsWithData } from '../lib/analytics/signals'
import { verifyObjectExists } from '../lib/objectStorage'
import { installMockMediaRecorder } from '../tests/playwright/media-recorder'
import {
  cleanupAdvancedSurveyE2EFixture,
  seedAdvancedSurveyE2EFixture,
  type AdvancedSurveyE2EFixture,
} from '../tests/real-events/advanced-survey-fixture'

test.describe.serial('Advanced Survey production path with real Postgres and MinIO', () => {
  const db = new PrismaClient()
  let fixture: AdvancedSurveyE2EFixture
  const responseIds: Record<string, string> = {}

  test.beforeAll(async () => {
    fixture = await seedAdvancedSurveyE2EFixture(db)
  })

  test.afterAll(async () => {
    console.log('[AdvancedSurveyE2E:PROOF]', JSON.stringify({ surveyId: fixture?.surveyId, ...responseIds }))
    if (process.env.KEEP_ADVANCED_E2E_FIXTURE !== '1') await cleanupAdvancedSurveyE2EFixture(db)
    await db.$disconnect()
  })

  test('builder write round-trip preserves one Survey and every canonical question type', async () => {
    const survey = await db.survey.findUniqueOrThrow({
      where: { id: fixture.surveyId },
      include: { questions: { orderBy: { order: 'asc' } }, publicSurveyLinks: true },
    })
    expect(survey.name).toBe('Advanced E2E Survey')
    expect(await db.survey.count({ where: { eventId: fixture.eventId, name: 'Advanced E2E Survey' } })).toBe(1)
    expect(survey.questions.map((question) => question.type)).toEqual([
      QuestionType.RATING_1_TO_5,
      QuestionType.RECOMMENDATION_0_TO_10,
      QuestionType.OPEN_RESPONSE,
      QuestionType.OPEN_RESPONSE,
      QuestionType.YES_NO,
      QuestionType.SINGLE_CHOICE,
      QuestionType.SPEAKER_FEEDBACK,
    ])
    expect(survey.questions[0]?.configurationJson).toMatchObject({ answerFormat: 'NUMERIC', scale: { min: 1, max: 5 } })
    expect(survey.questions[1]?.configurationJson).toMatchObject({ answerFormat: 'NUMERIC', scale: { min: 0, max: 10 } })
    expect(survey.questions[5]?.configurationJson).toMatchObject({ options: ['Content', 'Speakers', 'Networking'] })
    expect(new Set(survey.publicSurveyLinks.map((link) => link.surveyTargetId))).toEqual(new Set([
      fixture.session1.targetId,
      fixture.session2.targetId,
    ]))
    expect(survey.publicSurveyLinks.every((link) => link.isActive)).toBe(true)
    const eventAreaSurvey = await db.survey.findUniqueOrThrow({
      where: { id: fixture.registrationSurveyId },
      include: { publicSurveyLinks: true },
    })
    expect(eventAreaSurvey.publicSurveyLinks).toEqual([
      expect.objectContaining({ surveyTargetId: fixture.registration.targetId, isActive: true }),
    ])
  })

  test('Session 1 uses its agenda context and uploads real browser audio to MinIO', async ({ page }) => {
    await installMockMediaRecorder(page)
    await startSurvey(page, fixture.session1.token, 'VOICE_ONLY')

    await expect(page.getByText('Opening Keynote', { exact: true })).toBeVisible()
    await expect(page.getByText('Jane Smith · Marcus Lee', { exact: true })).toBeVisible()
    await expect(page.getByText('Future of Events', { exact: true })).toHaveCount(0)
    await answerStructured(page, fixture.questions[0]!.label, '4')
    await answerStructured(page, fixture.questions[1]!.label, '8')

    const firstVoice = await answerVoice(page, fixture.questions[2]!.label)
    expect(firstVoice.status(), firstVoice.url()).toBe(200)
    const secondVoice = await answerVoice(page, fixture.questions[3]!.label)
    expect(secondVoice.status(), secondVoice.url()).toBe(200)

    await answerStructured(page, fixture.questions[4]!.label, 'Yes')
    await answerStructured(page, fixture.questions[5]!.label, 'Content')
    await expect(page.getByRole('heading', { name: fixture.questions[6]!.label })).toBeVisible()
    for (const speaker of ['Jane Smith', 'Marcus Lee']) {
      await page.getByRole('radiogroup', { name: `Rating for ${speaker}` }).getByRole('radio', { name: '4 stars', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.waitForURL('**/kiosk/thank-you**', { timeout: 60_000 })

    const response = await latestResponseForLink(db, fixture.session1.publicLinkId)
    responseIds.session1ResponseId = response.id
    expect(response).toMatchObject({
      eventId: fixture.eventId,
      surveyId: fixture.surveyId,
      surveyTargetId: fixture.session1.targetId,
      publicSurveyLinkId: fixture.session1.publicLinkId,
      status: ResponseStatus.COMPLETED,
    })

    const answers = await waitForProcessedAnswers(db, response.id, 2)
    const openAnswers = answers.filter((answer) => answer.question?.type === QuestionType.OPEN_RESPONSE)
    expect(openAnswers).toHaveLength(2)
    for (const answer of openAnswers) {
      expect(answer.objectKey).toBeTruthy()
      expect(await verifyObjectExists(process.env.S3_BUCKET_NAME!, answer.objectKey!)).toBe(true)
      expect(answer.answerTranscript?.text).toBe('The room was comfortable but registration lines were long.')
      expect(answer.answerAnalysis?.answerId).toBe(answer.id)
      expect(answer.answerEventIntelligence?.responseId).toBe(response.id)
    }
    expect(answerFor(answers, fixture.questions[0]!.id).numericValue).toBe(4)
    expect(answerFor(answers, fixture.questions[1]!.id).numericValue).toBe(8)
    expect(answerFor(answers, fixture.questions[4]!.id).numericValue).toBe(1)
    expect(answerFor(answers, fixture.questions[5]!.id).numericValue).toBe(0)
    expect(answers.filter((answer) => answer.questionId === fixture.questions[6]!.id).map((answer) => answer.speakerId).sort()).toEqual([...fixture.session1.speakerIds].sort())
  })

  test('the same Survey launches Session 2 with only Sarah Jones and persists typed answers', async ({ page }) => {
    await startSurvey(page, fixture.session2.token, 'TEXT_ONLY')
    await expect(page.getByText('Future of Events', { exact: true })).toBeVisible()
    await expect(page.getByText('Sarah Jones', { exact: true })).toBeVisible()
    await expect(page.getByText('Opening Keynote', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Jane Smith', { exact: true })).toHaveCount(0)
    await answerStructured(page, fixture.questions[0]!.label, '5')
    await answerStructured(page, fixture.questions[1]!.label, '9')
    await answerText(page, fixture.questions[2]!.label, 'Registration was easy and the keynote was useful.')
    await answerText(page, fixture.questions[3]!.label, 'Add more time for audience questions.')
    await answerStructured(page, fixture.questions[4]!.label, 'Yes')
    await answerStructured(page, fixture.questions[5]!.label, 'Speakers')
    await page.getByRole('radiogroup', { name: 'Rating for Sarah Jones' }).getByRole('radio', { name: '5 stars', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.waitForURL('**/kiosk/thank-you**', { timeout: 60_000 })

    const response = await latestResponseForLink(db, fixture.session2.publicLinkId)
    responseIds.session2ResponseId = response.id
    expect(response).toMatchObject({
      surveyId: fixture.surveyId,
      surveyTargetId: fixture.session2.targetId,
      publicSurveyLinkId: fixture.session2.publicLinkId,
      status: ResponseStatus.COMPLETED,
    })
    const answers = await waitForProcessedAnswers(db, response.id, 2)
    expect(answers.filter((answer) => answer.question?.type === QuestionType.OPEN_RESPONSE).map((answer) => answer.answerTranscript?.text)).toEqual([
      'Registration was easy and the keynote was useful.',
      'Add more time for audience questions.',
    ])
    expect(answers.filter((answer) => answer.questionId === fixture.questions[6]!.id).map((answer) => answer.speakerId)).toEqual(fixture.session2.speakerIds)
  })

  test('Event Area launch keeps Registration attribution and no session context', async ({ page }) => {
    await startSurvey(page, fixture.registration.token, 'TEXT_ONLY')
    await expect(page.getByText('Opening Keynote', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Future of Events', { exact: true })).toHaveCount(0)
    await answerStructured(page, fixture.questions[0]!.label, '4')
    await answerStructured(page, fixture.questions[1]!.label, '7')
    await answerText(page, fixture.questions[2]!.label, 'Registration staff were welcoming.')
    await answerText(page, fixture.questions[3]!.label, 'Add one more registration lane.')
    await answerStructured(page, fixture.questions[4]!.label, 'Yes')
    await answerStructured(page, fixture.questions[5]!.label, 'Networking')
    await page.waitForURL('**/kiosk/thank-you**', { timeout: 60_000 })

    const response = await latestResponseForLink(db, fixture.registration.publicLinkId)
    responseIds.eventAreaResponseId = response.id
    expect(response).toMatchObject({
      surveyId: fixture.registrationSurveyId,
      surveyTargetId: fixture.registration.targetId,
      publicSurveyLinkId: fixture.registration.publicLinkId,
      speakerAssignmentId: null,
      status: ResponseStatus.COMPLETED,
    })
  })

  test('Signals consumes the completed Advanced answers and legacy kiosk still creates a response', async ({ page }) => {
    const { signals, windowData } = await computeSignalsWithData({ eventId: fixture.eventId, windowDays: 30 })
    expect(new Set(windowData.responses.map((response) => response.id))).toEqual(new Set([
      responseIds.session1ResponseId,
      responseIds.session2ResponseId,
      responseIds.eventAreaResponseId,
    ]))
    expect(signals.metadata.completedResponses).toBe(3)
    expect(signals.metadata.answersCaptured).toBeGreaterThan(signals.metadata.answersAnalyzed)
    expect(signals.metadata.answersAnalyzed).toBeGreaterThanOrEqual(6)

    const before = await db.response.count({ where: { eventId: fixture.legacyEventId } })
    await installMockMediaRecorder(page)
    await page.goto(`/kiosk?eventId=${fixture.legacyEventId}`)
    await page.getByRole('button', { name: 'Start Advanced E2E' }).click()
    const legacyPut = await answerVoice(page, 'Legacy kiosk compatibility question')
    expect(legacyPut.status(), legacyPut.url()).toBe(200)
    await page.waitForURL('**/kiosk/thank-you**', { timeout: 60_000 })
    expect(await db.response.count({ where: { eventId: fixture.legacyEventId } })).toBe(before + 1)
    const legacyResponse = await db.response.findFirstOrThrow({
      where: { eventId: fixture.legacyEventId },
      orderBy: { startedAt: 'desc' },
    })
    expect(legacyResponse.status).toBe(ResponseStatus.COMPLETED)
    const [legacyAnswer] = await waitForProcessedAnswers(db, legacyResponse.id, 1)
    expect(legacyAnswer?.objectKey).toBeTruthy()
    expect(await verifyObjectExists(process.env.S3_BUCKET_NAME!, legacyAnswer!.objectKey!)).toBe(true)
    expect(legacyAnswer?.answerTranscript?.text).toBe('The room was comfortable but registration lines were long.')
  })
})

async function startSurvey(page: Page, token: string, mode: 'VOICE_ONLY' | 'TEXT_ONLY') {
  await page.goto(`/kiosk?token=${token}`)
  await page.getByRole('radio', { name: mode === 'VOICE_ONLY' ? /Speak with me/ : /Read & type/ }).click()
  await page.getByRole('button', { name: 'Start Advanced E2E' }).click()
}

async function answerStructured(page: Page, heading: string, answer: string) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  await page.getByRole('radio', { name: answer, exact: true }).click()
  await page.getByRole('button', { name: /Continue|Finish/ }).click()
}

async function answerText(page: Page, heading: string, answer: string) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  await page.getByPlaceholder('Type your response…').fill(answer)
  await page.getByRole('button', { name: /Continue|Send/ }).click()
}

async function answerVoice(page: Page, heading: string) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  const put = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).port === '9000')
  await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click()
  return put
}

async function latestResponseForLink(db: PrismaClient, publicLinkId: string) {
  return db.response.findFirstOrThrow({ where: { publicSurveyLinkId: publicLinkId }, orderBy: { startedAt: 'desc' } })
}

async function waitForProcessedAnswers(db: PrismaClient, responseId: string, expectedAnalyzed: number) {
  await expect.poll(async () => db.answer.count({
    where: { responseId, answerTranscript: { isNot: null }, answerAnalysis: { isNot: null }, status: 'COMPLETED' },
  }), { timeout: 60_000 }).toBeGreaterThanOrEqual(expectedAnalyzed)
  return db.answer.findMany({
    where: { responseId },
    orderBy: { createdAt: 'asc' },
    include: { question: true, answerTranscript: true, answerAnalysis: true, answerEventIntelligence: true },
  })
}

function answerFor<T extends { questionId: string | null }>(answers: T[], questionId: string): T & { numericValue: number | null } {
  const answer = answers.find((candidate) => candidate.questionId === questionId)
  if (!answer) throw new Error(`Missing answer for ${questionId}`)
  return answer as T & { numericValue: number | null }
}
