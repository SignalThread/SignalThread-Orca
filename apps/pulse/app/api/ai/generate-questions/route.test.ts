import { describe, expect, it } from 'vitest'
import {
  buildQuestionPrompt,
  EVENT_GOALS,
  normalizeGeneratedQuestions,
  normalizeQuestionRequest,
} from '@/lib/ai/question-generation'

describe('normalizeQuestionRequest', () => {
  it('keeps retail mode and retail goals by default', () => {
    const result = normalizeQuestionRequest({ businessType: 'coffee shop', goal: 'reviews' })
    expect(result.mode).toBe('retail')
    expect(result.goal).toBe('reviews')
    expect(result.context).toBe('coffee shop')
  })

  it('falls back to feedback for an unknown retail goal', () => {
    const result = normalizeQuestionRequest({ goal: 'session_quality', mode: 'retail' })
    expect(result.mode).toBe('retail')
    expect(result.goal).toBe('feedback')
  })

  it('accepts explicit events mode and preserves event-native goals', () => {
    const result = normalizeQuestionRequest({
      mode: 'events',
      goal: 'session_quality',
      eventContext: 'Opening Keynote',
    })
    expect(result.mode).toBe('events')
    expect(result.goal).toBe('session_quality')
    expect(result.context).toBe('Opening Keynote')
  })

  it('defaults an unknown events goal to live_event_feedback', () => {
    const result = normalizeQuestionRequest({ mode: 'events', goal: 'not-a-goal' })
    expect(result.mode).toBe('events')
    expect(result.goal).toBe('live_event_feedback')
  })

  it('infers events mode from an unambiguous event-only goal when mode is absent', () => {
    const result = normalizeQuestionRequest({ goal: 'sponsor_activation_value' })
    expect(result.mode).toBe('events')
    expect(result.goal).toBe('sponsor_activation_value')
  })

  it('does not misinfer events mode from the shared "feedback" goal', () => {
    const result = normalizeQuestionRequest({ goal: 'feedback' })
    expect(result.mode).toBe('retail')
  })

  it('clamps the count to between 3 and 8', () => {
    expect(normalizeQuestionRequest({ count: 100 }).count).toBe(8)
    expect(normalizeQuestionRequest({ count: 1 }).count).toBe(3)
    expect(normalizeQuestionRequest({ count: 6 }).count).toBe(6)
  })

  it('prefers eventContext over businessType when both are present', () => {
    const result = normalizeQuestionRequest({
      mode: 'events',
      eventContext: 'Expo Hall',
      businessType: 'event',
    })
    expect(result.context).toBe('Expo Hall')
  })
})

describe('buildQuestionPrompt — events mode', () => {
  const base = {
    mode: 'events' as const,
    surveyName: 'Keynote Pulse',
    description: 'Live Experience Summit. Opening Keynote',
    context: 'Opening Keynote',
    goal: 'session_quality',
    tone: 'friendly',
    count: 5,
  }

  it('uses event-native framing and never business/retail/review language', () => {
    const prompt = buildQuestionPrompt(base).toLowerCase()
    expect(prompt).not.toContain('business')
    expect(prompt).not.toContain('store')
    expect(prompt).not.toContain('reviews')
    expect(prompt).not.toContain('nps')
    expect(prompt).toContain('attendees')
    expect(prompt).toContain('live event')
    expect(prompt).toContain('session content and speaker quality')
  })

  it('passes event/area/survey context into the prompt', () => {
    const prompt = buildQuestionPrompt(base)
    expect(prompt).toContain('Survey: Keynote Pulse')
    expect(prompt).toContain('Live Experience Summit. Opening Keynote')
    expect(prompt).toContain('at Opening Keynote')
    expect(prompt).toContain('5 short survey questions')
  })

  it('covers all event goals with framing', () => {
    for (const goal of EVENT_GOALS) {
      const prompt = buildQuestionPrompt({ ...base, goal }).toLowerCase()
      expect(prompt).not.toContain('business')
    }
  })

  it('requires canonical mixed types for Events without forcing recommendation intent', () => {
    const prompt = buildQuestionPrompt(base)
    expect(prompt).toContain('VOICE')
    expect(prompt).toContain('RATING_1_TO_5')
    expect(prompt).toContain('RECOMMENDATION_0_TO_10')
    expect(prompt).toContain('Do not use RECOMMENDATION_0_TO_10 for generic satisfaction')
    expect(prompt).toContain('Do not force a recommendation question when recommendation is not relevant')
    expect(prompt).toContain('JSON array of objects')
  })
})

describe('normalizeGeneratedQuestions', () => {
  it('preserves each canonical Events question type through response normalization', () => {
    expect(normalizeGeneratedQuestions([
      { text: 'What should we improve?', type: 'VOICE' },
      { text: 'How would you rate session quality?', type: 'RATING_1_TO_5' },
      { text: 'How likely are you to recommend this event?', type: 'RECOMMENDATION_0_TO_10' },
    ])).toEqual([
      { text: 'What should we improve?', type: 'VOICE' },
      { text: 'How would you rate session quality?', type: 'RATING_1_TO_5' },
      { text: 'How likely are you to recommend this event?', type: 'RECOMMENDATION_0_TO_10' },
    ])
  })

  it('keeps the legacy SMB string payload voice-only', () => {
    expect(normalizeGeneratedQuestions(['How was your visit?'])).toEqual([
      { text: 'How was your visit?', type: 'VOICE' },
    ])
  })
})

describe('buildQuestionPrompt — retail mode (unchanged)', () => {
  it('keeps the original business framing for retail', () => {
    const prompt = buildQuestionPrompt({
      mode: 'retail',
      surveyName: 'Store Pulse',
      description: '',
      context: 'coffee shop',
      goal: 'reviews',
      tone: 'friendly',
      count: 5,
    })
    expect(prompt).toContain('for a coffee shop business')
    expect(prompt).toContain('Goal: reviews')
    expect(prompt).toContain('Tone: friendly')
  })
})
