import { prisma } from '@/lib/prisma'
import { AccountProductModeError, requireEventsAccountType } from '@/lib/account-product-mode'
import {
  getEventTaxonomyLabel,
  isEventOperationsTaxonomyKey,
  type EventOperationsTaxonomyKey,
} from '@/lib/event-intelligence/contract'
import { resolveEffectiveResponseTarget } from '@/lib/effective-response-target'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'

type PrismaLike = typeof prisma

const EVIDENCE_TARGET_SELECT = {
  id: true,
  name: true,
  category: true,
  eventStructureItemId: true,
} as const

export interface EventEvidenceDetailInput {
  accountSlug: string
  eventId: string
  evidenceId: string
  lifecyclePhase?: ResolvedEventLifecyclePhase
}

export interface EventEvidenceDetail {
  evidenceId: string
  clusterId: string
  eventId: string
  responseId: string
  answerId: string
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
  }
  sentimentScore: number | null
  priorityLevel: string
  createdAt: string
  recommendedNextStep: string | null
  clusterTitle: string
  taxonomyKey: string
  taxonomyLabel: string
}

export class EventEvidenceDetailError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'EventEvidenceDetailError'
  }
}

function taxonomyLabelFor(key: string): string {
  return isEventOperationsTaxonomyKey(key)
    ? getEventTaxonomyLabel(key as EventOperationsTaxonomyKey)
    : key.replace(/_/g, ' ')
}

export async function getEventEvidenceDetail(
  input: EventEvidenceDetailInput,
  db: PrismaLike = prisma,
): Promise<EventEvidenceDetail> {
  const accountSlug = input.accountSlug.trim()
  const eventId = input.eventId.trim()
  const evidenceId = input.evidenceId.trim()
  const responsePhaseWhere = responseCollectionPhaseWhere(input.lifecyclePhase)

  if (!accountSlug) {
    throw new EventEvidenceDetailError('Account parameter required', 400)
  }
  if (!eventId || !evidenceId) {
    throw new EventEvidenceDetailError('eventId and evidenceId are required', 400)
  }

  const account = await db.account.findUnique({
    where: { slug: accountSlug },
    select: { id: true, accountType: true },
  })

  if (!account) {
    throw new EventEvidenceDetailError('Account not found', 404)
  }

  try {
    requireEventsAccountType(
      account.accountType,
      'Event intelligence is only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      throw new EventEvidenceDetailError(error.message, error.status)
    }
    throw error
  }

  const evidence = await db.eventIssueEvidence.findFirst({
    where: {
      id: evidenceId,
      eventId,
      response: responsePhaseWhere,
      event: {
        location: {
          accountId: account.id,
        },
      },
    },
    select: {
      id: true,
      clusterId: true,
      eventId: true,
      responseId: true,
      answerId: true,
      questionId: true,
      surveyTargetId: true,
      transcriptSnippet: true,
      sentimentScore: true,
      priorityLevel: true,
      createdAt: true,
      cluster: {
        select: {
          title: true,
          taxonomyKey: true,
          recommendedNextStep: true,
        },
      },
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
      surveyTarget: {
        select: EVIDENCE_TARGET_SELECT,
      },
      response: {
        select: {
          surveyTarget: { select: EVIDENCE_TARGET_SELECT },
          publicSurveyLink: { select: { surveyTarget: { select: EVIDENCE_TARGET_SELECT } } },
          survey: { select: { surveyTarget: { select: EVIDENCE_TARGET_SELECT } } },
        },
      },
    },
  })

  if (!evidence) {
    throw new EventEvidenceDetailError('Evidence not found or access denied', 404)
  }

  const taxonomyKey = evidence.cluster.taxonomyKey
  const effectiveTarget = resolveEffectiveResponseTarget({
    publicSurveyLink: evidence.response?.publicSurveyLink,
    responseTarget: evidence.response?.surveyTarget,
    survey: evidence.response?.survey,
  })
  const target = effectiveTarget?.target ?? evidence.surveyTarget

  return {
    evidenceId: evidence.id,
    clusterId: evidence.clusterId,
    eventId: evidence.eventId,
    responseId: evidence.responseId,
    answerId: evidence.answerId,
    questionId: evidence.questionId,
    surveyTargetId: effectiveTarget?.targetId ?? evidence.surveyTargetId,
    transcriptSnippet: evidence.transcriptSnippet,
    transcriptText: evidence.answer.answerTranscript?.text ?? null,
    question: {
      id: evidence.question?.id ?? evidence.questionId,
      key: evidence.question?.key ?? evidence.answer.questionKey ?? null,
      label: evidence.question?.label ?? evidence.answer.promptLabel ?? null,
      promptLabel: evidence.answer.promptLabel ?? null,
    },
    target: {
      id: target?.id ?? evidence.surveyTargetId,
      name: target?.name ?? null,
      category: target?.category ?? null,
    },
    sentimentScore: evidence.sentimentScore,
    priorityLevel: evidence.priorityLevel,
    createdAt: evidence.createdAt.toISOString(),
    recommendedNextStep: evidence.cluster.recommendedNextStep,
    clusterTitle: evidence.cluster.title,
    taxonomyKey,
    taxonomyLabel: taxonomyLabelFor(taxonomyKey),
  }
}
