import { describe, expect, it } from 'vitest'
import { buildInEventOverview, buildInEventOverviewSummary } from '@/lib/event-intelligence/overview'

describe('buildInEventOverview', () => {
  it('groups normalized findings without inventing or duplicating operational issues', () => {
    const overview = buildInEventOverview({
      themes: [
        { themeKey: 'workshops', label: 'Hands-on workshops', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.9 },
        { themeKey: 'wayfinding', label: 'Wayfinding', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.62 },
      ],
      actions: [
        { themeKey: 'wayfinding', title: 'Improve signs', count: 3, priority: 'Low', priorityLevel: 'Watch', urgency: 'LOW', actionWindow: 'WATCH', confidence: 0.62 },
        { themeKey: 'agenda-density', title: 'Revisit agenda pacing', count: 2, priority: 'Low', priorityLevel: 'Watch', urgency: 'LOW', actionWindow: 'LATER', confidence: 0.5 },
      ],
      issues: [
        { id: 'issue-1', taxonomyKey: 'wayfinding', title: 'Fix wayfinding now', priorityLevel: 'Immediate', confidence: 0.88, status: 'ACKNOWLEDGED', ownerUserId: 'user-1', noteCount: 1 },
        { id: 'issue-2', taxonomyKey: 'registration', title: 'Review registration', priorityLevel: 'Soon', confidence: 0.7, status: 'NEW' },
        { id: 'issue-3', taxonomyKey: 'closed', title: 'Closed issue', priorityLevel: 'Immediate', confidence: 0.9, status: 'RESOLVED' },
      ],
    })

    expect(overview.keep.map((item) => item.themeKey)).toEqual(['workshops'])
    expect(overview.improveNow.map((item) => item.id)).toEqual(['issue-1', 'issue-2'])
    expect(overview.revisitNextEvent.map((item) => item.themeKey)).toEqual(['agenda-density'])
    expect(overview.openFollowUp.map((item) => item.id)).toEqual(['issue-1'])
    expect(overview.confidence).toEqual({ strong: 1, directional: 0, emerging: 2 })
  })

  it('keeps unowned new issues in review without presenting them as open follow-up', () => {
    const overview = buildInEventOverview({
      themes: [],
      actions: [],
      issues: [
        { id: 'issue-1', taxonomyKey: 'check-in', title: 'Check-in friction', priorityLevel: 'Immediate', confidence: null, status: 'NEW' },
      ],
    })

    expect(overview.improveNow).toHaveLength(1)
    expect(overview.openFollowUp).toHaveLength(0)
    expect(overview.confidence.emerging).toBe(1)
  })

  it('builds a richer deterministic overview from persisted aggregates and classified findings', () => {
    const overview = buildInEventOverview({
      themes: [{ themeKey: 'workshops', label: 'Hands-on workshops', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.9 }],
      actions: [{ themeKey: 'agenda-density', title: 'Revisit agenda pacing', count: 2, priority: 'Low', priorityLevel: 'Watch', urgency: 'LOW', actionWindow: 'LATER', confidence: 0.5 }],
      issues: [{ id: 'issue-1', taxonomyKey: 'check-in', title: 'Registration wait time', priorityLevel: 'Immediate', confidence: 0.88, status: 'ACKNOWLEDGED' }],
    })
    const summary = buildInEventOverviewSummary({
      responseCount: 42,
      answerCount: 58,
      representedFeedbackPoints: 3,
      configuredFeedbackPoints: 4,
      sentimentPercent: 72,
      findings: [{ title: 'Hands-on workshops', description: 'Attendees valued the practical workshop format.', kind: 'positive', evidenceTier: 'STRONG', mentionCount: 8, sentimentLabel: 'POSITIVE' }],
      overview,
    })
    expect(summary).toContain('hands-on workshops')
    expect(summary).toContain('registration wait time')
    expect(summary).toContain('While there is still time to act')
    expect(summary.match(/[.!?](?:\s|$)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('does not add a second terminal period when a review-card title already has punctuation', () => {
    const overview = buildInEventOverview({
      themes: [],
      actions: [],
      issues: [{ id: 'issue-1', taxonomyKey: 'check-in', title: 'Direct attendees to the check-in desk.', priorityLevel: 'Soon', confidence: 0.8, status: 'NEW' }],
    })
    const summary = buildInEventOverviewSummary({
      responseCount: 1,
      answerCount: 1,
      representedFeedbackPoints: 1,
      configuredFeedbackPoints: 1,
      sentimentPercent: 50,
      findings: [],
      overview,
    })

    expect(summary).toContain('Direct attendees to the check-in desk.')
    expect(summary).not.toContain('desk..')
  })

  it('synthesizes several canonical strengths and a cautious Emerging review signal', () => {
    const overview = buildInEventOverview({ themes: [], actions: [], issues: [] })
    const summary = buildInEventOverviewSummary({
      responseCount: 33,
      answerCount: 120,
      representedFeedbackPoints: 1,
      configuredFeedbackPoints: 1,
      sentimentPercent: 100,
      findings: [
        { title: 'Networking', description: 'Attendees valued the relaxed networking environment.', kind: 'positive', evidenceTier: 'STRONG', mentionCount: 85, sentimentLabel: 'POSITIVE' },
        { title: 'Community and belonging', description: 'Attendees described a welcoming community.', kind: 'positive', evidenceTier: 'REPEATED', mentionCount: 5, sentimentLabel: 'POSITIVE' },
        { title: 'Relaxed atmosphere', description: 'Attendees enjoyed the informal atmosphere.', kind: 'positive', evidenceTier: 'REPEATED', mentionCount: 4, sentimentLabel: 'POSITIVE' },
        { title: 'Direct connections', description: 'A few attendees did not make a specific vendor connection this time.', kind: 'theme', evidenceTier: 'EMERGING', mentionCount: 2, sentimentLabel: 'MIXED' },
      ],
      overview,
    })

    expect(summary).toContain('direct connections')
    expect(summary).toContain('networking')
    expect(summary).toContain('community and belonging')
    expect(summary).not.toMatch(/across 33 responses|configured feedback points|overall sentiment remains positive/i)
  })

  it('does not promote an Isolated finding into the executive synopsis', () => {
    const overview = buildInEventOverview({ themes: [], actions: [], issues: [] })
    const summary = buildInEventOverviewSummary({
      responseCount: 8,
      answerCount: 12,
      representedFeedbackPoints: 2,
      configuredFeedbackPoints: 3,
      sentimentPercent: 68,
      findings: [
        { title: 'Networking', description: 'Attendees valued networking.', kind: 'positive', evidenceTier: 'STRONG', mentionCount: 6, sentimentLabel: 'POSITIVE' },
        { title: 'Coffee temperature', description: 'One attendee found the coffee cold.', kind: 'signal', evidenceTier: 'ISOLATED', mentionCount: 1, sentimentLabel: 'NEGATIVE' },
      ],
      overview,
    })

    expect(summary).toContain('Attendees valued networking.')
    expect(summary).not.toContain('coffee')
  })

  it('surfaces emerging negative evidence for review and suppresses generic positives when specifics exist', () => {
    const overview = buildInEventOverview({
      themes: [
        { themeKey: 'general_positive_feedback', label: 'General positive feedback', count: 9, sentimentLabel: 'POSITIVE', confidence: 0.8 },
        { themeKey: 'networking', label: 'Networking', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8 },
        { themeKey: 'venue_noise', label: 'Venue noise', count: 2, sentimentLabel: 'NEGATIVE', confidence: 0.7 },
      ],
      actions: [], issues: [],
    })

    expect(overview.keep.map((theme) => theme.label)).toEqual(['Networking'])
    expect(overview.reviewThemes.map((theme) => theme.label)).toEqual(['Venue noise'])
  })

  it('recomputes prominence from the latest evidence rather than retaining an earlier tier', () => {
    const emerging = buildInEventOverview({
      themes: [{ themeKey: 'networking', label: 'Networking', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8 }],
      actions: [], issues: [],
    })
    const stronger = buildInEventOverview({
      themes: [{ themeKey: 'networking', label: 'Networking', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.8 }],
      actions: [], issues: [],
    })

    expect(emerging.keep[0].evidence?.evidenceTier).toBe('EMERGING')
    expect(stronger.keep[0].evidence?.evidenceTier).toBe('STRONG')
  })

  it('uses the canonical question-aware finding as next-event learning', () => {
    const overview = buildInEventOverview({
      themes: [{
        themeKey: 'networking_time', label: 'Networking time', count: 2, sentimentLabel: 'MIXED', confidence: 0.76,
        statement: 'A few attendees wanted more structured networking time.', questionIntent: 'improvement',
      }],
      actions: [], issues: [],
    })

    expect(overview.keep).toHaveLength(0)
    expect(overview.revisitNextEvent[0]).toMatchObject({
      themeKey: 'networking_time',
      title: 'Networking time',
      description: 'A few attendees wanted more structured networking time.',
    })
  })
})
