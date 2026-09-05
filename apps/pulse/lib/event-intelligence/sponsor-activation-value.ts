import { normalizeBriefSeverity, type ActionBriefSeverity } from './action-briefs'

/**
 * Sponsor activation value is a pure read-time projection of existing event
 * intelligence: the per-target breakdown (mentions, sentiment, themes) joined
 * with the attention queue (issues/opportunities + evidence quotes) for survey
 * targets attached to SPONSOR_ACTIVATION structure items. No persistence, no
 * new API, no schema — attribution uses the structure-item kind already
 * surfaced on the intelligence target breakdown.
 */

const SPONSOR_ACTIVATION_KIND = 'SPONSOR_ACTIVATION'

const SEVERITY_RANK: Record<ActionBriefSeverity, number> = {
  Immediate: 0,
  Soon: 1,
  Watch: 2,
  Informational: 3,
}

export type SponsorSentiment = 'positive' | 'negative' | 'mixed' | 'neutral'

export interface SponsorActivationTheme {
  label: string
  count: number
}

export interface SponsorActivationIssue {
  id: string
  title: string
  severity: ActionBriefSeverity
  evidenceCount: number
  quote: string | null
  evidenceId: string | null
}

export interface SponsorActivationValue {
  surveyTargetId: string | null
  name: string
  mentions: number
  responseCount: number
  avgSentiment: number | null
  sentimentLabel: SponsorSentiment
  highUrgencyCount: number
  topThemes: SponsorActivationTheme[]
  issues: SponsorActivationIssue[]
}

export interface SponsorActivationBreakdownSource {
  surveyTargetId: string | null
  name: string
  eventStructureItemKind?: string | null
  responseCount: number
  answerCount: number
  avgSentiment: number | null
  highUrgencyCount: number
  topThemes: Array<{ label: string; count: number }>
}

export interface SponsorActivationAttentionSource {
  id: string | null
  title: string
  priorityLevel: string
  evidenceCount: number
  affectedTarget: { id: string } | null
  representativeEvidence: Array<{ id: string; transcriptSnippet?: string | null }>
}

export function sponsorSentimentLabel(avg: number | null): SponsorSentiment {
  if (avg == null) return 'neutral'
  if (avg >= 0.15) return 'positive'
  if (avg <= -0.15) return 'negative'
  return 'mixed'
}

export function buildSponsorActivationValues(
  breakdown: SponsorActivationBreakdownSource[] | null | undefined,
  attentionItems: SponsorActivationAttentionSource[] | null | undefined,
  options: { limit?: number; issueLimit?: number } = {},
): SponsorActivationValue[] {
  const sponsors = (breakdown ?? []).filter(
    (row) => row.eventStructureItemKind === SPONSOR_ACTIVATION_KIND && row.surveyTargetId,
  )
  const items = attentionItems ?? []
  const issueLimit = options.issueLimit ?? 3

  const values: SponsorActivationValue[] = sponsors.map((row) => {
    const issues = items
      .filter((item) => item.affectedTarget?.id && item.affectedTarget.id === row.surveyTargetId)
      .map((item) => ({
        id: item.id ?? item.representativeEvidence?.[0]?.id ?? item.title,
        title: item.title,
        severity: normalizeBriefSeverity(item.priorityLevel),
        evidenceCount: item.evidenceCount,
        quote: item.representativeEvidence?.[0]?.transcriptSnippet ?? null,
        evidenceId: item.representativeEvidence?.[0]?.id ?? null,
      }))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.evidenceCount - a.evidenceCount)
      .slice(0, issueLimit)

    return {
      surveyTargetId: row.surveyTargetId,
      name: row.name,
      mentions: row.answerCount,
      responseCount: row.responseCount,
      avgSentiment: row.avgSentiment,
      sentimentLabel: sponsorSentimentLabel(row.avgSentiment),
      highUrgencyCount: row.highUrgencyCount,
      topThemes: (row.topThemes ?? []).map((theme) => ({ label: theme.label, count: theme.count })),
      issues,
    }
  })

  values.sort((a, b) => b.mentions - a.mentions || b.highUrgencyCount - a.highUrgencyCount)

  return typeof options.limit === 'number' ? values.slice(0, options.limit) : values
}
