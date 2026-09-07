import { isActiveEventIssueClusterStatus } from './contract'

/**
 * Action briefs are a pure read-time projection of the existing event
 * intelligence attention queue (deduplicated issue clusters + evidence).
 * They reshape cluster data into operator-ready cards. No persistence and no
 * new API: every field is derived from data already returned by
 * GET /api/app/events/[eventId]/intelligence.
 */

export type ActionBriefSentiment = 'positive' | 'negative' | 'mixed' | 'neutral'
export type ActionBriefSeverity = 'Immediate' | 'Soon' | 'Watch' | 'Informational'

export interface ActionBriefSourceEvidence {
  id: string
  sentimentScore: number | null
}

export interface ActionBriefSource {
  id: string | null
  taxonomyKey?: string
  title: string
  summary: string | null
  priorityLevel: string
  confidence: number | null
  evidenceCount: number
  recommendedNextStep: string | null
  status: string
  affectedTarget: { id: string; name: string; category: string | null } | null
  affectedQuestion: { id: string; key: string | null; label: string; order: number | null } | null
  representativeEvidence: ActionBriefSourceEvidence[]
}

export interface ActionBrief {
  id: string
  /** Underlying issue-cluster id, when persisted. Required for status updates. */
  clusterId: string | null
  title: string
  summary: string | null
  affectedArea: string | null
  evidenceCount: number
  sentiment: ActionBriefSentiment
  severity: ActionBriefSeverity
  recommendedAction: string | null
  confidence: number | null
  status: string
  evidenceId: string | null
}

export interface BuildActionBriefsOptions {
  /** Include RESOLVED/DISMISSED clusters. Defaults to active-only. */
  includeClosed?: boolean
  /** Cap the number of briefs returned. */
  limit?: number
}

const SEVERITY_RANK: Record<ActionBriefSeverity, number> = {
  Immediate: 0,
  Soon: 1,
  Watch: 2,
  Informational: 3,
}

export function normalizeBriefSeverity(value: string | null | undefined): ActionBriefSeverity {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'immediate':
      return 'Immediate'
    case 'soon':
      return 'Soon'
    case 'watch':
      return 'Watch'
    default:
      return 'Informational'
  }
}

export function deriveBriefSentiment(evidence: ActionBriefSourceEvidence[]): ActionBriefSentiment {
  const scores = (evidence ?? [])
    .map((item) => item.sentimentScore)
    .filter((score): score is number => typeof score === 'number')

  if (scores.length === 0) return 'neutral'
  const avg = scores.reduce((total, score) => total + score, 0) / scores.length
  if (avg >= 0.15) return 'positive'
  if (avg <= -0.15) return 'negative'
  return 'mixed'
}

export function briefFromAttentionItem(item: ActionBriefSource): ActionBrief {
  return {
    id: item.id ?? item.taxonomyKey ?? item.title,
    clusterId: item.id,
    title: item.title,
    summary: item.summary,
    affectedArea: item.affectedTarget?.name ?? item.affectedQuestion?.label ?? null,
    evidenceCount: item.evidenceCount,
    sentiment: deriveBriefSentiment(item.representativeEvidence ?? []),
    severity: normalizeBriefSeverity(item.priorityLevel),
    recommendedAction: item.recommendedNextStep,
    confidence: item.confidence,
    status: item.status,
    evidenceId: item.representativeEvidence?.[0]?.id ?? null,
  }
}

/**
 * Plain-text summary of a single action brief, suitable for pasting into
 * Slack, email, or internal notes. Pure string formatting from existing data.
 */
export function formatActionBriefText(brief: ActionBrief): string {
  const lines: string[] = []
  lines.push(`[${brief.severity}] ${brief.title}`)
  if (brief.affectedArea) lines.push(`Area: ${brief.affectedArea}`)
  lines.push(`Sentiment: ${brief.sentiment} · Evidence: ${brief.evidenceCount} · Status: ${brief.status}`)
  if (brief.summary) lines.push(`Summary: ${brief.summary}`)
  if (brief.recommendedAction) lines.push(`Recommended: ${brief.recommendedAction}`)
  return lines.join('\n')
}

/**
 * Plain-text event-level operations summary built from the open action briefs.
 * Evidence-backed, no filler. `generatedAt` is injectable for deterministic
 * output/testing.
 */
export function formatEventOperationsSummary(input: {
  eventName: string
  briefs: ActionBrief[]
  generatedAt?: Date
}): string {
  const generatedAt = input.generatedAt ?? new Date()
  const lines: string[] = []
  lines.push(`Event Operations Summary — ${input.eventName}`)
  lines.push(`Generated ${generatedAt.toISOString()}`)
  lines.push('')

  if (input.briefs.length === 0) {
    lines.push('No open action briefs. No operational issues have surfaced from attendee feedback yet.')
    return lines.join('\n')
  }

  lines.push(`Open action briefs: ${input.briefs.length}`)
  lines.push('')
  input.briefs.forEach((brief, index) => {
    const area = brief.affectedArea ? ` — ${brief.affectedArea}` : ''
    lines.push(`${index + 1}. [${brief.severity}] ${brief.title}${area} (${brief.evidenceCount} evidence, ${brief.sentiment})`)
    if (brief.recommendedAction) lines.push(`   Recommended: ${brief.recommendedAction}`)
  })
  return lines.join('\n')
}

export function buildActionBriefs(
  items: ActionBriefSource[] | null | undefined,
  options: BuildActionBriefsOptions = {},
): ActionBrief[] {
  const briefs = (items ?? []).map(briefFromAttentionItem)
  const visible = options.includeClosed
    ? briefs
    : briefs.filter((brief) => isActiveEventIssueClusterStatus(brief.status))

  visible.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (severityDiff !== 0) return severityDiff
    return b.evidenceCount - a.evidenceCount
  })

  return typeof options.limit === 'number' ? visible.slice(0, options.limit) : visible
}
