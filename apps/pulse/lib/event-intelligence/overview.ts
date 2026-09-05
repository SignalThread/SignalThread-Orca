import { isActiveEventIssueClusterStatus } from '@/lib/event-intelligence/contract'
import { buildEventEvidenceModel, type EventEvidenceModel } from '@/lib/event-intelligence/evidence-model'
import { isGenericFindingTheme, type EventQuestionIntent } from '@/lib/event-intelligence/finding-synthesis'
import type { EventIntelligenceFinding } from '@/lib/event-intelligence/intelligence-view'
import { synthesizeEventEditorial } from '@/lib/event-intelligence/editorial-engine'

export interface InEventOverviewTheme {
  themeKey: string
  themeKeys?: string[]
  label: string
  count: number
  sentimentLabel: string | null
  confidence: number | null
  evidence?: EventEvidenceModel
  statement?: string | null
  questionIntent?: EventQuestionIntent
  supportingAnswerIds?: string[]
  supportingResponseIds?: string[]
  supportingEvidenceIds?: string[]
  supportingTargetIds?: string[]
}

export interface InEventOverviewAction {
  themeKey?: string
  title: string
  count?: number
  priority: string
  priorityLevel?: string
  urgency: string
  actionWindow: string | null
  confidence: number | null
  description?: string | null
}

export interface InEventOverviewIssue {
  id: string | null
  taxonomyKey: string
  title: string
  priorityLevel: string
  confidence: number | null
  status: string
  ownerUserId?: string | null
  noteCount?: number
}

export interface InEventOverviewModel {
  keep: InEventOverviewTheme[]
  improveNow: InEventOverviewIssue[]
  reviewThemes: InEventOverviewTheme[]
  revisitNextEvent: InEventOverviewAction[]
  openFollowUp: InEventOverviewIssue[]
  confidence: {
    strong: number
    directional: number
    emerging: number
  }
}

type InEventOverviewSynopsisFinding = Pick<
  EventIntelligenceFinding,
  'title' | 'description' | 'kind' | 'evidenceTier' | 'mentionCount' | 'sentimentLabel'
> & Partial<Pick<EventIntelligenceFinding, 'targetKind'>>

export function buildInEventOverviewSummary(input: {
  responseCount: number
  answerCount: number
  representedFeedbackPoints: number
  configuredFeedbackPoints: number
  sentimentPercent: number | null
  eventName?: string | null
  findings: InEventOverviewSynopsisFinding[]
  overview: InEventOverviewModel
}) {
  const editorialFacts = input.findings.map((finding) => ({
    title: finding.title,
    statement: finding.description,
    kind: finding.kind,
    evidenceTier: finding.evidenceTier,
    mentionCount: finding.mentionCount,
    sentimentLabel: finding.sentimentLabel,
    scope: finding.targetKind,
  }))
  editorialFacts.push(...input.overview.improveNow.map((issue) => ({
    title: issue.title,
    statement: issue.title,
    kind: 'risk' as const,
    evidenceTier: 'REPEATED' as const,
    mentionCount: 0,
    sentimentLabel: null,
    scope: null,
  })))
  const editorial = synthesizeEventEditorial({ lifecycle: 'DURING_EVENT', eventName: input.eventName, facts: editorialFacts })
  return `${editorial.headline} ${editorial.synopsis}`
}

const PRIORITY_ORDER = new Map([
  ['IMMEDIATE', 0],
  ['SOON', 1],
  ['WATCH', 2],
  ['INFORMATIONAL', 3],
])

function priorityRank(value: string | null | undefined) {
  return PRIORITY_ORDER.get(value?.trim().toUpperCase() ?? '') ?? 3
}

function evidenceTierForOverview(value: InEventOverviewTheme) {
  return value.evidence ?? buildEventEvidenceModel({
    mentionCount: value.count,
    supportingResponseIds: Array.from({ length: value.count }, (_, index) => `legacy_response_${index}`),
    completedEligibleResponseCount: value.count,
    extractionConfidence: value.confidence,
  })
}

function evidenceTierRank(value: InEventOverviewTheme) {
  const tier = evidenceTierForOverview(value).evidenceTier
  return tier === 'STRONG' ? 3 : tier === 'REPEATED' ? 2 : tier === 'EMERGING' ? 1 : 0
}

function isGenericTheme(value: InEventOverviewTheme) {
  return isGenericFindingTheme(value.themeKey, value.label)
}

function usefulThemes(themes: InEventOverviewTheme[]) {
  const specificThemeExists = themes.some((theme) => !isGenericTheme(theme))
  return themes
    .filter((theme) => theme.themeKey && (!specificThemeExists || !isGenericTheme(theme)))
    .map((theme) => ({ ...theme, evidence: evidenceTierForOverview(theme) }))
    .sort((left, right) => evidenceTierRank(right) - evidenceTierRank(left) || right.count - left.count || left.label.localeCompare(right.label))
}

function isLaterAction(action: InEventOverviewAction) {
  const window = action.actionWindow?.trim().toUpperCase()
  return window === 'WATCH' || window === 'LATER' || priorityRank(action.priorityLevel ?? action.priority ?? action.urgency) === 2
}

export function buildInEventOverview(input: {
  themes: InEventOverviewTheme[]
  actions: InEventOverviewAction[]
  issues: InEventOverviewIssue[]
}): InEventOverviewModel {
  const activeIssues = input.issues
    .filter((issue) => isActiveEventIssueClusterStatus(issue.status))
    .sort((left, right) => priorityRank(left.priorityLevel) - priorityRank(right.priorityLevel))
  const activeTaxonomyKeys = new Set(activeIssues.map((issue) => issue.taxonomyKey))

  const eligibleThemes = usefulThemes(input.themes)
  const keep = eligibleThemes
    .filter((theme) => theme.questionIntent !== 'improvement' && (
      theme.sentimentLabel?.toUpperCase() === 'POSITIVE'
      || (theme.questionIntent === 'strength' && theme.sentimentLabel?.toUpperCase() !== 'NEGATIVE')
    ))

  // Emerging/consistent negative or mixed evidence is still useful to watch,
  // even when it has not produced an operational issue cluster yet.
  const reviewThemes = eligibleThemes
    .filter((theme) => {
      const sentiment = theme.sentimentLabel?.toUpperCase()
      return (theme.questionIntent === 'friction' || sentiment === 'NEGATIVE' || sentiment === 'MIXED') && evidenceTierRank(theme) > 0
    })

  const improveNow = activeIssues.filter((issue) => priorityRank(issue.priorityLevel) <= 1)

  const themeLearnings: InEventOverviewAction[] = eligibleThemes
    .filter((theme) => theme.questionIntent === 'improvement')
    .map((theme) => ({
      themeKey: theme.themeKey,
      title: theme.label,
      description: theme.statement,
      count: theme.count,
      priority: 'LOW',
      priorityLevel: 'Watch',
      urgency: 'LOW',
      actionWindow: 'LATER',
      confidence: theme.confidence,
    }))
  const revisitNextEvent = [...input.actions, ...themeLearnings]
    .filter((action) => action.themeKey && isLaterAction(action) && !activeTaxonomyKeys.has(action.themeKey))
    .filter((action, index, actions) => actions.findIndex((candidate) => candidate.themeKey === action.themeKey) === index)
    .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))

  const openFollowUp = activeIssues.filter((issue) => (
    issue.status !== 'NEW' || Boolean(issue.ownerUserId) || (issue.noteCount ?? 0) > 0
  ))

  const confidenceKeys = new Set<string>()
  const confidence = { strong: 0, directional: 0, emerging: 0 }
  const addEvidenceTier = (key: string, tier: string) => {
    if (!key || confidenceKeys.has(key)) return
    confidenceKeys.add(key)
    if (tier === 'STRONG') confidence.strong += 1
    else if (tier === 'REPEATED' || tier === 'EMERGING') confidence.directional += 1
    else confidence.emerging += 1
  }
  // Issue tiers remain out of scope until issue evidence gets the same coverage
  // payload. Do not turn model confidence into a strong-evidence count.
  activeIssues.forEach((issue) => addEvidenceTier(issue.taxonomyKey || issue.id || issue.title, 'ISOLATED'))
  input.themes.forEach((theme) => addEvidenceTier(theme.themeKey || theme.label, evidenceTierForOverview(theme).evidenceTier))

  return {
    keep,
    improveNow,
    reviewThemes,
    revisitNextEvent,
    openFollowUp,
    confidence,
  }
}
