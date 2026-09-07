import { QuestionType } from '@prisma/client'

export const STRUCTURED_SIGNAL_WINDOW_MINUTES = 30

export const STRUCTURED_SIGNAL_RULES = {
  minimumCandidateResponses: 3,
  strongSignalResponses: 10,
  strongWindowResponses: 5,
  consistentShare: 0.6,
  ratingLowAverage: 2.5,
  recommendationLowAverage: 5,
  ratingDecline: 1,
  recommendationDecline: 2,
  negativeVoiceScore: -0.25,
  repeatedThemeResponses: 3,
  agreementVoiceResponses: 2,
  crossAreaResponses: 4,
  crossAreaCount: 2,
} as const

export type SampleStrengthLevel = 'STRONG' | 'DIRECTIONAL' | 'LIMITED'
export type StructuredSignalRuleType =
  | 'LOW_SCORE'
  | 'MEANINGFUL_DECLINE'
  | 'REPEATED_NEGATIVE_THEME'
  | 'STRUCTURED_VOICE_AGREEMENT'
  | 'CROSS_AREA_ISSUE'

export interface SampleStrength {
  level: SampleStrengthLevel
  label: 'Strong signal' | 'Directional signal' | 'Limited evidence'
  reason: string
}

export interface StructuredAnswerRow {
  answerId: string
  responseId: string
  completedAt: Date
  numericValue: number
  questionId: string
  questionType: QuestionType
  questionLabel: string
  surveyId: string | null
  surveyName: string | null
  surveyTargetId: string | null
  surveyTargetName: string | null
  eventStructureItemId: string | null
  eventStructureItemName: string | null
}

export interface VoiceSignalRow {
  answerId: string
  responseId: string
  createdAt: Date
  surveyId: string | null
  surveyTargetId: string | null
  eventStructureItemId: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
  themes: Array<{ themeKey: string; label: string }>
}

export interface StructuredMetric {
  key: string
  questionId: string
  questionType: Exclude<QuestionType, 'VOICE'>
  questionLabel: string
  surveyId: string | null
  surveyName: string | null
  surveyTargetId: string | null
  surveyTargetName: string | null
  eventStructureItemId: string | null
  eventStructureItemName: string | null
  count: number
  average: number | null
  distribution: Record<string, number>
  recent: { count: number; average: number | null }
  preceding: { count: number; average: number | null }
  change: number | null
  direction: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'NO_COMPARISON'
  sampleStrength: SampleStrength
  answerIds: string[]
}

export interface MixedSignalCandidate {
  key: string
  ruleType: StructuredSignalRuleType
  severity: 'IMMEDIATE' | 'SOON' | 'WATCH'
  title: string
  summary: string
  surveyId: string | null
  surveyTargetId: string | null
  eventStructureItemId: string | null
  questionId: string | null
  taxonomyKey: string | null
  metric: StructuredMetric | null
  window: { start: string; end: string; precedingStart: string }
  supportingResponseCount: number
  sampleStrength: SampleStrength
  structuredAnswerIds: string[]
  voiceAnswerIds: string[]
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function average(rows: StructuredAnswerRow[]) {
  if (rows.length === 0) return null
  return round(rows.reduce((sum, row) => sum + row.numericValue, 0) / rows.length)
}

function distribution(rows: StructuredAnswerRow[], type: StructuredAnswerRow['questionType']) {
  const min = type === QuestionType.RATING_1_TO_5 || type === QuestionType.SPEAKER_FEEDBACK ? 1 : 0
  const max = type === QuestionType.RATING_1_TO_5 || type === QuestionType.SPEAKER_FEEDBACK
    ? 5
    : type === QuestionType.YES_NO
      ? 1
      : 10
  const result: Record<string, number> = {}
  for (let value = min; value <= max; value += 1) result[String(value)] = 0
  for (const row of rows) result[String(row.numericValue)] = (result[String(row.numericValue)] ?? 0) + 1
  return result
}

function comparisonDirection(change: number | null) {
  if (change === null) return 'NO_COMPARISON' as const
  if (change > 0) return 'IMPROVING' as const
  if (change < 0) return 'DECLINING' as const
  return 'STABLE' as const
}

export function getSampleStrength(input: {
  count: number
  distribution?: Record<string, number>
  recentCount?: number
  precedingCount?: number
  additionalVoiceResponseCount?: number
}): SampleStrength {
  const { count } = input
  if (count < STRUCTURED_SIGNAL_RULES.minimumCandidateResponses) {
    const combinedResponses = count + (input.additionalVoiceResponseCount ?? 0)
    if (combinedResponses >= STRUCTURED_SIGNAL_RULES.minimumCandidateResponses) {
      return {
        level: 'DIRECTIONAL',
        label: 'Directional signal',
        reason: `${count} structured responses with related voice evidence across at least ${combinedResponses} response signals.`,
      }
    }
    return {
      level: 'LIMITED',
      label: 'Limited evidence',
      reason: `${count} completed structured response${count === 1 ? '' : 's'}; at least 3 are needed for a directional signal.`,
    }
  }

  const values = Object.values(input.distribution ?? {})
  const largestBucket = values.length > 0 ? Math.max(...values) : 0
  const consistent = count > 0 && largestBucket / count >= STRUCTURED_SIGNAL_RULES.consistentShare
  const comparableWindows =
    (input.recentCount ?? 0) >= STRUCTURED_SIGNAL_RULES.strongWindowResponses &&
    (input.precedingCount ?? 0) >= STRUCTURED_SIGNAL_RULES.strongWindowResponses

  if (count >= STRUCTURED_SIGNAL_RULES.strongSignalResponses && (consistent || comparableWindows)) {
    return {
      level: 'STRONG',
      label: 'Strong signal',
      reason: comparableWindows
        ? `${count} completed responses with at least 5 in both comparison windows.`
        : `${count} completed responses with at least 60% concentrated on one value.`,
    }
  }

  return {
    level: 'DIRECTIONAL',
    label: 'Directional signal',
    reason: `${count} completed responses show a useful product heuristic, not a statistically conclusive result.`,
  }
}

function metricKey(row: StructuredAnswerRow) {
  return [row.questionId, row.surveyTargetId ?? 'event'].join(':')
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function candidateWindow(now: Date) {
  const end = now
  const start = new Date(end.getTime() - STRUCTURED_SIGNAL_WINDOW_MINUTES * 60_000)
  const precedingStart = new Date(start.getTime() - STRUCTURED_SIGNAL_WINDOW_MINUTES * 60_000)
  return { start, end, precedingStart }
}

function recentVoiceRows(rows: VoiceSignalRow[], start: Date, end: Date) {
  return rows.filter((row) => row.createdAt >= start && row.createdAt <= end)
}

function isNegativeVoice(row: VoiceSignalRow) {
  return row.sentimentLabel?.toUpperCase() === 'NEGATIVE' ||
    (typeof row.sentimentScore === 'number' && row.sentimentScore <= STRUCTURED_SIGNAL_RULES.negativeVoiceScore)
}

export function buildStructuredMetrics(rows: StructuredAnswerRow[], now = new Date()): StructuredMetric[] {
  const window = candidateWindow(now)
  const groups = new Map<string, StructuredAnswerRow[]>()
  for (const row of rows) groups.set(metricKey(row), [...(groups.get(metricKey(row)) ?? []), row])

  return [...groups.values()].map((group) => {
    const first = group[0]
    const recent = group.filter((row) => row.completedAt >= window.start && row.completedAt <= window.end)
    const preceding = group.filter((row) => row.completedAt >= window.precedingStart && row.completedAt < window.start)
    const recentAverage = average(recent)
    const precedingAverage = average(preceding)
    const change = recentAverage !== null && precedingAverage !== null ? round(recentAverage - precedingAverage) : null
    const valueDistribution = distribution(group, first.questionType)

    return {
      key: metricKey(first),
      questionId: first.questionId,
      questionType: first.questionType as StructuredMetric['questionType'],
      questionLabel: first.questionLabel,
      surveyId: first.surveyId,
      surveyName: first.surveyName,
      surveyTargetId: first.surveyTargetId,
      surveyTargetName: first.surveyTargetName,
      eventStructureItemId: first.eventStructureItemId,
      eventStructureItemName: first.eventStructureItemName,
      count: group.length,
      average: average(group),
      distribution: valueDistribution,
      recent: { count: recent.length, average: recentAverage },
      preceding: { count: preceding.length, average: precedingAverage },
      change,
      direction: comparisonDirection(change),
      sampleStrength: getSampleStrength({
        count: group.length,
        distribution: valueDistribution,
        recentCount: recent.length,
        precedingCount: preceding.length,
      }),
      answerIds: group.map((row) => row.answerId),
    }
  }).sort((a, b) => a.questionLabel.localeCompare(b.questionLabel) || a.key.localeCompare(b.key))
}

function severityForLowScore(metric: StructuredMetric) {
  const immediateThreshold = metric.questionType === QuestionType.RATING_1_TO_5 ? 2 : 3
  return metric.recent.count >= 5 && (metric.recent.average ?? Infinity) <= immediateThreshold
    ? 'IMMEDIATE' as const
    : metric.sampleStrength.level === 'LIMITED' ? 'WATCH' as const : 'SOON' as const
}

function candidateBase(eventId: string, ruleType: StructuredSignalRuleType, scope: string) {
  return `${eventId}:${ruleType.toLowerCase()}:${scope}`
}

export function buildMixedSignalCandidates(input: {
  eventId: string
  metrics: StructuredMetric[]
  structuredRows: StructuredAnswerRow[]
  voiceRows: VoiceSignalRow[]
  now?: Date
}): MixedSignalCandidate[] {
  const now = input.now ?? new Date()
  const window = candidateWindow(now)
  const windowPayload = {
    start: window.start.toISOString(),
    end: window.end.toISOString(),
    precedingStart: window.precedingStart.toISOString(),
  }
  const recentVoice = recentVoiceRows(input.voiceRows, window.start, window.end).filter(isNegativeVoice)
  const candidates: MixedSignalCandidate[] = []

  for (const metric of input.metrics) {
    if (metric.questionType !== QuestionType.RATING_1_TO_5 && metric.questionType !== QuestionType.RECOMMENDATION_0_TO_10) continue
    if (metric.recent.count < STRUCTURED_SIGNAL_RULES.minimumCandidateResponses || metric.recent.average === null) continue
    const lowThreshold = metric.questionType === QuestionType.RATING_1_TO_5
      ? STRUCTURED_SIGNAL_RULES.ratingLowAverage
      : STRUCTURED_SIGNAL_RULES.recommendationLowAverage
    const declineThreshold = metric.questionType === QuestionType.RATING_1_TO_5
      ? STRUCTURED_SIGNAL_RULES.ratingDecline
      : STRUCTURED_SIGNAL_RULES.recommendationDecline
    const recentStructured = input.structuredRows.filter((row) =>
      metricKey(row) === metric.key && row.completedAt >= window.start && row.completedAt <= window.end)
    const scope = `${metric.questionId}:${metric.surveyTargetId ?? 'event'}`
    const relatedVoice = recentVoice.filter((row) =>
      row.surveyId === metric.surveyId && row.surveyTargetId === metric.surveyTargetId)
    const relatedVoiceResponses = unique(relatedVoice.map((row) => row.responseId))
    const recentResponseIds = unique(recentStructured.map((row) => row.responseId))
    const sampleStrength = getSampleStrength({
      count: metric.recent.count,
      distribution: distribution(recentStructured, metric.questionType),
      recentCount: metric.recent.count,
      precedingCount: metric.preceding.count,
      additionalVoiceResponseCount: relatedVoiceResponses.filter((responseId) => !recentResponseIds.includes(responseId)).length,
    })

    const low = metric.recent.average <= lowThreshold
    const declining = metric.change !== null && metric.preceding.count >= 3 && metric.change <= -declineThreshold
    if (low) {
      candidates.push({
        key: candidateBase(input.eventId, 'LOW_SCORE', scope),
        ruleType: 'LOW_SCORE',
        severity: severityForLowScore(metric),
        title: `Low score for ${metric.questionLabel}`,
        summary: `Recent average is ${metric.recent.average} from ${metric.recent.count} completed responses.`,
        surveyId: metric.surveyId,
        surveyTargetId: metric.surveyTargetId,
        eventStructureItemId: metric.eventStructureItemId,
        questionId: metric.questionId,
        taxonomyKey: null,
        metric,
        window: windowPayload,
        supportingResponseCount: recentResponseIds.length,
        sampleStrength,
        structuredAnswerIds: recentStructured.map((row) => row.answerId),
        voiceAnswerIds: [],
      })
    }
    if (declining) {
      candidates.push({
        key: candidateBase(input.eventId, 'MEANINGFUL_DECLINE', scope),
        ruleType: 'MEANINGFUL_DECLINE',
        severity: sampleStrength.level === 'STRONG' ? 'SOON' : 'WATCH',
        title: `${metric.questionLabel} is declining`,
        summary: `Recent average moved from ${metric.preceding.average} to ${metric.recent.average}.`,
        surveyId: metric.surveyId,
        surveyTargetId: metric.surveyTargetId,
        eventStructureItemId: metric.eventStructureItemId,
        questionId: metric.questionId,
        taxonomyKey: null,
        metric,
        window: windowPayload,
        supportingResponseCount: recentResponseIds.length + metric.preceding.count,
        sampleStrength,
        structuredAnswerIds: metric.answerIds,
        voiceAnswerIds: [],
      })
    }
    if ((low || declining) && relatedVoiceResponses.length >= STRUCTURED_SIGNAL_RULES.agreementVoiceResponses) {
      candidates.push({
        key: candidateBase(input.eventId, 'STRUCTURED_VOICE_AGREEMENT', scope),
        ruleType: 'STRUCTURED_VOICE_AGREEMENT',
        severity: severityForLowScore(metric),
        title: `Scores and attendee voice align for ${metric.questionLabel}`,
        summary: `${metric.recent.count} recent scores are accompanied by ${relatedVoiceResponses.length} related negative voice responses from the same survey target.`,
        surveyId: metric.surveyId,
        surveyTargetId: metric.surveyTargetId,
        eventStructureItemId: metric.eventStructureItemId,
        questionId: metric.questionId,
        taxonomyKey: null,
        metric,
        window: windowPayload,
        supportingResponseCount: unique([...recentResponseIds, ...relatedVoiceResponses]).length,
        sampleStrength,
        structuredAnswerIds: recentStructured.map((row) => row.answerId),
        voiceAnswerIds: relatedVoice.map((row) => row.answerId),
      })
    }
  }

  const themeGroups = new Map<string, Array<VoiceSignalRow & { themeKey: string; themeLabel: string }>>()
  for (const row of recentVoice) {
    for (const theme of row.themes) {
      const scopedKey = `${theme.themeKey}:${row.surveyTargetId ?? 'event'}`
      themeGroups.set(scopedKey, [...(themeGroups.get(scopedKey) ?? []), { ...row, themeKey: theme.themeKey, themeLabel: theme.label }])
    }
  }
  for (const rows of themeGroups.values()) {
    const first = rows[0]
    const responseIds = unique(rows.map((row) => row.responseId))
    if (responseIds.length < STRUCTURED_SIGNAL_RULES.repeatedThemeResponses) continue
    const strength = getSampleStrength({ count: responseIds.length })
    candidates.push({
      key: candidateBase(input.eventId, 'REPEATED_NEGATIVE_THEME', `${first.themeKey}:${first.surveyTargetId ?? 'event'}`),
      ruleType: 'REPEATED_NEGATIVE_THEME',
      severity: strength.level === 'STRONG' ? 'SOON' : 'WATCH',
      title: `Repeated negative feedback: ${first.themeLabel}`,
      summary: `${responseIds.length} recent voice responses share this negative theme.`,
      surveyId: first.surveyId,
      surveyTargetId: first.surveyTargetId,
      eventStructureItemId: first.eventStructureItemId,
      questionId: null,
      taxonomyKey: first.themeKey,
      metric: null,
      window: windowPayload,
      supportingResponseCount: responseIds.length,
      sampleStrength: strength,
      structuredAnswerIds: [],
      voiceAnswerIds: unique(rows.map((row) => row.answerId)),
    })
  }

  const crossAreaThemes = new Map<string, VoiceSignalRow[]>()
  for (const row of recentVoice) {
    if (!row.eventStructureItemId) continue
    for (const theme of row.themes) {
      crossAreaThemes.set(theme.themeKey, [...(crossAreaThemes.get(theme.themeKey) ?? []), row])
    }
  }
  for (const [themeKey, rows] of crossAreaThemes) {
    const responseIds = unique(rows.map((row) => row.responseId))
    const areaIds = unique(rows.map((row) => row.eventStructureItemId).filter((id): id is string => Boolean(id)))
    if (responseIds.length < STRUCTURED_SIGNAL_RULES.crossAreaResponses || areaIds.length < STRUCTURED_SIGNAL_RULES.crossAreaCount) continue
    const themeLabel = rows.flatMap((row) => row.themes).find((theme) => theme.themeKey === themeKey)?.label ?? themeKey
    const strength = getSampleStrength({ count: responseIds.length })
    candidates.push({
      key: candidateBase(input.eventId, 'CROSS_AREA_ISSUE', themeKey),
      ruleType: 'CROSS_AREA_ISSUE',
      severity: strength.level === 'STRONG' ? 'SOON' : 'WATCH',
      title: `${themeLabel} appears across multiple Event Areas`,
      summary: `${responseIds.length} negative voice responses span ${areaIds.length} Event Areas.`,
      surveyId: null,
      surveyTargetId: null,
      eventStructureItemId: null,
      questionId: null,
      taxonomyKey: themeKey,
      metric: null,
      window: windowPayload,
      supportingResponseCount: responseIds.length,
      sampleStrength: strength,
      structuredAnswerIds: [],
      voiceAnswerIds: unique(rows.map((row) => row.answerId)),
    })
  }

  const rank = { IMMEDIATE: 0, SOON: 1, WATCH: 2 }
  return candidates.sort((a, b) => rank[a.severity] - rank[b.severity] || a.key.localeCompare(b.key))
}
