import { describe, expect, it } from 'vitest'
import { buildEffectiveResponseTargetWhere, resolveEffectiveResponseTarget } from '@/lib/effective-response-target'

const target = (id: string, category = 'SESSION', name = id) => ({
  id,
  category,
  name,
  eventStructureItemId: category === 'EVENT' ? null : `item_${id}`,
  eventStructureItem: category === 'LOCATION'
    ? { id: `item_${id}`, name, kind: 'AREA' }
    : category === 'SESSION'
      ? { id: `item_${id}`, name, kind: 'SESSION' }
      : null,
})

describe('resolveEffectiveResponseTarget', () => {
  it('prefers the immutable response target over a reassigned public link and survey target', () => {
    const result = resolveEffectiveResponseTarget({
      publicSurveyLink: { surveyTarget: target('breakout_b') },
      responseTarget: target('opening_keynote'),
      survey: { surveyTarget: target('breakout_a') },
    })

    expect(result).toMatchObject({
      targetId: 'opening_keynote',
      sessionId: 'item_opening_keynote',
      source: 'RESPONSE',
    })
  })

  it('uses the durable response target when a historical link has no target', () => {
    expect(resolveEffectiveResponseTarget({
      publicSurveyLink: { surveyTarget: null },
      responseTarget: target('response_target'),
      survey: { surveyTarget: target('survey_target') },
    })).toMatchObject({ targetId: 'response_target', source: 'RESPONSE' })
  })

  it('falls back to the survey target for historical responses without scoped context', () => {
    expect(resolveEffectiveResponseTarget({ survey: { surveyTarget: target('legacy') } }))
      .toMatchObject({ targetId: 'legacy', source: 'SURVEY' })
  })

  it('resolves an Event Area from canonical IDs without using its display name', () => {
    expect(resolveEffectiveResponseTarget({
      publicSurveyLink: { surveyTarget: target('registration', 'LOCATION', 'Grand Hall') },
      survey: { surveyTarget: target('session_with_same_name', 'SESSION', 'Grand Hall') },
    })).toMatchObject({
      targetId: 'registration',
      areaId: 'item_registration',
      sessionId: null,
      source: 'PUBLIC_SURVEY_LINK',
    })
  })

  it('resolves the canonical Overall Event target without a structure item', () => {
    expect(resolveEffectiveResponseTarget({
      publicSurveyLink: { surveyTarget: target('overall_event', 'EVENT', 'Overall Event') },
    })).toMatchObject({
      targetId: 'overall_event',
      category: 'EVENT',
      sessionId: null,
      areaId: null,
      source: 'PUBLIC_SURVEY_LINK',
    })
  })

  it('does not infer a target from labels when no canonical relation exists', () => {
    expect(resolveEffectiveResponseTarget({
      publicSurveyLink: { surveyTarget: null },
      responseTarget: null,
      survey: { surveyTarget: null },
    })).toBeNull()
  })

  it('builds one batched precedence-aware Prisma predicate', () => {
    expect(buildEffectiveResponseTargetWhere({ eventStructureItemId: 'session_b' })).toEqual({
      OR: expect.arrayContaining([
        { surveyTarget: { eventStructureItemId: 'session_b' } },
        { surveyTargetId: null, publicSurveyLink: { surveyTarget: { eventStructureItemId: 'session_b' } } },
      ]),
    })
  })

  it('keeps 40 links sharing one survey individually attributable', () => {
    const surveyTarget = target('session_1')
    const resolved = Array.from({ length: 40 }, (_, index) => {
      const linkTarget = target(`session_${index + 1}`)
      return resolveEffectiveResponseTarget({
        publicSurveyLink: { surveyTarget: linkTarget },
        survey: { surveyTarget },
      })?.targetId
    })

    expect(new Set(resolved).size).toBe(40)
    expect(resolved).toEqual(Array.from({ length: 40 }, (_, index) => `session_${index + 1}`))
  })
})
