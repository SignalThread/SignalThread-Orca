import type { BrowserContext, Page } from '@playwright/test'

export async function mockAppSession(context: BrowserContext, accountSlug: string, role = 'ADMIN') {
  await context.addCookies([
    {
      name: 'voice_test_account',
      value: accountSlug,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
    {
      name: 'voice_test_role',
      value: role,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ])
}

export async function installCommonApiMocks(page: Page) {
  await page.route('**/api/app/question-audio/preview?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        audioUrl: 'https://storage.example/question-preview.mp3',
      }),
    })
  })
}
