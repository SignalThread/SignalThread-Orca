import { describe, expect, it, vi } from 'vitest'
import { createKioskLaunchResponse } from './event'

function makeDb(overrides: {
  publicLink?: any
  response?: any
  questions?: any[]
} = {}) {
  return {
    publicSurveyLink: {
      findUnique: vi.fn().mockResolvedValue(overrides.publicLink ?? null),
    },
    response: {
      create: vi.fn().mockResolvedValue(
        overrides.response ?? {
          id: 'resp_123',
          eventId: 'evt_123',
          surveyId: 'survey_123',
          surveyTargetId: 'target_123',
          publicSurveyLinkId: 'link_123',
          anonymousId: 'anon_123',
        },
      ),
    },
    question: {
      findMany: vi.fn().mockResolvedValue(overrides.questions ?? []),
    },
    questionAudioAsset: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    eventStructureItem: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  }
}

const activePublicLink = {
  id: 'link_123',
  token: 'public-token',
  surveyTargetId: 'target_123',
  isActive: true,
  expiresAt: null,
  surveyTarget: {
    id: 'target_123',
    eventId: 'evt_123',
    isActive: true,
    eventStructureItem: null,
  },
  survey: {
    id: 'survey_123',
    eventId: 'evt_123',
    surveyTargetId: 'target_123',
    responseMode: 'VOICE_ONLY',
    collectionPhase: 'DURING',
    status: 'ACTIVE',
    availabilityMode: 'OPEN_IMMEDIATELY',
    availabilityTimezone: null,
    availabilityOpensAt: null,
    availabilityClosesAt: null,
    availabilityOpenAnchor: null,
    availabilityCloseAnchor: null,
    availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null,
    availabilityOverride: null,
    _count: { questions: 1 },
    ttsProvider: 'google',
    ttsVoice: 'en-GB-Studio-C',
    ttsLocale: 'en-GB',
    surveyTarget: {
      id: 'target_123',
      eventId: 'evt_123',
      isActive: true,
      eventStructureItem: null,
    },
    event: {
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
        timezone: 'America/New_York',
        googleReviewUrl: null,
        account: {
          id: 'acct_123',
          accountType: 'EVENTS',
          settingsJson: null,
        },
      },
    },
  },
}

describe('createKioskLaunchResponse token mode', () => {
  it('snapshots Survey.collectionPhase on each new response without rewriting historical responses', async () => {
    const preDb = makeDb({
      publicLink: {
        ...activePublicLink,
        survey: { ...activePublicLink.survey, collectionPhase: 'PRE' },
      },
    })
    await createKioskLaunchResponse({ token: 'pre-link' }, preDb as never)
    const historicalResponseData = preDb.response.create.mock.calls[0][0].data

    const postDb = makeDb({
      publicLink: {
        ...activePublicLink,
        survey: { ...activePublicLink.survey, collectionPhase: 'POST' },
      },
    })
    await createKioskLaunchResponse({ token: 'same-survey-after-phase-change' }, postDb as never)

    expect(historicalResponseData.collectionPhase).toBe('PRE')
    expect(postDb.response.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ collectionPhase: 'POST' }),
    }))
    expect(historicalResponseData.collectionPhase).toBe('PRE')
  })

  it('rejects a new Event response when its survey is still legacy-unclassified', async () => {
    const db = makeDb({
      publicLink: {
        ...activePublicLink,
        survey: { ...activePublicLink.survey, collectionPhase: null },
      },
    })

    await expect(createKioskLaunchResponse({ token: 'legacy-unclassified' }, db as never))
      .rejects.toThrow('Event survey must have a collection phase before collecting responses')
    expect(db.response.create).not.toHaveBeenCalled()
  })

  it.each(['VOICE_ONLY', 'TEXT_ONLY'] as const)(
    'keeps Events attendee-choice surveys switchable per question when the launch selected %s',
    async (selectedResponseMode) => {
      const db = makeDb({
        publicLink: {
          ...activePublicLink,
          survey: { ...activePublicLink.survey, responseMode: 'VOICE_AND_TEXT' },
        },
        questions: [{
          id: 'question_choice',
          key: 'choice-q1',
          label: 'Tell us about your experience.',
          ttsText: null,
          order: 0,
          required: true,
          type: 'VOICE',
        }],
      })

      const result = await createKioskLaunchResponse(
        { token: 'public-token', selectedResponseMode },
        db as never,
      )

      expect(db.response.create).toHaveBeenCalledWith({
        data: {
          eventId: 'evt_123',
          surveyId: 'survey_123',
          surveyTargetId: 'target_123',
          publicSurveyLinkId: 'link_123',
          speakerAssignmentId: undefined,
          collectionPhase: 'DURING',
          responseMode: 'VOICE_AND_TEXT',
          status: 'IN_PROGRESS',
        },
      })
      expect(result.response.responseMode).toBe('VOICE_AND_TEXT')
      expect(result.event.responseMode).toBe('VOICE_AND_TEXT')
      expect(result).toMatchObject({
        mode: 'token',
        survey: { id: 'survey_123', surveyTargetId: 'target_123' },
        target: { id: 'target_123' },
        publicLink: { id: 'link_123' },
        questions: [{ id: 'question_choice', key: 'choice-q1' }],
      })
    },
  )

  it('creates a response with survey, target, and public link context', async () => {
    const db = makeDb({
      publicLink: activePublicLink,
      questions: [
        {
          id: 'question_1',
          key: 'survey-q1',
          label: 'What did you think?',
          ttsText: null,
          order: 7,
          required: true,
        },
      ],
    })

    const result = await createKioskLaunchResponse({ token: 'public-token' }, db as never)

    expect(db.publicSurveyLink.findUnique).toHaveBeenCalledWith({
      where: { token: 'public-token' },
      include: {
        speakerAssignment: {
          select: { id: true, eventId: true, speakerId: true, sessionId: true },
        },
        surveyTarget: {
          include: {
            speaker: { select: { id: true, name: true } },
            eventStructureItem: {
              select: {
                name: true,
                kind: true,
                startsAt: true,
                endsAt: true,
                timezone: true,
              },
            },
          },
        },
        survey: {
          include: {
            surveyTarget: {
              include: {
                speaker: { select: { id: true, name: true } },
                eventStructureItem: {
                  select: {
                    name: true,
                    kind: true,
                    startsAt: true,
                    endsAt: true,
                    timezone: true,
                  },
                },
              },
            },
            _count: {
              select: {
                questions: true,
              },
            },
            questions: {
              orderBy: { order: 'asc' },
              select: { id: true, responseTarget: true },
            },
            event: {
              select: {
                id: true,
                name: true,
                eventType: true,
                status: true,
                isActive: true,
                responseMode: true,
                ttsProvider: true,
                ttsVoice: true,
                ttsLocale: true,
                location: {
                  select: {
                    id: true,
                    name: true,
                    timezone: true,
                    googleReviewUrl: true,
                    account: {
                      select: {
                        id: true,
                        accountType: true,
                        settingsJson: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    expect(db.response.create).toHaveBeenCalledWith({
      data: {
        eventId: 'evt_123',
        surveyId: 'survey_123',
        surveyTargetId: 'target_123',
        publicSurveyLinkId: 'link_123',
        speakerAssignmentId: undefined,
        collectionPhase: 'DURING',
        responseMode: 'VOICE_ONLY',
        status: 'IN_PROGRESS',
      },
    })
    expect(db.question.findMany).toHaveBeenCalledWith({
      where: { surveyId: 'survey_123' },
      select: {
        id: true,
        key: true,
        label: true,
        ttsText: true,
        order: true,
        required: true,
        type: true,
        responseTarget: true,
        configurationJson: true,
      },
      orderBy: { order: 'asc' },
    })
    expect(result).toMatchObject({
      mode: 'token',
      event: { id: 'evt_123', responseMode: 'VOICE_ONLY' },
      survey: { id: 'survey_123', surveyTargetId: 'target_123', responseMode: 'VOICE_ONLY' },
      target: { id: 'target_123' },
      publicLink: { id: 'link_123' },
    })
    expect(result.questions).toEqual([
      {
        id: 'question_1',
        key: 'survey-q1',
        label: 'What did you think?',
        ttsText: null,
        order: 7,
        required: true,
        audioUrl: null,
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
        fallbackReason: 'question-audio-generation-failed',
        type: 'VOICE',
        responseTarget: 'GENERAL',
        configurationJson: null,
      },
    ])
  })

  it('creates responses against the public-link deployment target when a survey is reused', async () => {
    const db = makeDb({
      publicLink: {
        ...activePublicLink,
        surveyTargetId: 'target_session_2',
        surveyTarget: {
          id: 'target_session_2',
          eventId: 'evt_123',
          isActive: true,
          eventStructureItem: null,
        },
      },
    })

    const result = await createKioskLaunchResponse({ token: 'public-token' }, db as never)

    expect(db.response.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      surveyId: 'survey_123',
      surveyTargetId: 'target_session_2',
      publicSurveyLinkId: 'link_123',
    }) })
    expect(result).toMatchObject({
      target: { id: 'target_session_2' },
      survey: { surveyTargetId: 'target_session_2' },
    })
  })

  it('omits speaker-feedback questions from a speakerless session launch without changing the response target', async () => {
    const db = makeDb({
      publicLink: {
        ...activePublicLink,
        surveyTarget: {
          ...activePublicLink.surveyTarget,
          category: 'SESSION',
          eventStructureItemId: 'session_without_speakers',
        },
      },
      questions: [
        { id: 'overall', key: 'overall', label: 'How was the session?', type: 'RATING_1_TO_5', responseTarget: 'GENERAL', order: 0, required: true },
        { id: 'speaker', key: 'speaker', label: 'How was the speaker?', type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS', order: 1, required: true },
      ],
    })
    db.eventStructureItem.findFirst.mockResolvedValue({
      id: 'session_without_speakers', name: 'Panel: Future of Events', speakerAssignments: [],
    })

    const result = await createKioskLaunchResponse({ token: 'public-token' }, db as never)

    expect(result.questions.map((question) => question.id)).toEqual(['overall'])
    expect(result.sessionContext).toMatchObject({ session: { name: 'Panel: Future of Events' }, speakers: [] })
    expect(db.response.create).toHaveBeenCalledWith({ data: expect.objectContaining({ surveyTargetId: 'target_123' }) })
  })

  it('uses the current session roster on every launch, so speaker feedback returns when speakers are added', async () => {
    const db = makeDb({
      publicLink: {
        ...activePublicLink,
        surveyTarget: {
          ...activePublicLink.surveyTarget,
          category: 'SESSION',
          eventStructureItemId: 'session_live_roster',
        },
      },
      questions: [{ id: 'speaker', key: 'speaker', label: 'How was the speaker?', type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS', order: 0, required: true }],
    })
    db.eventStructureItem.findFirst
      .mockResolvedValueOnce({ id: 'session_live_roster', name: 'Panel: Future of Events', speakerAssignments: [] })
      .mockResolvedValueOnce({ id: 'session_live_roster', name: 'Panel: Future of Events', speakerAssignments: [{ speakerId: 'speaker_1', speaker: { name: 'Avery Lee', isArchived: false } }] })

    const withoutSpeakers = await createKioskLaunchResponse({ token: 'public-token' }, db as never)
    const withSpeakers = await createKioskLaunchResponse({ token: 'public-token' }, db as never)

    expect(withoutSpeakers.questions).toEqual([])
    expect(withSpeakers.questions.map((question) => question.id)).toEqual(['speaker'])
    expect(withSpeakers.sessionContext?.speakers).toEqual([{ id: 'speaker_1', name: 'Avery Lee' }])
  })

  it('isolates session and speaker context by public link target', async () => {
    const launchFor = async (suffix: 'a' | 'b', speakerName: string) => {
      const db = makeDb({
        publicLink: {
          ...activePublicLink,
          id: `link_${suffix}`,
          surveyTargetId: `target_${suffix}`,
          surveyTarget: {
            ...activePublicLink.surveyTarget,
            id: `target_${suffix}`,
            category: 'SESSION',
            eventStructureItemId: `session_${suffix}`,
          },
          survey: {
            ...activePublicLink.survey,
            questions: [{ id: 'speaker_question', responseTarget: 'SPEAKERS' }],
          },
        },
        questions: [{ id: 'speaker_question', key: 'speaker', label: 'How was the speaker?', type: 'SPEAKER_FEEDBACK', responseTarget: 'SPEAKERS', order: 0, required: true }],
      })
      db.eventStructureItem.findFirst.mockResolvedValue({
        id: `session_${suffix}`,
        name: `Session ${suffix.toUpperCase()}`,
        speakerAssignments: [{ speakerId: `speaker_${suffix}`, speaker: { name: speakerName, isArchived: false } }],
      })
      return createKioskLaunchResponse({ token: `token-${suffix}` }, db as never)
    }

    const launchA = await launchFor('a', 'Ada Speaker')
    const launchB = await launchFor('b', 'Bea Speaker')

    expect(launchA).toMatchObject({
      target: { id: 'target_a' },
      publicLink: { id: 'link_a' },
      sessionContext: { session: { id: 'session_a', name: 'Session A' }, speakers: [{ id: 'speaker_a', name: 'Ada Speaker' }] },
    })
    expect(launchB).toMatchObject({
      target: { id: 'target_b' },
      publicLink: { id: 'link_b' },
      sessionContext: { session: { id: 'session_b', name: 'Session B' }, speakers: [{ id: 'speaker_b', name: 'Bea Speaker' }] },
    })
    expect(launchA.sessionContext?.speakers).not.toContainEqual(expect.objectContaining({ name: 'Bea Speaker' }))
  })

  it('preserves speaker and session launch context for a direct speaker survey', async () => {
    const speakerLaunch = {
      ...activePublicLink,
      speakerAssignmentId: 'assignment_ada',
      speakerAssignment: { id: 'assignment_ada', eventId: 'evt_123', speakerId: 'speaker_ada', sessionId: 'session_keynote' },
      surveyTarget: { ...activePublicLink.surveyTarget, category: 'SPEAKER', speakerId: 'speaker_ada', speaker: { id: 'speaker_ada', name: 'Ada Lovelace' } },
      survey: {
        ...activePublicLink.survey,
        surveyTarget: { ...activePublicLink.survey.surveyTarget, category: 'SPEAKER', speakerId: 'speaker_ada', speaker: { id: 'speaker_ada', name: 'Ada Lovelace' } },
      },
    }
    const db = makeDb({ publicLink: speakerLaunch })

    const result = await createKioskLaunchResponse({ token: 'speaker-token' }, db as never)

    expect(db.response.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      surveyTargetId: 'target_123',
      speakerAssignmentId: 'assignment_ada',
    }) })
    expect(result.speakerContext).toEqual({ speaker: { id: 'speaker_ada', name: 'Ada Lovelace' } })
  })

  it('resolves different token survey voices under the same event', async () => {
    const surveyA = {
      ...activePublicLink,
      id: 'link_a',
      survey: {
        ...activePublicLink.survey,
        id: 'survey_a',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
      },
    }
    const surveyB = {
      ...activePublicLink,
      id: 'link_b',
      survey: {
        ...activePublicLink.survey,
        id: 'survey_b',
        ttsVoice: 'en-AU-Neural2-A',
        ttsLocale: 'en-AU',
      },
    }

    const resultA = await createKioskLaunchResponse(
      { token: 'token-a' },
      makeDb({
        publicLink: surveyA,
        questions: [{ id: 'question_a', key: 'survey-a-q1', label: 'Question A?', ttsText: null, order: 0, required: true }],
      }) as never,
    )
    const resultB = await createKioskLaunchResponse(
      { token: 'token-b' },
      makeDb({
        publicLink: surveyB,
        questions: [{ id: 'question_b', key: 'survey-b-q1', label: 'Question B?', ttsText: null, order: 0, required: true }],
      }) as never,
    )

    expect(resultA.questions[0]).toMatchObject({
      key: 'survey-a-q1',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
    })
    expect(resultB.questions[0]).toMatchObject({
      key: 'survey-b-q1',
      ttsVoice: 'en-AU-Neural2-A',
      ttsLocale: 'en-AU',
    })
  })

  it('falls back from missing Survey voice to Event voice, then app defaults', async () => {
    const eventFallback = await createKioskLaunchResponse(
      { token: 'event-fallback-token' },
      makeDb({
        publicLink: {
          ...activePublicLink,
          survey: {
            ...activePublicLink.survey,
            ttsProvider: null,
            ttsVoice: null,
            ttsLocale: null,
            event: {
              ...activePublicLink.survey.event,
              ttsVoice: 'en-AU-Neural2-A',
              ttsLocale: 'en-AU',
            },
          },
        },
        questions: [{ id: 'question_event_fallback', key: 'fallback-q1', label: 'Fallback?', ttsText: null, order: 0, required: true }],
      }) as never,
    )
    expect(eventFallback.questions[0]).toMatchObject({
      ttsVoice: 'en-AU-Neural2-A',
      ttsLocale: 'en-AU',
    })

    const appFallback = await createKioskLaunchResponse(
      { token: 'app-fallback-token' },
      makeDb({
        publicLink: {
          ...activePublicLink,
          survey: {
            ...activePublicLink.survey,
            ttsProvider: null,
            ttsVoice: null,
            ttsLocale: null,
            event: {
              ...activePublicLink.survey.event,
              ttsProvider: null,
              ttsVoice: null,
              ttsLocale: null,
            },
          },
        },
        questions: [{ id: 'question_app_fallback', key: 'app-fallback-q1', label: 'Fallback?', ttsText: null, order: 0, required: true }],
      }) as never,
    )
    expect(appFallback.questions[0]).toMatchObject({
      ttsProvider: 'google',
      ttsVoice: process.env.TTS_DEFAULT_VOICE || 'en-US-Neural2-F',
      ttsLocale: process.env.TTS_DEFAULT_LOCALE || 'en-US',
    })
  })

  it('rejects missing, inactive, and expired public survey links', async () => {
    await expect(
      createKioskLaunchResponse({ token: 'missing-token' }, makeDb() as never),
    ).rejects.toThrow('Public survey link not found')

    await expect(
      createKioskLaunchResponse(
        { token: 'inactive-token' },
        makeDb({ publicLink: { ...activePublicLink, isActive: false } }) as never,
      ),
    ).rejects.toThrow('Public survey link is inactive')

    await expect(
      createKioskLaunchResponse(
        { token: 'expired-token' },
        makeDb({ publicLink: { ...activePublicLink, expiresAt: new Date(Date.now() - 1000) } }) as never,
      ),
    ).rejects.toThrow('Public survey link has expired')
  })

  it('does not use parent Event status as a survey response-window gate', async () => {
    const pastEventDb = makeDb({
      publicLink: {
        ...activePublicLink,
        survey: {
          ...activePublicLink.survey,
          event: {
            ...activePublicLink.survey.event,
            status: 'COMPLETED',
            startDate: new Date('2026-08-01T13:00:00.000Z'),
            endDate: new Date('2026-08-02T13:00:00.000Z'),
          },
        },
      },
    })

    await expect(createKioskLaunchResponse({ token: 'past-event-always-open' }, pastEventDb as never))
      .resolves.toMatchObject({ mode: 'token', response: { eventId: 'evt_123' } })
    expect(pastEventDb.response.create).toHaveBeenCalledTimes(1)
    expect(pastEventDb.publicSurveyLink.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { token: 'past-event-always-open' } }))
  })

  it('rejects token launches for inactive event, survey, or target context', async () => {
    await expect(
      createKioskLaunchResponse(
        { token: 'draft-event-token' },
        makeDb({
          publicLink: {
            ...activePublicLink,
            survey: {
              ...activePublicLink.survey,
              event: {
                ...activePublicLink.survey.event,
                status: 'DRAFT',
              },
            },
          },
        }) as never,
      ),
    ).rejects.toThrow('Event is not launchable')

    await expect(
      createKioskLaunchResponse(
        { token: 'inactive-event-token' },
        makeDb({
          publicLink: {
            ...activePublicLink,
            survey: {
              ...activePublicLink.survey,
              event: {
                ...activePublicLink.survey.event,
                isActive: false,
              },
            },
          },
        }) as never,
      ),
    ).rejects.toThrow('Event is not launchable')

    await expect(
      createKioskLaunchResponse(
        { token: 'draft-survey-token' },
        makeDb({
          publicLink: {
            ...activePublicLink,
            survey: {
              ...activePublicLink.survey,
              status: 'DRAFT',
            },
          },
        }) as never,
      ),
    ).rejects.toThrow('Survey is not launchable')

    await expect(
      createKioskLaunchResponse(
        { token: 'inactive-target-token' },
        makeDb({
          publicLink: {
            ...activePublicLink,
            surveyTarget: {
              ...activePublicLink.surveyTarget,
              isActive: false,
            },
          },
        }) as never,
      ),
    ).rejects.toThrow('Survey target is inactive')

    await expect(
      createKioskLaunchResponse(
        { token: 'mismatched-target-token' },
        makeDb({
          publicLink: {
            ...activePublicLink,
            surveyTarget: {
              ...activePublicLink.surveyTarget,
              eventId: 'other_event',
            },
          },
        }) as never,
      ),
    ).rejects.toThrow('Survey target does not belong to the survey event')
  })

  it('enforces future, closed, and relative Event availability before creating a response', async () => {
    const futureDb = makeDb({
      publicLink: {
        ...activePublicLink,
        surveyTarget: {
          ...activePublicLink.surveyTarget,
          eventStructureItem: {
            startsAt: new Date(Date.now() - 60 * 60_000),
            endsAt: new Date(Date.now() + 30 * 60_000),
            timezone: 'UTC',
          },
        },
        survey: {
          ...activePublicLink.survey,
          availabilityMode: 'CUSTOM_WINDOW',
          availabilityTimezone: 'UTC',
          availabilityOpensAt: new Date(Date.now() + 60_000),
          availabilityClosesAt: new Date(Date.now() + 120_000),
        },
      },
    })
    await expect(createKioskLaunchResponse({ token: 'future' }, futureDb as never))
      .rejects.toThrow('Survey is not launchable yet')
    expect(futureDb.response.create).not.toHaveBeenCalled()

    const closedDb = makeDb({
      publicLink: {
        ...activePublicLink,
        survey: {
          ...activePublicLink.survey,
          availabilityMode: 'CUSTOM_WINDOW',
          availabilityTimezone: 'UTC',
          availabilityOpensAt: new Date(Date.now() - 120_000),
          availabilityClosesAt: new Date(Date.now() - 60_000),
        },
      },
    })
    await expect(createKioskLaunchResponse({ token: 'closed' }, closedDb as never))
      .rejects.toThrow('Survey is not launchable because it is closed')
    expect(closedDb.response.create).not.toHaveBeenCalled()

    const relativeDb = makeDb({
      publicLink: {
        ...activePublicLink,
        surveyTarget: {
          ...activePublicLink.surveyTarget,
          eventStructureItem: {
            startsAt: new Date(Date.now() - 60 * 60_000),
            endsAt: new Date(Date.now() + 30 * 60_000),
            timezone: 'UTC',
          },
        },
        survey: {
          ...activePublicLink.survey,
          availabilityMode: 'RELATIVE_TO_EVENT_AREA',
          availabilityTimezone: 'UTC',
          availabilityOpenAnchor: 'END',
          availabilityCloseAnchor: 'END',
          availabilityOpenOffsetMinutes: -10,
          availabilityCloseOffsetMinutes: 120,
        },
      },
    })
    await expect(createKioskLaunchResponse({ token: 'relative' }, relativeDb as never))
      .rejects.toThrow('Survey is not launchable yet')
    expect(relativeDb.response.create).not.toHaveBeenCalled()
  })

  it('preserves non-Events token behavior and legacy eventId compatibility', async () => {
    const retailDb = makeDb({
      publicLink: {
        ...activePublicLink,
        survey: {
          ...activePublicLink.survey,
          availabilityMode: 'CUSTOM_WINDOW',
          availabilityTimezone: 'UTC',
          availabilityOpensAt: new Date(Date.now() + 60_000),
          availabilityClosesAt: new Date(Date.now() + 120_000),
          event: {
            ...activePublicLink.survey.event,
            location: {
              ...activePublicLink.survey.event.location,
              account: { ...activePublicLink.survey.event.location.account, accountType: 'RETAIL' },
            },
          },
        },
      },
      questions: [{ id: 'q-retail', key: 'q-retail', label: 'How was it?', order: 0, required: true }],
    })
    await expect(createKioskLaunchResponse({ token: 'retail-token' }, retailDb as never)).resolves.toMatchObject({ mode: 'token' })
  })
})
