export interface AdvancedSurveyBuilderLifecyclePresentation {
  isDraft: boolean
  reviewTitle: string
  reviewDescription: string
}

function statusLabel(status: string) {
  return status.toLowerCase().replace(/(^|_)\w/g, (value) => value.replace('_', ' ').toUpperCase())
}

/** Derives draft-only builder actions from the authoritative persisted status. */
export function resolveAdvancedSurveyBuilderLifecyclePresentation(
  status: string,
): AdvancedSurveyBuilderLifecyclePresentation {
  if (status === 'DRAFT') {
    return {
      isDraft: true,
      reviewTitle: 'Review and publish',
      reviewDescription: 'One final view of the persisted survey configuration.',
    }
  }

  return {
    isDraft: false,
    reviewTitle: status === 'ACTIVE' ? 'Published survey' : 'Survey status',
    reviewDescription: `This survey is ${statusLabel(status).toLowerCase()}. Draft-only publishing and AI actions are unavailable.`,
  }
}
