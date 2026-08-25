import {
  DeadlineCategory,
  DeadlineStatus,
  BudgetSubmissionStatus,
  DocumentStatus,
  EventIntegrationMetricType,
  MealPeriod,
  TimelinePriority,
  TimelineStatus,
  TimelineItemDisposition,
  type UserRole,
} from "@prisma/client";
import {
  eventBudgetHref,
  eventAttendeesHref,
  eventDocsHref,
  eventFnbCatalogHref,
  eventRunOfShowHref,
  eventSettingsHref,
  eventSpeakersHref,
  eventStaffingHref,
  eventTimelineHref,
} from "@/lib/event-command-center-links";

// Meal periods that indicate a session actually expects F&B service. NONE (and a
// null mealPeriod) means the session has no food demand, so it is excluded.
const FNB_DEMAND_MEAL_PERIODS: MealPeriod[] = [
  MealPeriod.BREAKFAST,
  MealPeriod.BREAK,
  MealPeriod.LUNCH,
  MealPeriod.RECEPTION,
  MealPeriod.DINNER,
  MealPeriod.OTHER,
];
import { EventAccessError, assertEventAccessForUser } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { calculateTimelineCompletion } from "@/lib/timeline/completion";
import { classifyApprovalUrgency, getEventReadinessSnapshot, type EventReadinessSnapshot } from "@/lib/event-readiness";
import { buildExecutiveBriefing, type ExecutiveBriefing } from "@/lib/executive-briefing";
import { getEventTerminology } from "@/lib/orca-terminology";

export type EventPhase = "planning" | "preEvent" | "onsite";

export type NotificationItem = {
  id: string;
  type: "deadline" | "approval" | "risk" | "opportunity" | "budget";
  title: string;
  description?: string;
  severity: "high" | "medium" | "low";
  dueDate?: string;
};

export type ActivityItem = {
  id: string;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
};

export type DeadlineItem = {
  id: string;
  title: string;
  eventDate: string;
  status: "upcoming" | "overdue" | "completed";
  daysRemaining: number;
  category: "housing" | "f&b" | "registration" | "sponsor" | "content" | "av" | "other";
};

export type RoadmapProgressItem = {
  id: string;
  title: string;
  dueDate: string | null;
  daysRemaining: number | null;
  status: TimelineStatus;
};

export type RoadmapProgressOverview = {
  totalTasks: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  atRisk: number;
  percentComplete: number;
  upcomingItems: RoadmapProgressItem[];
};

export type ConflictItem = {
  id: string;
  title: string;
  detail: string;
  dueLabel: string;
  tone: "critical" | "warning" | "neutral";
  source?: string;
  href?: string;
};

export type PlannerFocusItem = {
  id: string;
  title: string;
  source: string;
  urgency: string;
  reason: string;
  tone: "critical" | "warning" | "neutral";
  href: string;
};

export type OperationalReadinessCategory = {
  id: "registration" | "housing" | "budget" | "approvals" | "speakerDeliverables";
  label: string;
  status: "critical" | "warning" | "stable";
  statusLabel: "Critical" | "Needs Review" | "On Track";
  detail: string;
  href: string;
};

export type ApprovalItem = {
  id: string;
  title: string;
  category: "budgetChange" | "creative" | "contract" | "sponsorship" | "content" | "other";
  submittedBy: string;
  submittedDate: string;
  dueDate: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  urgency: "overdue" | "dueSoon" | "risk" | "pending";
  owner: string;
  reasonCode: string;
  href: string;
};

export type FinancialOverview = {
  forecast: number;
  actual: number;
  variance: number;
  varianceStatus: "under" | "over" | "onTrack";
  categories: {
    name: string;
    actual: number;
    forecast: number;
    variance: number;
    status: "under" | "over" | "onTrack";
  }[];
};

export type RegistrationOverview = {
  hasData: boolean;
  current: number;
  target: number;
  paceStatus: "ahead" | "behind" | "onTrack";
  trend: { date: string; actual: number; target: number }[];
};

export type HousingOverview = {
  hasData: boolean;
  current: number;
  target: number;
  pickupPercentage: number;
  attritionExposure: number;
  subBlocks: {
    name: string;
    pickupPercentage: number;
    roomsRemaining: number;
  }[];
  cutoffDate: string;
};

export type SponsorOverview = {
  hasData: boolean;
  revenue: number;
  target: number;
  deliveriesPending: number;
  activeSponsors: number;
};

export type SpeakerOverview = {
  totalSpeakers: number;
  tasksPending: number;
  travelStatus: { confirmed: number; pending: number; declined: number };
  sessionStatus: { confirmed: number; pending: number; canceled: number };
  /** Counts of speakers with each deliverable on file (out of totalSpeakers). */
  deliverables: { bioReceived: number; headshotReceived: number; slidesReceived: number };
};

/** Distinct sessions covered by each setup requirement (out of totalSessions). */
export type SessionReadinessOverview = {
  totalSessions: number;
  roomsAssigned: number;
  avAssigned: number;
  fnbSelected: number;
  speakersAssigned: number;
  staffingAssigned: number;
};

export type OperationOverview = {
  fnbStatus: { completed: number; pending: number; overdue: number; hasData?: boolean };
  staffingStatus: { confirmed: number; pending: number; missing: number; hasData?: boolean };
  /** Staff assignment counts grouped by their free-text role/area label. */
  staffingByRole: { role: string; count: number }[];
  avStatus: { items: number; issues: number; hasData?: boolean };
  roomStatus: { set: number; pending: number; conflicts: number };
  runOfShow?: {
    hasData: boolean;
    totalSegments: number;
    nextSegment: { id: string; title: string; date: string; startTime: string | null } | null;
  };
};

export type RunOfShowReadinessOverview = {
  hasData: boolean;
  totalSessions: number;
  status: "critical" | "warning" | "stable";
  statusLabel: "Critical" | "Needs Review" | "On Track";
  metrics: {
    id: "times" | "rooms" | "speakers" | "av" | "fnb" | "staffing";
    label: string;
    ready: number;
    missing: number;
    total: number;
    href: string;
  }[];
  gaps: {
    id: string;
    title: string;
    detail: string;
    tone: "critical" | "warning" | "neutral";
    href: string;
  }[];
};

/**
 * Run of Show readiness gaps, shared by Planner Focus, the Open Conflicts widget, and the
 * Run of Show readiness scorecard. Pure so the count-first copy contract can be tested
 * without a database.
 */
export function buildRunOfShowGapCandidates(input: {
  eventId: string;
  missingTimeCount: number;
  missingRoomCount: number;
  missingSpeakerSessionCount: number;
  missingAvSessionCount: number;
  fnbPendingSessionCount: number;
  missingStaffSessionCount: number;
  runOfShowHref: string;
  fnbPlannerHref: string;
  staffingHref: string;
}): RunOfShowReadinessOverview["gaps"] {
  const {
    eventId,
    missingTimeCount,
    missingRoomCount,
    missingSpeakerSessionCount,
    missingAvSessionCount,
    fnbPendingSessionCount,
    missingStaffSessionCount,
    runOfShowHref,
    fnbPlannerHref,
    staffingHref,
  } = input;
  // Planner Focus is read count-first: the quantity and subject must survive truncation, so the
  // title carries "<n> sessions without AV" and `detail` explains the next action instead of
  // repeating the number.
  return ([
    missingTimeCount > 0
      ? {
          id: `ros-times-${eventId}`,
          title: `${missingTimeCount.toLocaleString()} session${missingTimeCount === 1 ? "" : "s"} without valid times`,
          detail: "Set a start and end time before the schedule can be validated.",
          tone: "critical" as const,
          href: runOfShowHref,
        }
      : null,
    missingRoomCount > 0
      ? {
          id: `ros-rooms-${eventId}`,
          title: `${missingRoomCount.toLocaleString()} session${missingRoomCount === 1 ? "" : "s"} without a room`,
          detail: "Assign a room so capacity and conflict checks can run.",
          tone: "critical" as const,
          href: runOfShowHref,
        }
      : null,
    missingSpeakerSessionCount > 0
      ? {
          id: `ros-speakers-${eventId}`,
          title: `${missingSpeakerSessionCount.toLocaleString()} session${missingSpeakerSessionCount === 1 ? "" : "s"} without speakers`,
          detail: "Assign speakers from the event speaker directory.",
          tone: "warning" as const,
          href: runOfShowHref,
        }
      : null,
    missingAvSessionCount > 0
      ? {
          id: `ros-av-${eventId}`,
          title: `${missingAvSessionCount.toLocaleString()} session${missingAvSessionCount === 1 ? "" : "s"} without AV`,
          detail: "Select AV requirements for each session that needs tech.",
          tone: "warning" as const,
          href: runOfShowHref,
        }
      : null,
    fnbPendingSessionCount > 0
      ? {
          id: `ros-fnb-${eventId}`,
          title: `${fnbPendingSessionCount.toLocaleString()} food-service session${fnbPendingSessionCount === 1 ? "" : "s"} without coverage`,
          detail: "Assign catalog items to the functions serving food or beverage.",
          tone: "warning" as const,
          href: fnbPlannerHref,
        }
      : null,
    missingStaffSessionCount > 0
      ? {
          id: `ros-staffing-${eventId}`,
          title: `${missingStaffSessionCount.toLocaleString()} session${missingStaffSessionCount === 1 ? "" : "s"} without staffing`,
          detail: "Assign crew from the event directory.",
          tone: "warning" as const,
          href: staffingHref,
        }
      : null,
  ] satisfies Array<RunOfShowReadinessOverview["gaps"][number] | null>).reduce<RunOfShowReadinessOverview["gaps"]>(
    (acc, gap) => {
      if (gap) acc.push(gap);
      return acc;
    },
    [],
  );

}

export type EventCommandCenterEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  daysToEvent: number;
  timing?: {
    value: string;
    detail: string;
    state: "future" | "active" | "ended";
  };
  phase: EventPhase;
  status: string;
  timezone: string;
  venue: string;
  KPIs: {
    /** @deprecated Loose aggregate of heterogeneous signals. Use `blockers` for
     * the component breakdown; retained as `blockers.total` for compatibility. */
    conflicts: number;
    /** Operational blockers broken down by source so the number is not presented
     * as one precise "conflict" type. total === conflicts. */
    blockers: {
      total: number;
      unplacedSessions: number;
      atRiskTimelineItems: number;
      speakersNeedingInfo: number;
    };
    approvals: number;
    overdueItems: number;
    budgetStatus: {
      variance: number;
      statusLabel: string;
    };
  };
  notifications: NotificationItem[];
  plannerFocus: PlannerFocusItem[];
  conflicts: ConflictItem[];
  activity: ActivityItem[];
  deadlines: DeadlineItem[];
  roadmapProgress: RoadmapProgressOverview;
  approvals: ApprovalItem[];
  financial: FinancialOverview;
  registration: RegistrationOverview;
  housing: HousingOverview;
  sponsors: SponsorOverview;
  speakers: SpeakerOverview;
  operations: OperationOverview;
  sessionReadiness: SessionReadinessOverview;
  operationalReadiness: OperationalReadinessCategory[];
  runOfShowReadiness: RunOfShowReadinessOverview;
  readiness: EventReadinessSnapshot;
  executiveBriefing: ExecutiveBriefing;
};

export type EventCommandCenterPayload = {
  event: EventCommandCenterEvent;
  dataQuality: { unavailableSources: string[] };
  capabilities: EventCommandCenterCapabilities;
  generatedAt: string;
  links: {
    timeline: string;
    budget: string;
    runOfShow: string;
    docs: string;
    speakers: string;
    staffing: string;
    fnbCatalog: string;
    registration: string;
    housing: string;
  };
};

export type EventCommandCenterCapabilities = {
  hasBudgetData: boolean;
  hasRegistrationData: boolean;
  hasHousingData: boolean;
  hasRunOfShow: boolean;
  hasStaffing: boolean;
  hasTaskData: boolean;
  hasVendorData: boolean;
  hasWeatherData: boolean;
  hasSpeakerData: boolean;
  hasFnbData: boolean;
  hasAvData: boolean;
};

export type EventCommandCenterWidgetId =
  | "upcomingDeadlines"
  | "topPriorities"
  | "criticalPath"
  | "taskCompletion"
  | "approvalQueue"
  | "decisionLog"
  | "budgetOverview"
  | "categoryBreakdown"
  | "revenueTracking"
  | "contractExposure"
  | "registrationPace"
  | "registrationFunnel"
  | "registrantDemographics"
  | "registrationForecast"
  | "pickupOverview"
  | "attritionRisk"
  | "subBlockStatus"
  | "cutoffCountdown"
  | "sponsorRevenue"
  | "deliverablesTracker"
  | "exhibitorStatus"
  | "speakerTaskStatus"
  | "sessionScheduling"
  | "speakerTravelStatus"
  | "runOfShow"
  | "staffingStatus"
  | "fnbStatus"
  | "avProductionStatus"
  | "incidentLog"
  | "riskDetection"
  | "opportunities"
  | "sentimentMonitor";

const EVENT_COMMAND_CENTER_WIDGET_IDS = new Set<EventCommandCenterWidgetId>([
  "upcomingDeadlines",
  "topPriorities",
  "criticalPath",
  "taskCompletion",
  "approvalQueue",
  "decisionLog",
  "budgetOverview",
  "categoryBreakdown",
  "revenueTracking",
  "contractExposure",
  "registrationPace",
  "registrationFunnel",
  "registrantDemographics",
  "registrationForecast",
  "pickupOverview",
  "attritionRisk",
  "subBlockStatus",
  "cutoffCountdown",
  "sponsorRevenue",
  "deliverablesTracker",
  "exhibitorStatus",
  "speakerTaskStatus",
  "sessionScheduling",
  "speakerTravelStatus",
  "runOfShow",
  "staffingStatus",
  "fnbStatus",
  "avProductionStatus",
  "incidentLog",
  "riskDetection",
  "opportunities",
  "sentimentMonitor",
]);

export type DashboardRoleKey =
  | "Planner"
  | "Finance Manager"
  | "Marketing Lead"
  | "Sponsorship Coordinator"
  | "Onsite Manager"
  | "Executive";

export type DashboardLayoutItem = {
  widgetId: EventCommandCenterWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
};

export type DashboardLayout = {
  eventId: string;
  userId?: string;
  roleKey: DashboardRoleKey;
  source: "user" | "role" | "phase";
  phase: EventPhase;
  items: DashboardLayoutItem[];
  updatedAt?: string;
};

export type DashboardLayoutInput = {
  roleKey: DashboardRoleKey;
  phase: EventPhase;
  items: DashboardLayoutItem[];
};

export class EventCommandCenterServiceError extends Error {
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

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(from: Date, to: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((startOfDay(to).getTime() - startOfDay(from).getTime()) / dayMs);
}

function dateOnlyDaysBetween(from: Date, to: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfUtcDate(to).getTime() - startOfUtcDate(from).getTime()) / dayMs);
}

function toIsoDate(date: Date | null | undefined): string {
  return date?.toISOString() ?? "";
}

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function budgetStatusLabel(varianceCents: number): string {
  if (varianceCents > 0) return `${formatMoney(varianceCents)} under`;
  if (varianceCents < 0) return `${formatMoney(Math.abs(varianceCents))} over`;
  return "On track";
}

function varianceStatus(varianceCents: number): FinancialOverview["varianceStatus"] {
  if (varianceCents > 0) return "under";
  if (varianceCents < 0) return "over";
  return "onTrack";
}

function formatVenue(event: { venueName: string | null; city: string | null; state: string | null }): string {
  const location = [event.city, event.state].filter(Boolean).join(", ");
  if (event.venueName && location) return `${event.venueName}, ${location}`;
  return event.venueName ?? location ?? "Venue not set";
}

function eventPhase(daysToEvent: number): EventPhase {
  if (daysToEvent <= 0) return "onsite";
  if (daysToEvent <= 60) return "preEvent";
  return "planning";
}

function eventTimingLabel(event: { startDate: Date; endDate: Date | null }, today: Date): {
  value: string;
  detail: string;
  state: "future" | "active" | "ended";
} {
  const start = startOfDay(event.startDate);
  const end = startOfDay(event.endDate ?? event.startDate);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  if (today >= start && today <= end) {
    return { value: "Live now", detail: "Event in progress", state: "active" };
  }
  if (today > end) {
    return { value: `${Math.abs(daysBetween(today, end))} days past`, detail: `Event ended ${dateFormatter.format(end)}`, state: "ended" };
  }
  return { value: `${daysBetween(today, start)} days`, detail: dateFormatter.format(start), state: "future" };
}

function deadlineCategory(category: DeadlineCategory): DeadlineItem["category"] {
  switch (category) {
    case DeadlineCategory.FNB:
      return "f&b";
    case DeadlineCategory.AV:
      return "av";
    case DeadlineCategory.HOUSING:
      return "housing";
    case DeadlineCategory.REGISTRATION:
      return "registration";
    case DeadlineCategory.LOGISTICS:
      return "other";
    case DeadlineCategory.OTHER:
    default:
      return "other";
  }
}

function deadlineStatus(status: DeadlineStatus, dueAt: Date, today: Date): DeadlineItem["status"] {
  if (status === DeadlineStatus.DONE) return "completed";
  if (status === DeadlineStatus.CANCELED) return "completed";
  return dueAt < today ? "overdue" : "upcoming";
}

function criticalDateDedupeKey(input: { title: string; eventDate: string }): string {
  return `${input.title.trim().toLowerCase()}|${input.eventDate.slice(0, 10)}`;
}

function criticalDateRank(input: {
  status: DeadlineItem["status"];
  priority: TimelinePriority | "STANDARD";
  sourceOrder: number;
}): number {
  if (input.status === "overdue" && input.priority === TimelinePriority.CRITICAL) return 0;
  if (input.status === "overdue" && input.priority === TimelinePriority.HIGH) return 1;
  if (input.status === "upcoming" && input.priority === TimelinePriority.CRITICAL) return 2;
  if (input.status === "upcoming" && input.priority === TimelinePriority.HIGH) return 3;
  if (input.status === "upcoming") return 4 + input.sourceOrder;
  return 6 + input.sourceOrder;
}

function approvalCategory(status: DocumentStatus): ApprovalItem["category"] {
  if (status === DocumentStatus.IN_REVIEW) return "content";
  if (status === DocumentStatus.APPROVED) return "content";
  if (status === DocumentStatus.REJECTED) return "content";
  return "other";
}

function approvalStatus(status: DocumentStatus): ApprovalItem["status"] {
  if (status === DocumentStatus.APPROVED) return "approved";
  if (status === DocumentStatus.REJECTED) return "rejected";
  return "pending";
}

function timelineSeverity(priority: TimelinePriority): NotificationItem["severity"] {
  if (priority === TimelinePriority.CRITICAL || priority === TimelinePriority.HIGH) return "high";
  if (priority === TimelinePriority.MEDIUM) return "medium";
  return "low";
}

function containsAny(value: string | null | undefined, needles: string[]): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return needles.some((needle) => normalized.includes(needle));
}

function sourceLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isEventRootTimelineItem(item: { title: string; parentId: string | null }): boolean {
  return item.parentId === null && item.title.trim().toLowerCase() === "event timeline";
}

function severityRank(severity: NotificationItem["severity"]): number {
  if (severity === "high") return 0;
  if (severity === "medium") return 1;
  return 2;
}

function notificationToneForPayload(severity: NotificationItem["severity"]): ConflictItem["tone"] {
  if (severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "neutral";
}

function statusLabelForTone(tone: "critical" | "warning" | "stable"): "Critical" | "Needs Review" | "On Track" {
  if (tone === "critical") return "Critical";
  if (tone === "warning") return "Needs Review";
  return "On Track";
}

function focusToneRank(tone: PlannerFocusItem["tone"]): number {
  if (tone === "critical") return 0;
  if (tone === "warning") return 1;
  return 2;
}

function notificationSourceLabel(type: NotificationItem["type"]): string {
  if (type === "approval") return "Approvals";
  if (type === "budget") return "Financials";
  if (type === "deadline") return "Roadmap";
  if (type === "risk") return "Risk";
  return "Operations";
}

function plannerFocusSourceLabel(item: NotificationItem): string {
  if (item.id.startsWith("budget-submission-") || item.id.startsWith("budget-")) return "Budget";
  if (item.id.startsWith("document-")) return "Documents";
  if (item.id.startsWith("registration-")) return "Registration";
  if (item.id.startsWith("housing-")) return "Housing";
  if (item.id.startsWith("timeline-") || item.id.startsWith("risk-")) return "Timeline";
  return notificationSourceLabel(item.type);
}

function focusRank(item: NotificationItem): number {
  if (item.severity === "high" && item.type === "risk") return 1;
  if (item.severity === "high" && item.type === "deadline") return 2;
  if (item.type === "approval") return 4;
  if (item.type === "deadline") return 5;
  if (item.type === "budget") return 6;
  return item.severity === "high" ? 7 : 8;
}

function focusDueLabel(value: string, today: Date): string {
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return "Needs review";
  const days = daysBetween(today, dueDate);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days}d`;
}

function focusDedupeKey(id: string): string {
  if (id.startsWith("risk-")) return `timeline-${id.slice("risk-".length)}`;
  return id;
}

function roadmapRecordHref(eventId: string, recordId: string, fallback: string): string {
  if (recordId.startsWith("timeline-")) {
    return `${eventTimelineHref(eventId)}?view=TIMELINE&item=${encodeURIComponent(recordId.slice("timeline-".length))}`;
  }
  if (recordId.startsWith("risk-")) {
    return `${eventTimelineHref(eventId)}?view=TIMELINE&item=${encodeURIComponent(recordId.slice("risk-".length))}`;
  }
  if (recordId.startsWith("deadline-")) {
    return `${eventTimelineHref(eventId)}?view=LIST&deadline=${encodeURIComponent(recordId.slice("deadline-".length))}`;
  }
  return fallback;
}

function notificationItemHref(
  eventId: string,
  item: NotificationItem,
  links: { timeline: string; budget: string; docs: string; runOfShow: string },
): string {
  if (item.type === "approval") return links.docs;
  if (item.type === "budget") return links.budget;
  if (item.type === "deadline" || item.type === "risk") return roadmapRecordHref(eventId, item.id, links.timeline);
  return links.runOfShow;
}

function isMissingOptionalDataSource(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") return true;
  return String(error).includes("does not exist");
}

async function readOptionalDataSource<T>(
  read: () => Promise<T>,
  fallback: T,
  unavailableSources: Set<string>,
  source: string,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isMissingOptionalDataSource(error)) {
      unavailableSources.add(source);
      return fallback;
    }
    throw error;
  }
}

async function assertCommandCenterAccess(eventId: string, user?: RequestUserContext): Promise<boolean> {
  if (!user) return true;

  try {
    const decision = await assertEventAccessForUser(eventId, user, "read");
    return decision.canEdit;
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw new EventCommandCenterServiceError(error.message, error.status);
    }
    throw error;
  }
}

export async function getEventCommandCenter(
  eventId: string,
  user?: RequestUserContext,
): Promise<EventCommandCenterPayload> {
  const canEdit = await assertCommandCenterAccess(eventId, user);

  const prisma = getPrisma();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      status: true,
      venueName: true,
      city: true,
      state: true,
      timezone: true,
    },
  });

  if (!event) {
    throw new EventCommandCenterServiceError("Event not found", 404);
  }
  const terminology = await getEventTerminology(eventId);

  const today = startOfDay(new Date());
  const generatedAt = new Date();
  const timelineToday = startOfUtcDate(today);
  const lookaheadEnd = addDays(today, 14);
  const unavailableSources = new Set<string>();

  // These reads only depend on eventId + today/lookaheadEnd (computed above) and
  // never on each other's results, so they run as one parallel wave instead of
  // ~35 serial round trips. Existing event data remains stable; dataQuality
  // adds explicit availability metadata for optional sources.
  const [
    sessionsCount,
    nextSession,
    unplacedSessionsCount,
    overdueTimelineItems,
    upcomingTimelineItems,
    atRiskTimelineItems,
    documentsInReview,
    budgetSubmissionsInReview,
    speakerStatusGroups,
    budgetTotals,
    budgetCategories,
    recentActivity,
    deadlines,
    registrationMetric,
    housingMetric,
    fnbCatalogCount,
    fnbSessionAssignmentCount,
    avRequirementCount,
    sessionsWithRoomCount,
    avSessionRows,
    fnbSessionRows,
    speakerSessionRows,
    staffSessionRows,
    speakerBioCount,
    speakerHeadshotCount,
    speakerSlidesRows,
    staffByRoleGroups,
    fnbDemandSessionRows,
    fnbServiceSessionRows,
    sessionsWithValidTimesCount,
    criticalDateTimelineItems,
    roadmapTimelineItems,
    deterministicReadiness,
  ] = await Promise.all([
    prisma.matrixRow.count({ where: { eventId } }),
    prisma.matrixRow.findFirst({
      where: { eventId, dayDate: { gte: today } },
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
      select: { id: true, sessionName: true, dayDate: true, startTime: true },
    }),
    prisma.matrixRow.count({
      where: {
        eventId,
        OR: [{ roomId: null, roomName: null }, { startTime: null }, { endTime: null }],
      },
    }),
    prisma.timelineItem.findMany({
      where: {
        eventId,
        endDate: { lt: today },
        status: { not: TimelineStatus.COMPLETE },
        disposition: TimelineItemDisposition.ACTIVE,
      },
      orderBy: [{ priority: "desc" }, { endDate: "asc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        department: true,
        endDate: true,
        priority: true,
        status: true,
        updatedAt: true,
        ownerUser: { select: { name: true, email: true } },
      },
    }),
    prisma.timelineItem.findMany({
      where: {
        eventId,
        endDate: { gte: today, lte: lookaheadEnd },
        status: { not: TimelineStatus.COMPLETE },
        disposition: TimelineItemDisposition.ACTIVE,
      },
      orderBy: [{ endDate: "asc" }, { priority: "desc" }],
      take: 8,
      select: {
        id: true,
        title: true,
        department: true,
        endDate: true,
        priority: true,
        status: true,
        updatedAt: true,
        ownerUser: { select: { name: true, email: true } },
      },
    }),
    prisma.timelineItem.findMany({
      where: { eventId, status: TimelineStatus.AT_RISK, disposition: TimelineItemDisposition.ACTIVE },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 8,
      select: { id: true, title: true, department: true, endDate: true, priority: true, updatedAt: true },
    }),
    prisma.document.findMany({
      where: { eventId, status: DocumentStatus.IN_REVIEW },
      orderBy: { updatedAt: "asc" },
      take: 8,
      select: { id: true, title: true, status: true, createdAt: true, updatedAt: true, category: { select: { name: true } } },
    }),
    prisma.budgetSubmission.findMany({
      where: { budget: { eventId }, status: BudgetSubmissionStatus.SUBMITTED },
      orderBy: { submittedAt: "asc" },
      take: 8,
      select: { id: true, submittedAt: true, message: true },
    }),
    // One grouped count replaces five separate speaker.count round trips.
    prisma.speaker.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.budgetLineItem.aggregate({
      where: { budget: { eventId } },
      _sum: { forecastCents: true, actualCents: true },
      _count: { id: true },
    }),
    prisma.budgetLineItem.groupBy({
      by: ["category"],
      where: { budget: { eventId } },
      _sum: { forecastCents: true, actualCents: true },
    }),
    readOptionalDataSource(
      () =>
        prisma.eventActivity.findMany({
          where: { eventId },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            type: true,
            message: true,
            createdAt: true,
            actorUser: { select: { name: true, email: true } },
          },
        }),
      [],
      unavailableSources,
      "event activity",
    ),
    prisma.deadline.findMany({
      where: {
        eventId,
        status: { in: [DeadlineStatus.OPEN, DeadlineStatus.BLOCKED] },
      },
      orderBy: [{ dueAt: "asc" }, { title: "asc" }, { id: "asc" }],
      take: 40,
      select: { id: true, title: true, dueAt: true, status: true, category: true, description: true, updatedAt: true },
    }),
    readOptionalDataSource(
      () =>
        prisma.eventIntegrationMetric.findFirst({
          where: { eventId, type: EventIntegrationMetricType.REGISTRATION },
          select: { currentValue: true, goalValue: true, pacePercent: true, delta7dPercent: true, updatedAt: true },
        }),
      null,
      unavailableSources,
      "registration integration metrics",
    ),
    readOptionalDataSource(
      () =>
        prisma.eventIntegrationMetric.findFirst({
          where: { eventId, type: EventIntegrationMetricType.HOUSING },
          select: { currentValue: true, goalValue: true, updatedAt: true },
        }),
      null,
      unavailableSources,
      "housing integration metrics",
    ),
    readOptionalDataSource(() => prisma.eventFnbCatalogItem.count({ where: { eventId, archivedAt: null } }), 0, unavailableSources, "F&B catalog"),
    readOptionalDataSource(() => prisma.sessionFnbCatalogAssignment.count({ where: { session: { eventId } } }), 0, unavailableSources, "F&B session assignments"),
    readOptionalDataSource(() => prisma.sessionAVRequirement.count({ where: { session: { eventId } } }), 0, unavailableSources, "AV requirements"),
    // Session setup completeness — distinct sessions covered by each requirement.
    // Each count is the number of sessions (MatrixRows) that have the requirement,
    // so widgets can render an honest "X of Y sessions" coverage percentage.
    prisma.matrixRow.count({
      where: { eventId, roomId: { not: null }, room: { is: { eventId } } },
    }),
    readOptionalDataSource(
      () => prisma.sessionAVRequirement.findMany({ where: { session: { eventId } }, distinct: ["sessionId"], select: { sessionId: true } }),
      [] as { sessionId: string }[],
      unavailableSources,
      "AV session requirements",
    ),
    readOptionalDataSource(
      () => prisma.sessionFnbCatalogAssignment.findMany({ where: { session: { eventId } }, distinct: ["sessionId"], select: { sessionId: true } }),
      [] as { sessionId: string }[],
      unavailableSources,
      "F&B session assignments",
    ),
    readOptionalDataSource(
      () => prisma.sessionSpeakerAssignment.findMany({ where: { session: { eventId } }, distinct: ["sessionId"], select: { sessionId: true } }),
      [] as { sessionId: string }[],
      unavailableSources,
      "speaker session assignments",
    ),
    readOptionalDataSource(
      () => prisma.sessionStaffAssignment.findMany({ where: { session: { eventId } }, distinct: ["sessionId"], select: { sessionId: true } }),
      [] as { sessionId: string }[],
      unavailableSources,
      "staffing session assignments",
    ),
    // Speaker deliverables — counts of speakers with each asset on file. Exclude
    // empty strings so a blank bio/headshot field never counts as "received".
    readOptionalDataSource(() => prisma.speaker.count({ where: { eventId, bio: { not: null }, NOT: { bio: "" } } }), 0, unavailableSources, "speaker bios"),
    readOptionalDataSource(() => prisma.speaker.count({ where: { eventId, headshotUrl: { not: null }, NOT: { headshotUrl: "" } } }), 0, unavailableSources, "speaker headshots"),
    readOptionalDataSource(
      () => prisma.speakerFile.findMany({ where: { speaker: { eventId }, kind: "SLIDES" }, distinct: ["speakerId"], select: { speakerId: true } }),
      [] as { speakerId: string }[],
      unavailableSources,
      "speaker slides",
    ),
    // Staffing assignments grouped by their free-text role/area label.
    readOptionalDataSource(
      () => prisma.sessionStaffAssignment.groupBy({ by: ["role"], where: { session: { eventId } }, _count: { _all: true } }),
      [] as Array<{ role: string | null; _count: { _all: number } }>,
      unavailableSources,
      "staffing role groups",
    ),
    // F&B demand signal: sessions tied to a real meal period expect food service.
    // This is the honest per-session "requires F&B" flag (MealPeriod, excluding
    // NONE); catalog item supply is NOT demand.
    prisma.matrixRow.findMany({
      where: { eventId, mealPeriod: { in: FNB_DEMAND_MEAL_PERIODS } },
      select: { id: true },
    }),
    // Sessions that already have a food-service record (1:1 with a session).
    readOptionalDataSource(
      () => prisma.sessionFoodService.findMany({ where: { session: { eventId } }, distinct: ["sessionId"], select: { sessionId: true } }),
      [] as { sessionId: string }[],
      unavailableSources,
      "session food service",
    ),
    prisma.matrixRow.count({
      where: {
        eventId,
        startTime: { not: null },
        endTime: { not: null },
      },
    }),
    prisma.timelineItem.findMany({
      where: {
        eventId,
        title: { not: "Event Timeline" },
        status: { not: TimelineStatus.COMPLETE },
        disposition: TimelineItemDisposition.ACTIVE,
        endDate: { not: null },
        OR: [
          { endDate: { lt: timelineToday } },
          { priority: { in: [TimelinePriority.CRITICAL, TimelinePriority.HIGH] } },
          { status: TimelineStatus.AT_RISK },
          { isCriticalPath: true },
        ],
      },
      orderBy: [{ endDate: "asc" }, { priority: "desc" }, { title: "asc" }, { id: "asc" }],
      take: 40,
      select: {
        id: true,
        title: true,
        endDate: true,
        priority: true,
        status: true,
        isCriticalPath: true,
      },
    }),
    prisma.timelineItem.findMany({
      where: { eventId, disposition: TimelineItemDisposition.ACTIVE },
      orderBy: [{ sortOrder: "asc" }, { endDate: "asc" }, { title: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        parentId: true,
        status: true,
        endDate: true,
        sortOrder: true,
      },
    }),
    getEventReadinessSnapshot(eventId, generatedAt),
  ]);

  // Derive the per-status speaker counts from the single grouped query. Every
  // speaker has a status (non-nullable default), so the group sum is the total.
  const speakerCountByStatus = new Map<string, number>();
  for (const group of speakerStatusGroups) {
    speakerCountByStatus.set(group.status, group._count._all);
  }
  const speakerNeedsInfoCount = speakerCountByStatus.get("NEEDS_INFO") ?? 0;
  const speakerConfirmedCount = speakerCountByStatus.get("CONFIRMED") ?? 0;
  const speakerInvitedCount = speakerCountByStatus.get("INVITED") ?? 0;
  const speakerCancelledCount = speakerCountByStatus.get("CANCELLED") ?? 0;
  const speakerTotalCount = speakerStatusGroups.reduce((sum, group) => sum + group._count._all, 0);

  // Distinct sessions with >=1 staff assignment (staffSessionRows is queried with
  // distinct: ["sessionId"]). Used for staffing coverage so multiple staff on one
  // session count once. This mirrors sessionReadiness.staffingAssigned below.
  const distinctStaffedSessionCount = staffSessionRows.length;
  const fnbBudgetCategoryCount = budgetCategories.filter((category) =>
    containsAny(category.category, ["f&b", "fnb", "food", "beverage", "catering"]),
  ).length;
  const avBudgetCategoryCount = budgetCategories.filter((category) =>
    containsAny(category.category, ["av", "a/v", "audio", "production", "lighting", "stage"]),
  ).length;

  const forecast = budgetTotals._sum.forecastCents ?? 0;
  const actual = budgetTotals._sum.actualCents ?? 0;
  const variance = forecast - actual;
  const daysToEvent = daysBetween(today, event.startDate);
  const timing = eventTimingLabel(event, today);
  // "Operational blockers" is a heterogeneous aggregate (unplaced sessions +
  // at-risk timeline items + speakers needing info). Expose the components so the
  // UI does not present it as one precise conflict type; `conflicts` stays as the
  // total for API compatibility.
  const blockers = {
    total: unplacedSessionsCount + atRiskTimelineItems.length + speakerNeedsInfoCount,
    unplacedSessions: unplacedSessionsCount,
    atRiskTimelineItems: atRiskTimelineItems.length,
    speakersNeedingInfo: speakerNeedsInfoCount,
  };
  const conflicts = blockers.total;
  const phase = eventPhase(daysToEvent);
  const timelineHref = eventTimelineHref(event.id);
  const budgetHref = eventBudgetHref(event.id);
  const runOfShowHref = eventRunOfShowHref(event.id);
  const docsHref = eventDocsHref(event.id);
  const speakersHref = eventSpeakersHref(event.id);
  const staffingHref = eventStaffingHref(event.id);
  const fnbCatalogHref = eventFnbCatalogHref(event.id);
  const registrationHref = eventAttendeesHref(event.id);
  const housingHref = eventSettingsHref(event.id);

  const financial: FinancialOverview = {
    forecast,
    actual,
    variance,
    varianceStatus: varianceStatus(variance),
    categories: budgetCategories
      .map((category) => {
        const categorySums = category._sum ?? {};
        const categoryForecast = categorySums.forecastCents ?? 0;
        const categoryActual = categorySums.actualCents ?? 0;
        const categoryVariance = categoryForecast - categoryActual;
        return {
          name: category.category,
          forecast: categoryForecast,
          actual: categoryActual,
          variance: categoryVariance,
          status: varianceStatus(categoryVariance),
        };
      })
      .sort((a, b) => Math.max(b.actual, b.forecast) - Math.max(a.actual, a.forecast))
      .slice(0, 4),
  };

  const registrationCurrent = registrationMetric?.currentValue ?? 0;
  const registrationTarget = registrationMetric?.goalValue ?? 0;
  const registration: RegistrationOverview = {
    hasData: Boolean(registrationMetric),
    current: registrationCurrent,
    target: registrationTarget,
    paceStatus:
      registrationTarget > 0 && registrationCurrent < registrationTarget
        ? "behind"
        : registrationTarget > 0 && registrationCurrent > registrationTarget
          ? "ahead"
          : "onTrack",
    trend: [],
  };

  const housingCurrent = housingMetric?.currentValue ?? 0;
  const housingTarget = housingMetric?.goalValue ?? 0;
  const housingPickupPercentage = housingTarget > 0 ? Math.round((housingCurrent / housingTarget) * 100) : 0;

  const deadlineCriticalDateCandidates = deadlines.map((deadline) => {
    const status = deadlineStatus(deadline.status, deadline.dueAt, today);
    const priority = deadline.status === DeadlineStatus.BLOCKED ? TimelinePriority.CRITICAL : "STANDARD";
    return {
      item: {
        id: `deadline-${deadline.id}`,
        title: deadline.title,
        eventDate: deadline.dueAt.toISOString(),
        status,
        daysRemaining: daysBetween(today, deadline.dueAt),
        category: deadlineCategory(deadline.category),
      } satisfies DeadlineItem,
      priority,
      sourceOrder: 0,
      rank: criticalDateRank({ status, priority, sourceOrder: 0 }),
    };
  });
  const timelineCriticalDateCandidates = criticalDateTimelineItems.flatMap((item) => {
    if (!item.endDate) return [];
    const timelineDaysRemaining = dateOnlyDaysBetween(today, item.endDate);
    const status: DeadlineItem["status"] = timelineDaysRemaining < 0 ? "overdue" : "upcoming";
    const priority =
      item.status === TimelineStatus.AT_RISK || item.priority === TimelinePriority.CRITICAL || item.isCriticalPath
        ? TimelinePriority.CRITICAL
        : item.priority === TimelinePriority.HIGH
          ? TimelinePriority.HIGH
          : "STANDARD";
    return [{
      item: {
        id: `timeline-${item.id}`,
        title: item.title,
        eventDate: item.endDate.toISOString(),
        status,
        daysRemaining: timelineDaysRemaining,
        category: "other" as const,
      } satisfies DeadlineItem,
      priority,
      sourceOrder: 1,
      rank: criticalDateRank({ status, priority, sourceOrder: 1 }),
    }];
  });
  const seenCriticalDateKeys = new Set<string>();
  const deadlinesPayload: DeadlineItem[] = [...deadlineCriticalDateCandidates, ...timelineCriticalDateCandidates]
    .filter((candidate) => {
      const key = criticalDateDedupeKey(candidate.item);
      if (seenCriticalDateKeys.has(key)) return false;
      seenCriticalDateKeys.add(key);
      return true;
    })
    .sort((a, b) => {
      const rankDiff = a.rank - b.rank;
      if (rankDiff !== 0) return rankDiff;
      const timeDiff = new Date(a.item.eventDate).getTime() - new Date(b.item.eventDate).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.item.title.localeCompare(b.item.title) || a.item.id.localeCompare(b.item.id);
    })
    .slice(0, 8)
    .map((candidate) => candidate.item);

  const approvalsPayload: ApprovalItem[] = [
    ...documentsInReview.map((document) => ({
      id: `document-${document.id}`,
      title: document.title,
      category: approvalCategory(document.status),
      submittedBy: document.category?.name ?? "Document Hub",
      submittedDate: document.createdAt.toISOString(),
      dueDate: null,
      status: approvalStatus(document.status),
      urgency: classifyApprovalUrgency({ submittedAt: document.updatedAt, asOf: generatedAt }),
      owner: document.category?.name ?? "Document reviewer",
      reasonCode: classifyApprovalUrgency({ submittedAt: document.updatedAt, asOf: generatedAt }) === "risk" ? "APPROVAL_WAITING_RISK" : "APPROVAL_PENDING",
      href: docsHref,
    })),
    ...budgetSubmissionsInReview.map((submission) => ({
      id: `budget-submission-${submission.id}`,
      title: submission.message ? `Budget submission: ${submission.message}` : "Budget submission awaiting review",
      category: "budgetChange" as const,
      submittedBy: "Budget",
      submittedDate: submission.submittedAt.toISOString(),
      dueDate: null,
      status: "pending" as const,
      urgency: classifyApprovalUrgency({ submittedAt: submission.submittedAt, asOf: generatedAt }),
      owner: "Budget approver",
      reasonCode: classifyApprovalUrgency({ submittedAt: submission.submittedAt, asOf: generatedAt }) === "risk" ? "APPROVAL_WAITING_RISK" : "APPROVAL_PENDING",
      href: budgetHref,
    })),
  ];

  // F&B pending = sessions that expect F&B (real meal period) but have no F&B
  // coverage yet. Coverage is any catalog assignment or a food-service record on
  // the session. Catalog item supply is intentionally excluded from this number.
  const fnbCoveredSessionIds = new Set<string>([
    ...fnbSessionRows.map((row) => row.sessionId),
    ...fnbServiceSessionRows.map((row) => row.sessionId),
  ]);
  const fnbPendingSessionCount = fnbDemandSessionRows.filter(
    (row) => !fnbCoveredSessionIds.has(row.id),
  ).length;
  const fnbServiceCount = fnbServiceSessionRows.length;
  const fnbCoverageCount = fnbCoveredSessionIds.size;
  const avCoverageCount = new Set(avSessionRows.map((row) => row.sessionId)).size;
  const missingTimeCount = Math.max(0, sessionsCount - sessionsWithValidTimesCount);
  const missingRoomCount = Math.max(0, sessionsCount - sessionsWithRoomCount);
  const missingSpeakerSessionCount = Math.max(0, sessionsCount - speakerSessionRows.length);
  const missingAvSessionCount = Math.max(0, sessionsCount - avCoverageCount);
  const missingStaffSessionCount = Math.max(0, sessionsCount - staffSessionRows.length);
  const hasFnbData = fnbCatalogCount > 0 || fnbSessionAssignmentCount > 0 || fnbServiceCount > 0 || fnbBudgetCategoryCount > 0;
  const hasAvData = avRequirementCount > 0 || avBudgetCategoryCount > 0;
  const hasStaffingData = staffSessionRows.length > 0;
  const hasBudgetData = budgetTotals._count.id > 0;
  const hasRunOfShow = sessionsCount > 0;
  const sponsorOverview: SponsorOverview = {
    hasData: false,
    revenue: 0,
    target: 0,
    deliveriesPending: 0,
    activeSponsors: 0,
  };

  const runOfShowGapCandidates = buildRunOfShowGapCandidates({
    eventId,
    missingTimeCount,
    missingRoomCount,
    missingSpeakerSessionCount,
    missingAvSessionCount,
    fnbPendingSessionCount,
    missingStaffSessionCount,
    runOfShowHref,
    fnbPlannerHref: fnbCatalogHref,
    staffingHref,
  });

  const runOfShowCriticalCount = runOfShowGapCandidates.filter((gap) => gap.tone === "critical").length;
  const runOfShowWarningCount = runOfShowGapCandidates.filter((gap) => gap.tone === "warning").length;
  const runOfShowStatus =
    !hasRunOfShow || runOfShowCriticalCount > 0
      ? "critical"
      : runOfShowWarningCount > 0
        ? "warning"
        : "stable";
  const runOfShowReadiness: RunOfShowReadinessOverview = {
    hasData: hasRunOfShow,
    totalSessions: sessionsCount,
    status: runOfShowStatus,
    statusLabel: statusLabelForTone(runOfShowStatus),
    metrics: ([
      {
        id: "times",
        label: "Valid times",
        ready: sessionsWithValidTimesCount,
        missing: missingTimeCount,
        total: sessionsCount,
        href: runOfShowHref,
      },
      {
        id: "rooms",
        label: "Rooms assigned",
        ready: sessionsWithRoomCount,
        missing: missingRoomCount,
        total: sessionsCount,
        href: runOfShowHref,
      },
      {
        id: "speakers",
        label: "Speakers assigned",
        ready: speakerSessionRows.length,
        missing: missingSpeakerSessionCount,
        total: sessionsCount,
        href: speakersHref,
      },
      {
        id: "av",
        label: "AV assigned",
        ready: avCoverageCount,
        missing: missingAvSessionCount,
        total: sessionsCount,
        href: runOfShowHref,
      },
      {
        id: "fnb",
        label: "F&B assigned",
        ready: fnbCoverageCount,
        missing: fnbPendingSessionCount,
        total: fnbDemandSessionRows.length,
        href: fnbCatalogHref,
      },
      {
        id: "staffing",
        label: "Staffing assigned",
        ready: staffSessionRows.length,
        missing: missingStaffSessionCount,
        total: sessionsCount,
        href: staffingHref,
      },
    ] satisfies RunOfShowReadinessOverview["metrics"]).filter((metric) => metric.total > 0),
    gaps: runOfShowGapCandidates.slice(0, 5),
  };

  const operationalReadiness: OperationalReadinessCategory[] = [
    registration.hasData
      ? {
          id: "registration" as const,
          label: "Registration",
          status: registration.paceStatus === "behind" ? "warning" : "stable",
          statusLabel: registration.paceStatus === "behind" ? "Needs Review" : "On Track",
          detail:
            registration.target > 0
              ? `${registration.current.toLocaleString()} of ${registration.target.toLocaleString()} registered`
              : `${registration.current.toLocaleString()} registered`,
          href: registrationHref,
        }
      : null,
    housingMetric
      ? {
          id: "housing" as const,
          label: "Housing",
          status: housingTarget > 0 && housingCurrent < housingTarget ? "warning" : "stable",
          statusLabel: housingTarget > 0 && housingCurrent < housingTarget ? "Needs Review" : "On Track",
          detail:
            housingTarget > 0
              ? `${housingCurrent.toLocaleString()} of ${housingTarget.toLocaleString()} rooms picked up`
              : `${housingCurrent.toLocaleString()} rooms picked up`,
          href: housingHref,
        }
      : null,
    hasBudgetData
      ? {
          id: "budget" as const,
          label: "Budget",
          status: variance < 0 ? "critical" : "stable",
          statusLabel: variance < 0 ? "Critical" : "On Track",
          detail: budgetStatusLabel(variance),
          href: budgetHref,
        }
      : null,
    documentsInReview.length + budgetSubmissionsInReview.length > 0 || documentsInReview.length === 0
      ? {
          id: "approvals" as const,
          label: "Documents / Approvals",
          status: documentsInReview.length + budgetSubmissionsInReview.length > 0 ? "warning" : "stable",
          statusLabel: documentsInReview.length + budgetSubmissionsInReview.length > 0 ? "Needs Review" : "On Track",
          detail:
            documentsInReview.length + budgetSubmissionsInReview.length > 0
              ? `${(documentsInReview.length + budgetSubmissionsInReview.length).toLocaleString()} pending review`
              : "No pending reviews",
          href: docsHref,
        }
      : null,
    speakerTotalCount > 0
      ? {
          id: "speakerDeliverables" as const,
          label: "Speaker Deliverables",
          status:
            Math.min(speakerBioCount, speakerHeadshotCount, speakerSlidesRows.length) >= speakerTotalCount
              ? "stable"
              : "warning",
          statusLabel:
            Math.min(speakerBioCount, speakerHeadshotCount, speakerSlidesRows.length) >= speakerTotalCount
              ? "On Track"
              : "Needs Review",
          detail: `${Math.max(0, speakerTotalCount - speakerBioCount) + Math.max(0, speakerTotalCount - speakerHeadshotCount) + Math.max(0, speakerTotalCount - speakerSlidesRows.length)} missing deliverables`,
          href: speakersHref,
        }
      : null,
  ].filter((category): category is OperationalReadinessCategory => Boolean(category));

  const notifications: NotificationItem[] = [
    ...deadlines
      .filter((deadline) => deadlineStatus(deadline.status, deadline.dueAt, today) === "overdue")
      .map((deadline) => ({
        id: `deadline-${deadline.id}`,
        type: "deadline" as const,
        title: deadline.title,
        description: deadline.description ?? sourceLabel(deadline.category),
        severity: deadline.status === DeadlineStatus.BLOCKED ? ("high" as const) : ("medium" as const),
        dueDate: deadline.dueAt.toISOString(),
      })),
    ...overdueTimelineItems.map((item) => ({
      id: `timeline-${item.id}`,
      type: "deadline" as const,
      title: item.title,
      description: item.ownerUser?.name ?? item.ownerUser?.email ?? "Unassigned",
      severity: timelineSeverity(item.priority),
      dueDate: toIsoDate(item.endDate),
    })),
    ...documentsInReview.map((document) => ({
      id: `document-${document.id}`,
      type: "approval" as const,
      title: document.title,
      description: "Document is waiting for review.",
      severity: "medium" as const,
      dueDate: document.updatedAt.toISOString(),
    })),
    ...budgetSubmissionsInReview.map((submission) => ({
      id: `budget-submission-${submission.id}`,
      type: "approval" as const,
      title: "Budget submission needs review",
      description: submission.message ?? "Budget approval is pending.",
      severity: "medium" as const,
      dueDate: submission.submittedAt.toISOString(),
    })),
    ...atRiskTimelineItems.map((item) => ({
      id: `risk-${item.id}`,
      type: "risk" as const,
      title: item.title,
      description: item.department ?? "Timeline item is marked at risk.",
      severity: timelineSeverity(item.priority),
      dueDate: toIsoDate(item.endDate),
    })),
    ...(variance < 0
      ? [
          {
            id: `budget-${eventId}`,
            type: "budget" as const,
            title: "Budget is over forecast",
            description: budgetStatusLabel(variance),
            severity: "high" as const,
            dueDate: undefined,
          },
        ]
      : []),
    ...(registration.hasData && registration.target > 0 && registration.current < registration.target
      ? [
          {
            id: `registration-${eventId}`,
            type: "risk" as const,
            title: "Registration is behind target",
            description: `${registration.current.toLocaleString()} registered against ${registration.target.toLocaleString()} target.`,
            severity: "medium" as const,
            dueDate: undefined,
          },
        ]
      : []),
    ...(housingMetric && housingTarget > 0 && housingCurrent < housingTarget
      ? [
          {
            id: `housing-${eventId}`,
            type: "risk" as const,
            title: "Housing pickup is below target",
            description: `${housingCurrent.toLocaleString()} picked up against ${housingTarget.toLocaleString()} contracted.`,
            severity: "medium" as const,
            dueDate: undefined,
          },
        ]
      : []),
  ]
    .sort((a, b) => {
      const severityDiff = severityRank(a.severity) - severityRank(b.severity);
      if (severityDiff !== 0) return severityDiff;
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 8);

  const roadmapItems = roadmapTimelineItems.filter((item) => !isEventRootTimelineItem(item));
  const roadmapCompletion = calculateTimelineCompletion(roadmapItems);
  const roadmapUpcomingItems = roadmapItems
    .filter((item) => item.status !== TimelineStatus.COMPLETE)
    .map((item) => {
      const daysRemaining = item.endDate ? dateOnlyDaysBetween(today, item.endDate) : null;
      const rank = typeof daysRemaining === "number" && daysRemaining < 0
        ? 0
        : item.status === TimelineStatus.AT_RISK
          ? 1
          : typeof daysRemaining === "number"
            ? 2
            : 3;
      return { item, daysRemaining, rank };
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      const leftTime = left.item.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.item.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      if (left.item.sortOrder !== right.item.sortOrder) return left.item.sortOrder - right.item.sortOrder;
      return left.item.title.localeCompare(right.item.title) || left.item.id.localeCompare(right.item.id);
    })
    .slice(0, 5)
    .map(({ item, daysRemaining }) => ({
      id: item.id,
      title: item.title,
      dueDate: item.endDate?.toISOString() ?? null,
      daysRemaining,
      status: item.status,
    }));
  const roadmapProgress: RoadmapProgressOverview = {
    totalTasks: roadmapCompletion.totalItems,
    completed: roadmapCompletion.completeItems,
    inProgress: roadmapItems.filter((item) => item.status === TimelineStatus.IN_PROGRESS).length,
    notStarted: roadmapItems.filter((item) => item.status === TimelineStatus.NOT_STARTED).length,
    atRisk: roadmapItems.filter((item) => item.status === TimelineStatus.AT_RISK).length,
    percentComplete: roadmapCompletion.percentComplete,
    upcomingItems: roadmapUpcomingItems,
  };

  const plannerFocusCandidates: Array<PlannerFocusItem & { rank: number; dueTime: number }> = [
    ...runOfShowGapCandidates.map((gap) => ({
      id: gap.id,
      title: gap.title,
      source: "Run of Show",
      urgency: gap.tone === "critical" ? "Critical" : "Needs Review",
      reason: gap.detail,
      tone: gap.tone,
      href: gap.href,
      rank: gap.tone === "critical" ? 1 : 3,
      dueTime: Number.MAX_SAFE_INTEGER,
    })),
    ...notifications.map((item) => {
      const href = item.id.startsWith("registration-")
        ? registrationHref
        : item.id.startsWith("housing-")
          ? housingHref
          : item.id.startsWith("budget-submission-")
            ? budgetHref
            : notificationItemHref(event.id, item, {
                timeline: timelineHref,
                budget: budgetHref,
                docs: docsHref,
                runOfShow: runOfShowHref,
              });
      return {
        id: item.id,
        title: item.title,
        source: plannerFocusSourceLabel(item),
        urgency: item.dueDate ? focusDueLabel(item.dueDate, today) : sourceLabel(item.severity),
        reason: item.description ?? sourceLabel(item.type),
        tone: notificationToneForPayload(item.severity),
        href,
        rank: focusRank(item),
        dueTime: item.dueDate ? new Date(item.dueDate).getTime() : Number.MAX_SAFE_INTEGER,
      };
    }),
    ...(speakerTotalCount > 0
      ? (() => {
          const missingDeliverables =
            Math.max(0, speakerTotalCount - speakerBioCount) +
            Math.max(0, speakerTotalCount - speakerHeadshotCount) +
            Math.max(0, speakerTotalCount - speakerSlidesRows.length);
          return missingDeliverables > 0
            ? [
                {
                  id: `speaker-deliverables-${eventId}`,
                  title: `${missingDeliverables.toLocaleString()} speaker deliverable${missingDeliverables === 1 ? "" : "s"} missing`,
                  source: "Speakers",
                  urgency: "Needs Review",
                  reason: "Bios, headshots, or slides are incomplete.",
                  tone: "warning" as const,
                  href: speakersHref,
                  rank: 4,
                  dueTime: Number.MAX_SAFE_INTEGER,
                },
              ]
            : [];
        })()
      : []),
    ...deadlinesPayload
      .filter((item) => item.status !== "completed")
      .map((item) => ({
        id: item.id,
        title: item.title,
        source: "Roadmap",
        urgency: item.status === "overdue" ? `${Math.abs(item.daysRemaining)} days overdue` : item.daysRemaining === 0 ? "Due today" : `Due in ${item.daysRemaining}d`,
        reason: sourceLabel(item.category),
        tone: item.status === "overdue" ? ("critical" as const) : ("neutral" as const),
        href: roadmapRecordHref(event.id, item.id, timelineHref),
        rank: item.status === "overdue" ? 2 : item.daysRemaining <= 7 ? 5 : 7,
        dueTime: new Date(item.eventDate).getTime(),
      })),
  ];
  const plannerFocus = Array.from(
    plannerFocusCandidates
      .sort((a, b) => {
        const rankDiff = a.rank - b.rank;
        if (rankDiff !== 0) return rankDiff;
        const toneDiff = focusToneRank(a.tone) - focusToneRank(b.tone);
        if (toneDiff !== 0) return toneDiff;
        if (a.dueTime !== b.dueTime) return a.dueTime - b.dueTime;
        return a.id.localeCompare(b.id);
      })
      .reduce((acc, item) => {
        const dedupeKey = focusDedupeKey(item.id);
        if (!acc.has(dedupeKey)) {
          acc.set(dedupeKey, {
            id: item.id,
            title: item.title,
            source: item.source,
            urgency: item.urgency,
            reason: item.reason,
            tone: item.tone,
            href: item.href,
          });
        }
        return acc;
      }, new Map<string, PlannerFocusItem>())
      .values(),
  ).slice(0, 5);

  const conflictCandidates: ConflictItem[] = [
    ...notifications.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.description ?? sourceLabel(item.type),
      dueLabel: item.dueDate ? item.dueDate : sourceLabel(item.severity),
      tone: notificationToneForPayload(item.severity),
      source: notificationSourceLabel(item.type),
      href: notificationItemHref(event.id, item, {
        timeline: timelineHref,
        budget: budgetHref,
        docs: docsHref,
        runOfShow: runOfShowHref,
      }),
    })),
    ...runOfShowGapCandidates.map((gap) => ({
      id: gap.id,
      title: gap.title,
      detail: gap.detail,
      dueLabel: "Run of Show",
      tone: gap.tone,
      source: "Run of Show",
      href: gap.href,
    })),
    ...deadlinesPayload
      .filter((item) => item.status === "overdue")
      .map((item) => ({
      id: item.id,
      title: item.title,
      detail: sourceLabel(item.category),
      dueLabel: `${Math.abs(item.daysRemaining)} days overdue`,
      tone: "critical" as const,
      source: "Roadmap",
      href: roadmapRecordHref(event.id, item.id, timelineHref),
    })),
  ];
  const conflictsPayload = Array.from(
    conflictCandidates
      .reduce((acc, item) => {
        if (!acc.has(item.id)) acc.set(item.id, item);
        return acc;
      }, new Map<string, ConflictItem>())
      .values(),
  ).slice(0, 8);

  const briefing = buildExecutiveBriefing({
    eventId: event.id,
    eventName: event.name,
    dataAsOf: deterministicReadiness.dataAsOf,
    asOf: generatedAt.toISOString(),
    canEdit,
    readiness: deterministicReadiness,
    pendingApprovals: approvalsPayload.length,
    overdueItems: overdueTimelineItems.length,
    budgetVarianceCents: variance,
    hasBudgetData,
    links: { runOfShow: runOfShowHref, timeline: timelineHref, budget: budgetHref, docs: docsHref },
    unavailableSources: Array.from(unavailableSources),
    terminology: terminology.terms,
  });

  return {
    event: {
      id: event.id,
      name: event.name,
      startDate: event.startDate.toISOString(),
      endDate: (event.endDate ?? event.startDate).toISOString(),
      daysToEvent,
      timing,
      phase,
      status: event.status,
      timezone: event.timezone,
      venue: formatVenue(event),
      KPIs: {
        conflicts,
        blockers,
        approvals: approvalsPayload.length,
        overdueItems: overdueTimelineItems.length,
        budgetStatus: {
          variance,
          statusLabel: hasBudgetData ? budgetStatusLabel(variance) : "No budget data",
        },
      },
      notifications,
      plannerFocus,
      conflicts: conflictsPayload,
      activity: recentActivity.map((entry) => ({
        id: entry.id,
        type: entry.type ?? "EVENT_UPDATED",
        message: entry.message,
        actor: entry.actorUser?.name ?? entry.actorUser?.email ?? "System",
        createdAt: entry.createdAt.toISOString(),
      })),
      deadlines: deadlinesPayload,
      roadmapProgress,
      approvals: approvalsPayload,
      financial,
      registration,
      housing: {
        hasData: Boolean(housingMetric),
        current: housingCurrent,
        target: housingTarget,
        pickupPercentage: housingPickupPercentage,
        attritionExposure: 0,
        subBlocks: [],
        cutoffDate: event.startDate.toISOString(),
      },
      sponsors: sponsorOverview,
      speakers: {
        totalSpeakers: speakerTotalCount,
        tasksPending: speakerNeedsInfoCount,
        // travelStatus has no independent source of truth: there is no separate
        // travel-confirmation field, so it necessarily mirrors sessionStatus (both
        // derive from speaker.status). Retained for payload compatibility only; the
        // UI must not present it as distinct travel readiness. Adding real travel
        // status requires a reviewed schema change.
        travelStatus: { confirmed: speakerConfirmedCount, pending: speakerInvitedCount + speakerNeedsInfoCount, declined: speakerCancelledCount },
        sessionStatus: { confirmed: speakerConfirmedCount, pending: speakerInvitedCount + speakerNeedsInfoCount, canceled: speakerCancelledCount },
        deliverables: {
          bioReceived: speakerBioCount,
          headshotReceived: speakerHeadshotCount,
          slidesReceived: speakerSlidesRows.length,
        },
      },
      operations: {
        fnbStatus: { completed: fnbSessionAssignmentCount + fnbServiceCount, pending: fnbPendingSessionCount, overdue: 0, hasData: hasFnbData },
        staffingStatus: {
          // Coverage is measured in staffed *sessions*, not raw assignment rows:
          // one heavily-staffed session must not mask other unstaffed sessions.
          // staffSessionRows is the already-computed distinct-session set.
          confirmed: distinctStaffedSessionCount,
          pending: 0,
          missing: hasStaffingData ? Math.max(0, sessionsCount - distinctStaffedSessionCount) : 0,
          hasData: hasStaffingData,
        },
        // Merge by normalized label so null/blank roles collapse into a single
        // "Unassigned" bucket rather than appearing as duplicate entries.
        staffingByRole: Array.from(
          staffByRoleGroups
            .reduce((acc, group) => {
              const role = (group.role ?? "").trim() || "Unassigned";
              acc.set(role, (acc.get(role) ?? 0) + group._count._all);
              return acc;
            }, new Map<string, number>())
            .entries(),
          ([role, count]) => ({ role, count }),
        ).sort((a, b) => b.count - a.count),
        avStatus: { items: avRequirementCount, issues: atRiskTimelineItems.length, hasData: hasAvData },
        roomStatus: { set: sessionsWithRoomCount, pending: unplacedSessionsCount, conflicts: unplacedSessionsCount },
        runOfShow: {
          hasData: hasRunOfShow,
          totalSegments: sessionsCount,
          nextSegment: nextSession
            ? {
                id: nextSession.id,
                title: nextSession.sessionName ?? "Untitled segment",
                date: nextSession.dayDate.toISOString(),
                startTime: nextSession.startTime?.toISOString?.() ?? null,
              }
            : null,
        },
      },
      sessionReadiness: {
        totalSessions: sessionsCount,
        roomsAssigned: sessionsWithRoomCount,
        // Distinct sessions with AV: union of structured requirements + inline AV notes.
        avAssigned: avCoverageCount,
        fnbSelected: fnbCoverageCount,
        speakersAssigned: speakerSessionRows.length,
        staffingAssigned: staffSessionRows.length,
      },
      operationalReadiness,
      runOfShowReadiness,
      readiness: deterministicReadiness,
      executiveBriefing: briefing,
    },
    dataQuality: { unavailableSources: Array.from(unavailableSources).sort() },
    capabilities: {
      hasBudgetData,
      hasRegistrationData: registration.hasData,
      hasHousingData: Boolean(housingMetric),
      hasRunOfShow,
      hasStaffing: hasStaffingData,
      hasTaskData: deadlinesPayload.length > 0 || overdueTimelineItems.length > 0 || upcomingTimelineItems.length > 0,
      hasVendorData: false,
      hasWeatherData: false,
      hasSpeakerData: speakerTotalCount > 0,
      hasFnbData,
      hasAvData,
    },
    generatedAt: generatedAt.toISOString(),
    links: {
      timeline: timelineHref,
      budget: budgetHref,
      runOfShow: runOfShowHref,
      docs: docsHref,
      speakers: speakersHref,
      staffing: staffingHref,
      fnbCatalog: fnbCatalogHref,
      registration: registrationHref,
      housing: housingHref,
    },
  };
}

function item(widgetId: EventCommandCenterWidgetId, x: number, y: number, w: number, h: number): DashboardLayoutItem {
  return { widgetId, x, y, w, h, visible: true };
}

export function suggestLayoutForPhase(phase: EventPhase): DashboardLayout {
  const phaseItems: Record<EventPhase, DashboardLayoutItem[]> = {
    planning: [
      item("budgetOverview", 0, 0, 6, 4),
      item("registrationPace", 6, 0, 6, 4),
      item("topPriorities", 0, 4, 4, 4),
      item("upcomingDeadlines", 4, 4, 4, 4),
      item("approvalQueue", 8, 4, 4, 4),
    ],
    preEvent: [
      item("upcomingDeadlines", 0, 0, 4, 4),
      item("approvalQueue", 4, 0, 4, 4),
      item("budgetOverview", 8, 0, 4, 4),
      item("pickupOverview", 0, 4, 6, 4),
      item("taskCompletion", 6, 4, 6, 4),
    ],
    onsite: [
      item("runOfShow", 0, 0, 5, 4),
      item("staffingStatus", 5, 0, 3, 4),
      item("incidentLog", 8, 0, 4, 4),
      item("avProductionStatus", 0, 4, 4, 4),
      item("fnbStatus", 4, 4, 4, 4),
    ],
  };

  return {
    eventId: "",
    roleKey: "Planner",
    source: "phase",
    phase,
    items: phaseItems[phase],
  };
}

export function defaultLayoutForRole(roleKey: DashboardRoleKey, phase: EventPhase): DashboardLayout {
  const byRole: Record<DashboardRoleKey, DashboardLayoutItem[]> = {
    Planner: suggestLayoutForPhase(phase).items,
    "Finance Manager": [
      item("budgetOverview", 0, 0, 6, 4),
      item("categoryBreakdown", 6, 0, 6, 4),
      item("contractExposure", 0, 4, 6, 4),
      item("revenueTracking", 6, 4, 6, 4),
    ],
    "Marketing Lead": [
      item("registrationPace", 0, 0, 6, 4),
      item("registrationFunnel", 6, 0, 6, 4),
      item("registrantDemographics", 0, 4, 6, 4),
      item("registrationForecast", 6, 4, 6, 4),
    ],
    "Sponsorship Coordinator": [
      item("sponsorRevenue", 0, 0, 6, 4),
      item("deliverablesTracker", 6, 0, 6, 4),
      item("exhibitorStatus", 0, 4, 6, 4),
      item("contractExposure", 6, 4, 6, 4),
    ],
    "Onsite Manager": [
      item("runOfShow", 0, 0, 6, 4),
      item("staffingStatus", 6, 0, 3, 4),
      item("incidentLog", 9, 0, 3, 4),
      item("avProductionStatus", 0, 4, 6, 4),
      item("fnbStatus", 6, 4, 6, 4),
    ],
    Executive: [
      item("budgetOverview", 0, 0, 6, 4),
      item("registrationPace", 6, 0, 6, 4),
      item("pickupOverview", 0, 4, 4, 4),
      item("sponsorRevenue", 4, 4, 4, 4),
      item("contractExposure", 8, 4, 4, 4),
    ],
  };

  return {
    eventId: "",
    roleKey,
    source: "role",
    phase,
    items: byRole[roleKey],
  };
}

function normalizeRoleKey(value: unknown): DashboardRoleKey {
  const roles: DashboardRoleKey[] = ["Planner", "Finance Manager", "Marketing Lead", "Sponsorship Coordinator", "Onsite Manager", "Executive"];
  return typeof value === "string" && roles.includes(value as DashboardRoleKey) ? (value as DashboardRoleKey) : "Planner";
}

function sanitizeLayoutItems(items: DashboardLayoutItem[]): DashboardLayoutItem[] {
  return items
    .filter((entry) => EVENT_COMMAND_CENTER_WIDGET_IDS.has(entry.widgetId))
    .map((entry, index) => ({
      widgetId: entry.widgetId,
      x: Math.max(0, Math.min(11, Math.round(entry.x))),
      y: Math.max(0, Math.round(entry.y ?? index * 4)),
      w: Math.max(1, Math.min(12, Math.round(entry.w))),
      h: Math.max(2, Math.min(12, Math.round(entry.h))),
      visible: entry.visible !== false,
    }));
}

export async function getEventCommandCenterLayout(
  eventId: string,
  user: RequestUserContext,
  roleKeyInput?: string,
): Promise<DashboardLayout> {
  await assertCommandCenterAccess(eventId, user);
  const roleKey = normalizeRoleKey(roleKeyInput);
  // Custom widget layout is intentionally session-only in this pass because
  // schema changes are not approved here. Do not read UserDashboardLayout.
  // The layout only needs the event phase, which derives solely from startDate,
  // so avoid running the full command-center aggregation just to read one field.
  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: { startDate: true },
  });
  if (!event) {
    throw new EventCommandCenterServiceError("Event not found", 404);
  }
  const phase = eventPhase(daysBetween(startOfDay(new Date()), event.startDate));
  const fallback = defaultLayoutForRole(roleKey, phase);
  return { ...fallback, eventId, userId: user.id, phase };
}

export async function saveEventCommandCenterLayout(
  eventId: string,
  user: RequestUserContext,
  input: DashboardLayoutInput,
): Promise<DashboardLayout> {
  await assertCommandCenterAccess(eventId, user);
  const roleKey = normalizeRoleKey(input.roleKey);
  const phase = input.phase;
  const items = sanitizeLayoutItems(input.items);
  // Custom widget layout is currently session-only because schema changes are
  // not approved in this pass. Return the sanitized layout without persisting.
  return {
    eventId,
    userId: user.id,
    roleKey,
    source: "phase",
    phase,
    items,
    updatedAt: new Date().toISOString(),
  };
}
