import { CollectionPhase, EventStatus, Prisma, SurveyTargetCategory, type PrismaClient } from '@prisma/client'
import { getEventTemplate } from './event-templates'
import { createEventVoiceSurveyInTransaction } from './event-voice-surveys'
import { prisma } from './prisma'

export interface EventTemplateSurveySelection {
  key: string
  surveyName?: string
  collectionPhase: CollectionPhase
}

export interface EventTemplateExpansionResult {
  created: Array<{ key: string; surveyId: string; surveyName: string }>
  skipped: Array<{ key: string; reason: string }>
  failed: Array<{ key: string; reason: string }>
}

interface TemplateRecommendationProvenance {
  templateKey: string
  recommendationKey: string
}

export async function expandEventTemplateSurveys(
  input: {
    eventId: string
    templateKey: string
    selections: EventTemplateSurveySelection[]
  },
  db: PrismaClient = prisma,
): Promise<EventTemplateExpansionResult> {
  const template = getEventTemplate(input.templateKey)
  if (!template) throw new Error('Invalid event template')
  if (template.key === 'blank' && input.selections.length > 0) {
    throw new Error('Blank Event does not include recommended surveys')
  }

  const event = await db.event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      templateKey: true,
      location: {
        select: {
          account: { select: { accountType: true } },
        },
      },
      structureItems: {
        where: { isActive: true },
        select: { id: true, kind: true, name: true },
      },
      surveys: {
        select: { settingsJson: true },
      },
    },
  })

  if (!event) throw new Error('Event not found')
  if (event.location.account.accountType !== 'EVENTS') {
    throw new Error('Template survey recommendations are only available for EVENTS accounts')
  }
  if (event.templateKey !== template.key) {
    throw new Error('Event template does not match the requested expansion')
  }

  const existingRecommendationKeys = new Set(
    event.surveys.flatMap((survey) => {
      const provenance = readTemplateRecommendationProvenance(survey.settingsJson)
      return provenance?.templateKey === template.key ? [provenance.recommendationKey] : []
    }),
  )
  const recommendationByKey = new Map(
    template.recommendedSurveys.map((recommendation) => [recommendation.key, recommendation]),
  )
  const selectedKeys = new Set<string>()
  const result: EventTemplateExpansionResult = { created: [], skipped: [], failed: [] }

  for (const selection of input.selections) {
    const key = typeof selection?.key === 'string' ? selection.key.trim() : ''
    if (!key) {
      result.failed.push({ key: '(missing)', reason: 'Recommendation key is required' })
      continue
    }
    if (selectedKeys.has(key)) {
      result.skipped.push({ key, reason: 'Duplicate selection in this request' })
      continue
    }
    selectedKeys.add(key)

    const recommendation = recommendationByKey.get(key)
    if (!recommendation) {
      result.failed.push({ key, reason: 'Recommendation is not part of this template' })
      continue
    }
    if (!Object.values(CollectionPhase).includes(selection.collectionPhase)) {
      result.failed.push({ key, reason: 'Collection phase is required' })
      continue
    }
    if (existingRecommendationKeys.has(key)) {
      result.skipped.push({ key, reason: 'Recommended survey already exists' })
      continue
    }

    const surveyName = normalizeSurveyName(selection.surveyName, recommendation.name)
    if (!surveyName) {
      result.failed.push({ key, reason: 'Survey name is required' })
      continue
    }

    const structureItem = recommendation.eventStructureItem
      ? event.structureItems.find(
          (item) => item.name === recommendation.eventStructureItem?.name
            && item.kind === recommendation.eventStructureItem.kind,
        )
      : null

    if (recommendation.eventStructureItem && !structureItem) {
      result.failed.push({ key, reason: `Event Area "${recommendation.eventStructureItem.name}" is unavailable` })
      continue
    }

    try {
      const created = await db.$transaction(async (tx) => {
        const surveyResult = await createEventVoiceSurveyInTransaction({
          eventId: event.id,
          collectionPhase: selection.collectionPhase,
          eventStructureItemId: structureItem?.id ?? null,
          targetCategory: structureItem
            ? undefined
            : recommendation.target.category as SurveyTargetCategory,
          targetName: structureItem ? undefined : recommendation.target.name,
          surveyName,
          surveyDescription: recommendation.description,
          surveyStatus: EventStatus.DRAFT,
          questions: recommendation.questions.map((question, index) => ({
            prompt: question.prompt,
            type: question.type,
            required: question.required,
            order: index,
          })),
        }, tx)

        const settingsJson = mergeTemplateRecommendationProvenance(
          surveyResult.survey.settingsJson,
          { templateKey: template.key, recommendationKey: key },
        )
        const survey = await tx.survey.update({
          where: { id: surveyResult.survey.id },
          data: { settingsJson },
          select: { id: true, name: true },
        })

        return survey
      })

      existingRecommendationKeys.add(key)
      result.created.push({ key, surveyId: created.id, surveyName: created.name })
    } catch (error) {
      result.failed.push({
        key,
        reason: error instanceof Error ? error.message : 'Failed to create recommended survey',
      })
    }
  }

  return result
}

function normalizeSurveyName(value: unknown, fallback: string): string {
  if (value === undefined) return fallback
  return typeof value === 'string' ? value.trim() : ''
}

function readTemplateRecommendationProvenance(
  settingsJson: Prisma.JsonValue | null,
): TemplateRecommendationProvenance | null {
  if (!settingsJson || Array.isArray(settingsJson) || typeof settingsJson !== 'object') return null
  const provenance = settingsJson.templateRecommendation
  if (!provenance || Array.isArray(provenance) || typeof provenance !== 'object') return null
  if (typeof provenance.templateKey !== 'string' || typeof provenance.recommendationKey !== 'string') return null
  return {
    templateKey: provenance.templateKey,
    recommendationKey: provenance.recommendationKey,
  }
}

function mergeTemplateRecommendationProvenance(
  settingsJson: Prisma.JsonValue | null,
  provenance: TemplateRecommendationProvenance,
): Prisma.InputJsonObject {
  const existing = settingsJson && !Array.isArray(settingsJson) && typeof settingsJson === 'object'
    ? settingsJson
    : {}

  return {
    ...existing,
    templateRecommendation: {
      templateKey: provenance.templateKey,
      recommendationKey: provenance.recommendationKey,
    },
  }
}
