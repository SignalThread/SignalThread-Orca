import { createHash } from 'node:crypto'
import { EventActionClassification, EventActionStatus, Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { listEventActions } from '@/lib/event-actions/service'
import { getEventIntelligenceSummary } from '@/lib/event-intelligence/aggregation'
import {
  buildEventIntelligenceFindings,
  evidenceStrengthForTier,
  type EventIntelligenceEvidenceStrength,
} from '@/lib/event-intelligence/intelligence-view'
import { buildEventEvidenceModel, type EventEvidenceTier } from '@/lib/event-intelligence/evidence-model'
import { getEventSessionIntelligence } from '@/lib/event-session-intelligence'
import { getEventSpeakerIntelligence } from '@/lib/event-speaker-intelligence'
import { buildEventIntelligenceFactualSnapshot } from '@/lib/event-intelligence/factual-snapshot'
import { collectionPhasesForLifecycle } from '@/lib/event-intelligence/collection-phase'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'
import {
  buildEventClosingBriefEditorialFallback,
  synthesizeEventClosingBriefEditorial,
  type EventClosingBriefEditorial,
  type EventClosingBriefEditorialInput,
} from '@/lib/event-closing-brief-editorial'

type ClosingBriefDb = typeof prisma | PrismaClient
type IntelligenceSummary = Awaited<ReturnType<typeof getEventIntelligenceSummary>>
type SessionIntelligence = Awaited<ReturnType<typeof getEventSessionIntelligence>>
type SpeakerIntelligence = Awaited<ReturnType<typeof getEventSpeakerIntelligence>>
type ActionList = Awaited<ReturnType<typeof listEventActions>>
const EVENT_CLOSING_BRIEF_SNAPSHOT_VERSION = '2026-09-05-v4-lifecycle-briefs'

type ClosingBriefTimings = {
  sourceRevisionMs: number
  cacheLookupMs: number
  aggregationMs: number
  synthesisMs: number
  persistenceMs: number
  totalMs: number
  cacheHit: boolean
}

function elapsed(start: number) {
  return Math.round((performance.now() - start) * 10) / 10
}

function logClosingBriefTimings(eventId: string, timings: ClosingBriefTimings) {
  console.info('[EventClosingBrief] timings', { eventId, ...timings })
}

function isEventClosingBrief(value: unknown): value is EventClosingBrief {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<EventClosingBrief>
  return typeof candidate.generatedAt === 'string'
    && typeof candidate.event?.id === 'string'
    && typeof candidate.editorial?.inputHash === 'string'
    && Array.isArray(candidate.keyFindings)
}

async function getEventClosingBriefSourceHash(input: { accountId: string; eventId: string; lifecyclePhase: EventLifecyclePhase }, db: ClosingBriefDb) {
  const collectionPhases = collectionPhasesForLifecycle(input.lifecyclePhase)
  // `Response.collectionPhase` is a PostgreSQL enum. Prisma binds values in a
  // raw query as text unless the parameter is explicitly typed, so cast each
  // supplied value to the authoritative enum rather than coercing the column.
  const phaseSql = Prisma.join(collectionPhases.map((phase) => Prisma.sql`${phase}::"CollectionPhase"`))
  const rows = await db.$queryRaw<Array<Record<string, string | number | bigint | Date | null>>>(Prisma.sql`
    SELECT
      e."updatedAt" AS "eventUpdatedAt",
      a.slug AS "accountSlug",
      (SELECT COUNT(*) FROM "Response" r WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "responseCount",
      (SELECT COUNT(*) FROM "Response" r WHERE r."eventId" = e.id AND r.status = 'IN_PROGRESS' AND r."collectionPhase" IN (${phaseSql})) AS "inProgressResponseCount",
      (SELECT COUNT(*) FROM "Response" r WHERE r."eventId" = e.id AND r.status = 'COMPLETED' AND r."collectionPhase" IN (${phaseSql})) AS "completedResponseCount",
      (SELECT COUNT(*) FROM "Response" r WHERE r."eventId" = e.id AND r.status = 'ABANDONED' AND r."collectionPhase" IN (${phaseSql})) AS "abandonedResponseCount",
      (SELECT MAX(r."startedAt") FROM "Response" r WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "responseStartedAt",
      (SELECT MAX(r."completedAt") FROM "Response" r WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "responseCompletedAt",
      (SELECT COUNT(*) FROM "Answer" a JOIN "Response" r ON r.id = a."responseId" WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "answerCount",
      (SELECT MAX(a."updatedAt") FROM "Answer" a JOIN "Response" r ON r.id = a."responseId" WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "answerUpdatedAt",
      (SELECT MAX(t."createdAt") FROM "AnswerTranscript" t JOIN "Answer" a ON a.id = t."answerId" JOIN "Response" r ON r.id = a."responseId" WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "transcriptCreatedAt",
      (SELECT MAX(an."createdAt") FROM "AnswerAnalysis" an JOIN "Answer" a ON a.id = an."answerId" JOIN "Response" r ON r.id = a."responseId" WHERE r."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "analysisCreatedAt",
      (SELECT COUNT(*) FROM "AnswerEventIntelligence" i JOIN "Response" r ON r.id = i."responseId" WHERE i."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "intelligenceCount",
      (SELECT MAX(i."updatedAt") FROM "AnswerEventIntelligence" i JOIN "Response" r ON r.id = i."responseId" WHERE i."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "intelligenceUpdatedAt",
      (SELECT COUNT(*) FROM "AnswerEventTheme" t JOIN "AnswerEventIntelligence" i ON i.id = t."intelligenceId" JOIN "Response" r ON r.id = i."responseId" WHERE t."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "themeCount",
      (SELECT MAX(t."createdAt") FROM "AnswerEventTheme" t JOIN "AnswerEventIntelligence" i ON i.id = t."intelligenceId" JOIN "Response" r ON r.id = i."responseId" WHERE t."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "themeCreatedAt",
      (SELECT COUNT(*) FROM "AnswerEventAction" aa JOIN "AnswerEventIntelligence" i ON i.id = aa."intelligenceId" JOIN "Response" r ON r.id = i."responseId" WHERE aa."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "answerActionCount",
      (SELECT MAX(aa."updatedAt") FROM "AnswerEventAction" aa JOIN "AnswerEventIntelligence" i ON i.id = aa."intelligenceId" JOIN "Response" r ON r.id = i."responseId" WHERE aa."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "answerActionUpdatedAt",
      (SELECT COUNT(DISTINCT ev."clusterId") FROM "EventIssueEvidence" ev JOIN "Response" r ON r.id = ev."responseId" WHERE ev."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "issueCount",
      (SELECT MAX(c."updatedAt") FROM "EventIssueCluster" c WHERE c."eventId" = e.id AND EXISTS (SELECT 1 FROM "EventIssueEvidence" ev JOIN "Response" r ON r.id = ev."responseId" WHERE ev."clusterId" = c.id AND r."collectionPhase" IN (${phaseSql}))) AS "issueUpdatedAt",
      (SELECT COUNT(*) FROM "EventIssueEvidence" ev JOIN "Response" r ON r.id = ev."responseId" WHERE ev."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "issueEvidenceCount",
      (SELECT MAX(ev."createdAt") FROM "EventIssueEvidence" ev JOIN "Response" r ON r.id = ev."responseId" WHERE ev."eventId" = e.id AND r."collectionPhase" IN (${phaseSql})) AS "issueEvidenceCreatedAt",
      (SELECT COUNT(*) FROM "EventStructureItem" s WHERE s."eventId" = e.id) AS "structureCount",
      (SELECT MAX(s."updatedAt") FROM "EventStructureItem" s WHERE s."eventId" = e.id) AS "structureUpdatedAt",
      (SELECT COUNT(*) FROM "SurveyTarget" st WHERE st."eventId" = e.id) AS "targetCount",
      (SELECT MAX(st."updatedAt") FROM "SurveyTarget" st WHERE st."eventId" = e.id) AS "targetUpdatedAt",
      (SELECT COUNT(*) FROM "Survey" s WHERE s."eventId" = e.id) AS "surveyCount",
      (SELECT MAX(s."updatedAt") FROM "Survey" s WHERE s."eventId" = e.id) AS "surveyUpdatedAt",
      (SELECT COUNT(*) FROM "Question" q WHERE q."eventId" = e.id) AS "questionCount",
      (SELECT MAX(q."updatedAt") FROM "Question" q WHERE q."eventId" = e.id) AS "questionUpdatedAt",
      (SELECT COUNT(*) FROM "EventSessionSpeakerAssignment" sa WHERE sa."eventId" = e.id) AS "assignmentCount",
      (SELECT MAX(sa."updatedAt") FROM "EventSessionSpeakerAssignment" sa WHERE sa."eventId" = e.id) AS "assignmentUpdatedAt",
      (SELECT MAX(sp."updatedAt") FROM "EventSpeakerProfile" sp JOIN "EventSessionSpeakerAssignment" sa ON sa."speakerId" = sp.id WHERE sa."eventId" = e.id) AS "speakerUpdatedAt",
      (SELECT COUNT(*) FROM "EventActionUpdate" au WHERE au."eventId" = e.id) AS "actionUpdateCount",
      (SELECT MAX(au."updatedAt") FROM "EventActionUpdate" au WHERE au."eventId" = e.id) AS "actionUpdatedAt"
    FROM "Event" e
    JOIN "Location" l ON l.id = e."locationId"
    JOIN "Account" a ON a.id = l."accountId"
    WHERE e.id = ${input.eventId} AND l."accountId" = ${input.accountId}
    LIMIT 1
  `)
  if (!rows[0]) throw new Error('Event not found or access denied')
  return createHash('sha256')
    .update(JSON.stringify({
      snapshotVersion: EVENT_CLOSING_BRIEF_SNAPSHOT_VERSION,
      lifecyclePhase: input.lifecyclePhase,
      revision: rows[0],
    }, (_key, value) => typeof value === 'bigint' ? value.toString() : value))
    .digest('hex')
}

export async function getPersistedEventClosingBrief(input: {
  accountId: string
  eventId: string
  lifecyclePhase: EventLifecyclePhase
  briefHash?: string | null
}, db: ClosingBriefDb = prisma): Promise<EventClosingBrief | null> {
  const snapshot = await db.eventClosingBriefSnapshot.findFirst({
    where: {
      accountId: input.accountId,
      eventId: input.eventId,
      lifecyclePhase: input.lifecyclePhase,
      ...(input.briefHash ? { briefHash: input.briefHash } : {}),
    },
    select: { briefJson: true },
  })
  return isEventClosingBrief(snapshot?.briefJson) ? snapshot.briefJson : null
}

const CLOSED_ACTION_STATUSES = new Set<EventActionStatus>([
  EventActionStatus.COMPLETE,
  EventActionStatus.DISMISSED,
  EventActionStatus.CANCELLED,
])

interface ClosingEvidence {
  id: string
  clusterId: string | null
  title: string
  taxonomyKey: string
  transcriptSnippet: string
  sentimentScore: number | null
  priorityLevel: string
  confidence: number | null
  createdAt: Date
  question: { label: string; type: string } | null
  surveyTarget: { name: string; eventStructureItem: { name: string } | null } | null
}

function sentimentLabel(label: string) {
  if (label === 'POSITIVE') return 'Mostly positive'
  if (label === 'NEGATIVE') return 'Mostly negative'
  if (label === 'MIXED') return 'Mixed'
  return 'Not enough evidence'
}

function ownerLabel(owner: ActionList['actions'][number]['owner']) {
  if (!owner) return 'Unassigned'
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim()
  return name || owner.email
}

function serializeAction(action: ActionList['actions'][number]) {
  return {
    id: action.id,
    title: action.title,
    classification: action.actionClassification!,
    status: action.actionStatus!,
    priority: action.priorityLevel,
    owner: ownerLabel(action.owner),
    ownerUserId: action.ownerUserId,
    dueAt: action.actionDueAt?.toISOString() ?? null,
    evidenceCount: action._count.evidence,
    updateCount: action._count.actionUpdates,
  }
}

interface ClosingBriefEditorialSource {
  lifecyclePhase: EventLifecyclePhase
  event: { id: string; name: string }
  summary: {
    sentiment: string
    avgSentiment: number | null
    responseCount: number
    answerCount: number
    sentimentPercent: number | null
    sentimentBreakdown: { favorable: number; neutral: number; negative: number; total: number }
    listeningPointCount: number
    representedListeningPointCount: number
    representedPercent: number
  }
  keyFindings: EditorialSourceFinding[]
  whatWorked: EditorialSourceFinding[]
  friction: EditorialSourceFinding[]
  intelligencePacket: {
    overview: string
    attendeeQuestions: string[]
    sessionPatterns: Array<{ title: string; finding: string | null; evidenceTier: string; responseCount: number }>
    speakerPatterns: Array<{ name: string; finding: string | null; evidenceTier: string; responseCount: number }>
    eventAreaPatterns: Array<{ name: string; kind: string | null; answerCount: number; sentiment: string | null }>
    changePatterns: Array<{ question: string; survey: string | null; target: string | null; direction: string; change: number; count: number; strength: string }>
  }
  decisions: {
    afterEventFollowUp: Array<{ title: string; status: string; priority: string; owner: string; dueAt: string | null }>
    nextEventLearning: {
      actions: Array<{ id: string; title: string; status: string; priority: string; owner: string; dueAt: string | null }>
      sessionLearning: Array<{ id: string; title: string; source: string; evidenceTier: string; confidence: number | null }>
      findings: EditorialSourceFinding[]
    }
  }
  supportingEvidence: Array<{ id: string; taxonomyKey: string; quote: string; question: string; source: string; confidence: number | null }>
}

interface EditorialSourceFinding {
  id: string
  title: string
  statement: string | null
  kind: string
  classification: string
  evidenceTier: string
  confidence: number | null
  mentionCount: number
  responseCount: number | null
  sentiment: string | null
  targetIdentity: string
  targetName: string | null
  targetKind: string | null
  evidenceModalities: string[]
  evidenceText: string[]
  evidenceThemeKeys: string[]
  /** Issue findings use cluster provenance; canonical findings use theme provenance. */
  issueClusterIds?: string[]
}

export function buildEventClosingBriefEditorialInput(brief: ClosingBriefEditorialSource): EventClosingBriefEditorialInput {
  const serializeFinding = (finding: EditorialSourceFinding) => ({
    id: finding.id,
    title: finding.title,
    statement: finding.statement,
    kind: finding.kind,
    classification: finding.classification,
    evidenceTier: finding.evidenceTier,
    confidence: finding.confidence,
    mentionCount: finding.mentionCount,
    responseCount: finding.responseCount,
    sentiment: finding.sentiment,
    target: { id: finding.targetIdentity, name: finding.targetName, kind: finding.targetKind },
    evidenceModalities: finding.evidenceModalities,
    evidenceText: finding.evidenceText.slice(0, 3).map((text) => text.slice(0, 320)),
    representativeEvidence: brief.supportingEvidence
      .filter((evidence) => finding.evidenceThemeKeys.includes(evidence.taxonomyKey))
      .slice(0, 3)
      .map((evidence) => ({
        id: evidence.id,
        excerpt: evidence.quote.slice(0, 320),
        question: evidence.question,
        source: evidence.source,
      })),
  })
  return {
    event: { id: brief.event.id, name: brief.event.name, lifecycle: brief.lifecyclePhase },
    overview: brief.intelligencePacket.overview,
    attendeeQuestions: brief.intelligencePacket.attendeeQuestions,
    patterns: {
      sessions: brief.intelligencePacket.sessionPatterns,
      speakers: brief.intelligencePacket.speakerPatterns,
      eventAreas: brief.intelligencePacket.eventAreaPatterns,
      changes: brief.intelligencePacket.changePatterns,
    },
    metrics: {
      responseCount: brief.summary.responseCount,
      answerCount: brief.summary.answerCount,
      sentiment: brief.summary.sentiment,
      averageSentiment: brief.summary.avgSentiment,
      listeningPointCount: brief.summary.listeningPointCount,
      representedListeningPointCount: brief.summary.representedListeningPointCount,
      representedPercent: brief.summary.representedPercent,
    },
    findings: {
      keyFindings: brief.keyFindings.map(serializeFinding),
      whatWorked: brief.whatWorked.map(serializeFinding),
      friction: brief.friction.map(serializeFinding),
      nextEvent: [
        ...brief.decisions.nextEventLearning.actions.map((action) => ({
          id: action.id,
          title: action.title,
          statement: null,
          kind: 'action',
          classification: 'next-event',
          evidenceTier: 'RECORDED_ACTION',
          confidence: null,
          mentionCount: 1,
          responseCount: null,
          sentiment: null,
          target: { id: 'event', name: null, kind: 'event' },
          evidenceModalities: [],
          evidenceText: [],
          representativeEvidence: [],
        })),
        ...brief.decisions.nextEventLearning.sessionLearning.map((learning) => ({
          id: learning.id,
          title: learning.title,
          statement: null,
          kind: 'session-learning',
          classification: 'next-event',
          evidenceTier: learning.evidenceTier,
          confidence: learning.confidence,
          mentionCount: 1,
          responseCount: null,
          sentiment: null,
          target: { id: learning.id, name: learning.source, kind: 'session' },
          evidenceModalities: [],
          evidenceText: [],
          representativeEvidence: [],
        })),
        ...brief.decisions.nextEventLearning.findings.map(serializeFinding),
      ],
    },
    followThrough: brief.decisions.afterEventFollowUp.map((action) => ({
      title: action.title,
      status: action.status,
      priority: action.priority,
      owner: action.owner,
      dueAt: action.dueAt,
    })),
    representativeEvidence: brief.supportingEvidence.slice(0, 8).map((evidence) => ({
      id: evidence.id,
      excerpt: evidence.quote,
      question: evidence.question,
      source: evidence.source,
      confidence: evidence.confidence,
    })),
    limitations: {
      unrepresentedListeningPointCount: Math.max(0, brief.summary.listeningPointCount - brief.summary.representedListeningPointCount),
      evidenceExcerptCount: brief.supportingEvidence.length,
    },
  }
}

function buildEditorialShareText(brief: ClosingBriefEditorialSource, editorial: EventClosingBriefEditorial): string {
  const stage = brief.lifecyclePhase === 'PRE_EVENT' ? 'pre-event' : brief.lifecyclePhase === 'IN_EVENT' ? 'during-event' : 'post-event'
  const closingLabel = brief.lifecyclePhase === 'PRE_EVENT' ? 'Preparation priorities' : brief.lifecyclePhase === 'IN_EVENT' ? 'Protect, fix, and watch' : 'Carry forward'
  return [
    `${brief.event.name} — ${stage} brief`,
    editorial.copy.headline,
    `${brief.summary.sentiment}; ${brief.summary.responseCount} completed responses; ${brief.summary.answerCount} analyzed answers; ${brief.summary.representedListeningPointCount} of ${brief.summary.listeningPointCount} listening points represented.`,
    editorial.copy.executiveSummary,
    `What worked: ${editorial.copy.whatWorkedNarrative}`,
    `Friction: ${editorial.copy.frictionNarrative}`,
    brief.decisions.afterEventFollowUp.length
      ? `Open follow-through: ${brief.decisions.afterEventFollowUp.map((action) => `${action.title} (${action.status}, ${action.owner})`).join('; ')}.`
      : 'Open follow-through: none.',
    `${closingLabel}: ${editorial.copy.nextEventNarrative}`,
    `Coverage: ${editorial.copy.coverageNarrative}`,
  ].join('\n\n')
}

function eventBriefVersionId(editorial: EventClosingBriefEditorial) {
  return createHash('sha256').update(`${editorial.inputHash}:${editorial.generatedAt}`).digest('hex')
}

export function buildEventClosingBrief(input: {
  accountSlug: string
  eventId: string
  intelligence: IntelligenceSummary
  sessions: SessionIntelligence
  speakers: SpeakerIntelligence
  actions: ActionList
  evidence: ClosingEvidence[]
  generatedAt: Date
  lifecyclePhase?: EventLifecyclePhase
  editorial?: EventClosingBriefEditorial
}) {
  const lifecyclePhase = input.lifecyclePhase ?? 'POST_EVENT'
  const factualSnapshot = buildEventIntelligenceFactualSnapshot(input.intelligence)
  const findings = input.intelligence.canonicalFindings ?? buildEventIntelligenceFindings({
    themes: input.intelligence.topThemes,
    actions: input.intelligence.topActions,
    targets: input.intelligence.targetBreakdown,
    issues: input.intelligence.attentionQueue ?? [],
    context: {
      lifecycle: lifecyclePhase,
      eventName: input.intelligence.eventName,
      eventType: input.intelligence.eventType,
    },
  })
  const unresolvedActions = input.actions.actions
    .filter((action) => action.actionStatus && !CLOSED_ACTION_STATUSES.has(action.actionStatus))
    .map(serializeAction)
  // Only persisted organizer actions can become follow-through. AI-derived
  // recommendations and session learning remain separate intelligence inputs.
  const afterEventFollowUp = unresolvedActions.filter((action) => (
    action.classification !== EventActionClassification.NEXT_EVENT_LEARNING
  ))
  const nextEventActionLearning = input.actions.actions
    .filter((action) => action.actionClassification === EventActionClassification.NEXT_EVENT_LEARNING)
    .map(serializeAction)
  const sessionLearning = input.sessions.sessions
    .flatMap((session) => session.learning
      .filter((learning) => learning.horizon === 'NEXT_EVENT')
      .map((learning) => {
        const evidence = buildEventEvidenceModel({
          mentionCount: learning.mentionCount,
          supportingResponseIds: Array.from({ length: learning.mentionCount }, (_, index) => `learning_${index}`),
          completedEligibleResponseCount: session.evidence?.completedEligibleResponseCount ?? learning.mentionCount,
          analyzedEligibleResponseCount: session.evidence?.analyzedEligibleResponseCount ?? learning.mentionCount,
          extractionConfidence: learning.confidence,
        })
        return {
          id: `session-learning:${session.id}:${learning.title}`,
          title: learning.title,
          source: session.title,
          confidence: learning.confidence,
          evidenceTier: evidence.evidenceTier,
          evidenceStrength: evidenceStrengthForTier(evidence.evidenceTier),
        }
      }))
  const evidenceByTaxonomy = new Map<string, ClosingEvidence>()
  const evidenceTextByTaxonomy = new Map<string, string[]>()
  for (const row of input.evidence) {
    if (!evidenceByTaxonomy.has(row.taxonomyKey)) evidenceByTaxonomy.set(row.taxonomyKey, row)
    const excerpts = evidenceTextByTaxonomy.get(row.taxonomyKey) ?? []
    if (!excerpts.includes(row.transcriptSnippet)) excerpts.push(row.transcriptSnippet)
    evidenceTextByTaxonomy.set(row.taxonomyKey, excerpts)
  }
  const nextEventFindings = findings
    .filter((finding) => finding.classification === 'next-event' && finding.evidenceTier !== 'ISOLATED')
    .slice(0, 4)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      statement: finding.description,
      evidenceTier: finding.evidenceTier,
      confidence: finding.confidence,
      mentionCount: finding.mentionCount,
      responseCount: finding.evidence.uniqueAnalyzedResponseCount,
      kind: finding.kind,
      classification: finding.classification,
      sentiment: finding.sentimentLabel,
      targetIdentity: finding.targetIdentity,
      targetName: finding.targetName,
      targetKind: finding.targetKind,
      evidenceModalities: finding.evidenceModalities,
      evidenceText: finding.evidenceText,
      evidenceThemeKeys: finding.evidenceThemeKeys,
      issueClusterIds: [],
      evidenceId: evidenceByTaxonomy.get(finding.evidenceThemeKey)?.id ?? null,
    }))
  const issueFindings = (input.intelligence.attentionQueue ?? []).slice(0, 5).map((issue) => ({
    id: `issue:${issue.id}`,
    title: issue.title,
    statement: issue.summary,
    kind: 'friction' as const,
    classification: 'after-event' as const,
    evidenceTier: buildEventEvidenceModel({
      mentionCount: issue.evidenceCount,
      supportingResponseIds: Array.from({ length: issue.evidenceCount }, (_, index) => `issue_${issue.id}_${index}`),
      // Cluster coverage is not available until Phase B; conservatively block
      // repeated/strong labels rather than treating confidence as evidence.
      completedEligibleResponseCount: Number.MAX_SAFE_INTEGER,
      extractionConfidence: issue.confidence,
    }).evidenceTier,
    confidence: issue.confidence,
    mentionCount: issue.evidenceCount,
    responseCount: null,
    sentiment: null,
    targetIdentity: 'event',
    targetName: null,
    targetKind: 'event',
    evidenceModalities: ['qualitative'],
    evidenceText: [issue.summary, ...(evidenceTextByTaxonomy.get(issue.taxonomyKey) ?? [])]
      .filter((value): value is string => Boolean(value)),
    evidenceThemeKeys: [issue.taxonomyKey],
    issueClusterIds: [issue.id],
    evidenceId: evidenceByTaxonomy.get(issue.taxonomyKey)?.id ?? null,
  }))
  const secondaryFindings = findings.slice(0, 7).map((finding) => ({
    id: finding.id,
    title: finding.title,
    statement: finding.description,
    kind: finding.kind,
    classification: finding.classification,
    evidenceTier: finding.evidenceTier,
    evidenceStrength: finding.evidenceStrength,
    confidence: finding.confidence,
    mentionCount: finding.mentionCount,
    responseCount: finding.evidence.uniqueAnalyzedResponseCount,
    sentiment: finding.sentimentLabel,
    targetIdentity: finding.targetIdentity,
    targetName: finding.targetName,
    targetKind: finding.targetKind,
    evidenceModalities: finding.evidenceModalities,
    evidenceText: finding.evidenceText,
    evidenceThemeKeys: finding.evidenceThemeKeys,
    issueClusterIds: [],
    evidenceId: evidenceByTaxonomy.get(finding.evidenceThemeKey)?.id ?? null,
  }))
  const keyFindings = [...issueFindings, ...secondaryFindings]
    .map((finding) => ({ ...finding, evidenceStrength: evidenceStrengthForTier(finding.evidenceTier) }))
    .filter((finding, index, rows) => rows.findIndex((row) => row.title === finding.title) === index)
    .slice(0, 8)
  const whatWorked = findings
    .filter((finding) => finding.kind === 'positive')
    .slice(0, 4)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      statement: finding.description,
      kind: finding.kind,
      classification: finding.classification,
      mentionCount: finding.mentionCount,
      responseCount: finding.evidence.uniqueAnalyzedResponseCount,
      confidence: finding.confidence,
      evidenceTier: finding.evidenceTier,
      evidenceStrength: finding.evidenceStrength,
      sentiment: finding.sentimentLabel,
      targetIdentity: finding.targetIdentity,
      targetName: finding.targetName,
      targetKind: finding.targetKind,
      evidenceModalities: finding.evidenceModalities,
      evidenceText: finding.evidenceText,
      evidenceThemeKeys: finding.evidenceThemeKeys,
      issueClusterIds: [],
    }))
  const friction = [...issueFindings, ...findings
    .filter((finding) => finding.kind === 'risk' && finding.evidenceTier !== 'ISOLATED')
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      statement: finding.description,
      kind: 'friction' as const,
      classification: finding.classification,
      evidenceTier: finding.evidenceTier,
      confidence: finding.confidence,
      mentionCount: finding.mentionCount,
      responseCount: finding.evidence.uniqueAnalyzedResponseCount,
      sentiment: finding.sentimentLabel,
      targetIdentity: finding.targetIdentity,
      targetName: finding.targetName,
      targetKind: finding.targetKind,
      evidenceModalities: finding.evidenceModalities,
      evidenceText: finding.evidenceText,
      evidenceThemeKeys: finding.evidenceThemeKeys,
      issueClusterIds: [],
      evidenceId: evidenceByTaxonomy.get(finding.evidenceThemeKey)?.id ?? null,
    }))]
    .filter((finding, index, rows) => rows.findIndex((row) => row.title === finding.title) === index)
    .slice(0, 4)
  const sentiment = sentimentLabel(input.intelligence.eventPulse.sentimentLabel)
  const supportingEvidence = input.evidence.map((row) => ({
    id: row.id,
    clusterId: row.clusterId,
    title: row.title,
    taxonomyKey: row.taxonomyKey,
    quote: row.transcriptSnippet,
    sentimentScore: row.sentimentScore,
    priority: row.priorityLevel,
      confidence: row.confidence,
    evidenceTier: 'ISOLATED' as EventEvidenceTier,
    evidenceStrength: evidenceStrengthForTier('ISOLATED') as EventIntelligenceEvidenceStrength,
    capturedAt: row.createdAt.toISOString(),
    question: row.question?.label ?? 'Voice response',
    source: row.surveyTarget?.eventStructureItem?.name ?? row.surveyTarget?.name ?? 'Event-wide feedback',
  }))
  const sessionHighlights = input.sessions.sessions
    .filter((session) => session.responseCount > 0)
    .sort((left, right) => right.responseCount - left.responseCount)
    .slice(0, 4)
    .map((session) => ({
      id: session.id,
      title: session.title,
      responseCount: session.responseCount,
      evidenceLabel: session.evidenceLabel,
      evidenceTier: session.evidence?.evidenceTier ?? 'NONE',
      finding: session.findings[0]?.label ?? null,
    }))
  const speakerHighlights = input.speakers.speakers
    .filter((speaker) => speaker.responseCount > 0)
    .sort((left, right) => right.responseCount - left.responseCount)
    .slice(0, 4)
    .map((speaker) => ({
      id: speaker.id,
      name: speaker.name,
      responseCount: speaker.responseCount,
      evidenceLabel: speaker.evidenceLabel,
      evidenceTier: speaker.evidence?.evidenceTier ?? 'NONE',
      finding: speaker.findings[0]?.label ?? null,
    }))

  const draft = {
    lifecyclePhase,
    generatedAt: input.generatedAt.toISOString(),
    event: { id: input.eventId, name: input.intelligence.eventName },
    summary: {
      verdict: '',
      sentiment,
      avgSentiment: input.intelligence.avgSentiment,
      responseCount: factualSnapshot.responseCount,
      answerCount: factualSnapshot.analyzedAnswerCount,
      sentimentPercent: factualSnapshot.sentiment.percent,
      sentimentBreakdown: factualSnapshot.sentiment,
      listeningPointCount: factualSnapshot.coverage.configuredFeedbackPoints,
      representedListeningPointCount: factualSnapshot.coverage.representedFeedbackPoints,
      representedPercent: factualSnapshot.coverage.representedPercent,
    },
    whatWorked,
    friction,
    keyFindings,
    decisions: {
      unresolvedActions,
      afterEventFollowUp,
      nextEventLearning: { actions: nextEventActionLearning, sessionLearning, findings: nextEventFindings },
    },
    sessions: { ...input.sessions.summary, highlights: sessionHighlights },
    speakers: { ...input.speakers.summary, highlights: speakerHighlights },
    intelligencePacket: {
      overview: input.intelligence.eventPulse.summary,
      attendeeQuestions: input.intelligence.attendeeQuestions ?? [],
      sessionPatterns: sessionHighlights,
      speakerPatterns: speakerHighlights,
      eventAreaPatterns: input.intelligence.targetBreakdown.slice(0, 8).map((target) => ({
        name: target.name,
        kind: target.eventStructureItemKind ?? target.category,
        answerCount: target.answerCount,
        sentiment: target.avgSentiment === null ? null : target.avgSentiment > 0.2 ? 'POSITIVE' : target.avgSentiment < -0.2 ? 'NEGATIVE' : 'MIXED',
      })),
      changePatterns: (input.intelligence.structuredMetrics ?? [])
        .filter((metric) => metric.change !== null)
        .slice(0, 8)
        .map((metric) => ({
          question: metric.questionLabel,
          survey: metric.surveyName,
          target: metric.surveyTargetName,
          direction: metric.direction,
          change: metric.change!,
          count: metric.count,
          strength: metric.sampleStrength.label,
        })),
    },
    supportingEvidence,
    links: {
      actions: `/app/events/${encodeURIComponent(input.eventId)}/dashboard?account=${encodeURIComponent(input.accountSlug)}&tab=actions`,
      intelligence: `/app/events/${encodeURIComponent(input.eventId)}/dashboard?account=${encodeURIComponent(input.accountSlug)}&tab=intelligence`,
      sessions: `/app/events/${encodeURIComponent(input.eventId)}/dashboard?account=${encodeURIComponent(input.accountSlug)}&tab=intelligence&intelligenceScope=sessions`,
      speakers: `/app/events/${encodeURIComponent(input.eventId)}/dashboard?account=${encodeURIComponent(input.accountSlug)}&tab=intelligence&intelligenceScope=speakers`,
    },
  }
  const editorialInput = buildEventClosingBriefEditorialInput(draft)
  const editorial = input.editorial ?? buildEventClosingBriefEditorialFallback(editorialInput, input.generatedAt)
  return {
    ...draft,
    versionId: eventBriefVersionId(editorial),
    summary: { ...draft.summary, verdict: editorial.copy.headline },
    editorial,
    shareText: buildEditorialShareText(draft, editorial),
  }
}

export type EventClosingBrief = ReturnType<typeof buildEventClosingBrief>

export function withEventClosingBriefEditorial(
  brief: EventClosingBrief,
  editorial: EventClosingBriefEditorial,
): EventClosingBrief {
  return {
    ...brief,
    versionId: eventBriefVersionId(editorial),
    summary: { ...brief.summary, verdict: editorial.copy.headline },
    editorial,
    shareText: buildEditorialShareText(brief, editorial),
  }
}

export async function getEventClosingBrief(
  input: { accountId: string; accountSlug: string; eventId: string; lifecyclePhase: EventLifecyclePhase; now?: Date; forceEditorialRefresh?: boolean },
  db: ClosingBriefDb = prisma,
): Promise<EventClosingBrief> {
  const totalStartedAt = performance.now()
  const revisionStartedAt = performance.now()
  const sourceHash = await getEventClosingBriefSourceHash(input, db)
  const sourceRevisionMs = elapsed(revisionStartedAt)
  const cacheStartedAt = performance.now()
  if (!input.forceEditorialRefresh) {
    const cached = await db.eventClosingBriefSnapshot.findFirst({
      where: { accountId: input.accountId, eventId: input.eventId, lifecyclePhase: input.lifecyclePhase, sourceHash },
      select: { briefJson: true },
    })
    const cacheLookupMs = elapsed(cacheStartedAt)
    if (isEventClosingBrief(cached?.briefJson)) {
      logClosingBriefTimings(input.eventId, {
        sourceRevisionMs,
        cacheLookupMs,
        aggregationMs: 0,
        synthesisMs: 0,
        persistenceMs: 0,
        totalMs: elapsed(totalStartedAt),
        cacheHit: true,
      })
      return cached.briefJson
    }
  }
  const cacheLookupMs = elapsed(cacheStartedAt)
  const aggregationStartedAt = performance.now()
  const [intelligence, sessions, speakers, actions, issueEvidence] = await Promise.all([
    getEventIntelligenceSummary({ accountSlug: input.accountSlug, eventId: input.eventId, now: input.now, lifecyclePhase: input.lifecyclePhase }, db as typeof prisma),
    getEventSessionIntelligence({ accountId: input.accountId, eventId: input.eventId, lifecyclePhase: input.lifecyclePhase }, db as typeof prisma),
    getEventSpeakerIntelligence({ accountId: input.accountId, eventId: input.eventId, lifecyclePhase: input.lifecyclePhase }, db as typeof prisma),
    listEventActions({ accountId: input.accountId, eventId: input.eventId, lifecyclePhase: input.lifecyclePhase }, db as typeof prisma),
    db.eventIssueEvidence.findMany({
      where: {
        accountId: input.accountId,
        eventId: input.eventId,
        response: { collectionPhase: { in: collectionPhasesForLifecycle(input.lifecyclePhase) } },
        event: { location: { accountId: input.accountId, account: { accountType: 'EVENTS' } } },
      },
      select: {
        id: true, clusterId: true, answerId: true, transcriptSnippet: true, sentimentScore: true, priorityLevel: true, createdAt: true,
        cluster: { select: { title: true, taxonomyKey: true, confidence: true } },
        question: { select: { label: true, type: true } },
        surveyTarget: { select: { name: true, eventStructureItem: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const canonicalEvidenceFindings = intelligence.canonicalFindings ?? buildEventIntelligenceFindings({
    themes: intelligence.topThemes,
    actions: intelligence.topActions,
    targets: intelligence.targetBreakdown,
    issues: intelligence.attentionQueue ?? [],
    context: {
      lifecycle: input.lifecyclePhase,
      eventName: intelligence.eventName,
      eventType: intelligence.eventType,
    },
  })
  const canonicalThemeKeys = Array.from(new Set([
    ...canonicalEvidenceFindings.flatMap((finding) => finding.evidenceThemeKeys),
    ...(intelligence.attentionQueue ?? []).map((issue) => issue.taxonomyKey),
  ].filter(Boolean)))
  const themeEvidence = canonicalThemeKeys.length
    ? await db.answerEventTheme.findMany({
      where: {
        eventId: input.eventId,
        themeKey: { in: canonicalThemeKeys },
        intelligence: { accountId: input.accountId, eventId: input.eventId, response: { collectionPhase: { in: collectionPhasesForLifecycle(input.lifecyclePhase) } } },
      },
      select: {
        id: true,
        themeKey: true,
        label: true,
        confidence: true,
        sentimentLabel: true,
        createdAt: true,
        intelligence: {
          select: {
            answerId: true,
            sentimentScore: true,
            answer: { select: { promptLabel: true, answerTranscript: { select: { text: true } } } },
            question: { select: { label: true, type: true } },
            surveyTarget: { select: { name: true, eventStructureItem: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      // Closing Brief uses at most three excerpts per finding. This bounded
      // read covers the displayed canonical themes without an unbounded scan.
      take: Math.max(80, canonicalThemeKeys.length * 40),
    })
    : []
  const evidenceByThemeAndAnswer = new Map<string, ClosingEvidence>()
  for (const row of issueEvidence) {
    const key = `${row.cluster.taxonomyKey}:${row.answerId}`
    evidenceByThemeAndAnswer.set(key, {
      id: row.id,
      clusterId: row.clusterId,
      title: row.cluster.title,
      taxonomyKey: row.cluster.taxonomyKey,
      transcriptSnippet: row.transcriptSnippet,
      sentimentScore: row.sentimentScore,
      priorityLevel: row.priorityLevel,
      confidence: row.cluster.confidence,
      createdAt: row.createdAt,
      question: row.question,
      surveyTarget: row.surveyTarget,
    })
  }
  for (const row of themeEvidence) {
    const key = `${row.themeKey}:${row.intelligence.answerId}`
    if (evidenceByThemeAndAnswer.has(key)) continue
    const transcriptSnippet = row.intelligence.answer.answerTranscript?.text?.trim()
    if (!transcriptSnippet) continue
    evidenceByThemeAndAnswer.set(key, {
      id: row.id,
      clusterId: null,
      title: row.label,
      taxonomyKey: row.themeKey,
      transcriptSnippet,
      sentimentScore: row.intelligence.sentimentScore,
      priorityLevel: row.sentimentLabel ?? 'Recorded evidence',
      confidence: row.confidence,
      createdAt: row.createdAt,
      question: row.intelligence.question,
      surveyTarget: row.intelligence.surveyTarget,
    })
  }

  const brief = buildEventClosingBrief({
    accountSlug: input.accountSlug,
    eventId: input.eventId,
    intelligence,
    sessions,
    speakers,
    actions,
    evidence: Array.from(evidenceByThemeAndAnswer.values()),
    generatedAt: input.now ?? new Date(),
    lifecyclePhase: input.lifecyclePhase,
  })
  const aggregationMs = elapsed(aggregationStartedAt)
  const synthesisStartedAt = performance.now()
  const editorial = await synthesizeEventClosingBriefEditorial(
    buildEventClosingBriefEditorialInput(brief),
    { forceRefresh: input.forceEditorialRefresh, now: input.now },
  )
  const result = withEventClosingBriefEditorial(brief, editorial)
  const synthesisMs = elapsed(synthesisStartedAt)
  const persistenceStartedAt = performance.now()
  await db.eventClosingBriefSnapshot.upsert({
    where: { eventId_lifecyclePhase: { eventId: input.eventId, lifecyclePhase: input.lifecyclePhase } },
    create: {
      accountId: input.accountId,
      eventId: input.eventId,
      lifecyclePhase: input.lifecyclePhase,
      sourceHash,
      briefHash: result.versionId,
      briefJson: result as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(result.generatedAt),
    },
    update: {
      accountId: input.accountId,
      lifecyclePhase: input.lifecyclePhase,
      sourceHash,
      briefHash: result.versionId,
      briefJson: result as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(result.generatedAt),
    },
  })
  const persistenceMs = elapsed(persistenceStartedAt)
  logClosingBriefTimings(input.eventId, {
    sourceRevisionMs,
    cacheLookupMs,
    aggregationMs,
    synthesisMs,
    persistenceMs,
    totalMs: elapsed(totalStartedAt),
    cacheHit: false,
  })
  return result
}
