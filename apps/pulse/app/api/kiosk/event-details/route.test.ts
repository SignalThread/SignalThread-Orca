import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  event: {
    findUnique: vi.fn(),
  },
  publicSurveyLink: {
    findUnique: vi.fn(),
  },
  eventStructureItem: {
    findFirst: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_123',
    name: 'Expo Feedback',
    eventType: 'SURVEY',
    status: 'ACTIVE',
    isActive: true,
    responseMode: 'VOICE_ONLY',
    ttsProvider: 'google',
    ttsVoice: 'en-US-Neural2-F',
    ttsLocale: 'en-US',
    location: {
      id: 'loc_123',
      name: 'Main Hall',
      googleReviewUrl: 'https://example.com/review',
      account: {
        id: 'acct_123',
        accountType: 'EVENT',
        settingsJson: {
          branding: {
            logoUrl: 'https://example.com/logo.png',
            primaryColor: '#111111',
            primaryButtonColor: '#222222',
          },
          consent: {
            title: 'Share feedback',
            subtitle: 'Tell us what you thought',
            items: ['Answer a few questions'],
            buttonText: 'Start',
            bulletStyle: 'STAR',
          },
        },
      },
    },
    ...overrides,
  }
}

describe('GET /api/kiosk/event-details', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.eventStructureItem.findFirst.mockResolvedValue(null)
  })

  it('preserves eventId lookup behavior', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent())

    const { GET } = await import('@/app/api/kiosk/event-details/route')

    const response = await GET({
      url: 'http://localhost/api/kiosk/event-details?eventId=evt_123',
    } as never)

    expect(response.status).toBe(200)
    expect(prismaMock.event.findUnique).toHaveBeenCalledWith({
      where: { id: 'evt_123' },
      select: expect.any(Object),
    })
    expect(prismaMock.publicSurveyLink.findUnique).not.toHaveBeenCalled()

    const json = await response.json()
    expect(json.event).toMatchObject({
      id: 'evt_123',
      responseMode: 'VOICE_ONLY',
      accountType: 'EVENT',
      location: {
        id: 'loc_123',
        googleReviewUrl: 'https://example.com/review',
      },
      branding: {
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#111111',
        primaryButtonColor: '#222222',
      },
      consent: { bulletStyle: 'STAR' },
    })
    expect(json.event.surveyId).toBeUndefined()
  })

  it('returns the legacy checkmark style when an event has no saved bullet setting', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({
      location: {
        ...makeEvent().location,
        account: {
          ...makeEvent().location.account,
          settingsJson: { consent: { items: ['One item'] } },
        },
      },
    }))

    const { GET } = await import('@/app/api/kiosk/event-details/route')
    const response = await GET({ url: 'http://localhost/api/kiosk/event-details?eventId=evt_123' } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ event: { consent: { bulletStyle: 'CHECKMARK' } } })
  })

  it('resolves active public survey tokens to survey event details', async () => {
    prismaMock.publicSurveyLink.findUnique.mockResolvedValue({
      id: 'link_123',
      isActive: true,
      expiresAt: null,
      surveyTargetId: 'target_link',
      surveyTarget: {
        id: 'target_link',
        eventId: 'evt_123',
        isActive: true,
        category: 'SPEAKER',
        speakerId: 'speaker_jane',
        speaker: { id: 'speaker_jane', name: 'Jane Smith' },
      },
      survey: {
        id: 'survey_123',
        eventId: 'evt_123',
        surveyTargetId: 'target_legacy',
        responseMode: 'TEXT_ONLY',
        presentationMode: 'SCREEN',
        status: 'ACTIVE',
        surveyTarget: {
          id: 'target_legacy',
          eventId: 'evt_123',
          isActive: true,
          category: 'SPEAKER',
          speakerId: 'speaker_jane',
          speaker: { id: 'speaker_jane', name: 'Jane Smith' },
        },
        event: makeEvent({ responseMode: 'VOICE_ONLY' }),
      },
    })

    const { GET } = await import('@/app/api/kiosk/event-details/route')

    const response = await GET({
      url: 'http://localhost/api/kiosk/event-details?token=public-token',
    } as never)

    expect(response.status).toBe(200)
    expect(prismaMock.publicSurveyLink.findUnique).toHaveBeenCalledWith({
      where: { token: 'public-token' },
      include: expect.any(Object),
    })
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled()

    const json = await response.json()
    expect(json.event).toMatchObject({
      id: 'evt_123',
      responseMode: 'TEXT_ONLY',
      presentationMode: 'SCREEN',
      surveyId: 'survey_123',
      surveyTargetId: 'target_link',
      publicSurveyLinkId: 'link_123',
      speakerContext: { speaker: { id: 'speaker_jane', name: 'Jane Smith' } },
    })
  })

  it('returns the Events survey voice-and-text mode for a token launch', async () => {
    prismaMock.publicSurveyLink.findUnique.mockResolvedValue({
      id: 'link_123',
      isActive: true,
      expiresAt: null,
      survey: {
        id: 'survey_123',
        eventId: 'evt_123',
        surveyTargetId: 'target_123',
        responseMode: 'VOICE_AND_TEXT',
        status: 'ACTIVE',
        surveyTarget: { id: 'target_123', eventId: 'evt_123', isActive: true },
        event: makeEvent(),
      },
    })

    const { GET } = await import('@/app/api/kiosk/event-details/route')
    const response = await GET({ url: 'http://localhost/api/kiosk/event-details?token=public-token' } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      event: { responseMode: 'VOICE_AND_TEXT', surveyId: 'survey_123' },
    })
  })

  it('returns a Simple Event voice-first organizer-set survey without attendee-choice settings', async () => {
    prismaMock.publicSurveyLink.findUnique.mockResolvedValue({
      id: 'link_simple',
      isActive: true,
      expiresAt: null,
      survey: {
        id: 'survey_simple',
        eventId: 'evt_123',
        surveyTargetId: 'target_event',
        responseMode: 'VOICE_ONLY',
        presentationMode: 'READ_ALOUD',
        status: 'ACTIVE',
        surveyTarget: { id: 'target_event', eventId: 'evt_123', isActive: true },
        event: makeEvent(),
      },
    })

    const { GET } = await import('@/app/api/kiosk/event-details/route')
    const response = await GET({ url: 'http://localhost/api/kiosk/event-details?token=public-token' } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      event: {
        responseMode: 'VOICE_ONLY',
        presentationMode: 'READ_ALOUD',
        surveyId: 'survey_simple',
      },
    })
  })

  it('isolates each survey intro and effective Event Area or Session context under the same event', async () => {
    prismaMock.eventStructureItem.findFirst.mockResolvedValue({
      id: 'session_keynote',
      name: 'Opening Keynote',
      speakerAssignments: [{ speakerId: 'speaker_jordan', speaker: { name: 'Jordan Lee', isArchived: false } }],
    })
    prismaMock.publicSurveyLink.findUnique
      .mockResolvedValueOnce({
        id: 'link_area', isActive: true, expiresAt: null,
        surveyTarget: {
          id: 'target_area', eventId: 'evt_123', name: 'Expo Hall', isActive: true, category: 'LOCATION',
          eventStructureItemId: 'area_expo', speakerId: null, speaker: null,
          eventStructureItem: { name: 'Expo Hall', kind: 'AREA', startsAt: null, endsAt: null, timezone: 'America/New_York' },
        },
        survey: {
          id: 'survey_area', eventId: 'evt_123', surveyTargetId: 'target_area', responseMode: 'TEXT_ONLY', status: 'ACTIVE',
          description: 'Tell us how the expo floor worked for you.',
          surveyTarget: null,
          event: makeEvent(),
        },
      })
      .mockResolvedValueOnce({
        id: 'link_session', isActive: true, expiresAt: null,
        surveyTarget: {
          id: 'target_session', eventId: 'evt_123', name: 'Opening Keynote', isActive: true, category: 'SESSION',
          eventStructureItemId: 'session_keynote', speakerId: null, speaker: null,
          eventStructureItem: { name: 'Opening Keynote', kind: 'SESSION', startsAt: null, endsAt: null, timezone: 'America/New_York' },
        },
        survey: {
          id: 'survey_session', eventId: 'evt_123', surveyTargetId: 'target_session', responseMode: 'VOICE_ONLY', status: 'ACTIVE',
          description: null,
          surveyTarget: null,
          event: makeEvent(),
        },
      })

    const { GET } = await import('@/app/api/kiosk/event-details/route')
    const areaResponse = await GET({ url: 'http://localhost/api/kiosk/event-details?token=area-token' } as never)
    const sessionResponse = await GET({ url: 'http://localhost/api/kiosk/event-details?token=session-token' } as never)

    await expect(areaResponse.json()).resolves.toMatchObject({ event: {
      surveyId: 'survey_area',
      surveyIntro: 'Tell us how the expo floor worked for you.',
      targetContext: { category: 'LOCATION', name: 'Expo Hall', kind: 'AREA' },
    } })
    await expect(sessionResponse.json()).resolves.toMatchObject({ event: {
      surveyId: 'survey_session',
      surveyIntro: null,
      targetContext: { category: 'SESSION', name: 'Opening Keynote', kind: 'SESSION' },
      sessionContext: {
        session: { id: 'session_keynote', name: 'Opening Keynote' },
        speakers: [{ id: 'speaker_jordan', name: 'Jordan Lee' }],
      },
    } })
  })

  it('requires exactly one launch identifier', async () => {
    const { GET } = await import('@/app/api/kiosk/event-details/route')

    const missing = await GET({
      url: 'http://localhost/api/kiosk/event-details',
    } as never)
    expect(missing.status).toBe(400)

    const both = await GET({
      url: 'http://localhost/api/kiosk/event-details?eventId=evt_123&token=public-token',
    } as never)
    expect(both.status).toBe(400)

    expect(prismaMock.event.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.publicSurveyLink.findUnique).not.toHaveBeenCalled()
  })

  it('rejects inactive or expired public survey tokens cleanly', async () => {
    prismaMock.publicSurveyLink.findUnique.mockResolvedValueOnce({
      id: 'link_inactive',
      isActive: false,
      expiresAt: null,
      survey: {
        id: 'survey_123',
        eventId: 'evt_123',
        surveyTargetId: 'target_123',
        responseMode: 'VOICE_ONLY',
        status: 'ACTIVE',
        surveyTarget: {
          id: 'target_123',
          eventId: 'evt_123',
          isActive: true,
        },
        event: makeEvent(),
      },
    })

    const { GET } = await import('@/app/api/kiosk/event-details/route')

    const inactive = await GET({
      url: 'http://localhost/api/kiosk/event-details?token=inactive-token',
    } as never)
    expect(inactive.status).toBe(400)
    await expect(inactive.json()).resolves.toMatchObject({
      error: 'Public survey link is inactive',
    })

    prismaMock.publicSurveyLink.findUnique.mockResolvedValueOnce({
      id: 'link_expired',
      isActive: true,
      expiresAt: new Date(Date.now() - 1000),
      survey: {
        id: 'survey_123',
        eventId: 'evt_123',
        surveyTargetId: 'target_123',
        responseMode: 'VOICE_ONLY',
        status: 'ACTIVE',
        surveyTarget: {
          id: 'target_123',
          eventId: 'evt_123',
          isActive: true,
        },
        event: makeEvent(),
      },
    })

    const expired = await GET({
      url: 'http://localhost/api/kiosk/event-details?token=expired-token',
    } as never)
    expect(expired.status).toBe(400)
    await expect(expired.json()).resolves.toMatchObject({
      error: 'Public survey link has expired',
    })
  })

  it('rejects token details for non-launchable event or survey context', async () => {
    prismaMock.publicSurveyLink.findUnique.mockResolvedValueOnce({
      id: 'link_draft_event',
      isActive: true,
      expiresAt: null,
      survey: {
        id: 'survey_123',
        eventId: 'evt_123',
        surveyTargetId: 'target_123',
        responseMode: 'VOICE_ONLY',
        status: 'ACTIVE',
        surveyTarget: {
          id: 'target_123',
          eventId: 'evt_123',
          isActive: true,
        },
        event: makeEvent({ status: 'DRAFT' }),
      },
    })

    const { GET } = await import('@/app/api/kiosk/event-details/route')

    const draftEvent = await GET({
      url: 'http://localhost/api/kiosk/event-details?token=draft-event-token',
    } as never)
    expect(draftEvent.status).toBe(400)
    await expect(draftEvent.json()).resolves.toMatchObject({
      error: 'Event is not launchable',
    })

    prismaMock.publicSurveyLink.findUnique.mockResolvedValueOnce({
      id: 'link_draft_survey',
      isActive: true,
      expiresAt: null,
      survey: {
        id: 'survey_123',
        eventId: 'evt_123',
        surveyTargetId: 'target_123',
        responseMode: 'VOICE_ONLY',
        status: 'DRAFT',
        surveyTarget: {
          id: 'target_123',
          eventId: 'evt_123',
          isActive: true,
        },
        event: makeEvent(),
      },
    })

    const draftSurvey = await GET({
      url: 'http://localhost/api/kiosk/event-details?token=draft-survey-token',
    } as never)
    expect(draftSurvey.status).toBe(400)
    await expect(draftSurvey.json()).resolves.toMatchObject({
      error: 'Survey is not launchable',
    })
  })
})
