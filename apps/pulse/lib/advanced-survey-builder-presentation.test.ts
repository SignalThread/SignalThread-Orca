import { describe, expect, it } from 'vitest'
import { resolveAdvancedSurveyBuilderLifecyclePresentation } from './advanced-survey-builder-presentation'

describe('Advanced survey builder lifecycle presentation', () => {
  it('keeps publish and AI actions available for a draft survey', () => {
    expect(resolveAdvancedSurveyBuilderLifecyclePresentation('DRAFT')).toEqual({
      isDraft: true,
      reviewTitle: 'Review and publish',
      reviewDescription: 'One final view of the persisted survey configuration.',
    })
  })

  it('removes draft-only actions and readiness language for an active survey', () => {
    const presentation = resolveAdvancedSurveyBuilderLifecyclePresentation('ACTIVE')

    expect(presentation).toMatchObject({
      isDraft: false,
      reviewTitle: 'Published survey',
    })
    expect(Object.values(presentation).join(' ')).not.toContain('shown below')
    expect(presentation.reviewDescription).toContain('Draft-only publishing and AI actions are unavailable.')
    expect(Object.values(presentation).join(' ')).not.toContain('Ready to publish')
  })
})
