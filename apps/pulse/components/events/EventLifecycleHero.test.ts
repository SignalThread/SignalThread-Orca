import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const heroSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventLifecycleHero.tsx'), 'utf8')
const globalStyles = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')
const preSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventPreEventSignals.tsx'), 'utf8')
const duringSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventInEventOverview.tsx'), 'utf8')
const postSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventPostEventClosingBrief.tsx'), 'utf8')

describe('EventLifecycleHero', () => {
  it('uses one full hero shell for PRE, DURING, and POST', () => {
    for (const source of [preSource, duringSource, postSource]) {
      expect(source).toContain("import { EventLifecycleHero } from '@/components/events/EventLifecycleHero'")
      expect(source).toContain('<EventLifecycleHero')
    }
    expect(postSource).not.toContain('EventLifecycleMetricStrip')
    expect(postSource).not.toContain('data-brief-subsection')
    expect(postSource).not.toContain('data-post-event-metrics')
    expect(postSource).not.toContain('lg:grid-cols-[minmax(0,2.08fr)_minmax(310px,0.92fr)]')
    expect(heroSource).toContain('event-intelligence-metrics grid')
    expect(heroSource).toContain('event-lifecycle-hero event-intelligence-summary')
    for (const label of ['Sentiment', 'Responses', 'Coverage', 'Follow-up']) expect(heroSource).toContain(`>${label}</p>`)
  })

  it('makes the shared hero its own container so every lifecycle gets the four-cell desktop strip', () => {
    expect(globalStyles).toContain('.event-lifecycle-hero {\n  container-type: inline-size;\n}')
    expect(globalStyles).toContain('@container (min-width: 44rem)')
    expect(globalStyles).toContain('.event-intelligence-metrics {\n    grid-template-columns: repeat(4, minmax(0, 1fr));')
  })

  it('receives coverage and follow-up detail content from every lifecycle', () => {
    for (const source of [preSource, duringSource, postSource]) {
      expect(source).toContain('coverageDetail=')
      expect(source).toContain('followUpDetailContent=')
    }
  })

  it('presents coverage with a baseline-aligned denominator and a separate unit line', () => {
    expect(heroSource).toContain('data-testid="coverage-summary"')
    expect(heroSource).toContain('items-baseline')
    expect(heroSource).toContain('of {configuredFeedbackPoints || representedFeedbackPoints}')
    expect(heroSource).toContain('>{coverageUnit}</p>')
    expect(heroSource).not.toContain('>/{configuredFeedbackPoints || representedFeedbackPoints}</span>')
  })

  it('keeps lifecycle copy as props, omits unsupported synopses, and has no AI-written badge', () => {
    expect(heroSource).toContain('synopsis?: string | null')
    expect(heroSource).toContain('{synopsis &&')
    expect(heroSource).toContain('data-testid="event-lifecycle-overview"')
    expect(heroSource).not.toContain('AI written')
    expect(preSource).toContain('view.responseCount >= 3 && view.analyzedAnswerCount >= 3 ? view.headline : null')
    expect(duringSource).toContain('hasSufficientSynopsisEvidence')
    expect(postSource).toContain('data-post-event-overview')
    expect(postSource).toContain('brief.editorial.copy.headline')
  })
})
