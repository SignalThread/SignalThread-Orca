import { expect, test, type Page, type Route } from '@playwright/test'
import { installMockMediaRecorder } from '../tests/playwright/media-recorder'

const accountSlug = 'retail-co'
const locationId = 'loc-retail-main'
const eventId = 'evt-retail-active'

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill(json(body, status))
}

const activeRetailEvent = {
  id: eventId,
  name: 'Front Counter Voice Survey',
  status: 'ACTIVE',
  eventType: 'SURVEY',
  startDate: '2026-07-01T00:00:00.000Z',
  endDate: null,
  isActive: true,
  questionsJson: [{ id: 'q-retail-1', text: 'How was your visit?', order: 0, isRequired: true }],
}

function retailAccountPayload(events = [activeRetailEvent]) {
  return {
    success: true,
    account: {
      id: 'acct-retail',
      name: 'Retail Co',
      accountType: 'RETAIL',
      tier: 'PRO',
    },
    locations: [
      {
        id: locationId,
        name: 'Downtown Shop',
        city: 'Austin',
        state: 'TX',
        isActive: true,
        events,
      },
    ],
    metrics: {
      totalEvents: events.filter((event) => event.status === 'ACTIVE').length,
      totalResponses: 14,
      avgSentiment: 0.82,
    },
  }
}

async function mockRetailAppApis(page: Page, options: { deniedAccount?: string } = {}) {
  await page.route('**/api/app/account?**', async (route) => {
    const url = new URL(route.request().url())
    const requestedAccount = url.searchParams.get('account')
    if (requestedAccount === options.deniedAccount) {
      await fulfillJson(route, { success: false, error: 'Forbidden' }, 403)
      return
    }
    await fulfillJson(route, retailAccountPayload())
  })

  await page.route('**/api/app/locations?**', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, {
        success: true,
        location: {
          id: 'loc-new',
          name: 'Field Team',
          city: null,
          state: null,
          isActive: true,
          googleReviewUrl: null,
          _count: { events: 0 },
        },
      })
      return
    }
    await fulfillJson(route, {
      success: true,
      locations: [
        {
          id: locationId,
          name: 'Downtown Shop',
          city: 'Austin',
          state: 'TX',
          isActive: true,
          googleReviewUrl: 'https://g.page/r/CODE/review',
          _count: { events: 1 },
        },
      ],
    })
  })

  await page.route('**/api/app/locations/*?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      location: {
        id: locationId,
        name: 'Downtown Shop Updated',
        city: 'Austin',
        state: 'TX',
        isActive: true,
        googleReviewUrl: 'https://g.page/r/UPDATED/review',
        _count: { events: 1 },
      },
    })
  })

  await page.route('**/api/app/account/settings?**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await fulfillJson(route, { success: true })
      return
    }
    await fulfillJson(route, {
      success: true,
      account: {
        id: 'acct-retail',
        name: 'Retail Co',
        slug: accountSlug,
        settings: {
          branding: {
            logoUrl: null,
            primaryColor: '#2563eb',
            primaryButtonColor: '#111827',
          },
          consent: {
            title: 'Retail Co',
            subtitle: 'Share quick feedback',
            items: ['This survey records audio', 'Your response helps improve service'],
            buttonText: 'Start survey',
          },
        },
      },
    })
  })

  await page.route('**/api/app/account/billing?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      billing: {
        planTier: 'PRO',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
        trialEndsAt: null,
      },
    })
  })

  await page.route('**/api/app/account/users?**', async (route) => {
    await fulfillJson(route, { success: true, users: [], pendingInvites: [] })
  })

  await page.route('**/api/app/question-audio/preview?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      mimeType: 'audio/mpeg',
      audioBase64: 'SUQzAwAAAAAA',
    })
  })

  await page.route('**/api/app/events?**', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, {
        success: true,
        event: {
          id: 'evt-new-survey',
          name: 'Lobby Follow-up Survey',
        },
      })
      return
    }
    await fulfillJson(route, { success: true, events: [activeRetailEvent] })
  })
}

async function mockKioskApis(page: Page, options: { noQuestions?: boolean; microphoneDenied?: boolean } = {}) {
  await installMockMediaRecorder(page, { denyMicrophone: options.microphoneDenied })

  await page.route('**/api/kiosk/event-details?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      event: {
        id: eventId,
        name: 'Front Counter Voice Survey',
        responseMode: 'VOICE_ONLY',
        accountType: 'RETAIL',
        location: { googleReviewUrl: null },
        branding: {
          logoUrl: null,
          primaryColor: '#2563eb',
          primaryButtonColor: '#111827',
        },
        consent: {
          title: 'Retail Co',
          subtitle: 'Share quick feedback',
          items: ['This survey records audio', 'Your response helps improve service'],
          buttonText: 'Start survey',
        },
      },
    })
  })

  await page.route('**/api/response/create', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        responseId: 'resp-retail-1',
        eventId,
        responseMode: 'VOICE_ONLY',
        questions: options.noQuestions
          ? []
          : [
              {
                id: 'q-retail-1',
                questionId: 'q-retail-1',
                type: 'VOICE',
                text: 'How was your visit?',
                order: 0,
                isRequired: true,
                audioUrl: 'https://storage.example/question.mp3',
              },
            ],
      },
    })
  })

  await page.route('**/api/answer/presign', async (route) => {
    await fulfillJson(route, {
      success: true,
      url: 'https://storage.example/upload/audio.webm',
      key: 'answers/resp-retail-1/q-retail-1.webm',
    })
  })

  await page.route('https://storage.example/**', async (route) => {
    await route.fulfill({ status: 200, body: '' })
  })

  await page.route('**/api/answer/complete', async (route) => {
    await fulfillJson(route, {
      success: true,
      exists: true,
      answerId: 'answer-retail-1',
      data: { answerId: 'answer-retail-1' },
    })
  })

  await page.route('**/api/answer/confirm', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        answerId: 'answer-retail-1',
        transcript: { text: 'Great service at the counter.' },
        analysis: {
          summary: 'The visit went well.',
          sentiment: 'positive',
          sentimentScore: 0.9,
          themes: ['service'],
          actionItems: [],
          keyQuote: 'Great service',
        },
      },
    })
  })

  await page.route('**/api/response/resp-retail-1/complete', async (route) => {
    await fulfillJson(route, { success: true })
  })

  await page.route('**/api/events/evt-retail-active/responses/resp-retail-1', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        answersTotal: 1,
        answers: [
          {
            status: 'COMPLETED',
            transcript: 'Great service at the counter.',
            analysis: { summary: 'The visit went well.', sentimentScore: 0.9 },
          },
        ],
      },
    })
  })
}

test.describe('SMB voice journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('booth-audio-tour-enabled', 'false')
    })
  })

  test('creates an SMB voice survey and returns to the account home', async ({ page }) => {
    await mockRetailAppApis(page)

    await page.goto(`/app/surveys/create?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Create Survey' })).toBeVisible()

    await page.getByLabel(/Survey Name/).fill('Lobby Follow-up Survey')
    await page.getByLabel('Description').fill('Capture quick voice feedback from guests.')
    await page.getByRole('combobox').nth(0).selectOption(locationId)
    await page.getByLabel('Response mode').selectOption('VOICE_ONLY')
    await page.getByRole('button', { name: 'Add Question' }).click()
    await page.getByPlaceholder('Enter question text...').fill('How was your visit?')
    await page.getByRole('button', { name: 'Save' }).click()

    const createRequest = page.waitForRequest((request) =>
      request.url().includes('/api/app/events?') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Create Survey' }).click()

    const request = await createRequest
    expect(request.postDataJSON()).toMatchObject({
      name: 'Lobby Follow-up Survey',
      locationId,
      responseMode: 'VOICE_ONLY',
    })
    await expect(page).toHaveURL(new RegExp(`/app\\?account=${accountSlug}`))
    await expect(page.getByText('Front Counter Voice Survey')).toBeVisible()
  })

  test('opens the QR/link modal from the survey home actions', async ({ page }) => {
    await mockRetailAppApis(page)

    await page.goto(`/app?account=${accountSlug}`)
    await expect(page.getByText('Front Counter Voice Survey')).toBeVisible()

    await page.getByRole('button', { name: 'QR Code' }).click()
    await expect(page.getByRole('heading', { name: 'Survey QR Code' })).toBeVisible()
    await expect(page.getByText('/kiosk?eventId=evt-retail-active')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy Link' })).toBeVisible()
    await expect(page.getByText('Signage Design')).toHaveCount(0)
  })

  test('preserves the legacy /kiosk?eventId voice recording happy path', async ({ page }) => {
    await mockKioskApis(page)

    await page.goto(`/kiosk?eventId=${eventId}`)
    await expect(page.getByRole('heading', { name: 'Retail Co' })).toBeVisible()
    await expect(page.getByText('How was your visit?')).not.toBeVisible()

    await page.getByRole('button', { name: 'Start survey' }).click()
    await expect(page.getByText('How was your visit?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tap microphone to start recording' })).toBeEnabled()

    await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
    await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click()

    await expect(page).toHaveURL(/\/kiosk\/thank-you\?eventId=evt-retail-active&responseId=resp-retail-1/)
    await expect(page.getByRole('heading', { name: 'Thank You!' })).toBeVisible()
    await expect(page.getByText('The visit went well.')).toBeVisible()
  })

  test('keeps kiosk failure states on-page without creating a second flow', async ({ page }) => {
    await mockKioskApis(page, { noQuestions: true })

    await page.goto(`/kiosk?eventId=${eventId}`)
    await page.getByRole('button', { name: 'Start survey' }).click()

    await expect(page.getByText('No questions available for this event. Please contact support.')).toBeVisible()
    await expect(page).toHaveURL(`/kiosk?eventId=${eventId}`)
  })

  test('allows SMB account settings updates through existing settings APIs', async ({ page }) => {
    await mockRetailAppApis(page)

    await page.goto(`/app/settings/profile?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Profile Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'Consent Screen' }).click()
    await page.getByRole('textbox').nth(0).fill('Retail Co Voice')
    await page.getByRole('textbox').nth(6).fill('Begin feedback')

    const saveConsent = page.waitForRequest((request) =>
      request.url().includes('/api/app/account/settings?') && request.method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save Consent' }).click()
    expect((await saveConsent).postDataJSON()).toMatchObject({
      consent: {
        title: 'Retail Co Voice',
        buttonText: 'Begin feedback',
      },
    })
    await expect(page.getByText('Saved')).toBeVisible()

    await page.getByRole('button', { name: 'Locations/Teams' }).click()
    await page.getByRole('button', { name: '+ Add Location/Team' }).click()
    await page.getByRole('combobox').selectOption('team')
    await page.locator('form input[type="text"]').first().fill('Field Team')

    const createLocation = page.waitForRequest((request) =>
      request.url().includes('/api/app/locations?') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Add Location/Team' }).last().click()
    expect((await createLocation).postDataJSON()).toMatchObject({
      name: 'Field Team',
    })
  })

  test('shows a forbidden state when a browser session reaches another tenant account', async ({ page }) => {
    await mockRetailAppApis(page, { deniedAccount: 'other-retail' })

    await page.goto('/app?account=other-retail')
    await expect(page.getByText('Error Loading Account')).toBeVisible()
    await expect(page.getByText('Forbidden')).toBeVisible()
  })
})
