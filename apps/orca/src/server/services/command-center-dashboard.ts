import { cache } from "react";
import {
  BudgetLineItemApproval,
  BudgetSubmissionStatus,
  DeadlineStatus,
  DocumentStatus,
  TimelinePriority,
  TimelineStatus,
  UserRole,
} from "@prisma/client";
import {
  selectPortfolioCriticalItems,
  type PortfolioCriticalItemCandidate,
} from "@/lib/account-event-portfolio";
import { resolveActiveEventVisibilityWhere } from "@/lib/events";
import { getPrisma } from "@/lib/prisma";

type CommandCenterDashboardInput = {
  orgId: string;
  appUserId: string;
  role: UserRole;
  today: Date;
  nearFuture: Date;
};

export const getCommandCenterDashboardData = cache(
  async (input: CommandCenterDashboardInput) => {
    const prisma = getPrisma();
    const eventAccessWhere = resolveActiveEventVisibilityWhere({
      userId: input.appUserId,
      role: input.role,
      orgId: input.orgId,
    }).where;
    const deadlineWhere = {
      dueAt: { lte: input.nearFuture },
      status: { in: [DeadlineStatus.OPEN, DeadlineStatus.BLOCKED] },
    };
    const timelineRiskWhere = {
      title: { not: "Event Timeline" },
      disposition: "ACTIVE" as const,
      OR: [
        { status: TimelineStatus.AT_RISK },
        { priority: TimelinePriority.CRITICAL },
        {
          AND: [
            { endDate: { lt: input.today } },
            { status: { not: TimelineStatus.COMPLETE } },
          ],
        },
        {
          AND: [
            { status: { not: TimelineStatus.COMPLETE } },
            {
              successorDependencies: {
                some: {
                  predecessor: { status: { not: TimelineStatus.COMPLETE }, disposition: "ACTIVE" as const },
                },
              },
            },
          ],
        },
      ],
    };

    // ---- C1: per-event risk/deadline counts as DB aggregates, and the two
    // dashboard "top" lists as bounded queries, instead of nesting unbounded
    // deadline/timelineItem arrays under every event and re-filtering/slicing in
    // JS. The predicates below mirror the dashboard page's deadlineTone /
    // timelineRiskTone helpers exactly (see the account-dashboard parity test):
    //
    //   NEAR_DUE_DAYS matches page.tsx; daysFromToday floors to the calendar day,
    //   so "daysUntil <= NEAR_DUE_DAYS" == "dueAt < today + (NEAR_DUE_DAYS + 1)".
    const NEAR_DUE_DAYS = 7;
    const nearDueCutoff = new Date(input.today);
    nearDueCutoff.setDate(nearDueCutoff.getDate() + NEAR_DUE_DAYS + 1);
    const portfolioActionHorizon = new Date(input.today);
    portfolioActionHorizon.setDate(portfolioActionHorizon.getDate() + 10);

    // deadlineTone !== "neutral": BLOCKED, or due within NEAR_DUE_DAYS (overdue
    // included). Scoped to the same deadlineWhere set the dashboard reads.
    const riskyDeadlineCountWhere = {
      event: eventAccessWhere,
      status: { in: [DeadlineStatus.OPEN, DeadlineStatus.BLOCKED] },
      dueAt: { lte: input.nearFuture },
      OR: [
        { status: DeadlineStatus.BLOCKED },
        { dueAt: { lt: nearDueCutoff } },
      ],
    };
    // timelineRiskTone(..., blockedPredecessorCount: 0) !== "neutral": AT_RISK,
    // CRITICAL/HIGH priority, or overdue-incomplete. Intersected with the risk set
    // that the dashboard nests, so blocked-successor-only items (tone neutral) are
    // excluded exactly as the JS filter excludes them.
    const timelineToneWhere = {
      OR: [
        { status: TimelineStatus.AT_RISK },
        { priority: { in: [TimelinePriority.CRITICAL, TimelinePriority.HIGH] } },
        {
          AND: [
            { endDate: { lt: input.today } },
            { status: { not: TimelineStatus.COMPLETE } },
          ],
        },
      ],
    };
    const riskyTimelineCountWhere = {
      event: eventAccessWhere,
      AND: [timelineRiskWhere, timelineToneWhere],
    };
    // Event-snapshot labels: exact "N overdue" / "N at risk" counts.
    const overdueTimelineCountWhere = {
      event: eventAccessWhere,
      title: { not: "Event Timeline" },
      disposition: "ACTIVE" as const,
      endDate: { lt: input.today },
      status: { not: TimelineStatus.COMPLETE },
    };
    const atRiskTimelineCountWhere = {
      event: eventAccessWhere,
      title: { not: "Event Timeline" },
      disposition: "ACTIVE" as const,
      OR: [
        { status: TimelineStatus.AT_RISK },
        { priority: TimelinePriority.CRITICAL },
      ],
    };

    const [
      events,
      topDeadlineRows,
      topTimelineRiskRows,
      riskyDeadlineCountGroups,
      riskyTimelineCountGroups,
      overdueTimelineCountGroups,
      atRiskTimelineCountGroups,
      budgetTotalsGroups,
      budgetCategoryApprovalGroups,
      budgetPendingGroups,
      spentLineItems,
      submittedBudgetSubmissionCounts,
      documentsInReviewCount,
      deadlineTimelineItems,
      portfolioDeadlineCandidates,
      portfolioTimelineCandidates,
    ] = await Promise.all([
        prisma.event.findMany({
          where: eventAccessWhere,
          orderBy: [{ startDate: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
            integrationMetrics: {
              select: {
                currentValue: true,
                goalValue: true,
                pacePercent: true,
              },
              orderBy: { type: "asc" },
            },
            budget: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        }),
        // C1: dashboard "Upcoming deadlines" list — the top-12 nearest deadlines
        // across accessible events, bounded at the DB instead of flat-mapping every
        // event's deadlines and slicing in JS. take:12 is sufficient because the
        // merged list is sliced to 12 and de-dupe never drops a real deadline.
        prisma.deadline.findMany({
          where: { event: eventAccessWhere, ...deadlineWhere },
          orderBy: [{ dueAt: "asc" }, { title: "asc" }],
          take: 12,
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            event: { select: { id: true, name: true } },
          },
        }),
        // C1: dashboard "Timeline risks" list — the top-12 risk items, bounded at
        // the DB. Order mirrors the prior JS sort (endDate asc nulls last, title).
        prisma.timelineItem.findMany({
          where: { event: eventAccessWhere, ...timelineRiskWhere },
          orderBy: [{ endDate: "asc" }, { title: "asc" }],
          take: 12,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            endDate: true,
            event: { select: { id: true, name: true } },
          },
        }),
        // C1: per-event risk/deadline counts as grouped aggregates (exact totals,
        // no row streaming), replacing per-event JS re-filtering of nested arrays.
        prisma.deadline.groupBy({
          by: ["eventId"],
          where: riskyDeadlineCountWhere,
          _count: { _all: true },
        }),
        prisma.timelineItem.groupBy({
          by: ["eventId"],
          where: riskyTimelineCountWhere,
          _count: { _all: true },
        }),
        prisma.timelineItem.groupBy({
          by: ["eventId"],
          where: overdueTimelineCountWhere,
          _count: { _all: true },
        }),
        prisma.timelineItem.groupBy({
          by: ["eventId"],
          where: atRiskTimelineCountWhere,
          _count: { _all: true },
        }),
        // Budget rollups use DB-side aggregates instead of streaming every line
        // item into JS. Per-budget forecast/actual totals via groupBy _sum.
        prisma.budgetLineItem.groupBy({
          by: ["budgetId"],
          where: { budget: { event: eventAccessWhere } },
          _sum: { forecastCents: true, actualCents: true },
        }),
        // Category breakdown over the "actionable" set (pending approval or has
        // actual spend), grouped by category + approval so pending counts fall
        // out of the same query. Matches the prior JS actionable-filter semantics.
        prisma.budgetLineItem.groupBy({
          by: ["category", "approval"],
          where: {
            budget: { event: eventAccessWhere },
            OR: [
              { approval: BudgetLineItemApproval.PENDING },
              { actualCents: { gt: 0 } },
            ],
          },
          _sum: { forecastCents: true, actualCents: true },
          _count: { _all: true },
        }),
        // Pending line-item approvals per budget (org total is summed in JS).
        prisma.budgetLineItem.groupBy({
          by: ["budgetId"],
          where: {
            budget: { event: eventAccessWhere },
            approval: BudgetLineItemApproval.PENDING,
          },
          _count: { _all: true },
        }),
        // Row-level "actual > forecast" cannot be expressed as a Prisma column
        // comparison, so keep a line-item read for over-forecast detection — but
        // bound it to spent items (actualCents > 0). Every over-forecast item has
        // actual > forecast >= 0, so it is necessarily in this set; forecast-only
        // planned rows (often the bulk of a budget) are never loaded.
        prisma.budgetLineItem.findMany({
          where: {
            budget: { event: eventAccessWhere },
            actualCents: { gt: 0 },
          },
          select: { budgetId: true, forecastCents: true, actualCents: true },
        }),
        prisma.budgetSubmission.groupBy({
          by: ["budgetId"],
          where: {
            status: BudgetSubmissionStatus.SUBMITTED,
            budget: {
              event: eventAccessWhere,
            },
          },
          _count: { _all: true },
        }),
        // Portfolio document approvals in review — the account APPROVALS KPI is
        // cross-module, so it must include Docs Hub review items, not just budget.
        prisma.document.count({
          where: {
            status: DocumentStatus.IN_REVIEW,
            event: eventAccessWhere,
          },
        }),
        // Production code does not create Deadline rows; real deadline-like data
        // lives on TimelineItem.endDate. Source incomplete timeline items inside
        // the same lookahead window (overdue + upcoming) as the Deadline query so
        // the account dashboard mirrors the event-level Command Center. Bounded by
        // an ordered take so large orgs do not stream every timeline row.
        prisma.timelineItem.findMany({
          where: {
            event: eventAccessWhere,
            title: { not: "Event Timeline" },
            disposition: "ACTIVE",
            status: { not: TimelineStatus.COMPLETE },
            endDate: { lte: input.nearFuture },
          },
          orderBy: { endDate: "asc" },
          take: 50,
          select: {
            id: true,
            title: true,
            endDate: true,
            event: { select: { id: true, name: true } },
          },
        }),
        // Event Portfolio action candidates: all overdue incomplete deadlines and
        // work due in the next 10 days. Selection is performed deterministically
        // after normalizing Deadline and TimelineItem priority semantics.
        prisma.deadline.findMany({
          where: {
            event: eventAccessWhere,
            status: { in: [DeadlineStatus.OPEN, DeadlineStatus.BLOCKED] },
            dueAt: { lte: portfolioActionHorizon },
          },
          orderBy: [{ dueAt: "asc" }, { title: "asc" }, { id: "asc" }],
          select: {
            id: true,
            eventId: true,
            title: true,
            dueAt: true,
            status: true,
          },
        }),
        prisma.timelineItem.findMany({
          where: {
            event: eventAccessWhere,
            title: { not: "Event Timeline" },
            disposition: "ACTIVE",
            status: { not: TimelineStatus.COMPLETE },
            endDate: { lte: portfolioActionHorizon },
          },
          orderBy: [{ endDate: "asc" }, { title: "asc" }, { id: "asc" }],
          select: {
            id: true,
            eventId: true,
            title: true,
            endDate: true,
            status: true,
            priority: true,
            isCriticalPath: true,
          },
        }),
      ]);

    const portfolioActionCandidates: PortfolioCriticalItemCandidate[] = [
      ...portfolioDeadlineCandidates.map((item) => ({
        id: `deadline-${item.id}`,
        eventId: item.eventId,
        title: item.title,
        dueAt: item.dueAt,
        priority:
          item.status === DeadlineStatus.BLOCKED
            ? ("critical" as const)
            : ("standard" as const),
      })),
      ...portfolioTimelineCandidates.flatMap((item) =>
        item.endDate
          ? [
              {
                id: `timeline-${item.id}`,
                eventId: item.eventId,
                title: item.title,
                dueAt: item.endDate,
                priority:
                  item.status === TimelineStatus.AT_RISK ||
                  item.priority === TimelinePriority.CRITICAL ||
                  item.isCriticalPath
                    ? ("critical" as const)
                    : item.priority === TimelinePriority.HIGH
                      ? ("high" as const)
                      : ("standard" as const),
              },
            ]
          : [],
      ),
    ];
    const overdueActionKeys = new Set<string>();
    for (const item of portfolioActionCandidates) {
      if (item.dueAt >= input.today) continue;
      overdueActionKeys.add(
        `${item.eventId}|${item.title.trim().toLowerCase()}|${item.dueAt.toISOString().slice(0, 10)}`,
      );
    }
    const overdueActionableCount = overdueActionKeys.size;
    const portfolioCriticalItems = selectPortfolioCriticalItems(
      portfolioActionCandidates,
      input.today,
    );

    // Merge Deadline rows with timeline-derived deadlines, preferring real
    // Deadline rows and de-duping when the same logical deadline surfaces from
    // both sources (same event + title + due day).
    type DashboardDeadline = {
      id: string;
      title: string;
      status: DeadlineStatus;
      dueAt: Date;
      event: { id: string; name: string };
    };
    const deadlineDedupeKey = (deadline: DashboardDeadline): string =>
      `${deadline.event.id}|${deadline.title.trim().toLowerCase()}|${deadline.dueAt
        .toISOString()
        .slice(0, 10)}`;
    const deadlineRows: DashboardDeadline[] = topDeadlineRows.map((deadline) => ({
      id: deadline.id,
      title: deadline.title,
      status: deadline.status,
      dueAt: deadline.dueAt,
      event: { id: deadline.event.id, name: deadline.event.name },
    }));
    const timelineDeadlines: DashboardDeadline[] = deadlineTimelineItems.flatMap(
      (item) =>
        item.endDate
          ? [
              {
                id: `timeline-${item.id}`,
                title: item.title,
                status: DeadlineStatus.OPEN,
                dueAt: item.endDate,
                event: { id: item.event.id, name: item.event.name },
              },
            ]
          : [],
    );
    const seenDeadlineKeys = new Set<string>();
    const deadlines = [...deadlineRows, ...timelineDeadlines]
      .filter((deadline) => {
        const key = deadlineDedupeKey(deadline);
        if (seenDeadlineKeys.has(key)) return false;
        seenDeadlineKeys.add(key);
        return true;
      })
      .sort(
        (left, right) =>
          left.dueAt.getTime() - right.dueAt.getTime() ||
          left.title.localeCompare(right.title),
      )
      .slice(0, 12);
    // The DB already returns the ordered top-12 (endDate asc nulls-last, then
    // title), matching the prior JS sort/slice exactly.
    const topTimelineRisks = topTimelineRiskRows;
    // successorDependencies are only needed for the ≤12 displayed timeline risks
    // (to derive blocked-predecessor state), not for the per-event risk counts.
    // Fetch them just for those items instead of loading dependency edges for every
    // risk item across every event.
    const topTimelineRiskIds = topTimelineRisks.map((item) => item.id);
    const riskDependencies = topTimelineRiskIds.length > 0
      ? await prisma.timelineDependency.findMany({
          where: { successorItemId: { in: topTimelineRiskIds } },
          select: { successorItemId: true, predecessor: { select: { status: true } } },
        })
      : [];
    const dependenciesBySuccessorId = new Map<string, { predecessor: { status: TimelineStatus } }[]>();
    for (const dependency of riskDependencies) {
      const list = dependenciesBySuccessorId.get(dependency.successorItemId) ?? [];
      list.push({ predecessor: { status: dependency.predecessor.status } });
      dependenciesBySuccessorId.set(dependency.successorItemId, list);
    }
    const timelineRisks = topTimelineRisks.map((item) => ({
      ...item,
      successorDependencies: dependenciesBySuccessorId.get(item.id) ?? [],
    }));

    // C1: attach the aggregated per-event risk counts so the dashboard page no
    // longer re-filters nested deadline/timelineItem arrays per event. Events with
    // no matching rows are absent from the groupBy and default to 0.
    const countByEventId = (groups: { eventId: string; _count: { _all: number } }[]): Map<string, number> =>
      new Map(groups.map((group) => [group.eventId, group._count._all]));
    const riskyDeadlineByEventId = countByEventId(riskyDeadlineCountGroups);
    const riskyTimelineByEventId = countByEventId(riskyTimelineCountGroups);
    const overdueTimelineByEventId = countByEventId(overdueTimelineCountGroups);
    const atRiskTimelineByEventId = countByEventId(atRiskTimelineCountGroups);
    const eventsWithRiskCounts = events.map((event) => ({
      ...event,
      riskyDeadlineCount: riskyDeadlineByEventId.get(event.id) ?? 0,
      riskyTimelineCount: riskyTimelineByEventId.get(event.id) ?? 0,
      overdueTimelineCount: overdueTimelineByEventId.get(event.id) ?? 0,
      atRiskTimelineCount: atRiskTimelineByEventId.get(event.id) ?? 0,
    }));

    // Per-budget forecast/actual totals (all line items).
    const budgetTotalsByBudgetId = budgetTotalsGroups.map((group) => ({
      budgetId: group.budgetId,
      forecastCents: group._sum.forecastCents ?? 0,
      actualCents: group._sum.actualCents ?? 0,
    }));
    const budgetTotals = budgetTotalsByBudgetId.reduce(
      (totals, group) => ({
        forecastCents: totals.forecastCents + group.forecastCents,
        actualCents: totals.actualCents + group.actualCents,
      }),
      { forecastCents: 0, actualCents: 0 },
    );

    // Category breakdown over the actionable set, collapsing the category+approval
    // buckets. pendingCount is the count of the PENDING bucket per category.
    const budgetCategoryMap = new Map<
      string,
      { category: string; forecastCents: number; actualCents: number; pendingCount: number }
    >();
    for (const group of budgetCategoryApprovalGroups) {
      const existing =
        budgetCategoryMap.get(group.category) ??
        { category: group.category, forecastCents: 0, actualCents: 0, pendingCount: 0 };
      existing.forecastCents += group._sum.forecastCents ?? 0;
      existing.actualCents += group._sum.actualCents ?? 0;
      if (group.approval === BudgetLineItemApproval.PENDING) {
        existing.pendingCount += group._count._all;
      }
      budgetCategoryMap.set(group.category, existing);
    }
    const budgetCategoryBreakdown = Array.from(budgetCategoryMap.values());

    // Pending line-item approvals per budget + org total.
    const budgetPendingByBudgetId = budgetPendingGroups.map((group) => ({
      budgetId: group.budgetId,
      pendingCount: group._count._all,
    }));
    const budgetPendingApprovalCount = budgetPendingByBudgetId.reduce(
      (sum, group) => sum + group.pendingCount,
      0,
    );

    // Over-forecast detection from the bounded spent-items read. The org count
    // uses actual > forecast; the per-budget count additionally requires
    // forecast > 0, matching the prior page semantics exactly.
    let budgetOverForecastOrgCount = 0;
    const budgetOverForecastMap = new Map<string, number>();
    for (const item of spentLineItems) {
      if (item.actualCents > item.forecastCents) {
        budgetOverForecastOrgCount += 1;
        if (item.forecastCents > 0) {
          budgetOverForecastMap.set(
            item.budgetId,
            (budgetOverForecastMap.get(item.budgetId) ?? 0) + 1,
          );
        }
      }
    }
    const budgetOverForecastByBudgetId = Array.from(
      budgetOverForecastMap.entries(),
      ([budgetId, overCount]) => ({ budgetId, overCount }),
    );

    return {
      events: eventsWithRiskCounts,
      deadlines,
      timelineRisks,
      submittedBudgetSubmissionCounts,
      documentsInReviewCount,
      overdueActionableCount,
      budgetTotals,
      budgetTotalsByBudgetId,
      budgetCategoryBreakdown,
      budgetPendingByBudgetId,
      budgetPendingApprovalCount,
      budgetOverForecastByBudgetId,
      budgetOverForecastOrgCount,
      portfolioCriticalItems,
    };
  },
);
