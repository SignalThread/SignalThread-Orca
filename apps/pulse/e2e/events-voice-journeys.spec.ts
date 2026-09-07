import { expect, test, type Page, type Route } from '@playwright/test'
import { installMockMediaRecorder } from '../tests/playwright/media-recorder'

const accountSlug = 'events-co'
const eventId = 'evt-event-live'
const locationId = 'loc-events-venue'
const publicToken = 'public-event-token'

function postEventClosingBriefPayload() {
  return {
    lifecyclePhase: 'POST_EVENT', generatedAt: '2026-09-19T12:00:00.000Z', event: { id: eventId, name: 'SignalThread Live Experience Summit 2026' },
    versionId: 'post-brief-version-1',
    summary: { verdict: 'The event produced useful evidence, with material follow-through still open.', sentiment: 'Mostly positive', avgSentiment: 0.48, responseCount: 42, answerCount: 58, sentimentPercent: 63, sentimentBreakdown: { favorable: 36, neutral: 12, negative: 10, total: 58 }, listeningPointCount: 4, representedListeningPointCount: 3, representedPercent: 75 },
    editorial: {
      source: 'openai', provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'event-closing-brief-editorial-v14', inputHash: 'a'.repeat(64), generatedAt: '2026-09-19T12:00:00.000Z', cacheHit: true,
      copy: {
        headline: 'Practical content led a positive event outcome with clear follow-through.',
        executiveSummary: 'Attendee feedback highlighted useful content while identifying wayfinding as the clearest issue to resolve.',
        keyTakeaway: 'Protect the practical program and close the remaining wayfinding gap.',
        whatWorkedNarrative: 'Practical content was the clearest event strength.',
        frictionNarrative: 'Wayfinding was the clearest recurring friction.',
        nextEventNarrative: 'Future planning should protect more discussion time.',
        coverageNarrative: 'Coverage was broad, with one listening area still unrepresented.',
        findingNarratives: [{ findingId: 'issue:cluster-wayfinding', narrative: 'Attendees repeatedly described mismatches between physical signs and the app, making navigation harder near the elevators.' }],
      },
    },
    whatWorked: [{ id: 'finding-practical', title: 'Practical content', statement: 'Attendees valued useful examples they could apply.', mentionCount: 8, confidence: 0.9, evidenceTier: 'STRONG', evidenceStrength: 'strong' }],
    friction: [{ id: 'issue:cluster-wayfinding', title: 'Signs did not match the app', statement: 'Attendees described mismatches between physical signs and the app.', kind: 'friction', classification: 'after-event', evidenceTier: 'EMERGING', evidenceStrength: 'directional', confidence: 0.86, mentionCount: 4, evidenceThemeKeys: ['wayfinding'], issueClusterIds: ['cluster-wayfinding'], evidenceId: 'evidence-wayfinding' }],
    keyFindings: [{ id: 'issue:cluster-wayfinding', title: 'Signs did not match the app', statement: 'Attendees described mismatches between physical signs and the app.', kind: 'friction', classification: 'after-event', evidenceTier: 'EMERGING', evidenceStrength: 'directional', confidence: 0.86, mentionCount: 4, responseCount: 4, sentiment: 'NEGATIVE', evidenceThemeKeys: ['wayfinding'], issueClusterIds: ['cluster-wayfinding'], evidenceId: 'evidence-wayfinding' }],
    decisions: {
      unresolvedActions: [{ id: 'action-follow', title: 'Send sponsor follow-up', classification: 'AFTER_EVENT_FOLLOW_UP', status: 'OPEN', priority: 'Soon', owner: 'Avery Stone', ownerUserId: 'user-1', dueAt: '2026-09-22T12:00:00.000Z', evidenceCount: 2, updateCount: 1 }],
      afterEventFollowUp: [{ id: 'action-follow', title: 'Send sponsor follow-up', classification: 'AFTER_EVENT_FOLLOW_UP', status: 'OPEN', priority: 'Soon', owner: 'Avery Stone', ownerUserId: 'user-1', dueAt: '2026-09-22T12:00:00.000Z', evidenceCount: 2, updateCount: 1 }],
      nextEventLearning: { actions: [], sessionLearning: [{ id: 'learning-1', title: 'Leave more discussion time', source: 'Opening keynote', confidence: 0.72, evidenceTier: 'EMERGING', evidenceStrength: 'directional' }], findings: [] },
    },
    sessions: { agendaSessionCount: 2, selectedSessionCount: 2, representedSessionCount: 1, underrepresentedSessionCount: 1, needsReviewSessionCount: 0, selectedCoverageLabel: '', evidenceCoverageLabel: '', highlights: [{ id: 'session-1', title: 'Opening keynote', responseCount: 12, evidenceLabel: 'Strong evidence', finding: 'Useful examples' }] },
    speakers: { speakerCount: 1, speakersWithFeedbackCount: 1, speakerSpecificResponseCount: 9, highlights: [{ id: 'speaker-1', name: 'Jordan Lee', responseCount: 9, evidenceLabel: 'Strong speaker evidence', finding: 'Clear explanations' }] },
    intelligencePacket: {
      overview: 'Practical content led the experience while wayfinding created avoidable friction.',
      attendeeQuestions: [],
      sessionPatterns: [{ title: 'Opening keynote', finding: 'Useful examples', evidenceTier: 'STRONG', responseCount: 12 }],
      speakerPatterns: [{ name: 'Jordan Lee', finding: 'Clear explanations', evidenceTier: 'STRONG', responseCount: 9 }],
      eventAreaPatterns: [{ name: 'Expo hall', kind: 'AREA', answerCount: 14, sentiment: 'MIXED' }],
      changePatterns: [],
    },
    supportingEvidence: [{ id: 'evidence-wayfinding', clusterId: 'cluster-wayfinding', taxonomyKey: 'wayfinding', title: 'Signs did not match the app', quote: 'The signs by the elevators did not match the app.', sentimentScore: -0.65, priority: 'Immediate', confidence: 0.86, evidenceTier: 'ISOLATED', evidenceStrength: 'weak', capturedAt: '2026-09-18T16:00:00.000Z', question: 'What should change?', source: 'Expo hall' }],
    links: {
      actions: `/app/events/${eventId}/dashboard?account=${accountSlug}&tab=actions`, intelligence: `/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence`,
      sessions: `/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=sessions`, speakers: `/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=speakers`,
    },
    shareText: 'SignalThread Live Experience Summit 2026 — closing brief\n\n42 completed responses.',
  }
}

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

async function chooseEventDate(page: Page, label: string, value: string) {
  const target = new Date(`${value}T12:00:00`)
  const today = new Date()
  const monthDelta = (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth()
  await page.getByRole('button', { name: label, exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Choose date' })
  const direction = monthDelta >= 0 ? 'Next month' : 'Previous month'
  for (let index = 0; index < Math.abs(monthDelta); index += 1) {
    await picker.getByRole('button', { name: direction }).click()
  }
  const accessibleDate = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  await picker.getByRole('gridcell', { name: accessibleDate }).click()
}

async function horizontalOverflowDiagnostics(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
          className: typeof element.className === 'string' ? element.className.slice(0, 180) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          display: style.display,
          position: style.position,
        }
      })
      .filter((item) => item.display !== 'none' && item.position !== 'fixed' && (item.left < -1 || item.right > viewportWidth + 1))
      .slice(0, 12)
    return {
      delta: document.documentElement.scrollWidth - window.innerWidth,
      viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      roots: [document.documentElement, document.body, ...Array.from(document.body.children).slice(0, 3)].map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof (element as HTMLElement).className === 'string' ? (element as HTMLElement).className.slice(0, 180) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }
      }),
      offenders,
    }
  })
}

const liveEvent = {
  id: eventId,
  name: 'SignalThread Live Experience Summit 2026',
  status: 'ACTIVE',
  eventType: 'EVENT',
  startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  isActive: true,
  questionsJson: [{ id: 'legacy-event-question', text: 'What needs attention onsite?', order: 0, isRequired: true }],
}

const secondLiveEvent = {
  id: 'evt-event-live-2',
  name: 'SignalThread Partner Roadshow 2026',
  status: 'ACTIVE',
  eventType: 'EVENT',
  startDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  isActive: true,
  questionsJson: [{ id: 'legacy-event-question-2', text: 'What needs attention at the roadshow?', order: 0, isRequired: true }],
}

function eventMetric(overrides: Record<string, unknown> = {}) {
  return {
    responses: 10,
    responsesToday: 4,
    surveyCount: 2,
    liveSurveyCount: 1,
    draftSurveyCount: 1,
    openAttentionCount: 2,
    satisfaction: {
      score: 50,
      confidence: 'medium',
      analyzedAnswers: 16,
      satisfiedAnswers: 8,
    },
    topOpenIssue: {
      id: 'cluster-wayfinding',
      title: 'Expo floor wayfinding is hiding partner destinations',
      summary: 'Room labels do not match the event app.',
      priorityLevel: 'Immediate',
    },
    launch: {
      token: publicToken,
      surveyId: 'survey-event-wide',
      kioskPath: `/kiosk?token=${publicToken}`,
    },
    ...overrides,
  }
}

function eventDetailPayload(event: typeof liveEvent) {
  return {
    success: true,
    event: {
      ...event,
      description: 'Production-safe demo event.',
      location: {
        id: locationId,
        name: 'SignalThread Live Venue',
        slug: 'signalthread-live-venue',
      },
      _count: {
        responses: 10,
        answers: 16,
        surveys: 2,
        surveyTargets: 1,
        questions: event.questionsJson.length,
      },
      questions: event.questionsJson,
    },
  }
}

function eventsAccountPayload(events = [liveEvent]) {
  return {
    success: true,
    account: {
      id: 'acct-events',
      name: 'Events Co',
      accountType: 'EVENTS',
      tier: 'PRO',
      branding: {
        logoUrl: '/brand/logov2.png',
        primaryColor: '#2563eb',
        primaryButtonColor: '#111827',
      },
    },
    locations: [
      {
        id: locationId,
        name: 'SignalThread Live Venue',
        city: 'New York',
        state: 'NY',
        isActive: true,
        events,
      },
    ],
    metrics: {
      totalEvents: events.filter((event) => event.status === 'ACTIVE').length,
      totalResponses: 10,
      avgSentiment: 0.5,
      responsesToday: 4,
      needActionCount: 2,
      liveCount: events.filter((event) => event.status === 'ACTIVE' && event.isActive).length,
    },
    eventMetrics: Object.fromEntries(events.map((event, index) => [
      event.id,
      eventMetric({
        responses: index === 0 ? 10 : 3,
        responsesToday: index === 0 ? 4 : 1,
        surveyCount: index === 0 ? 2 : 1,
        openAttentionCount: index === 0 ? 2 : 0,
        launch: {
          token: index === 0 ? publicToken : 'public-event-token-2',
          surveyId: index === 0 ? 'survey-event-wide' : 'survey-roadshow-wide',
          kioskPath: `/kiosk?token=${index === 0 ? publicToken : 'public-event-token-2'}`,
        },
      }),
    ])),
  }
}

async function mockEventsAppApis(
  page: Page,
  options: {
    deniedAccount?: string
    denySettings?: boolean
    events?: Array<typeof liveEvent>
    voiceSurvey?: Record<string, unknown>
    additionalVoiceSurveys?: Array<Record<string, unknown>>
    analysisOverrides?: Record<string, unknown>
    intelligenceOverrides?: Record<string, unknown>
    advancedSurveyLoadDelayMs?: number
    signageRefreshDelayMs?: number
    agendaLifecyclePhase?: 'PRE_EVENT' | 'IN_EVENT' | 'POST_EVENT'
  } = {},
) {
  const events = options.events ?? [liveEvent]
  let voiceSurveyDeleted = false
  const basePublicLink = {
    id: 'link-event-wide',
    kioskPath: `/kiosk?token=${publicToken}`,
    isActive: true,
  }
  let voiceSurvey: any = {
    id: 'survey-event-wide',
    name: 'Overall Event Pulse',
    status: 'ACTIVE',
    isArchived: false,
    responseMode: 'VOICE_ONLY',
    responseCount: 2,
    availabilityMode: 'OPEN_IMMEDIATELY',
    availabilityTimezone: null,
    availabilityOpensAt: null,
    availabilityClosesAt: null,
    availabilityOpenAnchor: null,
    availabilityCloseAnchor: null,
    availabilityOpenOffsetMinutes: null,
    availabilityCloseOffsetMinutes: null,
    availabilityOverride: null,
    availability: {
      state: 'OPEN',
      message: 'This survey is open.',
      effectiveOpensAt: null,
      effectiveClosesAt: null,
    },
    readiness: { responseEligible: true, issues: [] },
    target: {
      id: 'target-event-wide',
      name: 'Overall Event Experience',
      category: 'EVENT',
      description: null,
      eventStructureItemId: 'area-ai-lounge',
    },
    questions: [
      {
        id: 'question-event-wide',
        label: 'What should the event team improve while the event is still happening?',
        type: 'VOICE',
        order: 0,
        required: true,
      },
    ],
    ...options.voiceSurvey,
    publicLink: {
      ...basePublicLink,
      ...((options.voiceSurvey?.publicLink as Record<string, unknown> | undefined) ?? {}),
    },
  }
  let signageSaved = false
  let alertStatus = 'NEW'
  let alertOwnerUserId: string | null = null
  let alertNotes: Array<Record<string, unknown>> = []
  let agendaSpeakers: any[] = [{
    id: 'speaker-keynote',
    name: 'Jordan Lee',
    title: 'Chief Product Officer',
    organization: 'SignalThread',
    email: 'jordan@example.com',
    phone: null,
    biography: null,
    headshotState: 'NONE',
    sessionCount: 1,
    profileState: 'COMPLETE',
    missingFields: [],
    possibleDuplicate: false,
    feedbackSurveyCount: 0,
    feedbackSurveyIds: [],
    survey: null,
    sessionAssignments: [{
      id: 'assignment-keynote', role: 'SPEAKER', sortOrder: 0,
      session: { id: 'session-keynote', name: 'Opening Keynote', startsAt: '2026-09-17T14:00:00.000Z', isActive: true },
    }],
  }]
  let agendaSessions: any[] = [{
    id: 'session-keynote',
    name: 'Opening Keynote',
    description: 'Welcome and event outlook.',
    startsAt: '2026-09-17T14:00:00.000Z',
    endsAt: '2026-09-17T15:00:00.000Z',
    timezone: 'America/New_York',
    metadata: { schemaVersion: 1, room: 'Main stage', track: 'Leadership', format: 'Keynote', externalId: 'KEY-001', capacity: 800, tags: ['opening'] },
    speakerAssignments: [{
      id: 'assignment-keynote', role: 'SPEAKER', sortOrder: 0,
      speaker: { id: 'speaker-keynote', name: 'Jordan Lee', title: 'Chief Product Officer', organization: 'SignalThread' },
    }],
    reviewState: 'COMPLETE',
    reviewIssues: [],
    _count: { surveyTargets: 0 },
  }]
  let agendaImportJob: any = null
  const agendaListeningBySession = new Map<string, any>()
  const surveyLibrary = () => [voiceSurvey, ...(options.additionalVoiceSurveys ?? [])]
  const actionOwners = [
    { id: 'user-operator', email: 'operator@events.co', firstName: 'Event', lastName: 'Operator' },
    { id: 'user-owner', email: 'owner@events.co', firstName: 'Alex', lastName: 'Rivera' },
  ]
  let canonicalActions: any[] = [{
    id: 'cluster-wayfinding', eventId, title: 'Move AI Lounge signage into view',
    summary: 'Use the evidence-backed wayfinding finding as the source of this operational action.',
    taxonomyKey: 'wayfinding', priorityLevel: 'Immediate', ownerUserId: 'user-operator', owner: actionOwners[0],
    actionClassification: 'DURING_EVENT', actionStatus: 'OPEN', actionDueAt: '2026-07-01T16:00:00.000Z',
    actionBlockedReason: null, actionResolution: null,
    lastSeenAt: '2026-09-17T14:00:00.000Z', updatedAt: '2026-09-17T14:05:00.000Z',
    _count: { evidence: 2, actionUpdates: 0 },
  }]
  let availableActionFindings: any[] = [{
    id: 'cluster-checkin', title: 'Registration queue needs another visible lane',
    summary: 'Check-in evidence indicates a recurring queue problem.', taxonomyKey: 'access_checkin',
    priorityLevel: 'Soon', status: 'ACKNOWLEDGED', ownerUserId: null, owner: null,
    evidenceCount: 3, lastSeenAt: '2026-09-17T14:03:00.000Z',
  }]
  let actionHistory: any[] = [{
    id: 'history-converted', actorUserId: 'user-operator', type: 'CONVERTED',
    fromValue: 'ACKNOWLEDGED', toValue: 'OPEN', detailsJson: { classification: 'DURING_EVENT' },
    createdAt: '2026-09-17T14:05:00.000Z',
  }]
  let actionUpdates: any[] = []
  let actionDeliveries: any[] = []

  await page.route('https://storage.test/action-update', async (route) => {
    await route.fulfill({ status: 200, headers: { ETag: 'action-update-etag', 'Access-Control-Allow-Origin': '*' }, body: '' })
  })

  await page.route('**/api/app/account?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/app/account') {
      await route.fallback()
      return
    }
    if (url.searchParams.get('account') === options.deniedAccount) {
      await fulfillJson(route, { success: false, error: 'Forbidden' }, 403)
      return
    }
    await fulfillJson(route, eventsAccountPayload(events))
  })

  await page.route('**/api/app/account/settings?**', async (route) => {
    if (options.denySettings) {
      await fulfillJson(route, { success: false, error: 'Forbidden' }, 403)
      return
    }
    await fulfillJson(route, {
      success: true,
      account: { accountType: 'EVENTS' },
      settings: {
        businessName: 'Events Co',
        branding: { logoUrl: null, primaryColor: null, primaryButtonColor: null },
        consent: {
          title: 'SignalThread',
          subtitle: "We'd love to hear from you",
          items: [
            'Answer a few questions by voice',
            'Takes just a few minutes',
            "We'll ask for microphone access",
            'Your responses stay anonymous',
          ],
          buttonText: "I Agree, Let's Start",
        },
      },
    })
  })

  await page.route('**/api/app/events?**', async (route) => {
    if (route.request().method() === 'POST') {
      const requestBody = route.request().postDataJSON()
      const selectedRecommendations = requestBody.templateSurveyRecommendations ?? []
      await fulfillJson(route, {
        success: true,
        event: {
          id: 'evt-created',
          name: 'Partner Roadshow 2027',
        },
        templateExpansion: {
          created: selectedRecommendations.map((selection: { key: string; surveyName: string }, index: number) => ({
            key: selection.key,
            surveyId: `survey-template-${index + 1}`,
            surveyName: selection.surveyName,
          })),
          skipped: [],
          failed: [],
        },
      })
      return
    }
    await fulfillJson(route, { success: true, events })
  })

  for (const event of events) {
    await page.route(`**/api/app/events/${event.id}?**`, async (route) => {
      await fulfillJson(route, eventDetailPayload(event))
    })
  }

  await page.route('**/api/app/events/evt-created?**', async (route) => {
    await fulfillJson(route, { success: true, event: { id: 'evt-created', name: 'Partner Roadshow 2027' } })
  })

  await page.route('**/api/app/events/*/analysis?**', async (route) => {
    const requestedLifecycle = new URL(route.request().url()).searchParams.get('lifecycle')
    const lifecyclePhase = requestedLifecycle === 'pre-event'
      ? 'PRE_EVENT'
      : requestedLifecycle === 'post-event'
        ? 'POST_EVENT'
        : requestedLifecycle === 'in-event'
          ? 'IN_EVENT'
          : options.analysisOverrides?.lifecyclePhase ?? 'IN_EVENT'
    await fulfillJson(route, {
      success: true,
      data: {
        eventId,
        eventName: 'SignalThread Live Experience Summit 2026',
        eventStatus: 'ACTIVE',
        eventType: 'EVENT',
        accountType: 'EVENTS',
        totalResponses: 10,
        completedResponses: 10,
        totalAnswers: 16,
        answersCaptured: 16,
        answersAnalyzed: 16,
        completedAnswers: 16,
        overallSummary: 'Attendee intelligence shows wayfinding and check-in friction.',
        overallSentiment: 'mixed',
        avgSentimentScore: 0.5,
        topThemes: [{ theme: 'Wayfinding', count: 2 }],
        topActionItems: [{ text: 'Move AI Lounge signage above the aisle banner.', priority: 'High' }],
        lastComputedAt: '2026-09-17T14:00:00.000Z',
        ...options.analysisOverrides,
        defaultLifecyclePhase: options.analysisOverrides?.defaultLifecyclePhase ?? options.analysisOverrides?.lifecyclePhase ?? 'IN_EVENT',
        lifecyclePhase,
      },
    })
  })

  await page.route('**/api/app/events/*/timeline?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: [{ date: '2026-09-17', count: 10 }],
    })
  })

  await page.route('**/api/app/events/*/signals?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        signals: {
          pulse: {
            score: 50,
            label: 'MIXED',
            delta: null,
            components: { sentiment: 25, volume: 20, diversity: 8 },
          },
          momentum: {
            label: 'FLAT',
            sentimentDeltaPoints: 0,
            confidenceLabel: 'High',
            metadata: { daysWithData: 1 },
          },
          topFriction: {
            status: 'friction',
            theme: 'Wayfinding',
            mentionCount: 2,
            severity: 3,
          },
          biggestOpportunity: {
            opportunities: [{ text: 'Move AI Lounge signage above the aisle banner.' }],
          },
          metadata: {
            completedResponses: 10,
            answersCaptured: 16,
            answersAnalyzed: 16,
          },
        },
        keyInsights: {
          themeSentimentBreakdown: [],
          biggestOpportunity: { opportunities: [] },
        },
        insightKeyByThemeKey: {},
      },
    })
  })

  await page.route('**/api/app/events/*/intelligence?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        eventId,
        eventName: 'SignalThread Live Experience Summit 2026',
        eventStatus: 'ACTIVE',
        eventType: 'EVENT',
        accountType: 'EVENTS',
        responseCount: 10,
        answerCount: 16,
        avgSentiment: 0.5,
        highUrgencyCount: 1,
        activeAttentionCount: 2,
        eventPulse: {
          status: 'ATTENTION',
          sentimentLabel: 'MIXED',
          priorityLevel: 'Immediate',
          urgency: 'HIGH',
          summary: '16 analyzed answers across 10 responses. 1 high-urgency issue detected.',
          lastComputedAt: '2026-09-17T14:00:00.000Z',
        },
        topThemes: [
          { themeKey: 'wayfinding', label: 'Wayfinding', count: 2, sentimentLabel: 'NEGATIVE', confidence: 0.92 },
          { themeKey: 'workshops', label: 'Hands-on workshops', count: 4, sentimentLabel: 'POSITIVE', confidence: 0.86 },
          { themeKey: 'room-comfort', label: 'Room comfort', count: 3, sentimentLabel: 'NEUTRAL', confidence: 0.72 },
          { themeKey: 'food-lines', label: 'Food service lines', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.84 },
          { themeKey: 'quiet-room', label: 'Quiet room requests', count: 1, sentimentLabel: 'NEGATIVE', confidence: 0.42 },
        ],
        topActions: [
          { themeKey: 'agenda-density', title: 'Revisit agenda pacing', description: null, count: 2, priority: 'Low', priorityLevel: 'Watch', urgency: 'LOW', actionWindow: 'LATER', status: 'OPEN', confidence: 0.68 },
        ],
        urgentIssues: [],
        structuredMetrics: [
          {
            key: 'question-rating',
            questionId: 'question-rating',
            questionType: 'RATING_1_TO_5',
            questionLabel: 'Rate the expo experience',
            surveyName: 'Expo pulse',
            surveyTargetName: 'Expo floor',
            count: 6,
            average: 2.3,
            distribution: { '1': 2, '2': 2, '3': 1, '4': 1, '5': 0 },
            recent: { count: 3, average: 2 },
            preceding: { count: 3, average: 2.7 },
            change: -0.7,
            direction: 'DOWN',
            sampleStrength: { level: 'DIRECTIONAL', label: 'Directional signal', reason: 'Six completed ratings' },
          },
        ],
        targetBreakdown: [
          {
            surveyTargetId: 'target-event-wide',
            label: 'Overall Event Experience',
            name: 'Overall Event Experience',
            category: 'EVENT',
            answerCount: 2,
            responseCount: 2,
            highUrgencyCount: 1,
            sentimentLabel: 'negative',
            topThemes: [
              { themeKey: 'wayfinding', label: 'Wayfinding', count: 2, sentimentLabel: 'NEGATIVE', confidence: 0.92 },
              { themeKey: 'workshops', label: 'Hands-on workshops', count: 4, sentimentLabel: 'POSITIVE', confidence: 0.86 },
              { themeKey: 'room-comfort', label: 'Room comfort', count: 3, sentimentLabel: 'NEUTRAL', confidence: 0.72 },
              { themeKey: 'food-lines', label: 'Food service lines', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.84 },
              { themeKey: 'quiet-room', label: 'Quiet room requests', count: 1, sentimentLabel: 'NEGATIVE', confidence: 0.42 },
              { themeKey: 'agenda-density', label: 'Agenda pacing', count: 2, sentimentLabel: 'MIXED', confidence: 0.68 },
            ],
            issues: [],
          },
        ],
        questionBreakdown: [
          {
            questionId: 'question-event-wide',
            label: 'What should the event team improve while the event is still happening?',
            answerCount: 2,
            highUrgencyCount: 1,
            sentimentLabel: 'negative',
          },
        ],
        attentionQueue: [
          {
            id: 'cluster-wayfinding',
            title: 'Expo floor wayfinding is hiding partner destinations',
            summary: 'Attendees are circling the expo floor because AI Lounge signage is blocked.',
            priorityLevel: 'Immediate',
            taxonomyKey: 'wayfinding',
            evidenceCount: 2,
            confidence: 0.92,
            status: alertStatus,
            ruleType: 'STRUCTURED_LOW_SCORE',
            metricSnapshot: {
              sampleStrength: { label: 'Directional signal', reason: 'Six completed ratings' },
            },
            lastSeenAt: '2026-09-17T14:00:00.000Z',
            surveyTargetId: 'target-event-wide',
            affectedTarget: { id: 'target-event-wide', name: 'Overall Event Experience', category: 'EVENT' },
            affectedQuestion: {
              id: 'question-event-wide',
              label: 'What should the event team improve while the event is still happening?',
            },
            representativeEvidence: [
              {
                id: 'evidence-wayfinding-1',
                transcriptSnippet: 'The far aisle near the partner booths is packed and the AI Lounge signs are hidden.',
                sentimentScore: -0.72,
                priorityLevel: 'Immediate',
                createdAt: '2026-09-17T13:45:00.000Z',
              },
              {
                id: 'evidence-wayfinding-2',
                transcriptSnippet: 'The app room names do not match the printed signs near the elevators.',
                sentimentScore: -0.64,
                priorityLevel: 'Immediate',
                createdAt: '2026-09-17T13:50:00.000Z',
              },
            ],
            recommendedNextStep: 'Move AI Lounge signage above the aisle banner and reconcile room labels with the app.',
          },
        ],
        ...options.intelligenceOverrides,
      },
    })
  })

  await page.route('**/api/app/events/*/raw-responses?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        items: [{
          id: 'raw-answer-1', responseId: 'raw-response-1', createdAt: '2026-09-17T13:45:00.000Z',
          answerType: 'TEXT', answerDisplay: 'The structured introductions led to useful peer conversations.', numericValue: null,
          transcriptExcerpt: 'The structured introductions led to useful peer conversations.', sentiment: 'POSITIVE',
          source: { id: 'target-event-wide', name: 'Overall Event Experience', category: 'EVENT', session: null, speaker: null },
          question: { id: 'question-event-wide', label: 'What worked well?' }, themes: [{ themeKey: 'networking', label: 'Networking' }],
        }],
        filters: { surveyTargets: [{ id: 'target-event-wide', name: 'Overall Event Experience' }], questions: [{ id: 'question-event-wide', label: 'What worked well?' }] },
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, from: 1, to: 1 },
      },
    })
  })
  await page.route('**/api/app/events/*/raw-responses/raw-answer-1?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        id: 'raw-answer-1', responseId: 'raw-response-1', createdAt: '2026-09-17T13:45:00.000Z', durationMs: 4200,
        answerType: 'TEXT', answerDisplay: 'The structured introductions led to useful peer conversations.', numericValue: null,
        question: { id: 'question-event-wide', key: 'worked-well', label: 'What worked well?' },
        transcript: 'The structured introductions led to useful peer conversations.',
        analysis: { summary: 'The attendee valued structured introductions and peer conversations.', sentiment: 'POSITIVE', sentimentScore: 0.8 },
        themes: [{ themeKey: 'networking', label: 'Networking' }],
        linkedFindings: [{ taxonomyKey: 'networking_expo', urgency: 'LOW', recommendedAction: null, actions: [] }],
        context: { survey: { id: 'survey-1', name: 'Event Voice Survey' }, target: { id: 'target-event-wide', name: 'Overall Event Experience', category: 'EVENT', session: null, speaker: null }, startedAt: '2026-09-17T13:42:00.000Z', completedAt: '2026-09-17T13:46:00.000Z' },
        responseAnswers: [{ id: 'raw-answer-1', question: 'What worked well?', answerType: 'TEXT', answerDisplay: 'The structured introductions led to useful peer conversations.', transcriptExcerpt: 'The structured introductions led to useful peer conversations.', selected: true }],
      },
    })
  })

  await page.route('**/api/app/events/*/sessions/intelligence?**', async (route) => {
    const sessionBase = {
      description: null,
      endsAt: '2026-09-17T15:00:00.000Z',
      timezone: 'America/New_York',
      minimumEvidenceResponses: 3,
      speakers: [],
      findings: [],
      learning: [],
      relatedIssues: [],
      evidence: { analyzedEligibleResponseCount: 0, completedEligibleResponseCount: 0 },
    }
    await fulfillJson(route, {
      success: true,
      data: {
        eventId,
        minimumEvidenceResponses: 3,
        strongEvidenceMinimum: 8,
        provenance: 'EventStructureItem.id → SurveyTarget.eventStructureItemId → Response.surveyTargetId / AnswerEventIntelligence.surveyTargetId',
        summary: {
          agendaSessionCount: 4,
          selectedSessionCount: 3,
          sessionSurveysWithResponsesCount: 2,
          representedSessionCount: 1,
          underrepresentedSessionCount: 2,
          needsReviewSessionCount: 1,
          selectedCoverageLabel: '3 of 4 sessions selected for listening',
          evidenceCoverageLabel: '2 of 3 session surveys have responses',
        },
        sessions: [
          {
            ...sessionBase,
            id: 'session-keynote',
            title: 'Opening Keynote',
            description: 'Welcome and event outlook.',
            startsAt: '2026-09-17T14:00:00.000Z',
            room: 'Main stage',
            track: 'Leadership',
            format: 'Keynote',
            state: 'REPRESENTED',
            selectedForListening: true,
            represented: true,
            underrepresented: false,
            responseCount: 8,
            analyzedAnswerCount: 8,
            evidence: { analyzedEligibleResponseCount: 8, completedEligibleResponseCount: 8 },
            hasEnoughEvidence: true,
            evidenceState: 'STRONG',
            evidenceLabel: 'Strong evidence',
            reviewIssues: [],
            speakers: [{ assignmentId: 'assignment-keynote', role: 'SPEAKER', id: 'speaker-keynote', name: 'Jordan Lee', title: 'Chief Product Officer', organization: 'SignalThread' }],
            listening: {
              targetIds: ['target-session-keynote'], collectionState: 'COLLECTING',
              survey: { id: 'survey-event-wide', name: 'Overall Event Pulse', status: 'ACTIVE' },
              publicLink: { id: 'link-session-keynote', token: 'token-session-keynote', isActive: true },
            },
            findings: [{ themeKey: 'practical_content', label: 'Practical content', mentionCount: 8, responseCount: 8, sentimentLabel: 'POSITIVE', confidence: 0.9 }],
            learning: [{ title: 'Reuse the keynote format', horizon: 'NEXT_EVENT', mentionCount: 8, confidence: 0.8, evidenceThemeKey: 'practical_content' }],
            relatedIssues: [{ id: 'cluster-keynote-audio', title: 'Adjust room audio', priorityLevel: 'Soon', status: 'NEW', evidenceCount: 4, active: true }],
          },
          {
            ...sessionBase,
            id: 'session-workshop',
            title: 'Workshop Lab',
            startsAt: '2026-09-17T16:00:00.000Z',
            endsAt: '2026-09-17T17:00:00.000Z',
            room: 'Room 204', track: 'Applied AI', format: 'Workshop',
            state: 'UNDERREPRESENTED', selectedForListening: true, represented: false, underrepresented: true,
            responseCount: 2, analyzedAnswerCount: 2, hasEnoughEvidence: false, evidenceState: 'NOT_ENOUGH', evidenceLabel: 'Not enough evidence yet', reviewIssues: [],
            evidence: { analyzedEligibleResponseCount: 2, completedEligibleResponseCount: 2 },
            listening: { targetIds: ['target-session-workshop'], collectionState: 'COLLECTING', survey: { id: 'survey-event-wide', name: 'Overall Event Pulse', status: 'ACTIVE' }, publicLink: { id: 'link-session-workshop', token: 'token-session-workshop', isActive: true } },
          },
          {
            ...sessionBase,
            id: 'session-review',
            title: 'Sponsor Roundtable',
            startsAt: '2026-09-17T17:00:00.000Z',
            endsAt: '2026-09-17T18:00:00.000Z',
            room: 'Partner lounge', track: 'Sponsors', format: 'Roundtable',
            state: 'NEEDS_REVIEW', selectedForListening: true, represented: false, underrepresented: true,
            responseCount: 0, analyzedAnswerCount: 0, hasEnoughEvidence: false, evidenceState: 'NONE', evidenceLabel: 'No responses yet', reviewIssues: ['Listening point needs an attached survey'],
            listening: { targetIds: ['target-session-review'], collectionState: 'NEEDS_SURVEY', survey: null, publicLink: null },
          },
          {
            ...sessionBase,
            id: 'session-unselected',
            title: 'Closing Conversation',
            startsAt: '2026-09-17T18:00:00.000Z',
            endsAt: '2026-09-17T19:00:00.000Z',
            room: 'Main stage', track: 'Leadership', format: 'Panel',
            state: 'NOT_SELECTED', selectedForListening: false, represented: false, underrepresented: false,
            responseCount: 0, analyzedAnswerCount: 0, hasEnoughEvidence: false, evidenceState: 'NONE', evidenceLabel: 'Not selected for listening', reviewIssues: [],
            listening: { targetIds: [], collectionState: 'NOT_SELECTED', survey: null, publicLink: null },
          },
        ],
      },
    })
  })

  await page.route('**/api/app/events/*/speakers/intelligence?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        eventId,
        minimumEvidenceResponses: 3,
        strongEvidenceMinimum: 8,
        provenance: 'SurveyTarget.speakerAssignmentId → EventSessionSpeakerAssignment → EventSpeakerProfile + EventStructureItem',
        summary: { speakerCount: 1, speakersWithFeedbackCount: 1, speakerSpecificResponseCount: 4 },
        speakers: [{
          id: 'speaker-keynote',
          name: 'Jordan Lee',
          title: 'Chief Product Officer',
          organization: 'SignalThread',
          sessions: [{ assignmentId: 'assignment-keynote', role: 'SPEAKER', id: 'session-keynote', title: 'Opening Keynote', startsAt: '2026-09-17T14:00:00.000Z', endsAt: '2026-09-17T15:00:00.000Z', timezone: 'America/New_York' }],
          speakerSpecificTargetIds: ['target-speaker-keynote'],
          responseCount: 4,
          analyzedAnswerCount: 4,
          evidenceState: 'DIRECTIONAL',
          evidenceLabel: 'Directional speaker evidence',
          minimumEvidenceResponses: 3,
          confidence: 0.91,
          findings: [{ themeKey: 'speaker_delivery', label: 'Clear delivery', mentionCount: 4, responseCount: 4, sentimentLabel: 'POSITIVE', confidence: 0.9 }],
        }],
      },
    })
  })

  await page.route('**/api/app/events/*/themes/*/evidence?**', async (route) => {
    const evidenceUrl = new URL(route.request().url())
    const themeKey = decodeURIComponent(evidenceUrl.pathname.split('/themes/')[1].split('/evidence')[0])
    const evidenceByTheme: Record<string, { label: string; snippet: string; sentiment: string; score: number }> = {
      wayfinding: { label: 'Wayfinding', snippet: 'The far aisle near the partner booths is packed and the AI Lounge signs are hidden.', sentiment: 'NEGATIVE', score: -0.72 },
      workshops: { label: 'Hands-on workshops', snippet: 'The hands-on workshop was the most useful part of the day.', sentiment: 'POSITIVE', score: 0.82 },
      'agenda-density': { label: 'Agenda pacing', snippet: 'The afternoon agenda felt too tightly packed.', sentiment: 'MIXED', score: -0.2 },
      'room-comfort': { label: 'Room comfort', snippet: 'The breakout room temperature was comfortable throughout the session.', sentiment: 'NEUTRAL', score: 0.05 },
      'food-lines': { label: 'Food service lines', snippet: 'Lunch lines stayed long enough that attendees missed session openings.', sentiment: 'NEGATIVE', score: -0.62 },
      'quiet-room': { label: 'Quiet room requests', snippet: 'One attendee asked whether a quiet room was available.', sentiment: 'NEGATIVE', score: -0.18 },
      practical_content: { label: 'Practical content', snippet: 'The keynote gave our team practical ideas we can use next week.', sentiment: 'POSITIVE', score: 0.88 },
      speaker_delivery: { label: 'Clear delivery', snippet: 'Jordan explained the product strategy clearly and answered the speaker question directly.', sentiment: 'POSITIVE', score: 0.9 },
    }
    const evidence = evidenceByTheme[themeKey] ?? evidenceByTheme['agenda-density']
    const issueClusterIds = evidenceUrl.searchParams.get('issueClusterIds')?.split(',').filter(Boolean) ?? []
    const themeLabel = evidence.label
    const issueEvidenceCount = options.analysisOverrides?.lifecyclePhase === 'POST_EVENT' ? 4 : 2
    const evidenceRows = Array.from({ length: issueClusterIds.length > 0 ? issueEvidenceCount : 1 }, (_, index) => ({
      themeKey,
      themeLabel,
      answerId: `answer-${themeKey}-${index + 1}`,
      responseId: `response-${themeKey}-${index + 1}`,
      questionId: 'question-event-wide',
      surveyTargetId: 'target-event-wide',
      transcriptSnippet: index === 0 ? evidence.snippet : `Canonical linked ${themeLabel.toLowerCase()} evidence ${index + 1}.`,
      transcriptText: null,
      question: { id: 'question-event-wide', key: 'event_feedback', label: 'What should we keep or change?', promptLabel: null },
      target: evidenceUrl.searchParams.get('speakerId') ? {
        id: 'target-speaker-keynote', name: 'Opening Keynote · Jordan Lee', category: 'SESSION',
        session: { id: 'session-keynote', name: 'Opening Keynote' },
        speaker: { assignmentId: 'assignment-keynote', id: 'speaker-keynote', name: 'Jordan Lee', role: 'SPEAKER' },
      } : { id: 'target-event-wide', name: 'Overall Event Experience', category: 'EVENT', session: null, speaker: null },
      response: { id: `response-${themeKey}-${index + 1}`, anonymousId: `anon-${themeKey}-${index + 1}`, status: 'COMPLETED', startedAt: '2026-09-17T13:00:00.000Z', completedAt: '2026-09-17T13:02:00.000Z' },
      sentimentScore: evidence.score,
      sentimentLabel: evidence.sentiment,
      confidence: 0.86,
      createdAt: `2026-09-17T13:0${index + 2}:00.000Z`,
    }))
    await fulfillJson(route, {
      success: true,
      data: {
        eventId,
        themeKey,
        themeLabel,
        mentionCount: issueClusterIds.length > 0 ? issueEvidenceCount : themeKey === 'workshops' ? 4 : 2,
        evidence: evidenceRows,
      },
    })
  })

  await page.route('**/api/app/events/*/clusters/*/status?**', async (route) => {
    const method = route.request().method()
    if (method === 'PATCH') {
      const body = route.request().postDataJSON()
      if (body.status) alertStatus = body.status
      if (body.ownerUserId) alertOwnerUserId = body.ownerUserId
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON()
      alertNotes = [{
        id: `note-${alertNotes.length + 1}`,
        body: body.body,
        createdAt: '2026-09-17T14:10:00.000Z',
        author: { id: 'user-operator', email: 'operator@events.co', firstName: 'Event', lastName: 'Operator' },
      }, ...alertNotes]
    }
    await fulfillJson(route, {
      success: true,
      data: {
        id: 'cluster-wayfinding',
        status: alertStatus,
        ownerUserId: alertOwnerUserId,
        owner: alertOwnerUserId
          ? { id: 'user-owner', email: 'owner@events.co', firstName: 'Alex', lastName: 'Rivera' }
          : null,
        availableOwners: [
          { id: 'user-owner', email: 'owner@events.co', firstName: 'Alex', lastName: 'Rivera' },
        ],
        notes: alertNotes,
        evidence: [
          {
            id: 'evidence-rating-1',
            transcriptSnippet: '',
            answer: { numericValue: 2, objectKey: null, answerTranscript: null },
            question: { label: 'Rate the expo experience', type: 'RATING_1_TO_5' },
          },
          {
            id: 'evidence-wayfinding-1',
            transcriptSnippet: 'The far aisle near the partner booths is packed and the AI Lounge signs are hidden.',
            answer: {
              numericValue: null,
              objectKey: 'answers/wayfinding.webm',
              answerTranscript: { text: 'The far aisle near the partner booths is packed and the AI Lounge signs are hidden.' },
            },
            question: { label: 'What should the event team improve?', type: 'VOICE' },
          },
        ],
        interventionMovement: alertStatus === 'ACTING'
          ? {
              status: 'NOT_ENOUGH_EVIDENCE',
              label: 'Not enough evidence',
              before: { average: 2.3, count: 3 },
              after: { average: null, count: 0 },
              change: null,
              sampleStrength: { label: 'Limited evidence', reason: 'No post-action ratings yet' },
            }
          : null,
      },
    })
  })

  await page.route('**/api/app/events/*/actions/*?**', async (route) => {
    const method = route.request().method()
    const pathname = new URL(route.request().url()).pathname
    const actionPath = decodeURIComponent(pathname.split('/actions/')[1])
    const actionId = actionPath.split('/')[0]
    let action = canonicalActions.find((item) => item.id === actionId)
    if (!action) {
      await fulfillJson(route, { success: false, error: 'Action not found' }, 404)
      return
    }
    if (actionPath.endsWith('/voice') && method === 'POST') {
      const body = route.request().postDataJSON()
      if (body.operation === 'PRESIGN') {
        await fulfillJson(route, {
          success: true,
          data: {
            key: `event-actions/account-events/${eventId}/${action.id}/updates/mobile-update.webm`,
            url: 'https://storage.test/action-update',
            expiresIn: 300,
          },
        })
        return
      }
      actionUpdates.push({
        id: `action-update-${actionUpdates.length + 1}`, authorUserId: 'user-operator', kind: 'VOICE',
        body: null, voiceTranscript: 'Facilities moved the sign and reopened the aisle.',
        voiceTranscriptionStatus: 'COMPLETED', voiceFailureReason: null,
        createdAt: '2026-09-17T14:21:00.000Z',
      })
      action._count.actionUpdates = actionUpdates.length
      await fulfillJson(route, { success: true, data: actionUpdates[actionUpdates.length - 1] }, 202)
      return
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON()
      const previousOwner = action.ownerUserId
      const previousStatus = action.actionStatus
      const previousValue = body.operation === 'SET_DUE_DATE' ? action.actionDueAt
        : body.operation === 'SET_PRIORITY' ? action.priorityLevel
          : body.operation === 'SET_CLASSIFICATION' ? action.actionClassification
            : null
      if (body.operation === 'ASSIGN') {
        action.ownerUserId = body.ownerUserId || null
        action.owner = actionOwners.find((owner) => owner.id === body.ownerUserId) ?? null
        action.actionStatus = body.ownerUserId && action.actionStatus === 'UNASSIGNED' ? 'OPEN' : body.ownerUserId ? action.actionStatus : 'UNASSIGNED'
        if (body.ownerUserId) actionDeliveries = [{
          id: 'delivery-action-1', recipientEmail: 'owner@events.co', recipientName: 'Alex Rivera',
          status: 'FAILED', provider: 'fake-email', providerMessageId: null, attemptCount: 1,
          lastAttemptAt: '2026-09-17T14:15:00.000Z', sentAt: null,
          failureCode: 'provider_unavailable', failureMessage: 'Temporary provider outage',
          deepLink: `/app/events/${eventId}/dashboard?account=${accountSlug}&tab=actions&actionView=my&actionId=${action.id}`,
          createdAt: '2026-09-17T14:15:00.000Z',
          attempts: [{ id: 'delivery-attempt-1', attemptNumber: 1, status: 'FAILED', provider: 'fake-email', providerMessageId: null, failureMessage: 'Temporary provider outage', attemptedAt: '2026-09-17T14:15:00.000Z' }],
        }]
      }
      if (body.operation === 'RETRY_ASSIGNMENT_EMAIL') {
        const delivery = actionDeliveries.find((item) => item.id === body.deliveryId)
        if (delivery?.status === 'FAILED') {
          delivery.status = 'SENT'
          delivery.providerMessageId = 'email-retry-1'
          delivery.attemptCount = 2
          delivery.sentAt = '2026-09-17T14:16:00.000Z'
          delivery.failureCode = null
          delivery.failureMessage = null
          delivery.attempts.push({ id: 'delivery-attempt-2', attemptNumber: 2, status: 'SENT', provider: 'fake-email', providerMessageId: 'email-retry-1', failureMessage: null, attemptedAt: '2026-09-17T14:16:00.000Z' })
        }
      }
      if (body.operation === 'TRANSITION') {
        action.actionStatus = body.status
        action.actionBlockedReason = body.status === 'BLOCKED' ? body.blockedReason : null
        action.actionResolution = ['COMPLETE', 'DISMISSED', 'CANCELLED'].includes(body.status) ? body.resolution : null
      }
      if (body.operation === 'SET_DUE_DATE') action.actionDueAt = body.dueAt
      if (body.operation === 'SET_PRIORITY') action.priorityLevel = body.priority
      if (body.operation === 'SET_CLASSIFICATION') action.actionClassification = body.classification
      action.updatedAt = '2026-09-17T14:15:00.000Z'
      if (body.operation !== 'RETRY_ASSIGNMENT_EMAIL') actionHistory.push({
        id: `history-${actionHistory.length + 1}`,
        actorUserId: 'user-operator',
        type: body.operation === 'ASSIGN' ? (previousOwner ? 'REASSIGNED' : 'ASSIGNED')
          : body.operation === 'TRANSITION' ? 'STATUS_CHANGED'
            : body.operation === 'SET_DUE_DATE' ? 'DUE_DATE_CHANGED'
              : body.operation === 'SET_PRIORITY' ? 'PRIORITY_CHANGED' : 'CLASSIFICATION_CHANGED',
        fromValue: body.operation === 'ASSIGN' ? previousOwner : body.operation === 'TRANSITION' ? previousStatus : previousValue,
        toValue: body.operation === 'ASSIGN' ? action.ownerUserId : body.operation === 'TRANSITION' ? action.actionStatus
          : body.operation === 'SET_DUE_DATE' ? action.actionDueAt : body.operation === 'SET_PRIORITY' ? action.priorityLevel : action.actionClassification,
        detailsJson: null, createdAt: '2026-09-17T14:15:00.000Z',
      })
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON()
      actionUpdates.push({
        id: `action-update-${actionUpdates.length + 1}`, authorUserId: 'user-operator', kind: body.kind,
        body: body.body, voiceTranscript: null, voiceTranscriptionStatus: null, voiceFailureReason: null,
        createdAt: '2026-09-17T14:20:00.000Z',
      })
      action._count.actionUpdates = actionUpdates.length
      await fulfillJson(route, { success: true, data: actionUpdates[actionUpdates.length - 1] }, 201)
      return
    }
    canonicalActions = canonicalActions.map((item) => item.id === actionId ? { ...action } : item)
    await fulfillJson(route, {
      success: true,
      data: {
        ...action,
        availableOwners: actionOwners,
        actionHistory,
        actionUpdates,
        actionDeliveries,
        evidence: [{
          id: 'evidence-wayfinding-1', answerId: 'answer-wayfinding', responseId: 'response-wayfinding',
          questionId: 'question-event-wide',
          transcriptSnippet: 'The far aisle near the partner booths is packed and the AI Lounge signs are hidden.',
          sentimentScore: -0.72, createdAt: '2026-09-17T13:45:00.000Z',
          answer: { id: 'answer-wayfinding', questionKey: 'event-feedback', promptLabel: 'What should the event team improve?', answerTranscript: { text: 'The far aisle near the partner booths is packed and the AI Lounge signs are hidden.' } },
          question: { id: 'question-event-wide', label: 'What should the event team improve?', type: 'VOICE' },
          response: { id: 'response-wayfinding', anonymousId: 'anon-wayfinding', status: 'COMPLETED', startedAt: '2026-09-17T13:40:00.000Z', completedAt: '2026-09-17T13:45:00.000Z' },
          surveyTarget: { id: 'target-event-wide', name: 'Overall Event Experience', category: 'EVENT', eventStructureItem: null, speakerAssignment: null },
        }],
      },
    })
  })

  await page.route('**/api/app/events/*/actions?**', async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/actions')) {
      await route.fallback()
      return
    }
    const method = route.request().method()
    if (method === 'POST') {
      const body = route.request().postDataJSON()
      const finding = availableActionFindings.find((item) => item.id === body.clusterId)
      const created = {
        ...finding, eventId, owner: null, ownerUserId: null,
        actionClassification: body.classification, actionStatus: body.classification === 'INFORMATIONAL' ? 'COMPLETE' : 'UNASSIGNED',
        actionDueAt: null, actionBlockedReason: null, actionResolution: body.classification === 'INFORMATIONAL' ? 'No action required' : null,
        updatedAt: '2026-09-17T14:25:00.000Z', _count: { evidence: finding?.evidenceCount ?? 0, actionUpdates: 0 },
      }
      canonicalActions.push(created)
      availableActionFindings = availableActionFindings.filter((item) => item.id !== body.clusterId)
      await fulfillJson(route, { success: true, data: created }, 201)
      return
    }
    await fulfillJson(route, {
      success: true,
      data: { actions: canonicalActions, availableFindings: availableActionFindings, availableOwners: actionOwners, currentUserId: 'user-operator' },
    })
  })

  // Register after the broader action mocks so Playwright dispatches action
  // media to its dedicated endpoint instead of the generic detail handler.
  await page.route(`**/api/app/events/${eventId}/actions/*/voice?**`, async (route) => {
    const body = route.request().postDataJSON()
    const actionId = decodeURIComponent(new URL(route.request().url()).pathname.split('/actions/')[1]).split('/')[0]
    const action = canonicalActions.find((item) => item.id === actionId)
    if (!action) {
      await fulfillJson(route, { success: false, error: 'Action not found' }, 404)
      return
    }
    if (body.operation === 'PRESIGN') {
      await fulfillJson(route, {
        success: true,
        data: {
          key: `event-actions/account-events/${eventId}/${action.id}/updates/mobile-update.webm`,
          url: 'https://storage.test/action-update',
          expiresIn: 300,
        },
      })
      return
    }
    actionUpdates.push({
      id: `action-update-${actionUpdates.length + 1}`, authorUserId: 'user-operator', kind: 'VOICE',
      body: null, voiceTranscript: 'Facilities moved the sign and reopened the aisle.',
      voiceTranscriptionStatus: 'COMPLETED', voiceFailureReason: null,
      createdAt: '2026-09-17T14:21:00.000Z',
    })
    action._count.actionUpdates = actionUpdates.length
    await fulfillJson(route, { success: true, data: actionUpdates[actionUpdates.length - 1] }, 202)
  })

  await page.route('**/api/app/events/*/voice-surveys?**', async (route) => {
    const method = route.request().method()
    if (method === 'GET' && signageSaved && options.signageRefreshDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.signageRefreshDelayMs))
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON()
      const createdQuestions = (body.questions ?? []).map((question: { prompt: string; type: string; displayOrder: number; required: boolean }, index: number) => ({
        id: `question-created-${index}`,
        key: `created-q${index + 1}`,
        label: question.prompt,
        type: question.type,
        order: question.displayOrder,
        required: question.required,
      }))
      voiceSurvey = {
        ...voiceSurvey,
        id: 'survey-created',
        name: body.surveyName,
        status: 'DRAFT',
        isArchived: false,
        responseCount: 0,
        questions: createdQuestions,
        publicLink: { id: 'link-created', kioskPath: '/kiosk?token=created-token', isActive: false },
      }
      await fulfillJson(route, {
        success: true,
        data: {
          target: { id: 'target-created', name: body.targetName ?? 'AI Lounge', category: body.targetCategory ?? 'LOCATION' },
          survey: { id: 'survey-created', name: body.surveyName, status: 'DRAFT' },
          questions: createdQuestions,
          publicLink: { id: 'link-created', kioskPath: '/kiosk?token=created-token', isActive: false },
        },
      }, 201)
      return
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON()
      if (Array.isArray(body.questions)) {
        voiceSurvey = {
          ...voiceSurvey,
          name: body.surveyName ?? voiceSurvey.name,
          questions: body.questions.map((question: { id?: string; text: string; type: string; order: number; required: boolean }, index: number) => ({
            id: question.id ?? `question-created-${index}`,
            key: `created-q${index + 1}`,
            label: question.text,
            type: question.type,
            order: question.order,
            required: question.required,
          })),
        }
      }
      if (body.status === 'ACTIVE') {
        voiceSurvey = {
          ...voiceSurvey,
          status: 'ACTIVE',
          isArchived: false,
          publicLink: {
            ...voiceSurvey.publicLink,
            isActive: true,
          },
          readiness: { responseEligible: true, issues: [] },
        }
      }
      if (body.status === 'DRAFT') {
        voiceSurvey = {
          ...voiceSurvey,
          status: 'DRAFT',
          isArchived: false,
          publicLink: {
            ...voiceSurvey.publicLink,
            isActive: false,
          },
          readiness: { responseEligible: false, issues: ['Survey is unpublished', 'Public survey link is inactive'] },
        }
      }
      if (body.archived === true) {
        voiceSurvey = {
          ...voiceSurvey,
          status: 'ARCHIVED',
          isArchived: true,
          publicLink: {
            ...voiceSurvey.publicLink,
            isActive: false,
          },
        }
      }
      if (body.archived === false) {
        voiceSurvey = {
          ...voiceSurvey,
          status: 'DRAFT',
          isArchived: false,
          publicLink: {
            ...voiceSurvey.publicLink,
            isActive: false,
          },
        }
      }
      if (body.availability) {
        const future = body.availability.mode === 'CUSTOM_WINDOW' && new Date(body.availability.opensAt).getTime() > Date.now()
        voiceSurvey = {
          ...voiceSurvey,
          availabilityMode: body.availability.mode,
          availabilityTimezone: body.availability.timezone,
          availabilityOpensAt: body.availability.opensAt,
          availabilityClosesAt: body.availability.closesAt,
          availabilityOpenAnchor: body.availability.openAnchor,
          availabilityCloseAnchor: body.availability.closeAnchor,
          availabilityOpenOffsetMinutes: body.availability.openOffsetMinutes,
          availabilityCloseOffsetMinutes: body.availability.closeOffsetMinutes,
          availabilityOverride: body.availability.override,
          availability: future
            ? { state: 'NOT_YET_OPEN', message: 'This survey opens Jan 1, 2099, 9:00 AM.', effectiveOpensAt: body.availability.opensAt, effectiveClosesAt: body.availability.closesAt }
            : { state: 'OPEN', message: 'This survey is open.', effectiveOpensAt: body.availability.opensAt, effectiveClosesAt: body.availability.closesAt },
          readiness: future
            ? { responseEligible: false, issues: ['Survey is not yet open'] }
            : { responseEligible: true, issues: [] },
        }
      }
    }

    if (method === 'DELETE') {
      voiceSurveyDeleted = true
      await fulfillJson(route, {
        success: true,
        data: {
          surveys: [],
        },
      })
      return
    }

    await fulfillJson(route, {
      success: true,
      data: {
        event: {
          id: events[0].id,
          name: events[0].name,
          status: events[0].status,
          ttsProvider: 'google',
          ttsVoice: 'en-US-Studio-O',
          ttsLocale: 'en-US',
        },
        surveys: voiceSurveyDeleted ? [] : [voiceSurvey, ...(options.additionalVoiceSurveys ?? [])],
      },
    })
  })

  await page.route('**/api/app/events/*/signage?**', async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, { success: false, error: 'Method not allowed' }, 405)
      return
    }
    const body = route.request().postDataJSON()
    voiceSurvey = { ...voiceSurvey, signageConfiguration: body.configuration }
    signageSaved = true
    await fulfillJson(route, { success: true, data: { configuration: body.configuration } })
  })

  await page.route('**/api/app/events/*/agenda/imports?**', async (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      agendaImportJob = {
        id: 'agenda-import-1', importType: 'AGENDA', status: 'MAPPING', sourceFileName: 'summit-agenda.csv', worksheetName: 'CSV', worksheetIndex: 0,
        failureMessage: null, mappingSnapshot: { mapping: null }, rows: [],
        inspection: { fileType: 'CSV', worksheets: [{ name: 'CSV', index: 0, columns: ['Session Title', 'Date', 'Start', 'End', 'Room'], rowCount: 1 }] },
        discoveredMapping: { mapping: { title: 'Session Title', startDate: 'Date', startTime: 'Start', endTime: 'End', room: 'Room' }, missingRequired: [] },
        completion: { importedCount: 0, updatedCount: 0, skippedCount: 0, duplicateCount: 0, failedCount: 0, createdSpeakerCount: 0, matchedSpeakerCount: 0 },
        sessionsStillNeedingReview: null, confirmationMode: 'ATOMIC_ALL_OR_NOTHING',
      }
      await fulfillJson(route, { success: true, data: agendaImportJob }, 201)
      return
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON()
      if (body.action === 'SELECT_WORKSHEET') agendaImportJob = { ...agendaImportJob, status: 'MAPPING', rows: [] }
      if (body.action === 'SAVE_MAPPING') agendaImportJob = {
        ...agendaImportJob,
        status: 'READY',
        mappingSnapshot: { mapping: { timezone: body.timezone, columns: body.mapping } },
        rows: [{
          id: 'agenda-import-row-1', sourceRowNumber: 2, rawRowSnapshot: { 'Session Title': 'Imported Workshop' },
          normalizedRowSnapshot: { title: 'Imported Workshop', startsAt: '2026-09-17T16:00:00.000Z', endsAt: '2026-09-17T17:00:00.000Z', timezone: body.timezone, room: 'Room 202', track: 'Learning', format: 'Workshop', speakers: [] },
          validationIssues: [], status: 'READY', conflictType: null, resolution: null, speakerResolutionSnapshot: [], existingSessionId: null, result: null, resultMessage: null,
        }],
      }
      if (body.action === 'CONFIRM') {
        agendaSessions = [...agendaSessions, {
          id: 'session-imported', name: 'Imported Workshop', description: null, startsAt: '2026-09-17T16:00:00.000Z', endsAt: '2026-09-17T17:00:00.000Z', timezone: 'America/New_York',
          metadata: { schemaVersion: 1, room: 'Room 202', track: 'Learning', format: 'Workshop', externalId: null, capacity: null, tags: [] }, speakerAssignments: [], reviewState: 'COMPLETE', reviewIssues: [], _count: { surveyTargets: 0 },
        }]
        agendaImportJob = { ...agendaImportJob, status: 'COMPLETED', rows: agendaImportJob.rows.map((row: any) => ({ ...row, status: 'CONFIRMED', result: 'CREATED' })), completion: { ...agendaImportJob.completion, importedCount: 1 }, sessionsStillNeedingReview: 0 }
      }
      await fulfillJson(route, { success: true, data: agendaImportJob })
      return
    }
    await fulfillJson(route, agendaImportJob ? { success: true, data: agendaImportJob } : { success: false, error: 'Import not found' }, agendaImportJob ? 200 : 404)
  })

  await page.route('**/api/app/events/*/agenda?**', async (route) => {
    const method = route.request().method()
    const body = method === 'GET' ? {} : route.request().postDataJSON()
    if (body.action === 'CREATE_SESSION') {
      agendaSessions = [...agendaSessions, {
        id: `session-${agendaSessions.length + 1}`,
        name: body.session.title,
        description: body.session.description,
        startsAt: body.session.startsAt,
        endsAt: body.session.endsAt,
        timezone: body.session.timezone,
        metadata: {
          schemaVersion: 1,
          room: body.session.room,
          track: body.session.track,
          format: body.session.format,
          externalId: body.session.externalId,
          capacity: body.session.capacity,
          tags: body.session.tags,
        },
        speakerAssignments: [], reviewState: 'COMPLETE', reviewIssues: [], _count: { surveyTargets: 0 },
      }]
    }
    if (body.action === 'CREATE_SPEAKER') {
      agendaSpeakers = [...agendaSpeakers, {
        id: `speaker-${agendaSpeakers.length + 1}`,
        ...body.profile,
        headshotState: 'NONE', sessionCount: 0, profileState: 'COMPLETE', missingFields: [], possibleDuplicate: false, sessionAssignments: [],
      }]
    }
    if (body.action === 'ADD_LISTENING_POINTS') {
      for (const sessionId of body.sessionIds) agendaListeningBySession.set(sessionId, {
        targetId: `target-${sessionId}`, state: 'NEEDS_SURVEY', responseCount: 0, survey: null, publicLink: null, readiness: null,
      })
    }
    if (body.action === 'ATTACH_LISTENING_SURVEY') {
      for (const sessionId of body.sessionIds) agendaListeningBySession.set(sessionId, {
        targetId: `target-${sessionId}`, state: 'READY_TO_COLLECT', responseCount: 0,
        survey: { id: voiceSurvey.id, name: voiceSurvey.name, status: 'ACTIVE', responseMode: 'VOICE_ONLY' },
        publicLink: { id: `link-${sessionId}`, token: `token-${sessionId}`, kioskPath: `/kiosk?token=token-${sessionId}`, isActive: true },
        readiness: { responseEligible: true, availability: { state: 'OPEN', message: 'This survey is open.' }, issues: [] },
      })
    }
    if (body.action === 'BULK_ASSIGN_EXISTING_SURVEY') {
      const selectedSurvey = surveyLibrary().find((survey) => survey.id === body.surveyId) ?? voiceSurvey
      let replaced = 0
      if (body.targetType === 'SESSION') {
        for (const sessionId of body.targetIds) {
          if (agendaListeningBySession.get(sessionId)?.survey?.id && agendaListeningBySession.get(sessionId).survey.id !== selectedSurvey.id) replaced += 1
          agendaListeningBySession.set(sessionId, {
          targetId: `target-${sessionId}`, state: 'READY_TO_COLLECT', responseCount: 0,
          survey: { id: selectedSurvey.id, name: selectedSurvey.name, status: selectedSurvey.status, responseMode: selectedSurvey.responseMode },
          publicLink: { id: `link-${sessionId}`, token: `token-${sessionId}`, kioskPath: `/kiosk?token=token-${sessionId}`, isActive: true },
          readiness: { responseEligible: true, availability: { state: 'OPEN', message: 'This survey is open.' }, issues: [] },
        })
        }
      }
      if (body.targetType === 'SPEAKER') {
        agendaSpeakers = agendaSpeakers.map((speaker) => {
          if (!body.targetIds.includes(speaker.id)) return speaker
          if (speaker.survey?.id && speaker.survey.id !== selectedSurvey.id) replaced += 1
          return { ...speaker, survey: { id: selectedSurvey.id, name: selectedSurvey.name, status: selectedSurvey.status, questionCount: selectedSurvey.questions?.length ?? 0, kioskPath: `/kiosk?token=speaker-${speaker.id}`, isActive: selectedSurvey.status === 'ACTIVE' } }
        })
      }
      await fulfillJson(route, {
        success: true,
        data: { counts: { requested: body.targetIds.length, attached: body.targetIds.length, alreadyAttached: 0, skipped: 0, replaced, failed: 0 } },
      })
      return
    }
    if (body.action === 'CREATE_LISTENING_SURVEY') {
      for (const sessionId of body.sessionIds) agendaListeningBySession.set(sessionId, {
        targetId: `target-${sessionId}`, state: body.publish ? 'READY_TO_COLLECT' : 'SURVEY_ATTACHED', responseCount: 0,
        survey: { id: 'survey-listening-new', name: body.surveyName, status: body.publish ? 'ACTIVE' : 'DRAFT', responseMode: 'VOICE_ONLY' },
        publicLink: { id: `link-${sessionId}`, token: `new-token-${sessionId}`, kioskPath: `/kiosk?token=new-token-${sessionId}`, isActive: body.publish },
        readiness: { responseEligible: body.publish, availability: { state: 'OPEN', message: 'This survey is open.' }, issues: body.publish ? [] : ['Survey is unpublished'] },
      })
    }
    if (body.action === 'REMOVE_LISTENING_POINTS') {
      for (const sessionId of body.sessionIds) agendaListeningBySession.delete(sessionId)
    }
    if (body.action === 'ASSIGN_SPEAKER') {
      const speaker = agendaSpeakers.find((item) => item.id === body.assignment.speakerId)
      agendaSessions = agendaSessions.map((session) => session.id === body.sessionId
        ? { ...session, speakerAssignments: [...session.speakerAssignments, { id: `assignment-${Date.now()}`, role: body.assignment.role, sortOrder: body.assignment.sortOrder, speaker }] }
        : session)
      agendaSpeakers = agendaSpeakers.map((item) => item.id === body.assignment.speakerId
        ? { ...item, sessionCount: item.sessionCount + 1, sessionAssignments: [...item.sessionAssignments, { id: `assignment-${Date.now()}`, role: body.assignment.role, sortOrder: body.assignment.sortOrder, session: { id: body.sessionId, name: agendaSessions.find((session) => session.id === body.sessionId)?.name, startsAt: agendaSessions.find((session) => session.id === body.sessionId)?.startsAt, isActive: true } }] }
        : item)
    }
    if (body.action === 'UPDATE_SESSION') {
      agendaSessions = agendaSessions.map((session) => session.id === body.session.sessionId ? {
        ...session, name: body.session.title, description: body.session.description, startsAt: body.session.startsAt,
        endsAt: body.session.endsAt, timezone: body.session.timezone,
        metadata: { schemaVersion: 1, room: body.session.room, track: body.session.track, format: body.session.format, externalId: body.session.externalId, capacity: body.session.capacity, tags: body.session.tags },
      } : session)
    }
    if (body.action === 'UPDATE_SPEAKER') {
      agendaSpeakers = agendaSpeakers.map((speaker) => speaker.id === body.speakerId ? { ...speaker, ...body.profile } : speaker)
    }
    if (body.action === 'ARCHIVE_SESSION') agendaSessions = agendaSessions.filter((session) => session.id !== body.sessionId)
    if (body.action === 'ARCHIVE_SPEAKER') agendaSpeakers = agendaSpeakers.filter((speaker) => speaker.id !== body.speakerId)
    if (body.action === 'REMOVE_ASSIGNMENT') {
      agendaSessions = agendaSessions.map((session) => session.id === body.sessionId ? { ...session, speakerAssignments: session.speakerAssignments.filter((assignment: any) => assignment.speaker.id !== body.speakerId) } : session)
      agendaSpeakers = agendaSpeakers.map((speaker) => speaker.id === body.speakerId ? { ...speaker, sessionCount: Math.max(0, speaker.sessionCount - 1), sessionAssignments: speaker.sessionAssignments.filter((assignment: any) => assignment.session.id !== body.sessionId) } : speaker)
    }
    const sessionsNeedingReview = agendaSessions.filter((session) => session.reviewState === 'NEEDS_REVIEW').length
    const listeningSessions = agendaSessions.map((session) => ({
      sessionId: session.id,
      ...(agendaListeningBySession.get(session.id) ?? { targetId: null, state: 'NOT_SELECTED', responseCount: 0, survey: null, publicLink: null, readiness: null }),
    }))
    const selectedListeningSessions = listeningSessions.filter((session) => session.state !== 'NOT_SELECTED')
    const representedListeningSessions = selectedListeningSessions.filter((session) => session.state === 'REPRESENTED')
    await fulfillJson(route, {
      success: true,
      data: method === 'GET' ? {
        eventId,
        eventStatus: 'ACTIVE',
        eventLifecyclePhase: options.agendaLifecyclePhase ?? 'IN_EVENT',
        summary: {
          sessionCount: agendaSessions.length,
          speakerCount: agendaSpeakers.length,
          sessionsNeedingReview,
          unassignedSpeakerCount: agendaSpeakers.filter((speaker) => speaker.sessionCount === 0).length,
        },
        sessions: agendaSessions,
        speakers: agendaSpeakers,
        listeningPlan: {
          summary: {
            agendaSessionCount: agendaSessions.length,
            selectedSessionCount: selectedListeningSessions.length,
            representedSessionCount: representedListeningSessions.length,
            selectedCoverageLabel: `${selectedListeningSessions.length} of ${agendaSessions.length} sessions selected for listening`,
            evidenceCoverageLabel: `${representedListeningSessions.length} of ${selectedListeningSessions.length} selected sessions represented`,
          },
          sessions: listeningSessions,
          surveys: [{ id: voiceSurvey.id, name: voiceSurvey.name, status: voiceSurvey.status, responseMode: voiceSurvey.responseMode, _count: { questions: voiceSurvey.questions.length } }],
          availableSurveys: surveyLibrary().map((survey) => ({
            id: survey.id,
            name: survey.name,
            status: survey.status,
            responseMode: survey.responseMode,
            targetType: survey.target == null ? null : survey.target.category === 'SPEAKER' ? 'SPEAKER' : 'SESSION',
            eventId,
            eventName: liveEvent.name,
            _count: { questions: survey.questions?.length ?? 0 },
          })),
        },
      } : {},
    }, body.action?.startsWith('CREATE_') || body.action === 'ADD_LISTENING_POINTS' ? 201 : 200)
  })

  await page.route('**/api/app/events/*/structure?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        items: [
          { id: 'area-ai-lounge', kind: 'AREA', name: 'AI Lounge', description: null, startsAt: '2026-09-17T13:00:00.000Z', endsAt: '2026-09-17T17:00:00.000Z', timezone: 'America/New_York' },
          { id: 'session-keynote', kind: 'SESSION', name: 'Opening Keynote', description: null, startsAt: '2026-09-17T14:00:00.000Z', endsAt: '2026-09-17T15:00:00.000Z', timezone: 'America/New_York' },
        ],
      },
    })
  })

  await page.route('**/api/app/events/*/survey-coverage?**', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, { success: true, data: { surveyId: route.request().postDataJSON().surveyId } })
      return
    }
    await fulfillJson(route, {
      success: true,
      data: {
        event: { id: events[0].id, name: events[0].name, eventType: events[0].eventType },
        sessions: agendaSessions.map((session) => ({ id: session.id, name: session.name, startsAt: session.startsAt, endsAt: session.endsAt, room: session.metadata.room, surveyIds: agendaListeningBySession.get(session.id)?.survey ? [agendaListeningBySession.get(session.id).survey.id] : [] })),
        speakers: agendaSpeakers.map((speaker) => ({ id: speaker.id, name: speaker.name, surveyIds: [] })),
        eventAreas: [{ id: 'area-ai-lounge', name: 'AI Lounge', surveyIds: [] }],
        surveyDeployments: surveyLibrary().map((survey) => ({
          id: survey.id,
          name: survey.name,
          status: survey.status,
          questionCount: survey.questions?.length ?? 0,
          responseCount: survey.responseCount ?? 0,
          deployment: { overallEvent: survey.target?.category === 'EVENT', sessionCount: survey.target?.category === 'SESSION' ? 1 : 0, speakerCount: survey.target?.category === 'SPEAKER' ? 1 : 0, eventAreaCount: survey.target?.category === 'LOCATION' ? 1 : 0, customCount: survey.target?.category === 'CUSTOM' ? 1 : 0, customName: survey.target?.category === 'CUSTOM' ? survey.target.name : null, customKey: null },
        })),
      },
    })
  })

  await page.route('**/api/app/events/*/advanced-survey-builder?**', async (route) => {
    if (route.request().method() === 'GET' && options.advancedSurveyLoadDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.advancedSurveyLoadDelayMs))
    }
    const surveyId = new URL(route.request().url()).searchParams.get('survey')
    const survey = surveyLibrary().find((item) => item.id === surveyId) ?? voiceSurvey
    await fulfillJson(route, { success: true, data: { survey: {
      ...survey,
      surveyTargetId: survey.target?.id ?? null,
      surveyTarget: survey.target ?? null,
      creationRequestId: '123e4567-e89b-42d3-a456-426614174000',
      presentationMode: 'ATTENDEE_CHOOSES',
      availabilityMode: 'OPEN_IMMEDIATELY',
      availabilityTimezone: 'America/New_York',
      availabilityOpensAt: null,
      availabilityClosesAt: null,
      availabilityOpenAnchor: null,
      availabilityCloseAnchor: null,
      availabilityOpenOffsetMinutes: null,
      availabilityCloseOffsetMinutes: null,
      availabilityOverride: null,
      publicSurveyLinks: [],
      review: { ready: true, issues: [] },
    } } })
  })

}

async function mockTokenKioskApis(page: Page, options: {
  responseMode?: 'VOICE_ONLY' | 'TEXT_ONLY'
  questions?: Array<Record<string, unknown>>
} = {}) {
  const responseMode = options.responseMode ?? 'TEXT_ONLY'
  const textSubmissions: Array<Record<string, unknown>> = []
  let completionAttempts = 0
  await page.route('**/api/kiosk/event-details?**', async (route) => {
    const url = new URL(route.request().url())
    await fulfillJson(route, {
      success: true,
      event: {
        id: eventId,
        name: 'SignalThread Live Experience Summit 2026',
        responseMode,
        accountType: 'EVENTS',
        surveyId: 'survey-event-wide',
        surveyTargetId: 'target-event-wide',
        publicSurveyLinkId: 'link-event-wide',
        surveyIntro: 'Tell us what is working in the Expo Hall and what needs attention.',
        targetContext: { category: 'LOCATION', name: 'Expo Hall', kind: 'AREA' },
        location: { googleReviewUrl: null },
        branding: {
          logoUrl: null,
          primaryColor: '#2563eb',
          primaryButtonColor: '#111827',
        },
        consent: {
          title: url.searchParams.has('token') ? 'Overall Event Pulse' : 'Event feedback',
          subtitle: 'Share what is happening onsite.',
          items: ['Answer one attendee question', 'Your feedback helps the live team respond'],
          buttonText: 'Start event survey',
        },
      },
    })
  })

  await page.route('**/api/response/create', async (route) => {
    const body = route.request().postDataJSON()
    await fulfillJson(route, {
      success: true,
      data: {
        responseId: body.token ? 'resp-token-1' : 'resp-legacy-1',
        eventId,
        surveyId: body.token ? 'survey-event-wide' : undefined,
        surveyTargetId: body.token ? 'target-event-wide' : undefined,
        publicSurveyLinkId: body.token ? 'link-event-wide' : undefined,
        responseMode,
        questions: options.questions ?? [
          {
            id: body.token ? 'survey-event-question' : 'legacy-event-question',
            questionId: body.token ? 'survey-event-question-id' : 'legacy-event-question',
            type: 'VOICE',
            text: body.token
              ? 'What should the event team improve while the event is still happening?'
              : 'What needs attention onsite?',
            order: 0,
            isRequired: true,
          },
        ],
      },
    })
  })

  await page.route('**/api/answer/text', async (route) => {
    textSubmissions.push(route.request().postDataJSON())
    await fulfillJson(route, {
      success: true,
      data: {
        answerId: 'answer-event-text-1',
        transcript: route.request().postDataJSON().text,
        analysis: {
          summary: 'Signage near the AI Lounge needs immediate attention.',
          sentiment: 'negative',
          sentimentScore: -0.6,
          themes: ['Wayfinding'],
          actionItems: ['Move AI Lounge signage'],
          keyQuote: 'AI Lounge signs are hidden',
        },
      },
    })
  })

  await page.route('**/api/response/resp-token-1/complete', async (route) => {
    completionAttempts += 1
    await fulfillJson(route, { success: true })
  })
  await page.route('**/api/response/resp-legacy-1/complete', async (route) => {
    await fulfillJson(route, { success: true })
  })

  await page.route('**/api/events/evt-event-live/responses/resp-token-1', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        answersTotal: 1,
        answers: [
          {
            status: 'COMPLETED',
            transcript: 'The AI Lounge signs are hidden behind a banner.',
            analysis: { summary: 'Signage near the AI Lounge needs immediate attention.', sentimentScore: -0.6 },
          },
        ],
      },
    })
  })

  await page.route('**/api/events/evt-event-live/responses/resp-legacy-1', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        answersTotal: 1,
        answers: [
          {
            status: 'COMPLETED',
            transcript: 'Registration needs more staff.',
            analysis: { summary: 'Registration needs more staff.', sentimentScore: -0.4 },
          },
        ],
      },
    })
  })

  return { textSubmissions, getCompletionAttempts: () => completionAttempts }
}

async function mockLegacyVoiceKioskApis(page: Page) {
  await installMockMediaRecorder(page)
  await page.route('**/api/kiosk/event-details?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      event: {
        id: eventId,
        name: 'SignalThread Live Experience Summit 2026',
        responseMode: 'VOICE_ONLY',
        accountType: 'EVENTS',
        location: { googleReviewUrl: null },
        branding: { logoUrl: null, primaryColor: '#2563eb', primaryButtonColor: '#111827' },
        consent: {
          title: 'Event feedback',
          subtitle: 'Share what is happening onsite.',
          items: ['Answer one attendee question'],
          buttonText: 'Start event survey',
        },
      },
    })
  })
  await page.route('**/api/response/create', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        responseId: 'resp-legacy-voice-1',
        eventId,
        responseMode: 'VOICE_ONLY',
        questions: [
          {
            id: 'legacy-event-question',
            questionId: 'legacy-event-question',
            type: 'VOICE',
            text: 'What needs attention onsite?',
            order: 0,
            isRequired: true,
            audioUrl: 'https://storage.example/event-question.mp3',
          },
        ],
      },
    })
  })
  await page.route('**/api/answer/presign', async (route) => {
    await fulfillJson(route, {
      success: true,
      url: 'https://storage.example/upload/event-audio.webm',
      key: 'answers/resp-legacy-voice-1/legacy-event-question.webm',
    })
  })
  await page.route('https://storage.example/**', async (route) => {
    await route.fulfill({ status: 200, body: '' })
  })
  await page.route('**/api/answer/complete', async (route) => {
    await fulfillJson(route, { success: true, exists: true, answerId: 'answer-legacy-voice-1', data: { answerId: 'answer-legacy-voice-1' } })
  })
  await page.route('**/api/answer/confirm', async (route) => {
    await fulfillJson(route, { success: true, data: { answerId: 'answer-legacy-voice-1' } })
  })
  await page.route('**/api/response/resp-legacy-voice-1/complete', async (route) => {
    await fulfillJson(route, { success: true })
  })
  await page.route('**/api/events/evt-event-live/responses/resp-legacy-voice-1', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        answersTotal: 1,
        answers: [
          {
            status: 'COMPLETED',
            transcript: 'Expo entrance needs clearer signs.',
            analysis: { summary: 'Expo entrance needs clearer signs.', sentimentScore: -0.5 },
          },
        ],
      },
    })
  })
}

async function mockMixedKioskApis(
  page: Page,
  options: { failFirstStructured?: boolean; failFirstCompletion?: boolean } = {},
) {
  await installMockMediaRecorder(page)
  const structuredSubmissions: Array<{ responseId: string; questionId: string; numericValue: number }> = []
  let structuredAttempts = 0
  let completionAttempts = 0

  await page.route('**/api/kiosk/event-details?**', async (route) => {
    await fulfillJson(route, {
      success: true,
      event: {
        id: eventId,
        name: 'SignalThread Live Experience Summit 2026',
        responseMode: 'VOICE_ONLY',
        accountType: 'EVENTS',
        location: { googleReviewUrl: null },
        branding: { logoUrl: null, primaryColor: '#2563eb', primaryButtonColor: '#111827' },
        consent: {
          title: 'Event pulse check',
          subtitle: 'Share quick feedback.',
          items: ['Answer three short questions'],
          buttonText: 'Start event survey',
        },
      },
    })
  })
  await page.route('**/api/response/create', async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        responseId: 'resp-mixed-1',
        eventId,
        surveyId: 'survey-mixed',
        surveyTargetId: 'target-mixed',
        publicSurveyLinkId: 'link-mixed',
        responseMode: 'VOICE_ONLY',
        questions: [
          { id: 'rating-key', questionId: 'rating-id', type: 'RATING_1_TO_5', text: 'How would you rate registration?', order: 0, isRequired: true },
          { id: 'voice-key', questionId: 'voice-id', type: 'VOICE', text: 'What should the event team know?', order: 1, isRequired: true, audioUrl: 'https://storage.example/question.mp3' },
          { id: 'recommend-key', questionId: 'recommend-id', type: 'RECOMMENDATION_0_TO_10', text: 'How likely are you to attend again?', order: 2, isRequired: false },
          { id: 'voice-followup-key', questionId: 'voice-followup-id', type: 'VOICE', text: 'What would make you more likely to return?', order: 3, isRequired: true, audioUrl: 'https://storage.example/question-followup.mp3' },
        ],
      },
    })
  })
  await page.route('**/api/answer/structured', async (route) => {
    const body = route.request().postDataJSON()
    structuredAttempts += 1
    if (options.failFirstStructured && structuredAttempts === 1) {
      await fulfillJson(route, { success: false, message: 'Temporary save failure' }, 503)
      return
    }
    structuredSubmissions.push(body)
    await fulfillJson(route, {
      success: true,
      data: { answerId: `answer-${body.questionId}`, ...body, status: 'COMPLETED', disposition: 'created' },
    })
  })
  await page.route('**/api/answer/presign', async (route) => {
    await fulfillJson(route, { success: true, url: 'https://storage.example/upload/mixed.webm', key: 'answers/mixed.webm' })
  })
  await page.route('https://storage.example/**', async (route) => {
    await route.fulfill({ status: 200, body: '', headers: { ETag: 'mixed-etag' } })
  })
  await page.route('**/api/answer/complete', async (route) => {
    const questionKey = route.request().postDataJSON().questionKey
    await fulfillJson(route, { success: true, exists: true, answerId: `answer-${questionKey}` })
  })
  await page.route('**/api/answer/confirm', async (route) => {
    await fulfillJson(route, { success: true, data: { answerId: 'answer-voice-id', status: 'UPLOADED' } })
  })
  await page.route('**/api/response/resp-mixed-1/complete', async (route) => {
    completionAttempts += 1
    if (options.failFirstCompletion && completionAttempts === 1) {
      await fulfillJson(route, { success: false, message: 'Temporary completion failure' }, 503)
      return
    }
    await fulfillJson(route, { success: true, data: { responseId: 'resp-mixed-1', status: 'COMPLETED' } })
  })
  await page.route('**/api/events/evt-event-live/responses/resp-mixed-1', async (route) => {
    await fulfillJson(route, { success: true, data: { answersTotal: 4, answers: [] } })
  })

  return structuredSubmissions
}

test.describe('Events voice journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('booth-audio-tour-enabled', 'false')
    })
  })

  test('reveals the shared intelligence action affordance on hover and keyboard focus without layout shift', async ({ page }) => {
    const preEvent = { ...liveEvent, startDate: new Date(Date.now() + 36 * 60 * 60_000).toISOString(), endDate: new Date(Date.now() + 60 * 60 * 60_000).toISOString() }
    await mockEventsAppApis(page, { events: [preEvent], analysisOverrides: { lifecyclePhase: 'PRE_EVENT', defaultLifecyclePhase: 'PRE_EVENT' } })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const item = page.getByTestId('event-actionable-item').filter({ hasText: 'Revisit agenda pacing' }).first()
    await expect(item).toBeVisible()
    const plus = item.getByRole('button', { name: 'Create action' })
    const [restItem, restPlus] = await Promise.all([item.boundingBox(), plus.boundingBox()])
    await expect(plus).toHaveCSS('opacity', '0')

    await item.hover()
    await expect(plus).toHaveCSS('opacity', '1')
    await plus.hover()
    await expect(plus).toHaveCSS('opacity', '1')
    expect(await item.boundingBox()).toEqual(restItem)
    expect(await plus.boundingBox()).toEqual(restPlus)

    await page.mouse.move(0, 0)
    await plus.focus()
    await expect(plus).toHaveCSS('opacity', '1')
    await plus.click()
    await expect(item.getByTestId('event-action-compact-composer')).toBeVisible()
    await expect(item).toHaveAttribute('data-action-composer-open', 'true')
    await item.getByRole('button', { name: 'Cancel' }).click()
    await expect(item.getByTestId('event-action-compact-composer')).toHaveCount(0)
  })

  test('uses the custom due date and time picker in the intelligence action composer', async ({ page }) => {
    const preEvent = { ...liveEvent, startDate: new Date(Date.now() + 36 * 60 * 60_000).toISOString(), endDate: new Date(Date.now() + 60 * 60 * 60_000).toISOString() }
    await mockEventsAppApis(page, { events: [preEvent], analysisOverrides: { lifecyclePhase: 'PRE_EVENT', defaultLifecyclePhase: 'PRE_EVENT' } })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const item = page.getByTestId('event-actionable-item').filter({ hasText: 'Revisit agenda pacing' }).first()
    await item.hover()
    await item.getByRole('button', { name: 'Create action' }).click()
    const composer = item.getByTestId('event-action-compact-composer')
    await composer.getByRole('button', { name: 'Date + time' }).click()

    const picker = page.getByRole('dialog', { name: 'Choose due date and time' })
    await expect(picker).toBeVisible()
    await expect(composer.locator('input[type="datetime-local"], input[type="date"], input[type="time"]')).toHaveCount(0)
    await picker.getByRole('gridcell').nth(5).click()
    await picker.getByRole('option', { name: '10:00 AM' }).click()
    await expect(picker).toHaveCount(0)

    const trigger = composer.getByRole('button', { name: /Due date and time: .*10:00 AM/ })
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(picker).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)

    await trigger.click()
    await expect(picker).toBeVisible()
    await composer.getByRole('textbox').first().click()
    await expect(picker).toHaveCount(0)

    await trigger.click()
    await picker.getByRole('button', { name: 'Clear due date' }).click()
    await expect(picker).toHaveCount(0)
    await expect(composer.getByRole('button', { name: /Due date and time: choose date, choose time/ })).toBeVisible()
  })

  test('renders the Events operating home without event-level kiosk/QR or SMB review language', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.goto(`/app?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Event overview' })).toContainText('Live now')
    await expect(page.getByText('Live Event Intelligence')).not.toBeVisible()
    await expect(page.getByText('Google Review')).not.toBeVisible()

    const eventsBrowser = page.getByTestId('events-home-browser')
    await expect(eventsBrowser.getByRole('link', { name: 'Open event' })).toBeVisible()
    await expect(eventsBrowser.getByRole('link', { name: 'Signals' })).toBeVisible()
    await expect(eventsBrowser.getByRole('link', { name: 'Surveys', exact: true })).toHaveCount(0)
    await expect(eventsBrowser.getByRole('button', { name: /Launch kiosk/ })).toHaveCount(0)
    await expect(eventsBrowser.getByRole('button', { name: 'QR code' })).toHaveCount(0)
  })

  test('renders every live event once in the Events browser and opens the second workspace', async ({ page }) => {
    await mockEventsAppApis(page, { events: [liveEvent, secondLiveEvent] })

    await page.goto(`/app?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()

    const allEventsBrowser = page.getByTestId('events-home-browser')
    const allEventEntries = page.getByTestId('events-home-event-entry')
    await expect(page.getByRole('region', { name: 'Event overview' })).toContainText('Live now')
    await expect(page.getByRole('region', { name: 'Event overview' })).toContainText('2')
    await expect(allEventsBrowser).toBeVisible()
    await expect(allEventEntries).toHaveCount(2)
    await expect(allEventsBrowser.getByText('Live Experience Summit 2026')).toBeVisible()
    await expect(allEventsBrowser.getByText('Partner Roadshow 2026')).toBeVisible()
    await expect(page.getByText('Live Experience Summit 2026')).toHaveCount(1)
    await expect(page.getByText('Partner Roadshow 2026')).toHaveCount(1)
    await expect(page.getByTestId('events-home-live-card')).toHaveCount(0)
    await expect(page.getByTestId('events-home-create-cta')).toHaveCount(0)
    await expect(allEventsBrowser.getByText('Create a new event')).toHaveCount(0)
    await expect(allEventsBrowser.getByRole('link', { name: 'Open event' })).toHaveCount(2)
    await expect(allEventsBrowser.getByRole('link', { name: 'Signals' })).toHaveCount(2)
    await expect(allEventsBrowser.getByRole('link', { name: 'Surveys', exact: true })).toHaveCount(0)
    await expect(allEventsBrowser.getByRole('button', { name: /Launch kiosk/ })).toHaveCount(0)
    await expect(allEventsBrowser.getByRole('button', { name: 'QR code' })).toHaveCount(0)

    await allEventsBrowser.getByPlaceholder('Search events').fill('Partner')
    await expect(allEventEntries).toHaveCount(1)
    await expect(allEventsBrowser.getByText('Partner Roadshow 2026')).toBeVisible()

    await allEventEntries.first().click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${secondLiveEvent.id}\\?account=${accountSlug}`))
    await expect(page.getByRole('heading', { name: secondLiveEvent.name })).toBeVisible()
  })

  test('keeps event intelligence, attention, setup status, and navigation within the desktop workspace viewport', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    const workspaceApiRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith(`/api/app/events/${eventId}`)) workspaceApiRequests.push(url.pathname)
    })

    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: liveEvent.name })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Setup overview' })).toBeVisible()
    await expect(page.getByText('Event readiness')).toBeVisible()
    await expect(page.getByText('Collection readiness', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Insights' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /Surveys/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Operations' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Deploy' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Event Areas/ })).toHaveCount(0)
    const workspaceNav = page.getByRole('navigation', { name: 'Event workspace' })
    await expect(workspaceNav.getByRole('link', { name: 'Events' })).toHaveAttribute('href', `/app?account=${accountSlug}`)
    await expect(workspaceNav.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page')
    await expect(workspaceNav.getByRole('link', { name: 'Signals' })).toHaveAttribute('href', `/app/events/${eventId}/dashboard?account=${accountSlug}`)
    await expect(workspaceNav.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', `/app/settings/profile?account=${accountSlug}&tab=event-settings&event=${eventId}`)
    await expect(page.getByRole('button', { name: 'Open Command Center' })).toHaveCount(0)
    await expect(page.getByText('View Dashboard')).toHaveCount(0)
    expect(workspaceApiRequests.filter((path) => path === `/api/app/events/${eventId}`).length).toBe(1)
    expect(workspaceApiRequests.filter((path) => path.endsWith('/voice-surveys')).length).toBe(1)
    expect(workspaceApiRequests.filter((path) => path.endsWith('/structure')).length).toBe(1)
    expect(workspaceApiRequests.filter((path) => path.endsWith('/agenda')).length).toBe(1)

    const operationsTab = page.getByRole('tab', { name: 'Operations' })
    const box = await operationsTab.boundingBox()
    expect(box?.y).toBeLessThan(1024)

    await operationsTab.click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}\\?account=${accountSlug}&tab=operations`))
    await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible()
    await expect(page.getByTestId('operations-section-sessions')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('operations-section-event-areas').click()
    await expect(page).toHaveURL(new RegExp(`tab=operations.*operationsSection=event-areas`))
    await expect(page.getByRole('heading', { name: 'Event Areas' })).toBeVisible()

    await page.getByTestId('operations-section-sessions').click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}\\?account=${accountSlug}&tab=operations`))
    await expect(page.getByTestId('operations-section-sessions')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Opening Keynote')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add session' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Import agenda' })).toBeVisible()
    expect(workspaceApiRequests.filter((path) => path.endsWith('/agenda')).length).toBe(3)

    await page.getByTestId('operations-section-speakers').click()
    await expect(page).toHaveURL(new RegExp(`tab=operations.*operationsView=speakers`))
    await expect(page.getByText('Jordan Lee')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('operations-section-speakers')).toHaveAttribute('aria-pressed', 'true')
    await page.goBack()
    await expect(page.getByTestId('operations-section-sessions')).toHaveAttribute('aria-pressed', 'true')

    await page.goBack()
    await expect(page.getByTestId('operations-section-event-areas')).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('tab', { name: 'Deploy' }).click()
    await expect(page.getByRole('heading', { name: 'Deployment', exact: true })).toBeVisible()
    await expect(page.getByTestId('event-deployment-workspace')).toBeVisible()
  })

  test('leaves the workspace loading state and retries a failed Setup bootstrap', async ({ page }) => {
    await mockEventsAppApis(page)
    let eventDetailAttempts = 0
    await page.route(`**/api/app/events/${eventId}?**`, async (route) => {
      eventDetailAttempts += 1
      if (eventDetailAttempts === 1) {
        await fulfillJson(route, { success: false, error: 'Temporary workspace failure' }, 503)
        return
      }
      await route.fallback()
    })

    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)
    await expect(page.getByText('Loading event workspace…')).not.toBeVisible()
    await expect(page.locator('[role="alert"]').filter({ hasText: 'Temporary workspace failure' })).toBeVisible()
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('heading', { name: 'Setup overview' })).toBeVisible()
    expect(eventDetailAttempts).toBe(2)
  })

  test('keeps the Setup workspace responsive when the saved theme is dark', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
    await mockEventsAppApis(page)
    const devtools = await page.context().newCDPSession(page)
    await devtools.send('Performance.enable')

    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Setup overview' })).toBeVisible()
    const before = await devtools.send('Performance.getMetrics')
    await page.waitForTimeout(500)
    const after = await devtools.send('Performance.getMetrics')
    const metric = (sample: typeof before, name: string) =>
      sample.metrics.find((entry) => entry.name === name)?.value ?? 0
    const taskDurationMs = (metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) * 1000

    expect(taskDurationMs).toBeLessThan(300)
    await page.goto(`/app?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Your events' })).toBeVisible()
    expect(await page.locator('html').evaluate((root) => root.classList.contains('dark'))).toBe(true)
  })

  test('preserves event context through desktop and mobile workspace navigation', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app?account=${accountSlug}`)

    await page.getByTestId('events-home-event-entry').click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}\\?account=${accountSlug}`))
    await page.getByRole('navigation', { name: 'Event workspace' }).getByRole('link', { name: 'Signals' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}/dashboard\\?account=${accountSlug}`))
    await expect(page.getByRole('heading', { name: liveEvent.name })).toBeVisible()
    await page.getByRole('navigation', { name: 'Event workspace' }).getByRole('link', { name: 'Setup' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}\\?account=${accountSlug}`))
    await expect(page.getByRole('heading', { name: 'Setup overview' })).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    const menuButton = page.getByRole('button', { name: 'Open event navigation' })
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    const mobileNavigation = page.getByRole('dialog', { name: 'Event navigation' })
    await expect(mobileNavigation.getByRole('link', { name: 'Events' })).toBeVisible()
    await expect(mobileNavigation.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page')
    await expect(mobileNavigation.getByRole('link', { name: 'Signals' })).toBeVisible()
    await expect(mobileNavigation.getByRole('link', { name: 'Settings' })).toBeVisible()
    await mobileNavigation.getByRole('button', { name: 'Close event navigation' }).click()
    await expect(menuButton).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Event navigation' })).toHaveCount(0)

    const overflow = await horizontalOverflowDiagnostics(page)
    expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
  })

  test('uploads, resumes, reviews, and atomically confirms an agenda import', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)

    await page.getByRole('button', { name: 'Import agenda' }).click()
    await expect(page.getByRole('heading', { name: 'Import agenda or speaker roster' })).toBeVisible()
    await page.getByRole('button', { name: 'Agenda / Sessions' }).click()
    await expect(page.getByText('Drop your file here')).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'summit-agenda.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Session Title,Date,Start,End,Room\nImported Workshop,2026-09-17,12:00 PM,1:00 PM,Room 202'),
    })

    await expect(page).toHaveURL(/agendaImport=agenda-import-1/)
    await expect(page.getByRole('heading', { name: 'Adjust interpretation' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Adjust interpretation' })).toBeVisible()
    await expect(page.getByLabel('Interpret Session Title as')).toHaveValue('title')
    await page.getByRole('button', { name: 'Review agenda' }).click()

    await expect(page.getByRole('heading', { name: 'Review agenda' })).toBeVisible()
    await expect(page.getByText('Imported Workshop')).toBeVisible()
    await expect(page.getByRole('button', { name: /Ready · 1/ })).toBeVisible()
    await page.setViewportSize({ width: 375, height: 812 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.getByRole('button', { name: 'Confirm agenda import' }).click()
    const liveImportDialog = page.getByRole('dialog', { name: 'Confirm schedule change?' })
    await expect(liveImportDialog).toBeVisible()
    await liveImportDialog.getByRole('button', { name: 'Import agenda' }).click()

    await expect(page.getByText('summit-agenda.csv is now in Sessions')).toBeVisible()
    await expect(page.getByText('Created sessions').locator('..').getByText('1')).toBeVisible()
    await page.getByRole('button', { name: 'Open imported Sessions' }).click()
    await expect(page.getByText('Imported Workshop')).toBeVisible()
    await expect(page.getByTestId('operations-section-sessions')).toHaveAttribute('aria-pressed', 'true')
  })

  test('selects an agenda session as a listening point and attaches a reusable survey', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)

    await expect(page.getByText('Opening Keynote')).toBeVisible()
    await page.getByRole('combobox', { name: 'Attach survey' }).click()
    await page.getByRole('option', { name: /Overall Event Pulse/ }).click()
    await expect(page.getByText('Overall Event Pulse · 0 responses')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('adds a session to an upcoming event without describing it as live', async ({ page }) => {
    await mockEventsAppApis(page, { agendaLifecyclePhase: 'PRE_EVENT' })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=agenda`)

    await page.getByRole('button', { name: 'Add session' }).click()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Upcoming agenda session')
    await page.getByLabel('Starts').fill('2099-09-17T11:00')
    await page.getByLabel('Ends').fill('2099-09-17T12:00')
    await page.getByRole('button', { name: 'Save session' }).click()

    await expect(page.getByRole('dialog', { name: 'Confirm schedule change?' })).toHaveCount(0)
    await expect(page.getByText('Upcoming agenda session')).toBeVisible()
  })

  test('warns before saving a session while the event is genuinely live', async ({ page }) => {
    await mockEventsAppApis(page, { agendaLifecyclePhase: 'IN_EVENT' })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=agenda`)

    await page.getByRole('button', { name: 'Add session' }).click()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Live agenda session')
    await page.getByLabel('Starts').fill('2026-09-17T11:00')
    await page.getByLabel('Ends').fill('2026-09-17T12:00')
    await page.getByRole('button', { name: 'Save session' }).click()

    const dialog = page.getByRole('dialog', { name: 'Confirm schedule change?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('This event is live. Saving updates the published schedule for attendees immediately.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Live agenda session')).toHaveCount(0)
  })

  test('manages canonical agenda sessions, speakers, and role assignments', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=agenda`)

    await page.getByRole('button', { name: 'Add session' }).click()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Applied AI Panel')
    await page.getByLabel('Description').fill('A practical operator panel.')
    await page.getByLabel('Starts').fill('2026-09-17T11:00')
    await page.getByLabel('Ends').fill('2026-09-17T12:00')
    await page.getByRole('textbox', { name: 'Room', exact: true }).fill('Room 204')
    await page.getByRole('textbox', { name: 'Track', exact: true }).fill('Applied AI')
    await page.getByRole('textbox', { name: 'Format', exact: true }).fill('Panel')
    await page.getByLabel('External / source ID').fill('AI-204')
    await page.getByLabel('Capacity').fill('250')
    await page.getByLabel('Tags (comma separated)').fill('AI, operators')
    await page.getByRole('button', { name: 'Save session' }).click()
    const liveScheduleDialog = page.getByRole('dialog', { name: 'Confirm schedule change?' })
    await expect(liveScheduleDialog).toBeVisible()
    await expect(liveScheduleDialog).toContainText('This event is live. Saving updates the published schedule for attendees immediately.')
    await liveScheduleDialog.getByRole('button', { name: 'Add session' }).click()
    await expect(page.getByText('Applied AI Panel')).toBeVisible()

    await page.getByRole('tab', { name: /Speakers/ }).click()
    await page.getByRole('button', { name: 'Add speaker' }).click()
    await page.getByLabel('Name').fill('Morgan Rivera')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('VP, Events')
    await page.getByLabel('Organization').fill('Northstar')
    await page.getByLabel('Email').fill('morgan@example.com')
    await page.getByLabel('Phone').fill('+1 212 555 0100')
    await page.getByLabel('Biography').fill('Event operations leader.')
    await page.getByRole('button', { name: 'Save speaker' }).click()
    await expect(page.getByText('Morgan Rivera')).toBeVisible()

    await page.getByRole('tab', { name: /Agenda/ }).click()
    await page.getByRole('button', { name: 'Applied AI Panel' }).click()
    await page.getByLabel('Speaker to assign').selectOption({ label: 'Morgan Rivera' })
    await page.getByLabel('Speaker role').selectOption('MODERATOR')
    await page.getByRole('button', { name: 'Assign' }).click()
    await expect(page.getByText(/Morgan Rivera.*moderator/)).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.getByRole('heading', { name: 'Session detail' })).toBeVisible()
    const overflow = await horizontalOverflowDiagnostics(page)
    expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
  })

  test('loads the Signals Overview for the production-equivalent events-demo admin context', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=events-demo`)

    await expect(page.getByText('Event overview', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What needs review' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What is working' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Coverage and confidence' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open follow-up' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Leadership brief' })).toHaveCount(0)
    const inEventOverview = page.getByTestId('event-overview')
    await expect(inEventOverview.getByText('Brief', { exact: true })).toBeVisible()
    await expect(inEventOverview.getByText('Capture the current event intelligence in a shareable brief.')).toBeVisible()
    await expect(inEventOverview.getByRole('button', { name: 'Generate brief' })).toBeVisible()
    await expect(page.locator('header').getByRole('button', { name: 'Generate brief' })).toHaveCount(0)
    await expect(page.getByText('Priority Mix')).toHaveCount(0)
    await expect(page.getByTestId('selected-issue-detail-panel')).toHaveCount(0)
    await expect(page.getByText('Event intelligence is unavailable right now.')).toHaveCount(0)
    await expect(page.getByText('Expo floor wayfinding is hiding partner destinations').first()).toBeVisible()
  })

  test('uses a URL-only lifecycle view override across Signals tabs and restores the date-driven view when removed', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const workspaceHeader = page.locator('header').first()
    const lifecycle = page.getByRole('navigation', { name: 'Lifecycle preview' })
    const eventTitle = workspaceHeader.getByRole('heading', { name: 'SignalThread Live Experience Summit 2026', exact: true })
    await expect(workspaceHeader.getByText('Live now', { exact: true })).toBeVisible()
    await expect(workspaceHeader.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
    await expect(workspaceHeader.getByText('Auto-refresh on', { exact: true })).toBeVisible()
    await expect(lifecycle.getByRole('link', { name: 'In-event', exact: true })).toHaveAttribute('aria-current', 'page')
    const [inEventHeader, inEventTitle, inEventLifecycle] = await Promise.all([workspaceHeader.boundingBox(), eventTitle.boundingBox(), lifecycle.boundingBox()])

    await lifecycle.getByRole('link', { name: 'Pre-event', exact: true }).click()
    await expect(page).toHaveURL(new RegExp('lifecycle=pre-event'))
    await expect(lifecycle.getByRole('link', { name: 'Pre-event', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(workspaceHeader.getByText('Live now', { exact: true })).toBeVisible()
    const [preEventHeader, preEventTitle, preEventLifecycle] = await Promise.all([workspaceHeader.boundingBox(), eventTitle.boundingBox(), lifecycle.boundingBox()])
    expect(preEventHeader?.height).toBe(inEventHeader?.height)
    expect(preEventTitle?.y).toBe(inEventTitle?.y)
    expect(preEventLifecycle?.x).toBe(inEventLifecycle?.x)

    await page.reload()
    await expect(lifecycle.getByRole('link', { name: 'Pre-event', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('navigation', { name: 'Event workspace' }).getByRole('link', { name: 'Signals' }))
      .toHaveAttribute('href', new RegExp('lifecycle=pre-event'))
    await expect(page.getByRole('navigation', { name: 'Signals views' }).getByRole('link')).toHaveCount(3)

    await lifecycle.getByRole('link', { name: 'In-event', exact: true }).click()
    await expect(page).not.toHaveURL(/lifecycle=/)
    await expect(lifecycle.getByRole('link', { name: 'In-event', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(workspaceHeader.getByText('Live now', { exact: true })).toBeVisible()
    for (const tab of ['Intelligence', 'Raw Responses', 'Actions']) {
      await expect(page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: tab, exact: true }))
        .not.toHaveAttribute('href', /lifecycle=/)
    }

    await lifecycle.getByRole('link', { name: 'Post-event', exact: true }).click()
    await expect(page).toHaveURL(new RegExp('lifecycle=post-event'))
    await expect(lifecycle.getByRole('link', { name: 'Post-event', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(workspaceHeader.getByText('Live now', { exact: true })).toBeVisible()
    await expect(workspaceHeader.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0)
    await expect(workspaceHeader.getByText('Auto-refresh on', { exact: true })).toHaveCount(0)
    const [postEventHeader, postEventTitle, postEventLifecycle] = await Promise.all([workspaceHeader.boundingBox(), eventTitle.boundingBox(), lifecycle.boundingBox()])
    expect(postEventHeader?.height).toBe(inEventHeader?.height)
    expect(postEventTitle?.y).toBe(inEventTitle?.y)
    expect(postEventLifecycle?.x).toBe(inEventLifecycle?.x)
    for (const tab of ['Intelligence', 'Raw Responses', 'Actions']) {
      await expect(page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: tab, exact: true }))
        .toHaveAttribute('href', new RegExp('lifecycle=post-event'))
    }

    await workspaceHeader.screenshot({ path: testInfo.outputPath('post-event-workspace-header.png') })

    await lifecycle.getByRole('link', { name: 'In-event', exact: true }).click()
    await expect(page).not.toHaveURL(/lifecycle=/)
    await expect(workspaceHeader.getByText('Live now', { exact: true })).toBeVisible()
    const [returnedInEventHeader, returnedInEventTitle, returnedInEventLifecycle] = await Promise.all([
      workspaceHeader.boundingBox(),
      eventTitle.boundingBox(),
      lifecycle.boundingBox(),
    ])
    expect(returnedInEventHeader?.height).toBe(inEventHeader?.height)
    expect(returnedInEventTitle?.y).toBe(inEventTitle?.y)
    expect(returnedInEventLifecycle?.x).toBe(inEventLifecycle?.x)

    await page.setViewportSize({ width: 1024, height: 900 })
    const overflow = await horizontalOverflowDiagnostics(page)
    expect(overflow.delta, JSON.stringify(overflow)).toBeLessThanOrEqual(1)
  })

  for (const fixture of [
    { name: 'upcoming', phase: 'PRE_EVENT', status: 'Upcoming', defaultView: 'Pre-event', overrideView: 'In-event' },
    { name: 'completed', phase: 'POST_EVENT', status: 'Wrapped', defaultView: 'Post-event', overrideView: 'In-event' },
  ] as const) {
    test(`uses the ${fixture.name} lifecycle as the Signals entry default without locking manual selection`, async ({ page }) => {
      await mockEventsAppApis(page, {
        analysisOverrides: { defaultLifecyclePhase: fixture.phase, lifecyclePhase: fixture.phase },
      })
      await page.goto(`/app/events/${eventId}?account=${accountSlug}`)

      await page.getByRole('navigation', { name: 'Event workspace' }).getByRole('link', { name: 'Signals' }).click()
      const workspaceHeader = page.locator('header').first()
      const lifecycle = page.getByRole('navigation', { name: 'Lifecycle preview' })
      await expect(lifecycle.getByRole('link', { name: fixture.defaultView, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(workspaceHeader.getByText(fixture.status, { exact: true })).toBeVisible()

      await lifecycle.getByRole('link', { name: fixture.overrideView, exact: true }).click()
      await expect(lifecycle.getByRole('link', { name: fixture.overrideView, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(workspaceHeader.getByText(fixture.status, { exact: true })).toBeVisible()

      await page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: 'Raw Responses', exact: true }).click()
      await expect(lifecycle.getByRole('link', { name: fixture.overrideView, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(workspaceHeader.getByText(fixture.status, { exact: true })).toBeVisible()
    })
  }

  test('keeps the Event shell mounted and account context stable across tab and lifecycle navigation', async ({ page }) => {
    const apiRequests: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('/api/')) apiRequests.push(url)
    })
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&lifecycle=in-event`)
    await expect(page.getByText('Event overview', { exact: true })).toBeVisible()

    await page.evaluate(() => {
      const shell = document.querySelector('[data-event-workspace-theme]')
      ;(window as typeof window & { __eventNavigationProbe?: Record<string, unknown> }).__eventNavigationProbe = {
        shell,
        timeOrigin: performance.timeOrigin,
        sawLoading: false,
      }
      const observer = new MutationObserver(() => {
        const probe = (window as typeof window & { __eventNavigationProbe?: { shell?: Element; sawLoading?: boolean } }).__eventNavigationProbe
        if (!probe) return
        if (document.body.textContent?.includes('Loading event workspace…')) probe.sawLoading = true
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      ;(window as typeof window & { __eventNavigationObserver?: MutationObserver }).__eventNavigationObserver = observer
    })
    apiRequests.length = 0

    const tabs = page.getByRole('navigation', { name: 'Signals views' })
    await tabs.getByRole('link', { name: 'Raw Responses', exact: true }).click()
    await expect(page.getByTestId('raw-responses-workspace')).toBeVisible()
    await tabs.getByRole('link', { name: 'Actions', exact: true }).click()
    await expect(page.getByTestId('signals-actions-workspace')).toBeVisible()

    const lifecycle = page.getByRole('navigation', { name: 'Lifecycle preview' })
    await lifecycle.getByRole('link', { name: 'Post-event', exact: true }).click()
    await expect(lifecycle.getByRole('link', { name: 'Post-event', exact: true })).toHaveAttribute('aria-current', 'page')
    await lifecycle.getByRole('link', { name: 'Pre-event', exact: true }).click()
    await expect(lifecycle.getByRole('link', { name: 'Pre-event', exact: true })).toHaveAttribute('aria-current', 'page')

    const lifecycleResult = await page.evaluate(() => {
      const probe = (window as typeof window & { __eventNavigationProbe?: { shell?: Element; timeOrigin?: number; sawLoading?: boolean } }).__eventNavigationProbe
      ;(window as typeof window & { __eventNavigationObserver?: MutationObserver }).__eventNavigationObserver?.disconnect()
      return {
        sameShell: probe?.shell === document.querySelector('[data-event-workspace-theme]'),
        sameDocument: probe?.timeOrigin === performance.timeOrigin,
        sawLoading: probe?.sawLoading,
      }
    })
    expect(lifecycleResult).toEqual({ sameShell: true, sameDocument: true, sawLoading: false })

    const count = (path: string) => apiRequests.filter((url) => new URL(url).pathname.endsWith(path)).length
    const requestCounts = {
      accountContext: count('/api/app/account'),
      rawResponses: count(`/api/app/events/${eventId}/raw-responses`),
      actions: count(`/api/app/events/${eventId}/actions`),
      analysis: count(`/api/app/events/${eventId}/analysis`),
      voiceSurveys: count(`/api/app/events/${eventId}/voice-surveys`),
      structure: count(`/api/app/events/${eventId}/structure`),
      intelligence: count(`/api/app/events/${eventId}/intelligence`),
    }
    expect({
      accountContext: requestCounts.accountContext,
      analysis: requestCounts.analysis,
      voiceSurveys: requestCounts.voiceSurveys,
      structure: requestCounts.structure,
      intelligence: requestCounts.intelligence,
    }).toEqual({
      accountContext: 0,
      analysis: 2,
      voiceSurveys: 0,
      structure: 0,
      intelligence: 0,
    })
    // Next development mode intentionally remounts a newly entered client tree once.
    // Production makes one list request; this bound keeps the shell regression test valid in both modes.
    expect(requestCounts.rawResponses).toBeGreaterThanOrEqual(1)
    expect(requestCounts.rawResponses).toBeLessThanOrEqual(2)
    expect(requestCounts.actions).toBeGreaterThanOrEqual(1)
    expect(requestCounts.actions).toBeLessThanOrEqual(2)
  })

  test('shows Setup-derived pre-event readiness without manufacturing findings before evidence', async ({ page }) => {
    await mockEventsAppApis(page, {
      analysisOverrides: {
        lifecyclePhase: 'PRE_EVENT',
        totalResponses: 0,
        completedResponses: 0,
        totalAnswers: 0,
        answersCaptured: 0,
        answersAnalyzed: 0,
        completedAnswers: 0,
        topThemes: null,
        topActionItems: null,
        preEventReadiness: {
          lifecyclePhase: 'PRE_EVENT',
          responseCount: 0,
          noEvidence: true,
          eventDates: { start: liveEvent.startDate, end: liveEvent.endDate },
          setup: { readyCount: 4, totalCount: 6, collectionReady: false },
          agenda: { sessionCount: 4, eventAreaCount: 15, status: 'READY', label: 'Ready', href: `/app/events/${eventId}?account=${accountSlug}&tab=agenda` },
          listeningPlan: { totalListeningPointCount: 14, agendaSessionCount: 4, selectedSessionCount: 3, readySessionCount: 2, missingSetupCount: 1, selectedCoverageLabel: '3 of 4 sessions selected for listening' },
          surveys: { totalCount: 5, readyCount: 4, notReadyCount: 1, scheduledCount: 1, href: `/app/events/${eventId}?account=${accountSlug}&tab=surveys` },
          deployment: { publicLinkCount: 4, qrReadyCount: 4, signageReadyCount: 4, href: `/app/events/${eventId}?account=${accountSlug}&tab=operations` },
          speakers: { assignmentCount: 7, selectedForListeningCount: 1, readyCount: 1, needsSetupCount: 0, href: `/app/events/${eventId}?account=${accountSlug}&tab=agenda&agendaView=speakers` },
          preEventSurveys: [],
          issues: [{
            id: 'session-session-review', kind: 'LISTENING', title: 'Sponsor Roundtable needs a survey',
            detail: 'This selected listening point is not ready to collect.', actionLabel: 'Open session',
            href: `/app/events/${eventId}?account=${accountSlug}&tab=agenda&agendaView=sessions&sessionId=session-review`,
          }],
        },
      },
    })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    await expect(page.getByText('Pre-event', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pre-event readiness' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What needs attention' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What is ready' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pre-event feedback' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Collect feedback before the event' })).toBeVisible()
    await expect(page.getByTestId('signals-overview-filter-bar')).toHaveCount(0)
    await expect(page.getByText('What needs review')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Signals views' }).getByRole('link')).toHaveCount(3)
    await expect(page.getByRole('link', { name: 'Open session' })).toHaveAttribute('href', `/app/events/${eventId}?account=${accountSlug}&tab=agenda&agendaView=sessions&sessionId=session-review`)
    await expect(page.getByRole('link', { name: 'Create pre-event survey' })).toHaveAttribute('href', `/app/events/${eventId}?account=${accountSlug}&tab=surveys`)
    await expect(page.getByText('4 sessions', { exact: true })).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    const overflow = await horizontalOverflowDiagnostics(page)
    expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
  })

  test('views and downloads the canonical post-event brief with team follow-through', async ({ page }, testInfo) => {
    const postEventBrief = postEventClosingBriefPayload()
    await mockEventsAppApis(page, {
      analysisOverrides: { lifecyclePhase: 'POST_EVENT', postEventClosingBrief: postEventBrief },
    })
    // The dedicated brief opens in a new tab. Page-level routes do not carry
    // to a popup, so provide the same canonical fixture at the browser-context
    // level for the standalone document request.
    await page.context().route('**/api/app/events/*/brief?**', async (route) => {
      if (new URL(route.request().url()).searchParams.get('format') === 'pdf') {
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          headers: { 'Content-Disposition': 'attachment; filename="signal-thread-live-experience-summit-2026-post-event-brief.pdf"' },
          body: '%PDF-1.4\n%%EOF',
        })
        return
      }
      await fulfillJson(route, {
        success: true,
        data: {
          eventId,
          eventName: 'SignalThread Live Experience Summit 2026',
          lifecyclePhase: 'POST_EVENT',
          brief: postEventBrief,
          briefHash: postEventBrief.versionId,
          eventStartDate: '2026-09-17T14:00:00.000Z',
          eventEndDate: '2026-09-19T18:00:00.000Z',
        },
      })
    })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    await expect(page.getByTestId('post-event-closing-brief')).toBeVisible()
    const postEventOverview = page.getByTestId('post-event-closing-brief').locator('[data-post-event-overview]')
    const postHero = postEventOverview.getByTestId('event-lifecycle-hero')
    await expect(postHero).toBeVisible()
    await expect(postHero.getByText('Event overview', { exact: true })).toBeVisible()
    await expect(postHero.getByTestId('event-lifecycle-synopsis')).toHaveText('Practical content led a positive event outcome with clear follow-through.')
    await expect(postHero.getByTestId('event-lifecycle-overview')).toContainText('Attendee feedback highlighted useful content while identifying wayfinding as the clearest issue to resolve.')
    await expect(postHero.getByText('42 collected', { exact: true })).toBeVisible()
    for (const label of ['Sentiment', 'Responses', 'Coverage', 'Follow-up']) await expect(postHero.getByText(label, { exact: true })).toBeVisible()
    const postCoverage = postHero.getByTestId('coverage-summary')
    await expect(postCoverage.getByText('3', { exact: true })).toBeVisible()
    await expect(postCoverage.getByText('of 4', { exact: true })).toBeVisible()
    await expect(postCoverage.getByText('listening points', { exact: true })).toBeVisible()
    await expect(postHero.getByRole('button', { name: 'View brief' })).toBeVisible()
    await expect(postHero.getByRole('button', { name: 'Regenerate brief' })).toHaveCount(0)
    await expect(postHero.getByRole('button', { name: 'Download PDF' })).toHaveCount(0)
    await expect(page.locator('header').getByRole('button', { name: 'Generate brief' })).toHaveCount(0)
    await postHero.screenshot({ path: testInfo.outputPath('post-event-overview.png') })
    await expect(page.getByRole('heading', { name: 'SignalThread Live Experience Summit 2026', exact: true })).toHaveCount(1)
    await expect(page.getByText('Close the event with evidenced outcomes, unresolved follow-through, and learning for the next event.')).toHaveCount(0)
    const closingBriefFont = await page.getByTestId('post-event-closing-brief').evaluate((element) => getComputedStyle(element).fontFamily)
    expect(closingBriefFont).toContain('Montserrat')
    await expect(page.getByRole('heading', { name: 'Practical content led a positive event outcome with clear follow-through.' })).toHaveCount(0)
    await expect(page.getByText('Closing brief · Sep 19, 2026')).toHaveCount(0)
    await expect(page.getByText('Protect the practical program and close the remaining wayfinding gap.')).toBeVisible()
    await expect(page.getByText(/Attendees consistently reported/)).toHaveCount(0)
    const verdictHeading = page.getByRole('heading', { name: 'The verdict' })
    await expect(verdictHeading).toBeVisible()
    await expect(verdictHeading).toHaveCSS('font-size', '24px')
    await expect(page.getByRole('heading', { name: 'Key findings' })).toBeVisible()
    await expect(page.getByText('Attendees repeatedly described mismatches between physical signs and the app, making navigation harder near the elevators.')).toBeVisible()
    await expect(page.getByTestId('post-event-closing-brief').getByRole('button', { name: 'Action created' }).first()).toHaveText('✓')
    await expect(page.getByRole('heading', { name: 'Decisions and follow-through' })).toHaveCount(0)
    await expect(page.getByText('What created friction')).toBeVisible()
    await expect(page.getByText('What should change next time')).toBeVisible()
    await expect(page.getByText('Leave more discussion time')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review evidence' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the Actions workspace' })).toHaveCount(0)
    await expect(page.getByTestId('signals-overview-filter-bar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Share with team' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View brief' })).toBeVisible()
    await expect(page.getByText('Coverage details')).toHaveCount(0)
    await expect(page.getByText('Send this to the team')).toHaveCount(0)
    const [briefPreview] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'View brief' }).click(),
    ])
    await expect(briefPreview.getByTestId('closing-brief-document')).toBeVisible()
    await expect(briefPreview).toHaveTitle('SignalThread Live Experience Summit 2026 — Post-event brief')
    await expect(briefPreview.getByRole('heading', { name: 'SignalThread Live Experience Summit 2026', exact: true })).toBeVisible()
    await expect(briefPreview.getByText('Event Intelligence Brief')).toBeVisible()
    await expect(briefPreview.getByText('Executive update')).toBeVisible()
    await expect(briefPreview.getByRole('heading', { name: 'What defined the event' })).toBeVisible()
    await expect(briefPreview.getByText('Send sponsor follow-up')).toBeVisible()
    await expect(briefPreview.getByText('Representative attendee feedback')).toHaveCount(0)
    await expect(briefPreview.getByRole('navigation')).toHaveCount(0)
    await expect(briefPreview.getByRole('button', { name: 'Review evidence' })).toHaveCount(0)
    await expect(briefPreview.getByText('Open Intelligence')).toHaveCount(0)
    await expect(briefPreview.getByRole('button', { name: 'Regenerate brief' })).toBeVisible()
    const documentFont = await briefPreview.getByTestId('closing-brief-document').evaluate((element) => getComputedStyle(element).fontFamily)
    expect(documentFont).toContain('Montserrat')
    await briefPreview.screenshot({ path: testInfo.outputPath('event-intelligence-brief-document.png'), fullPage: true })
    const downloadPromise = briefPreview.waitForEvent('download')
    await briefPreview.getByRole('button', { name: 'Download PDF' }).click()
    const downloadBrief = await downloadPromise
    expect(downloadBrief.suggestedFilename()).toBe('signal-thread-live-experience-summit-2026-post-event-brief.pdf')
    const regenerateResponse = briefPreview.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith(`/api/app/events/${eventId}/brief`)
        && url.searchParams.get('mode') === 'generate'
        && url.searchParams.get('regenerate') === '1'
    })
    await briefPreview.getByRole('button', { name: 'Regenerate brief' }).click()
    await regenerateResponse
    await expect(briefPreview.getByTestId('closing-brief-document')).toBeVisible()
    await briefPreview.close()
    await expect(postHero.getByRole('button', { name: 'Download PDF' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Supporting evidence' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Review evidence' }).first().click()
    await expect(page.getByTestId('event-evidence-drawer')).toBeVisible()
    await expect(page.getByTestId('event-evidence-drawer').getByText('4 mentions', { exact: true })).toBeVisible()
    await expect(page.getByTestId('event-evidence-drawer').getByTestId('event-theme-evidence-record')).toHaveCount(4)
    await expect(page.getByTestId('event-evidence-drawer').getByText('The far aisle near the partner booths is packed and the AI Lounge signs are hidden.')).toBeVisible()
    await page.getByTestId('event-evidence-drawer').getByRole('button', { name: 'Close', exact: true }).click()

    await page.setViewportSize({ width: 375, height: 812 })
    const overflow = await horizontalOverflowDiagnostics(page)
    expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
  })

  test('reveals the shared Post action affordance without moving the finding', async ({ page }) => {
    const postEventBrief = postEventClosingBriefPayload()
    postEventBrief.keyFindings[0] = {
      ...postEventBrief.keyFindings[0],
      id: 'issue:cluster-checkin',
      title: 'Registration queue needs another visible lane',
      statement: 'Check-in evidence indicates a recurring queue problem.',
      evidenceThemeKeys: ['access_checkin'],
      issueClusterIds: ['cluster-checkin'],
    }
    await mockEventsAppApis(page, {
      analysisOverrides: { lifecyclePhase: 'POST_EVENT', postEventClosingBrief: postEventBrief },
    })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const finding = page.locator('section[aria-labelledby="post-findings-heading"]').getByTestId('event-actionable-item').first()
    const createAction = finding.getByRole('button', { name: 'Create action' })
    const before = await finding.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
    await expect(createAction).toHaveCSS('opacity', '0')
    await finding.locator(':scope > div').first().hover()
    await expect(createAction).toHaveCSS('opacity', '1')
    const [reviewEvidenceBox, actionAffordanceBox] = await Promise.all([
      finding.getByRole('button', { name: 'Review evidence' }).boundingBox(),
      createAction.boundingBox(),
    ])
    expect(Math.abs(((reviewEvidenceBox?.y ?? 0) + (reviewEvidenceBox?.height ?? 0) / 2) - ((actionAffordanceBox?.y ?? 0) + (actionAffordanceBox?.height ?? 0) / 2))).toBeLessThanOrEqual(1)
    expect(await finding.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(before)
  })

  test('uses the shared action affordance for every populated Post verdict item', async ({ page }) => {
    const postEventBrief: any = postEventClosingBriefPayload()
    postEventBrief.decisions.nextEventLearning.actions = [{
      id: 'cluster-wayfinding',
      title: 'Move AI Lounge signage into view',
      classification: 'NEXT_EVENT_LEARNING',
      status: 'OPEN',
      priority: 'Soon',
      owner: 'Event Operator',
      ownerUserId: 'user-operator',
      dueAt: null,
      evidenceCount: 2,
      updateCount: 0,
    }]
    await mockEventsAppApis(page, {
      analysisOverrides: { lifecyclePhase: 'POST_EVENT', postEventClosingBrief: postEventBrief },
    })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const verdictCards = page.locator('[data-closing-brief-verdict-card]')
    const workedItem = verdictCards.nth(0).getByTestId('event-actionable-item').first()
    const frictionItem = verdictCards.nth(1).getByTestId('event-actionable-item').first()
    const nextActionItem = verdictCards.nth(2).getByTestId('event-actionable-item').first()
    const nextLearningItem = verdictCards.nth(2).getByTestId('event-actionable-item').nth(1)

    const workedBefore = await workedItem.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
    await expect(workedItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '0')
    await workedItem.hover()
    await expect(workedItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '1')
    expect(await workedItem.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(workedBefore)
    await workedItem.getByRole('button', { name: 'Create action' }).click()
    await expect(workedItem.getByTestId('event-action-compact-composer')).toBeVisible()

    await expect(frictionItem.getByRole('button', { name: 'Action created' })).toHaveText('✓')
    await expect(nextActionItem.getByRole('button', { name: 'Action created' })).toHaveText('✓')
    await nextActionItem.getByRole('button', { name: 'Action created' }).click()
    await expect(nextActionItem.getByTestId('event-action-compact-composer')).toHaveCount(0)
    await expect(nextLearningItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '0')
    await nextLearningItem.hover()
    await expect(nextLearningItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '1')
  })

  test('uses Intelligence as the canonical former Overview and opens canonical evidence', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=overview`)
    await expect(page).toHaveURL(/tab=intelligence/)

    await page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: 'Intelligence' }).click()
    await expect(page).toHaveURL(new RegExp(`tab=intelligence`))
    await expect(page.getByText('Event overview', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What needs review', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What is working', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Keep, improve, and revisit', exact: true })).toBeVisible()
    const scope = page.getByRole('navigation', { name: 'Intelligence scope' })
    await expect(scope.getByRole('link', { name: 'Event Areas' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('navigation', { name: 'Intelligence timeframe' })).toHaveCount(0)
    await expect(page.getByText('Evidence-backed themes')).not.toBeVisible()
    await expect(page.getByText('Cross-response opportunities')).not.toBeVisible()

    const intelligenceUrl = page.url()
    await page.getByRole('button', { name: 'Review evidence' }).first().click()
    const evidenceDrawer = page.getByTestId('event-evidence-drawer')
    await expect(evidenceDrawer).toBeVisible()
    await expect(evidenceDrawer.getByRole('dialog')).toContainText('Expo floor wayfinding')
    await expect(page).toHaveURL(intelligenceUrl)
    await page.keyboard.press('Escape')
    await expect(evidenceDrawer).toBeHidden()

    await scope.getByRole('link', { name: 'Sessions' }).click()
    await expect(page).toHaveURL(/intelligenceScope=sessions/)
    await expect(page.getByTestId('signals-sessions-workspace')).toBeVisible()
  })

  test('renders one specific finding when exact claims come from disjoint evidence pools', async ({ page }) => {
    const duplicateClaim = 'Attendees consistently reported that the location was perfect for a relaxed networking event.'
    await mockEventsAppApis(page, {
      intelligenceOverrides: {
        topThemes: [
          {
            themeKey: 'networking_and_expo', label: 'Networking and expo', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.9,
            statement: duplicateClaim, questionIntent: 'strength',
            supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'],
            supportingResponseIds: ['response_1', 'response_2', 'response_3'],
            supportingEvidenceIds: ['theme_1', 'theme_2', 'theme_3'],
            supportingTargetIds: ['target_1'],
          },
          {
            themeKey: 'networking', label: 'Networking', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8,
            statement: duplicateClaim, questionIntent: 'strength',
            supportingAnswerIds: ['answer_4', 'answer_5', 'answer_6'],
            supportingResponseIds: ['response_4', 'response_5', 'response_6'],
            supportingEvidenceIds: ['theme_4', 'theme_5', 'theme_6'],
            supportingTargetIds: ['target_2'],
          },
        ],
        topActions: [],
        attentionQueue: [],
        activeAttentionCount: 0,
      },
    })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&lifecycle=in-event`)

    await expect(page.getByRole('heading', { name: 'Networking and expo', exact: true })).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Networking', exact: true })).toHaveCount(0)
    await expect(page.getByText(duplicateClaim, { exact: true })).toHaveCount(1)
    await expect(page.getByText(/6 analyzed responses · 6 mentions/)).toBeVisible()
  })

  test('browses event-scoped raw answers and opens the full evidence drawer', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=raw-responses`)

    await expect(page.getByTestId('raw-responses-workspace')).toBeVisible()
    await expect(page.getByTestId('raw-responses-workspace').getByRole('heading', { name: 'Browse evidence', exact: true })).toBeVisible()
    await expect(page.getByText('The structured introductions led to useful peer conversations.')).toBeVisible()
    await page.getByText('The structured introductions led to useful peer conversations.').click()
    const drawer = page.getByTestId('raw-response-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('Full transcript')
    await expect(drawer).toContainText('The attendee valued structured introductions and peer conversations.')
    await expect(drawer).toContainText('Other answers from this response')
  })

  test('reviews canonical session coverage, evidence, and Setup context across desktop and mobile', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    await page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: 'Intelligence' }).click()
    await page.getByRole('navigation', { name: 'Intelligence scope' }).getByRole('link', { name: 'Sessions' }).click()
    await expect(page).toHaveURL(new RegExp('intelligenceScope=sessions'))
    const workspace = page.getByTestId('signals-sessions-workspace')
    await expect(workspace).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible()
    await expect(workspace.getByRole('button', { name: /All agenda sessions/ })).toContainText('4')
    await expect(workspace.getByRole('region', { name: 'Session survey coverage' })).toContainText('With responses')
    await expect(workspace.getByRole('region', { name: 'Session survey coverage' })).toContainText('Evidence represented')
    await expect(workspace.getByRole('region', { name: 'Session survey coverage' })).toContainText('of 3 session surveys')
    await expect(workspace.getByRole('button', { name: /Opening Keynote/ })).toContainText('Main stage')
    await expect(workspace.getByRole('button', { name: /Opening Keynote/ })).toContainText('Jordan Lee')

    const assertSessionRowRegionsDoNotOverlap = async () => {
      const row = workspace.getByTestId('session-intelligence-row').filter({ hasText: 'Closing Conversation' })
      const responseBox = await row.getByTestId('session-intelligence-row-response').boundingBox()
      const setupBox = await row.getByRole('link', { name: 'Set up survey' }).boundingBox()
      expect(responseBox).not.toBeNull()
      expect(setupBox).not.toBeNull()
      const overlapWidth = Math.max(0, Math.min(responseBox!.x + responseBox!.width, setupBox!.x + setupBox!.width) - Math.max(responseBox!.x, setupBox!.x))
      const overlapHeight = Math.max(0, Math.min(responseBox!.y + responseBox!.height, setupBox!.y + setupBox!.height) - Math.max(responseBox!.y, setupBox!.y))
      expect(overlapWidth * overlapHeight).toBe(0)
    }
    await assertSessionRowRegionsDoNotOverlap()
    await page.setViewportSize({ width: 520, height: 812 })
    await assertSessionRowRegionsDoNotOverlap()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    await page.setViewportSize({ width: 1440, height: 1024 })

    await workspace.getByRole('button', { name: /Opening Keynote/ }).click()
    const detail = page.getByTestId('session-intelligence-detail')
    await expect(detail).toContainText('Strong evidence')
    await expect(detail).toContainText('Overall Event Pulse')
    await expect(detail.getByRole('link', { name: 'Open in Setup' })).toBeVisible()
    await expect(detail.getByRole('link', { name: 'Open survey' })).toBeVisible()
    await detail.getByRole('button', { name: /Practical content/ }).click()
    const evidenceDrawer = page.getByTestId('event-evidence-drawer')
    await expect(evidenceDrawer).toBeVisible()
    await expect(evidenceDrawer).toContainText(/practical ideas we can use next week/)
    await evidenceDrawer.getByRole('button', { name: 'Close', exact: true }).click()
    await detail.getByRole('button', { name: 'Close', exact: true }).click()

    await workspace.getByRole('button', { name: /^Underrepresented/ }).first().click()
    await expect(page).toHaveURL(new RegExp('sessionView=underrepresented'))
    await expect(workspace.getByRole('button', { name: /Workshop Lab/ })).toBeVisible()
    await workspace.getByRole('button', { name: /Workshop Lab/ }).click()
    await expect(detail).toContainText('Not enough evidence yet')
    await expect(detail).toContainText('Findings use analyzed supporting responses; 2 of 2 eligible responses are analyzed.')
    await expect(detail.getByRole('button', { name: /Practical content/ })).toHaveCount(0)
    await detail.getByRole('button', { name: 'Close', exact: true }).click()

    await workspace.getByRole('button', { name: /^Needs survey/ }).first().click()
    await expect(page).toHaveURL(new RegExp('sessionView=not-selected'))
    await expect(workspace.getByRole('button', { name: /Closing Conversation/ })).toContainText('Needs survey')

    await workspace.getByRole('button', { name: /All agenda sessions/ }).click()
    await workspace.getByRole('button', { name: /Opening Keynote/ }).click()
    await page.getByTestId('session-intelligence-detail').getByRole('link', { name: 'Open in Setup' }).click()
    await expect(page).toHaveURL(new RegExp('tab=operations.*sessionId=session-keynote'))
    await expect(page.getByRole('heading', { name: 'Session detail' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Opening Keynote')

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=sessions&sessionId=session-keynote`)
    await expect(page.getByTestId('session-intelligence-detail')).toBeVisible()
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(horizontalOverflow).toBeLessThanOrEqual(1)
  })

  test('shows only explicitly scoped speaker evidence and deep-links to the canonical Setup profile', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    await page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: 'Intelligence' }).click()
    await page.getByRole('navigation', { name: 'Intelligence scope' }).getByRole('link', { name: 'Speakers' }).click()
    await expect(page).toHaveURL(new RegExp('intelligenceScope=speakers'))
    const workspace = page.getByTestId('signals-speakers-workspace')
    await expect(workspace).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Speakers', exact: true })).toBeVisible()
    await expect(workspace.getByText('Speaker-specific feedback shows where delivery is landing and where attendees need a clearer pace, emphasis, or audience fit.')).toBeVisible()
    await expect(workspace.getByRole('region', { name: 'Speaker-specific evidence coverage' })).toHaveCount(0)
    await workspace.getByText('Filters', { exact: true }).click()
    await workspace.getByRole('button', { name: /^Directional evidence/ }).click()
    await expect(page).toHaveURL(new RegExp('speakerView=directional'))
    await page.reload()
    await workspace.getByText('Filters', { exact: true }).click()
    await expect(workspace.getByRole('button', { name: /^Directional evidence/ })).toBeVisible()
    await expect(workspace.getByRole('button', { name: /Jordan Lee/ })).toContainText('1 session')
    await expect(workspace.getByRole('button', { name: /Jordan Lee/ })).toContainText('Speaker responses')
    await expect(workspace.getByRole('button', { name: /Jordan Lee/ }).getByTestId('speaker-intelligence-row-response')).toContainText('4')

    await workspace.getByRole('button', { name: /Jordan Lee/ }).click()
    const detail = page.getByTestId('speaker-intelligence-detail')
    await expect(detail).toContainText('Directional speaker evidence')
    await expect(detail).toContainText('91% evidence confidence')
    await detail.getByRole('button', { name: /Clear delivery/ }).click()
    const evidenceDrawer = page.getByTestId('event-evidence-drawer')
    await expect(evidenceDrawer).toBeVisible()
    await expect(evidenceDrawer).toContainText(/Jordan explained the product strategy clearly/)
    await evidenceDrawer.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(detail.getByRole('link', { name: 'Opening Keynote' })).toHaveAttribute('href', /tab=intelligence.*intelligenceScope=sessions.*sessionId=session-keynote/)

    await detail.getByRole('link', { name: 'Open in Setup' }).click()
    await expect(page).toHaveURL(new RegExp('tab=operations.*operationsView=speakers.*speakerId=speaker-keynote'))
    await expect(page.getByRole('heading', { name: 'Speaker detail' })).toBeVisible()
    await expect(page.getByLabel('Name')).toHaveValue('Jordan Lee')

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=speakers&speakerId=speaker-keynote`)
    await expect(page.getByTestId('speaker-intelligence-detail')).toBeVisible()
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(horizontalOverflow).toBeLessThanOrEqual(1)
  })

  test('manages canonical actions with URL-backed detail, history, and linked evidence on desktop and tablet', async ({ page }, testInfo) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    await page.getByRole('navigation', { name: 'Signals views' }).getByRole('link', { name: 'Actions' }).click()
    await expect(page).toHaveURL(new RegExp('tab=actions'))
    const workspace = page.getByTestId('signals-actions-workspace')
    await expect(workspace).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Action queue', exact: true })).toBeVisible()
    for (const viewLabel of ['Open', 'Unclaimed', 'Mine', 'After event', 'Complete']) {
      await expect(workspace.getByRole('navigation', { name: 'Action views' }).getByRole('button', { name: new RegExp(`^${viewLabel}`) })).toBeVisible()
    }

    await workspace.getByText('Filters', { exact: true }).click()
    for (const viewLabel of ['My actions', 'All actions', 'Working', 'Blocked', 'Next-event learning']) {
      await expect(workspace.getByRole('button', { name: viewLabel, exact: true })).toBeVisible()
    }
    await workspace.getByPlaceholder('Search actions, source findings, or owners').fill('AI Lounge')
    await workspace.getByText('Filters', { exact: true }).click()
    const actionRow = workspace.getByRole('button', { name: /Move AI Lounge signage into view/ })
    await expect(actionRow).toBeVisible()
    await actionRow.click()
    await expect(page).toHaveURL(new RegExp('tab=actions.*actionId=cluster-wayfinding'))
    const detail = page.getByTestId('action-detail')
    await expect(detail).toContainText('Source intelligence')
    await expect(detail).toContainText('wayfinding')
    await expect(detail.getByLabel('Owner')).toHaveValue('user-operator')
    await detail.getByLabel('Owner').selectOption('user-owner')
    await expect(actionRow).toBeVisible()
    await expect(detail.getByLabel('Owner')).toHaveValue('user-owner')
    await expect(detail.getByText('Email not sent', { exact: true })).toBeVisible()
    await expect(detail).toContainText('Temporary provider outage')
    await page.screenshot({ path: testInfo.outputPath('signals-actions-email-failed.png'), fullPage: true })
    await detail.getByRole('button', { name: 'Retry email' }).click()
    await expect(detail.getByText('Email sent', { exact: true })).toBeVisible()
    await expect(detail.getByRole('list', { name: 'Delivery attempts' })).toContainText('Attempt 2 · sent')

    await detail.getByLabel(/^Status/).selectOption('WORKING')
    await detail.getByRole('button', { name: 'Save status' }).click()
    await expect(detail.getByLabel(/^Status/)).toHaveValue('WORKING')
    await detail.getByPlaceholder('Type a short update…').fill('Facilities moved the sign above the aisle banner.')
    await detail.getByRole('button', { name: 'Send update' }).click()
    await expect(detail).toContainText('Facilities moved the sign above the aisle banner.')
    await expect(detail.getByText('Linked Evidence', { exact: true })).toBeVisible()
    await expect(detail.getByText(/far aisle near the partner booths/).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.screenshot({ path: testInfo.outputPath('signals-actions-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 768, height: 1024 })
    await page.reload()
    await expect(page.getByTestId('action-detail')).toBeVisible()
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(horizontalOverflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath('signals-actions-tablet.png'), fullPage: true })
  })

  test('uses the same canonical action for the mobile My Actions workflow and voice updates', async ({ page }, testInfo) => {
    await installMockMediaRecorder(page)
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=actions&actionView=my&actionId=cluster-wayfinding`)

    const workspace = page.getByTestId('signals-actions-workspace')
    const detail = page.getByTestId('action-detail')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('Move AI Lounge signage into view')
    await expect(detail.getByRole('button', { name: 'Mark blocked' })).toBeVisible()

    await detail.getByRole('button', { name: 'Mark blocked' }).click()
    await detail.getByPlaceholder('Explain what is blocking progress').fill('Waiting for the venue sign crew.')
    await detail.getByRole('button', { name: 'Save status' }).click()
    await expect(detail).toContainText('Blocked: Waiting for the venue sign crew.')
    await detail.getByRole('button', { name: 'Mark working' }).click()
    await detail.getByRole('button', { name: 'Save status' }).click()
    await expect(detail.getByLabel(/^Status/)).toHaveValue('WORKING')

    await detail.getByPlaceholder('Type a short update…').fill('The venue crew is now onsite.')
    await detail.getByRole('button', { name: 'Send update' }).click()
    await expect(detail).toContainText('The venue crew is now onsite.')

    await detail.getByRole('button', { name: 'Record a voice update' }).click()
    await expect(detail).toContainText('Recording. Tap Stop and save when finished.')
    await detail.getByRole('button', { name: 'Stop and save' }).click()
    await expect(detail).toContainText('Facilities moved the sign and reopened the aisle.')
    await expect(detail.getByText('Linked Evidence', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(horizontalOverflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath('signals-actions-mobile-detail.png'), fullPage: true })

    await detail.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(detail).toBeHidden()
    await expect(workspace.getByRole('navigation', { name: 'Action views' })).toBeVisible()
    const row = workspace.getByRole('button', { name: /Move AI Lounge signage into view/ })
    await expect(row).toContainText('Working')
    await expect(row).toContainText('Overdue')
  })

  test('deploys only ready Surveys with QR preview, bulk package, filters, and printable signage', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)

    const workspace = page.getByTestId('event-deployment-workspace')
    const appOrigin = new URL(page.url()).origin
    const row = workspace.getByTestId('deployment-survey-row')
    await expect(workspace).toBeVisible()
    await expect(workspace.getByText('Ready', { exact: true }).first()).toBeVisible()
    await expect(row).toContainText('Overall Event Pulse')
    await expect(row).toContainText('Overall Event Experience')
    await expect(row).toContainText('Accepting responses')
    await expect(row).toContainText('Always open')
    await expect(row.getByRole('link', { name: 'Open kiosk' })).toHaveAttribute('href', `/kiosk?token=${publicToken}`)
    const signage = workspace.getByTestId('signage-design')
    await expect(signage.getByRole('heading', { name: 'QR Design' })).toBeVisible()
    await workspace.getByRole('button', { name: 'QR Design', exact: true }).click()
    await expect(signage.getByRole('button', { name: 'Clean' })).toHaveAttribute('aria-pressed', 'true')
    await expect(signage.getByRole('button', { name: 'Bold' })).toBeVisible()
    await expect(signage.getByRole('button', { name: 'Minimal' })).toBeVisible()
    await expect(signage.getByLabel('Signage headline')).toHaveValue('Scan to share your feedback')
    await expect(signage.getByLabel('Signage supporting line')).toHaveValue('Takes about 60 seconds')
    await expect(signage.getByTestId('signage-preview-page')).toContainText('Overall Event Pulse')
    await expect(signage.getByTestId('signage-preview-page')).toContainText('This survey is open.')
    await expect(signage.getByTestId('signage-preview-page').locator('article').first()).toHaveAttribute(
      'data-qr-destination',
      `${appOrigin}/kiosk?token=${publicToken}`,
    )
    const previewSheet = signage.getByTestId('signage-preview-sheet')
    await signage.getByRole('button', { name: '1 / page' }).click()
    await expect(previewSheet).toHaveAttribute('data-sheet-columns', '1')
    await expect(previewSheet.getByTestId('signage-preview-card')).toHaveCount(1)
    await signage.getByRole('button', { name: '2 / page' }).click()
    await expect(previewSheet.getByTestId('signage-preview-card')).toHaveCount(2)
    await signage.getByRole('button', { name: '4 / page' }).click()
    await expect(previewSheet).toHaveAttribute('data-sheet-columns', '2')
    await expect(previewSheet.getByTestId('signage-preview-card')).toHaveCount(4)
    await signage.getByRole('button', { name: 'Bold' }).click()
    await expect(previewSheet.locator('article')).toHaveCount(4)
    await expect(previewSheet.locator('article').first()).toHaveAttribute('data-template-architecture', 'split')
    await signage.getByRole('button', { name: 'Clean' }).click()

    await row.getByRole('button', { name: 'View QR' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Survey QR Code' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Survey QR Code' })).toContainText(`/kiosk?token=${publicToken}`)
    await page.getByRole('dialog', { name: 'Survey QR Code' }).getByRole('button', { name: 'Close', exact: true }).click()

    const downloadPromise = page.waitForEvent('download')
    await workspace.getByRole('button', { name: 'QR package (1)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('signalthread-live-experience-summit-2026__qr-deployment.zip')

    const popupPromise = page.waitForEvent('popup')
    await workspace.getByRole('button', { name: 'Print signage' }).first().click()
    const popup = await popupPromise
    await popup.locator('.sign').first().waitFor()
    await expect(popup.getByText(liveEvent.name)).toBeVisible()
    await expect(popup.getByRole('heading', { name: 'Overall Event Pulse' })).toBeVisible()
    await expect(popup).toHaveTitle(`${liveEvent.name} survey signage`)
    await expect(popup).toHaveURL(`${appOrigin}/print/event-signage`)
    await expect(popup.locator('.sign')).toHaveAttribute(
      'data-qr-destination',
      `${appOrigin}/kiosk?token=${publicToken}`,
    )
    await expect(popup.locator('button, input, select, nav')).toHaveCount(0)
    await popup.close()

    await workspace.getByRole('button', { name: 'Ready', exact: true }).click()
    await workspace.getByRole('button', { name: 'All surveys', exact: true }).click()
    await workspace.getByLabel('Filter by Target', { exact: true }).selectOption('Overall Event Experience')
    await workspace.getByLabel('Filter by Target category').selectOption('EVENT')
    await expect(row).toHaveCount(1)
  })

  test('dismisses the Get QR pack menu by chevron, Escape, and outside click without changing selection gating', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=deploy`)

    const workspace = page.getByTestId('event-deployment-workspace')
    const toggle = workspace.getByRole('button', { name: 'Get QR pack options' })
    const menu = workspace.getByRole('menu', { name: 'Get QR pack options' })

    await toggle.click()
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /All ready surveys/ })).toBeEnabled()
    await expect(menu.getByRole('menuitem', { name: /Current selection/ })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: /Print-ready PDF/ })).toBeEnabled()

    await toggle.click()
    await expect(menu).toBeHidden()

    await toggle.click()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(toggle).toBeFocused()

    await toggle.click()
    await workspace.getByRole('button', { name: 'Ready', exact: true }).click()
    await expect(menu).toBeHidden()
    await expect(workspace.getByRole('button', { name: 'Ready', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await workspace.getByRole('button', { name: 'Select surveys' }).click()
    await workspace.getByLabel('Select Overall Event Pulse').check()
    await toggle.click()
    await expect(menu.getByRole('menuitem', { name: /Current selection/ })).toBeEnabled()
    await expect(menu.getByRole('menuitem', { name: /Current selection/ })).toContainText('1 selected')
  })

  test('keeps Deploy survey names readable and presents each Assets action once with copy feedback', async ({ page, context }) => {
    const longSurveyName = 'Opening Keynote Speaker Experience and Practical Session Outcomes Follow-up'
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await mockEventsAppApis(page, { voiceSurvey: { name: longSurveyName } })
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=deploy`)

    const workspace = page.getByTestId('event-deployment-workspace')
    const row = workspace.getByTestId('deployment-survey-row').filter({ hasText: longSurveyName })
    const surveyName = row.getByText(longSurveyName, { exact: true })
    await expect(surveyName).toBeVisible()
    expect((await surveyName.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(220)

    await row.getByRole('button', { name: 'Assets' }).click()
    let assets = page.getByRole('dialog', { name: `${longSurveyName} assets` })
    await expect(assets).toBeVisible()
    await expect(assets.getByRole('button', { name: 'Copy link', exact: true })).toHaveCount(1)
    await expect(assets.getByRole('link', { name: 'Open kiosk', exact: true })).toHaveCount(1)
    await expect(assets.getByRole('button', { name: 'View QR', exact: true })).toHaveCount(1)
    await expect(assets.getByRole('button', { name: 'Download QR PNG', exact: true })).toHaveCount(1)
    await expect(assets.getByRole('button', { name: 'Design signage', exact: true })).toHaveCount(1)
    await expect(assets.getByRole('button', { name: 'Print signage', exact: true })).toHaveCount(1)
    await expect(assets.getByRole('link', { name: 'Open kiosk' })).toHaveAttribute('href', `/kiosk?token=${publicToken}`)

    await assets.getByRole('button', { name: 'Copy link', exact: true }).click()
    await expect(assets.getByRole('status')).toHaveText('Link copied to clipboard.')

    await assets.getByRole('button', { name: 'View QR', exact: true }).click()
    const qrDialog = page.getByRole('dialog', { name: 'Survey QR Code' })
    await expect(qrDialog).toBeVisible()
    await qrDialog.getByRole('button', { name: 'Close', exact: true }).click()

    const downloadPromise = page.waitForEvent('download')
    await assets.getByRole('button', { name: 'Download QR PNG', exact: true }).click()
    expect((await downloadPromise).suggestedFilename()).toContain('opening-keynote-speaker-experience')

    await assets.getByRole('button', { name: 'Design signage', exact: true }).click()
    await expect(workspace.getByRole('heading', { name: 'Signage designer' })).toBeVisible()
    await workspace.getByRole('button', { name: 'Back to Deploy' }).click()

    await row.getByRole('button', { name: 'Assets' }).click()
    assets = page.getByRole('dialog', { name: `${longSurveyName} assets` })
    const popupPromise = page.waitForEvent('popup')
    await assets.getByRole('button', { name: 'Print signage', exact: true }).click()
    const popup = await popupPromise
    await popup.waitForURL(/\/print\/event-signage/)
    await popup.close()

    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=deploy`)
    await expect(page.getByText(longSurveyName, { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  })

  test('opens Signage designer on the first click after reload and confirms a persisted Apply', async ({ page }) => {
    await mockEventsAppApis(page, { signageRefreshDelayMs: 2_000 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=deploy`)
    await page.reload()

    const workspace = page.getByTestId('event-deployment-workspace')
    await workspace.getByRole('button', { name: 'Signage designer', exact: true }).click()
    await expect(workspace.getByRole('heading', { name: 'Signage designer', exact: true })).toBeVisible()

    await workspace.getByLabel('Signage headline').fill('Share your event perspective')
    const applyRequest = page.waitForRequest((request) =>
      request.url().includes(`/api/app/events/${eventId}/signage`) && request.method() === 'POST',
    )
    await workspace.getByRole('button', { name: 'Apply design', exact: true }).click()
    expect((await applyRequest).postDataJSON()).toMatchObject({
      surveyIds: ['survey-event-wide'],
      configuration: { headline: 'Share your event perspective' },
    })
    await workspace.getByTestId('signage-apply-notice').waitFor({ state: 'visible', timeout: 1_000 })
    await expect(workspace.getByTestId('signage-apply-notice')).toHaveText(
      'Design applied to 1 survey. Each QR keeps its own destination.',
    )

    await workspace.getByRole('button', { name: 'Back to Deploy' }).click()
    await expect(workspace.getByTestId('deployment-survey-row')).toContainText('Custom design')
    await page.reload()
    await workspace.getByRole('button', { name: 'Signage designer', exact: true }).click()
    await expect(workspace.getByRole('heading', { name: 'Signage designer', exact: true })).toBeVisible()
    await expect(workspace.getByLabel('Signage headline')).toHaveValue('Share your event perspective')
  })

  test('changes a dirty heavy signage layout from all to one without blocking or discarding it', async ({ page }) => {
    await mockEventsAppApis(page)
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=deploy`)

    const workspace = page.getByTestId('event-deployment-workspace')
    await workspace.getByRole('button', { name: 'Signage designer', exact: true }).click()
    const scope = workspace.getByRole('combobox', { name: 'Applying to' })
    await expect(scope).toHaveValue('all')

    await workspace.getByRole('button', { name: 'Landscape', exact: true }).click()
    await workspace.getByRole('button', { name: '4 / page', exact: true }).click()
    await workspace.getByLabel('Signage headline').fill('Keep this unsaved layout')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await scope.selectOption('one', { timeout: 1_000 })
      await expect(scope).toHaveValue('one')
      await scope.selectOption('all', { timeout: 1_000 })
      await expect(scope).toHaveValue('all')
    }

    await scope.selectOption('one', { timeout: 1_000 })
    await expect(scope).toHaveValue('one')
    await expect(workspace.getByRole('button', { name: 'Landscape', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(workspace.getByRole('button', { name: '4 / page', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(workspace.getByLabel('Signage headline')).toHaveValue('Keep this unsaved layout')
    expect(dialogs).toEqual([])
  })

  test('does not generate live signage for an unready Survey', async ({ page }) => {
    await mockEventsAppApis(page, {
      voiceSurvey: {
        status: 'DRAFT',
        readiness: { responseEligible: false, issues: ['Publish this Survey before deployment.'] },
      },
    })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)

    const workspace = page.getByTestId('event-deployment-workspace')
    const signage = workspace.getByTestId('signage-design')
    await workspace.getByRole('button', { name: 'QR Design', exact: true }).click()
    await expect(signage).toContainText('A ready Survey with an active public link is required')
    await expect(signage.getByLabel('Preview Survey')).toHaveCount(0)
    await expect(workspace.getByRole('button', { name: 'Print signage' })).toBeDisabled()
    await expect(workspace.getByRole('button', { name: 'QR package (0)' })).toBeDisabled()
    await expect(workspace.getByRole('link', { name: 'Open kiosk' })).toHaveCount(0)
  })

  test('uses a selected ready Survey and one shared configuration for preview and print', async ({ page }) => {
    const closingToken = 'closing-pulse-token'
    await mockEventsAppApis(page, {
      additionalVoiceSurveys: [{
        id: 'survey-closing-pulse',
        name: 'Closing Pulse',
        status: 'ACTIVE',
        isArchived: false,
        responseMode: 'VOICE_ONLY',
        responseCount: 0,
        availability: {
          state: 'OPEN',
          message: 'Open through 6:00 PM.',
          effectiveOpensAt: null,
          effectiveClosesAt: '2026-09-18T22:00:00.000Z',
        },
        readiness: { responseEligible: true, issues: [] },
        target: {
          id: 'target-closing',
          name: 'Closing Keynote',
          category: 'SESSION',
          description: null,
          eventStructureItemId: 'session-keynote',
        },
        questions: [{ id: 'question-closing', label: 'How was the closing keynote?', type: 'VOICE', order: 0, required: true }],
        publicLink: { id: 'link-closing', kioskPath: `/kiosk?token=${closingToken}`, isActive: true },
      }],
    })
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)

    const workspace = page.getByTestId('event-deployment-workspace')
    const appOrigin = new URL(page.url()).origin
    const signage = workspace.getByTestId('signage-design')
    await workspace.getByRole('button', { name: 'QR Design', exact: true }).click()
    const preview = signage.getByTestId('signage-preview-page')
    await signage.getByLabel('Preview Survey').selectOption('survey-closing-pulse')
    await expect(preview).toContainText('Closing Pulse')
    await expect(preview).toContainText('Closing Keynote')
    await expect(preview).toContainText('Open through 6:00 PM.')
    await expect(preview.locator('article')).toHaveAttribute(
      'data-qr-destination',
      `${appOrigin}/kiosk?token=${closingToken}`,
    )

    await signage.getByRole('button', { name: 'Minimal' }).click()
    await signage.getByLabel('Signage headline').fill('Share your closing feedback')
    await signage.getByLabel('Signage supporting line').fill('One quick minute')
    await signage.getByLabel('Show Survey Focus').uncheck()
    await signage.getByLabel('Show availability').uncheck()
    await signage.getByLabel('Show footer').uncheck()
    await signage.getByLabel('Signage cards per page').selectOption('1')
    await signage.getByLabel('Signage orientation').selectOption('landscape')

    await expect(preview).toHaveAttribute('data-preset', 'minimal')
    await expect(preview).toHaveAttribute('data-cards-per-page', '1')
    await expect(preview).toHaveAttribute('data-orientation', 'landscape')
    await expect(preview).toContainText('Share your closing feedback')
    await expect(preview).toContainText('One quick minute')
    await expect(preview).not.toContainText('Closing Keynote')
    await expect(preview).not.toContainText('Open through 6:00 PM.')
    await expect(preview).not.toContainText('Powered by SignalThread')

    const popupPromise = page.waitForEvent('popup')
    await workspace.getByRole('button', { name: 'Print signage' }).click()
    const popup = await popupPromise
    await popup.locator('.sign').first().waitFor()
    await expect(popup.getByText('Share your closing feedback').first()).toBeVisible()
    await expect(popup.getByText('One quick minute').first()).toBeVisible()
    await expect(popup.getByText('Closing Keynote')).toHaveCount(0)
    await expect(popup.getByText('Open through 6:00 PM.')).toHaveCount(0)
    expect(await popup.locator('.sign').first().getAttribute('class')).toContain('preset-minimal')
    await popup.close()
  })

  test('keeps every preset inside fixed print-page and square QR geometry', async ({ page }) => {
    await mockEventsAppApis(page, {
      additionalVoiceSurveys: [{
        id: 'survey-print-second',
        name: 'Session Experience Pulse',
        status: 'ACTIVE',
        isArchived: false,
        responseMode: 'VOICE_ONLY',
        responseCount: 0,
        availability: { state: 'OPEN', message: 'Open now.', effectiveOpensAt: null, effectiveClosesAt: null },
        readiness: { responseEligible: true, issues: [] },
        target: { id: 'target-print-second', name: 'Opening Keynote', category: 'SESSION', description: null, eventStructureItemId: 'session-keynote' },
        questions: [{ id: 'question-print-second', label: 'How was this session?', type: 'VOICE', order: 0, required: true }],
        publicLink: { id: 'link-print-second', kioskPath: '/kiosk?token=print-second-token', isActive: true },
      }],
    })
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)

    const workspace = page.getByTestId('event-deployment-workspace')
    const signage = workspace.getByTestId('signage-design')
    await workspace.getByRole('button', { name: 'QR Design', exact: true }).click()
    const cases = [
      { preset: 'Clean', cards: '1', orientation: 'portrait' },
      { preset: 'Bold', cards: '2', orientation: 'portrait' },
      { preset: 'Minimal', cards: '2', orientation: 'landscape' },
    ] as const

    for (const printCase of cases) {
      await signage.getByRole('button', { name: printCase.preset }).click()
      await signage.getByLabel('Signage cards per page').selectOption(printCase.cards)
      await signage.getByLabel('Signage orientation').selectOption(printCase.orientation)

      const popupPromise = page.waitForEvent('popup')
      await workspace.getByRole('button', { name: 'Print signage' }).click()
      const popup = await popupPromise
      await popup.locator('.sign').first().waitFor()
      await popup.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0))
      await popup.emulateMedia({ media: 'print' })

      const geometry = await popup.evaluate(() => {
        const pageElement = document.querySelector<HTMLElement>('.page')
        const card = document.querySelector<HTMLElement>('.sign')
        const qr = document.querySelector<HTMLImageElement>('.qr')
        const logo = document.querySelector<HTMLImageElement>('.logo')
        if (!pageElement || !card || !qr || !logo) throw new Error('Printable signage geometry is missing')
        const pageRect = pageElement.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        const qrRect = qr.getBoundingClientRect()
        return {
          page: { left: pageRect.left, top: pageRect.top, right: pageRect.right, bottom: pageRect.bottom },
          card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
          qr: { width: qrRect.width, height: qrRect.height },
          qrNaturalWidth: qr.naturalWidth,
          logoNaturalWidth: logo.naturalWidth,
          logoNaturalHeight: logo.naturalHeight,
          cardCount: document.querySelectorAll('.sign').length,
          bodyOverflow: document.body.scrollWidth > Math.ceil(pageRect.width),
        }
      })

      expect(geometry.card.left).toBeGreaterThanOrEqual(geometry.page.left)
      expect(geometry.card.top).toBeGreaterThanOrEqual(geometry.page.top)
      expect(geometry.card.right).toBeLessThanOrEqual(geometry.page.right + 1)
      expect(geometry.card.bottom).toBeLessThanOrEqual(geometry.page.bottom + 1)
      expect(Math.abs(geometry.qr.width - geometry.qr.height)).toBeLessThan(1)
      expect(geometry.qr.width).toBeGreaterThanOrEqual(200)
      expect(geometry.qrNaturalWidth).toBe(1024)
      expect(geometry.logoNaturalWidth).toBeGreaterThan(0)
      expect(geometry.logoNaturalHeight).toBeGreaterThan(0)
      expect(geometry.cardCount).toBe(2)
      expect(geometry.bodyOverflow).toBe(false)
      await popup.close()
    }
  })

  test('keeps the deployment workspace usable without horizontal overflow on tablet and mobile', async ({ page }) => {
    await mockEventsAppApis(page)

    for (const viewport of [{ width: 768, height: 1024 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport)
      await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)
      const workspace = page.getByTestId('event-deployment-workspace')
      await expect(workspace).toBeVisible()
      await expect(workspace.getByRole('button', { name: 'QR package (1)' })).toBeVisible()
      await expect(workspace.getByRole('button', { name: 'Print signage' })).toBeVisible()
      const rowActions = workspace.getByTestId('deployment-survey-row').getByTestId('survey-row-actions')
      await expect(rowActions.getByRole('link', { name: 'Open kiosk' })).toBeVisible()
      await expect(rowActions.getByRole('button', { name: 'Download PNG' })).toBeVisible()
      const overflow = rowActions.locator('summary[aria-label="More survey actions"]')
      await expect(overflow).toBeVisible()
      await overflow.click()
      await expect(rowActions.getByRole('button', { name: 'View QR' })).toBeVisible()
      await expect(rowActions.getByRole('button', { name: 'Copy link' })).toBeVisible()
      await expect(workspace.getByTestId('signage-design')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })

  test('renders Events profile settings without SMB locations or Google Review IA', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.route('**/api/app/locations?**', async (route) => {
      await fulfillJson(route, { success: false, error: 'Events profile should not load locations' }, 500)
    })

    await page.goto(`/app/settings/profile?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Profile Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Consent Screen' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Branding' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Organization' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Billing' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Consent Screen' })).toHaveAttribute('class', /bg-white/)
    await expect(page.getByText('Consent Screen').first()).toBeVisible()
    await expect(page.getByText('Locations/Teams')).toHaveCount(0)
    await expect(page.getByText('+ Add Location/Team')).toHaveCount(0)
    await expect(page.getByText('Google Review')).toHaveCount(0)
    await expect(page.getByText('Failed to load locations/teams')).toHaveCount(0)
    await expect(page.getByText('Events product mode')).toHaveCount(0)
    await expect(page.getByText('Back to Events')).toHaveCount(0)
  })

  test('keeps Events profile IA when settings returns Forbidden', async ({ page }) => {
    await mockEventsAppApis(page, { denySettings: true })

    await page.route('**/api/app/locations?**', async (route) => {
      await fulfillJson(route, { success: false, error: 'Events profile should not load locations' }, 500)
    })

    await page.goto(`/app/settings/profile?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Profile Settings' })).toBeVisible()
    await expect(page.getByText('Manage organization settings, consent, branding, and team users.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Consent Screen' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Branding' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Organization' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Billing' })).toHaveCount(0)
    await expect(page.getByText('Locations/Teams')).toHaveCount(0)
    await expect(page.getByText('+ Add Location/Team')).toHaveCount(0)
    await expect(page.getByText('Google Review')).toHaveCount(0)
    await expect(page.getByText('Events product mode')).toHaveCount(0)
    await expect(page.getByText('Back to Events')).toHaveCount(0)
  })

  test('creates an Events event container through the existing app event API', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.goto(`/app/events/new?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: 'Create a new event' })).toBeVisible()

    await page.getByPlaceholder('e.g. WEC San Antonio 2026').fill('Partner Roadshow 2027')
    await page.getByPlaceholder('e.g. Henry B. González Convention Center').fill('Moscone Center')
    await chooseEventDate(page, 'Start date', '2027-03-04')
    await chooseEventDate(page, 'End date', '2027-03-05')
    await page.getByRole('button', { name: /Conference/ }).click()

    const createRequest = page.waitForRequest((request) =>
      request.url().includes('/api/app/events?') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: /Create Event/ }).click()
    const body = (await createRequest).postDataJSON()
    expect(body).toMatchObject({
      name: 'Partner Roadshow 2027',
      locationId,
      venue: 'Moscone Center',
      startDate: '2027-03-04',
      endDate: '2027-03-05',
      template: 'conference',
    })
    await expect(page).toHaveURL(new RegExp(`/app/events/evt-created\\?account=${accountSlug}`))
  })

  test('reviews and creates selected template surveys as editable drafts', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/new?account=${accountSlug}`)

    await page.getByPlaceholder('e.g. WEC San Antonio 2026').fill('Partner Roadshow 2027')
    await page.getByRole('button', { name: /Conference/ }).click()
    await page.getByLabel('Survey Focus + recommended surveys').check()
    await expect(page.getByTestId('template-survey-review')).toBeVisible()
    await page.getByLabel('Survey name for Keynote Feedback').fill('Executive keynote pulse')
    await page.getByLabel('Include Session Feedback').uncheck()

    const createRequest = page.waitForRequest((request) =>
      request.url().includes('/api/app/events?') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: /Create Event/ }).click()
    const body = (await createRequest).postDataJSON()

    expect(body.templateSurveyRecommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'keynote-feedback', surveyName: 'Executive keynote pulse' }),
    ]))
    expect(body.templateSurveyRecommendations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'session-feedback' }),
    ]))
    await expect(page.getByTestId('event-creation-result')).toBeVisible()
    await expect(page.getByText('3', { exact: true })).toBeVisible()
    await expect(page.getByText('Recommended surveys remain draft and editable until you publish them.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review draft surveys' })).toBeVisible()
  })

  test('keeps recommended survey review usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockEventsAppApis(page)
    await page.goto(`/app/events/new?account=${accountSlug}`)

    await page.getByRole('button', { name: /Workshop/ }).click()
    await page.getByLabel('Survey Focus + recommended surveys').check()

    const review = page.getByTestId('template-survey-review')
    await expect(review).toBeVisible()
    await expect(page.getByLabel('Include Overall Workshop Experience')).toBeChecked()
    await expect(page.getByLabel('Survey name for Overall Workshop Experience')).toBeVisible()
    await expect(page.getByRole('button', { name: /Create Event/ })).toBeVisible()
  })

  test('renders the Surveys tab as a compact index without deployment or lifecycle controls', async ({ page }) => {
    const draftEvent = {
      ...liveEvent,
      id: 'evt-event-draft',
      name: 'SignalThread Draft Launchable Event',
      status: 'DRAFT',
      isActive: false,
    }
    await mockEventsAppApis(page, { events: [draftEvent] })

    await page.goto(`/app/events/${draftEvent.id}?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: draftEvent.name })).toBeVisible()
    await page.getByRole('tab', { name: /Surveys/ }).click()

    const surveyRow = page.getByTestId('event-voice-survey-row').filter({ hasText: 'Overall Event Pulse' })
    await expect(surveyRow).toBeVisible()
    // Healthy lifecycle state stays as group/meta text, not an invented green pill on the row.
    await expect(page.getByRole('region', { name: 'Live 1' })).toBeVisible()
    await expect(surveyRow.getByText('Live', { exact: true })).toHaveCount(0)
    await expect(surveyRow).toContainText('Overall Event Experience · 1 question')
    await expect(surveyRow).toContainText('2 responses')
    await expect(surveyRow.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(surveyRow.getByText(/Event:/)).toHaveCount(0)
    await expect(surveyRow.getByText('Launchable')).toHaveCount(0)
    // No deployment artifacts, question previews, or destructive controls in rows.
    await expect(surveyRow.getByRole('button', { name: 'QR code' })).toHaveCount(0)
    await expect(surveyRow.getByRole('link', { name: 'Launch Kiosk' })).toHaveCount(0)
    await expect(surveyRow.getByRole('button', { name: 'Publish survey' })).toHaveCount(0)
    await expect(surveyRow.getByRole('button', { name: 'Archive' })).toHaveCount(0)
    await expect(surveyRow.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    await expect(surveyRow.getByText('What should the event team improve')).toHaveCount(0)
    await expect(page.getByText('Public launch URL')).toHaveCount(0)

    await surveyRow.getByRole('button', { name: 'Edit' }).click()
    await expect(page).toHaveURL(
      new RegExp(`/app/events/${draftEvent.id}/edit\\?account=${accountSlug}&survey=survey-event-wide`),
    )
  })

  test('opens the Surveys table overflow above its clipped card and routes edits to the canonical editor', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=surveys`)

    const row = page.getByTestId('event-survey-table-row').filter({ hasText: 'Overall Event Pulse' })
    const editPath = `/app/events/${eventId}/edit?account=${accountSlug}&survey=survey-event-wide`
    await expect(row).toBeVisible()
    await expect(row.getByRole('link', { name: 'Overall Event Pulse' })).toHaveAttribute('href', editPath)
    await expect(row.getByRole('link', { name: 'Open kiosk' })).toHaveAttribute('href', `/kiosk?token=${publicToken}`)

    await row.getByRole('button', { name: 'More survey actions' }).click()
    const menu = page.getByTestId('event-row-action-overflow-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Edit survey' })).toHaveAttribute('href', editPath)
    await expect(menu.getByRole('button', { name: 'View QR' })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Copy link' })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Download PNG' })).toBeVisible()
    expect(await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight && element.parentElement === document.body
    })).toBe(true)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await row.getByRole('button', { name: 'More survey actions' }).click()
    await page.getByRole('heading', { name: 'Surveys' }).click()
    await expect(menu).toBeHidden()
    await row.getByRole('button', { name: 'More survey actions' }).click()
    await menu.getByRole('link', { name: 'Edit survey' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}/edit\\?account=${accountSlug}&survey=survey-event-wide`))

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=surveys`)
    const narrowRow = page.getByTestId('event-survey-table-row').filter({ hasText: 'Overall Event Pulse' })
    await expect(narrowRow.getByRole('link', { name: 'Open kiosk' })).toBeVisible()
    await narrowRow.getByRole('button', { name: 'More survey actions' }).click()
    await expect(page.getByTestId('event-row-action-overflow-menu').getByRole('button', { name: 'Copy link' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('keeps scheduled Surveys out of kiosk launch while retaining their edit path', async ({ page }) => {
    await mockEventsAppApis(page, {
      voiceSurvey: {
        availability: {
          state: 'NOT_YET_OPEN',
          message: 'This survey opens Jan 1, 2099, 9:00 AM.',
          effectiveOpensAt: '2099-01-01T14:00:00.000Z',
          effectiveClosesAt: null,
        },
        readiness: { responseEligible: false, issues: ['Survey is not yet open'] },
      },
    })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=surveys`)

    const row = page.getByTestId('event-survey-table-row').filter({ hasText: 'Overall Event Pulse' })
    await expect(row).toContainText('Scheduled')
    await expect(row.getByRole('link', { name: 'Open kiosk' })).toHaveCount(0)
    await row.getByRole('button', { name: 'More survey actions' }).click()
    await expect(page.getByTestId('event-row-action-overflow-menu').getByRole('link', { name: 'Edit survey' })).toHaveAttribute(
      'href',
      `/app/events/${eventId}/edit?account=${accountSlug}&survey=survey-event-wide`,
    )
  })

  test('creates a mixed survey on the dedicated New Survey route with existing Survey Focus', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: liveEvent.name })).toBeVisible()
    await page.getByRole('tab', { name: /Surveys/ }).click()
    await page.getByRole('button', { name: 'New Survey' }).last().click()

    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}/surveys/new\\?account=${accountSlug}`))
    await expect(page.getByRole('heading', { name: 'New Survey' })).toBeVisible()

    // Existing mode is the default and hides all Survey Focus editing fields.
    await expect(page.getByRole('radio', { name: 'Use existing Survey Focus' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('Survey Focus name')).toHaveCount(0)
    await expect(page.getByLabel('Survey Focus description')).toHaveCount(0)

    // The two Survey Focus modes are mutually exclusive.
    await page.getByRole('radio', { name: 'Create new Survey Focus' }).click()
    await expect(page.getByLabel('Survey Focus name')).toBeVisible()
    await expect(page.getByLabel('Attach to Survey Focus')).toHaveCount(0)
    await expect(page.getByLabel('Survey Focus description')).toHaveCount(0)
    await page.getByRole('radio', { name: 'Use existing Survey Focus' }).click()

    await page.getByLabel('Attach to Survey Focus').selectOption('area-ai-lounge')
    await expect(page.getByText('managed in Survey Focus')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    // Survey description stays behind Advanced details.
    await expect(page.getByLabel('Survey description')).toHaveCount(0)
    await page.getByLabel('Survey name').fill('AI Lounge Pulse')
    await page.getByRole('button', { name: 'Add question' }).click()
    await page.getByRole('menuitem', { name: /1–5 rating/ }).click()
    await page.getByPlaceholder('Enter question text...').fill('How was the AI Lounge?')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Add question' }).click()
    await page.getByRole('menuitem', { name: /Voice response/ }).click()
    await page.getByPlaceholder('Enter question text...').fill('What should we improve?')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Add question' }).click()
    await page.getByRole('menuitem', { name: /0–10 recommendation/ }).click()
    await page.getByPlaceholder('Enter question text...').fill('Would you return next year?')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()

    // Voice configuration is collapsed behind Change voice.
    await expect(page.getByRole('button', { name: 'Change voice' })).toBeVisible()
    await expect(page.getByLabel('Voice', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Gender')).toHaveCount(0)

    const createRequest = page.waitForRequest((request) =>
      request.url().includes(`/api/app/events/${eventId}/voice-surveys`) && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Create Survey' }).click()
    const body = (await createRequest).postDataJSON()
    expect(body).toMatchObject({
      eventStructureItemId: 'area-ai-lounge',
      surveyName: 'AI Lounge Pulse',
      questions: [
        { prompt: 'How was the AI Lounge?', type: 'RATING_1_TO_5', displayOrder: 0, required: true },
        { prompt: 'What should we improve?', type: 'VOICE', displayOrder: 1, required: true },
        { prompt: 'Would you return next year?', type: 'RECOMMENDATION_0_TO_10', displayOrder: 2, required: true },
      ],
    })
    expect(body.targetName).toBeUndefined()
    expect(body.targetCategory).toBeUndefined()
    await expect(page).toHaveURL(
      new RegExp(`/app/events/${eventId}/edit\\?account=${accountSlug}&survey=survey-created`),
    )
    await expect(page.getByRole('heading', { name: 'AI Lounge Pulse' })).toBeVisible()
    const rows = page.getByTestId('survey-question-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).getByLabel('Question 1 type')).toHaveValue('RATING_1_TO_5')
    await expect(rows.nth(1).getByLabel('Question 2 type')).toHaveValue('VOICE')
    await expect(rows.nth(2).getByLabel('Question 3 type')).toHaveValue('RECOMMENDATION_0_TO_10')

    await rows.nth(1).getByTitle('Edit question').click()
    await rows.nth(1).getByPlaceholder('Enter question text...').fill('What should improve before tomorrow?')
    await rows.nth(1).getByRole('button', { name: 'Save' }).click()
    await rows.nth(2).getByRole('checkbox').uncheck()
    const updateRequest = page.waitForRequest((request) =>
      request.url().includes(`/api/app/events/${eventId}/voice-surveys`) && request.method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save Content' }).click()
    await updateRequest
    await page.reload()

    await expect(page.getByText('What should improve before tomorrow?')).toBeVisible()
    await expect(page.getByTestId('survey-question-row').nth(2).getByRole('checkbox')).not.toBeChecked()
    await expect(page.getByTestId('survey-question-row').nth(2).getByLabel('Question 3 type')).toHaveValue('RECOMMENDATION_0_TO_10')
  })

  test('keeps the mixed question chooser usable without horizontal overflow across target viewports', async ({ page }) => {
    await mockEventsAppApis(page)

    for (const viewport of [
      { width: 1440, height: 1024 },
      { width: 1024, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(`/app/events/${eventId}/surveys/new?account=${accountSlug}`)
      await page.getByLabel('Attach to Survey Focus').selectOption('area-ai-lounge')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Add question' }).click()

      await expect(page.getByRole('menuitem', { name: /Voice response/ })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /1–5 rating/ })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /0–10 recommendation/ })).toBeVisible()
      await page.getByRole('menuitem', { name: /1–5 rating/ }).click()
      await page.getByPlaceholder('Enter question text...').fill('Rate this event area')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByLabel('Question 1 type')).toHaveValue('RATING_1_TO_5')
      await expect(page.getByText('Range 1–5')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.getByLabel('Survey name').fill('Responsive survey')
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('button', { name: 'Change voice' })).toBeVisible()
      await expect(page.getByLabel('Gender')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })

  test('reopens and saves an existing voice-only survey without changing its type', async ({ page }) => {
    await mockEventsAppApis(page, {
      voiceSurvey: { status: 'DRAFT', responseCount: 0, publicLink: { isActive: false } },
    })

    await page.goto(`/app/events/${eventId}/edit?account=${accountSlug}&survey=survey-event-wide`)
    const row = page.getByTestId('survey-question-row')
    await expect(row).toHaveCount(1)
    await expect(row.getByLabel('Question 1 type')).toHaveValue('VOICE')
    await row.getByTitle('Edit question').click()
    await row.getByPlaceholder('Enter question text...').fill('What needs attention before the next session?')
    await row.getByRole('button', { name: 'Save' }).click()

    const updateRequest = page.waitForRequest((request) =>
      request.url().includes(`/api/app/events/${eventId}/voice-surveys`) && request.method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save Content' }).click()
    const updateBody = (await updateRequest).postDataJSON()
    expect(updateBody.questions).toEqual([
      expect.objectContaining({ type: 'VOICE', order: 0, required: true }),
    ])

    await page.reload()
    await expect(page.getByText('What needs attention before the next session?')).toBeVisible()
    await expect(page.getByTestId('survey-question-row').getByLabel('Question 1 type')).toHaveValue('VOICE')
    await page.getByRole('tab', { name: 'Voice' }).click()
    await expect(page.getByRole('button', { name: 'Change voice' })).toBeVisible()
  })

  test('publishes, unpublishes, and deletes a no-response Events voice survey from Survey detail', async ({ page }) => {
    await mockEventsAppApis(page, {
      voiceSurvey: {
        status: 'DRAFT',
        responseCount: 0,
        publicLink: {
          isActive: false,
        },
      },
    })

    await page.goto(`/app/events/${eventId}/edit?account=${accountSlug}&survey=survey-event-wide`)
    await expect(page.getByRole('heading', { name: 'Overall Event Pulse' })).toBeVisible()
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Launch Kiosk' })).toHaveCount(0)

    // Draft primary action publishes and activates the existing public link.
    await page.getByRole('button', { name: 'Publish Survey' }).first().click()
    await expect(page.getByRole('link', { name: 'Launch Kiosk' })).toBeVisible()
    await expect(page.getByText('Live', { exact: true })).toBeVisible()

    // Deployment owns QR, copy, and download for the active survey.
    await page.getByRole('tab', { name: 'Deployment' }).click()
    await expect(page.getByText('Survey QR code')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy Link' })).toBeVisible()

    // Unpublish returns the survey to draft and disables launch.
    await page.getByRole('tab', { name: 'Lifecycle' }).click()
    await page.getByRole('button', { name: 'Unpublish to Draft' }).click()
    await expect(page.getByRole('button', { name: 'Publish Survey' }).first()).toBeVisible()
    await page.getByRole('tab', { name: 'Deployment' }).click()
    await expect(page.getByText('Draft — not launchable.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Launch Kiosk' })).toHaveCount(0)

    // Deletion stays in the Danger Zone behind explicit confirmation.
    await page.getByRole('tab', { name: 'Lifecycle' }).click()
    await page.getByRole('button', { name: 'Delete Survey', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Delete survey?' })).toBeVisible()
    await expect(page.getByText('Archive is different')).toBeVisible()
    await page.getByRole('button', { name: 'Delete survey', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}\\?account=${accountSlug}&tab=surveys`))
    await expect(page.getByText('No surveys in this Event yet.')).toBeVisible()
  })

  test('saves Events survey availability and withholds launch before the custom window', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/edit?account=${accountSlug}&survey=survey-event-wide`)
    await page.getByRole('tab', { name: 'Deployment' }).click()

    await page.getByLabel(/Choose exact dates & times/).check()
    const availability = page.getByTestId('survey-availability-editor')
    await availability.getByLabel('Starts').fill('2099-01-01T09:00')
    await availability.getByLabel('Ends').fill('2099-01-01T11:00')

    const updateRequest = page.waitForRequest((request) =>
      request.url().includes(`/api/app/events/${eventId}/voice-surveys`) && request.method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save deployment' }).click()
    const body = (await updateRequest).postDataJSON()

    expect(body.availability).toMatchObject({
      mode: 'CUSTOM_WINDOW',
      timezone: expect.any(String),
    })
    expect(new Date(body.availability.opensAt).getTime()).toBeLessThan(new Date(body.availability.closesAt).getTime())
    await expect(page.getByText('Published — not yet open.')).toBeVisible()
    await expect(page.getByTestId('survey-readiness-issues')).toContainText('Survey is not yet open')
    await expect(page.getByRole('link', { name: 'Launch Kiosk' })).toHaveCount(0)
  })

  test('offers bounded Survey Focus-relative timing during Events survey creation on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/surveys/new?account=${accountSlug}&area=session-keynote`)

    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel(/Schedule around this survey/).check()
    const availability = page.getByTestId('survey-availability-editor')
    await availability.getByLabel('Starts amount').fill('10')
    await availability.getByLabel('Starts unit').selectOption('minutes')
    await availability.getByLabel('Starts relation').selectOption('before')
    await availability.getByLabel('Starts anchor').selectOption('END')
    await expect(availability.getByLabel('Starts amount')).toHaveValue('10')
    await expect(availability.getByLabel('Starts anchor')).toHaveValue('END')
    await expect(availability.getByLabel('Ends amount')).toHaveValue('2')
    await expect(availability.getByLabel('Ends unit')).toHaveValue('hours')
    await expect(availability.getByLabel('Ends relation')).toHaveValue('after')
    await expect(availability.getByLabel('Ends anchor')).toHaveValue('END')
  })

  test('archives and restores an Events voice survey from Survey detail', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.goto(`/app/events/${eventId}/edit?account=${accountSlug}&survey=survey-event-wide`)
    await expect(page.getByRole('heading', { name: 'Overall Event Pulse' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Launch Kiosk' })).toBeVisible()

    await page.getByRole('tab', { name: 'Lifecycle' }).click()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Restore to Draft' }).first()).toBeVisible()
    await expect(page.getByText('Archived', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Deployment' }).click()
    await expect(page.getByText('Archived — launch disabled.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Launch Kiosk' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Lifecycle' }).click()
    await page.getByRole('button', { name: 'Restore to Draft' }).last().click()
    await expect(page.getByRole('button', { name: 'Publish Survey' }).first()).toBeVisible()
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  })

  test('preserves the selected Survey Focus when attaching a survey from Survey Focus', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)
    await expect(page.getByRole('heading', { name: liveEvent.name })).toBeVisible()
    await page.getByRole('tab', { name: /Event Areas/ }).click()

    await page.getByRole('button', { name: /Sessions 1/ }).click()
    await page.getByRole('button', { name: 'Attach survey' }).first().click()

    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}/surveys/new\\?account=${accountSlug}&area=`))
    await expect(page.getByRole('radio', { name: 'Use existing Survey Focus' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('managed in Survey Focus')).toBeVisible()
  })

  test('replaces a session survey from Operations and preserves the current picker state after reload', async ({ page }) => {
    await mockEventsAppApis(page, {
      voiceSurvey: { id: 'survey_a', name: 'Survey A', status: 'DRAFT', target: null, surveyTargetId: null, publicLink: { isActive: false } },
      additionalVoiceSurveys: [{ id: 'survey_b', name: 'Survey B', status: 'DRAFT', target: null, surveyTargetId: null, responseMode: 'VOICE_AND_TEXT', questions: [], publicLink: null, readiness: { responseEligible: false, issues: ['Survey is unpublished'] } }],
    })

    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)
    await page.getByRole('tab', { name: 'Operations' }).click()
    await expect(page.getByText('Opening Keynote')).toBeVisible()

    await page.getByRole('combobox', { name: 'Choose a survey' }).click()
    await page.getByRole('option', { name: /Survey A/ }).click()
    await expect(page.getByText('Survey assigned')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' })).toContainText('Survey A')

    await page.getByRole('combobox', { name: 'Choose a survey' }).click()
    await page.getByRole('option', { name: /Survey B/ }).click()
    await expect(page.getByText('Survey changed')).toBeVisible()
    await expect(page.getByText('Survey already assigned')).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Choose a survey' })).toContainText('Survey B')

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' })).toContainText('Survey B')
    await page.getByRole('combobox', { name: 'Choose a survey' }).click()
    await expect(page.getByRole('option', { name: /Survey B/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('keeps Event Area creation in the shared Operations action position', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}?account=${accountSlug}`)

    await page.getByRole('tab', { name: 'Operations' }).click()
    await expect(page.getByRole('button', { name: 'Add session' })).toBeVisible()
    await page.getByTestId('operations-section-speakers').click()
    await expect(page.getByRole('button', { name: 'Add from speaker library' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import speakers' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add speaker' })).toBeVisible()

    await page.getByTestId('operations-section-event-areas').click()
    const addArea = page.getByRole('button', { name: 'Add Event Area' })
    await expect(addArea).toBeVisible()
    await expect(page.getByTestId('event-areas-workspace').getByRole('button', { name: 'Add Event Area' })).toHaveCount(0)
    const [actionBox, summaryBox] = await Promise.all([
      addArea.boundingBox(),
      page.getByTestId('operations-section-event-areas').boundingBox(),
    ])
    expect(actionBox?.y).toBeLessThan(summaryBox?.y ?? Number.POSITIVE_INFINITY)

    await addArea.click()
    await expect(page.getByRole('dialog', { name: 'New Event Area' })).toBeVisible()
  })

  test('opens selected issue evidence in the shared drawer without changing URL filters', async ({ page }) => {
    await mockEventsAppApis(page)

    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)
    await expect(page.getByText('Expo floor wayfinding is hiding partner destinations').first()).toBeVisible()

    // Coverage and confidence is labeled as evidence quality, not performance.
    await page.getByRole('button', { name: 'Coverage detail ▼' }).click()
    await expect(page.getByText('Coverage and confidence')).toBeVisible()
    await expect(page.getByText('Feedback Sources')).toHaveCount(0)

    const overviewUrl = page.url()
    await page.getByRole('button', { name: 'Review evidence' }).first().click()
    const evidenceDrawer = page.getByTestId('event-evidence-drawer')
    await expect(evidenceDrawer).toBeVisible()
    await expect(evidenceDrawer.getByText('2 items', { exact: true })).toBeVisible()
    await expect(evidenceDrawer.getByTestId('event-theme-evidence-record')).toHaveCount(2)
    await expect(evidenceDrawer.getByText('The far aisle near the partner booths is packed').first()).toBeVisible()
    await expect(evidenceDrawer.getByText('A team member created an action from this intelligence.', { exact: false })).toBeVisible()
    await expect(evidenceDrawer.getByRole('button', { name: 'Open action' })).toBeVisible()
    await expect(page).toHaveURL(overviewUrl)
    await evidenceDrawer.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(evidenceDrawer).toBeHidden()
  })

  test('keeps the shared During action affordance fixed, hover-revealed, and composer-backed', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const linkedRow = page.getByTestId('needs-attention-panel').getByTestId('event-actionable-item').first()
    await expect(linkedRow.getByRole('button', { name: 'Action created' })).toHaveText('✓')

    const actionableRow = page.getByTestId('what-is-working').getByTestId('event-actionable-item').first()
    const createAction = actionableRow.getByRole('button', { name: 'Create action' })
    const before = await actionableRow.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
    await expect(createAction).toHaveCSS('opacity', '0')
    await actionableRow.hover()
    await expect(createAction).toHaveCSS('opacity', '1')
    const [reviewEvidenceBox, actionAffordanceBox] = await Promise.all([
      actionableRow.getByRole('button', { name: 'Review evidence' }).boundingBox(),
      createAction.boundingBox(),
    ])
    expect(Math.abs(((reviewEvidenceBox?.y ?? 0) + (reviewEvidenceBox?.height ?? 0) / 2) - ((actionAffordanceBox?.y ?? 0) + (actionAffordanceBox?.height ?? 0) / 2))).toBeLessThanOrEqual(1)
    const after = await actionableRow.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
    expect(after).toEqual(before)
    await createAction.click()
    await expect(actionableRow.getByTestId('event-action-compact-composer')).toBeVisible()
    await expect(actionableRow.getByRole('region', { name: 'Create action from intelligence' })).toBeVisible()

    const decisionColumns = page.locator('[data-decision-column]')
    const keepItem = decisionColumns.nth(0).getByTestId('event-actionable-item').first()
    const improveItem = decisionColumns.nth(1).getByTestId('event-actionable-item').first()
    const revisitItem = decisionColumns.nth(2).getByTestId('event-actionable-item').first()
    await expect(keepItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '0')
    await keepItem.hover()
    await expect(keepItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '1')
    await expect(improveItem.getByRole('button', { name: 'Action created' })).toHaveText('✓')
    const revisitBefore = await revisitItem.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
    await revisitItem.hover()
    await expect(revisitItem.getByRole('button', { name: 'Create action' })).toHaveCSS('opacity', '1')
    expect(await revisitItem.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(revisitBefore)
  })

  test('opens evidence from connected Keep and Revisit overview cards', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    await page.getByRole('button', { name: /Hands-on workshops/ }).first().click()
    const evidenceDrawer = page.getByTestId('event-evidence-drawer')
    await expect(evidenceDrawer).toBeVisible()
    await expect(evidenceDrawer.getByText('The hands-on workshop was the most useful part of the day.')).toBeVisible()
    await evidenceDrawer.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(evidenceDrawer).toBeHidden()

    await page.getByRole('button', { name: 'Revisit agenda pacing' }).click()
    await expect(evidenceDrawer).toBeVisible()
    await expect(evidenceDrawer.getByRole('heading', { name: 'Revisit agenda pacing', level: 2 })).toBeVisible()
    await expect(evidenceDrawer.getByText('The afternoon agenda felt too tightly packed.')).toBeVisible()
  })

  test('connects mixed alert evidence to the canonical action without inventing a second workflow', async ({ page }) => {
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)
    await page.getByRole('button', { name: 'Review evidence' }).first().click()
    const drawer = page.getByTestId('event-evidence-drawer')
    await expect(drawer.getByRole('heading', { name: 'Expo floor wayfinding is hiding partner destinations', level: 2 })).toBeVisible()
    await expect(drawer.getByText(/The far aisle near the partner booths is packed/)).toBeVisible()
    await expect(drawer.getByText('A team member created an action from this intelligence.', { exact: false })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Open action' })).toBeVisible()
  })

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1024 },
    { name: 'tablet', width: 1024, height: 900 },
    { name: 'mobile', width: 375, height: 812 },
  ]) {
    test(`keeps alert evidence and workflow controls usable on ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await mockEventsAppApis(page)
      await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

      await expect(page.getByText('Event overview', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Review evidence' }).first().click()
      const drawer = page.getByTestId('event-evidence-drawer')
      await expect(drawer.getByText(/The far aisle near the partner booths is packed/)).toBeVisible()
      await expect(drawer.getByText('A team member created an action from this intelligence.', { exact: false })).toBeVisible()
      await expect(drawer.getByRole('button', { name: 'Open action' })).toBeVisible()

      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(horizontalOverflow).toBeLessThanOrEqual(1)
      await expect(page.getByRole('dialog')).toHaveCount(1)
      await page.screenshot({ path: testInfo.outputPath(`command-center-${viewport.name}.png`), fullPage: true })
      await drawer.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  }

  test('keeps the desktop Signals overview balanced while evidence detail scrolls in the shared drawer', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1024 })
    await mockEventsAppApis(page)
    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

    const attentionPanel = page.getByTestId('needs-attention-panel')
    const workingSection = page.getByTestId('what-is-working')
    const decisionSection = page.getByTestId('overview-decisions')
    const coverageSection = page.getByTestId('coverage-and-confidence')
    const [attentionBox, workingBox, decisionBox, coverageBox] = await Promise.all([
      attentionPanel.boundingBox(),
      workingSection.boundingBox(),
      decisionSection.boundingBox(),
      coverageSection.boundingBox(),
    ])

    expect(attentionBox).not.toBeNull()
    expect(workingBox).not.toBeNull()
    expect(decisionBox).not.toBeNull()
    expect(coverageBox).not.toBeNull()
    expect((attentionBox?.width ?? 0)).toBeGreaterThan(700)
    expect((coverageBox?.x ?? 0)).toBeGreaterThan((attentionBox?.x ?? 0) + (attentionBox?.width ?? 0))
    expect((workingBox?.y ?? 0)).toBeGreaterThanOrEqual((attentionBox?.y ?? 0) + (attentionBox?.height ?? 0))
    expect((decisionBox?.x ?? 0)).toBeLessThanOrEqual((attentionBox?.x ?? 0) + 1)
    expect((decisionBox?.x ?? 0) + (decisionBox?.width ?? 0)).toBeGreaterThanOrEqual((coverageBox?.x ?? 0) + (coverageBox?.width ?? 0) - 1)
    expect((decisionBox?.y ?? 0)).toBeGreaterThanOrEqual(Math.max(
      (workingBox?.y ?? 0) + (workingBox?.height ?? 0),
      (coverageBox?.y ?? 0) + (coverageBox?.height ?? 0),
    ))
    await expect(decisionSection.getByText('Action-oriented recommendations grounded in attendee feedback.')).toBeVisible()
    await expect(decisionSection.getByText('How this works')).toHaveCount(0)
    await expect(decisionSection.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true')
    await expect(decisionSection.getByTestId('decision-recommendation').first()).toBeVisible()
    await decisionSection.getByRole('button', { name: 'Hide details' }).click()
    await expect(decisionSection.getByRole('button', { name: 'Show details' })).toHaveAttribute('aria-expanded', 'false')
    await expect(decisionSection.getByTestId('decision-recommendation')).toHaveCount(0)
    const columns = decisionSection.locator('[data-decision-column]')
    await expect(columns).toHaveCount(3)
    const columnBoxes = await Promise.all([0, 1, 2].map((index) => columns.nth(index).boundingBox()))
    const dividerBoxes = await Promise.all([0, 1, 2].map((index) => columns.nth(index).locator('[data-decision-divider]').boundingBox()))
    const evidenceLinkBoxes = await Promise.all([0, 1, 2].map((index) => columns.nth(index).locator('[data-decision-evidence-link]').boundingBox()))
    expect(columnBoxes.every(Boolean)).toBe(true)
    expect(dividerBoxes.every(Boolean)).toBe(true)
    expect(evidenceLinkBoxes.every(Boolean)).toBe(true)
    expect(new Set(columnBoxes.map((box) => Math.round(box!.height))).size).toBe(1)
    expect(new Set(dividerBoxes.map((box) => Math.round(box!.y))).size).toBe(1)
    expect(new Set(evidenceLinkBoxes.map((box) => Math.round(box!.y))).size).toBe(1)

    await page.getByRole('button', { name: 'Review evidence' }).first().click()
    const drawer = page.getByTestId('event-evidence-drawer')
    const dialog = drawer.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const drawerBox = await dialog.boundingBox()
    expect((drawerBox?.width ?? 0)).toBeLessThanOrEqual(660)
    expect((drawerBox?.x ?? 0) + (drawerBox?.width ?? 0)).toBeLessThanOrEqual(1440)
    const drawerBody = dialog.locator('div.min-h-0.flex-1.overflow-y-auto')
    await expect(drawerBody).toHaveCSS('overflow-y', 'auto')
    await expect(drawer.getByText('A team member created an action from this intelligence.', { exact: false })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('signals-overview-evidence-drawer.png'), fullPage: true })
  })

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1024 },
    { name: 'tablet', width: 1024, height: 900 },
    { name: 'mobile', width: 375, height: 812 },
  ]) {
    test(`keeps full-width recommendations aligned when collapsed on ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await mockEventsAppApis(page)
      await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}`)

      const decisionSection = page.getByTestId('overview-decisions')
      await expect(decisionSection.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true')
      await expect(decisionSection.getByTestId('decision-recommendation').first()).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`full-width-decisions-expanded-${viewport.name}.png`), fullPage: true })
      await decisionSection.getByRole('button', { name: 'Hide details' }).click()
      await expect(decisionSection.getByRole('button', { name: 'Show details' })).toHaveAttribute('aria-expanded', 'false')
      const columns = decisionSection.locator('[data-decision-column]')
      await expect(columns).toHaveCount(3)
      await expect(decisionSection.getByTestId('decision-recommendation')).toHaveCount(0)

      const boxes = await Promise.all([0, 1, 2].map((index) => columns.nth(index).boundingBox()))
      expect(boxes.every(Boolean)).toBe(true)
      const overflow = await horizontalOverflowDiagnostics(page)
      expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)

      if (viewport.width >= 768) {
        expect(new Set(boxes.map((box) => Math.round(box!.height))).size).toBe(1)
        expect(boxes[0]?.height ?? Infinity).toBeLessThanOrEqual(200)
        const overview = page.getByTestId('event-overview')
        const [decisionBox, overviewBox] = await Promise.all([decisionSection.boundingBox(), overview.boundingBox()])
        expect((decisionBox?.width ?? 0)).toBeGreaterThanOrEqual((overviewBox?.width ?? 0) - 2)
      } else {
        expect((boxes[1]?.y ?? 0)).toBeGreaterThanOrEqual((boxes[0]?.y ?? 0) + (boxes[0]?.height ?? 0))
        expect((boxes[2]?.y ?? 0)).toBeGreaterThanOrEqual((boxes[1]?.y ?? 0) + (boxes[1]?.height ?? 0))
      }

      await page.screenshot({ path: testInfo.outputPath(`full-width-decisions-${viewport.name}.png`), fullPage: true })
    })
  }

  test('keeps Event Areas controls and summary detail expansions usable across responsive widths', async ({ page }) => {
    await mockEventsAppApis(page)

    for (const width of [1680, 1440, 1280, 1100, 1000, 900, 768]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&lifecycle=in-event`)
      await expect(page.getByTestId('event-overview')).toBeVisible()

      const controlBar = page.getByTestId('intelligence-scope-controls')
      const controlGrid = controlBar.locator('.event-intelligence-scope-controls-grid')
      const controlBoxes = await Promise.all([0, 1, 2].map((index) => controlGrid.locator(':scope > *').nth(index).boundingBox()))
      expect(controlBoxes.every(Boolean)).toBe(true)
      expect(controlBoxes.every((box) => Math.abs(box!.y - controlBoxes[0]!.y) <= 1)).toBe(true)

      const overflow = await horizontalOverflowDiagnostics(page)
      expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
    }

    const surveyToggle = page.getByRole('button', { name: /Survey All Surveys/ })
    await surveyToggle.press('Enter')
    const surveyMenu = page.getByRole('listbox')
    await expect(surveyMenu).toBeVisible()
    const [surveyBox, viewport] = await Promise.all([surveyMenu.boundingBox(), page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))])
    expect((surveyBox ? surveyBox.x + surveyBox.width : Infinity)).toBeLessThanOrEqual(viewport.width + 1)
    expect((surveyBox ? surveyBox.y + surveyBox.height : Infinity)).toBeLessThanOrEqual(viewport.height + 1)
    await surveyMenu.getByRole('option', { name: /Overall Event Pulse/ }).click()
    await expect(page).toHaveURL(/surveyId=/)
    await expect(page.getByRole('button', { name: /Survey Overall Event Pulse/ })).toBeVisible()

    const area = page.locator('select').first()
    await area.selectOption('kind:AREA')
    await expect(page).toHaveURL(/structureKind=AREA/)

    const overview = page.getByTestId('event-overview')
    const metrics = overview.locator('.event-intelligence-metrics')
    const metricsHeight = (await metrics.boundingBox())?.height ?? 0
    await overview.getByTestId('coverage-detail-toggle').click()
    const coverageDetail = overview.getByTestId('coverage-detail-panel')
    await expect(coverageDetail).toBeVisible()
    const [overviewBox, coverageBox, metricsAfterCoverage] = await Promise.all([overview.boundingBox(), coverageDetail.boundingBox(), metrics.boundingBox()])
    expect((coverageBox?.width ?? 0)).toBeGreaterThanOrEqual((overviewBox?.width ?? 0) - 2)
    expect((metricsAfterCoverage?.height ?? 0)).toBe(metricsHeight)
    expect((coverageBox?.y ?? 0)).toBeGreaterThanOrEqual((metricsAfterCoverage?.y ?? 0) + (metricsAfterCoverage?.height ?? 0) - 1)
    await overview.getByTestId('coverage-detail-toggle').click()
    await expect(coverageDetail).toHaveCount(0)

    await overview.getByTestId('follow-up-detail-toggle').click()
    const followUpDetail = overview.getByTestId('follow-up-detail-panel')
    await expect(followUpDetail).toBeVisible()
    const [followUpBox, metricsAfterFollowUp] = await Promise.all([followUpDetail.boundingBox(), metrics.boundingBox()])
    expect((followUpBox?.width ?? 0)).toBeGreaterThanOrEqual((overviewBox?.width ?? 0) - 2)
    expect((metricsAfterFollowUp?.height ?? 0)).toBe(metricsHeight)
    expect((followUpBox?.y ?? 0)).toBeGreaterThanOrEqual((metricsAfterFollowUp?.y ?? 0) + (metricsAfterFollowUp?.height ?? 0) - 1)
    expect((await horizontalOverflowDiagnostics(page)).delta).toBeLessThanOrEqual(1)
  })

  test('opens the Signals survey filter when an unassigned survey is returned', async ({ page }) => {
    const runtimeErrors: Error[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error))
    await mockEventsAppApis(page, {
      additionalVoiceSurveys: [{
        id: 'survey-unassigned-signals',
        name: 'Unassigned draft survey',
        status: 'DRAFT',
        target: null,
        surveyTargetId: null,
        responseCount: 0,
        publicLink: null,
      }],
    })

    await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence`)
    const surveyToggle = page.getByRole('button', { name: /Survey All Surveys/ })
    await surveyToggle.click()

    const surveyMenu = page.getByRole('listbox')
    await expect(surveyMenu).toBeVisible()
    await expect(surveyMenu.getByRole('option', { name: /Overall Event Pulse/ })).toBeVisible()
    await expect(surveyMenu.getByRole('option', { name: /Unassigned draft survey/ })).toContainText('unassigned / No target assigned / 0 responses')

    const surveySearch = page.getByRole('searchbox', { name: 'Search surveys' })
    await expect(surveySearch).toBeVisible()
    await expect(surveySearch.evaluate((input) => getComputedStyle(input.parentElement!).position)).resolves.toBe('sticky')
    await surveySearch.fill('Overall Event Experience')
    await expect(surveyMenu.getByRole('option', { name: /Overall Event Pulse/ })).toBeVisible()
    await expect(surveyMenu.getByRole('option', { name: /Unassigned draft survey/ })).toHaveCount(0)
    await surveySearch.fill('Unassigned draft')
    await expect(surveyMenu.getByRole('option', { name: /Unassigned draft survey/ })).toBeVisible()
    expect(runtimeErrors).toEqual([])
  })

  test('uses the same compact shared controls for Speakers across responsive widths', async ({ page }) => {
    await mockEventsAppApis(page)

    for (const width of [1680, 1440, 1280, 1100, 900, 768]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=speakers&lifecycle=in-event`)
      await expect(page.getByRole('link', { name: 'Speakers', exact: true })).toHaveAttribute('aria-current', 'page')

      const controlBar = page.getByTestId('intelligence-scope-controls')
      const controlGrid = controlBar.locator('.event-intelligence-scope-controls-grid')
      const controlBoxes = await Promise.all([0, 1, 2].map((index) => controlGrid.locator(':scope > *').nth(index).boundingBox()))
      expect(controlBoxes.every(Boolean)).toBe(true)
      expect(controlBoxes.every((box) => Math.abs(box!.y - controlBoxes[0]!.y) <= 1)).toBe(true)

      const overflow = await horizontalOverflowDiagnostics(page)
      expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
    }

    const surveyToggle = page.getByRole('button', { name: /Survey All Surveys/ })
    await surveyToggle.press('Enter')
    const surveyMenu = page.getByRole('listbox')
    await expect(surveyMenu).toBeVisible()
    await surveyMenu.getByRole('option', { name: /Overall Event Pulse/ }).click()
    await expect(page).toHaveURL(/(?:surveyId=.*intelligenceScope=speakers|intelligenceScope=speakers.*surveyId=)/)
    await expect(page.getByRole('button', { name: /Survey Overall Event Pulse/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Speakers', exact: true })).toHaveAttribute('aria-current', 'page')

    await page.locator('select').first().selectOption('kind:AREA')
    await expect(page).toHaveURL(/(?:structureKind=AREA.*intelligenceScope=speakers|intelligenceScope=speakers.*structureKind=AREA)/)
    await expect(page.getByRole('link', { name: 'Speakers', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('keeps Speakers in the approved compact row composition across responsive widths', async ({ page }) => {
    await mockEventsAppApis(page)

    for (const width of [1680, 1440, 1280, 1100, 1000, 900, 768]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=speakers&lifecycle=in-event`)

      const workspace = page.getByTestId('signals-speakers-workspace')
      const row = workspace.getByRole('button', { name: /Jordan Lee/ })
      await expect(row).toBeVisible()
      const scopeControls = page.getByTestId('intelligence-scope-controls')
      const controlGrid = scopeControls.locator('.event-intelligence-scope-controls-grid')
      const controlBoxes = await Promise.all([0, 1, 2].map((index) => controlGrid.locator(':scope > *').nth(index).boundingBox()))
      expect(controlBoxes.every(Boolean)).toBe(true)
      expect(controlBoxes.every((box) => Math.abs(box!.y - controlBoxes[0]!.y) <= 1)).toBe(true)
      await expect(page.getByRole('region', { name: 'Speaker-specific evidence coverage' })).toHaveCount(0)
      await expect(workspace.getByText('View speaker intelligence', { exact: true })).toHaveCount(0)
      for (const label of ['All', 'Needs attention', 'Strong', 'Needs more feedback']) {
        await expect(workspace.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible()
      }

      const [gridTemplateColumns, summaryBox, rowBox, overflow] = await Promise.all([
        row.evaluate((element) => getComputedStyle(element).gridTemplateColumns),
        row.getByTestId('speaker-intelligence-row-summary').boundingBox(),
        row.boundingBox(),
        horizontalOverflowDiagnostics(page),
      ])
      expect(gridTemplateColumns.trim().split(/\s+/).length).toBe(5)
      expect(summaryBox).not.toBeNull()
      expect(rowBox).not.toBeNull()
      expect(summaryBox!.x + summaryBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width - 8)
      expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
    }

    const workspace = page.getByTestId('signals-speakers-workspace')
    await workspace.getByPlaceholder('Search speakers or sessions').fill('Opening Keynote')
    await expect(workspace.getByRole('button', { name: /Jordan Lee/ })).toBeVisible()
    await workspace.getByPlaceholder('Search speakers or sessions').fill('')
    await workspace.getByRole('button', { name: /^Needs more feedback/ }).click()
    await expect(page).toHaveURL(/speakerView=needs-more-feedback/)
  })

  test('keeps live Session rows compact and content-driven across desktop widths', async ({ page }) => {
    await mockEventsAppApis(page)

    for (const width of [1680, 1440, 1280, 1100]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`/app/events/${eventId}/dashboard?account=${accountSlug}&tab=intelligence&intelligenceScope=sessions&lifecycle=in-event`)

      const workspace = page.getByTestId('signals-sessions-workspace')
      const rows = workspace.getByTestId('session-intelligence-row')
      await expect(rows).toHaveCount(4)
      const rowHeights = await rows.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)))
      expect(new Set(rowHeights).size).toBeGreaterThan(1)
      const overflow = await horizontalOverflowDiagnostics(page)
      expect(overflow.delta, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(1)
    }

    const workspace = page.getByTestId('signals-sessions-workspace')
    await workspace.getByPlaceholder('Search sessions, rooms, speakers').fill('Workshop Lab')
    await expect(workspace.getByTestId('session-intelligence-row')).toHaveCount(1)
    await workspace.getByPlaceholder('Search sessions, rooms, speakers').fill('')
    await workspace.getByRole('button', { name: /^Needs more feedback/ }).click()
    await expect(page).toHaveURL(/sessionView=needs-more-feedback/)
    await expect(workspace.getByRole('button', { name: /^Needs more feedback/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('launches a tokenized Events survey through the canonical kiosk flow', async ({ page }) => {
    await mockTokenKioskApis(page)

    await page.goto(`/kiosk?token=${publicToken}`)
    await expect(page.getByRole('heading', { name: 'Overall Event Pulse' })).toBeVisible()
    await expect(page.getByText('Event Area · Expo Hall')).toBeVisible()
    await expect(page.getByTestId('survey-intro')).toHaveText('Tell us what is working in the Expo Hall and what needs attention.')
    await expect(page.getByTestId('survey-intro')).toHaveCount(1)
    const createRequest = page.waitForRequest((request) =>
      request.url().endsWith('/api/response/create') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Start event survey' }).click()

    await expect(page.getByTestId('survey-intro')).toHaveCount(0)
    await expect(page.getByText('What should the event team improve while the event is still happening?')).toBeVisible()
    await page.getByLabel('Your response').fill('The AI Lounge signs are hidden behind a banner.')

    const answerRequest = page.waitForRequest((request) =>
      request.url().endsWith('/api/answer/text') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Send' }).click()

    expect((await createRequest).postDataJSON()).toEqual({ token: publicToken })
    expect((await answerRequest).postDataJSON()).toMatchObject({
      responseId: 'resp-token-1',
      questionKey: 'survey-event-question',
      promptLabel: 'What should the event team improve while the event is still happening?',
    })
    await expect(page).toHaveURL(/\/kiosk\/thank-you\?eventId=evt-event-live&responseId=resp-token-1/)
    await expect(page.getByText('AI-generated feedback summary')).toBeVisible()
    await expect(page.getByText('Signage near the AI Lounge needs immediate attention.')).toHaveText(
      'Signage near the AI Lounge needs immediate attention.',
    )
  })

  test('shows a clear attendee state when a token survey is not yet open', async ({ page }) => {
    await page.route('**/api/kiosk/event-details?**', async (route) => {
      await fulfillJson(route, {
        success: false,
        error: 'Survey is not launchable yet. This survey opens Sep 17, 2026, 1:00 PM.',
      }, 400)
    })

    await page.goto(`/kiosk?token=future-survey-token`)
    await expect(page.getByRole('heading', { name: 'Unable to Load Kiosk' })).toBeVisible()
    await expect(page.getByText('This survey opens Sep 17, 2026, 1:00 PM.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Start/ })).toHaveCount(0)
  })

  test('preserves legacy Events /kiosk?eventId voice links', async ({ page }) => {
    await mockLegacyVoiceKioskApis(page)

    await page.goto(`/kiosk?eventId=${eventId}`)
    await expect(page.getByRole('heading', { name: 'Event feedback' })).toBeVisible()
    await page.getByRole('button', { name: 'Start event survey' }).click()
    await expect(page.getByText('What needs attention onsite?')).toBeVisible()

    await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click()

    await expect(page).toHaveURL(/\/kiosk\/thank-you\?eventId=evt-event-live&responseId=resp-legacy-voice-1/)
    await expect(page.getByText('Expo entrance needs clearer signs.')).toBeVisible()
  })

  for (const viewport of [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 1024 },
  ]) {
    test(`completes the four-question mixed Event survey on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      const structuredSubmissions = await mockMixedKioskApis(page, {
        failFirstStructured: viewport.name === 'mobile',
        failFirstCompletion: viewport.name === 'tablet',
      })

      await page.goto(`/kiosk?token=${publicToken}`)
      await page.getByRole('button', { name: 'Start event survey' }).click()
      await expect(page.getByRole('heading', { name: 'How would you rate registration?' })).toBeVisible()

      if (viewport.name === 'mobile') {
        await page.getByRole('button', { name: 'Continue' }).click()
        await expect(page.getByText('Choose an answer before continuing.')).toBeVisible()
      }
      await page.getByRole('radio', { name: '4' }).click()
      await page.getByRole('radio', { name: '5' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()
      if (viewport.name === 'mobile') {
        await expect(page.getByText('Temporary save failure')).toBeVisible()
        await page.getByRole('button', { name: 'Continue' }).click()
      }

      await expect(page.getByRole('heading', { name: 'What should the event team know?' })).toBeVisible()
      await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click()

      await expect(page.getByRole('heading', { name: 'How likely are you to attend again?' })).toBeVisible()
      await expect(page.getByText('Not at all likely')).toBeVisible()
      await expect(page.getByText('Extremely likely')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tap microphone to start recording' })).toHaveCount(0)
      await page.getByRole('radio', { name: '8' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()

      await expect(page.getByRole('heading', { name: 'What would make you more likely to return?' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click()

      if (viewport.name === 'tablet') {
        await expect(page.getByText('Temporary completion failure')).toBeVisible()
        await page.getByRole('button', { name: 'Try again' }).click()
      }
      await expect(page).toHaveURL(/\/kiosk\/thank-you\?eventId=evt-event-live&responseId=resp-mixed-1/)
      expect(structuredSubmissions).toEqual([
        { questionId: 'rating-id', numericValue: 5, responseId: 'resp-mixed-1' },
        { questionId: 'recommend-id', numericValue: 8, responseId: 'resp-mixed-1' },
      ])
    })
  }

  test('skips an optional structured question without creating an Answer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const structuredSubmissions = await mockMixedKioskApis(page)
    await page.goto(`/kiosk?token=${publicToken}`)
    await page.getByRole('button', { name: 'Start event survey' }).click()
    await page.getByRole('radio', { name: '5' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'How likely are you to attend again?' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Tap microphone to start recording' }).click()
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click()
    await expect(page).toHaveURL(/\/kiosk\/thank-you/)
    expect(structuredSubmissions).toEqual([
      { questionId: 'rating-id', numericValue: 5, responseId: 'resp-mixed-1' },
    ])
  })

  test('keeps optional text questions skippable through the public kiosk without creating empty Answers', async ({ page }) => {
    const kiosk = await mockTokenKioskApis(page, {
      questions: [
        { id: 'optional-q1', questionId: 'optional-q1-id', type: 'VOICE', text: 'Optional first question', order: 0, isRequired: false },
        { id: 'required-q2', questionId: 'required-q2-id', type: 'VOICE', text: 'Required middle question', order: 1, isRequired: true },
        { id: 'optional-q3', questionId: 'optional-q3-id', type: 'VOICE', text: 'Optional final question', order: 2, isRequired: false },
      ],
    })
    await page.goto(`/kiosk?token=${publicToken}`)
    await page.getByRole('button', { name: 'Start event survey' }).click()

    await expect(page.getByRole('heading', { name: 'Optional first question' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip this question' }).click()
    await expect(page.getByText('Question 2 of 3')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Required middle question' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip this question' })).toHaveCount(0)
    expect(kiosk.textSubmissions).toEqual([])

    await page.getByLabel('Your response').fill('This required answer is real.')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Question 3 of 3')).toBeVisible()
    await page.getByRole('button', { name: 'Skip this question' }).click()
    await expect(page).toHaveURL(/\/kiosk\/thank-you\?eventId=evt-event-live&responseId=resp-token-1/)
    expect(kiosk.textSubmissions).toEqual([{ responseId: 'resp-token-1', questionKey: 'required-q2', promptLabel: 'Required middle question', text: 'This required answer is real.' }])
    expect(kiosk.getCompletionAttempts()).toBe(1)
  })

  test('shows skip for optional voice questions but never for required voice questions', async ({ page }) => {
    await installMockMediaRecorder(page)
    const answerRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/answer/')) answerRequests.push(request.url())
    })
    await mockTokenKioskApis(page, {
      responseMode: 'VOICE_ONLY',
      questions: [
        { id: 'optional-voice', questionId: 'optional-voice-id', type: 'VOICE', text: 'Optional voice question', order: 0, isRequired: false },
        { id: 'required-voice', questionId: 'required-voice-id', type: 'VOICE', text: 'Required voice question', order: 1, isRequired: true },
      ],
    })
    await page.goto(`/kiosk?token=${publicToken}`)
    await page.getByRole('button', { name: 'Start event survey' }).click()

    await expect(page.getByRole('heading', { name: 'Optional voice question' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip this question' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip this question' }).click()
    await expect(page.getByText('Question 2 of 2')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Required voice question' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip this question' })).toHaveCount(0)
    expect(answerRequests).toEqual([])
  })

  test('keeps Advanced survey editing and session/speaker assignment on the canonical Event Workspace paths', async ({ page }) => {
    test.setTimeout(60_000)
    const advancedEvent = { ...liveEvent, eventType: 'ADVANCED', status: 'DRAFT', isActive: false, name: 'Advanced workflow regression' }
    const question = { id: 'advanced-question', key: 'advanced-question', label: 'How was it?', type: 'OPEN_RESPONSE', order: 0, required: true, configurationJson: null }
    await mockEventsAppApis(page, {
      events: [advancedEvent],
      voiceSurvey: { id: 'survey-unassigned-a', name: 'Unassigned survey A', status: 'DRAFT', target: null, surveyTargetId: null, responseCount: 0, questions: [question], publicLink: { isActive: false } },
      additionalVoiceSurveys: [
        { id: 'survey-unassigned-b', name: 'Unassigned survey B', status: 'DRAFT', target: null, surveyTargetId: null, responseMode: 'VOICE_AND_TEXT', responseCount: 0, questions: [question], readiness: { responseEligible: false, issues: ['Survey is unpublished'] }, publicLink: null },
        { id: 'survey-stays-unassigned', name: 'Survey that stays unassigned', status: 'DRAFT', target: null, surveyTargetId: null, responseMode: 'VOICE_AND_TEXT', responseCount: 0, questions: [], readiness: { responseEligible: false, issues: ['Survey is unpublished'] }, publicLink: null },
      ],
    })

    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=surveys`)
    const surveyRow = page.getByTestId('survey-management-row').filter({ hasText: 'Unassigned survey A' })
    await surveyRow.getByRole('button', { name: 'Edit' }).click()
    await expect(page).toHaveURL(new RegExp(`/app/events/${eventId}/surveys/new\\?account=${accountSlug}&survey=survey-unassigned-a`))
    await expect(page.getByTestId('advanced-event-survey-builder')).toBeVisible()
    await expect(page.getByLabel('Survey name')).toHaveValue('Unassigned survey A')

    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations`)
    await page.getByRole('combobox', { name: 'Choose a survey' }).first().click()
    await page.getByRole('option', { name: /Unassigned survey A/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Survey assigned' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' }).first()).toContainText('Unassigned survey A')
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' }).first()).toContainText('Unassigned survey A')

    await page.getByRole('combobox', { name: 'Choose a survey' }).first().click()
    await page.getByRole('option', { name: /Unassigned survey B/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Survey changed' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' }).first()).toContainText('Unassigned survey B')

    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=operations&operationsView=speakers`)
    await page.getByRole('combobox', { name: 'Choose a survey' }).first().click()
    await page.getByRole('option', { name: /Unassigned survey A/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Survey assigned' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' }).first()).toContainText('Unassigned survey A')
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' }).first()).toContainText('Unassigned survey A')
    await page.getByRole('combobox', { name: 'Choose a survey' }).first().click()
    await page.getByRole('option', { name: /Unassigned survey B/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Survey changed' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Choose a survey' }).first()).toContainText('Unassigned survey B')

    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=surveys`)
    await expect(page.getByTestId('survey-management-row').filter({ hasText: 'Survey that stays unassigned' })).toContainText('Not assigned')
  })

  test('offers every canonical Advanced assignment kind in the Surveys-list drawer', async ({ page }) => {
    const advancedEvent = { ...liveEvent, eventType: 'ADVANCED', status: 'DRAFT', isActive: false, name: 'Advanced assignment parity' }
    const question = { id: 'advanced-question', key: 'advanced-question', label: 'How was it?', type: 'OPEN_RESPONSE', order: 0, required: true, configurationJson: null }
    await mockEventsAppApis(page, {
      events: [advancedEvent],
      voiceSurvey: { id: 'survey-assignment-parity', name: 'Assignment parity survey', status: 'DRAFT', target: null, surveyTargetId: null, responseCount: 0, questions: [question], publicLink: { isActive: false } },
    })
    await page.goto(`/app/events/${eventId}?account=${accountSlug}&tab=surveys`)

    const row = page.getByTestId('survey-management-row').filter({ hasText: 'Assignment parity survey' })
    await row.getByRole('button', { name: 'Assign' }).click()
    const drawer = page.getByLabel('Assign survey drawer')
    for (const kind of ['Overall event', 'Sessions', 'Speakers', 'Event areas', 'Custom']) {
      await expect(drawer.getByRole('button', { name: new RegExp(`^${kind}`) })).toBeVisible()
    }

    await drawer.getByRole('button', { name: /^Speakers/ }).click()
    await drawer.getByRole('checkbox', { name: /Jordan Lee/ }).check()
    const speakerRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/survey-coverage?'))
    await drawer.getByRole('button', { name: 'Assign to 1 speakers' }).click()
    expect((await speakerRequest).postDataJSON()).toMatchObject({
      action: 'SET_SURVEY_DEPLOYMENT', surveyId: 'survey-assignment-parity', kind: 'SPEAKER', structureItemIds: ['speaker-keynote'],
    })

    await row.getByRole('button', { name: 'Assign' }).click()
    await drawer.getByRole('button', { name: /^Custom/ }).click()
    await drawer.getByLabel('Custom touchpoint').fill('VIP lounge follow-up')
    const customRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/survey-coverage?'))
    await drawer.getByRole('button', { name: 'Assign to custom touchpoint' }).click()
    expect((await customRequest).postDataJSON()).toMatchObject({
      action: 'SET_SURVEY_DEPLOYMENT', surveyId: 'survey-assignment-parity', kind: 'CUSTOM', customKey: 'survey-assignment-parity', customName: 'VIP lounge follow-up',
    })
  })

  test('keeps a delayed existing Advanced survey non-editable until hydration completes', async ({ page }) => {
    const advancedEvent = { ...liveEvent, eventType: 'ADVANCED', status: 'DRAFT', isActive: false, name: 'Advanced hydration regression' }
    const question = { id: 'advanced-question', key: 'advanced-question', label: 'How was it?', type: 'OPEN_RESPONSE', order: 0, required: true, configurationJson: null }
    const builderGetUrls: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes('/advanced-survey-builder?')) builderGetUrls.push(request.url())
    })
    await mockEventsAppApis(page, {
      events: [advancedEvent],
      advancedSurveyLoadDelayMs: 800,
      voiceSurvey: {
        id: 'survey-hydration',
        name: 'Hydrated survey name',
        description: 'Hydrated attendee introduction',
        status: 'DRAFT',
        target: null,
        surveyTargetId: null,
        responseCount: 0,
        questions: [question],
        publicLink: { isActive: false },
      },
    })

    await page.goto(`/app/events/${eventId}/surveys/new?account=${accountSlug}&survey=survey-hydration`)
    await expect(page.getByTestId('advanced-survey-loading')).toBeVisible()
    await expect(page.getByLabel('Survey name')).toHaveCount(0)
    await expect(page.getByText('Untitled survey')).toHaveCount(0)

    await expect(page.getByTestId('advanced-event-survey-builder')).toBeVisible()
    await expect(page.getByLabel('Survey name')).toHaveValue('Hydrated survey name')
    await expect(page.getByLabel(/Intro shown to attendees/)).toHaveValue('Hydrated attendee introduction')
    await expect(page.getByText('How was it?').first()).toBeVisible()
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
    await expect(page.getByText('Not assigned', { exact: true }).first()).toBeVisible()
    expect(builderGetUrls.length).toBeGreaterThan(0)
    expect(builderGetUrls.every((url) => new URL(url).searchParams.get('survey') === 'survey-hydration')).toBe(true)

    const autosaveRequest = page.waitForRequest((request) => (
      request.method() === 'PUT' && request.url().includes('/advanced-survey-builder?')
    ))
    await page.getByLabel('Survey name').fill('Edited after hydration')
    expect((await autosaveRequest).postDataJSON().name).toBe('Edited after hydration')
  })

  test('blocks cross-account Events dashboard access in the browser', async ({ page }) => {
    await mockEventsAppApis(page, { deniedAccount: 'other-events' })

    await page.goto('/app?account=other-events')
    await expect(page.getByText('Error Loading Account')).toBeVisible()
    await expect(page.getByText('Forbidden')).toBeVisible()
  })
})
