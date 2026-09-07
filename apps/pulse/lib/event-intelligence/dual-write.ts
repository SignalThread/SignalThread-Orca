import type { AnalysisResult } from '@/lib/analysis'
import { isEventsAccount } from '@/lib/account-product-mode'
import {
  classifyEventOperationsTaxonomy,
  deriveActionWindowForPriority,
  deriveEventPriorityLevel,
  getEventTaxonomyLabel,
  mapEventPriorityToLegacyUrgency,
  priorityLevelToActionPriority,
  type EventCommandCenterExtraction,
} from '@/lib/event-intelligence/contract'
import { writeEventIssueClusterEvidence } from '@/lib/event-intelligence/clustering'
import { resolveEffectiveResponseTarget } from '@/lib/effective-response-target'
import { prisma } from '@/lib/prisma'

type PrismaLike = typeof prisma

export interface EventIntelligenceDualWriteInput {
  answerId: string
  transcriptText: string
  analysis: AnalysisResult
  eventExtraction?: EventCommandCenterExtraction | null
  promptVersion: string
  model: string
}

interface NormalizedAction {
  title: string
  priority: string
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeSentimentLabel(value: string | undefined): string {
  const label = value?.trim().toUpperCase()
  return label || 'NEUTRAL'
}

function normalizeSentimentScore(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeActions(actions: AnalysisResult['actionItems']): NormalizedAction[] {
  if (!Array.isArray(actions)) return []

  return (actions as unknown[])
    .map((action) => {
      if (typeof action === 'string') {
        return { title: action.trim(), priority: 'Medium' }
      }
      if (!action || typeof action !== 'object') {
        return { title: '', priority: 'Medium' }
      }
      const record = action as Record<string, unknown>
      return {
        title: typeof record.text === 'string' ? record.text.trim() : '',
        priority: typeof record.priority === 'string' ? record.priority : 'Medium',
      }
    })
    .filter((action) => action.title.length > 0)
}

function dedupeByNormalizedValue(values: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ')
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    deduped.push(normalized)
  }

  return deduped
}

function mergeEventExtractionActions(
  actions: NormalizedAction[],
  extraction?: EventCommandCenterExtraction | null,
): NormalizedAction[] {
  const recommendedNextStep = extraction?.recommendedNextStep?.trim()
  if (!recommendedNextStep || !extraction) return actions

  return [
    {
      title: recommendedNextStep,
      priority: priorityLevelToActionPriority(extraction.priorityLevel),
    },
    ...actions.filter((action) => action.title.trim().toLowerCase() !== recommendedNextStep.toLowerCase()),
  ]
}

function buildEventEntities(extraction?: EventCommandCenterExtraction | null): Array<{ entityType: string; label: string; confidence: number | null }> {
  if (!extraction) return []

  const rows: Array<{ entityType: string; label: string; confidence: number | null }> = []
  const add = (entityType: string, labels: string[]) => {
    for (const label of labels) {
      const normalized = label.trim().replace(/\s+/g, ' ')
      if (!normalized) continue
      rows.push({
        entityType,
        label: normalized,
        confidence: extraction.confidence,
      })
    }
  }

  add('ENTITY', extraction.entities)
  add('SPONSOR', extraction.mentions.sponsors)
  add('EXHIBITOR', extraction.mentions.exhibitors)
  add('SESSION', extraction.mentions.sessions)
  add('LOCATION', extraction.mentions.locations)

  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.entityType}:${row.label.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function deriveConfidence(transcriptText: string, analysis: AnalysisResult): number {
  const transcriptConfidence = transcriptText.trim().length >= 20 ? 0.7 : 0.5
  const themeConfidence = Array.isArray(analysis.themes) && analysis.themes.length > 0 ? 0.1 : 0
  const actionConfidence = Array.isArray(analysis.actionItems) && analysis.actionItems.length > 0 ? 0.1 : 0
  return Math.min(0.9, transcriptConfidence + themeConfidence + actionConfidence)
}

function deriveEvidenceCount(transcriptText: string, themes: string[], actions: NormalizedAction[]): number {
  let count = 0
  if (transcriptText.trim().length >= 20) count += 1
  if (themes.length > 0) count += 1
  if (actions.length > 0) count += 1
  return count
}

/**
 * Dual-writes normalized event intelligence after the backward-compatible
 * AnswerAnalysis row is saved. This is an EVENTS-only product surface; retail,
 * hospitality, missing, and unknown account types intentionally no-op even when
 * their surveys are backed by Event records.
 */
export async function writeEventIntelligenceForAnalyzedAnswer(
  input: EventIntelligenceDualWriteInput,
  db: PrismaLike = prisma,
): Promise<{ wrote: boolean; intelligenceId?: string; reason?: string }> {
  const answer = await db.answer.findUnique({
    where: { id: input.answerId },
    select: {
      id: true,
      responseId: true,
      questionId: true,
      response: {
        select: {
          id: true,
          eventId: true,
          collectionPhase: true,
          surveyId: true,
          surveyTargetId: true,
          publicSurveyLinkId: true,
          surveyTarget: {
            select: { id: true, category: true, name: true, eventStructureItemId: true },
          },
          publicSurveyLink: {
            select: {
              surveyTarget: {
                select: { id: true, category: true, name: true, eventStructureItemId: true },
              },
            },
          },
          survey: {
            select: {
              surveyTarget: {
                select: { id: true, category: true, name: true, eventStructureItemId: true },
              },
            },
          },
          event: {
            select: {
              id: true,
              locationId: true,
              location: {
                select: {
                  id: true,
                  accountId: true,
                  account: {
                    select: {
                      id: true,
                      accountType: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!answer) {
    return { wrote: false, reason: 'answer_not_found' }
  }

  const response = answer.response
  const effectiveTarget = resolveEffectiveResponseTarget({
    publicSurveyLink: response.publicSurveyLink,
    responseTarget: response.surveyTarget,
    survey: response.survey,
  })
  const effectiveSurveyTargetId = effectiveTarget?.targetId ?? response.surveyTargetId ?? null
  const accountType = response.event.location.account.accountType
  const shouldWrite = isEventsAccount(accountType)

  if (!shouldWrite) {
    return { wrote: false, reason: 'not_event_intelligence_scope' }
  }

  if (input.analysis.evidenceState === 'INSUFFICIENT_EVIDENCE') {
    // Re-analysis must also remove any previously inferred intelligence. The
    // relation cascades clear themes, entities, and actions for this answer.
    await db.answerEventIntelligence.deleteMany({ where: { answerId: answer.id } })
    return { wrote: false, reason: 'insufficient_evidence' }
  }

  const actions = mergeEventExtractionActions(normalizeActions(input.analysis.actionItems), input.eventExtraction)
  const sentimentLabel = normalizeSentimentLabel(input.analysis.sentiment)
  const sentimentScore = normalizeSentimentScore(input.analysis.sentimentScore)
  const recommendedAction = actions[0]?.title ?? null
  const analysisThemes = Array.isArray(input.analysis.themes)
    ? input.analysis.themes.map((theme) => (typeof theme === 'string' ? theme.trim() : ''))
    : []
  const themes = dedupeByNormalizedValue([
    input.eventExtraction?.taxonomyLabel ?? (input.eventExtraction ? getEventTaxonomyLabel(input.eventExtraction.taxonomyKey) : ''),
    ...analysisThemes,
  ])
  const frictionCategory = input.eventExtraction?.taxonomyKey ?? classifyEventOperationsTaxonomy({
    themes,
    actions,
    transcriptText: input.transcriptText,
    sentimentScore,
  })
  const eventPriorityLevel = input.eventExtraction?.priorityLevel ?? deriveEventPriorityLevel({
    sentimentScore,
    actionPriority: actions[0]?.priority ?? null,
    evidenceCount: deriveEvidenceCount(input.transcriptText, themes, actions),
    frictionCategory,
    hasAction: Boolean(recommendedAction),
  })
  const urgency = mapEventPriorityToLegacyUrgency(eventPriorityLevel)
  const actionWindow = input.eventExtraction?.actionWindow ?? deriveActionWindowForPriority(eventPriorityLevel, Boolean(recommendedAction))
  const confidence = input.eventExtraction?.confidence ?? deriveConfidence(input.transcriptText, input.analysis)
  const entities = buildEventEntities(input.eventExtraction)
  const accountId = response.event.location.accountId
  const locationId = response.event.locationId

  const result = await db.$transaction(async (tx) => {
    const intelligence = await tx.answerEventIntelligence.upsert({
      where: { answerId: answer.id },
      create: {
        accountId,
        locationId,
        eventId: response.eventId,
        surveyId: response.surveyId,
        surveyTargetId: effectiveSurveyTargetId,
        responseId: response.id,
        answerId: answer.id,
        questionId: answer.questionId,
        sentimentLabel,
        sentimentScore,
        urgency,
        frictionCategory,
        actionWindow,
        recommendedAction,
        confidence,
        promptVersion: input.promptVersion,
        model: input.model,
      },
      update: {
        accountId,
        locationId,
        eventId: response.eventId,
        surveyId: response.surveyId,
        surveyTargetId: effectiveSurveyTargetId,
        responseId: response.id,
        questionId: answer.questionId,
        sentimentLabel,
        sentimentScore,
        urgency,
        frictionCategory,
        actionWindow,
        recommendedAction,
        confidence,
        promptVersion: input.promptVersion,
        model: input.model,
      },
    })

    await Promise.all([
      tx.answerEventTheme.deleteMany({ where: { intelligenceId: intelligence.id } }),
      tx.answerEventEntity.deleteMany({ where: { intelligenceId: intelligence.id } }),
      tx.answerEventAction.deleteMany({ where: { intelligenceId: intelligence.id } }),
    ])

    if (themes.length > 0) {
      await tx.answerEventTheme.createMany({
        data: themes.map((theme) => ({
          intelligenceId: intelligence.id,
          eventId: response.eventId,
          surveyId: response.surveyId,
          surveyTargetId: effectiveSurveyTargetId,
          answerId: answer.id,
          themeKey: normalizeKey(theme) || 'theme',
          label: theme,
          sentimentLabel,
          confidence,
        })),
      })
    }

    if (entities.length > 0) {
      await tx.answerEventEntity.createMany({
        data: entities.map((entity) => ({
          intelligenceId: intelligence.id,
          eventId: response.eventId,
          surveyId: response.surveyId,
          surveyTargetId: effectiveSurveyTargetId,
          answerId: answer.id,
          entityType: entity.entityType,
          label: entity.label,
          confidence: entity.confidence,
        })),
      })
    }

    if (recommendedAction) {
      await tx.answerEventAction.createMany({
        data: actions.map((action) => ({
          intelligenceId: intelligence.id,
          eventId: response.eventId,
          surveyId: response.surveyId,
          surveyTargetId: effectiveSurveyTargetId,
          answerId: answer.id,
          title: action.title,
          priority: action.priority.toUpperCase(),
          urgency,
          actionWindow,
          status: 'OPEN',
          confidence,
        })),
      })
    }

    await writeEventIssueClusterEvidence(tx as never, {
      accountId,
      locationId,
      eventId: response.eventId,
      surveyId: response.surveyId,
      surveyTargetId: effectiveSurveyTargetId,
      responseId: response.id,
      collectionPhase: response.collectionPhase,
      answerId: answer.id,
      questionId: answer.questionId,
      taxonomyKey: frictionCategory,
      recommendedAction,
      transcriptText: input.transcriptText,
      representativeSnippet: input.eventExtraction?.representativeSnippet,
      sentimentScore,
      priorityLevel: eventPriorityLevel,
      legacyUrgency: urgency,
      confidence,
    })

    return intelligence
  })

  return { wrote: true, intelligenceId: result.id }
}
