import { describe, expect, it } from 'vitest'
import {
  inferEventQuestionIntent,
  isGenericFindingTheme,
  normalizeFindingKey,
  synthesizeEventFinding,
  synthesizePreEventFindingCopy,
} from './finding-synthesis'

describe('event finding synthesis', () => {
  it('pulls a specific evidence-backed claim forward from the persisted answer synopsis', () => {
    const result = synthesizeEventFinding({
      themeKey: 'networking',
      label: 'Networking',
      evidenceTier: 'EMERGING',
      sources: [
        {
          answerId: 'answer_1',
          responseId: 'response_1',
          questionLabel: 'What was most valuable?',
          summary: 'I valued the quality of peer connections and the practical conversations in the expo hall.',
        },
        {
          answerId: 'answer_2',
          responseId: 'response_2',
          questionLabel: 'What was most valuable?',
          summary: 'I appreciated meeting peers who shared useful ideas.',
        },
      ],
    })

    expect(result.statement).toBe('A few attendees valued the quality of peer connections and the practical conversations in the expo hall.')
    expect(result.questionIntent).toBe('strength')
    expect(result.supportingAnswerIds).toEqual(['answer_1', 'answer_2'])
  })

  it('uses question context to distinguish strengths, friction, and next-event requests', () => {
    expect(inferEventQuestionIntent('What worked well?')).toBe('strength')
    expect(inferEventQuestionIntent('What was difficult or frustrating?')).toBe('friction')
    expect(inferEventQuestionIntent('What would you change next time?')).toBe('improvement')
  })

  it('changes certainty language as supporting evidence strengthens', () => {
    const source = {
      answerId: 'answer_1', responseId: 'response_1', questionLabel: 'What worked well?', summary: 'I appreciated the structured introductions.',
    }
    expect(synthesizeEventFinding({ themeKey: 'introductions', label: 'Introductions', evidenceTier: 'ISOLATED', sources: [source] }).statement)
      .toBe('One attendee appreciated the structured introductions.')
    expect(synthesizeEventFinding({ themeKey: 'introductions', label: 'Introductions', evidenceTier: 'STRONG', sources: [source] }).statement)
      .toBe('Attendees consistently appreciated the structured introductions.')
  })

  it('recomputes the representative claim when more specific evidence arrives', () => {
    const initial = [{
      answerId: 'answer_1', responseId: 'response_1', questionLabel: 'What worked well?', summary: 'I enjoyed the event overall.',
    }]
    const added = {
      answerId: 'answer_2', responseId: 'response_2', questionLabel: 'What worked well?', summary: 'I valued networking because the structured introductions led to useful peer conversations.',
    }

    expect(synthesizeEventFinding({ themeKey: 'networking', label: 'Networking', evidenceTier: 'ISOLATED', sources: initial }).statement)
      .toContain('enjoyed the event overall')
    const refined = synthesizeEventFinding({ themeKey: 'networking', label: 'Networking', evidenceTier: 'EMERGING', sources: [...initial, added] })
    expect(refined.statement).toContain('structured introductions led to useful peer conversations')
    expect(refined.supportingAnswerIds).toEqual(['answer_1', 'answer_2'])
  })

  it('normalizes formatting noise without merging broader parent and child concepts', () => {
    expect(normalizeFindingKey(' Networking! ')).toBe('networking')
    expect(normalizeFindingKey('Networking and expo')).not.toBe(normalizeFindingKey('Networking'))
  })

  it('identifies generic catch-alls independently of capitalization and punctuation', () => {
    expect(isGenericFindingTheme('GENERAL-POSITIVE-FEEDBACK', 'General positive feedback')).toBe(true)
    expect(isGenericFindingTheme('networking', 'Quality peer connections')).toBe(false)
  })

  it('turns Pre taxonomy labels into specific organizer-ready headlines and supporting sentences', () => {
    const findings = [
      synthesizePreEventFindingCopy({
        title: 'Questions for',
        statement: 'Attendees consistently reported that Can speakers share examples of AI governance that works in practice?',
        kind: 'opportunity', recommendation: null,
        evidenceText: [
          'How should teams measure ROI from AI initiatives?',
          'What data-readiness work should teams complete before choosing an AI use case?',
          'Can speakers share examples of AI governance that works in practice?',
        ],
      }),
      synthesizePreEventFindingCopy({
        title: 'Practical AI examples',
        statement: 'Attendees consistently reported that Practical AI case studies with real adoption metrics would make the event most valuable to me.',
        kind: 'positive', recommendation: null,
        evidenceText: ['Hands-on examples are in high demand because teams need a realistic starting point, not another trend overview.'],
      }),
      synthesizePreEventFindingCopy({
        title: 'Networking',
        statement: 'Attendees consistently prefer small-group discussions around shared problems instead of unstructured networking.',
        kind: 'theme', recommendation: null,
        evidenceText: ['I hope to meet peers running similar programs, so hosted topic tables would make the event more valuable.'],
      }),
      synthesizePreEventFindingCopy({
        title: 'Session choice guidance',
        statement: 'A role-based session guide would help me choose between overlapping sessions.',
        kind: 'theme', recommendation: null,
        evidenceText: ['A clear agenda path separating introductory and advanced material would help me choose sessions that match my experience level.'],
      }),
      synthesizePreEventFindingCopy({
        title: 'Prepare hosted networking matches',
        statement: 'I prefer small-group discussions around shared problems instead of unstructured networking.',
        kind: 'opportunity', recommendation: 'Prepare hosted networking matches', evidenceText: [],
      }),
      synthesizePreEventFindingCopy({
        title: 'Publish a role-based session choice guide',
        statement: 'Please send a session guide before the event so I can compare sessions against my learning goals.',
        kind: 'opportunity', recommendation: 'Publish a role-based session choice guide', evidenceText: [],
      }),
    ]

    expect(findings.map((finding) => finding.title)).toEqual([
      'Attendees want speakers to answer practical implementation questions.',
      'Attendees want practical AI case studies with real adoption metrics.',
      'Attendees prefer small-group discussions around shared problems instead of unstructured networking.',
      'Attendees need clearer guidance to choose sessions that fit their goals.',
      'Hosted networking matches would make attendee connections easier.',
      'A role-based session choice guide would help attendees choose with confidence.',
    ])
    expect(new Set(findings.map((finding) => finding.description)).size).toBe(findings.length)
    expect(findings.every((finding) => finding.description.split(/\s+/).length <= 22)).toBe(true)
    expect(findings.map((finding) => `${finding.title} ${finding.description}`).join(' ')).not.toMatch(/planning consideration|the evidence suggests|the data indicates/i)
  })
})
