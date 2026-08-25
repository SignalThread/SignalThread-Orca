import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Flag,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  BudgetLineItemApproval,
  BudgetSubmissionStatus,
  DeadlineStatus,
  DocumentStatus,
  TimelinePriority,
  TimelineStatus,
  type EventStatus,
} from "@prisma/client";
import { FEATURES } from "@/config/features";
import {
  accountActionCenterHref,
  commandCenterRoadmapRecordHref,
  roadmapItemHref,
} from "@/lib/event-command-center-links";
import { resolveActiveEventVisibilityWhere } from "@/lib/events";
import { getEventLifecycleLabel } from "@/lib/event-lifecycle";
import { getPrisma } from "@/lib/prisma";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import { ActionCenterQueue, type ActionCenterQueueItem, type ActionView } from "./ActionCenterQueue";
import styles from "./action-center.module.css";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEADLINE_LOOKAHEAD_DAYS = 45;
// C3: bound the deadline-queue reads. The Deadlines view merges real Deadline rows
// with timeline-derived deadlines; both sources share this ordered take so neither
// can stream unbounded rows.
const DEADLINE_QUEUE_LIMIT = 50;

type RiskTone = "critical" | "warning" | "stable" | "neutral";
type ActionItem = {
  id: string;
  sourceId: string;
  viewType: ActionView;
  eventId: string;
  eventName: string;
  eventStartDate: Date;
  eventEndDate: Date | null;
  eventStatus: EventStatus;
  title: string;
  rawTitle: string | null;
  type: string;
  context: string;
  assigneeName: string | null;
  categoryLabel: string;
  statusLabel: string;
  dueDateLabel: string | null;
  overdueDays: number | null;
  priority: "critical" | "high" | "medium" | "low" | null;
  tone: RiskTone;
  href: string;
  icon: LucideIcon;
};

const VIEWS: Array<{ id: ActionView; label: string }> = [
  { id: "risks", label: "Risks" },
  { id: "approvals", label: "Approvals" },
  { id: "deadlines", label: "Deadlines" },
  ...(FEATURES.ENABLE_GENERIC_TASKING_UI ? [{ id: "tasks" as const, label: "Tasks" }] : []),
  { id: "budget", label: "Budget" },
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysFromToday(value: Date, today: Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / MS_PER_DAY);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Unscheduled";
  return dateFormatter.format(value);
}

function formatOwner(user: { name: string | null; email: string } | null | undefined): string {
  return user?.name?.trim() || user?.email || "Unassigned";
}

function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deadlineTone(status: DeadlineStatus, dueAt: Date, today: Date): RiskTone {
  if (status === DeadlineStatus.BLOCKED) return "critical";
  if (daysFromToday(dueAt, today) < 0) return "critical";
  return "warning";
}

function dueLabel(value: Date, today: Date): string {
  const days = daysFromToday(value, today);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}

function timelineRiskTone(input: {
  status: TimelineStatus;
  priority: TimelinePriority;
  endDate: Date | null;
  blockedPredecessorCount: number;
}, today: Date): RiskTone {
  if (input.status === TimelineStatus.COMPLETE) return "stable";
  if (input.blockedPredecessorCount > 0) return "critical";
  if (input.endDate && daysFromToday(input.endDate, today) < 0) return "critical";
  if (input.status === TimelineStatus.AT_RISK || input.priority === TimelinePriority.CRITICAL) return "warning";
  if (input.priority === TimelinePriority.HIGH) return "warning";
  return "neutral";
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function emptyMessage(view: ActionView): string {
  if (view === "approvals") return "No pending approvals across visible events.";
  if (view === "deadlines") return "No open or blocked deadlines in the current lookahead window.";
  if (view === "tasks") return "No timeline task risks need attention.";
  if (view === "budget") return "No budget exposure items are available for this portfolio view.";
  return "No portfolio risks need attention.";
}

function normalizeView(value: string | string[] | undefined): ActionView {
  const view = Array.isArray(value) ? value[0] : value;
  if (view === "tasks" && FEATURES.ENABLE_GENERIC_TASKING_UI) {
    return view;
  }
  if (view === "approvals" || view === "deadlines" || view === "budget" || view === "risks") {
    return view;
  }
  return "risks";
}

function normalizeTitle(value: string | null | undefined, fallback: string): { title: string; needsTitle: boolean; rawTitle: string | null } {
  const rawTitle = typeof value === "string" ? value.trim() : "";
  if (!rawTitle) {
    return { title: fallback, needsTitle: true, rawTitle: null };
  }
  if (rawTitle.toLowerCase() === "new task") {
    return { title: "Untitled task", needsTitle: true, rawTitle };
  }
  return { title: rawTitle, needsTitle: false, rawTitle };
}

function priorityFromTone(tone: RiskTone): ActionCenterQueueItem["priority"] {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "high";
  return null;
}

function withFocus(href: string, sourceId: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}focus=${encodeURIComponent(sourceId)}`;
}

type DeadlineFilter = "overdue" | null;

function normalizeDeadlineFilter(value: string | string[] | undefined): DeadlineFilter {
  const filter = Array.isArray(value) ? value[0] : value;
  return filter === "overdue" ? "overdue" : null;
}

function toQueueItem(item: ActionItem): ActionCenterQueueItem {
  const eventDateLabel = `${formatDate(item.eventStartDate)}${item.eventEndDate ? ` - ${formatDate(item.eventEndDate)}` : ""}`;
  const needsTitle = item.rawTitle === null || item.title === "Untitled task" || item.title === "Task missing title";
  return {
    id: item.id,
    type: item.viewType,
    sourceId: item.sourceId,
    eventId: item.eventId,
    eventName: item.eventName,
    eventDateLabel,
    eventStatusLabel: getEventLifecycleLabel(item.eventStatus),
    title: item.title,
    rawTitle: item.rawTitle,
    itemTypeLabel: item.type,
    context: item.context,
    assigneeName: item.assigneeName,
    priority: item.priority,
    severity: priorityFromTone(item.tone),
    statusLabel: item.statusLabel,
    categoryLabel: item.categoryLabel,
    dueDateLabel: item.dueDateLabel,
    overdueDays: item.overdueDays,
    href: item.href,
    tone: item.tone,
    needsTitle,
  };
}

export default async function ActionCenterPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string | string[]; filter?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedView = normalizeView(resolvedSearchParams.view);
  const deadlineFilter = selectedView === "deadlines" ? normalizeDeadlineFilter(resolvedSearchParams.filter) : null;
  const authContext = await ensureProvisionedUserAndContext();
  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  if (authContext.status !== "OK") {
    return (
      <section className={styles.unavailablePanel}>
        <h2 className={styles.unavailableTitle}>Action Center unavailable</h2>
        <p className={styles.unavailableText}>Select an organization context to view portfolio actions.</p>
      </section>
    );
  }

  const prisma = getPrisma();
  const today = startOfToday();
  const nearFuture = addDays(today, DEADLINE_LOOKAHEAD_DAYS);
  const eventAccessWhere = resolveActiveEventVisibilityWhere({
    userId: authContext.appUserId!,
    role: authContext.role!,
    orgId: authContext.activeOrgId,
  }).where;

  // Dashboard reads do not require a transaction; Promise.all avoids P2028 transaction startup failures with the single-connection pg adapter pool.
  const [deadlines, deadlineTimelineItems, timelineItems, budgetLineItems, submittedBudgetSubmissions, documentsInReview] = await Promise.all([
    prisma.deadline.findMany({
      where: {
        dueAt: { lte: nearFuture },
        status: { in: [DeadlineStatus.OPEN, DeadlineStatus.BLOCKED] },
        event: eventAccessWhere,
      },
      // Bounded (C3), nearest-due first. Real Deadline rows are not created in
      // production (deadline data lives on TimelineItem.endDate), so this cap is a
      // safe defensive ceiling with no realistic effect on the Deadlines view.
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: DEADLINE_QUEUE_LIMIT,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        dueAt: true,
        event: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
        ownerUser: { select: { name: true, email: true } },
      },
    }),
    // Production code does not create Deadline rows; real deadline-like data lives
    // on TimelineItem.endDate. Source incomplete timeline items within the same
    // lookahead window so the Deadlines view is not falsely empty.
    prisma.timelineItem.findMany({
      where: {
        title: { not: "Event Timeline" },
        event: eventAccessWhere,
        status: { not: TimelineStatus.COMPLETE },
        endDate: { lte: nearFuture },
      },
      orderBy: [{ endDate: "asc" }, { updatedAt: "desc" }],
      take: DEADLINE_QUEUE_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        endDate: true,
        event: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
        ownerUser: { select: { name: true, email: true } },
      },
    }),
    // C3 note: this risk queue is intentionally NOT `take`-bounded. Its final
    // ordering/selection is a JS-computed risk tone + blocked-predecessor count
    // (see timelineRiskTone below) that Prisma `orderBy` cannot express, so a
    // `take` on endDate could drop the highest-ranked risks. Bounding safely would
    // require a load-more/true-count UI — deferred. Correctness kept over capping.
    prisma.timelineItem.findMany({
      where: {
        title: { not: "Event Timeline" },
        event: eventAccessWhere,
        OR: [
          { status: TimelineStatus.AT_RISK },
          { priority: { in: [TimelinePriority.CRITICAL, TimelinePriority.HIGH] } },
          {
            AND: [
              { endDate: { lt: today } },
              { status: { not: TimelineStatus.COMPLETE } },
            ],
          },
          {
            AND: [
              { status: { not: TimelineStatus.COMPLETE } },
              {
                successorDependencies: {
                  some: {
                    predecessor: { status: { not: TimelineStatus.COMPLETE } },
                  },
                },
              },
            ],
          },
        ],
      },
      orderBy: [{ endDate: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        endDate: true,
        event: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
        ownerUser: { select: { name: true, email: true } },
        successorDependencies: {
          select: {
            predecessor: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    }),
    // C3 note: intentionally NOT `take`-bounded. This one read feeds three views
    // whose ordering is a cross-field comparison Prisma cannot express — over-
    // forecast and variance rank by `actualCents - forecastCents`, and Prisma
    // supports neither a column-to-column `where` (`actual > forecast`) nor an
    // orderBy on their difference. A `take` on updatedAt would drop the largest-
    // variance rows. Correctness kept over capping (deferred: precomputed variance).
    prisma.budgetLineItem.findMany({
      where: {
        budget: {
          event: eventAccessWhere,
        },
        OR: [
          { approval: BudgetLineItemApproval.PENDING },
          { actualCents: { gt: 0 } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        lineItem: true,
        category: true,
        forecastCents: true,
        actualCents: true,
        approval: true,
        status: true,
        budget: {
          select: {
            event: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
            status: true,
          },
        },
      },
    }),
    // C3 note: intentionally NOT `take`-bounded. Both approval queues (submissions
    // here + documents below) feed the Approvals view, whose count is contracted to
    // match the account APPROVALS KPI (a separate true count). A `take` would make
    // the drill-down under-report vs the KPI. Bounding safely needs a true-count /
    // load-more UI — deferred.
    prisma.budgetSubmission.findMany({
      where: {
        status: BudgetSubmissionStatus.SUBMITTED,
        budget: {
          event: eventAccessWhere,
        },
      },
      orderBy: [{ submittedAt: "asc" }],
      select: {
        id: true,
        submittedAt: true,
        budget: {
          select: {
            event: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
          },
        },
        submittedByUser: { select: { name: true, email: true } },
        lineItems: {
          select: {
            budgetLineItem: {
              select: {
                lineItem: true,
              },
            },
          },
          take: 3,
        },
      },
    }),
    // Portfolio documents awaiting review — cross-module approvals surface so the
    // account APPROVALS KPI count matches this drill-down view.
    prisma.document.findMany({
      where: {
        status: DocumentStatus.IN_REVIEW,
        event: eventAccessWhere,
      },
      orderBy: [{ updatedAt: "asc" }],
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { name: true } },
        event: { select: { id: true, name: true, startDate: true, endDate: true, status: true } },
      },
    }),
  ]);

  const deadlineItems: ActionItem[] = deadlines.map((deadline) => {
    const title = normalizeTitle(deadline.title, "Untitled deadline");
    const tone = deadlineTone(deadline.status, deadline.dueAt, today);
    const daysUntil = daysFromToday(deadline.dueAt, today);
    const assigneeName = formatOwner(deadline.ownerUser);
    return {
      id: `deadline-${deadline.id}`,
      sourceId: deadline.id,
      viewType: "deadlines",
      eventId: deadline.event.id,
      eventName: deadline.event.name,
      eventStartDate: deadline.event.startDate,
      eventEndDate: deadline.event.endDate,
      eventStatus: deadline.event.status,
      title: title.title,
      rawTitle: title.rawTitle,
      type: deadline.status === DeadlineStatus.BLOCKED ? "Blocked deadline" : "Deadline",
      context: `${humanizeStatus(deadline.category)} - ${assigneeName} - ${dueLabel(deadline.dueAt, today)}`,
      assigneeName: assigneeName === "Unassigned" ? null : assigneeName,
      categoryLabel: humanizeStatus(deadline.category),
      statusLabel: humanizeStatus(deadline.status),
      dueDateLabel: dueLabel(deadline.dueAt, today),
      overdueDays: daysUntil < 0 ? Math.abs(daysUntil) : null,
      priority: tone === "critical" ? "critical" : "high",
      tone,
      href: commandCenterRoadmapRecordHref(deadline.event.id, `deadline-${deadline.id}`),
      icon: tone === "critical" ? ShieldAlert : Clock3,
    };
  });

  // Timeline items with an end date in the lookahead window are the real source
  // of deadline-like data. Surface them in the Deadlines view (deduped against
  // any Deadline rows sharing the same event + title + due day). These are only
  // folded into the Deadlines view — overdue timeline items already appear in the
  // Risks view via taskItems, so they are intentionally not re-added there.
  const deadlineDedupeKeys = new Set(
    deadlines.map(
      (deadline) =>
        `${deadline.event.id}|${deadline.title.trim().toLowerCase()}|${deadline.dueAt.toISOString().slice(0, 10)}`,
    ),
  );
  const timelineDeadlineItems: ActionItem[] = deadlineTimelineItems.flatMap((item) => {
    if (!item.endDate) return [];
    const key = `${item.event.id}|${item.title.trim().toLowerCase()}|${item.endDate.toISOString().slice(0, 10)}`;
    if (deadlineDedupeKeys.has(key)) return [];
    deadlineDedupeKeys.add(key);
    const title = normalizeTitle(item.title, "Untitled deadline");
    const isOverdue = daysFromToday(item.endDate, today) < 0;
    const tone: RiskTone = isOverdue ? "critical" : "warning";
    const daysUntil = daysFromToday(item.endDate, today);
    const assigneeName = formatOwner(item.ownerUser);
    return [{
      id: `timeline-deadline-${item.id}`,
      sourceId: item.id,
      viewType: "deadlines" as const,
      eventId: item.event.id,
      eventName: item.event.name,
      eventStartDate: item.event.startDate,
      eventEndDate: item.event.endDate,
      eventStatus: item.event.status,
      title: title.title,
      rawTitle: title.rawTitle,
      type: isOverdue ? "Overdue deadline" : "Timeline deadline",
      context: `${humanizeStatus(item.status)} - ${assigneeName} - ${dueLabel(item.endDate, today)}`,
      assigneeName: assigneeName === "Unassigned" ? null : assigneeName,
      categoryLabel: "Timeline",
      statusLabel: humanizeStatus(item.status),
      dueDateLabel: dueLabel(item.endDate, today),
      overdueDays: daysUntil < 0 ? Math.abs(daysUntil) : null,
      priority: tone === "critical" ? "critical" : "high",
      tone,
      href: roadmapItemHref({ eventId: item.event.id, itemId: item.id }),
      icon: tone === "critical" ? ShieldAlert : Clock3,
    }];
  });

  const taskItems: ActionItem[] = timelineItems.map((item) => {
    const blockedCount = item.successorDependencies.filter((dependency) => dependency.predecessor.status !== TimelineStatus.COMPLETE).length;
    const tone = timelineRiskTone({
      status: item.status,
      priority: item.priority,
      endDate: item.endDate,
      blockedPredecessorCount: blockedCount,
    }, today);
    const isOverdue = item.endDate ? daysFromToday(item.endDate, today) < 0 : false;
    const title = normalizeTitle(item.title, "Task missing title");
    const assigneeName = formatOwner(item.ownerUser);
    const dueDateLabel = item.endDate ? dueLabel(item.endDate, today) : null;

    return {
      id: `task-${item.id}`,
      sourceId: item.id,
      viewType: "tasks",
      eventId: item.event.id,
      eventName: item.event.name,
      eventStartDate: item.event.startDate,
      eventEndDate: item.event.endDate,
      eventStatus: item.event.status,
      title: title.title,
      rawTitle: title.rawTitle,
      type: blockedCount > 0 ? "Dependency risk" : isOverdue ? "Overdue task" : humanizeStatus(item.priority),
      context: `${assigneeName} - ${blockedCount > 0 ? `${blockedCount} dependency blocker${blockedCount === 1 ? "" : "s"}` : dueDateLabel ?? humanizeStatus(item.status)}`,
      assigneeName: assigneeName === "Unassigned" ? null : assigneeName,
      categoryLabel: humanizeStatus(item.priority),
      statusLabel: humanizeStatus(item.status),
      dueDateLabel,
      overdueDays: item.endDate && daysFromToday(item.endDate, today) < 0 ? Math.abs(daysFromToday(item.endDate, today)) : null,
      priority: item.priority === TimelinePriority.CRITICAL ? "critical" : item.priority === TimelinePriority.HIGH ? "high" : null,
      tone,
      href: roadmapItemHref({ eventId: item.event.id, itemId: item.id }),
      icon: tone === "critical" ? AlertTriangle : Flag,
    };
  });

  const overForecastItems: ActionItem[] = budgetLineItems
    .filter((item) => item.actualCents > item.forecastCents)
    .sort((left, right) => (right.actualCents - right.forecastCents) - (left.actualCents - left.forecastCents))
    .flatMap((item) => {
      const event = item.budget?.event;
      if (!event) return [];
      const title = normalizeTitle(item.lineItem, "Untitled budget item");
      return [{
        id: `budget-${item.id}`,
        sourceId: item.id,
        viewType: "budget",
        eventId: event.id,
        eventName: event.name,
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        eventStatus: event.status,
        title: title.title,
        rawTitle: title.rawTitle,
        type: "Over forecast",
        context: `${item.category || "Uncategorized"} - ${moneyFormatter.format(item.actualCents - item.forecastCents)} over forecast`,
        assigneeName: null,
        categoryLabel: item.category || "Uncategorized",
        statusLabel: humanizeStatus(item.status),
        dueDateLabel: null,
        overdueDays: null,
        priority: "critical" as const,
        tone: "critical" as const,
        href: withFocus(`/events/${event.id}/budget`, item.id),
        icon: CircleDollarSign,
      }];
    });

  const varianceItems: ActionItem[] = budgetLineItems
    .filter((item) => item.actualCents !== item.forecastCents || item.actualCents > item.forecastCents)
    .sort((left, right) => Math.abs(right.actualCents - right.forecastCents) - Math.abs(left.actualCents - left.forecastCents))
    .flatMap((item) => {
      const event = item.budget?.event;
      if (!event) return [];
      const title = normalizeTitle(item.lineItem, "Untitled budget item");
      const tone = item.actualCents > item.forecastCents ? "critical" as const : "warning" as const;
      return [{
        id: `variance-${item.id}`,
        sourceId: item.id,
        viewType: "budget",
        eventId: event.id,
        eventName: event.name,
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        eventStatus: event.status,
        title: title.title,
        rawTitle: title.rawTitle,
        type: item.actualCents > item.forecastCents ? "Over forecast" : "Budget variance",
        context: `${item.category || "Uncategorized"} - Forecast ${moneyFormatter.format(item.forecastCents)} / Actual ${moneyFormatter.format(item.actualCents)}`,
        assigneeName: null,
        categoryLabel: item.category || "Uncategorized",
        statusLabel: humanizeStatus(item.status),
        dueDateLabel: null,
        overdueDays: null,
        priority: tone === "critical" ? "critical" : "high",
        tone,
        href: withFocus(`/events/${event.id}/budget`, item.id),
        icon: CircleDollarSign,
      }];
    });

  const pendingLineItemApprovals: ActionItem[] = budgetLineItems
    .filter((item) => item.approval === BudgetLineItemApproval.PENDING)
    .flatMap((item) => {
      const event = item.budget?.event;
      if (!event) return [];
      const title = normalizeTitle(item.lineItem, "Untitled approval item");
      return [{
        id: `approval-line-${item.id}`,
        sourceId: item.id,
        viewType: "approvals",
        eventId: event.id,
        eventName: event.name,
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        eventStatus: event.status,
        title: title.title,
        rawTitle: title.rawTitle,
        type: "Line item approval",
        context: `${item.category || "Uncategorized"} - ${humanizeStatus(item.status)}`,
        assigneeName: null,
        categoryLabel: item.category || "Uncategorized",
        statusLabel: humanizeStatus(item.status),
        dueDateLabel: null,
        overdueDays: null,
        priority: "high" as const,
        tone: "warning" as const,
        href: withFocus(`/events/${event.id}/budget`, item.id),
        icon: CheckCircle2,
      }];
    });

  const submittedApprovals: ActionItem[] = submittedBudgetSubmissions.flatMap((submission) => {
    const event = submission.budget?.event;
    if (!event) return [];
    const assigneeName = formatOwner(submission.submittedByUser);
    return [{
      id: `approval-submission-${submission.id}`,
      sourceId: submission.id,
      viewType: "approvals",
      eventId: event.id,
      eventName: event.name,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      eventStatus: event.status,
      title: submission.lineItems.map((item) => item.budgetLineItem.lineItem).filter(Boolean).join(", ") || "Budget submission",
      rawTitle: null,
      type: "Budget submission",
      context: `Submitted by ${assigneeName} - ${formatDate(submission.submittedAt)}`,
      assigneeName: assigneeName === "Unassigned" ? null : assigneeName,
      categoryLabel: "Budget submission",
      statusLabel: "Submitted",
      dueDateLabel: formatDate(submission.submittedAt),
      overdueDays: null,
      priority: "high" as const,
      tone: "warning" as const,
      href: withFocus(`/events/${event.id}/budget`, submission.id),
      icon: ListChecks,
    }];
  });

  const documentReviewApprovals: ActionItem[] = documentsInReview.map((document) => {
    const event = document.event;
    const title = normalizeTitle(document.title, "Untitled document");
    return {
      id: `approval-document-${document.id}`,
      sourceId: document.id,
      viewType: "approvals" as const,
      eventId: event.id,
      eventName: event.name,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      eventStatus: event.status,
      title: title.title,
      rawTitle: title.rawTitle,
      type: "Document review",
      context: `${document.category?.name ?? "Docs Hub"} - Updated ${formatDate(document.updatedAt)}`,
      assigneeName: null,
      categoryLabel: document.category?.name ?? "Document",
      statusLabel: "In review",
      dueDateLabel: null,
      overdueDays: null,
      priority: "high" as const,
      tone: "warning" as const,
      href: withFocus(`/events/${event.id}/docs`, document.id),
      icon: CheckCircle2,
    };
  });

  const riskItems = [
    ...deadlineItems.filter((item) => item.tone === "critical"),
    ...taskItems.filter((item) => item.tone === "critical" || item.tone === "warning"),
    ...overForecastItems,
    ...pendingLineItemApprovals.filter((item) => item.tone === "critical"),
  ].sort((left, right) => {
    const toneRank = (tone: RiskTone) => tone === "critical" ? 0 : tone === "warning" ? 1 : 2;
    return toneRank(left.tone) - toneRank(right.tone) || left.eventStartDate.getTime() - right.eventStartDate.getTime();
  });

  const itemsByView: Record<ActionView, ActionItem[]> = {
    risks: riskItems,
    approvals: [...pendingLineItemApprovals, ...submittedApprovals, ...documentReviewApprovals],
    deadlines: [...deadlineItems, ...timelineDeadlineItems].sort(
      (left, right) =>
        (left.overdueDays === null ? 1 : 0) - (right.overdueDays === null ? 1 : 0) ||
        left.eventStartDate.getTime() - right.eventStartDate.getTime(),
    ),
    tasks: taskItems,
    budget: varianceItems,
  };
  const selectedItems = selectedView === "deadlines" && deadlineFilter === "overdue"
    ? itemsByView.deadlines.filter((item) => typeof item.overdueDays === "number" && item.overdueDays > 0)
    : itemsByView[selectedView];
  const queueItems = selectedItems.map(toQueueItem);
  const affectedEventCount = new Set(selectedItems.map((item) => item.eventId)).size;
  const criticalCount = selectedItems.filter((item) => item.tone === "critical").length;
  const overdueCount = selectedItems.filter((item) => item.context.toLowerCase().includes("overdue")).length;
  return (
    <div className={styles.actionCenterPage}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.backLink}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Command Center
        </Link>
        <div className={styles.headerRow}>
          <div className="min-w-0">
            <h1 className={styles.title}>Needs Attention</h1>
            <p className={styles.subtitle}>
              Cross-event risks, approvals, deadlines, and budget exposure.
            </p>
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Action Center views">
        {VIEWS.map((view) => {
          const isActive = view.id === selectedView;
          return (
            <Link
              key={view.id}
              href={accountActionCenterHref({ view: view.id })}
              className={cx(styles.tab, isActive && styles.tabActive)}
              aria-current={isActive ? "page" : undefined}
            >
              {view.label}
            </Link>
          );
        })}
      </nav>

      <ActionCenterQueue
        selectedView={selectedView}
        items={queueItems}
        totalItems={selectedItems.length}
        affectedEventCount={affectedEventCount}
        criticalCount={criticalCount}
        overdueCount={overdueCount}
        emptyMessage={emptyMessage(selectedView)}
        initialSummaryFilter={deadlineFilter === "overdue" ? "overdue" : "all"}
      />
    </div>
  );
}
