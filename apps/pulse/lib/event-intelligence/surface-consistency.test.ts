import { describe, expect, it } from 'vitest'
import { buildEventClosingBrief } from '@/lib/event-closing-brief'
import { buildEventSessionIntelligence } from '@/lib/event-session-intelligence'
import { buildEventSpeakerIntelligence } from '@/lib/event-speaker-intelligence'
import { buildEventEvidenceModel } from './evidence-model'
import { buildEventIntelligenceFindings } from './intelligence-view'
import { buildInEventOverview } from './overview'

const responseIds = Array.from({ length: 8 }, (_, index) => `response_${index}`)
const strongEvidence = buildEventEvidenceModel({
  mentionCount: 10,
  supportingResponseIds: responseIds,
  analyzedEligibleResponseIds: responseIds,
  completedEligibleResponseCount: 10,
  extractionConfidence: 0.8,
})

describe('canonical evidence tiers across Events surfaces', () => {
  it('returns the same strong tier for identical analyzed evidence', () => {
    const theme = { themeKey: 'practical_content', label: 'Practical content', count: 10, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: strongEvidence }
    const overview = buildInEventOverview({ themes: [theme], actions: [], issues: [] })
    const intelligence = buildEventIntelligenceFindings({ themes: [theme], actions: [], targets: [], issues: [] })
    const sessions = buildEventSessionIntelligence({
      eventId: 'event_1',
      sessions: [{ id: 'session_1', name: 'Keynote', description: null, startsAt: null, endsAt: null, timezone: null, metadata: { schemaVersion: 1, room: 'Hall', track: 'Main' }, speakerAssignments: [] }],
      targets: [{ id: 'target_1', eventStructureItemId: 'session_1', plannerManaged: true, responseCount: 10, publicSurveyLinks: [] }],
      intelligence: responseIds.map((responseId) => ({ surveyTargetId: 'target_1', responseId, confidence: 0.8, themes: [{ themeKey: theme.themeKey, label: theme.label, sentimentLabel: 'POSITIVE', confidence: 0.8 }], actions: [] })),
      issues: [],
    })
    const speakers = buildEventSpeakerIntelligence({
      eventId: 'event_1',
      speakers: [{ id: 'speaker_1', name: 'Avery', title: null, organization: null, assignments: [{ id: 'assignment_1', role: 'SPEAKER', session: { id: 'session_1', name: 'Keynote', startsAt: null, endsAt: null, timezone: null } }] }],
      targets: [{ id: 'speaker_target', category: 'SPEAKER' as const, speakerId: 'speaker_1', eventStructureItemId: null, speakerAssignmentId: null, responseCount: 10 }],
      intelligence: responseIds.map((responseId) => ({ surveyTargetId: 'speaker_target', responseId, confidence: 0.8, themes: [{ themeKey: theme.themeKey, label: theme.label, sentimentLabel: 'POSITIVE', confidence: 0.8 }] })),
    })
    const brief = buildEventClosingBrief({
      accountSlug: 'events', eventId: 'event_1', generatedAt: new Date(), listeningPointCount: 1, representedListeningPointCount: 1,
      intelligence: { eventId: 'event_1', eventName: 'Event', eventStatus: 'ACTIVE', eventType: 'EVENT', accountType: 'EVENTS', filters: {}, responseCount: 10, answerCount: 8, avgSentiment: 0.8, highUrgencyCount: 0, eventPulse: { sentimentLabel: 'POSITIVE' }, topThemes: [theme], topActions: [], targetBreakdown: [], questionBreakdown: [], attentionQueue: [] },
      sessions,
      speakers,
      actions: { actions: [] },
      evidence: [],
    } as never)

    expect(overview.keep[0].evidence?.evidenceTier).toBe('STRONG')
    expect(intelligence[0].evidenceTier).toBe('STRONG')
    expect(sessions.sessions[0].evidence.evidenceTier).toBe('STRONG')
    expect(speakers.speakers[0].evidence.evidenceTier).toBe('STRONG')
    expect(brief.whatWorked[0].evidenceTier).toBe('STRONG')
  })
})
