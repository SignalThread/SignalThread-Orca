/**
 * Canonical evidence and prevalence rules for Events intelligence surfaces.
 * A mention is an extracted concept occurrence; prevalence always deduplicates
 * by completed Response.id so multiple answers cannot inflate a finding.
 */
export const EVENT_EVIDENCE_TIERS = ['NONE', 'ISOLATED', 'EMERGING', 'REPEATED', 'STRONG'] as const

export type EventEvidenceTier = typeof EVENT_EVIDENCE_TIERS[number]

export interface EventEvidenceModel {
  mentionCount: number
  uniqueAnalyzedResponseCount: number
  completedEligibleResponseCount: number
  analyzedEligibleResponseCount: number
  analysisCoverage: number
  extractionConfidence: number | null
  evidenceTier: EventEvidenceTier
  prevalenceLabel: string
  prevalenceCopyEligibility: {
    oneAttendeeMentioned: boolean
    emergingSignal: boolean
    severalAttendeesMentioned: boolean
    repeatedFeedback: boolean
  }
}

export interface BuildEventEvidenceModelInput {
  /** Raw extracted occurrences, retained for audit and drill-down. */
  mentionCount: number
  /** Every completed response supporting this finding. Duplicates are ignored. */
  supportingResponseIds: Iterable<string | null | undefined>
  /** All completed responses eligible for this selected Event scope. */
  completedEligibleResponseCount: number
  /** Successful current-path analysis responses in the same selected scope. */
  analyzedEligibleResponseIds?: Iterable<string | null | undefined>
  analyzedEligibleResponseCount?: number
  /** Aggregated extraction confidence for the supporting evidence. */
  extractionConfidence: number | null
}

function uniqueIds(values: Iterable<string | null | undefined>): Set<string> {
  const result = new Set<string>()
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) result.add(value)
  }
  return result
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function prevalenceLabelForEvidenceTier(tier: EventEvidenceTier, uniqueResponseCount: number): string {
  if (tier === 'NONE') return 'No analyzed feedback yet'
  if (tier === 'ISOLATED') return 'One attendee mentioned this'
  if (tier === 'EMERGING') return 'Emerging signal'
  if (tier === 'REPEATED' || tier === 'STRONG') return 'Repeated feedback'
  if (uniqueResponseCount <= 4) return 'Several attendees mentioned this'
  return 'Repeated feedback'
}

export function evidenceTierLabel(tier: EventEvidenceTier): string {
  if (tier === 'STRONG') return 'Strong evidence'
  // This is presentation copy only. The persisted tier remains unchanged.
  if (tier === 'REPEATED') return 'Consistent pattern'
  if (tier === 'EMERGING') return 'Emerging'
  if (tier === 'ISOLATED') return 'Isolated observation'
  return 'No analyzed feedback yet'
}

export function buildEventEvidenceModel(input: BuildEventEvidenceModelInput): EventEvidenceModel {
  const supportingResponseIds = uniqueIds(input.supportingResponseIds)
  const analyzedResponseIds = input.analyzedEligibleResponseIds
    ? uniqueIds(input.analyzedEligibleResponseIds)
    : null
  const uniqueAnalyzedResponseCount = supportingResponseIds.size
  const analyzedEligibleResponseCount = analyzedResponseIds
    ? analyzedResponseIds.size
    : nonNegativeInteger(input.analyzedEligibleResponseCount ?? uniqueAnalyzedResponseCount)
  const completedEligibleResponseCount = Math.max(
    nonNegativeInteger(input.completedEligibleResponseCount),
    analyzedEligibleResponseCount,
  )
  const analysisCoverage = completedEligibleResponseCount > 0
    ? analyzedEligibleResponseCount / completedEligibleResponseCount
    : 0
  const extractionConfidence = typeof input.extractionConfidence === 'number' && Number.isFinite(input.extractionConfidence)
    ? Math.max(0, Math.min(1, input.extractionConfidence))
    : null

  const evidenceTier: EventEvidenceTier = uniqueAnalyzedResponseCount === 0
    ? 'NONE'
    : uniqueAnalyzedResponseCount >= 8 && analysisCoverage >= 0.7 && (extractionConfidence ?? 0) >= 0.6
      ? 'STRONG'
      : uniqueAnalyzedResponseCount >= 3 && analysisCoverage >= 0.5
        ? 'REPEATED'
        : uniqueAnalyzedResponseCount >= 2
          ? 'EMERGING'
          : 'ISOLATED'

  return {
    mentionCount: nonNegativeInteger(input.mentionCount),
    uniqueAnalyzedResponseCount,
    completedEligibleResponseCount,
    analyzedEligibleResponseCount,
    analysisCoverage,
    extractionConfidence,
    evidenceTier,
    prevalenceLabel: prevalenceLabelForEvidenceTier(evidenceTier, uniqueAnalyzedResponseCount),
    prevalenceCopyEligibility: {
      oneAttendeeMentioned: uniqueAnalyzedResponseCount === 1,
      emergingSignal: uniqueAnalyzedResponseCount === 2,
      severalAttendeesMentioned: uniqueAnalyzedResponseCount >= 3 && uniqueAnalyzedResponseCount <= 4,
      repeatedFeedback: uniqueAnalyzedResponseCount >= 3 && analysisCoverage >= 0.5,
    },
  }
}
