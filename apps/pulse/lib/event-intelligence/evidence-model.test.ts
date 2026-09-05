import { describe, expect, it } from 'vitest'
import { buildEventEvidenceModel, evidenceTierLabel } from './evidence-model'

function evidence(input: Partial<Parameters<typeof buildEventEvidenceModel>[0]> = {}) {
  return buildEventEvidenceModel({
    mentionCount: 1,
    supportingResponseIds: ['response_1'],
    analyzedEligibleResponseIds: ['response_1'],
    completedEligibleResponseCount: 1,
    extractionConfidence: 0.8,
    ...input,
  })
}

describe('canonical Events evidence model', () => {
  it.each([0.79, 0.8, 0.99])('keeps one analyzed response isolated at confidence %s', (extractionConfidence) => {
    expect(evidence({ extractionConfidence })).toMatchObject({
      uniqueAnalyzedResponseCount: 1,
      evidenceTier: 'ISOLATED',
      prevalenceLabel: 'One attendee mentioned this',
    })
  })

  it('classifies two unique analyzed responses as emerging', () => {
    expect(evidence({
      mentionCount: 2,
      supportingResponseIds: ['response_1', 'response_2'],
      analyzedEligibleResponseIds: ['response_1', 'response_2'],
      completedEligibleResponseCount: 2,
    }).evidenceTier).toBe('EMERGING')
  })

  it('maps persisted evidence tiers to concise presentation labels without changing the tiers', () => {
    expect(evidenceTierLabel('EMERGING')).toBe('Emerging')
    expect(evidenceTierLabel('REPEATED')).toBe('Consistent pattern')
    expect(evidenceTierLabel('STRONG')).toBe('Strong evidence')
  })

  it('requires at least fifty percent analysis coverage for a repeated pattern', () => {
    expect(evidence({
      mentionCount: 3,
      supportingResponseIds: ['response_1', 'response_2', 'response_3'],
      analyzedEligibleResponseIds: ['response_1', 'response_2', 'response_3'],
      completedEligibleResponseCount: 6,
    })).toMatchObject({ evidenceTier: 'REPEATED', prevalenceLabel: 'Repeated feedback' })
  })

  it('keeps the several-attendees wording eligible when three or four responses lack repeated-pattern coverage', () => {
    expect(evidence({
      mentionCount: 3,
      supportingResponseIds: ['response_1', 'response_2', 'response_3'],
      analyzedEligibleResponseIds: ['response_1', 'response_2', 'response_3'],
      completedEligibleResponseCount: 7,
    })).toMatchObject({
      evidenceTier: 'EMERGING',
      prevalenceLabel: 'Emerging signal',
      prevalenceCopyEligibility: { severalAttendeesMentioned: true, repeatedFeedback: false },
    })
  })

  it('requires support, coverage, and extraction quality for strong evidence', () => {
    const ids = Array.from({ length: 8 }, (_, index) => `response_${index}`)
    expect(evidence({ mentionCount: 12, supportingResponseIds: ids, analyzedEligibleResponseIds: ids, completedEligibleResponseCount: 10, extractionConfidence: 0.6 }).evidenceTier).toBe('STRONG')
    expect(evidence({ mentionCount: 12, supportingResponseIds: ids, analyzedEligibleResponseIds: ids, completedEligibleResponseCount: 12, extractionConfidence: 0.99 }).evidenceTier).not.toBe('STRONG')
  })

  it('keeps raw mentions separate and deduplicates multiple answers from one response', () => {
    expect(evidence({
      mentionCount: 4,
      supportingResponseIds: ['response_1', 'response_1', 'response_1', 'response_1'],
      analyzedEligibleResponseIds: ['response_1'],
      completedEligibleResponseCount: 8,
    })).toMatchObject({ mentionCount: 4, uniqueAnalyzedResponseCount: 1, evidenceTier: 'ISOLATED' })
  })

  it('does not let completed but unanalyzed responses increase an evidence tier', () => {
    expect(evidence({
      supportingResponseIds: ['response_1', 'response_2'],
      analyzedEligibleResponseIds: ['response_1', 'response_2'],
      completedEligibleResponseCount: 20,
    })).toMatchObject({ uniqueAnalyzedResponseCount: 2, evidenceTier: 'EMERGING', analysisCoverage: 0.1 })
  })
})
