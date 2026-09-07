import { EventStatus, EventType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { generateAdvancedSurveyQuestions, normalizeAdvancedAiSuggestions, rewriteAdvancedSurveyQuestion } from './advanced-event-survey-ai'

function aiDb() {
  return {
    event: { findFirst: vi.fn().mockResolvedValue({ id: 'event_1', name: 'Summit', eventType: EventType.ADVANCED }) },
    survey: { findFirst: vi.fn().mockResolvedValue({
      id: 'survey_1', name: 'Session pulse', description: null, status: EventStatus.DRAFT,
      questions: [{ label: 'How was the opening keynote?' }],
      surveyTarget: null,
      publicSurveyLinks: [{ surveyTarget: { id: 'target_1', category: 'SESSION', name: 'Opening keynote', eventStructureItemId: 'session_1', eventStructureItem: { speakerAssignments: [{ speaker: { id: 'speaker_1', name: 'Avery Lee', isArchived: false } }] } } }],
    }) },
  }
}

describe('Advanced survey AI assistance', () => {
  it('normalizes temporary suggestions without creating an AI or Voice question type', () => {
    expect(normalizeAdvancedAiSuggestions({ questions: [
      { text: 'What should improve?', type: 'VOICE' },
      { text: 'Was check-in easy?', type: 'YES_NO' },
    ] }, false)).toEqual([
      expect.objectContaining({ text: 'What should improve?', type: 'OPEN_RESPONSE' }),
      expect.objectContaining({ text: 'Was check-in easy?', type: 'YES_NO' }),
    ])
  })

  it('uses canonical event, assignment, and speaker context while returning ordinary questions', async () => {
    const complete = vi.fn().mockResolvedValue({ questions: [{ text: 'How clear was the keynote?', type: 'RATING_1_TO_5' }] })
    const result = await generateAdvancedSurveyQuestions({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', goal: 'session_quality', tone: 'direct', count: 3 }, aiDb() as never, complete)
    expect(result.contextChips.map((chip) => chip.label)).toEqual(['Event: Summit', 'Session: Opening keynote', 'Speaker: Avery Lee'])
    expect(result.questions[0]).toMatchObject({ type: 'RATING_1_TO_5', required: true })
    expect(complete.mock.calls[0]?.[1]).toContain('SPEAKER_FEEDBACK is allowed')
  })

  it('uses the canonical generator for exactly one replacement with kept and temporary questions excluded', async () => {
    const complete = vi.fn().mockResolvedValue({ questions: [{ text: 'How clear were the session takeaways?', type: 'RATING_1_TO_5' }] })

    const result = await generateAdvancedSurveyQuestions({
      accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', goal: 'session_quality', tone: 'premium', count: 1,
      avoidQuestions: ['How was the venue?', 'How was the opening keynote?'],
    }, aiDb() as never, complete)

    expect(result.questions).toHaveLength(1)
    expect(complete).toHaveBeenCalledOnce()
    const prompt = complete.mock.calls[0]?.[1] ?? ''
    expect(prompt).toContain('Generate 1 short survey question')
    expect(prompt).toContain('Use a premium tone.')
    expect(prompt).toContain('"How was the opening keynote?"')
    expect(prompt).toContain('"How was the venue?"')
    expect(prompt).toContain('Return exactly one replacement question.')
  })

  it('returns a rewrite proposal without mutating question settings', async () => {
    const result = await rewriteAdvancedSurveyQuestion({ accountId: 'account_1', eventId: 'event_1', surveyId: 'survey_1', text: 'How was it?', instruction: 'Be specific' }, aiDb() as never, vi.fn().mockResolvedValue({ text: 'How valuable was this session?', summary: 'More specific.' }))
    expect(result).toEqual({ original: 'How was it?', text: 'How valuable was this session?', summary: 'More specific.' })
  })
})
