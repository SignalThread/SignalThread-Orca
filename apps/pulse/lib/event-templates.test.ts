import { describe, expect, it } from 'vitest'
import {
  EVENT_TEMPLATES,
  EVENT_TEMPLATE_KEYS,
  eventTemplatePreview,
  getEventTemplate,
  isEventTemplateKey,
} from './event-templates'

describe('event templates', () => {
  it('exposes the five starting points', () => {
    expect(EVENT_TEMPLATE_KEYS).toEqual([
      'conference',
      'expo',
      'workshop',
      'brand-activation',
      'blank',
    ])
  })

  it('blank template seeds no structure', () => {
    const blank = getEventTemplate('blank')
    expect(blank?.items).toHaveLength(0)
    expect(eventTemplatePreview(blank!)).toBe("No areas yet — you'll add your own")
  })

  it('non-blank templates only describe real event structure (no surveys/data fields)', () => {
    for (const template of EVENT_TEMPLATES) {
      for (const item of template.items) {
        expect(item).toHaveProperty('kind')
        expect(item).toHaveProperty('name')
        expect(Object.keys(item).sort()).toEqual(['kind', 'name'])
        expect(['EVENT', 'SESSION', 'AREA', 'SPONSOR_ACTIVATION', 'CUSTOM_TOUCHPOINT']).toContain(item.kind)
      }
    }
  })

  it('offers editable mixed-question recommendations without fabricating activity', () => {
    for (const template of EVENT_TEMPLATES.filter((entry) => entry.key !== 'blank')) {
      expect(template.recommendedSurveys.length).toBeGreaterThan(0)
      expect(template.recommendedSurveys.some((survey) =>
        survey.questions.some((question) => question.type === 'VOICE'),
      )).toBe(true)
      expect(template.recommendedSurveys.some((survey) =>
        survey.questions.some((question) => question.type === 'RATING_1_TO_5'),
      )).toBe(true)

      for (const survey of template.recommendedSurveys) {
        expect(survey.key).toMatch(/^[a-z0-9-]+$/)
        expect(survey.questions.length).toBeGreaterThan(0)
        expect(survey).not.toHaveProperty('responses')
        expect(survey).not.toHaveProperty('analytics')
      }
    }

    expect(getEventTemplate('blank')?.recommendedSurveys).toEqual([])
  })

  it('matches the documented preview lines', () => {
    expect(eventTemplatePreview(getEventTemplate('conference')!)).toBe(
      'Registration · Keynotes · Sessions · Expo Floor · Networking',
    )
    expect(eventTemplatePreview(getEventTemplate('expo')!)).toBe(
      'Expo Floor · Exhibitor Booths · Sponsor Activations · Registration',
    )
    expect(eventTemplatePreview(getEventTemplate('workshop')!)).toBe(
      'Sessions · Breakout Rooms · Overall Experience',
    )
    expect(eventTemplatePreview(getEventTemplate('brand-activation')!)).toBe(
      'Sponsor Zones · Brand Experiences · Custom Touchpoints',
    )
  })

  it('validates template keys', () => {
    expect(isEventTemplateKey('conference')).toBe(true)
    expect(isEventTemplateKey('blank')).toBe(true)
    expect(isEventTemplateKey('nonsense')).toBe(false)
    expect(isEventTemplateKey(null)).toBe(false)
    expect(getEventTemplate('nonsense')).toBeNull()
  })
})
