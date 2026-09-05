import { describe, expect, it } from 'vitest'
import { eventEditorialWritingRules, hasMechanicalEditorialLanguage, synthesizeEventEditorial } from './editorial-engine'

const facts = [
  { title: 'Practical sessions', statement: 'Practical sessions are giving attendees useful takeaways.', kind: 'positive' as const, evidenceTier: 'STRONG', mentionCount: 42, sentimentLabel: 'POSITIVE', scope: 'SESSION' },
  { title: 'Networking quality', statement: 'Attendees value the quality of peer connections.', kind: 'positive' as const, evidenceTier: 'REPEATED', mentionCount: 24, sentimentLabel: 'POSITIVE', scope: 'EVENT' },
  { title: 'Session pacing', statement: 'Several attendees found the session pacing rushed.', kind: 'risk' as const, evidenceTier: 'REPEATED', mentionCount: 17, sentimentLabel: 'NEGATIVE', scope: 'SESSION' },
  { title: 'Venue wayfinding', statement: 'Attendees repeatedly found venue wayfinding unclear.', kind: 'risk' as const, evidenceTier: 'REPEATED', mentionCount: 13, sentimentLabel: 'NEGATIVE', scope: 'AREA' },
  { title: 'Structured introductions', statement: 'Attendees want more facilitated introductions.', kind: 'opportunity' as const, evidenceTier: 'REPEATED', mentionCount: 11, sentimentLabel: 'MIXED', scope: 'EVENT' },
  { title: 'Coffee temperature', statement: 'One attendee mentioned cold coffee.', kind: 'signal' as const, evidenceTier: 'ISOLATED', mentionCount: 1, sentimentLabel: 'NEGATIVE' },
]

function sentenceCount(value: string) {
  return value.match(/[.!?](?:\s|$)/g)?.length ?? 0
}

describe('Event Intelligence editorial engine', () => {
  it('synthesizes the whole pre-event picture from multiple major clusters', () => {
    const copy = synthesizeEventEditorial({ lifecycle: 'PRE_EVENT', facts })

    expect(copy.headline).toBe('Practical sessions are shaping expectations, while session pacing is the planning tension to resolve before doors open.')
    for (const theme of ['practical sessions', 'networking quality', 'session pacing', 'venue wayfinding', 'structured introductions']) {
      expect(copy.synopsis.toLowerCase()).toContain(theme)
    }
    expect(sentenceCount(copy.synopsis)).toBeGreaterThanOrEqual(3)
    expect(sentenceCount(copy.synopsis)).toBeLessThanOrEqual(5)
    expect(copy.synopsis).toMatch(/expectations and excitement|before doors open/)
    expect(copy.synopsis).not.toMatch(/^\d|responses|answers|sentiment/i)
    expect(copy.synopsis).not.toContain('Coffee temperature')
    expect(hasMechanicalEditorialLanguage(`${copy.headline} ${copy.synopsis}`)).toBe(false)
  })

  it('synthesizes the whole during-event picture with a live action horizon', () => {
    const copy = synthesizeEventEditorial({ lifecycle: 'DURING_EVENT', facts })

    expect(copy.headline).toBe('Practical sessions are carrying the experience, while session pacing is the live friction that still needs attention.')
    expect(copy.synopsis).toContain('What is working')
    expect(copy.synopsis).toContain('The biggest live friction')
    expect(copy.synopsis).toContain('The strongest live opportunities')
    expect(copy.synopsis).toMatch(/while there is still time/i)
    expect(sentenceCount(copy.synopsis)).toBeGreaterThanOrEqual(3)
    expect(copy.synopsis).not.toMatch(/analyzed answers|configured feedback points/i)
  })

  it('synthesizes the whole post-event picture as leadership learning', () => {
    const copy = synthesizeEventEditorial({ lifecycle: 'POST_EVENT', facts })

    expect(copy.headline).toBe('Practical sessions defined the experience, while session pacing became the clearest lesson to carry forward.')
    expect(copy.synopsis).toContain('ultimately defined')
    expect(copy.synopsis).toContain('biggest weaknesses and friction')
    expect(copy.synopsis).toContain('lessons and next-event opportunities')
    expect(copy.synopsis).toContain('leadership should carry forward')
    expect(sentenceCount(copy.synopsis)).toBeGreaterThanOrEqual(3)
    expect(copy.synopsis).not.toContain('Coffee temperature')
    expect(copy.synopsis).not.toMatch(/will improve|the data indicates|feedback points to/i)
  })

  it('does not repeat the visible event name or introduce unsupported claims', () => {
    const eventName = 'Leadership Forum'
    const copy = synthesizeEventEditorial({
      lifecycle: 'DURING_EVENT',
      eventName,
      facts: facts.map((fact, index) => index === 0 ? { ...fact, title: `${eventName} practical sessions` } : fact),
    })

    expect(`${copy.headline} ${copy.synopsis}`).not.toContain(eventName)
    expect(`${copy.headline} ${copy.synopsis}`).not.toMatch(/record attendance|revenue|sold out|best-ever/i)
    expect(copy.synopsis).not.toContain('Coffee temperature')
  })

  it('publishes a shared whole-event writing contract for every lifecycle', () => {
    const pre = eventEditorialWritingRules('PRE_EVENT')
    const during = eventEditorialWritingRules('DURING_EVENT')
    const post = eventEditorialWritingRules('POST_EVENT')

    for (const rules of [pre, during, post]) {
      expect(rules).toContain('whole event picture')
      expect(rules).toContain('three to five concise sentences')
      expect(rules).toContain('Never repeat it')
      expect(rules).toContain('Do not open with counts')
    }
    expect(pre).toMatch(/expect|excites|before the event/)
    expect(during).toMatch(/working across the event|live friction|time to act/)
    expect(post).toMatch(/ultimately defined|carry forward|post-event feedback/)
  })

  it('keeps sparse evidence cautious instead of inventing an event story', () => {
    const copy = synthesizeEventEditorial({ lifecycle: 'DURING_EVENT', facts: [facts.at(-1)!] })

    expect(copy.headline).toBe('The event story is still forming.')
    expect(copy.synopsis).not.toContain('Coffee temperature')
  })
})
