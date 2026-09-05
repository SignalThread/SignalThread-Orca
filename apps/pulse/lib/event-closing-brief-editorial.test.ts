import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearEventClosingBriefEditorialMemoryCacheForTests,
  synthesizeEventClosingBriefEditorial,
  type EventClosingBriefEditorialCache,
  type EventClosingBriefEditorialInput,
} from './event-closing-brief-editorial'

function input(overrides: Partial<EventClosingBriefEditorialInput['metrics']> = {}): EventClosingBriefEditorialInput {
  return {
    event: { id: 'event-toronto', name: 'Toronto Clubhouse', lifecycle: 'POST_EVENT' },
    metrics: {
      responseCount: 25,
      answerCount: 91,
      sentiment: 'Mostly positive',
      averageSentiment: 0.72,
      listeningPointCount: 3,
      representedListeningPointCount: 2,
      representedPercent: 67,
      ...overrides,
    },
    findings: {
      keyFindings: [{
        id: 'finding-networking',
        title: 'Networking and expo',
        statement: 'Attendees described the venue as ideal for relaxed networking.',
        kind: 'positive',
        classification: 'informational',
        evidenceTier: 'STRONG',
        confidence: 0.9,
        mentionCount: 18,
        responseCount: 14,
        sentiment: 'POSITIVE',
        target: { id: 'event', name: null, kind: 'event' },
        evidenceModalities: ['qualitative'],
        evidenceText: ['The relaxed room made it easy to meet new people.'],
        representativeEvidence: [{ id: 'evidence-1', excerpt: 'The relaxed room made it easy to meet new people.', question: 'What worked?', source: 'Main lounge' }],
      }, {
        id: 'finding-pacing',
        title: 'Speaker pacing',
        statement: 'Several attendees wanted speakers to slow down.',
        kind: 'risk',
        classification: 'after-event',
        evidenceTier: 'REPEATED',
        confidence: 0.78,
        mentionCount: 6,
        responseCount: 5,
        sentiment: 'NEGATIVE',
        target: { id: 'event', name: null, kind: 'event' },
        evidenceModalities: ['qualitative'],
        evidenceText: ['The delivery moved quickly and needed more explanation.'],
        representativeEvidence: [],
      }, {
        id: 'finding-introductions',
        title: 'More structured introductions',
        statement: 'Attendees wanted more facilitated introductions.',
        kind: 'opportunity',
        classification: 'next-event',
        evidenceTier: 'EMERGING',
        confidence: 0.71,
        mentionCount: 3,
        responseCount: 3,
        sentiment: 'MIXED',
        target: { id: 'event', name: null, kind: 'event' },
        evidenceModalities: ['qualitative'],
        evidenceText: ['A few guests wanted a direct introduction to relevant people.'],
        representativeEvidence: [],
      }],
      whatWorked: [{
        id: 'finding-networking', title: 'Networking and expo', statement: 'Attendees described the venue as ideal for relaxed networking.',
        kind: 'positive', classification: 'informational', evidenceTier: 'STRONG', confidence: 0.9, mentionCount: 18,
        responseCount: 14, sentiment: 'POSITIVE', target: { id: 'event', name: null, kind: 'event' },
        evidenceModalities: ['qualitative'], evidenceText: ['The relaxed room made it easy to meet new people.'], representativeEvidence: [],
      }],
      friction: [{
        id: 'finding-pacing',
        title: 'Speaker pacing',
        statement: 'Several attendees wanted speakers to slow down.',
        kind: 'risk', classification: 'after-event',
        evidenceTier: 'REPEATED',
        confidence: 0.78,
        mentionCount: 6,
        responseCount: 5, sentiment: 'NEGATIVE', target: { id: 'event', name: null, kind: 'event' },
        evidenceModalities: ['qualitative'], evidenceText: ['The delivery moved quickly and needed more explanation.'], representativeEvidence: [],
      }],
      nextEvent: [{
        id: 'finding-introductions',
        title: 'More structured introductions',
        statement: 'Attendees wanted more facilitated introductions.',
        kind: 'opportunity', classification: 'next-event',
        evidenceTier: 'EMERGING',
        confidence: 0.71,
        mentionCount: 3,
        responseCount: 3, sentiment: 'MIXED', target: { id: 'event', name: null, kind: 'event' },
        evidenceModalities: ['qualitative'], evidenceText: ['A few guests wanted a direct introduction to relevant people.'], representativeEvidence: [],
      }],
    },
    followThrough: [{ title: 'Review speaker pacing', status: 'OPEN', priority: 'Soon', owner: 'Jordan Lee', dueAt: null }],
    representativeEvidence: [{
      id: 'evidence-1',
      excerpt: 'The relaxed room made it easy to meet new people.',
      question: 'What worked?',
      source: 'Main lounge',
      confidence: 0.9,
    }],
    limitations: { unrepresentedListeningPointCount: 1, evidenceExcerptCount: 8 },
  }
}

function validCopy() {
  return {
    headline: 'A welcoming networking environment anchored a positive event outcome.',
    executiveSummary: 'The networking environment anchored the strongest positive outcome. Speaker pacing remained the clearest area for follow-through. More structured introductions emerged as the next opportunity to examine.',
    keyTakeaway: 'Protect the relaxed setting that enabled connection while giving speakers clearer pacing guidance.',
    whatWorkedNarrative: 'Attendees valued a relaxed, welcoming environment that made new connections feel easy.',
    frictionNarrative: 'Speaker pacing was the clearest recurring source of friction.',
    nextEventNarrative: 'Future planning should pair the informal setting with more structured introductions.',
    coverageNarrative: 'The brief reflects broad feedback while acknowledging that one listening area was not represented.',
    findingNarratives: [
      { findingId: 'finding-networking', narrative: 'Attendees described the relaxed room as a setting where meeting new people felt natural and comfortable.' },
      { findingId: 'finding-pacing', narrative: 'Several comments connected rushed delivery with a need for slower pacing and clearer explanation.' },
      { findingId: 'finding-introductions', narrative: 'Early feedback suggests some guests wanted direct introductions to people relevant to their goals.' },
    ],
  }
}

function sentenceCount(value: string) {
  return value.match(/[.!?](?:\s|$)/g)?.length ?? 0
}

function cache(): EventClosingBriefEditorialCache & { records: Map<string, unknown> } {
  const records = new Map<string, unknown>()
  return {
    records,
    async get(key) { return records.get(key) ?? null },
    async set(key, value) { records.set(key, value) },
  }
}

describe('Closing Brief editorial synthesis', () => {
  beforeEach(() => {
    clearEventClosingBriefEditorialMemoryCacheForTests()
  })

  it('passes structured canonical intelligence to the approved model writer', async () => {
    const writer = vi.fn().mockResolvedValue(validCopy())
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache(), now: new Date('2026-08-13T12:00:00Z') })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.headline).toContain('networking environment')
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ id: 'event-toronto', lifecycle: 'POST_EVENT' }),
        metrics: expect.objectContaining({ responseCount: 25, answerCount: 91 }),
        findings: expect.objectContaining({
          keyFindings: expect.arrayContaining([
            expect.objectContaining({
              id: 'finding-networking',
              responseCount: 14,
              evidenceText: ['The relaxed room made it easy to meet new people.'],
              representativeEvidence: [expect.objectContaining({ id: 'evidence-1', question: 'What worked?' })],
            }),
          ]),
          whatWorked: [expect.objectContaining({ title: 'Networking and expo', evidenceTier: 'STRONG' })],
        }),
        representativeEvidence: [expect.objectContaining({ id: 'evidence-1', source: 'Main lounge' })],
      }),
      expect.objectContaining({ model: expect.any(String), promptVersion: expect.any(String) }),
    )
  })

  it('broadens a schema-valid post-event synopsis that collapses to one cluster', async () => {
    const writerCopy = {
      ...validCopy(),
      executiveSummary: 'Networking made connection feel natural. The relaxed room supported networking. Informal conversation remained the central networking story.',
    }
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(writerCopy),
      cache: cache(),
    })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.executiveSummary).toContain('networking and expo')
    expect(editorial.copy.executiveSummary).toContain('speaker pacing')
    expect(editorial.copy.executiveSummary).toContain('structured introductions')
  })

  it('replaces a metric-dump opening with the grounded whole-event synopsis', async () => {
    const writerCopy = {
      ...validCopy(),
      executiveSummary: '25 responses shaped the final read. Networking was the strongest outcome. Speaker pacing and structured introductions remain the key lessons.',
    }
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(writerCopy),
      cache: cache(),
    })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.executiveSummary).not.toMatch(/^25|^responses|^answers|^sentiment/i)
    expect(sentenceCount(editorial.copy.executiveSummary)).toBeGreaterThanOrEqual(3)
  })

  it('schema-validates output and rejects fabricated canonical fields', async () => {
    const writer = vi.fn().mockResolvedValue({ ...validCopy(), responseCount: 999 })
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache() })

    expect(editorial.source).toBe('fallback')
    expect(editorial.copy.executiveSummary).not.toMatch(/25 completed responses|analyzed answers|configured listening points/i)
    expect(editorial.copy.executiveSummary).not.toContain('999')
  })

  it('rejects unsupported numeric claims while allowing canonical metrics to remain authoritative', async () => {
    const writer = vi.fn().mockResolvedValue({
      ...validCopy(),
      executiveSummary: 'Feedback was positive across 999 listening areas, with speaker pacing the clearest follow-through priority.',
    })
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache() })

    expect(editorial.source).toBe('fallback')
    expect(editorial.copy.executiveSummary).not.toMatch(/25 completed responses|analyzed answers|configured listening points/i)
    expect(editorial.copy.executiveSummary).not.toContain('999')
  })

  it('replaces duplicate event identity and promotional overstatement without discarding grounded AI sections', async () => {
    const writer = vi.fn().mockResolvedValue({
      ...validCopy(),
      headline: 'Toronto Clubhouse delivered an outstanding and highly successful event.',
    })
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache() })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.headline).not.toContain('Toronto Clubhouse')
    expect(editorial.copy.headline).not.toContain('outstanding')
  })

  it('removes unsupported predictions about recommendation impact without discarding grounded AI prose', async () => {
    const writer = vi.fn().mockResolvedValue({
      ...validCopy(),
      nextEventNarrative: 'More structured introductions will improve attendee satisfaction.',
    })
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache() })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.nextEventNarrative).not.toContain('will improve')
    expect(editorial.copy.headline).toBe(validCopy().headline)
  })

  it('rejects mechanical repeated finding prose and uses a concise fallback', async () => {
    const repeated = 'Attendees consistently reported that the room supported networking.'
    const writer = vi.fn().mockResolvedValue({
      ...validCopy(),
      executiveSummary: repeated,
      keyTakeaway: repeated,
    })
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache() })

    expect(editorial.source).toBe('fallback')
    expect(editorial.copy.keyTakeaway).not.toContain('Attendees consistently reported')
  })

  it('returns the safe fallback when the provider fails', async () => {
    const writer = vi.fn().mockRejectedValue(new Error('provider unavailable'))
    const editorial = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: cache() })

    expect(editorial.source).toBe('fallback')
    expect(editorial.provider).toBeNull()
    expect(editorial.copy.whatWorkedNarrative).toContain('networking and expo')
    expect(editorial.copy.executiveSummary).toContain('networking and expo')
    expect(editorial.copy.executiveSummary).toContain('speaker pacing')
    expect(editorial.copy.executiveSummary).toContain('structured introductions')
    expect(sentenceCount(editorial.copy.executiveSummary)).toBeGreaterThanOrEqual(3)
    expect(sentenceCount(editorial.copy.executiveSummary)).toBeLessThanOrEqual(5)
    expect(editorial.copy.executiveSummary).not.toMatch(/^\d|responses|answers|sentiment/i)
    expect(`${editorial.copy.headline} ${editorial.copy.executiveSummary}`).not.toContain(input().event.name)
    expect(editorial.copy.findingNarratives).toEqual(expect.arrayContaining([
      expect.objectContaining({ findingId: 'finding-networking', narrative: expect.stringContaining('venue') }),
      expect.objectContaining({ findingId: 'finding-introductions', narrative: expect.stringMatching(/early|directional/i) }),
    ]))
  })

  it('fills a missing model narrative from that finding\'s canonical evidence without discarding valid AI prose', async () => {
    const copy = validCopy()
    copy.findingNarratives = copy.findingNarratives.slice(0, 1)
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(copy),
      cache: cache(),
    })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.findingNarratives.map((item) => item.findingId)).toEqual([
      'finding-networking', 'finding-pacing', 'finding-introductions',
    ])
    expect(editorial.copy.findingNarratives[0]).toEqual(copy.findingNarratives[0])
    expect(editorial.copy.findingNarratives[2].narrative).toMatch(/early|directional/i)
  })

  it('replaces established-sounding prose for an Emerging finding without discarding the editorial payload', async () => {
    const copy = validCopy()
    copy.findingNarratives[2] = {
      findingId: 'finding-introductions',
      narrative: 'Guests need direct introductions and this is an established event-wide problem.',
    }
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(copy),
      cache: cache(),
    })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.findingNarratives[2].narrative).toMatch(/early|directional/i)
  })

  it('rejects narratives for findings outside the canonical payload', async () => {
    const copy = validCopy()
    copy.findingNarratives.push({
      findingId: 'invented-finding',
      narrative: 'An unsupported finding was added without canonical evidence.',
    })
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(copy),
      cache: cache(),
    })

    expect(editorial.source).toBe('fallback')
    expect(editorial.copy.findingNarratives.some((item) => item.findingId === 'invented-finding')).toBe(false)
  })

  it('cleans repeated sentences across finding narratives instead of printing duplicate prose', async () => {
    const copy = validCopy()
    copy.findingNarratives[1].narrative = copy.findingNarratives[0].narrative
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(copy),
      cache: cache(),
    })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.findingNarratives[1].narrative).not.toBe(editorial.copy.findingNarratives[0].narrative)
    expect(editorial.copy.findingNarratives[1].narrative).toContain('slow down')
  })

  it('removes recommendation language from finding explanations while keeping the grounded observation', async () => {
    const copy = validCopy()
    copy.findingNarratives[1].narrative = 'Several comments connected rushed delivery with reduced clarity. This suggests a need for speaker coaching.'
    const editorial = await synthesizeEventClosingBriefEditorial(input(), {
      writer: vi.fn().mockResolvedValue(copy),
      cache: cache(),
    })

    expect(editorial.source).toBe('openai')
    expect(editorial.copy.findingNarratives[1].narrative).toBe('Several comments connected rushed delivery with reduced clarity.')
  })

  it('reuses unchanged intelligence and regenerates when material intelligence changes', async () => {
    const sharedCache = cache()
    const writer = vi.fn().mockResolvedValue(validCopy())

    const first = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: sharedCache })
    clearEventClosingBriefEditorialMemoryCacheForTests()
    const unchanged = await synthesizeEventClosingBriefEditorial(input(), { writer, cache: sharedCache })
    const changed = await synthesizeEventClosingBriefEditorial(input({ answerCount: 92 }), { writer, cache: sharedCache })

    expect(first.cacheHit).toBe(false)
    expect(unchanged.cacheHit).toBe(true)
    expect(unchanged.inputHash).toBe(first.inputHash)
    expect(changed.inputHash).not.toBe(first.inputHash)
    expect(writer).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached prose when the bounded evidence package changes', async () => {
    const sharedCache = cache()
    const writer = vi.fn().mockResolvedValue(validCopy())
    const firstInput = input()
    const first = await synthesizeEventClosingBriefEditorial(firstInput, { writer, cache: sharedCache })
    clearEventClosingBriefEditorialMemoryCacheForTests()
    const changedInput = input()
    changedInput.findings.keyFindings[0].evidenceText = ['Guests said informal seating made introductions feel natural.']
    const changed = await synthesizeEventClosingBriefEditorial(changedInput, { writer, cache: sharedCache })

    expect(changed.inputHash).not.toBe(first.inputHash)
    expect(writer).toHaveBeenCalledTimes(2)
  })

  it('allows an explicit refresh to recompute an otherwise unchanged brief', async () => {
    const sharedCache = cache()
    const writer = vi.fn().mockResolvedValue(validCopy())
    await synthesizeEventClosingBriefEditorial(input(), { writer, cache: sharedCache })
    await synthesizeEventClosingBriefEditorial(input(), { writer, cache: sharedCache, forceRefresh: true })

    expect(writer).toHaveBeenCalledTimes(2)
  })
})
