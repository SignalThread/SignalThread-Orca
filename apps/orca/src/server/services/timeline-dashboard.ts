import {
  TimelinePlanningStage,
  TimelinePriority,
  TimelineItemDisposition,
  TimelineStatus,
  TimelineWorkstream,
  UserRole,
} from "@prisma/client";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { calculateTimelineCompletion } from "@/lib/timeline/completion";
import { serializeTimelineDateOnly } from "@/lib/timeline/date-normalization";
import {
  PLANNING_STAGE_LABELS,
  TIMELINE_PLANNING_STAGES,
  TIMELINE_WORKSTREAMS,
  WORKSTREAM_THEME,
  getWorkstreamDisplayKey,
  getWorkstreamLabel,
  getWorkstreamTheme,
  normalizeWorkstreamLabel,
  workstreamLabelKey,
} from "@/lib/timeline/taxonomy";

export class TimelineDashboardError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type RequestUserContext = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

/** Normalized item shape consumed by the pure dashboard builder. */
export type DashboardItemInput = {
  id: string;
  title: string;
  department: string | null;
  workstream: TimelineWorkstream | null;
  planningStage: TimelinePlanningStage | null;
  status: TimelineStatus;
  priority: TimelinePriority;
  isCriticalPath: boolean;
  startDate: Date | null;
  endDate: Date | null;
  parentId: string | null;
  ownerUser: { id: string; name: string | null; email: string } | null;
  disposition?: TimelineItemDisposition;
};

export type DashboardDependencyInput = {
  predecessorItemId: string;
  successorItemId: string;
};

export type StageStatus = "COMPLETE" | "AHEAD" | "IN_PROGRESS" | "UPCOMING" | "AT_RISK";

export type TimelineStageRollup = {
  stage: TimelinePlanningStage;
  label: string;
  totalItems: number;
  completeItems: number;
  inProgressItems: number;
  atRiskItems: number;
  percentComplete: number;
  status: StageStatus;
  startDate: string | null;
  nextDate: string | null;
};

export type WorkstreamKey = string;

export type TimelineOwnerSummary = {
  id: string;
  name: string;
  openItems: number;
};

export type TimelineReadinessItem = {
  id: string;
  title: string;
  status: TimelineStatus;
  planningStage: TimelinePlanningStage | null;
  dueDate: string | null;
};

export type TimelineKeyDate = {
  id: string;
  title: string;
  date: string;
  status: TimelineStatus;
};

export type BlockerReason =
  | "DEPENDENCY_BLOCKED"
  | "OVERDUE"
  | "AT_RISK"
  | "APPROACHING_DEADLINE"
  | "EVENT_APPROACHING"
  | "CRITICAL_PATH";

export type TimelineBlocker = {
  id: string;
  title: string;
  workstream: WorkstreamKey;
  workstreamLabel: string;
  reason: BlockerReason;
  kind: "BLOCKER" | "AT_RISK";
  severity: "HIGH" | "MEDIUM";
  dueDate: string | null;
  explanation: string;
  relatedItemId: string | null;
  relatedItemTitle: string | null;
};

export type TimelineWorkstreamRollup = {
  workstream: WorkstreamKey;
  label: string;
  theme: { badge: string; bar: string; dot: string };
  totalItems: number;
  completeItems: number;
  openItems: number;
  atRiskItems: number;
  blockerItems: number;
  percentComplete: number;
  owners: TimelineOwnerSummary[];
  keyDates: TimelineKeyDate[];
  readiness: TimelineReadinessItem[];
  blockers: TimelineBlocker[];
  recentActivity: never[];
  recentActivityAvailable: false;
};

export type TimelineUpcomingDate = {
  id: string;
  title: string;
  date: string;
  status: TimelineStatus;
  workstream: WorkstreamKey;
  workstreamLabel: string;
};

export type TimelineHealthDriver = {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
};

export type TimelineHealth = {
  score: number;
  label: "Good" | "Fair" | "At Risk";
  drivers: TimelineHealthDriver[];
};

export type EventTimelineDashboard = {
  event: { id: string; name: string; startDate: string | null; endDate: string | null };
  generatedAt: string;
  totals: {
    totalItems: number;
    completeItems: number;
    openItems: number;
    percentComplete: number;
    criticalPathItems: number;
    blockerCount: number;
    unassignedWorkstreamItems: number;
  };
  stages: TimelineStageRollup[];
  workstreams: TimelineWorkstreamRollup[];
  selectedWorkstream: TimelineWorkstreamRollup | null;
  upcomingDates: TimelineUpcomingDate[];
  blockers: TimelineBlocker[];
  health: TimelineHealth;
};

function toDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function toIsoDate(value: Date | null): string | null {
  return serializeTimelineDateOnly(value);
}

function isEventRootItem(item: { title: string; parentId: string | null }): boolean {
  return item.parentId === null && item.title.trim().toLowerCase() === "event timeline";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Canonical workstream bucket for an item: prefer the explicit column, then fall back to legacy department. */
function workstreamKeyForItem(item: DashboardItemInput): WorkstreamKey {
  return getWorkstreamDisplayKey(item.workstream ?? item.department) ?? "UNASSIGNED";
}

function isCanonicalWorkstreamKey(key: WorkstreamKey): key is TimelineWorkstream {
  return TIMELINE_WORKSTREAMS.includes(key as TimelineWorkstream);
}

function workstreamLabelForKey(key: WorkstreamKey): string {
  return key === "UNASSIGNED" ? "Unassigned" : getWorkstreamLabel(key);
}

function workstreamThemeForKey(key: WorkstreamKey): { badge: string; bar: string; dot: string } {
  if (key === "UNASSIGNED") return getWorkstreamTheme(null);
  return isCanonicalWorkstreamKey(key) ? WORKSTREAM_THEME[key] : getWorkstreamTheme(key);
}

function isOverdue(item: DashboardItemInput, today: Date): boolean {
  if (item.status === TimelineStatus.COMPLETE) return false;
  if (!item.endDate) return false;
  return toDateOnly(item.endDate).getTime() < today.getTime();
}

function isAtRisk(item: DashboardItemInput): boolean {
  return item.status === TimelineStatus.AT_RISK;
}

const APPROACHING_DEADLINE_DAYS = 7;
const APPROACHING_EVENT_DAYS = 14;

function daysFromToday(value: Date, today: Date): number {
  return Math.round((toDateOnly(value).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export type DashboardBuildInput = {
  event: { id: string; name: string; startDate: Date | null; endDate: Date | null };
  items: DashboardItemInput[];
  dependencies: DashboardDependencyInput[];
  now?: Date;
  selectedWorkstream?: string | null;
};

/**
 * Pure dashboard builder. All rollups, blockers, and the health score are
 * derived here so they can be unit tested without a database, and so there is a
 * single canonical computation path shared by every client view.
 */
export function buildTimelineDashboard(input: DashboardBuildInput): EventTimelineDashboard {
  const now = input.now ?? new Date();
  const today = toDateOnly(now);

  // Root "Event Timeline" container item is structural, not a real work item.
  const items = input.items.filter((item) => !isEventRootItem(item) && item.disposition !== TimelineItemDisposition.NOT_NEEDED);
  const statusById = new Map(items.map((item) => [item.id, item.status]));
  const customWorkstreamKeyByLabel = new Map<string, WorkstreamKey>();
  for (const item of items) {
    const key = displayWorkstreamKeyForItem(item);
    if (key === "UNASSIGNED" || isCanonicalWorkstreamKey(key)) continue;
    const label = normalizeWorkstreamLabel(key);
    const labelKey = workstreamLabelKey(label);
    if (!customWorkstreamKeyByLabel.has(labelKey)) {
      customWorkstreamKeyByLabel.set(labelKey, label);
    }
  }

  function displayWorkstreamKeyForItem(item: DashboardItemInput): WorkstreamKey {
    const key = workstreamKeyForItem(item);
    if (key === "UNASSIGNED" || isCanonicalWorkstreamKey(key)) return key;
    return customWorkstreamKeyByLabel.get(workstreamLabelKey(key)) ?? normalizeWorkstreamLabel(key);
  }

  // Dependency-blocked: an item whose predecessor is not COMPLETE.
  const blockedItemIds = new Set<string>();
  for (const dep of input.dependencies) {
    const predecessorStatus = statusById.get(dep.predecessorItemId);
    if (!predecessorStatus) continue;
    if (!statusById.has(dep.successorItemId)) continue;
    if (predecessorStatus !== TimelineStatus.COMPLETE) {
      blockedItemIds.add(dep.successorItemId);
    }
  }

  const overdueItems = items.filter((item) => isOverdue(item, today));
  const atRiskItems = items.filter(isAtRisk);
  const approachingDeadlineItems = items.filter((item) => {
    if (item.status === TimelineStatus.COMPLETE || !item.endDate) return false;
    const days = daysFromToday(item.endDate, today);
    return days >= 0 && days <= APPROACHING_DEADLINE_DAYS;
  });
  const eventDaysAway = input.event.startDate ? daysFromToday(input.event.startDate, today) : null;
  const eventIsApproaching = eventDaysAway !== null && eventDaysAway >= 0 && eventDaysAway <= APPROACHING_EVENT_DAYS;
  const eventApproachingItems = eventIsApproaching
    ? items.filter((item) => item.status !== TimelineStatus.COMPLETE && !item.endDate)
    : [];
  const incompleteCriticalPath = items.filter(
    (item) => item.isCriticalPath && item.status !== TimelineStatus.COMPLETE,
  );
  const dependencyBlockedItems = items.filter((item) => blockedItemIds.has(item.id));

  // ---- Blockers (top risks) ----
  const blockerReasonRank: Record<BlockerReason, number> = {
    DEPENDENCY_BLOCKED: 0,
    OVERDUE: 1,
    AT_RISK: 2,
    APPROACHING_DEADLINE: 3,
    EVENT_APPROACHING: 4,
    CRITICAL_PATH: 5,
  };

  const itemById = new Map(items.map((item) => [item.id, item]));
  const blockingPredecessorBySuccessor = new Map<string, DashboardItemInput>();
  for (const dependency of input.dependencies) {
    const predecessor = itemById.get(dependency.predecessorItemId);
    if (!predecessor || predecessor.status === TimelineStatus.COMPLETE) continue;
    if (!blockingPredecessorBySuccessor.has(dependency.successorItemId)) {
      blockingPredecessorBySuccessor.set(dependency.successorItemId, predecessor);
    }
  }

  const blockerByItem = new Map<string, TimelineBlocker>();
  function registerBlocker(item: DashboardItemInput, reason: BlockerReason) {
    const key = displayWorkstreamKeyForItem(item);
    const existing = blockerByItem.get(item.id);
    const predecessor = reason === "DEPENDENCY_BLOCKED" ? blockingPredecessorBySuccessor.get(item.id) ?? null : null;
    const dueDate = toIsoDate(item.endDate);
    const explanation = reason === "DEPENDENCY_BLOCKED"
      ? `Blocked until prerequisite “${predecessor?.title ?? "Unknown prerequisite"}” is complete.`
      : reason === "OVERDUE"
        ? `Incomplete and overdue${dueDate ? ` since ${dueDate}` : ""}.`
        : reason === "AT_RISK"
          ? "Explicitly marked at risk and still incomplete."
          : reason === "APPROACHING_DEADLINE"
            ? `Incomplete with a due date ${daysFromToday(item.endDate!, today)} day${daysFromToday(item.endDate!, today) === 1 ? "" : "s"} away.`
            : reason === "EVENT_APPROACHING"
              ? `Incomplete with no due date while the event starts in ${eventDaysAway} day${eventDaysAway === 1 ? "" : "s"}.`
              : "Critical-path work remains incomplete.";
    const candidate: TimelineBlocker = {
      id: item.id,
      title: item.title,
      workstream: key,
      workstreamLabel: workstreamLabelForKey(key),
      reason,
      kind: reason === "DEPENDENCY_BLOCKED" ? "BLOCKER" : "AT_RISK",
      severity:
        reason === "DEPENDENCY_BLOCKED" || reason === "OVERDUE" || item.isCriticalPath || item.priority === TimelinePriority.CRITICAL
          ? "HIGH"
          : "MEDIUM",
      dueDate,
      explanation,
      relatedItemId: predecessor?.id ?? null,
      relatedItemTitle: predecessor?.title ?? null,
    };
    if (!existing || blockerReasonRank[reason] < blockerReasonRank[existing.reason]) {
      blockerByItem.set(item.id, { ...candidate, severity: existing ? maxSeverity(existing.severity, candidate.severity) : candidate.severity });
    }
  }
  function maxSeverity(a: "HIGH" | "MEDIUM", b: "HIGH" | "MEDIUM"): "HIGH" | "MEDIUM" {
    return a === "HIGH" || b === "HIGH" ? "HIGH" : "MEDIUM";
  }

  for (const item of overdueItems) registerBlocker(item, "OVERDUE");
  for (const item of atRiskItems) registerBlocker(item, "AT_RISK");
  for (const item of dependencyBlockedItems) registerBlocker(item, "DEPENDENCY_BLOCKED");
  for (const item of approachingDeadlineItems) registerBlocker(item, "APPROACHING_DEADLINE");
  for (const item of eventApproachingItems) registerBlocker(item, "EVENT_APPROACHING");
  for (const item of incompleteCriticalPath) {
    if (blockedItemIds.has(item.id) || isOverdue(item, today) || isAtRisk(item)) {
      registerBlocker(item, "CRITICAL_PATH");
    }
  }

  const blockers = [...blockerByItem.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "HIGH" ? -1 : 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });

  // ---- Stage rollups ----
  const stages: TimelineStageRollup[] = TIMELINE_PLANNING_STAGES.map((stage) => {
    const stageItems = items.filter((item) => item.planningStage === stage);
    const completion = calculateTimelineCompletion(stageItems);
    const total = completion.totalItems;
    const complete = completion.completeItems;
    const inProgress = stageItems.filter((i) => i.status === TimelineStatus.IN_PROGRESS).length;
    const atRisk = stageItems.filter(
      (i) => isAtRisk(i) || isOverdue(i, today),
    ).length;
    const pct = completion.percentComplete;

    const starts = stageItems
      .map((i) => i.startDate)
      .filter((d): d is Date => Boolean(d))
      .map((d) => toDateOnly(d).getTime());
    const ends = stageItems
      .map((i) => i.endDate)
      .filter((d): d is Date => Boolean(d))
      .map((d) => toDateOnly(d).getTime());
    const earliestStart = starts.length ? new Date(Math.min(...starts)) : null;
    const latestEnd = ends.length ? new Date(Math.max(...ends)) : null;

    const nextUpcoming = stageItems
      .filter((i) => i.status !== TimelineStatus.COMPLETE && i.endDate && toDateOnly(i.endDate).getTime() >= today.getTime())
      .map((i) => i.endDate as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    let status: StageStatus;
    if (total === 0) {
      status = "UPCOMING";
    } else if (pct === 100) {
      status = "COMPLETE";
    } else if (atRisk > 0) {
      status = "AT_RISK";
    } else if (earliestStart && earliestStart.getTime() > today.getTime()) {
      status = "UPCOMING";
    } else {
      // schedule-aware "ahead": progress outrunning elapsed time in the window
      const timeProgress =
        earliestStart && latestEnd && latestEnd.getTime() > earliestStart.getTime()
          ? clamp(
              ((today.getTime() - earliestStart.getTime()) /
                (latestEnd.getTime() - earliestStart.getTime())) *
                100,
              0,
              100,
            )
          : 0;
      status = pct >= timeProgress + 10 ? "AHEAD" : "IN_PROGRESS";
    }

    return {
      stage,
      label: PLANNING_STAGE_LABELS[stage],
      totalItems: total,
      completeItems: complete,
      inProgressItems: inProgress,
      atRiskItems: atRisk,
      percentComplete: pct,
      status,
      startDate: toIsoDate(earliestStart),
      nextDate: toIsoDate(nextUpcoming),
    };
  });

  // ---- Workstream rollups ----
  const itemsByWorkstream = new Map<WorkstreamKey, DashboardItemInput[]>();
  for (const item of items) {
    const key = displayWorkstreamKeyForItem(item);
    const list = itemsByWorkstream.get(key) ?? [];
    list.push(item);
    itemsByWorkstream.set(key, list);
  }

  function buildWorkstreamRollup(key: WorkstreamKey, wsItems: DashboardItemInput[]): TimelineWorkstreamRollup {
    const completion = calculateTimelineCompletion(wsItems);
    const total = completion.totalItems;
    const complete = completion.completeItems;
    const open = total - complete;
    const atRisk = wsItems.filter((i) => isAtRisk(i) || isOverdue(i, today)).length;
    const wsBlockers = blockers.filter((b) => b.workstream === key);

    const ownerMap = new Map<string, TimelineOwnerSummary>();
    for (const item of wsItems) {
      if (!item.ownerUser) continue;
      const name = item.ownerUser.name?.trim() || item.ownerUser.email;
      const entry = ownerMap.get(item.ownerUser.id) ?? { id: item.ownerUser.id, name, openItems: 0 };
      if (item.status !== TimelineStatus.COMPLETE) entry.openItems += 1;
      ownerMap.set(item.ownerUser.id, entry);
    }

    const keyDates: TimelineKeyDate[] = wsItems
      .filter((i) => i.endDate)
      .sort((a, b) => (a.endDate as Date).getTime() - (b.endDate as Date).getTime())
      .slice(0, 6)
      .map((i) => ({
        id: i.id,
        title: i.title,
        date: toIsoDate(i.endDate) as string,
        status: i.status,
      }));

    const readiness: TimelineReadinessItem[] = [...wsItems]
      .sort((a, b) => {
        const order = (i: DashboardItemInput) =>
          i.status === TimelineStatus.COMPLETE ? 1 : 0;
        if (order(a) !== order(b)) return order(a) - order(b);
        return a.title.localeCompare(b.title);
      })
      .slice(0, 8)
      .map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        planningStage: i.planningStage,
        dueDate: toIsoDate(i.endDate),
      }));

    return {
      workstream: key,
      label: workstreamLabelForKey(key),
      theme: workstreamThemeForKey(key),
      totalItems: total,
      completeItems: complete,
      openItems: open,
      atRiskItems: atRisk,
      blockerItems: wsBlockers.length,
      percentComplete: completion.percentComplete,
      owners: [...ownerMap.values()].sort((a, b) => b.openItems - a.openItems || a.name.localeCompare(b.name)),
      keyDates,
      readiness,
      blockers: wsBlockers,
      recentActivity: [],
      recentActivityAvailable: false,
    };
  }

  // Dashboard workstream cards represent real named workstreams only, including
  // custom free-text workstream labels stored on legacy department.
  const customWorkstreamKeys = Array.from(itemsByWorkstream.keys())
    .filter((key) => key !== "UNASSIGNED" && !isCanonicalWorkstreamKey(key))
    .sort((left, right) => workstreamLabelForKey(left).localeCompare(workstreamLabelForKey(right)));
  const workstreams: TimelineWorkstreamRollup[] = [
    ...TIMELINE_WORKSTREAMS.map((ws) => buildWorkstreamRollup(ws, itemsByWorkstream.get(ws) ?? [])),
    ...customWorkstreamKeys.map((key) => buildWorkstreamRollup(key, itemsByWorkstream.get(key) ?? [])),
  ].filter((workstream) => workstream.totalItems > 0);
  const unassignedItems = itemsByWorkstream.get("UNASSIGNED") ?? [];

  // ---- Selected workstream ----
  let selectedWorkstream: TimelineWorkstreamRollup | null = null;
  const requested = input.selectedWorkstream?.trim();
  if (requested) {
    const requestedKey = workstreamLabelKey(requested);
    selectedWorkstream =
      workstreams.find((w) => w.workstream === requested || workstreamLabelKey(w.workstream) === requestedKey) ??
      null;
  }
  if (!selectedWorkstream) {
    selectedWorkstream =
      workstreams.find((w) => w.blockerItems > 0 && w.totalItems > 0) ??
      workstreams.find((w) => w.totalItems > 0) ??
      workstreams[0] ??
      null;
  }

  // ---- Upcoming dates ----
  const upcomingDates: TimelineUpcomingDate[] = items
    .filter(
      (item) =>
        item.status !== TimelineStatus.COMPLETE &&
        item.endDate &&
        toDateOnly(item.endDate).getTime() >= today.getTime(),
    )
    .sort((a, b) => (a.endDate as Date).getTime() - (b.endDate as Date).getTime())
    .slice(0, 8)
    .map((item) => {
      const key = displayWorkstreamKeyForItem(item);
      return {
        id: item.id,
        title: item.title,
        date: toIsoDate(item.endDate) as string,
        status: item.status,
        workstream: key,
        workstreamLabel: workstreamLabelForKey(key),
      };
    });

  // ---- Totals ----
  const completion = calculateTimelineCompletion(items);
  const totalItems = completion.totalItems;
  const completeItems = completion.completeItems;
  const criticalPathItems = items.filter((i) => i.isCriticalPath).length;
  const overallPct = completion.percentComplete;

  // ---- Health score (simple + explainable) ----
  const overduePenalty = Math.min(overdueItems.length * 8, 40);
  const atRiskPenalty = Math.min(atRiskItems.length * 6, 30);
  const blockerPenalty = Math.min(dependencyBlockedItems.length * 5, 25);
  const criticalPenalty = Math.min(incompleteCriticalPath.length * 4, 20);
  const completionBonus = totalItems > 0 && overallPct >= 80 ? 5 : 0;
  const score = clamp(
    100 - overduePenalty - atRiskPenalty - blockerPenalty - criticalPenalty + completionBonus,
    0,
    100,
  );

  const drivers: TimelineHealthDriver[] = [];
  if (overdueItems.length > 0) {
    drivers.push({
      label: "Overdue items",
      detail: `${overdueItems.length} past due (-${overduePenalty})`,
      tone: "negative",
    });
  }
  if (atRiskItems.length > 0) {
    drivers.push({
      label: "At-risk items",
      detail: `${atRiskItems.length} flagged at risk (-${atRiskPenalty})`,
      tone: "negative",
    });
  }
  if (dependencyBlockedItems.length > 0) {
    drivers.push({
      label: "Blocked by dependencies",
      detail: `${dependencyBlockedItems.length} waiting on predecessors (-${blockerPenalty})`,
      tone: "negative",
    });
  }
  if (incompleteCriticalPath.length > 0) {
    drivers.push({
      label: "Critical path open",
      detail: `${incompleteCriticalPath.length} critical-path items incomplete (-${criticalPenalty})`,
      tone: "negative",
    });
  }
  if (completionBonus > 0) {
    drivers.push({
      label: "Strong completion",
      detail: `${overallPct}% of items complete (+${completionBonus})`,
      tone: "positive",
    });
  }
  if (drivers.length === 0) {
    drivers.push({
      label: "On track",
      detail: totalItems > 0 ? "No overdue, at-risk, or blocked items" : "No timeline items yet",
      tone: totalItems > 0 ? "positive" : "neutral",
    });
  }

  const healthLabel: TimelineHealth["label"] = score >= 75 ? "Good" : score >= 50 ? "Fair" : "At Risk";

  return {
    event: {
      id: input.event.id,
      name: input.event.name,
      startDate: toIsoDate(input.event.startDate),
      endDate: toIsoDate(input.event.endDate),
    },
    generatedAt: now.toISOString(),
    totals: {
      totalItems,
      completeItems,
      openItems: totalItems - completeItems,
      percentComplete: overallPct,
      criticalPathItems,
      blockerCount: blockers.length,
      unassignedWorkstreamItems: unassignedItems.length,
    },
    stages,
    workstreams,
    selectedWorkstream,
    upcomingDates,
    blockers,
    health: { score, label: healthLabel, drivers },
  };
}

/**
 * Canonical server-side Timeline Dashboard payload for an event. Enforces
 * event access, reads only canonical TimelineItem/TimelineDependency data, and
 * delegates all derivation to {@link buildTimelineDashboard}.
 */
export async function getEventTimelineDashboard(
  eventId: string,
  user: RequestUserContext,
  options?: { selectedWorkstream?: string | null; now?: Date },
): Promise<EventTimelineDashboard> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new TimelineDashboardError(error.message, error.status);
    }
    throw error;
  }

  const prisma = getPrisma();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  if (!event) {
    throw new TimelineDashboardError("Event not found", 404);
  }

  const [items, dependencies] = await Promise.all([
    prisma.timelineItem.findMany({
      where: { eventId },
      select: {
        id: true,
        title: true,
        department: true,
        workstream: true,
        planningStage: true,
        status: true,
        priority: true,
        isCriticalPath: true,
        startDate: true,
        endDate: true,
        parentId: true,
        disposition: true,
        ownerUser: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.timelineDependency.findMany({
      where: { eventId },
      select: { predecessorItemId: true, successorItemId: true },
    }),
  ]);

  return buildTimelineDashboard({
    event,
    items,
    dependencies,
    now: options?.now,
    selectedWorkstream: options?.selectedWorkstream ?? null,
  });
}
