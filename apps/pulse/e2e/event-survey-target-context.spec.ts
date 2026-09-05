import { expect, test, type Page } from '@playwright/test'

type TargetFixture = {
  token: string
  linkId: string
  targetId: string
  sessionId: string
  sessionName: string
  speakerId: string
  speakerName: string
}

const targets: TargetFixture[] = [
  { token: 'session-a-token', linkId: 'link-a', targetId: 'target-a', sessionId: 'session-a', sessionName: 'Session A', speakerId: 'speaker-a', speakerName: 'Ada Speaker' },
  { token: 'session-b-token', linkId: 'link-b', targetId: 'target-b', sessionId: 'session-b', sessionName: 'Session B', speakerId: 'speaker-b', speakerName: 'Bea Speaker' },
]

async function mockTargetedLaunches(page: Page) {
  await page.route('**/api/kiosk/event-details?**', async (route) => {
    const token = new URL(route.request().url()).searchParams.get('token')
    const target = targets.find((candidate) => candidate.token === token)
    if (!target) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Public survey link not found' }) })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        event: {
          id: 'event-target-context',
          name: 'Target Context Event',
          eventType: 'ADVANCED',
          accountType: 'EVENTS',
          responseMode: 'TEXT_ONLY',
          presentationMode: 'SCREEN',
          surveyId: 'survey-shared',
          surveyTargetId: target.targetId,
          publicSurveyLinkId: target.linkId,
          surveyIntro: 'Tell us about this session.',
          targetContext: { category: 'SESSION', name: target.sessionName, kind: 'SESSION' },
          sessionContext: {
            session: { id: target.sessionId, name: target.sessionName },
            speakers: [{ id: target.speakerId, name: target.speakerName }],
          },
          speakerContext: null,
          location: { id: 'location-1', name: 'Main Hall', googleReviewUrl: null },
          branding: { logoUrl: null, primaryColor: null, primaryButtonColor: null },
          consent: { title: 'Session feedback', subtitle: 'Your input helps', items: [], buttonText: 'Start session', bulletStyle: 'CHECKMARK' },
        },
      }),
    })
  })

  await page.route('**/api/response/create', async (route) => {
    const body = route.request().postDataJSON() as { token?: string }
    const target = targets.find((candidate) => candidate.token === body.token)
    if (!target) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false }) })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          responseId: `response-${target.sessionId}`,
          eventId: 'event-target-context',
          responseMode: 'TEXT_ONLY',
          anonymousId: 'anonymous',
          surveyId: 'survey-shared',
          surveyTargetId: target.targetId,
          publicSurveyLinkId: target.linkId,
          questions: [{ id: 'overall', questionId: 'overall', text: 'How was this session?', order: 0, type: 'RATING_1_TO_5', responseTarget: 'GENERAL', isRequired: true }],
          sessionContext: {
            session: { id: target.sessionId, name: target.sessionName },
            speakers: [{ id: target.speakerId, name: target.speakerName }],
            presenterRatingQuestionId: null,
          },
          speakerContext: null,
        },
      }),
    })
  })
}

test('the actual token kiosk renders and isolates authoritative session speaker context', async ({ page }) => {
  await mockTargetedLaunches(page)

  await page.goto('/kiosk?token=session-a-token')
  await expect(page.getByText('Session · Session A · Ada Speaker', { exact: true })).toBeVisible()
  await expect(page.getByText('Bea Speaker', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.getByRole('heading', { name: 'Session A' })).toBeVisible()
  await expect(page.getByText('Ada Speaker', { exact: true })).toBeVisible()

  await page.goto('/kiosk?token=session-b-token')
  await expect(page.getByText('Session · Session B · Bea Speaker', { exact: true })).toBeVisible()
  await expect(page.getByText('Ada Speaker', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.getByRole('heading', { name: 'Session B' })).toBeVisible()
  await expect(page.getByText('Bea Speaker', { exact: true })).toBeVisible()
})
