import { describe, expect, it } from 'vitest'
import {
  buildActionBriefs,
  briefFromAttentionItem,
  deriveBriefSentiment,
  formatActionBriefText,
  formatEventOperationsSummary,
  normalizeBriefSeverity,
  type ActionBriefSource,
} from './action-briefs'

function source(overrides: Partial<ActionBriefSource> = {}): ActionBriefSource {
  return {
    id: 'cluster_1',
    taxonomyKey: 'room_environment_av',
    title: 'AV issues in the main hall',
    summary: 'Operational pattern detected in room environment feedback',
    priorityLevel: 'Immediate',
    confidence: 0.8,
    evidenceCount: 5,
    recommendedNextStep: 'Send an AV tech to the main hall',
    status: 'NEW',
    affectedTarget: { id: 'target_1', name: 'Main Hall', category: 'LOCATION' },
    affectedQuestion: null,
    representativeEvidence: [
      { id: 'ev_1', sentimentScore: -0.6 },
      { id: 'ev_2', sentimentScore: -0.4 },
    ],
    ...overrides,
  }
}

describe('normalizeBriefSeverity', () => {
  it('maps known priority levels and defaults unknowns to Informational', () => {
    expect(normalizeBriefSeverity('Immediate')).toBe('Immediate')
    expect(normalizeBriefSeverity('soon')).toBe('Soon')
    expect(normalizeBriefSeverity('WATCH')).toBe('Watch')
    expect(normalizeBriefSeverity('whatever')).toBe('Informational')
    expect(normalizeBriefSeverity(null)).toBe('Informational')
  })
})

describe('deriveBriefSentiment', () => {
  it('classifies from average evidence sentiment', () => {
    expect(deriveBriefSentiment([{ id: 'a', sentimentScore: -0.5 }])).toBe('negative')
    expect(deriveBriefSentiment([{ id: 'a', sentimentScore: 0.5 }])).toBe('positive')
    expect(deriveBriefSentiment([{ id: 'a', sentimentScore: 0 }])).toBe('mixed')
  })

  it('returns neutral when no evidence sentiment is available', () => {
    expect(deriveBriefSentiment([])).toBe('neutral')
    expect(deriveBriefSentiment([{ id: 'a', sentimentScore: null }])).toBe('neutral')
  })
})

describe('briefFromAttentionItem', () => {
  it('projects an operator-ready brief from a cluster', () => {
    const brief = briefFromAttentionItem(source())
    expect(brief).toMatchObject({
      id: 'cluster_1',
      clusterId: 'cluster_1',
      title: 'AV issues in the main hall',
      affectedArea: 'Main Hall',
      evidenceCount: 5,
      sentiment: 'negative',
      severity: 'Immediate',
      recommendedAction: 'Send an AV tech to the main hall',
      status: 'NEW',
      evidenceId: 'ev_1',
    })
  })

  it('falls back to the affected question label when no target exists', () => {
    const brief = briefFromAttentionItem(
      source({
        affectedTarget: null,
        affectedQuestion: { id: 'q1', key: 'q1', label: 'How was check-in?', order: 0 },
      }),
    )
    expect(brief.affectedArea).toBe('How was check-in?')
  })

  it('uses taxonomyKey as a stable id when cluster id is null but leaves clusterId null', () => {
    const brief = briefFromAttentionItem(source({ id: null }))
    expect(brief.id).toBe('room_environment_av')
    expect(brief.clusterId).toBeNull()
    expect(brief.evidenceId).toBe('ev_1')
  })
})

describe('buildActionBriefs', () => {
  it('excludes closed clusters by default and sorts by severity then evidence', () => {
    const briefs = buildActionBriefs([
      source({ id: 'a', priorityLevel: 'Watch', evidenceCount: 9, status: 'NEW' }),
      source({ id: 'b', priorityLevel: 'Immediate', evidenceCount: 2, status: 'INVESTIGATING' }),
      source({ id: 'c', priorityLevel: 'Immediate', evidenceCount: 10, status: 'RESOLVED' }),
      source({ id: 'd', priorityLevel: 'Soon', evidenceCount: 1, status: 'DISMISSED' }),
    ])

    // RESOLVED + DISMISSED dropped; Immediate before Watch.
    expect(briefs.map((brief) => brief.id)).toEqual(['b', 'a'])
  })

  it('can include closed clusters and respects a limit', () => {
    const briefs = buildActionBriefs(
      [
        source({ id: 'a', priorityLevel: 'Immediate', status: 'RESOLVED' }),
        source({ id: 'b', priorityLevel: 'Soon', status: 'NEW' }),
      ],
      { includeClosed: true, limit: 1 },
    )
    expect(briefs).toHaveLength(1)
    expect(briefs[0].id).toBe('a')
  })

  it('returns an empty list for no input', () => {
    expect(buildActionBriefs(null)).toEqual([])
    expect(buildActionBriefs(undefined)).toEqual([])
  })
})

describe('formatActionBriefText', () => {
  it('formats a single brief as evidence-backed plain text', () => {
    const brief = briefFromAttentionItem(source())
    const text = formatActionBriefText(brief)
    expect(text).toContain('[Immediate] AV issues in the main hall')
    expect(text).toContain('Area: Main Hall')
    expect(text).toContain('Sentiment: negative · Evidence: 5 · Status: NEW')
    expect(text).toContain('Recommended: Send an AV tech to the main hall')
  })
})

describe('formatEventOperationsSummary', () => {
  it('builds a numbered, evidence-backed operations summary', () => {
    const briefs = buildActionBriefs([
      source({ id: 'a', priorityLevel: 'Immediate', evidenceCount: 5, status: 'NEW' }),
      source({ id: 'b', title: 'Long check-in lines', priorityLevel: 'Soon', evidenceCount: 3, status: 'INVESTIGATING' }),
    ])
    const text = formatEventOperationsSummary({
      eventName: 'WEC 2026',
      briefs,
      generatedAt: new Date('2026-06-22T12:00:00.000Z'),
    })
    expect(text).toContain('Event Operations Summary — WEC 2026')
    expect(text).toContain('Generated 2026-06-22T12:00:00.000Z')
    expect(text).toContain('Open action briefs: 2')
    expect(text).toContain('1. [Immediate] AV issues in the main hall — Main Hall (5 evidence, negative)')
    expect(text).toContain('2. [Soon] Long check-in lines')
  })

  it('handles the empty state without filler', () => {
    const text = formatEventOperationsSummary({
      eventName: 'WEC 2026',
      briefs: [],
      generatedAt: new Date('2026-06-22T12:00:00.000Z'),
    })
    expect(text).toContain('No open action briefs.')
    expect(text).not.toContain('Open action briefs:')
  })
})
