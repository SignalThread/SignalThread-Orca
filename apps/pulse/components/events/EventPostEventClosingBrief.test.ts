import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { hasSufficientVerdictEvidence, verdictEmptyPresentation } from './EventPostEventClosingBrief'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventPostEventClosingBrief.tsx'), 'utf8')
const briefActionSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventBriefAction.tsx'), 'utf8')
const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8')
const tailwindSource = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.ts'), 'utf8')

describe('EventPostEventClosingBrief', () => {
  it('uses the locked closing-brief hierarchy instead of live dashboard framing', () => {
    for (const label of ['The verdict', 'What worked', 'What created friction', 'What should change next time', 'Key findings']) {
      expect(source).toContain(label)
    }
    expect(source).toContain('<EventLifecycleMetricStrip')
    expect(source).toContain('data-post-event-overview')
    expect(source).toContain('data-post-event-metrics')
    expect(source).toContain('lg:grid-cols-[minmax(0,2.08fr)_minmax(310px,0.92fr)]')
    expect(source).toContain('data-brief-subsection')
    expect(source).toContain('Closing brief ·')
    expect(source).toContain('max-w-[1176px]')
    expect(source).not.toContain('bg-gradient-to-r')
    expect(source).not.toContain('Needs attention now')
    expect(source).not.toContain('Auto-refresh')
    expect(source).not.toContain('SignalThread · Event intelligence report')
    expect(source).not.toContain('Post-event · Generated')
    expect(source).toContain('data-closing-brief-document')
    expect(source).toContain("import { EventBriefAction } from '@/components/events/EventBriefAction'")
    expect(source).toContain('Open Intelligence')
    expect(source).not.toContain('Supporting evidence</h2>')
  })

  it('uses compact semibold executive typography for the closing summary', () => {
    expect(source).toContain('font-brand')
    expect(layoutSource).toContain('Montserrat')
    expect(layoutSource).toContain('variable: "--font-montserrat"')
    expect(tailwindSource).toContain("brand: ['var(--font-montserrat)']")
    expect(source).toContain('text-[22px] font-semibold leading-[1.15]')
    expect(source).toContain('text-[20px] font-semibold leading-[1.2]')
    expect(source).toContain('sm:text-[22px] lg:text-[24px]')
    expect(source).toContain('text-[13px] font-normal leading-5')
    expect(source).toContain('text-[13px] font-medium leading-5')
    expect(source).not.toContain('lg:text-[30px]')
    expect(source).toContain('data-closing-brief-section-heading')
    expect(source).toContain('lg:text-[24px]')
    expect(source).toContain('space-y-5')
    expect(source).not.toContain('font-extrabold')
    expect(source).not.toContain('<h1')
  })

  it('keeps canonical evidence, summaries, and next-event learning visible without empty scope cards', () => {
    expect(source).toContain('openFindingEvidence(finding)')
    expect(source).not.toContain('Decisions and follow-through')
    expect(source).not.toContain('Open the Actions workspace')
    expect(source).not.toContain('Session results')
    expect(source).not.toContain('Speaker results')
    expect(source).not.toContain('No linked issue evidence is available.')
    expect(source).toContain('brief.decisions.nextEventLearning')
    expect(source).toContain('brief.decisions.nextEventLearning.findings')
  })

  it('renders one server-issued editorial payload across the brief', () => {
    expect(source).toContain('brief.editorial.copy.headline')
    expect(source).toContain('brief.editorial.copy.executiveSummary')
    expect(source).toContain('brief.editorial.copy.whatWorkedNarrative')
    expect(source).toContain('brief.editorial.copy.frictionNarrative')
    expect(source).toContain('brief.editorial.copy.nextEventNarrative')
    expect(source).toContain('brief.editorial.copy.findingNarratives')
    expect(source).toContain('findingNarrativeById.get(finding.id)')
    expect(source).not.toContain('carryForward.map(sentence)')
    expect(source).not.toContain('const closingDirection')
    expect(source).not.toContain('>Listening coverage</dt>')
    expect(source).not.toContain('of listening points represented</p>')
  })

  it('uses specific persisted evidence and intentional empty states in the verdict', () => {
    expect(source).toContain('brief.editorial.copy.whatWorkedNarrative')
    expect(source).not.toContain('{item.statement &&')
    expect(source).not.toContain('{finding.statement &&')
    expect(source).toContain('We didn’t find a meaningful friction pattern in attendee feedback.')
    expect(source).toContain('That’s a strong signal the experience felt smooth overall.')
    expect(source).toContain('Attendees didn’t surface a clear recommendation for next time.')
    expect(source).toContain('Focus on preserving what made this event work so well.')
    expect(source).toContain('Not enough evidence yet')
    expect(source).toContain('data-verdict-empty-state')
    expect(source).toContain('data-verdict-empty-graphic')
    expect(source).toContain('confidencePercent(finding.confidence)')
    expect(source).toContain('Review evidence →')
  })

  it('only allows the positive empty treatment when verdict evidence is sufficiently broad and analyzed', () => {
    expect(hasSufficientVerdictEvidence({ responseCount: 34, answerCount: 120, listeningPointCount: 1, representedPercent: 100 })).toBe(true)
    expect(hasSufficientVerdictEvidence({ responseCount: 2, answerCount: 2, listeningPointCount: 1, representedPercent: 100 })).toBe(false)
    expect(hasSufficientVerdictEvidence({ responseCount: 12, answerCount: 3, listeningPointCount: 1, representedPercent: 100 })).toBe(false)
    expect(hasSufficientVerdictEvidence({ responseCount: 12, answerCount: 12, listeningPointCount: 4, representedPercent: 25 })).toBe(false)
    expect(verdictEmptyPresentation(1, true)).toBe('populated')
    expect(verdictEmptyPresentation(0, true)).toBe('positive')
    expect(verdictEmptyPresentation(0, false)).toBe('insufficient')
  })

  it('links the report to one dedicated brief document workflow instead of printing the dashboard', () => {
    expect(briefActionSource).toContain('const briefDocumentHref =')
    expect(briefActionSource).toContain('const openBriefDocument =')
    expect(briefActionSource).toContain('const generateBrief = async () =>')
    expect(briefActionSource).not.toContain('cacheBust=${Date.now()}')
    expect(briefActionSource).toContain('setBriefHash(')
    expect(briefActionSource).toContain('briefHash=${encodeURIComponent(briefHash)}')
    expect(briefActionSource).toContain('const briefPdfHref =')
    expect(briefActionSource).toContain('const briefDataHref =')
    expect(briefActionSource).not.toContain('lifecycle=')
    expect(briefActionSource).toContain('Generate brief')
    expect(briefActionSource).toContain('View brief')
    expect(briefActionSource).toContain('EventBriefPdfDownloadButton')
    expect(source).toContain('Closing brief')
    expect(source).not.toContain('data-closing-brief-controls')
    expect(briefActionSource).not.toContain('const previewBrief =')
    expect(briefActionSource).not.toContain('const printBrief =')
    expect(briefActionSource).not.toContain('window.print()')
    expect(source).not.toContain('Send this to the team')
    expect(source).not.toContain('Share with team')
    expect(source).not.toContain('Share this brief')
  })

  it('keeps finding-level evidence review without a duplicate supporting-evidence section', () => {
    expect(source).toContain('openFindingEvidence(finding)')
    expect(source).toContain('<EventEvidenceDrawer')
    expect(source).not.toContain('closing-supporting-evidence')
    expect(source).not.toContain('Representative attendee feedback')
  })

  it('uses shared factual metrics and passes issue-cluster provenance to the evidence drawer', () => {
    expect(source).toContain('sentimentPercent={brief.summary.sentimentPercent}')
    expect(source).toContain('sentimentBreakdown={brief.summary.sentimentBreakdown}')
    expect(source).toContain('representedFeedbackPoints={brief.summary.representedListeningPointCount}')
    expect(source).toContain("query.set('issueClusterIds', selectedFindingEvidence.issueClusterIds.join(','))")
    expect(source).toContain('coverageDetail=')
    expect(source).toContain('brief.links.intelligence')
    expect(source).toContain('followUpDetailContent=')
    expect(source).toContain("actionLink.searchParams.set('actionId', action.id)")
  })

  it('keeps the restored post-only overview shell fed by the current editorial and factual payloads', () => {
    expect(source).toContain('brief.editorial.copy.headline')
    expect(source).toContain('brief.editorial.copy.executiveSummary')
    expect(source).toContain('brief.editorial.copy.keyTakeaway')
    expect(source).toContain('brief.summary.sentimentBreakdown')
    expect(source).toContain('brief.decisions.nextEventLearning')
    expect(source).toContain('brief.decisions.unresolvedActions')
    expect(source).toContain('<EventBriefAction')
    expect(source).toContain('postEventHref(brief.links.intelligence)')
  })

  it('uses compact bullet markers instead of a numbered findings gutter', () => {
    expect(source).toContain('grid-cols-[10px_minmax(0,1fr)]')
    expect(source).toContain('h-2 w-2 rounded-full bg-slate-400')
    expect(source).not.toContain("String(index + 1).padStart(2, '0')")
  })

  it('reuses the shared evidence drawer from the retained findings list', () => {
    expect(source).toContain("import { EventEvidenceDrawer } from '@/components/events/EventEvidenceDrawer'")
    expect(source).toContain("import { EventThemeEvidencePanel } from '@/components/events/EventThemeEvidencePanel'")
    expect(source).toContain('<EventEvidenceDrawer')
    expect(source).toContain('<EventThemeEvidencePanel')
  })

  it('keeps the closing brief independent of the shared page-level scope controls', () => {
    expect(source).not.toContain('scopeControls')
  })

})
