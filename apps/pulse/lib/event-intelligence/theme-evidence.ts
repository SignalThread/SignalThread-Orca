import { prisma } from '@/lib/prisma'
import { AccountProductModeError, requireEventsAccountType } from '@/lib/account-product-mode'
import {
  EventDashboardFilterError,
  validateEventDashboardFilters,
} from '@/lib/event-dashboard-filters'
import { SurveyTargetCategory, type EventStructureItemKind, type Prisma } from '@prisma/client'
import { buildEffectiveResponseTargetWhere, resolveEffectiveResponseTarget } from '@/lib/effective-response-target'
import { buildCanonicalSpeakerEvidenceWhere } from '@/lib/event-speaker-attribution'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

type PrismaLike = typeof prisma

const THEME_EVIDENCE_TARGET_SELECT = {
  id: true,
  name: true,
  category: true,
  eventStructureItemId: true,
  eventStructureItem: { select: { id: true, name: true, kind: true } },
  speakerAssignment: {
    select: {
      id: true,
      role: true,
      speaker: { select: { id: true, name: true } },
    },
  },
} as const

export interface EventThemeEvidenceInput {
  accountSlug: string
  eventId: string
  themeKey: string
  /** Additional canonical keys when a finding has consolidated sibling themes. */
  themeKeys?: string[]
  /** Exact persisted issue-cluster provenance for post-event issue findings. */
  issueClusterIds?: string[]
  surveyId?: string | null
  surveyTargetId?: string | null
  questionId?: string | null
  speakerId?: string | null
  eventStructureItemId?: string | null
  structureKind?: EventStructureItemKind | null
  lifecyclePhase?: ResolvedEventLifecyclePhase
  authorized?: {
    account: { id: string; accountType: string }
    event: { id: string }
  }
}

export interface EventThemeEvidenceRow {
  themeKey: string
  themeLabel: string
  answerId: string
  responseId: string
  questionId: string | null
  surveyTargetId: string | null
  transcriptSnippet: string
  transcriptText: string | null
  question: {
    id: string | null
    key: string | null
    label: string | null
    promptLabel: string | null
  }
  target: {
    id: string | null
    name: string | null
    category: string | null
    session: { id: string; name: string } | null
    speaker: { assignmentId: string; id: string; name: string; role: string } | null
  }
  response: {
    id: string
    anonymousId: string | null
    status: string | null
    startedAt: string | null
    completedAt: string | null
  }
  sentimentScore: number | null
  sentimentLabel: string | null
  confidence: number | null
  createdAt: string
}

export interface EventThemeEvidenceResult {
  eventId: string
  themeKey: string
  themeLabel: string
  mentionCount: number
  evidence: EventThemeEvidenceRow[]
}

export class EventThemeEvidenceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'EventThemeEvidenceError'
  }
}

function humanizeThemeKey(themeKey: string): string {
  return themeKey
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildTranscriptSnippet(text: string | null | undefined): string {
  const normalized = text?.trim()
  if (!normalized) return 'Transcript unavailable.'
  if (normalized.length <= 240) return normalized
  return `${normalized.slice(0, 237).trim()}...`
}

export async function getEventThemeEvidence(
  input: EventThemeEvidenceInput,
  db: PrismaLike = prisma,
): Promise<EventThemeEvidenceResult> {
  const accountSlug = input.accountSlug.trim()
  const eventId = input.eventId.trim()
  const themeKey = input.themeKey.trim()
  const themeKeys = [...new Set([themeKey, ...(input.themeKeys ?? [])].map((value) => value.trim()).filter(Boolean))]
  const issueClusterIds = [...new Set((input.issueClusterIds ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 20)
  const surveyId = input.surveyId?.trim() || null
  const surveyTargetId = input.surveyTargetId?.trim() || null
  const questionId = input.questionId?.trim() || null
  const speakerId = input.speakerId?.trim() || null
  const responsePhaseWhere = responseCollectionPhaseWhere(input.lifecyclePhase)

  if (!accountSlug) {
    throw new EventThemeEvidenceError('Account parameter required', 400)
  }
  if (!eventId || themeKeys.length === 0) {
    throw new EventThemeEvidenceError('eventId and themeKey are required', 400)
  }

  const account = input.authorized?.account ?? await db.account.findUnique({
    where: { slug: accountSlug },
    select: { id: true, accountType: true },
  })

  if (!account) {
    throw new EventThemeEvidenceError('Account not found', 404)
  }

  try {
    requireEventsAccountType(
      account.accountType,
      'Event intelligence is only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      throw new EventThemeEvidenceError(error.message, error.status)
    }
    throw error
  }

  const event = input.authorized?.event ?? await db.event.findFirst({
    where: {
      id: eventId,
      location: {
        accountId: account.id,
      },
    },
    select: { id: true },
  })

  if (!event) {
    throw new EventThemeEvidenceError('Event not found or access denied', 404)
  }

  if (speakerId) {
    const speaker = await db.eventSpeakerProfile.findFirst({
      where: {
        id: speakerId,
        accountId: account.id,
        isArchived: false,
        sessionAssignments: { some: { eventId } },
      },
      select: { id: true },
    })
    if (!speaker) throw new EventThemeEvidenceError('Speaker not found for this event', 404)
  }

  try {
    await validateEventDashboardFilters({
      accountId: account.id,
      accountType: account.accountType,
      eventId,
      filters: {
        surveyId,
        eventStructureItemId: input.eventStructureItemId,
        structureKind: input.structureKind,
      },
    }, db)
  } catch (error) {
    if (error instanceof EventDashboardFilterError) {
      throw new EventThemeEvidenceError(error.message, error.status)
    }
    throw error
  }

  const targetScope = {
    ...(surveyTargetId ? { id: surveyTargetId } : {}),
    ...(input.eventStructureItemId ? { eventStructureItemId: input.eventStructureItemId } : {}),
    ...(input.structureKind ? { eventStructureItem: { kind: input.structureKind } } : {}),
    ...(input.eventStructureItemId && !speakerId ? { speakerAssignmentId: null } : {}),
  }
  const attributionScope = speakerId
    ? buildCanonicalSpeakerEvidenceWhere({ speakerId, eventId, targetScope })
    : Object.keys(targetScope).length > 0
      ? { response: buildEffectiveResponseTargetWhere(targetScope) }
      : {}

  // Issue clusters are the canonical source for post-event issue findings.
  // A taxonomy key alone is not provenance: a cluster can have evidence even
  // when no AnswerEventTheme row exists for that taxonomy. Query the exact
  // cluster IDs so the headline count and drawer count always describe the
  // same source records.
  if (issueClusterIds.length > 0) {
    const issueAttributionScope: Prisma.EventIssueEvidenceWhereInput = speakerId
      ? {
          OR: [
            Object.keys(targetScope).length > 0
              ? { AND: [{ answer: { speakerId } }, { response: buildEffectiveResponseTargetWhere(targetScope) }] }
              : { answer: { speakerId } },
            { response: buildEffectiveResponseTargetWhere({ ...targetScope, category: SurveyTargetCategory.SPEAKER, speakerId }) },
            { response: buildEffectiveResponseTargetWhere({ ...targetScope, speakerAssignment: { speakerId, eventId } }) },
          ],
        }
      : Object.keys(targetScope).length > 0
        ? { response: buildEffectiveResponseTargetWhere(targetScope) }
        : {}
    const issueRows = await db.eventIssueEvidence.findMany({
      where: {
        accountId: account.id,
        eventId,
        clusterId: { in: issueClusterIds },
        ...(surveyId ? { surveyId } : {}),
        ...(surveyTargetId ? { surveyTargetId } : {}),
        ...(questionId ? { questionId } : {}),
        AND: [issueAttributionScope, { response: responsePhaseWhere }],
      },
      select: {
        clusterId: true,
        answerId: true,
        responseId: true,
        questionId: true,
        surveyTargetId: true,
        transcriptSnippet: true,
        sentimentScore: true,
        createdAt: true,
        cluster: { select: { taxonomyKey: true, title: true, confidence: true } },
        question: { select: { id: true, key: true, label: true } },
        surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT },
        response: {
          select: {
            id: true, anonymousId: true, status: true, startedAt: true, completedAt: true,
            surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT },
            publicSurveyLink: { select: { surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT } } },
            survey: { select: { surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const evidence = issueRows.map((row) => {
      const effectiveTarget = resolveEffectiveResponseTarget({
        publicSurveyLink: row.response.publicSurveyLink,
        responseTarget: row.response.surveyTarget,
        survey: row.response.survey,
      })
      const target = effectiveTarget?.target ?? row.surveyTarget
      return {
        themeKey: row.cluster.taxonomyKey,
        themeLabel: row.cluster.title,
        answerId: row.answerId,
        responseId: row.responseId,
        questionId: row.questionId,
        surveyTargetId: effectiveTarget?.targetId ?? row.surveyTargetId,
        transcriptSnippet: buildTranscriptSnippet(row.transcriptSnippet),
        transcriptText: row.transcriptSnippet,
        question: { id: row.question?.id ?? row.questionId, key: row.question?.key ?? null, label: row.question?.label ?? null, promptLabel: row.question?.label ?? null },
        target: {
          id: target?.id ?? row.surveyTargetId,
          name: target?.name ?? null,
          category: target?.category ?? null,
          session: target?.eventStructureItem ?? null,
          speaker: target?.speakerAssignment ? { assignmentId: target.speakerAssignment.id, id: target.speakerAssignment.speaker.id, name: target.speakerAssignment.speaker.name, role: target.speakerAssignment.role } : null,
        },
        response: { id: row.response.id, anonymousId: row.response.anonymousId ?? null, status: row.response.status ?? null, startedAt: row.response.startedAt?.toISOString() ?? null, completedAt: row.response.completedAt?.toISOString() ?? null },
        sentimentScore: row.sentimentScore,
        sentimentLabel: null,
        confidence: row.cluster.confidence,
        createdAt: row.createdAt.toISOString(),
      }
    })
    return { eventId, themeKey, themeLabel: evidence[0]?.themeLabel ?? humanizeThemeKey(themeKey), mentionCount: evidence.length, evidence }
  }

  const rows = await db.answerEventTheme.findMany({
    where: {
      eventId,
      themeKey: themeKeys.length === 1 ? themeKey : { in: themeKeys },
      ...(surveyId ? { surveyId } : {}),
      intelligence: {
        accountId: account.id,
        eventId,
        ...(surveyId ? { surveyId } : {}),
        ...(questionId ? { questionId } : {}),
        AND: [attributionScope, { response: responsePhaseWhere }],
      },
    },
    select: {
      themeKey: true,
      label: true,
      sentimentLabel: true,
      confidence: true,
      createdAt: true,
      intelligence: {
        select: {
          answerId: true,
          responseId: true,
          questionId: true,
          surveyTargetId: true,
          sentimentScore: true,
          sentimentLabel: true,
          createdAt: true,
          answer: {
            select: {
              promptLabel: true,
              questionKey: true,
              answerTranscript: {
                select: {
                  text: true,
                },
              },
            },
          },
          question: {
            select: {
              id: true,
              key: true,
              label: true,
            },
          },
          surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT },
          response: {
            select: {
              id: true,
              anonymousId: true,
              status: true,
              startedAt: true,
              completedAt: true,
              surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT },
              publicSurveyLink: { select: { surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT } } },
              survey: { select: { surveyTarget: { select: THEME_EVIDENCE_TARGET_SELECT } } },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  })

  const themeLabel = rows[0]?.label ?? humanizeThemeKey(themeKey)

  return {
    eventId,
    themeKey,
    themeLabel,
    mentionCount: rows.length,
    evidence: rows.map((row) => {
      const intelligence = row.intelligence
      const transcriptText = intelligence.answer.answerTranscript?.text ?? null
      const effectiveTarget = resolveEffectiveResponseTarget({
        publicSurveyLink: intelligence.response.publicSurveyLink,
        responseTarget: intelligence.response.surveyTarget,
        survey: intelligence.response.survey,
      })
      const target = effectiveTarget?.target ?? intelligence.surveyTarget

      return {
        themeKey: row.themeKey,
        themeLabel: row.label,
        answerId: intelligence.answerId,
        responseId: intelligence.responseId,
        questionId: intelligence.questionId,
        surveyTargetId: effectiveTarget?.targetId ?? intelligence.surveyTargetId,
        transcriptSnippet: buildTranscriptSnippet(transcriptText),
        transcriptText,
        question: {
          id: intelligence.question?.id ?? intelligence.questionId,
          key: intelligence.question?.key ?? intelligence.answer.questionKey ?? null,
          label: intelligence.question?.label ?? intelligence.answer.promptLabel ?? null,
          promptLabel: intelligence.answer.promptLabel ?? null,
        },
        target: {
          id: target?.id ?? intelligence.surveyTargetId,
          name: target?.name ?? null,
          category: target?.category ?? null,
          session: target?.eventStructureItem ?? null,
          speaker: target?.speakerAssignment ? {
            assignmentId: target.speakerAssignment.id,
            id: target.speakerAssignment.speaker.id,
            name: target.speakerAssignment.speaker.name,
            role: target.speakerAssignment.role,
          } : null,
        },
        response: {
          id: intelligence.response.id,
          anonymousId: intelligence.response.anonymousId ?? null,
          status: intelligence.response.status ?? null,
          startedAt: intelligence.response.startedAt?.toISOString() ?? null,
          completedAt: intelligence.response.completedAt?.toISOString() ?? null,
        },
        sentimentScore: intelligence.sentimentScore,
        sentimentLabel: row.sentimentLabel ?? intelligence.sentimentLabel,
        confidence: row.confidence,
        createdAt: intelligence.createdAt.toISOString(),
      }
    }),
  }
}
