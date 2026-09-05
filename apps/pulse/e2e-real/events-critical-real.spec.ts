import { expect, test, type Page } from '@playwright/test'
import { PrismaClient, ResponseMode } from '@prisma/client'
import {
  cleanupRealEventsFixture,
  seedRealEventsFixture,
  type RealEventsFixture,
  type RealEventsSurveyFixture,
} from '../tests/real-events/fixture'

test.describe.serial('critical Voice Events journeys with real app, API, and Postgres', () => {
  const db = new PrismaClient()
  let fixture: RealEventsFixture

  test.beforeAll(async () => {
    fixture = await seedRealEventsFixture(db)
  })

  test.afterAll(async () => {
    await cleanupRealEventsFixture(db)
    await db.$disconnect()
  })

  test('VOICE_ONLY organizer setting launches Voice without a chooser', async ({ page }) => {
    await page.goto(`/kiosk?token=${fixture.voice.token}`)
    await expect(page.getByRole('heading', { name: 'Real Events Journey' })).toBeVisible()
    await expect(page.getByText('How would you like to respond?')).toHaveCount(0)
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expectVoiceQuestion(page, fixture.voice)
    await expectPersistedLaunch(db, fixture.voice, ResponseMode.VOICE_ONLY, fixture.eventId)
  })

  test('TEXT_ONLY organizer setting launches Text and persists the answer', async ({ page }) => {
    await page.goto(`/kiosk?token=${fixture.text.token}`)
    await expect(page.getByText('How would you like to respond?')).toHaveCount(0)
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expect(page.getByRole('heading', { name: fixture.text.questionLabel })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tap microphone to start recording' })).toHaveCount(0)
    await page.getByPlaceholder('Type your response…').fill('This real persisted text answer crossed the application boundary.')
    await page.getByRole('button', { name: 'Send' }).click()
    await page.waitForURL('**/kiosk/thank-you**', { timeout: 60_000 })

    const response = await latestResponseForLink(db, fixture.text.publicLinkId)
    expect(response).toMatchObject({
      eventId: fixture.eventId,
      surveyId: fixture.text.surveyId,
      surveyTargetId: fixture.text.targetId,
      responseMode: ResponseMode.TEXT_ONLY,
    })
    const answer = await db.answer.findFirstOrThrow({
      where: { responseId: response.id },
      include: { answerTranscript: true },
    })
    expect(answer).toMatchObject({
      responseId: response.id,
      questionId: fixture.text.questionId,
      questionKey: fixture.text.questionKey,
      mimeType: 'text/plain',
    })
    expect(answer.answerTranscript?.text).toBe('This real persisted text answer crossed the application boundary.')
  })

  test('VOICE_AND_TEXT lets the attendee choose Voice for the whole Response', async ({ page }) => {
    await page.goto(`/kiosk?token=${fixture.choice.token}`)
    await expect(page.getByText('How would you like to respond?')).toBeVisible()
    await page.getByRole('radio', { name: /Speak my answers/ }).click()
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expectVoiceQuestion(page, fixture.choice)
    await expectPersistedLaunch(db, fixture.choice, ResponseMode.VOICE_ONLY, fixture.eventId)
  })

  test('VOICE_AND_TEXT lets the attendee choose Text for the whole Response', async ({ page }) => {
    await page.goto(`/kiosk?token=${fixture.choice.token}`)
    await page.getByRole('radio', { name: /Type my answers/ }).click()
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expect(page.getByRole('heading', { name: fixture.choice.questionLabel })).toBeVisible()
    await expect(page.getByPlaceholder('Type your response…')).toBeVisible()
    await expectPersistedLaunch(db, fixture.choice, ResponseMode.TEXT_ONLY, fixture.eventId)
  })

  test('legacy eventId kiosk remains compatible with real response creation', async ({ page }) => {
    await page.goto(`/kiosk?eventId=${fixture.legacyEventId}`)
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expect(page.getByRole('heading', { name: 'Legacy real kiosk question' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tap microphone to start recording' })).toBeVisible()
    const response = await db.response.findFirstOrThrow({
      where: { eventId: fixture.legacyEventId },
      orderBy: { startedAt: 'desc' },
    })
    expect(response).toMatchObject({
      surveyId: null,
      surveyTargetId: null,
      publicSurveyLinkId: null,
      responseMode: ResponseMode.VOICE_ONLY,
    })
  })

  test('a specific token returns only its target survey question and rejects cross-survey answers', async ({ page, request }) => {
    await page.goto(`/kiosk?token=${fixture.targeted.token}`)
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expect(page.getByRole('heading', { name: fixture.targeted.questionLabel })).toBeVisible()
    await expect(page.getByText(fixture.text.questionLabel)).toHaveCount(0)
    await expectPersistedLaunch(db, fixture.targeted, ResponseMode.TEXT_ONLY, fixture.eventId)
    const response = await latestResponseForLink(db, fixture.targeted.publicLinkId)
    const answerAttempt = await request.post('/api/answer/text', {
      data: {
        responseId: response.id,
        questionKey: fixture.text.questionKey,
        promptLabel: fixture.text.questionLabel,
        text: 'This must be rejected before persistence.',
      },
    })
    expect(answerAttempt.status()).toBe(404)
    expect(await db.answer.count({ where: { responseId: response.id } })).toBe(0)
  })

  test('inactive, expired, and invalid links show a safe failure and create no Response', async ({ page }) => {
    const before = await db.response.count({ where: { eventId: fixture.eventId } })
    for (const [token, safeMessage] of [
      [fixture.inactiveToken, 'inactive'],
      [fixture.expiredToken, 'expired'],
      ['not-a-real-public-token', 'not found'],
    ] as const) {
      await page.goto(`/kiosk?token=${token}`)
      await expect(page.getByRole('heading', { name: 'Unable to Load Kiosk' })).toBeVisible()
      await expect(page.getByText(new RegExp(safeMessage, 'i'))).toBeVisible()
    }
    expect(await db.response.count({ where: { eventId: fixture.eventId } })).toBe(before)
  })

  test('canonical organizer session attachment hands its generated link to the attendee', async ({ page }) => {
    const survey = await db.survey.findUniqueOrThrow({
      where: { id: fixture.sessionHandoff.surveyId },
      include: { surveyTarget: true, publicSurveyLinks: true },
    })
    expect(survey.surveyTarget).not.toBeNull()
    if (!survey.surveyTarget) throw new Error('Session handoff survey must be assigned')
    expect(survey.surveyTarget.eventStructureItemId).toBe(fixture.sessionId)
    expect(survey.publicSurveyLinks[0]?.token).toBe(fixture.sessionHandoff.token)

    await page.goto(`/kiosk?token=${survey.publicSurveyLinks[0]!.token}`)
    await page.getByRole('button', { name: "Let's Go!" }).click()
    await expect(page.getByRole('heading', { name: fixture.sessionHandoff.questionLabel })).toBeVisible()
    await expectPersistedLaunch(db, fixture.sessionHandoff, ResponseMode.TEXT_ONLY, fixture.eventId)
  })
})

async function expectVoiceQuestion(page: Page, survey: RealEventsSurveyFixture) {
  await expect(page.getByRole('heading', { name: survey.questionLabel })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tap microphone to start recording' })).toBeVisible()
  await expect(page.getByPlaceholder('Type your response…')).toHaveCount(0)
}

async function latestResponseForLink(db: PrismaClient, publicLinkId: string) {
  return db.response.findFirstOrThrow({
    where: { publicSurveyLinkId: publicLinkId },
    orderBy: { startedAt: 'desc' },
  })
}

async function expectPersistedLaunch(
  db: PrismaClient,
  survey: RealEventsSurveyFixture,
  responseMode: ResponseMode,
  eventId: string,
) {
  await expect.poll(async () => latestResponseForLink(db, survey.publicLinkId)).toMatchObject({
    eventId,
    surveyId: survey.surveyId,
    surveyTargetId: survey.targetId,
    publicSurveyLinkId: survey.publicLinkId,
    responseMode,
  })
}
