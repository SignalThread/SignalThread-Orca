import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { renderEventClosingBriefPdf } from '@/lib/event-closing-brief-pdf'
import type { EventClosingBrief } from '@/lib/event-closing-brief'

const source = fs.readFileSync(path.join(process.cwd(), 'lib/event-closing-brief-pdf.ts'), 'utf8')

describe('renderEventClosingBriefPdf', () => {
  it('uses a purpose-built Letter document renderer with embedded Montserrat', () => {
    expect(source).toContain("import PDFDocument from 'pdfkit'")
    expect(source).toContain("@fontsource', 'montserrat'")
    expect(source).toContain("size: 'LETTER'")
    expect(source).toContain("document.registerFont('Montserrat'")
    expect(source).toContain("document.registerFont('Montserrat-Semibold'")
    expect(source).toContain("document.registerFont('Montserrat-Bold'")
  })

  it('renders report content from the canonical brief payload without dashboard controls', () => {
    for (const label of ['Executive summary', 'What the team should prepare for', 'The live read', 'What defined the event']) {
      expect(source).toContain(label)
    }
    expect(source).toContain('brief.editorial.copy.executiveSummary')
    expect(source).toContain('brief.editorial.copy.findingNarratives')
    expect(source).not.toContain('window.print')
    expect(source).not.toContain('Review evidence')
    expect(source).not.toContain('Open Intelligence')
    expect(source).toContain('sectionHeading(language.priorities)')
    expect(source).toContain('brief.decisions.afterEventFollowUp')
    expect(source).not.toContain('const metrics =')
    expect(source).not.toContain("sectionHeading('Representative attendee feedback')")
  })

  it('renders long canonical copy and missing optional values into an embedded-Montserrat PDF', async () => {
    const longFinding = Array.from({ length: 18 }, (_, index) => `Attendee evidence segment ${index + 1} describes practical value, clear takeaways, and the follow-through expected after the event.`).join(' ')
    const brief = {
      lifecyclePhase: 'POST_EVENT',
      event: { id: 'event-brief', name: 'SignalThread Summit' },
      generatedAt: '2026-08-14T12:00:00.000Z',
      summary: { sentiment: 'Mostly positive', responseCount: 12, answerCount: 28, representedPercent: 80 },
      editorial: {
        copy: {
          headline: 'Practical sessions created a strong foundation for the event.',
          executiveSummary: longFinding,
          keyTakeaway: 'Keep the practical program and address wayfinding before the next event.',
          whatWorkedNarrative: 'Useful examples and clear sessions drove the positive response.',
          frictionNarrative: 'A small group found the signs hard to follow.',
          nextEventNarrative: 'Build in more discussion time for the next event.',
          findingNarratives: [{ findingId: 'finding-1', narrative: longFinding }],
        },
      },
      whatWorked: [{ id: 'finding-1', title: 'Practical content', statement: 'Attendees valued useful examples.', mentionCount: 8, evidenceTier: 'STRONG' }],
      friction: [{ id: 'finding-2', title: 'Wayfinding', statement: 'Some signs were hard to follow.', mentionCount: 2, evidenceTier: 'EMERGING' }],
      decisions: { afterEventFollowUp: [], nextEventLearning: { actions: [], sessionLearning: [], findings: [] } },
      keyFindings: [{ id: 'finding-1', title: 'Practical content', statement: null, mentionCount: 8, responseCount: undefined, evidenceTier: 'STRONG' }],
      supportingEvidence: [{ id: 'evidence-1', quote: 'The practical examples were immediately useful.', question: 'What worked?', source: 'Main stage' }],
    } as unknown as EventClosingBrief

    const pdf = await renderEventClosingBriefPdf({ brief, eventDates: { startDate: null, endDate: null } })
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.length).toBeGreaterThan(1_000)
    expect(pdf.toString('latin1')).toContain('Montserrat')
  })
})
