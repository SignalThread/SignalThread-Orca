import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  account: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  pendingProvision: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  accountUserMembership: {
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
  location: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  event: {
    create: vi.fn(),
  },
}

const sendEmailOtpCodeMock = vi.fn()
const createEventVoiceSurveyMock = vi.fn()

vi.mock('./prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('./account-users', () => ({
  normalizeInviteEmail: (email: string) => email.trim().toLowerCase(),
  sendEmailOtpCode: sendEmailOtpCodeMock,
}))

vi.mock('./event-voice-surveys', () => ({
  createEventVoiceSurvey: createEventVoiceSurveyMock,
}))

describe('provisionEventsWorkspace', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    prismaMock.account.findUnique.mockResolvedValue(null)
    prismaMock.pendingProvision.findUnique.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.account.create.mockResolvedValue({
      id: 'acct_123',
      name: 'TechConf',
      slug: 'techconf',
      accountType: 'EVENTS',
      tier: 'growth',
      email: 'owner@example.com',
      isActive: true,
    })
    prismaMock.location.findFirst.mockResolvedValue(null)
    prismaMock.location.create.mockResolvedValue({
      id: 'loc_123',
      accountId: 'acct_123',
      name: 'Conference Team',
      slug: 'conference-team',
      isActive: true,
    })
    prismaMock.event.create.mockResolvedValue({
      id: 'evt_123',
      locationId: 'loc_123',
      name: 'Event Voice Feedback',
      eventType: 'ADVANCED',
      status: 'ACTIVE',
      isActive: true,
    })
    createEventVoiceSurveyMock.mockResolvedValue({
      target: { id: 'target_123', eventId: 'evt_123', category: 'EVENT', name: 'Event Voice Feedback' },
      survey: { id: 'survey_123', eventId: 'evt_123', surveyTargetId: 'target_123', status: 'ACTIVE' },
      questions: [
        { id: 'question_1', eventId: 'evt_123', surveyId: 'survey_123', label: 'What stood out?' },
      ],
      publicLink: {
        id: 'link_123',
        surveyId: 'survey_123',
        token: 'public token',
        isActive: true,
      },
    })
    sendEmailOtpCodeMock.mockResolvedValue({ ok: true })
  })

  it('creates an EVENTS account with location, event, starter survey hierarchy, public link, and pending provision', async () => {
    const { provisionEventsWorkspace } = await import('./provisioning')

    const result = await provisionEventsWorkspace({
      accountName: 'TechConf',
      accountSlug: 'techconf',
      accountEmail: 'Owner@Example.com',
      ownerEmail: 'Owner@Example.com',
      locationName: 'Conference Team',
      plan: 'growth',
    })

    expect(result.success).toBe(true)
    expect(prismaMock.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'TechConf',
        slug: 'techconf',
        accountType: 'EVENTS',
        tier: 'growth',
        email: 'owner@example.com',
        isActive: true,
      }),
    })
    expect(prismaMock.location.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acct_123',
        name: 'Conference Team',
        slug: 'conference-team',
        googleReviewUrl: null,
        isActive: true,
      }),
    })
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        locationId: 'loc_123',
        name: 'Event Voice Feedback',
        eventType: 'ADVANCED',
        status: 'ACTIVE',
        isActive: true,
        questionsJson: [],
      }),
    })
    expect(createEventVoiceSurveyMock).toHaveBeenCalledWith({
      eventId: 'evt_123',
      targetCategory: 'EVENT',
      targetName: 'Event Voice Feedback',
      targetDescription: undefined,
      surveyName: 'Event Voice Survey',
      surveyDescription: undefined,
      surveyStatus: 'ACTIVE',
      questions: expect.arrayContaining([
        expect.objectContaining({
          prompt: 'What was the most valuable part of this event?',
          required: true,
        }),
      ]),
    })
    expect(prismaMock.pendingProvision.create).toHaveBeenCalledWith({
      data: {
        email: 'owner@example.com',
        accountId: 'acct_123',
        role: 'ADMIN',
      },
    })
    expect(sendEmailOtpCodeMock).toHaveBeenCalledWith({
      email: 'owner@example.com',
      shouldCreateUser: true,
    })
    expect(result).toMatchObject({
      accountId: 'acct_123',
      locationId: 'loc_123',
      eventId: 'evt_123',
      targetId: 'target_123',
      surveyId: 'survey_123',
      publicLinkId: 'link_123',
      publicLink: {
        token: 'public token',
        kioskPath: '/kiosk?token=public%20token',
      },
    })
  })
})
