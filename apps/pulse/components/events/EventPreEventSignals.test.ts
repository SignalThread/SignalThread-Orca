import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import type { EventIntelligenceData } from '@/components/admin/Dashboard2'
import { buildPreEventIntelligenceViewModel, getOpenCanonicalEventActions } from './EventPreEventSignals'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventPreEventSignals.tsx'), 'utf8')

const analysis = {
  eventName: 'SignalThread Live',
  overallSummary: 'Attendees want practical guidance before the event.',
  overallSentiment: 'Positive',
  totalResponses: 12,
  totalAnswers: 24,
  lastComputedAt: '2026-08-31T12:00:00.000Z',
}

const intelligence = {
  eventPulse: {
    sentimentLabel: 'POSITIVE',
    lastComputedAt: '2026-08-31T13:00:00.000Z',
  },
  responseCount: 12,
  answerCount: 22,
  topThemes: [
    { themeKey: 'practical-ai', label: 'Practical AI guidance', count: 8, sentimentLabel: 'Positive', confidence: 0.91, questionIntent: 'strength', evidenceText: ['How can I apply AI in my current workflow?'] },
  ],
  topActions: [
    { title: 'Prepare a practical implementation workshop' },
  ],
  canonicalFindings: [
    {
      id: 'finding_1',
      title: 'Practical guidance is the leading expectation',
      description: 'Attendees repeatedly ask for implementation examples.',
      mentionCount: 8,
      confidence: 0.91,
      evidenceTier: 'STRONG',
      evidenceText: ['How can I apply AI in my current workflow?'],
      kind: 'positive',
      sentimentLabel: 'Positive',
      recommendation: 'Prepare a practical implementation workshop',
    },
    {
      id: 'finding_2',
      title: 'Security concerns are emerging',
      description: 'Early responses mention security and governance.',
      mentionCount: 3,
      confidence: 0.72,
      evidenceTier: 'EMERGING',
      evidenceText: ['What security standards do you follow?'],
      kind: 'risk',
      sentimentLabel: 'Negative',
      recommendation: 'Address security and governance early',
    },
  ],
  attentionQueue: [],
} as unknown as EventIntelligenceData

describe('EventPreEventSignals', () => {
  it('counts only open, persisted Actions records for pre-event follow-up', () => {
    expect(getOpenCanonicalEventActions([
      { id: 'action-open', title: 'Confirm panel briefing', summary: null, actionStatus: 'OPEN' },
      { id: 'action-working', title: 'Confirm attendee welcome', summary: null, actionStatus: 'WORKING' },
      { id: 'action-complete', title: 'Completed item', summary: null, actionStatus: 'COMPLETE' },
      { id: 'action-dismissed', title: 'Dismissed item', summary: null, actionStatus: 'DISMISSED' },
    ]).map((action) => action.id)).toEqual(['action-open', 'action-working'])
  })

  it('maps canonical intelligence into the brief, signal cards, findings, and attendee questions', () => {
    const view = buildPreEventIntelligenceViewModel({ surveyCount: 1, analysis, intelligence })

    expect(view.headline).toContain('before doors open')
    expect(view.headline).not.toMatch(/feedback points to|SignalThread Live Experience Summit/)
    expect(view.summary).toContain('practical guidance')
    expect(view.summary).toContain('security concerns')
    expect(view.summary).toContain("leadership's priorities")
    expect(view.summary.match(/[.!?](?:\s|$)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(view.sentiment).toBe('Mostly positive')
    expect(view.responseCount).toBe(12)
    expect(view.analyzedAnswerCount).toBe(22)
    expect(view.surveyCount).toBe(1)
    expect(view.expectations).toContain('Practical guidance is the leading expectation')
    expect(view.concerns).toContain('Early responses mention security and governance')
    expect(view.preparations[0]).toContain('Prepare a practical implementation workshop')
    expect(view.findings).toHaveLength(2)
    expect(view.findings.every((finding) => finding.title.endsWith('.'))).toBe(true)
    expect(view.findings.every((finding) => Boolean(finding.description?.endsWith('.')))).toBe(true)
    expect(view.attendeeQuestions).toEqual([
      'How can I apply AI in my current workflow?',
      'What security standards do you follow?',
    ])
  })

  it('uses concrete, distinct concerns and direct preparation actions', () => {
    const contentQualityIntelligence = {
      ...intelligence,
      canonicalFindings: [
        {
          id: 'networking-access',
          evidenceThemeKey: 'networking-access',
          evidenceThemeKeys: ['networking-access'],
          title: 'Networking concerns',
          description: 'First-time attendees need a clearer entry point for hosted networking.',
          mentionCount: 6,
          confidence: 0.9,
          evidenceTier: 'REPEATED',
          evidenceText: ['I could not tell where the hosted conversations were supposed to begin.'],
          kind: 'risk',
          sentimentLabel: 'Negative',
          recommendation: 'Clarify networking start points',
        },
        {
          id: 'speaker-transitions',
          evidenceThemeKey: 'speaker-transitions',
          evidenceThemeKeys: ['speaker-transitions'],
          title: 'Speaker clarity and engagement concerns',
          description: 'Speaker transitions need a clearer plan for audience questions.',
          mentionCount: 4,
          confidence: 0.82,
          evidenceTier: 'REPEATED',
          evidenceText: ['The discussion started late and left little time for questions.'],
          kind: 'risk',
          sentimentLabel: 'Negative',
          recommendation: 'Brief speakers on transitions and audience questions',
        },
      ],
      attentionQueue: [
        {
          taxonomyKey: 'networking-access',
          title: 'Hosted networking needs clearer start-point signage',
          summary: 'First-time attendees need a clearer entry point for hosted networking.',
        },
      ],
      topActions: [
        { themeKey: 'networking-access', title: 'Clarify networking start points' },
      ],
    } as unknown as EventIntelligenceData

    const view = buildPreEventIntelligenceViewModel({ surveyCount: 1, analysis, intelligence: contentQualityIntelligence })

    expect(view.concerns).toEqual([
      'Hosted networking needs clearer start-point signage',
      'Speaker transitions need a clearer plan for audience questions',
    ])
    expect(view.concerns.join(' ')).not.toMatch(/\bconcerns?\b|\bissues?\b|\bchallenges?\b/i)
    expect(view.preparations).toEqual([
      'Clarify networking start points',
      'Brief speakers on transitions and audience questions',
    ])
    expect(view.concerns.join(' ')).not.toMatch(/expo|wayfinding|registration|coffee/i)
    expect(view.preparations.join(' ')).not.toContain('Consider this attendee signal while finalizing plans')
  })

  it('renders the approved pre-event intelligence hierarchy without treating AI recommendations as follow-up actions', () => {
    expect(source).toContain('data-testid="pre-event-intelligence"')
    expect(source).toContain('<EventLifecycleHero')
    expect(source).toContain('lifecyclePhase="PRE_EVENT"')
    expect(source).toContain('What we’re hearing before the event')
    expect(source).toContain('What attendees are asking')
    expect(source).toContain('What concerns are emerging')
    expect(source).toContain('What to prepare for')
    expect(source).toContain('Key findings')
    expect(source).toContain('Review evidence →')
    expect(source).toContain('<EventEvidenceDrawer')
    expect(source).toContain('<EventThemeEvidencePanel')
    expect(source).toContain('<EventActionableItem')
    expect(source).toContain('coverageDetail=')
    expect(source).toContain('followUpDetailContent=')
    expect(source).toContain('useEventActionData(eventId, accountSlug)')
    expect(source).toContain('getOpenCanonicalEventActions(canonicalActions)')
    expect(source).toContain('Actions explicitly created by your team')
    expect(source).toContain('No user-created follow-up actions are open.')
    expect(source).not.toContain('Planning follow-up')
    expect(source).not.toContain('const preEventActions = intelligence?.topActions')
    expect(source).toContain("tab: 'actions'")
    expect(source).toContain('Review pre-event findings →')
    expect(source).not.toContain('<details')
    expect(source).not.toContain('Open Intelligence')
    expect(source).toContain('Questions attendees want answered')
    expect(source).not.toContain('Consider this attendee signal while finalizing plans')
    expect(source).not.toContain('Pre-event responses identify this as a planning consideration.')
    expect(source).toContain('{finding.description}')
  })

  it('keeps the hearing cards compact and in three columns on desktop', () => {
    expect(source).toContain('md:grid-cols-2 lg:grid-cols-3')
    expect(source).not.toContain('min-h-[238px]')
  })

  it('removes every readiness and setup widget from the Intelligence surface', () => {
    expect(source).not.toContain('data-testid="pre-event-readiness"')
    expect(source).not.toContain('Pre-event readiness')
    expect(source).not.toContain('Readiness summary')
    expect(source).not.toContain('Overall setup')
    expect(source).not.toContain('What needs attention')
    expect(source).not.toContain('What is ready')
    expect(source).not.toContain('readiness.issues')
    expect(source).not.toContain('readiness.agenda')
    expect(source).not.toContain('readiness.listeningPlan')
    expect(source).not.toContain('readiness.surveys')
  })

  it('uses canonical survey evidence and honest empty states instead of invented findings', () => {
    const empty = buildPreEventIntelligenceViewModel({
      surveyCount: 0,
      analysis: { ...analysis, overallSummary: null, overallSentiment: null, totalResponses: 0, totalAnswers: 0 },
      intelligence: null,
    })

    expect(empty.findings).toEqual([])
    expect(empty.attendeeQuestions).toEqual([])
    expect(empty.sentiment).toBe('Not enough data')
    expect(source).toContain('No evidence-backed pre-event finding is available yet.')
    expect(source).toContain('view.attendeeQuestions.length > 0 && <section')
    expect(source).not.toContain('No attendee-authored questions have been surfaced yet.')
    expect(source).toContain('Supporting survey responses')
    expect(source).toContain('Pre-event · survey evidence')
  })

  it('restores questions before findings and labels the canonical finding-color semantics', () => {
    expect(source.indexOf('Questions attendees want answered')).toBeLessThan(source.indexOf('id="pre-event-key-findings"'))
    for (const label of ['Strength', 'Watch', 'Friction', 'Theme / opportunity']) expect(source).toContain(label)
    expect(source).toContain("finding.kind === 'positive' ? 'bg-emerald-500'")
    expect(source).toContain("finding.kind === 'risk' ? 'bg-rose-500'")
    expect(source).toContain("finding.kind === 'signal' ? 'bg-amber-500'")
  })

  it('keeps pre-event content independent of the shared page-level scope controls', () => {
    expect(source).not.toContain('scopeControls')
  })

  it('keeps the mockup layout responsive without changing the shared page width', () => {
    expect(source).toContain('max-w-[1176px]')
    expect(source).toContain('md:grid-cols-2 lg:grid-cols-3')
    expect(source).toContain('sm:grid-cols-[10px_minmax(0,1fr)_auto]')
    expect(source).toContain('flex flex-wrap gap-2')
    expect(source).toContain('EventBriefAction')
  })
})
