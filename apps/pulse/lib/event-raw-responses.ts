import { EventStructureItemKind, QuestionType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildEffectiveResponseTargetWhere, resolveEffectiveResponseTarget } from '@/lib/effective-response-target'
import { buildEffectiveResponseStructureWhere } from '@/lib/event-dashboard-filters'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

type PrismaLike = typeof prisma

const RAW_RESPONSE_TARGET_SELECT = {
  id: true,
  name: true,
  category: true,
  eventStructureItemId: true,
  eventStructureItem: { select: { id: true, name: true, kind: true } },
  speakerAssignment: { select: { speaker: { select: { id: true, name: true } } } },
} as const

export interface EventRawResponsesInput {
  accountId: string
  eventId: string
  surveyId?: string | null
  search?: string | null
  surveyTargetId?: string | null
  eventStructureItemId?: string | null
  structureKind?: EventStructureItemKind | string | null
  questionId?: string | null
  sentiment?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  page?: number
  pageSize?: number
  lifecyclePhase?: ResolvedEventLifecyclePhase
}

export class EventRawResponsesError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'EventRawResponsesError'
  }
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function dateBoundary(value: string | null | undefined, endOfDay: boolean) {
  const text = optionalText(value)
  if (!text) return null
  const date = new Date(`${text}${text.length === 10 ? endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z' : ''}`)
  if (Number.isNaN(date.getTime())) throw new EventRawResponsesError('Invalid date filter', 400)
  return date
}

function normalizedPage(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value!)) : 1
}

function normalizedPageSize(value: number | undefined) {
  return Number.isFinite(value) ? Math.min(50, Math.max(1, Math.floor(value!))) : 25
}

function answerWhere(input: EventRawResponsesInput) {
  const search = optionalText(input.search)
  const surveyTargetId = optionalText(input.surveyTargetId)
  const surveyId = optionalText(input.surveyId)
  const eventStructureItemId = optionalText(input.eventStructureItemId)
  const structureKind = optionalText(input.structureKind)
  const questionId = optionalText(input.questionId)
  const sentiment = optionalText(input.sentiment)?.toUpperCase() ?? null
  const dateFrom = dateBoundary(input.dateFrom, false)
  const dateTo = dateBoundary(input.dateTo, true)

  if (sentiment && !['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'].includes(sentiment)) {
    throw new EventRawResponsesError('Invalid sentiment filter', 400)
  }
  if (structureKind && !(Object.values(EventStructureItemKind) as string[]).includes(structureKind)) {
    throw new EventRawResponsesError('Invalid listening-point type filter', 400)
  }

  const effectiveTargetFilters = [
    ...(surveyTargetId ? [buildEffectiveResponseTargetWhere({ id: surveyTargetId })] : []),
    ...(eventStructureItemId || structureKind
      ? [buildEffectiveResponseStructureWhere({
          ...(eventStructureItemId ? { eventStructureItemId } : {}),
          ...(structureKind ? { structureKind: structureKind as EventStructureItemKind } : {}),
        })]
      : []),
  ]

  return {
    status: 'COMPLETED' as const,
    AND: [
      { OR: [
        { answerTranscript: { is: { text: { not: '' } } } },
        { numericValue: { not: null } },
      ] },
      ...(search ? [{ OR: [
        { promptLabel: { contains: search, mode: 'insensitive' as const } },
        { answerTranscript: { is: { text: { contains: search, mode: 'insensitive' as const } } } },
        { answerAnalysis: { is: { summary: { contains: search, mode: 'insensitive' as const } } } },
        { answerEventThemes: { some: { label: { contains: search, mode: 'insensitive' as const } } } },
      ] }] : []),
    ],
    response: {
      eventId: input.eventId,
      ...(surveyId ? { surveyId } : {}),
      status: 'COMPLETED' as const,
      ...responseCollectionPhaseWhere(input.lifecyclePhase),
      event: { location: { accountId: input.accountId } },
      ...(effectiveTargetFilters.length ? { AND: effectiveTargetFilters } : {}),
    },
    ...(questionId ? { questionId } : {}),
    ...(sentiment ? { answerAnalysis: { is: { sentimentLabel: sentiment } } } : {}),
    ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
  }
}

function excerpt(value: string, maximum = 190) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1).trim()}…` : normalized
}

function configuredOptions(configurationJson: unknown) {
  if (!configurationJson || typeof configurationJson !== 'object' || Array.isArray(configurationJson)) return []
  const options = (configurationJson as { options?: unknown }).options
  return Array.isArray(options) ? options.filter((option): option is string => typeof option === 'string') : []
}

export function formatStructuredAnswer(input: {
  questionType?: QuestionType | null
  numericValue?: number | null
  configurationJson?: unknown
  speakerName?: string | null
}) {
  if (input.numericValue == null) return null
  if (input.questionType === QuestionType.YES_NO) return input.numericValue === 1 ? 'Yes' : 'No'
  if (input.questionType === QuestionType.RATING_1_TO_5) return `${input.numericValue} / 5`
  if (input.questionType === QuestionType.RECOMMENDATION_0_TO_10) return `${input.numericValue} / 10`
  if (input.questionType === QuestionType.SPEAKER_FEEDBACK) {
    return `${input.numericValue} / 5${input.speakerName ? ` for ${input.speakerName}` : ''}`
  }
  if (input.questionType === QuestionType.SINGLE_CHOICE) {
    return configuredOptions(input.configurationJson)[input.numericValue] ?? `Choice ${input.numericValue + 1}`
  }
  return String(input.numericValue)
}

export async function listEventRawResponses(input: EventRawResponsesInput, db: PrismaLike = prisma) {
  const page = normalizedPage(input.page)
  const pageSize = normalizedPageSize(input.pageSize)
  const where = answerWhere(input)
  const [total, answers, surveyTargets, questions] = await Promise.all([
    db.answer.count({ where }),
    db.answer.findMany({
      where,
      select: {
        id: true,
        responseId: true,
        questionId: true,
        promptLabel: true,
        numericValue: true,
        speakerId: true,
        createdAt: true,
        response: {
          select: {
            startedAt: true,
            completedAt: true,
            surveyTarget: { select: RAW_RESPONSE_TARGET_SELECT },
            publicSurveyLink: { select: { surveyTarget: { select: RAW_RESPONSE_TARGET_SELECT } } },
            survey: { select: { surveyTarget: { select: RAW_RESPONSE_TARGET_SELECT } } },
          },
        },
        question: { select: { id: true, label: true, type: true, configurationJson: true } },
        answerTranscript: { select: { text: true } },
        answerAnalysis: { select: { summary: true, sentimentLabel: true } },
        answerEventThemes: { select: { themeKey: true, label: true }, take: 3 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.surveyTarget.findMany({
      where: { eventId: input.eventId, event: { location: { accountId: input.accountId } } },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
    db.question.findMany({
      where: { eventId: input.eventId }, select: { id: true, label: true, order: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }],
    }),
  ])
  const speakerIds = [...new Set(answers.map((answer) => answer.speakerId).filter((id): id is string => Boolean(id)))]
  const speakers = speakerIds.length === 0 ? [] : await db.eventSpeakerProfile.findMany({
    where: { accountId: input.accountId, id: { in: speakerIds }, sessionAssignments: { some: { eventId: input.eventId } } },
    select: { id: true, name: true },
  })
  const speakerById = new Map(speakers.map((speaker) => [speaker.id, speaker]))

  return {
    items: answers.map((answer) => {
      const effectiveTarget = resolveEffectiveResponseTarget({
        publicSurveyLink: answer.response.publicSurveyLink,
        responseTarget: answer.response.surveyTarget,
        survey: answer.response.survey,
      })
      const target = effectiveTarget?.target ?? null
      const speaker = answer.speakerId ? speakerById.get(answer.speakerId) ?? null : null
      const structuredValue = formatStructuredAnswer({
        questionType: answer.question?.type,
        numericValue: answer.numericValue,
        configurationJson: answer.question?.configurationJson,
        speakerName: speaker?.name,
      })
      return {
        id: answer.id,
        responseId: answer.responseId,
        createdAt: answer.createdAt.toISOString(),
        source: target ? {
          id: target.id,
          name: target.name,
          category: target.category,
          session: target.eventStructureItem,
          speaker: target.speakerAssignment?.speaker ?? null,
        } : null,
        question: { id: answer.question?.id ?? answer.questionId, label: answer.question?.label ?? answer.promptLabel, type: answer.question?.type ?? null },
        answerType: structuredValue === null ? 'TEXT' as const : 'STRUCTURED' as const,
        answerDisplay: structuredValue ?? excerpt(answer.answerTranscript?.text ?? ''),
        numericValue: answer.numericValue,
        speaker,
        transcriptExcerpt: excerpt(answer.answerTranscript?.text ?? ''),
        sentiment: answer.answerAnalysis?.sentimentLabel ?? null,
        themes: answer.answerEventThemes,
      }
    }),
    filters: { surveyTargets, questions },
    pagination: {
      page, pageSize, total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      from: total === 0 ? 0 : (page - 1) * pageSize + 1,
      to: Math.min(page * pageSize, total),
    },
  }
}

export async function getEventRawResponseDetail(input: { accountId: string; eventId: string; answerId: string }, db: PrismaLike = prisma) {
  const answerId = optionalText(input.answerId)
  if (!answerId) throw new EventRawResponsesError('Answer ID required', 400)
  const answer = await db.answer.findFirst({
    where: {
      id: answerId,
      response: { eventId: input.eventId, event: { location: { accountId: input.accountId } } },
    },
    select: {
      id: true, responseId: true, questionId: true, promptLabel: true, createdAt: true, durationMs: true, mimeType: true, objectKey: true, numericValue: true, speakerId: true,
      question: { select: { id: true, label: true, key: true, type: true, configurationJson: true } },
      answerTranscript: { select: { text: true } },
      answerAnalysis: { select: { summary: true, sentimentLabel: true, sentimentScore: true, themesJson: true } },
      answerEventThemes: { select: { themeKey: true, label: true } },
      answerEventIntelligence: {
        select: {
          frictionCategory: true, recommendedAction: true, urgency: true,
          actions: { select: { id: true, title: true, description: true, actionWindow: true } },
        },
      },
      response: {
        select: {
          id: true, startedAt: true, completedAt: true,
          survey: { select: { id: true, name: true, surveyTarget: { select: RAW_RESPONSE_TARGET_SELECT } } },
          surveyTarget: { select: RAW_RESPONSE_TARGET_SELECT },
          publicSurveyLink: { select: { surveyTarget: { select: RAW_RESPONSE_TARGET_SELECT } } },
          answers: {
            where: { status: 'COMPLETED', OR: [
              { answerTranscript: { is: { text: { not: '' } } } },
              { numericValue: { not: null } },
            ] },
            select: {
              id: true, promptLabel: true, numericValue: true, speakerId: true,
              question: { select: { type: true, configurationJson: true } },
              answerTranscript: { select: { text: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })
  if (!answer) throw new EventRawResponsesError('Answer not found or access denied', 404)

  const responseSpeakerIds = [...new Set([answer.speakerId, ...answer.response.answers.map((item) => item.speakerId)].filter((id): id is string => Boolean(id)))]
  const speakers = responseSpeakerIds.length === 0 ? [] : await db.eventSpeakerProfile.findMany({
    where: { accountId: input.accountId, id: { in: responseSpeakerIds }, sessionAssignments: { some: { eventId: input.eventId } } },
    select: { id: true, name: true },
  })
  const speakerById = new Map(speakers.map((speaker) => [speaker.id, speaker]))

  const effectiveTarget = resolveEffectiveResponseTarget({
    publicSurveyLink: answer.response.publicSurveyLink,
    responseTarget: answer.response.surveyTarget,
    survey: answer.response.survey,
  })
  const target = effectiveTarget?.target ?? null
  const speaker = answer.speakerId ? speakerById.get(answer.speakerId) ?? null : null
  const structuredValue = formatStructuredAnswer({
    questionType: answer.question?.type,
    numericValue: answer.numericValue,
    configurationJson: answer.question?.configurationJson,
    speakerName: speaker?.name,
  })

  return {
    id: answer.id,
    responseId: answer.responseId,
    createdAt: answer.createdAt.toISOString(),
    durationMs: answer.durationMs,
    // Audio is intentionally omitted until a scoped playback endpoint exists.
    audioAvailable: false,
    question: { id: answer.question?.id ?? answer.questionId, key: answer.question?.key ?? null, label: answer.question?.label ?? answer.promptLabel, type: answer.question?.type ?? null },
    answerType: structuredValue === null ? 'TEXT' as const : 'STRUCTURED' as const,
    answerDisplay: structuredValue ?? answer.answerTranscript?.text ?? '',
    numericValue: answer.numericValue,
    speaker,
    transcript: answer.answerTranscript?.text ?? null,
    analysis: answer.answerAnalysis ? {
      summary: (answer.answerAnalysis.themesJson as { evidenceState?: string } | null)?.evidenceState === 'INSUFFICIENT_EVIDENCE'
        ? 'Not enough substantive feedback to analyze.'
        : answer.answerAnalysis.summary || null,
      sentiment: answer.answerAnalysis.sentimentLabel,
      sentimentScore: answer.answerAnalysis.sentimentScore,
      evidenceState: (answer.answerAnalysis.themesJson as { evidenceState?: string } | null)?.evidenceState ?? null,
    } : null,
    themes: answer.answerEventThemes,
    linkedFindings: answer.answerEventIntelligence ? [{
      taxonomyKey: answer.answerEventIntelligence.frictionCategory,
      urgency: answer.answerEventIntelligence.urgency,
      recommendedAction: answer.answerEventIntelligence.recommendedAction,
      actions: answer.answerEventIntelligence.actions,
    }] : [],
    context: {
      survey: answer.response.survey,
      target: target ? {
        id: target.id, name: target.name, category: target.category,
        session: target.eventStructureItem,
        speaker: target.speakerAssignment?.speaker ?? null,
      } : null,
      startedAt: answer.response.startedAt?.toISOString() ?? null,
      completedAt: answer.response.completedAt?.toISOString() ?? null,
    },
    responseAnswers: answer.response.answers.map((item) => {
      const itemSpeaker = item.speakerId ? speakerById.get(item.speakerId) ?? null : null
      const itemStructuredValue = formatStructuredAnswer({
        questionType: item.question?.type,
        numericValue: item.numericValue,
        configurationJson: item.question?.configurationJson,
        speakerName: itemSpeaker?.name,
      })
      return {
        id: item.id,
        question: item.promptLabel,
        answerType: itemStructuredValue === null ? 'TEXT' as const : 'STRUCTURED' as const,
        answerDisplay: itemStructuredValue ?? excerpt(item.answerTranscript?.text ?? '', 120),
        transcriptExcerpt: excerpt(item.answerTranscript?.text ?? '', 120),
        selected: item.id === answer.id,
      }
    }),
  }
}
