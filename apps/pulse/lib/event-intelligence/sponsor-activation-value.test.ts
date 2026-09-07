import { describe, expect, it } from 'vitest'
import {
  buildSponsorActivationValues,
  sponsorSentimentLabel,
  type SponsorActivationAttentionSource,
  type SponsorActivationBreakdownSource,
} from './sponsor-activation-value'

function breakdown(overrides: Partial<SponsorActivationBreakdownSource> = {}): SponsorActivationBreakdownSource {
  return {
    surveyTargetId: 'target_sponsor',
    name: 'Acme Lounge',
    eventStructureItemKind: 'SPONSOR_ACTIVATION',
    responseCount: 8,
    answerCount: 12,
    avgSentiment: 0.4,
    highUrgencyCount: 1,
    topThemes: [
      { label: 'Great swag', count: 5 },
      { label: 'Crowded', count: 3 },
    ],
    ...overrides,
  }
}

describe('sponsorSentimentLabel', () => {
  it('classifies average sentiment', () => {
    expect(sponsorSentimentLabel(0.4)).toBe('positive')
    expect(sponsorSentimentLabel(-0.4)).toBe('negative')
    expect(sponsorSentimentLabel(0)).toBe('mixed')
    expect(sponsorSentimentLabel(null)).toBe('neutral')
  })
})

describe('buildSponsorActivationValues', () => {
  it('only includes targets attached to sponsor activation structure items', () => {
    const values = buildSponsorActivationValues(
      [
        breakdown({ surveyTargetId: 'sponsor_1', name: 'Acme Lounge' }),
        breakdown({ surveyTargetId: 'session_1', name: 'Keynote', eventStructureItemKind: 'SESSION' }),
        breakdown({ surveyTargetId: null, name: 'Event-level feedback', eventStructureItemKind: null }),
      ],
      [],
    )
    expect(values).toHaveLength(1)
    expect(values[0]).toMatchObject({
      surveyTargetId: 'sponsor_1',
      name: 'Acme Lounge',
      mentions: 12,
      responseCount: 8,
      sentimentLabel: 'positive',
    })
  })

  it('attaches issues and a representative quote from the attention queue by target', () => {
    const attention: SponsorActivationAttentionSource[] = [
      {
        id: 'cluster_a',
        title: 'Lounge too crowded',
        priorityLevel: 'Immediate',
        evidenceCount: 4,
        affectedTarget: { id: 'sponsor_1' },
        representativeEvidence: [{ id: 'ev_1', transcriptSnippet: 'The lounge was packed all day' }],
      },
      {
        id: 'cluster_b',
        title: 'Unrelated session issue',
        priorityLevel: 'Soon',
        evidenceCount: 2,
        affectedTarget: { id: 'session_1' },
        representativeEvidence: [{ id: 'ev_2', transcriptSnippet: 'n/a' }],
      },
    ]

    const values = buildSponsorActivationValues(
      [breakdown({ surveyTargetId: 'sponsor_1' })],
      attention,
    )

    expect(values[0].issues).toHaveLength(1)
    expect(values[0].issues[0]).toMatchObject({
      id: 'cluster_a',
      title: 'Lounge too crowded',
      severity: 'Immediate',
      evidenceCount: 4,
      quote: 'The lounge was packed all day',
      evidenceId: 'ev_1',
    })
    expect(values[0].topThemes).toEqual([
      { label: 'Great swag', count: 5 },
      { label: 'Crowded', count: 3 },
    ])
  })

  it('ranks sponsors by mentions and respects a limit', () => {
    const values = buildSponsorActivationValues(
      [
        breakdown({ surveyTargetId: 's1', name: 'Quiet booth', answerCount: 2 }),
        breakdown({ surveyTargetId: 's2', name: 'Popular booth', answerCount: 20 }),
      ],
      [],
      { limit: 1 },
    )
    expect(values).toHaveLength(1)
    expect(values[0].name).toBe('Popular booth')
  })

  it('returns an empty list when there is no sponsor activation feedback', () => {
    expect(buildSponsorActivationValues([], [])).toEqual([])
    expect(buildSponsorActivationValues(null, null)).toEqual([])
    expect(
      buildSponsorActivationValues([breakdown({ eventStructureItemKind: 'SESSION' })], []),
    ).toEqual([])
  })
})
