import { buildEventEvidenceModel, type EventEvidenceModel, type EventEvidenceTier } from './evidence-model'
import {
  isGenericFindingTheme,
  normalizeFindingKey,
  type EventQuestionIntent,
} from './finding-synthesis'

export type EventIntelligenceFindingKind = 'theme' | 'signal' | 'opportunity' | 'positive' | 'risk'
export type EventIntelligenceFindingClassification = 'informational' | 'current-event' | 'after-event' | 'next-event'
export type EventIntelligenceEvidenceStrength = 'strong' | 'directional' | 'weak'

export interface IntelligenceThemeInput {
  themeKey: string
  label: string
  count: number
  sentimentLabel: string | null
  confidence: number | null
  evidence?: EventEvidenceModel
  statement?: string | null
  questionIntent?: EventQuestionIntent
  supportingAnswerIds?: string[]
  /** Completed response IDs retained so equivalent themes can merge safely. */
  supportingResponseIds?: string[]
  /** Persisted AnswerEventTheme IDs retained for audit/provenance. */
  supportingEvidenceIds?: string[]
  supportingTargetIds?: string[]
  /** Grounding copied from persisted summaries/transcripts, never taxonomy labels. */
  evidenceText?: string[]
  questionTypes?: string[]
  targetIdentity?: string
  targetName?: string | null
  targetKind?: string | null
}

export interface IntelligenceActionInput {
  themeKey?: string
  title: string
  description: string | null
  count?: number
  actionWindow: string | null
  confidence: number | null
  evidence?: EventEvidenceModel
  supportingAnswerIds?: string[]
  supportingResponseIds?: string[]
  supportingEvidenceIds?: string[]
  supportingTargetIds?: string[]
  evidenceText?: string[]
  targetIdentity?: string
  targetName?: string | null
  targetKind?: string | null
}

interface IntelligenceTargetInput {
  topThemes: IntelligenceThemeInput[]
  topThemeKeys?: string[]
}

interface IntelligenceIssueInput {
  taxonomyKey: string
  status: string
}

export interface EventIntelligenceFinding {
  id: string
  evidenceThemeKey: string
  /** All canonical taxonomy keys consolidated into this one finding. */
  evidenceThemeKeys: string[]
  title: string
  description: string | null
  kind: EventIntelligenceFindingKind
  classification: EventIntelligenceFindingClassification
  evidenceStrength: EventIntelligenceEvidenceStrength
  evidenceTier: EventEvidenceTier
  evidence: EventEvidenceModel
  confidence: number | null
  mentionCount: number
  sourceCount: number
  sentimentLabel: string | null
  supportingAnswerIds: string[]
  supportingResponseIds: string[]
  supportingEvidenceIds: string[]
  supportingTargetIds: string[]
  /** Bounded, persisted evidence summaries retained for downstream editorial synthesis. */
  evidenceText: string[]
  recommendation: string | null
  /** Stable aggregation identity, deliberately separate from display copy. */
  semanticDimension: string
  materialClaimKey: string
  targetIdentity: string
  targetName: string | null
  targetKind: string | null
  evidenceModalities: string[]
}

export interface EventIntelligenceContext {
  lifecycle?: 'PRE_EVENT' | 'IN_EVENT' | 'POST_EVENT'
  eventName?: string | null
  eventType?: string | null
}

interface BuildEventIntelligenceFindingsInput {
  themes: IntelligenceThemeInput[]
  actions: IntelligenceActionInput[]
  targets: IntelligenceTargetInput[]
  issues: IntelligenceIssueInput[]
  context?: EventIntelligenceContext
}

const ACTIVE_ISSUE_STATUSES = new Set(['NEW', 'ACKNOWLEDGED', 'ACTING'])

function normalizeKey(value: string): string {
  return normalizeFindingKey(value)
}

function isGenericTheme(theme: IntelligenceThemeInput): boolean {
  return isGenericFindingTheme(theme.themeKey, theme.label)
}

function evidenceTierRank(tier: EventEvidenceTier): number {
  if (tier === 'STRONG') return 3
  if (tier === 'REPEATED') return 2
  if (tier === 'EMERGING') return 1
  return 0
}

/** Compatibility display grouping derived exclusively from the canonical tier. */
export function evidenceStrengthForTier(tier: EventEvidenceTier): EventIntelligenceEvidenceStrength {
  if (tier === 'STRONG') return 'strong'
  if (tier === 'REPEATED' || tier === 'EMERGING') return 'directional'
  return 'weak'
}

function fallbackEvidence(mentionCount: number, confidence: number | null): EventEvidenceModel {
  const responseIds = Array.from({ length: Math.max(0, mentionCount) }, (_, index) => `legacy_response_${index}`)
  return buildEventEvidenceModel({
    mentionCount,
    supportingResponseIds: responseIds,
    analyzedEligibleResponseIds: responseIds,
    completedEligibleResponseCount: responseIds.length,
    extractionConfidence: confidence,
  })
}

function classifyActionWindow(actionWindow: string | null): EventIntelligenceFindingClassification {
  const normalized = actionWindow?.trim().toUpperCase() ?? ''
  if (['NOW', 'CURRENT', 'CURRENT_EVENT', 'DURING_EVENT'].includes(normalized)) return 'current-event'
  if (['AFTER', 'AFTER_EVENT', 'FOLLOW_UP'].includes(normalized)) return 'after-event'
  if (['LATER', 'NEXT', 'NEXT_EVENT'].includes(normalized)) return 'next-event'
  return 'informational'
}

function sourceCountForTheme(themeKey: string, targets: IntelligenceTargetInput[]): number {
  return targets.filter((target) => (
    target.topThemeKeys?.includes(themeKey)
    || target.topThemes.some((theme) => theme.themeKey === themeKey)
  )).length
}

function uniqueIds(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]
}

function normalizedClaim(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\bwell[ -]suited\b/g, 'suitable')
    .replace(/\b(perfect|ideal|suited)\b/g, 'suitable')
    .replace(/\b(location|site|facility)\b/g, 'venue')
    .replace(/\battendees?\s+(consistently\s+)?(?:reported|said|shared|noted|valued|felt|described|called|found|viewed|considered)\s+(?:that\s+)?/g, '')
    .replace(/\b(respondents|people)\s+(consistently\s+)?(?:reported|said|shared|noted|valued|felt|described|called|found|viewed|considered)\s+(?:that\s+)?/g, '')
    .replace(/\b(a few|several|many)\s+(attendees|respondents|people)\b/g, '')
    .replace(/\b(rated|scored)\s+(?:at\s+)?\d+(?:\.\d+)?\s*(?:out of|\/)\s*\d+(?:\.\d+)?\b/g, 'rated highly')
    .replace(/\b(clear|clarity)\b/g, 'clarity')
    .replace(/\b(engaged|engaging|engagement)\b/g, 'engagement')
    .replace(/\b(expert|expertise|knowledgeable)\b/g, 'expertise')
    .replace(/\b(connections?|connecting|connected)\b/g, 'connection')
    .replace(/\b(network|networked|networking)\b/g, 'networking')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const DIMENSION_RULES: Array<{ key: string; pattern: RegExp }> = [
  { key: 'speaker_pacing', pattern: /\b(speaker|presenter|delivery|keynote|panelist)\b[\s\S]*\b(pacing|pace|too fast|too slow)\b|\b(pacing|pace)\b[\s\S]*\b(speaker|presenter|delivery)\b/ },
  { key: 'speaker_clarity_engagement', pattern: /\b(speaker|presenter|delivery|clarity|clear|expertise|expert|engagement|engaging)\b[\s\S]*\b(clarity|clear|expertise|expert|engagement|engaging|rated highly|rating|score)\b/ },
  { key: 'session_practical_value', pattern: /\b(session|workshop|content|agenda)\b[\s\S]*\b(practical|useful|actionable|value|valuable|applicable)\b|\b(practical|useful|actionable)\b[\s\S]*\b(session|workshop|content)\b/ },
  { key: 'sponsor_value', pattern: /\b(sponsor|exhibitor|vendor|booth)\b[\s\S]*\b(value|discovery|discover|relevant|lead|roi|weak|strong)\b/ },
  { key: 'networking_quality', pattern: /\b(networking|connection|meet people|meeting people|matchmaking|reception|networking_expo)\b/ },
  { key: 'community_belonging', pattern: /\b(community|belonging|belong|welcoming|welcome|comfortable returning|return alone)\b/ },
  { key: 'wayfinding', pattern: /\b(wayfinding|signage|directions|navigation|hard to find|lost)\b/ },
  { key: 'registration_flow', pattern: /\b(registration|check[ -]?in|badge|entry|entrance|queue|line)\b/ },
  { key: 'room_environment_av', pattern: /\b(audio|microphone|sound|projector|screen|temperature|seating|room environment|av)\b/ },
  { key: 'hospitality', pattern: /\b(hospitality|food|beverage|coffee|water|catering|refreshments?)\b/ },
  { key: 'accessibility_safety', pattern: /\b(accessibility|accessible|safety|security|wheelchair|ada)\b/ },
]

const MECHANISM_SUFFIX = /(?:\s+|[_-]+)(rating|ratings|score|scores|survey result|survey results)$/i
const RISKY_CONTEXT_TERMS = ['expo', 'sponsor', 'exhibitor', 'booth', 'session', 'speaker', 'registration', 'hospitality'] as const

function stripMechanismSuffix(value: string): string {
  return value.replace(MECHANISM_SUFFIX, '').trim()
}

function canonicalDimension(input: {
  themeKey: string
  label: string
  statement: string | null
  evidenceText: string[]
  targetKind: string | null
}): string {
  const combined = `${input.themeKey} ${stripMechanismSuffix(input.label)} ${input.statement ?? ''} ${input.evidenceText.join(' ')} ${input.targetKind ?? ''}`
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
  const match = DIMENSION_RULES.find((rule) => rule.pattern.test(combined))
  return match?.key ?? normalizeKey(stripMechanismSuffix(input.themeKey || input.label))
}

function groundedText(input: {
  statement: string | null
  evidenceText: string[]
  targetName: string | null
  targetKind: string | null
  context?: EventIntelligenceContext
}): string {
  return [input.statement, ...input.evidenceText, input.targetName, input.targetKind, input.context?.eventName, input.context?.eventType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function dimensionDisplayTitle(dimension: string, grounding: string, fallback: string): string {
  if (dimension === 'speaker_clarity_engagement') return 'Speaker clarity and engagement'
  if (dimension === 'speaker_pacing') return 'Speaker pacing'
  if (dimension === 'session_practical_value') return stripMechanismSuffix(fallback)
  if (dimension === 'networking_quality') return /\b(expo|trade show|exhibition)\b/.test(grounding) ? 'Expo networking' : 'Networking'
  if (dimension === 'community_belonging') return 'Community and belonging'
  if (dimension === 'sponsor_value') return /\b(expo|exhibition)\b/.test(grounding) ? 'Expo sponsor value' : 'Sponsor value'
  if (dimension === 'wayfinding') return 'Wayfinding'
  if (dimension === 'registration_flow') return 'Registration and check-in'
  if (dimension === 'room_environment_av') return 'Room environment and AV'
  if (dimension === 'hospitality') return 'Hospitality'
  if (dimension === 'accessibility_safety') return 'Safety and accessibility'

  let title = stripMechanismSuffix(fallback)
  for (const term of RISKY_CONTEXT_TERMS) {
    if (!new RegExp(`\\b${term}\\b`, 'i').test(grounding)) {
      title = title.replace(new RegExp(`\\b(?:and\\s+)?${term}(?:s)?\\b`, 'ig'), '')
    }
  }
  return title.replace(/\s+(and|&)\s*$/i, '').replace(/\s{2,}/g, ' ').trim() || 'Event experience'
}

function groundedActionTitle(dimension: string, grounding: string, fallback: string): string {
  let title = stripMechanismSuffix(fallback)
  for (const term of RISKY_CONTEXT_TERMS) {
    if (!new RegExp(`\\b${term}\\b`, 'i').test(grounding)) {
      title = title.replace(new RegExp(`\\b(?:and\\s+)?${term}(?:s)?\\b`, 'ig'), '')
    }
  }
  title = title.replace(/\s+(and|&)\s*$/i, '').replace(/\s{2,}/g, ' ').trim()
  return title || dimensionDisplayTitle(dimension, grounding, fallback)
}

function evidenceModalities(questionTypes: string[] | undefined): string[] {
  const modalities = (questionTypes ?? []).map((type) => /RATING|RECOMMENDATION|SCALE|SCORE/i.test(type) ? 'structured' : 'qualitative')
  return uniqueIds(modalities.length > 0 ? modalities : ['qualitative'])
}

function canonicalFindingStatement(input: {
  dimension: string
  statement: string | null
  title: string
  targetName: string | null
  modalities: string[]
}): string | null {
  if (!input.statement) return null
  if (input.dimension === 'speaker_clarity_engagement' && input.targetName) {
    return input.modalities.includes('structured') && input.modalities.includes('qualitative')
      ? `${input.targetName} was consistently rated highly and described as clear, expert, and engaging.`
      : input.modalities.includes('structured')
        ? `${input.targetName} was consistently rated highly for clarity, expertise, and engagement.`
        : `${input.targetName} was consistently described as clear, expert, and engaging.`
  }
  if (input.dimension === 'session_practical_value' && /\brated\b[\s\S]*\b\d+(?:\.\d+)?\s*(?:out of|\/)\s*\d+/i.test(input.statement)) {
    const subject = input.targetName || input.title
    return `${subject} was consistently rated highly for practical value.`
  }
  return input.statement
    .replace(/\battendee rated\b/gi, 'attendees rated')
    .replace(/\battendees consistently reported that attendees rated\b/gi, 'Attendees consistently rated')
    .replace(/\battendees consistently reported that ([a-z])/i, (_, letter: string) => `Attendees consistently reported that ${letter.toUpperCase()}`)
}

function contentTokens(value: string): Set<string> {
  const ignored = new Set(['and', 'the', 'for', 'with', 'that', 'this', 'was', 'were', 'from', 'into', 'they', 'their', 'as', 'event', 'experience'])
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !ignored.has(token)))
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const token of left) if (right.has(token)) overlap += 1
  return overlap / new Set([...left, ...right]).size
}

function isSubset(left: Set<string>, right: Set<string>): boolean {
  return left.size > 0 && [...left].every((token) => right.has(token))
}

function evidenceOverlap(left: EventIntelligenceFinding, right: EventIntelligenceFinding): number {
  const leftIds = new Set(left.supportingAnswerIds.length > 0 ? left.supportingAnswerIds : left.supportingResponseIds)
  const rightIds = new Set(right.supportingAnswerIds.length > 0 ? right.supportingAnswerIds : right.supportingResponseIds)
  if (leftIds.size === 0 || rightIds.size === 0) return 0
  let overlap = 0
  for (const id of leftIds) if (rightIds.has(id)) overlap += 1
  return overlap / Math.min(leftIds.size, rightIds.size)
}

/**
 * The user-visible conclusion is the primary identity of a finding. Exact or
 * near-equivalent claims consolidate even when separate questions produced
 * disjoint proof; evidence overlap is only a fallback for less-obvious text.
 */
function areEquivalentFindings(left: EventIntelligenceFinding, right: EventIntelligenceFinding): boolean {
  if (left.kind !== right.kind || left.classification !== right.classification || left.targetIdentity !== right.targetIdentity) return false

  const leftClaim = normalizedClaim(left.description)
  const rightClaim = normalizedClaim(right.description)
  // User-visible claim equivalence is the product invariant. Evidence can be
  // disjoint when the same conclusion emerged from different questions.
  if (leftClaim && leftClaim === rightClaim) return true

  const claimSimilarity = jaccardSimilarity(contentTokens(leftClaim), contentTokens(rightClaim))
  if (claimSimilarity >= 0.8) return true

  // Modality is not identity. Once taxonomy/rating labels resolve to the same
  // semantic dimension for the same target and outcome, they are one finding.
  if (left.semanticDimension === right.semanticDimension) {
    const leftSentiment = left.sentimentLabel?.toUpperCase() ?? ''
    const rightSentiment = right.sentimentLabel?.toUpperCase() ?? ''
    if (!leftSentiment || !rightSentiment || leftSentiment === rightSentiment) return true
  }

  const leftTitleTokens = contentTokens(left.title)
  const rightTitleTokens = contentTokens(right.title)
  const titleIsParentOrChild = isSubset(leftTitleTokens, rightTitleTokens) || isSubset(rightTitleTokens, leftTitleTokens)
  // For less-obvious wording, substantial shared proof can support a merge,
  // but it is never required for claims that are already equivalent above.
  return evidenceOverlap(left, right) >= 0.5 && titleIsParentOrChild && claimSimilarity >= 0.55
}

function findingSpecificity(finding: EventIntelligenceFinding): number {
  return contentTokens(finding.title).size
    - (MECHANISM_SUFFIX.test(finding.title) ? 10 : 0)
    - (isGenericFindingTheme(finding.evidenceThemeKey, finding.title) ? 20 : 0)
}

function compareFindingPreference(left: EventIntelligenceFinding, right: EventIntelligenceFinding): number {
  return findingSpecificity(left) - findingSpecificity(right)
    || evidenceTierRank(left.evidenceTier) - evidenceTierRank(right.evidenceTier)
    || left.evidence.uniqueAnalyzedResponseCount - right.evidence.uniqueAnalyzedResponseCount
    || left.mentionCount - right.mentionCount
    || (left.confidence ?? -1) - (right.confidence ?? -1)
    || right.title.localeCompare(left.title)
}

function weightedConfidence(findings: EventIntelligenceFinding[]): number | null {
  const weighted = findings.reduce<{ total: number; weight: number }>((result, finding) => {
    if (finding.confidence === null) return result
    const weight = Math.max(1, finding.mentionCount)
    return { total: result.total + finding.confidence * weight, weight: result.weight + weight }
  }, { total: 0, weight: 0 })
  return weighted.weight === 0 ? null : weighted.total / weighted.weight
}

function mergeEquivalentFindings(left: EventIntelligenceFinding, right: EventIntelligenceFinding): EventIntelligenceFinding {
  const primary = compareFindingPreference(left, right) >= 0 ? left : right
  const merged = [left, right]
  const supportingAnswerIds = uniqueIds(merged.flatMap((finding) => finding.supportingAnswerIds))
  const supportingResponseIds = uniqueIds(merged.flatMap((finding) => finding.supportingResponseIds))
  const supportingEvidenceIds = uniqueIds(merged.flatMap((finding) => finding.supportingEvidenceIds))
  const supportingTargetIds = uniqueIds(merged.flatMap((finding) => finding.supportingTargetIds))
  const evidenceText = uniqueIds(merged.flatMap((finding) => finding.evidenceText))
  // One answer can carry both a generic and specific extraction. Count that
  // answer once after consolidation, while retaining every source ID for audit.
  const mentionCount = supportingAnswerIds.length || supportingEvidenceIds.length || Math.max(left.mentionCount, right.mentionCount)
  const confidence = weightedConfidence(merged)
  const analyzedEligibleResponseCount = Math.max(
    supportingResponseIds.length,
    ...merged.map((finding) => finding.evidence.analyzedEligibleResponseCount),
  )
  const evidence = buildEventEvidenceModel({
    mentionCount,
    supportingResponseIds,
    completedEligibleResponseCount: Math.max(
      analyzedEligibleResponseCount,
      ...merged.map((finding) => finding.evidence.completedEligibleResponseCount),
    ),
    analyzedEligibleResponseCount,
    extractionConfidence: confidence,
  })
  const evidenceModalities = uniqueIds(merged.flatMap((finding) => finding.evidenceModalities))
  let description = primary.description
  if (
    primary.semanticDimension === 'speaker_clarity_engagement'
    && evidenceModalities.includes('structured')
    && evidenceModalities.includes('qualitative')
    && primary.targetName
  ) {
    description = `${primary.targetName} was consistently rated highly and described as clear, expert, and engaging.`
  }

  return {
    ...primary,
    evidenceThemeKeys: uniqueIds(merged.flatMap((finding) => finding.evidenceThemeKeys)),
    evidence,
    evidenceTier: evidence.evidenceTier,
    evidenceStrength: evidenceStrengthForTier(evidence.evidenceTier),
    confidence,
    mentionCount,
    sourceCount: supportingTargetIds.length || Math.max(...merged.map((finding) => finding.sourceCount)),
    supportingAnswerIds,
    supportingResponseIds,
    supportingEvidenceIds,
    supportingTargetIds,
    evidenceText,
    description,
    evidenceModalities,
  }
}

/** Canonical last-mile aggregation used by every Intelligence surface. */
export function deduplicateEventIntelligenceFindings(findings: EventIntelligenceFinding[]): EventIntelligenceFinding[] {
  return findings.reduce<EventIntelligenceFinding[]>((result, finding) => {
    const duplicateIndex = result.findIndex((existing) => areEquivalentFindings(existing, finding))
    if (duplicateIndex === -1) return [...result, finding]
    const next = [...result]
    next[duplicateIndex] = mergeEquivalentFindings(next[duplicateIndex], finding)
    return next
  }, [])
}

function disambiguateDistinctFindingTitles(findings: EventIntelligenceFinding[]): EventIntelligenceFinding[] {
  const counts = new Map<string, number>()
  for (const finding of findings) counts.set(normalizeKey(finding.title), (counts.get(normalizeKey(finding.title)) ?? 0) + 1)
  return findings.map((finding) => {
    if ((counts.get(normalizeKey(finding.title)) ?? 0) < 2) return finding
    const sentiment = finding.sentimentLabel?.toUpperCase()
    if (finding.kind === 'risk' || finding.kind === 'signal' || sentiment === 'NEGATIVE') {
      return { ...finding, title: `${finding.title} concerns` }
    }
    if (finding.kind === 'positive' || sentiment === 'POSITIVE') {
      return { ...finding, title: `${finding.title} strengths` }
    }
    return finding
  })
}

export function buildEventIntelligenceFindings({
  themes,
  actions,
  targets,
  issues,
  context,
}: BuildEventIntelligenceFindingsInput): EventIntelligenceFinding[] {
  const activeIssueKeys = new Set(
    issues
      .filter((issue) => ACTIVE_ISSUE_STATUSES.has(issue.status))
      .map((issue) => normalizeKey(issue.taxonomyKey)),
  )

  const specificThemeExists = themes.some((theme) => !isGenericTheme(theme))
  const themeFindings = themes
    .filter((theme) => theme.themeKey && !activeIssueKeys.has(normalizeKey(theme.themeKey)))
    .map((theme): EventIntelligenceFinding => {
      const evidence = theme.evidence ?? fallbackEvidence(theme.count, theme.confidence)
      const evidenceStrength = evidenceStrengthForTier(evidence.evidenceTier)
      const sentiment = theme.sentimentLabel?.trim().toUpperCase() ?? ''
      const questionIntent = theme.questionIntent ?? 'neutral'
      const kind: EventIntelligenceFindingKind = questionIntent === 'improvement'
        ? 'opportunity'
        : evidence.evidenceTier === 'ISOLATED' && (questionIntent === 'friction' || sentiment === 'NEGATIVE')
          ? 'signal'
          : questionIntent === 'friction'
            ? 'risk'
            : sentiment === 'POSITIVE' || (questionIntent === 'strength' && sentiment !== 'NEGATIVE')
              ? 'positive'
              : evidenceStrength === 'weak'
                ? 'signal'
                : sentiment === 'NEGATIVE'
                  ? 'risk'
                  : 'theme'
      const linkedRecommendation = questionIntent === 'improvement'
        ? actions.find((action) => action.themeKey === theme.themeKey)?.title ?? null
        : null
      const semanticDimension = canonicalDimension({
        themeKey: theme.themeKey,
        label: theme.label,
        statement: theme.statement ?? null,
        evidenceText: theme.evidenceText ?? [],
        targetKind: theme.targetKind ?? null,
      })
      const targetIdentity = theme.targetIdentity ?? 'event'
      const grounding = groundedText({
        statement: theme.statement ?? null,
        evidenceText: theme.evidenceText ?? [],
        targetName: theme.targetName ?? null,
        targetKind: theme.targetKind ?? null,
        context,
      })
      const title = dimensionDisplayTitle(semanticDimension, grounding, theme.label)
      const claim = normalizedClaim(theme.statement ?? title)
      const modalities = evidenceModalities(theme.questionTypes)

      return {
        id: `${context?.lifecycle ?? 'EVENT'}:${kind}:${targetIdentity}:${semanticDimension}:${claim}`,
        evidenceThemeKey: theme.themeKey,
        evidenceThemeKeys: [theme.themeKey],
        title,
        description: canonicalFindingStatement({
          dimension: semanticDimension,
          statement: theme.statement ?? null,
          title,
          targetName: theme.targetName ?? null,
          modalities,
        }),
        kind,
        // Lifecycle changes the action framing, never the underlying evidence.
        // Pre-event feedback informs upcoming plans; post-event feedback is a
        // follow-up/next-event learning rather than an onsite instruction.
        classification: kind === 'opportunity'
          ? 'next-event'
          : kind === 'risk'
            ? context?.lifecycle === 'PRE_EVENT'
              ? 'next-event'
              : context?.lifecycle === 'POST_EVENT'
                ? 'after-event'
                : evidence.evidenceTier === 'EMERGING' || evidence.evidenceTier === 'REPEATED' || evidence.evidenceTier === 'STRONG'
                  ? 'current-event'
                  : 'informational'
            : 'informational',
        evidenceStrength,
        evidenceTier: evidence.evidenceTier,
        evidence,
        confidence: theme.confidence,
        mentionCount: theme.count,
        sourceCount: theme.supportingTargetIds?.length || sourceCountForTheme(theme.themeKey, targets),
        sentimentLabel: theme.sentimentLabel,
        supportingAnswerIds: theme.supportingAnswerIds ?? [],
        supportingResponseIds: theme.supportingResponseIds ?? [],
        supportingEvidenceIds: theme.supportingEvidenceIds ?? [],
        supportingTargetIds: theme.supportingTargetIds ?? [],
        evidenceText: uniqueIds(theme.evidenceText ?? []),
        recommendation: linkedRecommendation,
        semanticDimension,
        materialClaimKey: claim,
        targetIdentity,
        targetName: theme.targetName ?? null,
        targetKind: theme.targetKind ?? null,
        evidenceModalities: modalities,
      }
    })

  const opportunityFindings = actions
    .filter((action): action is IntelligenceActionInput & { themeKey: string } => Boolean(action.themeKey))
    .filter((action) => !activeIssueKeys.has(normalizeKey(action.themeKey)))
    .map((action): EventIntelligenceFinding => {
      const semanticDimension = canonicalDimension({
        themeKey: action.themeKey,
        label: action.title,
        statement: action.description,
        evidenceText: action.evidenceText ?? [],
        targetKind: action.targetKind ?? null,
      })
      const targetIdentity = action.targetIdentity ?? 'event'
      const grounding = groundedText({
        statement: action.description,
        evidenceText: action.evidenceText ?? [],
        targetName: action.targetName ?? null,
        targetKind: action.targetKind ?? null,
        context,
      })
      const title = groundedActionTitle(semanticDimension, grounding, action.title)
      const claim = normalizedClaim(action.description ?? title)
      return ({
      id: `opportunity:${normalizeKey(action.title)}:${action.themeKey}`,
      evidenceThemeKey: action.themeKey,
      evidenceThemeKeys: [action.themeKey],
      title,
      description: action.description,
      kind: 'opportunity',
      classification: classifyActionWindow(action.actionWindow),
      evidenceStrength: evidenceStrengthForTier((action.evidence ?? fallbackEvidence(action.count ?? 0, action.confidence)).evidenceTier),
      evidenceTier: (action.evidence ?? fallbackEvidence(action.count ?? 0, action.confidence)).evidenceTier,
      evidence: action.evidence ?? fallbackEvidence(action.count ?? 0, action.confidence),
      confidence: action.confidence,
      mentionCount: action.count ?? 0,
      sourceCount: action.supportingTargetIds?.length || sourceCountForTheme(action.themeKey, targets),
      sentimentLabel: null,
      supportingAnswerIds: action.supportingAnswerIds ?? [],
      supportingResponseIds: action.supportingResponseIds ?? [],
      supportingEvidenceIds: action.supportingEvidenceIds ?? [],
      supportingTargetIds: action.supportingTargetIds ?? [],
      evidenceText: uniqueIds(action.evidenceText ?? []),
      recommendation: action.title,
      semanticDimension,
      materialClaimKey: claim,
      targetIdentity,
      targetName: action.targetName ?? null,
      targetKind: action.targetKind ?? null,
      evidenceModalities: ['qualitative'],
    })})

  return disambiguateDistinctFindingTitles(deduplicateEventIntelligenceFindings([...themeFindings, ...opportunityFindings]))
    .filter((finding) => !specificThemeExists || finding.evidenceThemeKeys.some((themeKey) => {
      const source = themes.find((theme) => theme.themeKey === themeKey)
      return source ? !isGenericTheme(source) : true
    }))
    .sort((left, right) => (
      evidenceTierRank(right.evidenceTier) - evidenceTierRank(left.evidenceTier)
      || right.mentionCount - left.mentionCount
      || (right.confidence ?? -1) - (left.confidence ?? -1)
      || left.title.localeCompare(right.title)
    ))
}
