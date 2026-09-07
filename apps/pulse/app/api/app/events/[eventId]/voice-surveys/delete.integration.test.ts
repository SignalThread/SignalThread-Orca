import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAccountAdminMock = vi.fn()
const loadEventSurveyWorkspacePackageMock = vi.fn()

const transaction = {
  question: { deleteMany: vi.fn() },
  survey: { delete: vi.fn(), count: vi.fn() },
  publicSurveyLink: { count: vi.fn() },
  surveyTarget: { delete: vi.fn() },
}

const prismaMock = {
  survey: { findFirst: vi.fn() },
  response: { count: vi.fn() },
  $transaction: vi.fn(),
}

vi.mock('@/lib/auth/require-account-admin', () => ({
  requireAccountAdmin: requireAccountAdminMock,
}))

vi.mock('@/lib/event-survey-workspace', () => ({
  loadEventSurveyWorkspacePackage: loadEventSurveyWorkspacePackageMock,
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/question-audio', () => ({ ensureSurveyQuestionAudioForSurvey: vi.fn() }))

describe('DELETE /api/app/events/[eventId]/voice-surveys canonical integration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    requireAccountAdminMock.mockResolvedValue({
      ok: true,
      account: { id: 'acct_site_stay', slug: 'site-stay' },
    })
    prismaMock.survey.findFirst.mockResolvedValue({
      id: 'survey_target',
      surveyTargetId: null,
      event: { location: { account: { accountType: 'EVENTS' } } },
      publicSurveyLinks: [],
      _count: { responses: 0 },
    })
    prismaMock.response.count.mockResolvedValue(0)
    transaction.question.deleteMany.mockResolvedValue({ count: 2 })
    transaction.survey.delete.mockResolvedValue({ id: 'survey_target' })
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    loadEventSurveyWorkspacePackageMock.mockResolvedValue({
      id: 'evt_target',
      name: 'Target Event',
      status: 'ACTIVE',
      eventType: 'TEMPLATE',
      isActive: true,
      startDate: null,
      endDate: null,
      ttsProvider: null,
      ttsVoice: null,
      ttsLocale: null,
      location: { id: 'loc_target', name: 'Venue', slug: 'venue', timezone: 'UTC', account: { accountType: 'EVENTS' } },
      surveys: [],
      surveySource: 'EMPTY',
    })
  })

  it('deletes through the real route and canonical service, then returns a workspace without the survey', async () => {
    const { DELETE } = await import('@/app/api/app/events/[eventId]/voice-surveys/route')

    const response = await DELETE(
      new NextRequest('http://localhost/api/app/events/evt_target/voice-surveys?account=site-stay', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: 'survey_target' }),
      }),
      { params: { eventId: 'evt_target' } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { surveys: [] },
    })
    expect(requireAccountAdminMock).toHaveBeenCalledWith('site-stay')
    expect(prismaMock.survey.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'survey_target',
        eventId: 'evt_target',
        event: { location: { accountId: 'acct_site_stay' } },
      },
      select: expect.any(Object),
    })
    expect(transaction.question.deleteMany).toHaveBeenCalledWith({ where: { surveyId: 'survey_target' } })
    expect(transaction.survey.delete).toHaveBeenCalledWith({ where: { id: 'survey_target' } })
  })
})
