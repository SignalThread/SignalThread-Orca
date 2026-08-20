"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Info,
  MessageCircleQuestion,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { EventModuleHeader, EventModuleSurface } from "../../_components/event-module-header";
import { ExecutiveBriefingPanel } from "./executive-briefing-panel";

type AttentionSeverity = "critical" | "warning" | "informational";

type AttentionSourceReference = {
  entityType: string;
  entityId: string;
  label: string;
  field?: string;
};

type AttentionFinding = {
  id: string;
  eventId: string;
  category: string;
  severity: AttentionSeverity;
  title: string;
  description: string;
  recommendedAction?: string;
  sourceReferences: AttentionSourceReference[];
};

type EventAttentionResult = {
  eventId: string;
  generatedAt: string;
  findings: AttentionFinding[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    informational: number;
  };
  support: {
    supportedChecks: string[];
    unsupportedChecks: string[];
    partialChecks: string[];
  };
};

type QuestionIntent =
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
type QuestionSupport = "supported" | "partial" | "unsupported";
type QuestionDomain = "event" | "roadmap";
type QuestionOperation = "list" | "lookup" | "count" | "summarize" | "overdue" | "upcoming" | "today" | "blocked" | "incomplete" | "dependencies" | "complete" | "outstanding" | "at_risk" | "status";
type SessionFnbStatus = "selected" | "not_selected" | "unavailable" | "not_required";

type RetrievedSource = {
  entityType: string;
  entityId: string;
  label: string;
  field?: string;
  value?: string | number | boolean | null;
  route?: string;
};

type RetrievedSession = {
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

type RetrievedRoadmapItem = {
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

type QuestionContext = {
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
  roadmapFacts: { total: number; complete: number; incomplete: number; overdue: number; blocked: number; atRisk: number; withDependencies: number };
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
  resultSummary: string | null;
  answerability: "answerable" | "partially_answerable" | "not_answerable";
  ambiguousMatch: boolean;
  limitations: string[];
  insufficientData: boolean;
};

type EventAttentionWorkspaceProps = {
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string | null;
};

type LoadState = "loading" | "ready" | "error";

const CATEGORY_LABELS: Record<string, string> = {
  conflict: "Conflict",
  overdue_task: "Overdue task",
  missing_owner: "Ownership",
  deadline: "Deadline",
  approval: "Approval",
  session_readiness: "Session readiness",
  room_set: "Room assignment",
  av: "AV",
  food_beverage: "Food & beverage",
  speaker: "Speaker",
  budget: "Budget",
};

const SEVERITY_STYLES: Record<AttentionSeverity, { label: string; badge: string; icon: string; border: string }> = {
  critical: {
    label: "Critical",
    badge: "bg-rose-100 text-rose-800",
    icon: "text-rose-700",
    border: "border-l-rose-500",
  },
  warning: {
    label: "Warning",
    badge: "bg-amber-100 text-amber-800",
    icon: "text-amber-700",
    border: "border-l-amber-500",
  },
  informational: {
    label: "Informational",
    badge: "bg-emerald-100 text-emerald-800",
    icon: "text-emerald-700",
    border: "border-l-emerald-500",
  },
};

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatEventDates(startDate: string, endDate: string | null): string {
  const start = formatEventDate(startDate);
  if (!endDate) return start;
  const end = formatEventDate(endDate);
  return start === end ? start : `${start} – ${end}`;
}

function summarizeFindings(findings: AttentionFinding[]): EventAttentionResult["summary"] {
  return findings.reduce<EventAttentionResult["summary"]>(
    (summary, finding) => {
      summary.total += 1;
      summary[finding.severity] += 1;
      return summary;
    },
    { total: 0, critical: 0, warning: 0, informational: 0 },
  );
}

function isSeverity(value: unknown): value is AttentionSeverity {
  return value === "critical" || value === "warning" || value === "informational";
}

function isSourceReference(value: unknown): value is AttentionSourceReference {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return typeof source.entityType === "string" && typeof source.entityId === "string" && typeof source.label === "string";
}

function isAttentionResult(value: unknown, eventId: string): value is EventAttentionResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  if (result.eventId !== eventId || typeof result.generatedAt !== "string" || !Array.isArray(result.findings)) return false;
  if (!result.summary || typeof result.summary !== "object" || !result.support || typeof result.support !== "object") return false;
  const summary = result.summary as Record<string, unknown>;
  const support = result.support as Record<string, unknown>;
  if (![summary.total, summary.critical, summary.warning, summary.informational].every((entry) => typeof entry === "number")) return false;
  if (![support.supportedChecks, support.partialChecks, support.unsupportedChecks].every(Array.isArray)) return false;

  return result.findings.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const finding = entry as Record<string, unknown>;
    return (
      typeof finding.id === "string" &&
      finding.eventId === eventId &&
      typeof finding.category === "string" &&
      isSeverity(finding.severity) &&
      typeof finding.title === "string" &&
      typeof finding.description === "string" &&
      (typeof finding.recommendedAction === "undefined" || typeof finding.recommendedAction === "string") &&
      Array.isArray(finding.sourceReferences) &&
      finding.sourceReferences.every(isSourceReference)
    );
  });
}

function isQuestionIntent(value: unknown): value is QuestionIntent {
  return value === "focus_today" ||
    value === "session_risk" ||
    value === "missing_information" ||
    value === "upcoming_deadlines" ||
    value === "warning_explanation" ||
    value === "session_fnb_selected" ||
    value === "session_fnb_not_selected" ||
    value === "session_fnb_unavailable" ||
    value === "session_fnb_not_required" ||
    value === "session_fnb_status" ||
    value === "session_readiness" ||
    value === "session_lookup" ||
    value === "roadmap_list" ||
    value === "roadmap_overdue" ||
    value === "roadmap_upcoming" ||
    value === "roadmap_today" ||
    value === "roadmap_tomorrow" ||
    value === "roadmap_blocked" ||
    value === "roadmap_dependencies" ||
    value === "roadmap_complete" ||
    value === "roadmap_outstanding" ||
    value === "roadmap_at_risk" ||
    value === "roadmap_attention" ||
    value === "roadmap_lookup" ||
    value === "unsupported";
}

function isQuestionSupport(value: unknown): value is QuestionSupport {
  return value === "supported" || value === "partial" || value === "unsupported";
}

function isRetrievedSource(value: unknown): value is RetrievedSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.entityType === "string" &&
    typeof source.entityId === "string" &&
    typeof source.label === "string" &&
    (typeof source.field === "undefined" || typeof source.field === "string") &&
    (typeof source.route === "undefined" || typeof source.route === "string")
  );
}

function isRetrievedSession(value: unknown, eventId: string): value is RetrievedSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  const expectedRoute = typeof session.sessionId === "string" ? `/events/${eventId}/matrix/sessions/${session.sessionId}` : "";
  const foodService = session.foodService;
  const validFoodService = foodService === null || (
    typeof foodService === "object" &&
    typeof (foodService as Record<string, unknown>).serviceType === "string" &&
    (typeof (foodService as Record<string, unknown>).serviceStyle === "string" || (foodService as Record<string, unknown>).serviceStyle === null) &&
    (typeof (foodService as Record<string, unknown>).headcount === "number" || (foodService as Record<string, unknown>).headcount === null)
  );
  return (
    typeof session.sessionId === "string" &&
    typeof session.name === "string" &&
    typeof session.date === "string" &&
    (typeof session.startTime === "string" || session.startTime === null) &&
    (typeof session.endTime === "string" || session.endTime === null) &&
    (typeof session.room === "string" || session.room === null) &&
    session.route === expectedRoute &&
    Array.isArray(session.speakers) &&
    session.speakers.every((entry) => typeof entry === "string") &&
    Array.isArray(session.avRequirements) &&
    session.avRequirements.every((entry) => typeof entry === "string") &&
    (session.fnbStatus === "selected" || session.fnbStatus === "not_selected" || session.fnbStatus === "unavailable" || session.fnbStatus === "not_required") &&
    Array.isArray(session.fnbSelections) &&
    session.fnbSelections.every((entry) => typeof entry === "string") &&
    validFoodService &&
    Array.isArray(session.missingFields) &&
    session.missingFields.every((entry) => typeof entry === "string")
  );
}

function isRetrievedRoadmapItem(value: unknown, eventId: string): value is RetrievedRoadmapItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const expectedRoute = typeof item.itemId === "string" ? `/events/${eventId}/timeline?focus=${encodeURIComponent(item.itemId)}` : "";
  return typeof item.itemId === "string" && typeof item.name === "string" && typeof item.status === "string" &&
    (item.owner === null || typeof item.owner === "object") && (typeof item.eventArea === "string" || item.eventArea === null) &&
    (typeof item.dueDate === "string" || item.dueDate === null) && (typeof item.startDate === "string" || item.startDate === null) &&
    item.route === expectedRoute && typeof item.overdue === "boolean" && typeof item.blocked === "boolean" &&
    typeof item.incomplete === "boolean" && typeof item.atRisk === "boolean" && typeof item.isCriticalPath === "boolean" &&
    Array.isArray(item.dependencies) && item.dependencies.every((dependency) => Boolean(dependency) && typeof dependency === "object" && typeof (dependency as Record<string, unknown>).itemId === "string" && typeof (dependency as Record<string, unknown>).name === "string" && typeof (dependency as Record<string, unknown>).status === "string");
}

function isQuestionContext(value: unknown, eventId: string): value is QuestionContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  if (
    context.eventId !== eventId ||
    (context.domain !== "event" && context.domain !== "roadmap") ||
    typeof context.operation !== "string" ||
    typeof context.question !== "string" ||
    typeof context.normalizedQuestion !== "string" ||
    !isQuestionIntent(context.intent) ||
    !isQuestionSupport(context.support) ||
    typeof context.generatedAt !== "string" ||
    !Array.isArray(context.attentionFindings) ||
    !Array.isArray(context.sessions) ||
    !Array.isArray(context.roadmapItems) ||
    !context.roadmapFacts || typeof context.roadmapFacts !== "object" ||
    !Array.isArray(context.sources) ||
    !Array.isArray(context.limitations) ||
    (typeof context.resultSummary !== "string" && context.resultSummary !== null) ||
    (context.answerability !== "answerable" && context.answerability !== "partially_answerable" && context.answerability !== "not_answerable") ||
    typeof context.ambiguousMatch !== "boolean" ||
    typeof context.insufficientData !== "boolean" ||
    !context.facts ||
    typeof context.facts !== "object"
  ) return false;
  const facts = context.facts as Record<string, unknown>;
  return (
    context.attentionFindings.every((finding) => isAttentionResult({
      eventId,
      generatedAt: context.generatedAt,
      findings: [finding],
      summary: { total: 0, critical: 0, warning: 0, informational: 0 },
      support: { supportedChecks: [], partialChecks: [], unsupportedChecks: [] },
    }, eventId)) &&
    context.sessions.every((session) => isRetrievedSession(session, eventId)) &&
    context.roadmapItems.every((item) => isRetrievedRoadmapItem(item, eventId)) &&
    context.sources.every(isRetrievedSource) &&
    context.limitations.every((limitation) => typeof limitation === "string") &&
    [
      facts.criticalFindings,
      facts.warningFindings,
      facts.informationalFindings,
      facts.overdueTasks,
      facts.upcomingDeadlines,
      facts.pendingApprovals,
      facts.incompleteSessions,
      facts.sessionsWithFnbSelected,
      facts.sessionsWithoutFnbSelected,
      facts.sessionsWithFnbUnavailable,
      facts.sessionsNotRequiringFnb,
    ].every((count) => typeof count === "number")
  );
}

function sourceHref(eventId: string, source: AttentionSourceReference): string | null {
  if (source.entityType === "matrix_row") {
    return `/events/${eventId}/matrix/sessions/${source.entityId}`;
  }
  return null;
}

function SeverityIcon({ severity, className = "" }: { severity: AttentionSeverity; className?: string }) {
  const style = SEVERITY_STYLES[severity];
  const iconClassName = `${style.icon} ${className}`.trim();
  if (severity === "critical") return <ShieldAlert className={iconClassName} aria-hidden />;
  if (severity === "warning") return <AlertTriangle className={iconClassName} aria-hidden />;
  return <Info className={iconClassName} aria-hidden />;
}

function SummaryCard({ severity, count }: { severity: AttentionSeverity | "total"; count: number }) {
  const content = severity === "total"
    ? { label: "Total findings", icon: CircleAlert, classes: "border-slate-200 bg-white text-slate-950" }
    : {
        label: SEVERITY_STYLES[severity].label,
        icon: severity === "critical" ? ShieldAlert : severity === "warning" ? AlertTriangle : CheckCircle2,
        classes: severity === "critical"
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : severity === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-emerald-200 bg-emerald-50 text-emerald-950",
      };
  const Icon = content.icon;
  return (
    <article className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 shadow-sm ${content.classes}`} aria-label={`${content.label}: ${count}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-2xl leading-none font-semibold">{count}</p>
        <p className="mt-1 truncate text-[12px] font-medium opacity-75">{content.label}</p>
      </div>
    </article>
  );
}

function FindingRow({ eventId, finding, showCategory = false }: { eventId: string; finding: AttentionFinding; showCategory?: boolean }) {
  const style = SEVERITY_STYLES[finding.severity];
  return (
    <article className={`min-w-0 border-l-4 px-3 py-2.5 sm:px-4 ${style.border}`}>
      <div className="flex min-w-0 gap-2.5">
        <SeverityIcon severity={finding.severity} className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[14px] leading-5 font-semibold text-slate-950">{finding.title}</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${style.badge}`}>
              {style.label}
            </span>
            {showCategory ? (
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600">
                {CATEGORY_LABELS[finding.category] ?? finding.category}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{finding.description}</p>
        </div>
      </div>

      {finding.recommendedAction ? (
        <p className="mt-1.5 pl-6 text-[12px] leading-5 text-slate-600">
          <span className="font-semibold text-slate-900">Recommended next step: </span>
          {finding.recommendedAction}
        </p>
      ) : null}

      {finding.sourceReferences.length > 0 ? (
        <div className="mt-1.5 pl-6">
          <ul className="flex flex-wrap gap-1.5" aria-label={`Related records for ${finding.title}`}>
            {finding.sourceReferences.map((source) => {
              const href = sourceHref(eventId, source);
              const content = (
                <>
                  <span className="max-w-[18rem] truncate">{source.label}</span>
                  {source.field ? <span className="text-slate-400">· {source.field}</span> : null}
                  {href ? <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                </>
              );
              return (
                <li key={`${source.entityType}:${source.entityId}:${source.field ?? ""}`} className="max-w-full">
                  {href ? (
                    <Link
                      href={href}
                      aria-label={`Open ${source.label}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-[#28439A] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#28439A]/40"
                    >
                      {content}
                    </Link>
                  ) : (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-600">
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function FindingFilters({
  category,
  categories,
  severity,
  onCategoryChange,
  onSeverityChange,
}: {
  category: string;
  categories: string[];
  severity: AttentionSeverity | "all";
  onCategoryChange: (value: string) => void;
  onSeverityChange: (value: AttentionSeverity | "all") => void;
}) {
  const options: Array<{ value: AttentionSeverity | "all"; label: string }> = [
    { value: "all", label: "All severity" },
    { value: "critical", label: "Critical" },
    { value: "warning", label: "Warnings" },
    { value: "informational", label: "Informational" },
  ];
  return (
    <div className="flex flex-col gap-2 border-y border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Attention filters">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSeverityChange(option.value)}
            aria-pressed={severity === option.value}
            className={[
              "rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#28439A]/40",
              severity === option.value ? "border-[#28439A] bg-[#28439A] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
        Category
        <select
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="h-8 min-w-36 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#28439A]/40"
        >
          <option value="">All categories</option>
          {categories.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value] ?? value}</option>)}
        </select>
      </label>
    </div>
  );
}

const QUESTION_EXAMPLES = [
  "What should I focus on today?",
  "Which sessions are at greatest risk?",
  "What information is still missing?",
  "What deadlines are coming up this week?",
] as const;

const INTENT_LABELS: Record<QuestionIntent, string> = {
  focus_today: "Today’s planning focus",
  session_risk: "Session risk",
  missing_information: "Missing information",
  upcoming_deadlines: "Upcoming deadlines",
  warning_explanation: "Warning explanation",
  session_fnb_selected: "Sessions with F&B selected",
  session_fnb_not_selected: "Sessions without required F&B selections",
  session_fnb_unavailable: "Sessions with unavailable F&B information",
  session_fnb_not_required: "Sessions not requiring F&B",
  session_fnb_status: "Session F&B status",
  session_readiness: "Session readiness",
  session_lookup: "Session lookup",
  roadmap_list: "Event roadmap",
  roadmap_overdue: "Overdue roadmap items",
  roadmap_upcoming: "Upcoming roadmap items",
  roadmap_today: "Roadmap items due today",
  roadmap_tomorrow: "Roadmap items due tomorrow",
  roadmap_blocked: "Blocked roadmap items",
  roadmap_dependencies: "Roadmap dependencies",
  roadmap_complete: "Completed roadmap items",
  roadmap_outstanding: "Outstanding roadmap items",
  roadmap_at_risk: "Roadmap items at risk",
  roadmap_attention: "Roadmap items needing attention",
  roadmap_lookup: "Roadmap item lookup",
  unsupported: "Not currently supported",
};

const SUPPORTED_QUESTION_CATEGORIES = [
  "Planning focus for today",
  "Sessions at greatest risk",
  "Missing event information",
  "Upcoming deadlines",
  "Why the event has warnings",
  "Session F&B status",
  "Session readiness and missing details",
  "Direct session details",
];

const QUESTION_SUPPORT_LABELS: Record<QuestionSupport, string> = {
  supported: "Supported",
  partial: "Partially supported",
  unsupported: "Not currently supported",
};

function questionRetrievalErrorMessage(status: number): string {
  if (status === 400) return "Enter a valid question of 1,000 characters or fewer.";
  if (status === 401 || status === 403) return "You do not have access to this event's AI Workspace.";
  if (status === 404) return "This event was not found or is no longer available.";
  return "Unable to retrieve verified event evidence. Please try again.";
}

function retrievedSourceHref(eventId: string, source: RetrievedSource): string | null {
  const expected = `/events/${eventId}/matrix/sessions/${source.entityId}`;
  return source.entityType === "matrix_row" && source.route === expected ? expected : null;
}

const FNB_STATUS_LABELS: Record<SessionFnbStatus, string> = {
  selected: "F&B selected",
  not_selected: "F&B not selected",
  unavailable: "F&B information unavailable",
  not_required: "F&B not required",
};

function SessionEvidenceRow({ session, eventId }: { session: RetrievedSession; eventId: string }) {
  const href = session.route === `/events/${eventId}/matrix/sessions/${session.sessionId}` ? session.route : null;
  const time = session.startTime
    ? `${session.startTime}${session.endTime ? `–${session.endTime}` : ""}`
    : "Time unavailable";
  return (
    <article className="min-w-0 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? (
            <Link href={href} className="inline-flex max-w-full items-center gap-1 font-semibold text-[#28439A] hover:underline focus:outline-none focus:ring-2 focus:ring-[#28439A]/40">
              <span className="truncate">{session.name}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </Link>
          ) : <h4 className="font-semibold text-slate-950">{session.name}</h4>}
          <p className="text-[11px] text-slate-500">{session.date} · {time} · {session.room ?? "Room unavailable"}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-700">
          {FNB_STATUS_LABELS[session.fnbStatus]}
        </span>
      </div>
      {session.fnbSelections.length > 0 ? (
        <p className="mt-1 text-slate-700"><span className="font-semibold">F&B: </span>{session.fnbSelections.join(", ")}</p>
      ) : null}
      {session.foodService ? (
        <p className="mt-0.5 text-slate-600">
          <span className="font-semibold">Service: </span>
          {[session.foodService.serviceType, session.foodService.serviceStyle, typeof session.foodService.headcount === "number" ? `Headcount ${session.foodService.headcount}` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {session.speakers.length > 0 ? <p className="mt-0.5 text-slate-600"><span className="font-semibold">Speakers: </span>{session.speakers.join(", ")}</p> : null}
      {session.avRequirements.length > 0 ? <p className="mt-0.5 text-slate-600"><span className="font-semibold">AV: </span>{session.avRequirements.join(", ")}</p> : null}
      {session.missingFields.length > 0 ? <p className="mt-0.5 text-amber-800"><span className="font-semibold">Missing: </span>{session.missingFields.join(", ")}</p> : null}
    </article>
  );
}

function RoadmapEvidenceRow({ item, eventId }: { item: RetrievedRoadmapItem; eventId: string }) {
  const href = item.route === `/events/${eventId}/timeline?focus=${encodeURIComponent(item.itemId)}` ? item.route : null;
  return (
    <article className="min-w-0 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? <Link href={href} className="inline-flex max-w-full gap-1 font-semibold text-[#28439A] hover:underline focus:outline-none focus:ring-2 focus:ring-[#28439A]/40"><span className="truncate">{item.name}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /></Link> : <h4 className="font-semibold text-slate-950">{item.name}</h4>}
          <p className="text-[11px] text-slate-500">{item.eventArea ?? "Unassigned area"}{item.owner ? ` · ${item.owner.name ?? item.owner.email}` : " · Unassigned"}{item.dueDate ? ` · Due ${item.dueDate}` : " · No due date"}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-700">{item.status}</span>
      </div>
      {item.dependencies.length > 0 ? <p className="mt-1 text-slate-600"><span className="font-semibold">Dependencies: </span>{item.dependencies.map((dependency) => `${dependency.name} (${dependency.status})`).join(", ")}</p> : null}
      {(item.overdue || item.blocked || item.atRisk || item.incomplete) ? <p className="mt-0.5 text-amber-800">{[item.overdue && "Overdue", item.blocked && "Blocked by dependency", item.atRisk && "At risk", item.incomplete && "Incomplete"].filter(Boolean).join(" · ")}</p> : null}
    </article>
  );
}

function QuestionEvidence({ context, eventId, onDismiss }: { context: QuestionContext; eventId: string; onDismiss: () => void }) {
  const supportMessage = context.support === "supported"
    ? "This question is supported by the information currently available."
    : context.support === "partial"
      ? "This question is partially supported by the information currently available."
      : "This question type is not currently supported.";
  const requestedFnbCounts: Array<[string, number]> = context.intent === "session_fnb_selected"
    ? [["F&B selected", context.facts.sessionsWithFnbSelected]]
    : context.intent === "session_fnb_not_selected"
      ? [["F&B not selected", context.facts.sessionsWithoutFnbSelected]]
      : context.intent === "session_fnb_unavailable"
        ? [["F&B unavailable", context.facts.sessionsWithFnbUnavailable]]
        : context.intent === "session_fnb_not_required"
          ? [["F&B not required", context.facts.sessionsNotRequiringFnb]]
          : context.intent === "session_fnb_status"
            ? [
                ["F&B selected", context.facts.sessionsWithFnbSelected],
                ["F&B not selected", context.facts.sessionsWithoutFnbSelected],
                ["F&B unavailable", context.facts.sessionsWithFnbUnavailable],
                ["F&B not required", context.facts.sessionsNotRequiringFnb],
              ]
            : [];
  const attentionCounts: Array<[string, number]> = context.intent.startsWith("session_fnb_") ? [] : [
    ["Critical", context.facts.criticalFindings],
    ["Warnings", context.facts.warningFindings],
    ["Overdue tasks", context.facts.overdueTasks],
    ["Upcoming deadlines", context.facts.upcomingDeadlines],
    ["Pending approvals", context.facts.pendingApprovals],
    ["Incomplete sessions", context.facts.incompleteSessions],
  ];
  const factualCounts = [
    ...attentionCounts,
    ...requestedFnbCounts,
  ].filter(([, count]) => typeof count === "number") as Array<[string, number]>;

  return (
    <section
      className="mt-3 min-w-0 rounded-lg border border-[#28439A]/20 bg-white p-3 text-[12px] leading-5 text-slate-700"
      aria-labelledby="question-evidence-heading"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="question-evidence-heading" className="font-semibold text-[#28439A]">Here’s what your event data shows</h3>
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <div>
              <dt className="inline font-semibold text-slate-500">Question type: </dt>
              <dd className="inline font-semibold text-slate-950">{INTENT_LABELS[context.intent]}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Coverage: </dt>
              <dd className="inline font-semibold text-slate-950">{QUESTION_SUPPORT_LABELS[context.support]}</dd>
            </div>
          </dl>
          <p className="mt-1">Based on verified event data. {supportMessage}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss question evidence"
          className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#28439A]/40"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {context.support === "unsupported" ? (
        <div className="mt-3 rounded-md bg-slate-50 p-2.5">
          <p className="font-semibold text-slate-900">Supported question categories</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
            {SUPPORTED_QUESTION_CATEGORIES.map((category) => <li key={category}>{category}</li>)}
          </ul>
        </div>
      ) : (
        <>
          {context.insufficientData ? <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-2 text-amber-900">There is not enough verified information to answer this fully.</p> : null}
          {context.resultSummary ? <p className="mt-3 font-semibold text-slate-900">{context.resultSummary}</p> : null}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3" aria-label="Verified event counts">
            {factualCounts.map(([label, count]) => (
              <div key={label} className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5">
                <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500">{label}</dt>
                <dd className="text-[14px] font-semibold text-slate-900">{count}</dd>
              </div>
            ))}
          </dl>

          {context.sessions.length > 0 ? (
            <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-slate-200">
              <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600">Session evidence</p>
              <div className="divide-y divide-slate-100">
                {context.sessions.map((session) => <SessionEvidenceRow key={session.sessionId} eventId={eventId} session={session} />)}
              </div>
            </div>
          ) : null}

          {context.roadmapItems.length > 0 ? (
            <div className="mt-3 min-w-0 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600"><span className="font-semibold uppercase tracking-[0.06em]">Roadmap evidence</span><span className="ml-2">{context.roadmapFacts.total} matched · {context.roadmapFacts.incomplete} incomplete · {context.roadmapFacts.overdue} overdue</span></div>
              <div className="divide-y divide-slate-100">
                {context.roadmapItems.map((item) => <RoadmapEvidenceRow key={item.itemId} eventId={eventId} item={item} />)}
              </div>
            </div>
          ) : null}

          {context.attentionFindings.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600">Relevant evidence</p>
              <div className="divide-y divide-slate-100">
                {context.attentionFindings.map((finding) => <FindingRow key={finding.id} eventId={eventId} finding={finding} showCategory />)}
              </div>
            </div>
          ) : null}

          {context.sources.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Verified sources</p>
              <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Verified question sources">
                {context.sources.map((source) => {
                  const href = retrievedSourceHref(eventId, source);
                  return (
                    <li key={`${source.entityType}:${source.entityId}:${source.field ?? ""}`}>
                      {href ? (
                        <Link href={href} className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-[#28439A] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#28439A]/40">
                          <span className="max-w-[16rem] truncate">{source.label}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </Link>
                      ) : <span className="inline-flex max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">{source.label}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {context.limitations.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Known limitations</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
            {context.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function EventQuestionPrompt({ eventId }: { eventId: string }) {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<QuestionContext | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [lastSubmittedQuestion, setLastSubmittedQuestion] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeQuestionRequest = useRef<AbortController | null>(null);

  async function retrieveQuestionContext(questionToSubmit: string) {
    if (!questionToSubmit.trim()) return;
    activeQuestionRequest.current?.abort();
    const controller = new AbortController();
    activeQuestionRequest.current = controller;
    const requestId = ++requestSequence.current;
    setLastSubmittedQuestion(questionToSubmit);
    setIsRetrieving(true);
    setContext(null);
    setQuestionError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/ai-workspace/question-context`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: questionToSubmit }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (requestId !== requestSequence.current) return;
      if (!response.ok) throw new Error(questionRetrievalErrorMessage(response.status));
      if (!isQuestionContext(payload, eventId)) throw new Error("The question evidence response was incomplete. Please try again.");
      setContext(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === requestSequence.current) {
        setQuestionError(error instanceof Error ? error.message : "Unable to retrieve verified event evidence. Please try again.");
      }
    } finally {
      if (requestId === requestSequence.current && activeQuestionRequest.current === controller) {
        activeQuestionRequest.current = null;
        setIsRetrieving(false);
      }
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void retrieveQuestionContext(question);
  }

  useEffect(() => {
    requestSequence.current += 1;
    activeQuestionRequest.current?.abort();
    activeQuestionRequest.current = null;
    setQuestion("");
    setContext(null);
    setQuestionError(null);
    setIsRetrieving(false);
    setLastSubmittedQuestion(null);

    return () => {
      requestSequence.current += 1;
      activeQuestionRequest.current?.abort();
    };
  }, [eventId]);

  return (
    <section className="rounded-xl border border-[#28439A]/20 bg-[#28439A]/[0.035] p-3 shadow-sm sm:p-4" aria-labelledby="ask-about-event-heading">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#28439A] text-white" aria-hidden>
          <MessageCircleQuestion className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id="ask-about-event-heading" className="text-[16px] leading-5 font-semibold text-slate-950">Ask About This Event</h2>
          <p className="mt-0.5 text-[12px] leading-4 text-slate-600">Retrieve verified event evidence for supported planning questions. No model-generated answer is shown.</p>
        </div>
      </div>

      <form className="mt-3" onSubmit={submitQuestion}>
        <label className="sr-only" htmlFor="event-attention-question">Ask a question about this event</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id="event-attention-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about this event…"
            rows={2}
            maxLength={1000}
            className="block min-h-18 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] leading-5 text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/20"
          />
          <button
            type="submit"
            disabled={!question.trim() || isRetrieving}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white transition hover:bg-[#20377f] focus:outline-none focus:ring-2 focus:ring-[#28439A]/40 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isRetrieving ? "Retrieving…" : "Ask Question"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Example event questions">
          <span className="self-center text-[11px] font-medium text-slate-500">Try:</span>
          {QUESTION_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                requestSequence.current += 1;
                activeQuestionRequest.current?.abort();
                activeQuestionRequest.current = null;
                setIsRetrieving(false);
                setQuestion(example);
                setContext(null);
                setQuestionError(null);
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-left text-[11px] leading-4 font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#28439A]/40"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {isRetrieving ? <p className="mt-2 text-[12px] text-slate-600" role="status" aria-live="polite">Retrieving verified event evidence…</p> : null}
      {questionError ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800" role="alert">
          <p>{questionError}</p>
          {lastSubmittedQuestion ? (
            <button
              type="button"
              disabled={isRetrieving}
              onClick={() => void retrieveQuestionContext(lastSubmittedQuestion)}
              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1 font-semibold text-rose-800 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {context ? <QuestionEvidence context={context} eventId={eventId} onDismiss={() => setContext(null)} /> : null}
    </section>
  );
}

function CoverageNote({ support }: { support: EventAttentionResult["support"] }) {
  const parts = [
    `${support.supportedChecks.length} checks currently covered`,
    support.partialChecks.length > 0 ? `${support.partialChecks.length} areas with limited coverage` : null,
    support.unsupportedChecks.length > 0 ? `${support.unsupportedChecks.length} areas not yet evaluated` : null,
  ].filter(Boolean);
  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-5 text-slate-600" aria-label="Current workspace coverage">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#28439A]" aria-hidden />
        <div>
          <h2 className="font-semibold text-slate-900">Current coverage</h2>
          <p className="mt-1">This workspace reviews verified event data. Some areas have limited coverage or are not yet evaluated.</p>
          <p className="mt-2 text-[12px] text-slate-500">{parts.join(" · ")}</p>
        </div>
      </div>
    </aside>
  );
}

function AttentionSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading event attention" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-32 rounded-2xl bg-slate-100" />)}
      </div>
      {[0, 1, 2].map((index) => <div key={index} className="h-48 rounded-2xl border border-slate-100 bg-slate-50" />)}
    </div>
  );
}

function EmptyAttentionState({ eventName, support }: { eventName: string; support: EventAttentionResult["support"] }) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-10 text-center sm:px-8">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold text-emerald-950">{eventName} is clear in the current review</h2>
        <p className="mx-auto mt-2 max-w-xl text-[14px] leading-5 text-emerald-900/80">
          No actionable issues were found in the checks this workspace currently supports.
        </p>
      </section>
      <CoverageNote support={support} />
    </div>
  );
}

export function EventAttentionWorkspace({ eventId, eventName, startDate, endDate }: EventAttentionWorkspaceProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<EventAttentionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<AttentionSeverity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const attentionRequestSequence = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++attentionRequestSequence.current;
    setState("loading");
    setData(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/ai-workspace/attention`, { credentials: "include", signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("You do not have access to this event's AI Workspace.");
        if (response.status === 404) throw new Error("This event was not found or is no longer available.");
        throw new Error("Unable to load event attention. Please try again.");
      }
      if (!isAttentionResult(payload, eventId)) throw new Error("The event attention response was incomplete. Please try again.");
      if (requestId !== attentionRequestSequence.current) return;
      setData(payload);
      setState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId === attentionRequestSequence.current) {
        setData(null);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load event attention. Please try again.");
        setState("error");
      }
    }
  }, [eventId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      attentionRequestSequence.current += 1;
      controller.abort();
    };
  }, [load]);

  const categories = data ? Array.from(new Set(data.findings.map((finding) => finding.category))).sort() : [];
  const visibleFindings = data?.findings.filter((finding) =>
    (severityFilter === "all" || finding.severity === severityFilter) &&
    (!categoryFilter || finding.category === categoryFilter),
  ) ?? [];
  const displayedSummary = data ? summarizeFindings(data.findings) : null;
  const findingsByCategory = categories.map((category) => ({
    category,
    findings: visibleFindings.filter((finding) => finding.category === category),
  })).filter((group) => group.findings.length > 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5">
      <EventModuleSurface className="space-y-3" paddingClassName="px-4 py-4 sm:px-5 sm:py-4">
        <EventModuleHeader
          title="AI Workspace"
          badge="Event overview"
          subtitle="A clear view of what needs attention across this event."
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">{eventName}</p>
          <span className="hidden text-slate-300 sm:inline" aria-hidden>•</span>
          <p className="text-[13px] text-slate-600">{formatEventDates(startDate, endDate)}</p>
        </div>
      </EventModuleSurface>

      <ExecutiveBriefingPanel key={`briefing-${eventId}`} eventId={eventId} />

      <EventQuestionPrompt key={eventId} eventId={eventId} />

      {state === "loading" ? <AttentionSkeleton /> : null}

      {state === "error" ? (
        <EventModuleSurface paddingClassName="p-5 sm:p-6">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 sm:flex-row">
            <CircleAlert className="h-6 w-6 shrink-0 text-rose-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-rose-950">Unable to load event attention</h2>
              <p className="mt-1 text-[14px] leading-5 text-rose-800" role="alert">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 text-[13px] font-semibold text-rose-800 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
          </div>
        </EventModuleSurface>
      ) : null}

      {state === "ready" && data?.eventId === eventId ? (
        <>
          <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Attention summary">
            <SummaryCard severity="total" count={displayedSummary?.total ?? 0} />
            <SummaryCard severity="critical" count={displayedSummary?.critical ?? 0} />
            <SummaryCard severity="warning" count={displayedSummary?.warning ?? 0} />
            <SummaryCard severity="informational" count={displayedSummary?.informational ?? 0} />
          </section>

          {data.findings.length === 0 ? <EmptyAttentionState eventName={eventName} support={data.support} /> : (
            <section className="space-y-3" aria-labelledby="attention-findings-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="attention-findings-heading" className="text-[20px] leading-6 font-semibold text-slate-950">What Needs Attention?</h2>
                  <p className="mt-1 text-[13px] text-slate-500">Verified event-data findings, grouped for review.</p>
                </div>
                <p className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700" aria-label={`${visibleFindings.length} findings shown`}>
                  {visibleFindings.length} {visibleFindings.length === 1 ? "finding" : "findings"}
                </p>
              </div>
              <FindingFilters
                category={categoryFilter}
                categories={categories}
                severity={severityFilter}
                onCategoryChange={setCategoryFilter}
                onSeverityChange={setSeverityFilter}
              />
              {findingsByCategory.length > 0 ? (
                <div className="space-y-2">
                  {findingsByCategory.map((group) => {
                    const criticalCount = group.findings.filter((finding) => finding.severity === "critical").length;
                    return (
                      <details key={group.category} open={criticalCount > 0} className="group overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={`${CATEGORY_LABELS[group.category] ?? group.category} findings`}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-slate-900 marker:content-none hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#28439A]/40 sm:px-4">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-[13px] font-semibold">{CATEGORY_LABELS[group.category] ?? group.category}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{group.findings.length}</span>
                            {criticalCount > 0 ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-rose-800">{criticalCount} critical</span> : null}
                          </span>
                          <span className="text-[12px] font-medium text-[#28439A] group-open:hidden">Show</span>
                          <span className="hidden text-[12px] font-medium text-[#28439A] group-open:inline">Hide</span>
                        </summary>
                        <div className="divide-y divide-slate-100 border-t border-slate-100">
                          {group.findings.map((finding) => <FindingRow key={finding.id} eventId={eventId} finding={finding} />)}
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-[13px] text-slate-600">No findings match the selected filters.</p>
              )}
              <CoverageNote support={data.support} />
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
