import { describe, expect, it } from 'vitest'
import { buildEventClosingBrief, buildEventClosingBriefEditorialInput } from './event-closing-brief'

function fixture() {
  return {
    accountSlug: 'events-co',
    eventId: 'event-1',
    generatedAt: new Date('2026-09-19T12:00:00Z'),
    listeningPointCount: 4,
    representedListeningPointCount: 3,
    intelligence: {
      eventId: 'event-1', eventName: 'Voice Summit', eventStatus: 'COMPLETED', eventType: 'EVENT', accountType: 'EVENTS', filters: {},
      responseCount: 42, answerCount: 58, avgSentiment: 0.48, highUrgencyCount: 1,
      eventPulse: { status: 'STABLE', sentimentLabel: 'POSITIVE', urgency: 'LOW', priorityLevel: 'Informational', summary: 'Practical content led, while wayfinding created avoidable friction.', lastComputedAt: '' },
      attendeeQuestions: ['How will the practical workshops be structured?'],
      topThemes: [
        { themeKey: 'content', label: 'Practical content', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.9 },
        { themeKey: 'wayfinding', label: 'Wayfinding', count: 4, sentimentLabel: 'NEGATIVE', confidence: 0.82 },
      ],
      topActions: [{ themeKey: 'pacing', title: 'Change agenda pacing', description: null, count: 3, priority: 'MEDIUM', priorityLevel: 'Soon', urgency: 'MEDIUM', actionWindow: 'LATER', status: 'OPEN', confidence: 0.76 }],
      targetBreakdown: [
        { name: 'Main stage', category: 'SESSION', answerCount: 20, avgSentiment: 0.5, topThemes: [{ themeKey: 'content', label: 'Practical content', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.9 }] },
        { name: 'Expo hall', category: 'AREA', answerCount: 18, avgSentiment: 0.5, topThemes: [] },
        { name: 'Workshop rooms', category: 'AREA', answerCount: 20, avgSentiment: 0.45, topThemes: [] },
        { name: 'Registration', category: 'AREA', answerCount: 0, avgSentiment: null, topThemes: [] },
      ],
      questionBreakdown: [{ answerCount: 58, avgSentiment: 0.48 }], urgentIssues: [], activeAttentionCount: 1, structuredMetrics: [{ key: 'overall', questionId: 'q-1', questionType: 'RATING_1_TO_5', questionLabel: 'Overall experience', surveyName: 'Event pulse', surveyTargetName: 'Main stage', count: 12, average: 4.2, distribution: {}, recent: { count: 6, average: 4.5 }, preceding: { count: 6, average: 3.9 }, change: 0.6, direction: 'improving', sampleStrength: { level: 'DIRECTIONAL', label: 'Directional', reason: 'Small sample' } }], signalCandidates: [],
      attentionQueue: [{
        id: 'cluster-wayfinding', taxonomyKey: 'wayfinding', title: 'Signs did not match the app', summary: null,
        priorityLevel: 'Immediate', legacyUrgency: 'HIGH', impactScore: 0.8, timeSensitivityScore: 0.8,
        confidence: 0.86, evidenceCount: 4, firstSeenAt: '', lastSeenAt: '', recommendedNextStep: null,
        status: 'ACKNOWLEDGED', ruleType: 'VOICE_OPERATIONAL', metricSnapshot: null, ownerUserId: 'user-1',
        acknowledgedAt: null, actingAt: null, resolvedAt: null, dismissedAt: null, resolutionReason: null,
        dismissalReason: null, noteCount: 0, surveyId: null, surveyTargetId: null, questionId: null,
        affectedTarget: null, affectedQuestion: null, representativeEvidence: [],
      }],
    },
    sessions: {
      eventId: 'event-1', minimumEvidenceResponses: 2, strongEvidenceMinimum: 8, provenance: '',
      summary: { agendaSessionCount: 2, selectedSessionCount: 2, representedSessionCount: 1, underrepresentedSessionCount: 1, needsReviewSessionCount: 0, selectedCoverageLabel: '', evidenceCoverageLabel: '' },
      sessions: [{
        id: 'session-1', title: 'Opening keynote', description: null, startsAt: null, endsAt: null, timezone: null,
        room: null, track: null, format: null, state: 'REPRESENTED', selectedForListening: true, represented: true,
        underrepresented: false, responseCount: 12, analyzedAnswerCount: 12, evidenceState: 'STRONG', evidenceLabel: 'Strong evidence',
        minimumEvidenceResponses: 2, reviewIssues: [], speakers: [], listening: { targetIds: [], collectionState: 'COLLECTING', survey: null, publicLink: null },
        findings: [{ themeKey: 'content', label: 'Useful examples', mentionCount: 6, responseCount: 6, sentimentLabel: 'POSITIVE', confidence: 0.9 }],
        learning: [{ title: 'Leave more discussion time', horizon: 'NEXT_EVENT', mentionCount: 3, confidence: 0.72, evidenceThemeKey: 'pacing' }],
        relatedIssues: [],
      }],
    },
    speakers: {
      eventId: 'event-1', minimumEvidenceResponses: 2, strongEvidenceMinimum: 8, provenance: '',
      summary: { speakerCount: 1, speakersWithFeedbackCount: 1, speakerSpecificResponseCount: 9 },
      speakers: [{
        id: 'speaker-1', name: 'Jordan Lee', title: null, organization: null, sessions: [], speakerSpecificTargetIds: ['target-1'],
        responseCount: 9, analyzedAnswerCount: 9, evidenceState: 'STRONG', evidenceLabel: 'Strong speaker evidence', minimumEvidenceResponses: 2,
        confidence: 0.9, findings: [{ themeKey: 'clarity', label: 'Clear explanations', mentionCount: 5, responseCount: 5, sentimentLabel: 'POSITIVE', confidence: 0.9 }],
      }],
    },
    actions: {
      actions: [
        { id: 'action-follow', title: 'Send sponsor follow-up', actionClassification: 'AFTER_EVENT_FOLLOW_UP', actionStatus: 'OPEN', priorityLevel: 'Soon', ownerUserId: 'user-1', owner: { id: 'user-1', email: 'owner@example.com', firstName: 'Avery', lastName: 'Stone' }, actionDueAt: new Date('2026-09-22T12:00:00Z'), _count: { evidence: 2, actionUpdates: 1 } },
        { id: 'action-next', title: 'Move the workshop block', actionClassification: 'NEXT_EVENT_LEARNING', actionStatus: 'COMPLETE', priorityLevel: 'Watch', ownerUserId: null, owner: null, actionDueAt: null, _count: { evidence: 1, actionUpdates: 2 } },
      ],
      availableFindings: [], availableOwners: [],
    },
    evidence: [{
      id: 'evidence-1', clusterId: 'cluster-wayfinding', title: 'Signs did not match the app', taxonomyKey: 'wayfinding',
      transcriptSnippet: 'The signs by the elevators did not match the app.', sentimentScore: -0.65, priorityLevel: 'Immediate', confidence: 0.86,
      createdAt: new Date('2026-09-18T16:00:00Z'), question: { label: 'What should change?', type: 'VOICE' },
      surveyTarget: { name: 'Expo floor', eventStructureItem: { name: 'Expo hall' } },
    }],
  }
}

describe('post-event closing brief', () => {
  it('builds one consistent leadership payload from canonical intelligence and workflow records', () => {
    const brief = buildEventClosingBrief(fixture() as never)

    expect(brief.lifecyclePhase).toBe('POST_EVENT')
    expect(brief.summary).toMatchObject({ responseCount: 42, answerCount: 58, listeningPointCount: 4, representedListeningPointCount: 3, representedPercent: 75 })
    expect(brief.summary.sentimentBreakdown).toMatchObject({ favorable: 58, neutral: 0, negative: 0, total: 58 })
    expect(brief.whatWorked[0]).toMatchObject({ title: 'Practical content', evidenceStrength: 'strong', evidenceTier: 'STRONG' })
    expect(brief.friction[0]).toMatchObject({ title: 'Signs did not match the app', evidenceId: 'evidence-1' })
    expect(brief.friction[0].issueClusterIds).toEqual(['cluster-wayfinding'])
    expect(brief.sessions.highlights[0].title).toBe('Opening keynote')
    expect(brief.speakers.highlights[0].name).toBe('Jordan Lee')
  })

  it('packages bounded, finding-specific canonical evidence for editorial synthesis', () => {
    const brief = buildEventClosingBrief(fixture() as never)
    const editorialInput = buildEventClosingBriefEditorialInput(brief)
    const wayfinding = editorialInput.findings.keyFindings.find((finding) => finding.id === 'issue:cluster-wayfinding')

    expect(wayfinding).toMatchObject({
      title: 'Signs did not match the app',
      kind: 'friction',
      mentionCount: 4,
      responseCount: null,
      representativeEvidence: [{
        id: 'evidence-1',
        excerpt: 'The signs by the elevators did not match the app.',
        question: 'What should change?',
        source: 'Expo hall',
      }],
    })
    expect(wayfinding?.representativeEvidence).toHaveLength(1)
  })

  it('sends a broad canonical lifecycle packet to the editorial model', () => {
    const brief = buildEventClosingBrief({ ...fixture(), lifecyclePhase: 'PRE_EVENT' } as never)
    const editorialInput = buildEventClosingBriefEditorialInput(brief)

    expect(editorialInput.event.lifecycle).toBe('PRE_EVENT')
    expect(editorialInput.overview).toContain('Practical content')
    expect(editorialInput.attendeeQuestions).toEqual(['How will the practical workshops be structured?'])
    expect(editorialInput.patterns.sessions[0]).toMatchObject({ title: 'Opening keynote', finding: 'Useful examples' })
    expect(editorialInput.patterns.speakers[0]).toMatchObject({ name: 'Jordan Lee', finding: 'Clear explanations' })
    expect(editorialInput.patterns.eventAreas).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Expo hall' })]))
    expect(editorialInput.patterns.changes[0]).toMatchObject({ question: 'Overall experience', direction: 'improving', change: 0.6 })
    expect(editorialInput.findings.keyFindings.length).toBeGreaterThan(1)
    expect(editorialInput.followThrough).toEqual([expect.objectContaining({ title: 'Send sponsor follow-up' })])
  })

  it('never promotes AI recommendations into canonical follow-through', () => {
    const brief = buildEventClosingBrief(fixture() as never)
    const editorialInput = buildEventClosingBriefEditorialInput(brief)

    expect(editorialInput.findings.nextEvent.map((item) => item.title)).toContain('Change agenda pacing')
    expect(editorialInput.followThrough.map((item) => item.title)).not.toContain('Change agenda pacing')
    expect(editorialInput.followThrough.map((item) => item.title)).toEqual(['Send sponsor follow-up'])
  })

  it('keeps unresolved after-event work distinct from next-event learning', () => {
    const brief = buildEventClosingBrief(fixture() as never)

    expect(brief.decisions.unresolvedActions.map((action) => action.id)).toEqual(['action-follow'])
    expect(brief.decisions.afterEventFollowUp[0]).toMatchObject({ id: 'action-follow', owner: 'Avery Stone', status: 'OPEN' })
    expect(brief.decisions.nextEventLearning.actions[0]).toMatchObject({ id: 'action-next', title: 'Move the workshop block' })
    expect(brief.decisions.nextEventLearning.sessionLearning[0]).toMatchObject({ title: 'Leave more discussion time', source: 'Opening keynote' })
  })

  it('generates share text from the same values and preserves canonical evidence provenance', () => {
    const brief = buildEventClosingBrief(fixture() as never)

    expect(brief.shareText).toContain('42 completed responses')
    expect(brief.shareText).toContain('Send sponsor follow-up (OPEN, Avery Stone)')
    expect(brief.supportingEvidence[0]).toMatchObject({
      id: 'evidence-1', quote: 'The signs by the elevators did not match the app.', question: 'What should change?', source: 'Expo hall',
    })
  })

  it('uses the canonical inferred-satisfaction classification instead of reclassifying the average', () => {
    const input = fixture()
    input.intelligence.avgSentiment = 0.1
    input.intelligence.eventPulse.sentimentLabel = 'POSITIVE'

    const brief = buildEventClosingBrief(input as never)

    expect(brief.summary.sentiment).toBe('Mostly positive')
    expect(brief.summary.verdict).toContain('Practical content')
  })

  it('uses multiple eligible specific themes and emerging friction from persisted intelligence', () => {
    const input = fixture()
    input.intelligence.topThemes = [
      { themeKey: 'general_positive_feedback', label: 'General positive feedback', count: 9, sentimentLabel: 'POSITIVE', confidence: 0.8 },
      { themeKey: 'networking', label: 'Quality networking conversations', count: 5, sentimentLabel: 'POSITIVE', confidence: 0.8 },
      { themeKey: 'practical_content', label: 'Practical content', count: 4, sentimentLabel: 'POSITIVE', confidence: 0.8 },
      { themeKey: 'venue_noise', label: 'Venue noise', count: 2, sentimentLabel: 'NEGATIVE', confidence: 0.7 },
    ]
    input.intelligence.attentionQueue = []

    const brief = buildEventClosingBrief(input as never)

    expect(brief.whatWorked.map((item) => item.title)).toEqual(['Networking', 'Practical content'])
    expect(brief.friction).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Venue noise', evidenceTier: 'EMERGING' })]))
    expect(brief.shareText).toContain('The strongest positive feedback centered on networking and practical content.')
  })

  it('carries an emerging persisted next-event recommendation into the closing brief', () => {
    const input = fixture()
    input.intelligence.topActions = [{ themeKey: 'agenda_density', title: 'Revisit agenda pacing', description: null, count: 2, priority: 'LOW', priorityLevel: 'Watch', urgency: 'LOW', actionWindow: 'LATER', status: 'OPEN', confidence: 0.7 }]

    const brief = buildEventClosingBrief(input as never)

    expect(brief.decisions.nextEventLearning.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Revisit agenda pacing', evidenceTier: 'EMERGING' }),
    ]))
  })

  it('uses concise fallback editorial prose instead of concatenating finding statements', () => {
    const input = fixture()
    input.intelligence.attentionQueue = []
    input.intelligence.topThemes = [
      {
        themeKey: 'networking', label: 'Networking', count: 5, sentimentLabel: 'POSITIVE', confidence: 0.82,
        statement: 'Attendees consistently valued the quality of peer connections and expo conversations.',
        questionIntent: 'strength', supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'],
      },
      {
        themeKey: 'agenda_pacing', label: 'Agenda pacing', count: 2, sentimentLabel: 'MIXED', confidence: 0.7,
        statement: 'A few attendees wanted more time between sessions.',
        questionIntent: 'improvement', supportingAnswerIds: ['answer_4', 'answer_5'],
      },
    ] as never

    const brief = buildEventClosingBrief(input as never)

    expect(brief.editorial.source).toBe('fallback')
    expect(brief.shareText).toContain('What worked: The strongest positive feedback centered on expo networking.')
    expect(brief.shareText).not.toContain('Attendees consistently valued the quality of peer connections and expo conversations.')
    expect(brief.shareText).not.toContain('A few attendees wanted more time between sessions.')
  })

  it('uses the consolidated canonical finding once across the closing brief and print payload', () => {
    const input = fixture()
    input.intelligence.attentionQueue = []
    input.intelligence.topThemes = [
      {
        themeKey: 'networking', label: 'Networking', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8,
        statement: 'Attendees consistently reported that the location was perfect for a relaxed networking event.',
        questionIntent: 'strength', supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'],
        supportingResponseIds: ['response_1', 'response_2', 'response_3'], supportingEvidenceIds: ['theme_1', 'theme_2', 'theme_3'],
      },
      {
        themeKey: 'networking_and_expo', label: 'Networking and expo', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.9,
        statement: 'Attendees consistently reported that the location was perfect for a relaxed networking event.',
        questionIntent: 'strength', supportingAnswerIds: ['answer_4', 'answer_5', 'answer_6'],
        supportingResponseIds: ['response_4', 'response_5', 'response_6'], supportingEvidenceIds: ['theme_4', 'theme_5', 'theme_6'],
      },
    ] as never

    const brief = buildEventClosingBrief(input as never)

    expect(brief.whatWorked).toEqual([
      expect.objectContaining({ title: 'Networking', mentionCount: 6 }),
    ])
    expect(brief.keyFindings.filter((finding) => finding.title.includes('Networking'))).toHaveLength(1)
    // Preview and PDF print the same EventClosingBrief payload, so this is the
    // exact post-deduplication data supplied to both render paths.
    expect(brief.shareText).not.toContain('Attendees consistently reported')
  })

  it('keeps canonical counts authoritative when applying editorial copy', () => {
    const input = {
      ...fixture(),
      editorial: {
        source: 'openai', provider: 'openai', model: 'gpt-4o-mini', promptVersion: 'test-v1', inputHash: 'a'.repeat(64),
        generatedAt: '2026-09-19T12:00:00.000Z', cacheHit: false,
        copy: {
          headline: 'Practical content led a positive outcome with clear follow-through.',
          executiveSummary: 'Attendee feedback connected useful content with a focused opportunity to improve wayfinding.',
          keyTakeaway: 'Protect the practical program while closing the remaining wayfinding gap.',
          whatWorkedNarrative: 'Practical content was the clearest event strength.',
          frictionNarrative: 'Wayfinding was the clearest recurring friction.',
          nextEventNarrative: 'Future planning should protect discussion time.',
          coverageNarrative: 'Coverage was broad, with one listening area still unrepresented.',
          findingNarratives: [],
        },
      },
    }

    const brief = buildEventClosingBrief(input as never)

    expect(brief.summary).toMatchObject({ responseCount: 42, answerCount: 58, representedPercent: 75 })
    expect(brief.summary.verdict).toBe(input.editorial.copy.headline)
    expect(brief.editorial.copy).toEqual(input.editorial.copy)
  })
})
