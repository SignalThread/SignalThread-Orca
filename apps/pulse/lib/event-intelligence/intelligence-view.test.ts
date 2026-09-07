import { describe, expect, it } from 'vitest'
import { buildEventEvidenceModel } from './evidence-model'
import { buildEventIntelligenceFindings, evidenceStrengthForTier } from './intelligence-view'

const evidence = (responseCount: number, confidence = 0.86) => {
  const responseIds = Array.from({ length: responseCount }, (_, index) => `response_${index}`)
  return buildEventEvidenceModel({
    mentionCount: responseCount,
    supportingResponseIds: responseIds,
    analyzedEligibleResponseIds: responseIds,
    completedEligibleResponseCount: responseCount,
    extractionConfidence: confidence,
  })
}

describe('buildEventIntelligenceFindings', () => {
  const targets = [
    { topThemes: [{ themeKey: 'workshops', label: 'Workshops', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.9 }] },
    { topThemes: [{ themeKey: 'workshops', label: 'Workshops', count: 1, sentimentLabel: 'POSITIVE', confidence: 0.8 }] },
  ]

  it('derives evidence strength and deterministic learning classifications', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'workshops', label: 'Hands-on workshops', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.86, evidence: evidence(8) },
        { themeKey: 'quiet_room', label: 'Quiet room requests', count: 1, sentimentLabel: 'NEGATIVE', confidence: 0.99, evidence: evidence(1, 0.99) },
      ],
      actions: [
        { themeKey: 'agenda_density', title: 'Revisit agenda pacing', description: null, count: 2, actionWindow: 'LATER', confidence: 0.68, evidence: evidence(2, 0.68) },
      ],
      targets,
      issues: [],
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Hands-on workshops', kind: 'positive', evidenceStrength: 'strong', evidenceTier: 'STRONG', classification: 'informational', sourceCount: 2 }),
      expect.objectContaining({ title: 'Quiet room requests', kind: 'signal', evidenceStrength: 'weak', evidenceTier: 'ISOLATED', classification: 'informational' }),
      expect.objectContaining({ title: 'Revisit agenda pacing', kind: 'opportunity', evidenceStrength: 'directional', evidenceTier: 'EMERGING', classification: 'next-event' }),
    ]))
  })

  it('excludes active issue taxonomy keys without title-based deduplication', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'wayfinding', label: 'Hard-to-find rooms', count: 4, sentimentLabel: 'NEGATIVE', confidence: 0.9 },
        { themeKey: 'other_risk', label: 'Hard-to-find rooms', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.85 },
      ],
      actions: [],
      targets: [],
      issues: [{ taxonomyKey: 'wayfinding', status: 'ACKNOWLEDGED' }],
    })

    expect(findings.map((finding) => finding.evidenceThemeKey)).toEqual(['other_risk'])
  })

  it('keeps resolved issue themes available as non-operational intelligence', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [{ themeKey: 'wayfinding', label: 'Wayfinding', count: 2, sentimentLabel: 'NEGATIVE', confidence: 0.72 }],
      actions: [],
      targets: [],
      issues: [{ taxonomyKey: 'wayfinding', status: 'RESOLVED' }],
    })

    expect(findings).toHaveLength(1)
  })

  it('surfaces emerging negative evidence for current review while strong patterns outrank it', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'networking', label: 'Networking', count: 8, sentimentLabel: 'NEGATIVE', confidence: 0.8, evidence: evidence(8) },
        { themeKey: 'venue_noise', label: 'Venue noise', count: 2, sentimentLabel: 'NEGATIVE', confidence: 0.7, evidence: evidence(2, 0.7) },
      ],
      actions: [], targets: [], issues: [],
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Networking', evidenceTier: 'STRONG', classification: 'current-event' }),
      expect.objectContaining({ title: 'Venue noise', evidenceTier: 'EMERGING', classification: 'current-event' }),
    ]))
    expect(findings.map((finding) => finding.title)).toEqual(['Networking', 'Venue noise'])
  })

  it('consolidates the exact Networking regression despite disjoint evidence pools', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'general_positive_feedback', label: 'General positive feedback', count: 9, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(9) },
        {
          themeKey: 'networking', label: 'Networking', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3),
          statement: 'Attendees consistently reported that the location was perfect for a relaxed networking event.',
          supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'],
          supportingResponseIds: ['response_1', 'response_2', 'response_3'],
          supportingEvidenceIds: ['theme_1', 'theme_2', 'theme_3'],
          supportingTargetIds: ['target_1'],
        },
        {
          themeKey: 'networking_and_expo', label: 'Networking and expo', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.9, evidence: evidence(3),
          statement: 'Attendees consistently reported that the location was perfect for a relaxed networking event.',
          supportingAnswerIds: ['answer_4', 'answer_5', 'answer_6'],
          supportingResponseIds: ['response_4', 'response_5', 'response_6'],
          supportingEvidenceIds: ['theme_4', 'theme_5', 'theme_6'],
          supportingTargetIds: ['target_2'],
        },
      ],
      actions: [], targets: [], issues: [],
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      title: 'Networking',
      semanticDimension: 'networking_quality',
      evidenceThemeKey: 'networking_and_expo',
      evidenceThemeKeys: ['networking', 'networking_and_expo'],
      mentionCount: 6,
      supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3', 'answer_4', 'answer_5', 'answer_6'],
      supportingResponseIds: ['response_1', 'response_2', 'response_3', 'response_4', 'response_5', 'response_6'],
      supportingEvidenceIds: ['theme_1', 'theme_2', 'theme_3', 'theme_4', 'theme_5', 'theme_6'],
      supportingTargetIds: ['target_1', 'target_2'],
      sourceCount: 2,
      evidence: { uniqueAnalyzedResponseCount: 6 },
    })
  })

  it('merges materially equivalent claim wording without requiring shared evidence', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        {
          themeKey: 'networking', label: 'Networking', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(2),
          statement: 'Attendees consistently reported that the location was perfect for a relaxed networking event.',
          supportingAnswerIds: ['answer_1', 'answer_2'], supportingResponseIds: ['response_1', 'response_2'],
        },
        {
          themeKey: 'networking_and_expo', label: 'Networking and expo', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.85, evidence: evidence(2),
          statement: 'Attendees consistently described the venue as ideal for relaxed networking.',
          supportingAnswerIds: ['answer_3', 'answer_4'], supportingResponseIds: ['response_3', 'response_4'],
        },
      ], actions: [], targets: [], issues: [],
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      title: 'Networking',
      mentionCount: 4,
      supportingResponseIds: ['response_1', 'response_2', 'response_3', 'response_4'],
    })
  })

  it('merges duplicate wording from separate questions when the underlying answers overlap', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        {
          themeKey: 'venue_fit', label: 'Venue fit', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(2),
          statement: 'The venue supported relaxed attendee connections.', supportingAnswerIds: ['answer_1', 'answer_2'], supportingResponseIds: ['response_1', 'response_2'],
        },
        {
          themeKey: 'peer_connections', label: 'Peer connections', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(2),
          statement: 'The venue supported relaxed attendee connections.', supportingAnswerIds: ['answer_2', 'answer_3'], supportingResponseIds: ['response_2', 'response_3'],
        },
      ], actions: [], targets: [], issues: [],
    })

    expect(findings).toHaveLength(1)
    expect(findings[0].mentionCount).toBe(3)
    expect(findings[0].supportingAnswerIds).toEqual(['answer_1', 'answer_2', 'answer_3'])
  })

  it('keeps related but materially different outcomes separate', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        {
          themeKey: 'networking_environment', label: 'Networking environment', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3),
          statement: 'Attendees valued the relaxed networking environment.', supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'], supportingResponseIds: ['response_1', 'response_2', 'response_3'],
        },
        {
          themeKey: 'expo_discovery', label: 'Expo sponsor discovery', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.8, evidence: evidence(3),
          statement: 'Attendees struggled to find relevant expo sponsors.', supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'], supportingResponseIds: ['response_1', 'response_2', 'response_3'],
        },
      ], actions: [], targets: [], issues: [],
    })

    expect(findings).toHaveLength(2)
    expect(findings.map((finding) => finding.title)).toEqual(expect.arrayContaining(['Networking', 'Expo sponsor value']))
  })

  it('deduplicates before ranking so an equivalent generic candidate cannot consume a top slot', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        {
          themeKey: 'networking', label: 'Networking', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3),
          statement: 'Attendees valued the relaxed networking environment.', supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'], supportingResponseIds: ['response_1', 'response_2', 'response_3'],
        },
        {
          themeKey: 'networking_and_expo', label: 'Networking and expo', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3),
          statement: 'Attendees valued the relaxed networking environment.', supportingAnswerIds: ['answer_2', 'answer_3', 'answer_4'], supportingResponseIds: ['response_2', 'response_3', 'response_4'],
        },
        { themeKey: 'content', label: 'Practical content', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3) },
      ], actions: [], targets: [], issues: [],
    })

    expect(findings.map((finding) => finding.title)).toEqual(['Networking', 'Practical content'])
  })

  it('also consolidates equivalent next-event recommendations before they are ranked', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [],
      actions: [
        {
          themeKey: 'networking', title: 'Improve networking format', description: 'Give attendees more support for relaxed networking.', count: 2,
          actionWindow: 'LATER', confidence: 0.8, evidence: evidence(2), supportingAnswerIds: ['answer_1', 'answer_2'], supportingResponseIds: ['response_1', 'response_2'],
        },
        {
          themeKey: 'networking_and_expo', title: 'Improve expo networking format', description: 'Give attendees more support for relaxed networking.', count: 2,
          actionWindow: 'LATER', confidence: 0.8, evidence: evidence(2), supportingAnswerIds: ['answer_2', 'answer_3'], supportingResponseIds: ['response_2', 'response_3'],
        },
      ], targets: [], issues: [],
    })

    expect(findings).toEqual([
      expect.objectContaining({
        title: 'Improve networking format',
        classification: 'next-event',
        mentionCount: 3,
        supportingAnswerIds: ['answer_1', 'answer_2', 'answer_3'],
      }),
    ])
  })

  it('ranks strong, consistent, and emerging evidence by prominence without hiding any eligible tier', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'emerging', label: 'Emerging', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(2) },
        { themeKey: 'consistent', label: 'Consistent', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3) },
        { themeKey: 'strong', label: 'Strong', count: 8, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(8) },
      ],
      actions: [], targets: [], issues: [],
    })

    expect(findings.map((finding) => [finding.title, finding.evidenceTier])).toEqual([
      ['Strong', 'STRONG'],
      ['Consistent', 'REPEATED'],
      ['Emerging', 'EMERGING'],
    ])
  })

  it('uses canonical statements and question context for lifecycle classification while retaining provenance', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        {
          themeKey: 'structured_networking', label: 'Structured networking', count: 2, sentimentLabel: 'MIXED', confidence: 0.8,
          statement: 'A few attendees wanted more structured networking time.', questionIntent: 'improvement',
          supportingAnswerIds: ['answer_1', 'answer_2'], evidence: evidence(2),
        },
      ],
      actions: [], targets: [], issues: [],
    })

    expect(findings[0]).toMatchObject({
      description: 'A few attendees wanted more structured networking time.',
      kind: 'opportunity',
      classification: 'next-event',
      evidenceTier: 'EMERGING',
      supportingAnswerIds: ['answer_1', 'answer_2'],
    })
  })

  it('uses lifecycle only to frame evidence-backed risk actions', () => {
    const input = {
      themes: [{
        themeKey: 'room_environment_av', label: 'Audio quality', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.8,
        statement: 'Attendees asked for clearer audio.', questionIntent: 'friction' as const, evidence: evidence(3),
      }],
      actions: [], targets: [], issues: [],
    }

    expect(buildEventIntelligenceFindings({ ...input, context: { lifecycle: 'PRE_EVENT' } })[0]?.classification).toBe('next-event')
    expect(buildEventIntelligenceFindings({ ...input, context: { lifecycle: 'IN_EVENT' } })[0]?.classification).toBe('current-event')
    expect(buildEventIntelligenceFindings({ ...input, context: { lifecycle: 'POST_EVENT' } })[0]?.classification).toBe('after-event')
  })

  it('merges mechanism-suffixed rating and qualitative findings for one target', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        {
          themeKey: 'speaker_clarity_engagement', label: 'Speaker clarity and engagement', count: 2,
          sentimentLabel: 'POSITIVE', confidence: 0.85, evidence: evidence(2),
          statement: 'Noah Williams was clear, expert, and engaging.', targetIdentity: 'speaker:noah', targetName: 'Noah Williams', targetKind: 'SPEAKER',
          questionTypes: ['VOICE'], supportingAnswerIds: ['a1', 'a2'], supportingResponseIds: ['r1', 'r2'],
        },
        {
          themeKey: 'speaker_clarity_engagement_rating', label: 'Speaker clarity and engagement rating', count: 2,
          sentimentLabel: 'POSITIVE', confidence: 0.9, evidence: evidence(2),
          statement: "Noah Williams's delivery was rated 5 out of 5.", targetIdentity: 'speaker:noah', targetName: 'Noah Williams', targetKind: 'SPEAKER',
          questionTypes: ['RATING_1_TO_5'], supportingAnswerIds: ['a3', 'a4'], supportingResponseIds: ['r3', 'r4'],
        },
      ], actions: [], targets: [], issues: [],
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      title: 'Speaker clarity and engagement',
      semanticDimension: 'speaker_clarity_engagement',
      targetIdentity: 'speaker:noah',
      mentionCount: 4,
      evidenceModalities: ['qualitative', 'structured'],
      description: 'Noah Williams was consistently rated highly and described as clear, expert, and engaging.',
    })
  })

  it('preserves the same semantic dimension for different targets', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'speaker_clarity', label: 'Speaker clarity', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(2), statement: 'The speaker was clear.', targetIdentity: 'speaker:a', targetKind: 'SPEAKER' },
        { themeKey: 'speaker_clarity_rating', label: 'Speaker clarity rating', count: 2, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(2), statement: 'The speaker was clear.', targetIdentity: 'speaker:b', targetKind: 'SPEAKER' },
      ], actions: [], targets: [], issues: [],
    })
    expect(findings).toHaveLength(2)
    expect(new Set(findings.map((finding) => finding.targetIdentity))).toEqual(new Set(['speaker:a', 'speaker:b']))
  })

  it('keeps opposite conclusions distinct without exposing duplicate titles', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [
        { themeKey: 'speaker_clarity_positive', label: 'Speaker clarity and engagement', count: 3, sentimentLabel: 'POSITIVE', confidence: 0.8, evidence: evidence(3), statement: 'The speaker was clear and engaging.', targetIdentity: 'speaker:a', targetKind: 'SPEAKER' },
        { themeKey: 'speaker_clarity_negative', label: 'Speaker clarity and engagement', count: 3, sentimentLabel: 'NEGATIVE', confidence: 0.8, evidence: evidence(3), statement: 'The speaker was difficult to follow.', targetIdentity: 'speaker:a', targetKind: 'SPEAKER' },
      ], actions: [], targets: [], issues: [],
    })
    expect(findings.map((finding) => finding.title)).toEqual(expect.arrayContaining([
      'Speaker clarity and engagement strengths',
      'Speaker clarity and engagement concerns',
    ]))
  })

  it('does not leak unsupported compound taxonomy words into a party finding', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [{
        themeKey: 'networking_expo', label: 'Networking and expo', count: 4, sentimentLabel: 'POSITIVE', confidence: 0.88, evidence: evidence(4),
        statement: 'Attendees made useful connections in a relaxed and welcoming setting.',
        evidenceText: ['I met new people and had fun.', 'It was a welcoming community and I would return alone.'],
      }], actions: [], targets: [], issues: [], context: { eventName: 'Club Ichi', eventType: 'PARTY' },
    })
    expect(findings[0].title).toBe('Networking')
    expect(findings[0].title.toLowerCase()).not.toContain('expo')
  })

  it('retains expo-specific wording when reliable event context supports it', () => {
    const findings = buildEventIntelligenceFindings({
      themes: [{
        themeKey: 'networking_expo', label: 'Networking and expo', count: 4, sentimentLabel: 'POSITIVE', confidence: 0.88, evidence: evidence(4),
        statement: 'Attendees made useful connections on the expo floor.',
      }], actions: [], targets: [], issues: [], context: { eventName: 'Canadian Meetings and Events Expo', eventType: 'TRADE_SHOW' },
    })
    expect(findings[0].title).toBe('Expo networking')
  })
})

describe('evidenceStrengthForTier', () => {
  it('never promotes a one-response canonical tier to strong', () => {
    expect(evidenceStrengthForTier('ISOLATED')).toBe('weak')
    expect(evidenceStrengthForTier('EMERGING')).toBe('directional')
    expect(evidenceStrengthForTier('STRONG')).toBe('strong')
  })
})
