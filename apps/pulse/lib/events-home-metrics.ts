import { prisma } from '@/lib/prisma'
import { isEventsAccount } from '@/lib/account-product-mode'
import {
  EVENT_ISSUE_CLUSTER_STATUSES,
  isActiveEventIssueClusterStatus,
} from '@/lib/event-intelligence/contract'
import {
  computeInferredSatisfaction,
  type InferredSatisfactionSummary,
} from '@/lib/analytics/satisfaction'
import { groupEventsForHome } from '@/lib/events-home-groups'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'

type PrismaLike = typeof prisma

/** Cluster statuses considered "open" / needing action (not RESOLVED / DISMISSED). */
export const OPEN_EVENT_ISSUE_CLUSTER_STATUSES = EVENT_ISSUE_CLUSTER_STATUSES.filter(
  isActiveEventIssueClusterStatus,
)

export interface EventsHomeTopIssue {
  id: string
  title: string
  summary: string | null
  priorityLevel: string
}

/** A preferred, launchable event-wide survey link for token-based kiosk capture. */
export interface EventsHomeLaunchLink {
  token: string
  surveyId: string
  /** Tokenized kiosk path, e.g. `/kiosk?token=<token>`. */
  kioskPath: string
}

function buildKioskTokenPath(token: string): string {
  return `/kiosk?token=${encodeURIComponent(token)}`
}

export interface EventsHomeEventMetric {
  /** Completed responses scoped to this event (all-time). */
  responses: number
  /** Completed responses for this event whose completion falls in today's window. */
  responsesToday: number
  /** Real Survey rows attached to this event (matches the workspace Surveys tab). */
  surveyCount: number
  /** Active, unarchived Survey rows attached to this event. */
  liveSurveyCount: number
  /** Draft, unarchived Survey rows attached to this event. */
  draftSurveyCount: number
  /** Open (NEW / INVESTIGATING / MONITORING) issue clusters for this event. */
  openAttentionCount: number
  /** Inferred satisfaction using the shared definition; null unless computed (live events). */
  satisfaction: InferredSatisfactionSummary | null
  /** Highest-priority open issue cluster for this event, if any. */
  topOpenIssue: EventsHomeTopIssue | null
  /**
   * Preferred launchable event-wide survey link. When present, Home kiosk/QR
   * actions should use its tokenized path so responses are survey-scoped;
   * otherwise callers fall back to the legacy `/kiosk?eventId=` path.
   */
  launch: EventsHomeLaunchLink | null
}

export interface EventsHomeMetricsSummary {
  liveCount: number
  responsesToday: number
  needActionCount: number
}

export interface EventsHomeMetrics {
  summary: EventsHomeMetricsSummary
  events: Record<string, EventsHomeEventMetric>
}

export interface EventsHomeMetricsEventInput {
  id: string
  status: string
  isActive: boolean
  startDate?: string | Date | null
  endDate?: string | Date | null
}

export interface BuildEventsHomeMetricsInput {
  accountId: string
  accountSlug: string
  accountType: string
  events: EventsHomeMetricsEventInput[]
  now?: Date
}

export interface BuildEventsHomeMetricsDeps {
  db?: PrismaLike
}

function priorityLevelRank(priorityLevel: string | null | undefined) {
  if (priorityLevel === 'Immediate') return 0
  if (priorityLevel === 'Soon') return 1
  if (priorityLevel === 'Watch') return 2
  return 3
}

function emptyEventMetric(): EventsHomeEventMetric {
  return {
    responses: 0,
    responsesToday: 0,
    surveyCount: 0,
    liveSurveyCount: 0,
    draftSurveyCount: 0,
    openAttentionCount: 0,
    satisfaction: null,
    topOpenIssue: null,
    launch: null,
  }
}

/** UTC midnight of the given instant — the start of "today" for response windows. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Derive truthful, event-scoped metrics for the Events Home page from canonical
 * server-side data. Responses, survey counts, and open-attention counts come
 * from the canonical Response / Survey / EventIssueCluster tables; satisfaction
 * and the top open issue for live events are derived from the shared event
 * intelligence aggregation so Events Home matches the Command Center exactly.
 */
export async function buildEventsHomeMetrics(
  input: BuildEventsHomeMetricsInput,
  deps: BuildEventsHomeMetricsDeps = {},
): Promise<EventsHomeMetrics> {
  const db = deps.db ?? prisma
  const now = input.now ?? new Date()

  const eventIds = input.events.map((event) => event.id)
  const events: Record<string, EventsHomeEventMetric> = {}
  eventIds.forEach((id) => {
    events[id] = emptyEventMetric()
  })

  const summary: EventsHomeMetricsSummary = {
    liveCount: groupEventsForHome(
      input.events.map((event) => ({
        ...event,
        startDate: event.startDate ?? null,
        endDate: event.endDate ?? null,
      })),
      now,
    ).live.length,
    responsesToday: 0,
    needActionCount: 0,
  }

  if (eventIds.length === 0 || !isEventsAccount(input.accountType)) {
    return { summary, events }
  }

  const todayStart = startOfUtcDay(now)

  const [responseTotals, responseToday, surveyRows, openClusterTotals, preferredLinks] = await Promise.all([
    db.response.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds }, status: 'COMPLETED' },
      _count: { _all: true },
    }),
    db.response.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        status: 'COMPLETED',
        completedAt: { gte: todayStart },
      },
      _count: { _all: true },
    }),
    db.survey.findMany({
      where: {
        eventId: { in: eventIds },
        surveyTarget: { isActive: true },
      },
      select: {
        eventId: true,
        status: true,
        surveyTarget: { select: { metadata: true } },
      },
    }),
    db.eventIssueCluster.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        status: { in: OPEN_EVENT_ISSUE_CLUSTER_STATUSES },
      },
      _count: { _all: true },
    }),
    // Preferred launchable event-wide survey links: an active public link on an
    // active, event-wide (EVENT category) survey. Earliest link wins per event.
    db.publicSurveyLink.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        survey: {
          eventId: { in: eventIds },
          status: 'ACTIVE',
        },
        AND: [{
          OR: [
            { surveyTarget: { category: 'EVENT' } },
            { surveyTargetId: null, survey: { surveyTarget: { category: 'EVENT' } } },
          ],
        }],
      },
      select: {
        token: true,
        surveyId: true,
        survey: { select: { eventId: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const applyCount = (
    rows: Array<{ eventId: string; _count: { _all: number } }>,
    assign: (metric: EventsHomeEventMetric, count: number) => void,
  ) => {
    for (const row of rows) {
      const metric = events[row.eventId]
      if (metric) assign(metric, row._count._all)
    }
  }

  applyCount(responseTotals as never, (metric, count) => {
    metric.responses = count
  })
  applyCount(responseToday as never, (metric, count) => {
    metric.responsesToday = count
  })
  for (const row of surveyRows) {
    if (!isPlannerManagedSurveyTarget(row.surveyTarget)) continue
    const metric = events[row.eventId]
    if (!metric) continue
    metric.surveyCount += 1
    if (row.status === 'ACTIVE') {
      metric.liveSurveyCount += 1
    } else if (row.status === 'DRAFT') {
      metric.draftSurveyCount += 1
    }
  }
  applyCount(openClusterTotals as never, (metric, count) => {
    metric.openAttentionCount = count
  })

  // Attach the preferred launchable event-wide link (earliest wins per event).
  for (const link of preferredLinks as Array<{
    token: string
    surveyId: string
    survey: { eventId: string }
  }>) {
    const metric = events[link.survey.eventId]
    if (metric && !metric.launch) {
      metric.launch = {
        token: link.token,
        surveyId: link.surveyId,
        kioskPath: buildKioskTokenPath(link.token),
      }
    }
  }

  // Home only renders satisfaction buckets and the highest-priority open issue.
  // Query those aggregates directly instead of loading the full Signals payload
  // (answers, responses, surveys, targets, themes, evidence, and actions).
  const liveEvents = groupEventsForHome(
    input.events.map((event) => ({
      ...event,
      startDate: event.startDate ?? null,
      endDate: event.endDate ?? null,
    })),
    now,
  ).live
  await Promise.all(
    liveEvents.map(async (event) => {
      const metric = events[event.id]
      if (!metric) return
      try {
        const [sentimentGroups, openIssues] = await Promise.all([
          db.answerEventIntelligence.groupBy({
            by: ['questionId'],
            where: {
              accountId: input.accountId,
              eventId: event.id,
              sentimentScore: { not: null },
              response: { eventId: event.id, status: 'COMPLETED' },
            },
            _count: { _all: true },
            _avg: { sentimentScore: true },
          }),
          db.eventIssueCluster.findMany({
            where: {
              accountId: input.accountId,
              eventId: event.id,
              status: { in: OPEN_EVENT_ISSUE_CLUSTER_STATUSES },
            },
            select: {
              id: true,
              title: true,
              summary: true,
              priorityLevel: true,
              impactScore: true,
              timeSensitivityScore: true,
              lastSeenAt: true,
            },
          }),
        ])
        metric.satisfaction = computeInferredSatisfaction(
          sentimentGroups.flatMap((group) => group._avg.sentimentScore == null
            ? []
            : [{ count: group._count._all, sentimentScore: group._avg.sentimentScore }]),
        )
        const topOpen = openIssues.sort((a, b) =>
          priorityLevelRank(a.priorityLevel) - priorityLevelRank(b.priorityLevel)
          || (b.timeSensitivityScore ?? 0) - (a.timeSensitivityScore ?? 0)
          || (b.impactScore ?? 0) - (a.impactScore ?? 0)
          || b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
        )[0]
        metric.topOpenIssue = topOpen
          ? {
              id: topOpen.id,
              title: topOpen.title,
              summary: topOpen.summary,
              priorityLevel: topOpen.priorityLevel,
            }
          : null
      } catch (error) {
        // Intelligence is a best-effort enrichment; a failure here must not break
        // the whole Home payload. Counts above already reflect real data.
        console.error('[events-home-metrics] intelligence enrichment failed:', error)
      }
    }),
  )

  summary.responsesToday = Object.values(events).reduce(
    (sum, metric) => sum + metric.responsesToday,
    0,
  )
  summary.needActionCount = liveEvents.reduce(
    (sum, event) => sum + (events[event.id]?.openAttentionCount ?? 0),
    0,
  )

  return { summary, events }
}
