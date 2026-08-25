import { type EventAccessUser } from "@/lib/event-access";
import {
  getEventDateBoundaries,
  eventCalendarDayStart,
  isInstantOverdue,
  isInstantThisWeek,
  isInstantToday,
  type EventDateBoundaries,
} from "@/lib/event-time-boundaries";
import {
  getEventAttention,
  type AttentionFinding,
  type AttentionFindingCategory,
  type AttentionSourceReference,
  type EventAttentionResult,
} from "@/src/server/services/event-attention";
import { getPrisma } from "@/lib/prisma";
import { buildTimelineDashboard, type DashboardBuildInput } from "@/src/server/services/timeline-dashboard";

export type QuestionIntent =
  | "focus_today"
  | "session_risk"
  | "missing_information"
  | "upcoming_deadlines"
  | "warning_explanation"
  | "session_fnb_selected"
  | "session_fnb_not_selected"
  | "session_fnb_unavailable"
  | "session_fnb_not_required"
  | "session_fnb_status"
  | "session_readiness"
  | "session_lookup"
  | "roadmap_list"
  | "roadmap_overdue"
  | "roadmap_upcoming"
  | "roadmap_today"
  | "roadmap_tomorrow"
  | "roadmap_blocked"
  | "roadmap_dependencies"
  | "roadmap_complete"
  | "roadmap_outstanding"
  | "roadmap_at_risk"
  | "roadmap_attention"
  | "roadmap_lookup"
  | "unsupported";

export type QuestionSupport = "supported" | "partial" | "unsupported";
export type QuestionDomain = "event" | "roadmap";
export type QuestionOperation = "list" | "lookup" | "count" | "summarize" | "overdue" | "upcoming" | "today" | "tomorrow" | "blocked" | "incomplete" | "dependencies" | "complete" | "outstanding" | "at_risk" | "attention" | "status";

export type RetrievedSource = {
  entityType: string;
  entityId: string;
  label: string;
  field?: string;
  value?: string | number | boolean | null;
  route?: string;
};

export type SessionFnbStatus = "selected" | "not_selected" | "unavailable" | "not_required";

export type RetrievedSession = {
  sessionId: string;
  name: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  route: string;
  speakers: string[];
  avRequirements: string[];
  fnbStatus: SessionFnbStatus;
  fnbSelections: string[];
  foodService: {
    serviceType: string;
    serviceStyle: string | null;
    headcount: number | null;
  } | null;
  missingFields: string[];
};

export type RetrievedRoadmapItem = {
  itemId: string;
  name: string;
  description: null;
  status: string;
  owner: { id: string; name: string | null; email: string } | null;
  eventArea: string | null;
  dueDate: string | null;
  startDate: string | null;
  completionDate: null;
  dependencies: Array<{ itemId: string; name: string; status: string }>;
  overdue: boolean;
  blocked: boolean;
  incomplete: boolean;
  atRisk: boolean;
  isCriticalPath: boolean;
  route: string;
};

export type QuestionContext = {
  eventId: string;
  domain: QuestionDomain;
  operation: QuestionOperation;
  question: string;
  normalizedQuestion: string;
  intent: QuestionIntent;
  support: QuestionSupport;
  generatedAt: string;
  attentionFindings: AttentionFinding[];
  sessions: RetrievedSession[];
  roadmapItems: RetrievedRoadmapItem[];
  sources: RetrievedSource[];
  facts: {
    criticalFindings: number;
    warningFindings: number;
    informationalFindings: number;
    overdueTasks: number;
    upcomingDeadlines: number;
    pendingApprovals: number;
    incompleteSessions: number;
    sessionsWithFnbSelected: number;
    sessionsWithoutFnbSelected: number;
    sessionsWithFnbUnavailable: number;
    sessionsNotRequiringFnb: number;
  };
  roadmapFacts: { total: number; complete: number; incomplete: number; overdue: number; blocked: number; atRisk: number; withDependencies: number };
  resultSummary: string | null;
  answerability: "answerable" | "partially_answerable" | "not_answerable";
  ambiguousMatch: boolean;
  limitations: string[];
  insufficientData: boolean;
  temporalContext: EventDateBoundaries;
};

export type QuestionRetrievalPlan = {
  intent: QuestionIntent;
  support: QuestionSupport;
  limitations: string[];
  matches: (finding: AttentionFinding) => boolean;
  domain?: QuestionDomain;
  operation?: QuestionOperation;
  sessionQuery?: {
    filter: "all" | "fnb_selected" | "fnb_not_selected" | "fnb_unavailable" | "fnb_not_required" | "fnb_complete" | "menu_selected" | "incomplete" | "lookup";
    sessionName?: string;
  };
  roadmapQuery?: {
    filter: "all" | "overdue" | "upcoming" | "today" | "tomorrow" | "blocked" | "dependencies" | "complete" | "incomplete" | "outstanding" | "at_risk" | "attention" | "lookup";
    name?: string;
    owner?: string;
    range?: "this_week" | "next_week";
  };
};

export const QUESTION_CONTEXT_FINDING_LIMIT = 50;

const MISSING_INFORMATION_CATEGORIES = new Set<AttentionFindingCategory>([
  "missing_owner",
  "session_readiness",
  "room_set",
  "av",
  "food_beverage",
  "speaker",
]);

function normalized(value: string): string {
  return value.trim().replace(/[?.!,;:]+$/g, "").replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Deterministic classifier for the explicitly supported first-question set. */
export function classifyEventQuestion(question: string): QuestionRetrievalPlan {
  const value = normalized(question);
  const roadmapWording = /\b(roadmap|milestones?|timeline items?|timeline)\b/.test(value);
  if (roadmapWording) {
    const nameMatch = /\bstatus of\s+(.+?)(?:\s+on the roadmap)?$/.exec(value);
    const ownerMatch = /\bassigned to\s+(.+?)$/.exec(value);
    const filter = /\b(overdue|past due)\b/.test(value) ? "overdue"
      : /\b(tomorrow|due tomorrow)\b/.test(value) ? "tomorrow"
      : /\b(today|due today)\b/.test(value) ? "today"
        : /\b(this week|coming up|upcoming|approaching|next week)\b/.test(value) ? "upcoming"
          : /\bblocked|blocking\b/.test(value) ? "blocked"
            : /\bdependenc(?:y|ies)|depends on\b/.test(value) ? "dependencies"
              : /\bcomplete|completed\b/.test(value) ? "complete"
                : /\boutstanding|incomplete|open|remaining\b/.test(value) ? "outstanding"
                  : /\bneeds attention|attention\b/.test(value) ? "attention"
                    : /\bat risk|risk\b/.test(value) ? "at_risk"
                    : nameMatch ? "lookup" : "all";
    const operation: QuestionOperation = ["overdue", "tomorrow", "today", "upcoming", "blocked", "dependencies", "complete", "outstanding", "at_risk", "attention", "lookup"].includes(filter) ? filter as QuestionOperation : /\b(count|how many)\b/.test(value) ? "count" : /\bstatus\b/.test(value) ? "status" : "list";
    return {
      intent: filter === "overdue" ? "roadmap_overdue" : filter === "tomorrow" ? "roadmap_tomorrow" : filter === "today" ? "roadmap_today" : filter === "upcoming" ? "roadmap_upcoming" : filter === "blocked" ? "roadmap_blocked" : filter === "dependencies" ? "roadmap_dependencies" : filter === "complete" ? "roadmap_complete" : filter === "outstanding" ? "roadmap_outstanding" : filter === "at_risk" ? "roadmap_at_risk" : filter === "attention" ? "roadmap_attention" : filter === "lookup" ? "roadmap_lookup" : "roadmap_list",
      support: "supported",
      limitations: ["Roadmap status, dates, owners, and dependencies are retrieved from verified timeline records. Risk is limited to the existing timeline dashboard rules."],
      matches: () => false,
      domain: "roadmap",
      operation,
      roadmapQuery: { filter, ...(nameMatch ? { name: nameMatch[1].trim() } : {}), ...(ownerMatch ? { owner: ownerMatch[1].trim() } : {}), ...(/\bnext week\b/.test(value) ? { range: "next_week" as const } : /\bthis week\b/.test(value) ? { range: "this_week" as const } : {}) },
    };
  }
  const directLookupPatterns: Array<{ pattern: RegExp; readiness?: boolean }> = [
    { pattern: /^what is scheduled for (.+)$/ },
    { pattern: /^what room is (.+?) in$/ },
    { pattern: /^who is speaking at (.+)$/ },
    { pattern: /^what (?:food|f&b|catering|menu|meal|refreshments?) is selected for (.+)$/ },
    { pattern: /^what is missing for (.+)$/, readiness: true },
  ];
  for (const lookup of directLookupPatterns) {
    const match = lookup.pattern.exec(value);
    const sessionName = match?.[1]?.trim();
    if (sessionName) {
      return {
        intent: lookup.readiness ? "session_readiness" : "session_lookup",
        support: lookup.readiness ? "partial" : "supported",
        limitations: lookup.readiness
          ? ["Session readiness covers verified schedule times, room assignments, speakers, AV records, and explicitly required F&B. It does not infer session ownership or unrecorded requirements."]
          : [],
        matches: () => false,
        sessionQuery: { filter: lookup.readiness ? "incomplete" : "lookup", sessionName },
      };
    }
  }

  const hasSessionWording = /\bsessions?\b/.test(value);
  const hasFnbWording = /\b(food|catering|menus?|meals?|refreshments?)\b|f\s*&\s*b/.test(value);
  if (hasSessionWording && hasFnbWording && !/\b(speakers?|rooms?|av|a\/v)\b/.test(value)) {
    const asksMissing = /\b(do not|don't|without|missing|not selected|no food|no menu)\b/.test(value);
    const asksUnavailable = /\b(unavailable|unknown|not available|no information|information missing)\b/.test(value);
    const asksNotRequired = /\b(not required|do not require|don't require|no f\s*&\s*b required|no food required)\b/.test(value);
    const asksCompleted = /\b(complete|completed|ready)\b/.test(value);
    const asksMenu = /\bmenus?\b/.test(value) && /\b(assigned|selected|have|has)\b/.test(value);
    const asksStatus = /\b(status|overview|all sessions)\b/.test(value);
    const filter = asksNotRequired
      ? "fnb_not_required"
      : asksUnavailable
        ? "fnb_unavailable"
        : asksMissing
          ? "fnb_not_selected"
          : asksCompleted
            ? "fnb_complete"
            : asksMenu
              ? "menu_selected"
              : asksStatus
                ? "all"
                : "fnb_selected";
    const intent: QuestionIntent = filter === "fnb_not_required"
      ? "session_fnb_not_required"
      : filter === "fnb_unavailable"
        ? "session_fnb_unavailable"
        : filter === "fnb_not_selected"
          ? "session_fnb_not_selected"
          : filter === "fnb_selected" || filter === "menu_selected"
            ? "session_fnb_selected"
            : "session_fnb_status";
    return {
      intent,
      support: "supported",
      limitations: [
        "Sessions with no F&B record and no explicit meal requirement are reported as information unavailable, not as missing F&B.",
      ],
      matches: () => false,
      sessionQuery: { filter },
    };
  }

  if (
    /\b(which|what)\s+sessions?\b/.test(value) &&
    /\b(incomplete|missing|need|needs)\b/.test(value) &&
    /\b(speakers?|rooms?|av|a\/v|food|f\s*&\s*b|catering|menus?|meals?)?\b/.test(value)
  ) {
    return {
      intent: "session_readiness",
      support: "partial",
      limitations: [
        "Session readiness covers verified schedule times, room assignments, speakers, AV records, and explicitly required F&B.",
        "Session ownership and unrecorded AV, room-set, or speaker requirements cannot be evaluated safely.",
      ],
      matches: (finding) => finding.sourceReferences.some((source) => source.entityType === "matrix_row"),
      sessionQuery: { filter: "incomplete" },
    };
  }

  if (/(what should i focus on|focus on today|focus today)/.test(value)) {
    return {
      intent: "focus_today",
      support: "partial",
      limitations: [
        "Current attention checks identify overdue work, urgent deadlines, and critical conflicts, but do not define a planner-specific daily priority policy.",
      ],
      matches: (finding) => finding.severity === "critical" || finding.category === "overdue_task" || finding.category === "deadline",
    };
  }

  if (/(which sessions|session).*(greatest risk|at risk|risk)|(greatest risk|session risk)/.test(value)) {
    return {
      intent: "session_risk",
      support: "supported",
      limitations: ["Risk is based only on deterministic session readiness and speaker scheduling findings."],
      matches: (finding) => finding.category === "conflict" || finding.sourceReferences.some((source) => source.entityType === "matrix_row"),
    };
  }

  if (/(what information|information).*(missing|still missing)|(missing information|what is missing)/.test(value)) {
    return {
      intent: "missing_information",
      support: "partial",
      limitations: [
        "AV requirements, session ownership, room-set layouts, and speaker profile completeness are not universally defined in the current data model.",
      ],
      matches: (finding) => MISSING_INFORMATION_CATEGORIES.has(finding.category),
    };
  }

  if (/(deadline|deadlines).*(coming up|this week|upcoming)|(coming up|upcoming).*(deadline|deadlines)/.test(value)) {
    return {
      intent: "upcoming_deadlines",
      support: "partial",
      limitations: [
        "The verified attention service preserves its 14-day retrieval window; “this week” is narrowed to the remaining Monday-through-Sunday event-local week.",
      ],
      matches: (finding) => finding.category === "deadline",
    };
  }

  if (/(why.*warning|why.*warnings|warning.*explain|explain.*warning)/.test(value)) {
    return {
      intent: "warning_explanation",
      support: "supported",
      limitations: ["This context explains deterministic warning findings only; it does not infer causes beyond verified records."],
      matches: (finding) => finding.severity === "warning",
    };
  }

  return {
    intent: "unsupported",
    support: "unsupported",
    limitations: [
      "This question does not match a verified retrieval workflow yet.",
      "No model reasoning or unverified event data is included in this context.",
    ],
    matches: () => false,
  };
}

function sourceRoute(eventId: string, source: AttentionSourceReference): string | undefined {
  if (source.entityType === "matrix_row") return `/events/${eventId}/matrix/sessions/${source.entityId}`;
  return undefined;
}

function sourcesFromFindings(eventId: string, findings: AttentionFinding[]): RetrievedSource[] {
  const sources = new Map<string, RetrievedSource>();
  for (const finding of findings) {
    for (const source of finding.sourceReferences) {
      const key = [source.entityType, source.entityId, source.field ?? ""].join("\u001f");
      if (!sources.has(key)) {
        sources.set(key, { ...source, route: sourceRoute(eventId, source) });
      }
    }
  }
  return Array.from(sources.values()).sort((a, b) =>
    [a.entityType, a.label, a.entityId, a.field ?? ""].join("\u001f").localeCompare(
      [b.entityType, b.label, b.entityId, b.field ?? ""].join("\u001f"),
    ),
  );
}

function findingDueInstant(finding: AttentionFinding): Date | null {
  const value = finding.sourceReferences.find((source) => source.field === "dueAt")?.value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function selectFindings(
  question: string,
  plan: QuestionRetrievalPlan,
  attention: EventAttentionResult,
  temporalContext: EventDateBoundaries,
): AttentionFinding[] {
  const candidates = attention.findings.filter(plan.matches);
  if (plan.intent === "upcoming_deadlines") {
    const asksForThisWeek = /\bthis week\b/.test(normalized(question));
    return candidates.filter((finding) => {
      const dueAt = findingDueInstant(finding);
      if (!dueAt || isInstantOverdue(dueAt, temporalContext)) return false;
      return !asksForThisWeek || isInstantThisWeek(dueAt, temporalContext);
    });
  }
  if (plan.intent === "focus_today") {
    return candidates.filter((finding) => {
      if (finding.severity === "critical" || finding.category === "overdue_task") return true;
      const dueAt = findingDueInstant(finding);
      return dueAt ? isInstantOverdue(dueAt, temporalContext) || isInstantToday(dueAt, temporalContext) : false;
    });
  }
  return candidates;
}

function factsFromAttention(attention: EventAttentionResult) {
  const incompleteSessionIds = new Set(
    attention.findings
      .filter((finding) => MISSING_INFORMATION_CATEGORIES.has(finding.category))
      .flatMap((finding) => finding.sourceReferences)
      .filter((source) => source.entityType === "matrix_row")
      .map((source) => source.entityId),
  );

  return {
    criticalFindings: attention.summary.critical,
    warningFindings: attention.summary.warning,
    informationalFindings: attention.summary.informational,
    overdueTasks: attention.findings.filter((finding) => finding.category === "overdue_task").length,
    upcomingDeadlines: attention.findings.filter((finding) => finding.category === "deadline").length,
    pendingApprovals: attention.findings.filter((finding) => finding.category === "approval" || finding.category === "budget").length,
    incompleteSessions: incompleteSessionIds.size,
    sessionsWithFnbSelected: 0,
    sessionsWithoutFnbSelected: 0,
    sessionsWithFnbUnavailable: 0,
    sessionsNotRequiringFnb: 0,
  };
}

export type SessionQuestionRow = {
  id: string;
  eventId: string;
  sessionName: string | null;
  dayDate: Date;
  startTime: Date | null;
  endTime: Date | null;
  mealPeriod: string | null;
  fnbNotes: string | null;
  avNotes: string | null;
  avNeeds: string | null;
  room: { eventId: string; name: string } | null;
  sessionFoodService: { serviceType: string; serviceStyle: string | null; headcount: number | null } | null;
  fnbCatalogAssignments: Array<{ catalogItem: { itemName: string; sourceMenu: { menuName: string } | null } }>;
  sessionAvRequirements: Array<{ avType: string; quantity: number | null }>;
  sessionSpeakerAssignments: Array<{ speaker: { eventId: string; name: string } }>;
};

export type RoadmapQuestionRow = {
  id: string;
  eventId: string;
  title: string;
  department: string | null;
  workstream: string | null;
  status: string;
  priority: string;
  isCriticalPath: boolean;
  ownerUser: { id: string; name: string | null; email: string } | null;
  parentId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  sortOrder: number;
  predecessorDependencies: Array<{
    eventId: string;
    predecessorItemId: string;
    predecessor: { id: string; eventId: string; title: string; status: string };
  }>;
};

const FNB_REQUIRED_MEAL_PERIODS = new Set(["BREAKFAST", "BREAK", "LUNCH", "RECEPTION", "DINNER", "OTHER"]);

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoTime(value: Date | null): string | null {
  return value?.toISOString().slice(11, 16) ?? null;
}

function compactUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function fnbStatusForSession(row: SessionQuestionRow): SessionFnbStatus {
  const hasSelection = row.fnbCatalogAssignments.length > 0 ||
    Boolean(row.sessionFoodService?.serviceType.trim()) ||
    Boolean(row.fnbNotes?.trim());
  if (hasSelection) return "selected";
  if (row.mealPeriod === "NONE") return "not_required";
  if (row.mealPeriod && FNB_REQUIRED_MEAL_PERIODS.has(row.mealPeriod)) return "not_selected";
  return "unavailable";
}

function sessionMissingFields(row: SessionQuestionRow, eventId: string, attention: EventAttentionResult): string[] {
  const categories = new Set(
    attention.findings
      .filter((finding) => finding.sourceReferences.some((source) => source.entityType === "matrix_row" && source.entityId === row.id))
      .map((finding) => finding.category),
  );
  const missing: string[] = [];
  if (!row.startTime || !row.endTime) missing.push("schedule time");
  if (!row.room || row.room.eventId !== eventId) missing.push("room");
  if (categories.has("speaker")) missing.push("speaker");
  if (categories.has("food_beverage")) missing.push("F&B");
  return missing;
}

function toRetrievedSession(row: SessionQuestionRow, eventId: string, attention: EventAttentionResult): RetrievedSession {
  const catalogSelections = row.fnbCatalogAssignments.map(({ catalogItem }) =>
    catalogItem.sourceMenu ? `${catalogItem.itemName} — ${catalogItem.sourceMenu.menuName}` : catalogItem.itemName,
  );
  return {
    sessionId: row.id,
    name: row.sessionName?.trim() || "Untitled session",
    date: isoDate(row.dayDate),
    startTime: isoTime(row.startTime),
    endTime: isoTime(row.endTime),
    room: row.room?.eventId === eventId ? row.room.name : null,
    route: `/events/${eventId}/matrix/sessions/${row.id}`,
    speakers: compactUnique(row.sessionSpeakerAssignments
      .filter((assignment) => assignment.speaker.eventId === eventId)
      .map((assignment) => assignment.speaker.name)),
    avRequirements: compactUnique([
      ...row.sessionAvRequirements.map((requirement) => requirement.quantity
        ? `${requirement.avType} (${requirement.quantity})`
        : requirement.avType),
      row.avNeeds,
      row.avNotes,
    ]),
    fnbStatus: fnbStatusForSession(row),
    fnbSelections: compactUnique([
      ...catalogSelections,
      row.sessionFoodService?.serviceType,
      row.sessionFoodService?.serviceStyle,
      row.fnbNotes,
    ]),
    foodService: row.sessionFoodService,
    missingFields: sessionMissingFields(row, eventId, attention),
  };
}

function normalizeSessionName(value: string): string {
  return normalized(value).replace(/[“”"']/g, "");
}

function selectSessionRows(
  rows: SessionQuestionRow[],
  plan: QuestionRetrievalPlan,
  eventId: string,
  attention: EventAttentionResult,
): { sessions: RetrievedSession[]; limitations: string[]; ambiguous: boolean } {
  const eventRows = rows.filter((row) => row.eventId === eventId);
  const allSessions = eventRows
    .map((row) => toRetrievedSession(row, eventId, attention))
    .sort((a, b) => [a.date, a.startTime ?? "", a.sessionId].join("\u001f").localeCompare([b.date, b.startTime ?? "", b.sessionId].join("\u001f")));
  const sessionQuery = plan.sessionQuery;
  const filter = sessionQuery?.filter;
  if (!filter) return { sessions: [], limitations: [], ambiguous: false };
  if (filter === "lookup" || sessionQuery.sessionName) {
    const target = normalizeSessionName(sessionQuery.sessionName ?? "");
    const exact = allSessions.filter((session) => normalizeSessionName(session.name) === target);
    if (exact.length === 1) return { sessions: exact, limitations: [], ambiguous: false };
    if (exact.length > 1) {
      return { sessions: exact, limitations: ["Multiple sessions have the same name. Use the session date or time to distinguish them."], ambiguous: true };
    }
    const partial = allSessions.filter((session) => normalizeSessionName(session.name).includes(target) || target.includes(normalizeSessionName(session.name)));
    if (partial.length === 1) return { sessions: partial, limitations: [], ambiguous: false };
    if (partial.length > 1) {
      return { sessions: partial, limitations: ["Multiple sessions match that name. Use a more specific session name."], ambiguous: true };
    }
    return { sessions: [], limitations: ["No session in this event matches that name."], ambiguous: false };
  }
  if (filter === "fnb_selected") return { sessions: allSessions.filter((session) => session.fnbStatus === "selected"), limitations: [], ambiguous: false };
  if (filter === "menu_selected") {
    const catalogSessionIds = new Set(eventRows.filter((row) => row.fnbCatalogAssignments.length > 0).map((row) => row.id));
    return { sessions: allSessions.filter((session) => catalogSessionIds.has(session.sessionId)), limitations: [], ambiguous: false };
  }
  if (filter === "fnb_not_selected") return { sessions: allSessions.filter((session) => session.fnbStatus === "not_selected"), limitations: [], ambiguous: false };
  if (filter === "fnb_unavailable") return { sessions: allSessions.filter((session) => session.fnbStatus === "unavailable"), limitations: [], ambiguous: false };
  if (filter === "fnb_not_required") return { sessions: allSessions.filter((session) => session.fnbStatus === "not_required"), limitations: [], ambiguous: false };
  if (filter === "all") return { sessions: allSessions, limitations: [], ambiguous: false };
  if (filter === "fnb_complete") {
    return {
      sessions: allSessions.filter((session) => session.fnbStatus === "selected" && typeof session.foodService?.headcount === "number"),
      limitations: ["F&B completion requires a verified selection and a recorded food-service headcount."],
      ambiguous: false,
    };
  }
  return { sessions: allSessions.filter((session) => session.missingFields.length > 0), limitations: [], ambiguous: false };
}

function sessionResultSummary(plan: QuestionRetrievalPlan, sessions: RetrievedSession[], ambiguous: boolean): string | null {
  if (ambiguous) return `${sessions.length} sessions match this name.`;
  if (plan.intent === "session_lookup" || plan.sessionQuery?.sessionName) {
    return sessions.length === 1 ? `Found verified details for ${sessions[0].name}.` : "No matching session was found in this event.";
  }
  if (plan.intent === "session_readiness") {
    if (sessions.length === 0) return "No sessions have verified incomplete readiness details.";
    return `${sessions.length} ${sessions.length === 1 ? "session has" : "sessions have"} verified incomplete readiness details.`;
  }
  const filter = plan.sessionQuery?.filter;
  if (filter === "fnb_not_selected") {
    if (sessions.length === 0) return "No sessions explicitly requiring F&B are missing a verified selection.";
    return `${sessions.length} ${sessions.length === 1 ? "session requires" : "sessions require"} F&B but ${sessions.length === 1 ? "does" : "do"} not have a verified selection.`;
  }
  if (filter === "fnb_unavailable") {
    if (sessions.length === 0) return "No sessions have unavailable F&B information.";
    return `${sessions.length} ${sessions.length === 1 ? "session has" : "sessions have"} no verified F&B requirement or selection information.`;
  }
  if (filter === "fnb_not_required") {
    if (sessions.length === 0) return "No sessions are explicitly marked as not requiring F&B.";
    return `${sessions.length} ${sessions.length === 1 ? "session is" : "sessions are"} explicitly marked as not requiring F&B.`;
  }
  if (filter === "fnb_complete") {
    if (sessions.length === 0) return "No sessions have completed verified F&B details.";
    return `${sessions.length} ${sessions.length === 1 ? "session has" : "sessions have"} completed verified F&B details.`;
  }
  if (filter === "menu_selected") {
    if (sessions.length === 0) return "No sessions have verified menu assignments.";
    return `${sessions.length} ${sessions.length === 1 ? "session has" : "sessions have"} verified menu assignments.`;
  }
  if (filter === "all") return `F&B status is available for ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}.`;
  if (sessions.length === 0) return "No sessions have verified food selections.";
  return `${sessions.length} ${sessions.length === 1 ? "session has" : "sessions have"} verified food selections.`;
}

function localDateForInstant(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function roadmapDates(temporalContext: EventDateBoundaries): { today: string; tomorrow: string; weekEnd: string; nextWeekStart: string; nextWeekEnd: string } {
  const start = (offset: number) => localDateForInstant(eventCalendarDayStart(temporalContext, offset).toISOString(), temporalContext.resolvedTimezone);
  return { today: temporalContext.localDate, tomorrow: start(1), weekEnd: localDateForInstant(temporalContext.weekEndExclusive, temporalContext.resolvedTimezone), nextWeekStart: start(7), nextWeekEnd: start(14) };
}

function roadmapItemHref(eventId: string, itemId: string): string {
  return `/events/${encodeURIComponent(eventId)}/timeline?focus=${encodeURIComponent(itemId)}`;
}

function normalizedRoadmap(value: string): string {
  return normalized(value).replace(/[“”"']/g, "");
}

function sameEventPredecessorDependencies(row: RoadmapQuestionRow, eventId: string) {
  return row.predecessorDependencies.filter(
    (dependency) => dependency.eventId === eventId && dependency.predecessor.eventId === eventId,
  );
}

function toRoadmapItem(row: RoadmapQuestionRow, eventId: string, temporalContext: EventDateBoundaries, dashboard: ReturnType<typeof buildTimelineDashboard>): RetrievedRoadmapItem {
  const dates = roadmapDates(temporalContext);
  const endDate = row.endDate?.toISOString().slice(0, 10) ?? null;
  const dashboardBlocker = dashboard.blockers.find((blocker) => blocker.id === row.id);
  const dependencyBlocked = Boolean(dashboardBlocker?.reason === "DEPENDENCY_BLOCKED");
  const overdue = row.status !== "COMPLETE" && Boolean(endDate && endDate < dates.today);
  const atRisk = row.status === "AT_RISK";
  return {
    itemId: row.id,
    name: row.title,
    description: null,
    status: row.status,
    owner: row.ownerUser,
    eventArea: row.workstream ?? row.department,
    dueDate: endDate,
    startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
    completionDate: null,
    dependencies: sameEventPredecessorDependencies(row, eventId).map((dependency) => ({ itemId: dependency.predecessor.id, name: dependency.predecessor.title, status: dependency.predecessor.status })),
    overdue,
    blocked: dependencyBlocked,
    incomplete: row.status !== "COMPLETE",
    atRisk,
    isCriticalPath: row.isCriticalPath,
    route: roadmapItemHref(eventId, row.id),
  };
}

function selectRoadmapRows(
  rows: RoadmapQuestionRow[],
  plan: QuestionRetrievalPlan,
  eventId: string,
  temporalContext: EventDateBoundaries,
): { items: RetrievedRoadmapItem[]; limitations: string[]; ambiguous: boolean } {
  const eventRows = rows.filter((row) => row.eventId === eventId && row.title.trim().toLowerCase() !== "event timeline");
  const dashboardInput: DashboardBuildInput = {
    event: { id: eventId, name: "", startDate: null, endDate: null },
    items: eventRows.map((row) => ({ id: row.id, title: row.title, department: row.department, workstream: row.workstream as DashboardBuildInput["items"][number]["workstream"], planningStage: null, status: row.status as DashboardBuildInput["items"][number]["status"], priority: row.priority as DashboardBuildInput["items"][number]["priority"], isCriticalPath: row.isCriticalPath, startDate: row.startDate, endDate: row.endDate, parentId: row.parentId, ownerUser: row.ownerUser })),
    dependencies: eventRows.flatMap((row) => sameEventPredecessorDependencies(row, eventId).map((dependency) => ({ predecessorItemId: dependency.predecessorItemId, successorItemId: row.id }))),
    now: new Date(temporalContext.referenceInstant),
  };
  const dashboard = buildTimelineDashboard(dashboardInput);
  const all = eventRows.map((row) => toRoadmapItem(row, eventId, temporalContext, dashboard)).sort((a, b) => [a.dueDate ?? "9999-99-99", a.name, a.itemId].join("\u001f").localeCompare([b.dueDate ?? "9999-99-99", b.name, b.itemId].join("\u001f")));
  const query = plan.roadmapQuery;
  if (!query) return { items: [], limitations: [], ambiguous: false };
  let candidates = all;
  if (query.name) {
    const target = normalizedRoadmap(query.name);
    const exact = all.filter((item) => normalizedRoadmap(item.name) === target);
    if (exact.length === 1) candidates = exact;
    else if (exact.length > 1) return { items: exact, limitations: ["Multiple roadmap items have that name. Use a more specific name."], ambiguous: true };
    else {
      const partial = all.filter((item) => normalizedRoadmap(item.name).includes(target) || target.includes(normalizedRoadmap(item.name)));
      if (partial.length === 1) candidates = partial;
      else if (partial.length > 1) return { items: partial, limitations: ["Multiple roadmap items match that name. Use a more specific name."], ambiguous: true };
      else return { items: [], limitations: ["No roadmap item in this event matches that name."], ambiguous: false };
    }
  }
  if (query.owner) {
    const owner = normalizedRoadmap(query.owner);
    candidates = candidates.filter((item) => item.owner && (normalizedRoadmap(item.owner.name ?? "").includes(owner) || normalizedRoadmap(item.owner.email).includes(owner)));
  }
  const dates = roadmapDates(temporalContext);
  if (query.filter === "overdue") candidates = candidates.filter((item) => item.overdue);
  if (query.filter === "tomorrow") candidates = candidates.filter((item) => item.dueDate === dates.tomorrow && item.incomplete);
  if (query.filter === "today") candidates = candidates.filter((item) => item.dueDate === dates.today && item.incomplete);
  if (query.filter === "upcoming") candidates = candidates.filter((item) => item.dueDate !== null && item.incomplete && item.dueDate >= dates.today && item.dueDate < (query.range === "next_week" ? dates.nextWeekEnd : dates.weekEnd) && (query.range !== "next_week" || item.dueDate >= dates.nextWeekStart));
  if (query.filter === "blocked") candidates = candidates.filter((item) => item.blocked);
  if (query.filter === "dependencies") candidates = candidates.filter((item) => item.dependencies.length > 0);
  if (query.filter === "complete") candidates = candidates.filter((item) => item.status === "COMPLETE");
  if (query.filter === "outstanding" || query.filter === "incomplete") candidates = candidates.filter((item) => item.incomplete);
  if (query.filter === "at_risk") candidates = candidates.filter((item) => item.atRisk);
  if (query.filter === "attention") candidates = candidates.filter((item) => item.incomplete && (item.overdue || item.blocked || item.atRisk || item.isCriticalPath));
  return { items: candidates, limitations: [], ambiguous: false };
}

function roadmapResultSummary(plan: QuestionRetrievalPlan, items: RetrievedRoadmapItem[], ambiguous: boolean): string {
  if (ambiguous) return `${items.length} roadmap items match this name.`;
  if (items.length === 0) return "No verified roadmap items match this question.";
  const label = plan.operation === "overdue" ? "overdue roadmap items" : plan.operation === "blocked" ? "blocked roadmap items" : plan.operation === "complete" ? "completed roadmap items" : plan.operation === "dependencies" ? "roadmap items with verified dependencies" : plan.operation === "at_risk" ? "roadmap items at risk" : plan.operation === "today" ? "roadmap items due today" : plan.operation === "upcoming" ? "upcoming roadmap items" : "roadmap items";
  return `${items.length} ${label} found.`;
}

/**
 * Builds evidence for a future question-answering surface. It deliberately
 * delegates all finding calculation and event authorization to event-attention.
 * This service only classifies a question and selects a bounded, deterministic
 * subset of that already-authorized event-scoped evidence.
 */
export function buildEventQuestionContextFromAttention(
  eventId: string,
  question: string,
  attention: EventAttentionResult,
  sessionRows: SessionQuestionRow[] = [],
  roadmapRows: RoadmapQuestionRow[] = [],
): QuestionContext {
  if (attention.eventId !== eventId) {
    throw new Error("Question context requires attention findings for the requested event");
  }
  const plan = classifyEventQuestion(question);
  const temporalContext = attention.temporalContext ?? getEventDateBoundaries(new Date(attention.generatedAt), null);
  const matchingFindings = selectFindings(question, plan, attention, temporalContext);
  const attentionFindings = matchingFindings.slice(0, QUESTION_CONTEXT_FINDING_LIMIT);
  const sessionSelection = selectSessionRows(sessionRows, plan, eventId, attention);
  const sessions = sessionSelection.sessions.slice(0, QUESTION_CONTEXT_FINDING_LIMIT);
  const roadmapSelection = selectRoadmapRows(roadmapRows, plan, eventId, temporalContext);
  const roadmapItems = roadmapSelection.items.slice(0, QUESTION_CONTEXT_FINDING_LIMIT);
  const roadmapFacts = { total: roadmapSelection.items.length, complete: roadmapSelection.items.filter((item) => !item.incomplete).length, incomplete: roadmapSelection.items.filter((item) => item.incomplete).length, overdue: roadmapSelection.items.filter((item) => item.overdue).length, blocked: roadmapSelection.items.filter((item) => item.blocked).length, atRisk: roadmapSelection.items.filter((item) => item.atRisk).length, withDependencies: roadmapSelection.items.filter((item) => item.dependencies.length > 0).length };
  const allEventSessions = sessionRows
    .filter((row) => row.eventId === eventId)
    .map((row) => toRetrievedSession(row, eventId, attention));
  const sourceMap = new Map(
    sourcesFromFindings(eventId, attentionFindings).map((source) => [
      [source.entityType, source.entityId, source.field ?? ""].join("\u001f"),
      source,
    ]),
  );
  for (const session of sessions) {
    sourceMap.set(`matrix_row\u001f${session.sessionId}\u001f`, {
      entityType: "matrix_row",
      entityId: session.sessionId,
      label: session.name,
      route: session.route,
    });
  }
  for (const item of roadmapItems) {
    sourceMap.set(`timeline_item\u001f${item.itemId}\u001f`, {
      entityType: "timeline_item",
      entityId: item.itemId,
      label: item.name,
      route: item.route,
    });
  }
  const sources = Array.from(sourceMap.values()).sort((a, b) =>
    [a.entityType, a.label, a.entityId, a.field ?? ""].join("\u001f").localeCompare(
      [b.entityType, b.label, b.entityId, b.field ?? ""].join("\u001f"),
    ),
  );
  const usesSessionData = Boolean(plan.sessionQuery);
  const usesRoadmapData = Boolean(plan.roadmapQuery);
  const insufficientData = plan.support === "unsupported" ||
    (usesRoadmapData ? roadmapItems.length === 0 || roadmapSelection.ambiguous : usesSessionData ? sessions.length === 0 || sessionSelection.ambiguous : attentionFindings.length === 0);
  const limitations = [...plan.limitations];
  limitations.push(...sessionSelection.limitations);
  limitations.push(...roadmapSelection.limitations);
  if (!usesSessionData && attentionFindings.length === 0 && plan.support !== "unsupported") {
    limitations.push("No verified attention findings currently match this question for the event.");
  }
  if (sessionSelection.sessions.length > sessions.length) {
    limitations.push(`Session evidence is limited to the first ${QUESTION_CONTEXT_FINDING_LIMIT} records.`);
  }
  if (roadmapSelection.items.length > roadmapItems.length) {
    limitations.push(`Roadmap evidence is limited to the first ${QUESTION_CONTEXT_FINDING_LIMIT} records.`);
  }
  if (matchingFindings.length > attentionFindings.length) {
    limitations.push(`Evidence is limited to the first ${QUESTION_CONTEXT_FINDING_LIMIT} deterministic findings.`);
  }
  if (plan.intent !== "unsupported") {
    limitations.push(
      `Relative dates use ${temporalContext.resolvedTimezone}; weeks run Monday through Sunday.`,
    );
    if (temporalContext.timezoneSource !== "event") {
      limitations.push(`The event timezone was unavailable or invalid, so ${temporalContext.timezoneSource === "application_fallback" ? "the application fallback" : "UTC"} was used.`);
    }
  }

  const facts = factsFromAttention(attention);
  facts.sessionsWithFnbSelected = allEventSessions.filter((session) => session.fnbStatus === "selected").length;
  facts.sessionsWithoutFnbSelected = allEventSessions.filter((session) => session.fnbStatus === "not_selected").length;
  facts.sessionsWithFnbUnavailable = allEventSessions.filter((session) => session.fnbStatus === "unavailable").length;
  facts.sessionsNotRequiringFnb = allEventSessions.filter((session) => session.fnbStatus === "not_required").length;

  return {
    eventId,
    domain: plan.domain ?? "event",
    operation: plan.operation ?? "summarize",
    question,
    normalizedQuestion: normalized(question),
    intent: plan.intent,
    support: plan.support,
    generatedAt: attention.generatedAt,
    attentionFindings,
    sessions,
    roadmapItems,
    roadmapFacts,
    sources,
    facts,
    resultSummary: usesRoadmapData ? roadmapResultSummary(plan, roadmapItems, roadmapSelection.ambiguous) : usesSessionData ? sessionResultSummary(plan, sessions, sessionSelection.ambiguous) : null,
    answerability: plan.support === "unsupported" ? "not_answerable" : (usesRoadmapData ? roadmapSelection.ambiguous || roadmapItems.length === 0 : usesSessionData ? sessionSelection.ambiguous || sessions.length === 0 : attentionFindings.length === 0) ? "partially_answerable" : plan.support === "partial" ? "partially_answerable" : "answerable",
    ambiguousMatch: usesRoadmapData ? roadmapSelection.ambiguous : usesSessionData ? sessionSelection.ambiguous : false,
    limitations,
    insufficientData,
    temporalContext,
  };
}

export async function getEventQuestionContext(
  eventId: string,
  user: EventAccessUser,
  question: string,
  options: Parameters<typeof getEventAttention>[2] = {},
): Promise<QuestionContext> {
  const attention = await getEventAttention(eventId, user, options);
  const plan = classifyEventQuestion(question);
  const sessionRows = plan.sessionQuery
    ? await getPrisma().matrixRow.findMany({
        where: { eventId },
        orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          eventId: true,
          sessionName: true,
          dayDate: true,
          startTime: true,
          endTime: true,
          mealPeriod: true,
          fnbNotes: true,
          avNotes: true,
          avNeeds: true,
          room: { select: { eventId: true, name: true } },
          sessionFoodService: { select: { serviceType: true, serviceStyle: true, headcount: true } },
          fnbCatalogAssignments: {
            where: { catalogItem: { eventId, archivedAt: null } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              catalogItem: {
                select: {
                  itemName: true,
                  sourceMenu: { select: { menuName: true } },
                },
              },
            },
          },
          sessionAvRequirements: {
            orderBy: [{ avType: "asc" }, { id: "asc" }],
            select: { avType: true, quantity: true },
          },
          sessionSpeakerAssignments: {
            where: { speaker: { eventId } },
            orderBy: { speakerId: "asc" },
            select: { speaker: { select: { eventId: true, name: true } } },
          },
        },
      })
    : [];
  const roadmapRows = plan.roadmapQuery
    ? await getPrisma().timelineItem.findMany({
        where: { eventId, disposition: "ACTIVE" },
        orderBy: [{ sortOrder: "asc" }, { endDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          eventId: true,
          title: true,
          department: true,
          workstream: true,
          status: true,
          priority: true,
          isCriticalPath: true,
          ownerUser: { select: { id: true, name: true, email: true } },
          parentId: true,
          startDate: true,
          endDate: true,
          sortOrder: true,
          predecessorDependencies: {
            where: { eventId, predecessor: { eventId } },
            select: {
              eventId: true,
              predecessorItemId: true,
              predecessor: { select: { id: true, eventId: true, title: true, status: true } },
            },
          },
        },
      })
    : [];
  return buildEventQuestionContextFromAttention(eventId, question, attention, sessionRows, roadmapRows);
}
