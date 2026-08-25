import type { EventReadinessSnapshot } from "@/lib/event-readiness";
import { ORCA_CANONICAL_TERMS, type OrcaTerminology } from "@/lib/orca-terminology-contract";

export type ExecutiveBriefingEvidence = Readonly<{
  id: string;
  label: string;
  href: string;
}>;

export type ExecutiveBriefingFact = Readonly<{
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "informational";
  evidence: ExecutiveBriefingEvidence;
}>;

export type ExecutiveBriefingRecommendation = Readonly<{
  id: string;
  title: string;
  reason: string;
  priority: "high" | "medium" | "low";
  href: string;
  evidenceIds: readonly string[];
  actionMode: "editable" | "view_only";
}>;

export type ExecutiveBriefing = Readonly<{
  event: Readonly<{ id: string; name: string }>;
  dataAsOf: string;
  freshness: "current" | "stale" | "partial";
  generation: Readonly<{
    mode: "deterministic_fallback";
    status: "unavailable" | "partial";
    message: string;
  }>;
  facts: readonly ExecutiveBriefingFact[];
  recommendations: readonly ExecutiveBriefingRecommendation[];
  unavailableSources: readonly string[];
}>;

export type ExecutiveBriefingInput = Readonly<{
  eventId: string;
  eventName: string;
  dataAsOf: string;
  asOf?: string;
  canEdit: boolean;
  readiness: EventReadinessSnapshot;
  pendingApprovals: number;
  overdueItems: number;
  budgetVarianceCents: number;
  hasBudgetData: boolean;
  links: Readonly<{ runOfShow: string; timeline: string; budget: string; docs: string }>;
  unavailableSources?: readonly string[];
  terminology?: OrcaTerminology;
}>;

const STALE_AFTER_MS = 15 * 60 * 1000;

function safeEventHref(eventId: string, href: string, fallback: string): string {
  const allowedRoot = `/events/${eventId}`;
  return href === allowedRoot || href.startsWith(`${allowedRoot}/`) || href.startsWith(`${allowedRoot}?`) ? href : fallback;
}

function safeText(value: string, fallback: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 240) || fallback;
}

function factRecommendation(
  fact: ExecutiveBriefingFact,
  input: ExecutiveBriefingInput,
  title: string,
  priority: ExecutiveBriefingRecommendation["priority"],
): ExecutiveBriefingRecommendation {
  return {
    id: `recommend-${fact.id}`,
    title,
    reason: `This recommendation is grounded in: ${fact.title}`,
    priority,
    href: fact.evidence.href,
    evidenceIds: [fact.evidence.id],
    actionMode: input.canEdit ? "editable" : "view_only",
  };
}

/**
 * Produces an evidence-only briefing from canonical read models. It never accepts
 * model prose or user-authored instructions, and every link is constrained to
 * the current event so source text cannot redirect retrieval or leak another event.
 */
export function buildExecutiveBriefing(input: ExecutiveBriefingInput): ExecutiveBriefing {
  const terminology = input.terminology ?? { ...ORCA_CANONICAL_TERMS };
  const eventRoot = `/events/${input.eventId}`;
  const fallbackHref = safeEventHref(input.eventId, input.links.runOfShow, `${eventRoot}/matrix`);
  const facts: ExecutiveBriefingFact[] = [];

  for (const session of input.readiness.sessions.filter((row) => row.state === "blocked" || row.state === "attention").slice(0, 4)) {
    const reason = session.reasons[0];
    const href = safeEventHref(input.eventId, reason?.href ?? session.href, fallbackHref);
    facts.push({
      id: `session-${session.id}`,
      title: `${safeText(session.title, "Untitled session")} needs ${session.state === "blocked" ? "blocking issues resolved" : "review"}`,
      detail: safeText(reason?.label ?? "Canonical readiness requires review.", "Canonical readiness requires review."),
      severity: session.state === "blocked" ? "critical" : "warning",
      evidence: { id: `readiness-session-${session.id}`, label: "Session readiness", href },
    });
  }

  if (input.readiness.speakers.needsAction > 0) {
    const speaker = input.readiness.speakers.rows.find((row) => row.state === "attention");
    facts.push({
      id: "speaker-readiness",
      title: `${input.readiness.speakers.needsAction} speaker${input.readiness.speakers.needsAction === 1 ? "" : "s"} need action`,
      detail: speaker ? `${safeText(speaker.name, "A speaker")} has incomplete canonical readiness evidence.` : "Canonical speaker readiness evidence is incomplete.",
      severity: "warning",
      evidence: { id: "readiness-speakers", label: "Speaker readiness", href: safeEventHref(input.eventId, speaker?.href ?? `${eventRoot}/speakers`, `${eventRoot}/speakers`) },
    });
  }

  if (input.readiness.staffing.conflicts.length > 0 || input.readiness.staffing.gaps.length > 0) {
    const issue = input.readiness.staffing.conflicts[0] ?? input.readiness.staffing.gaps[0]!;
    facts.push({
      id: "staffing-readiness",
      title: input.readiness.staffing.conflicts.length > 0 ? "Staffing conflicts require resolution" : "Required staffing roles are unfilled",
      detail: safeText(issue.label, "Canonical staffing coverage requires review."),
      severity: input.readiness.staffing.conflicts.length > 0 ? "critical" : "warning",
      evidence: { id: "readiness-staffing", label: "Staffing coverage", href: safeEventHref(input.eventId, issue.href, `${eventRoot}/staffing`) },
    });
  }

  if (input.pendingApprovals > 0) {
    facts.push({
      id: "pending-approvals",
      title: `${input.pendingApprovals} approval${input.pendingApprovals === 1 ? " is" : "s are"} pending`,
      detail: "Canonical document and budget approval records are waiting for review.",
      severity: "warning",
      evidence: { id: "approval-center", label: "Approval Center", href: safeEventHref(input.eventId, input.links.docs, `${eventRoot}/docs`) },
    });
  }

  if (input.overdueItems > 0) {
    facts.push({
      id: "overdue-roadmap",
      title: `${input.overdueItems} roadmap item${input.overdueItems === 1 ? " is" : "s are"} overdue`,
      detail: "The canonical Roadmap due date has passed while the item remains incomplete.",
      severity: "critical",
      evidence: { id: "roadmap-overdue", label: "Roadmap", href: safeEventHref(input.eventId, input.links.timeline, `${eventRoot}/timeline`) },
    });
  }

  if (input.hasBudgetData) {
    const variance = input.budgetVarianceCents;
    facts.push({
      id: "budget-position",
      title: variance < 0 ? "Budget is over forecast" : variance > 0 ? "Budget is under forecast" : "Budget is on forecast",
      detail: `Canonical Budget variance is ${Math.abs(variance / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} ${variance < 0 ? "over" : variance > 0 ? "under" : "from"} forecast.`,
      severity: variance < 0 ? "critical" : "informational",
      evidence: { id: "budget-position", label: "Budget", href: safeEventHref(input.eventId, input.links.budget, `${eventRoot}/budget`) },
    });
  }

  if (facts.length === 0) {
    facts.push({
      id: "no-active-readiness-issues",
      title: input.readiness.summary.total === 0 ? "No sessions are available for readiness review" : "No active readiness issues were found",
      detail: input.readiness.summary.total === 0 ? "Add or import sessions to establish canonical operational readiness." : "Every currently evaluated canonical readiness record is clear.",
      severity: "informational",
      evidence: { id: "run-of-show", label: terminology.runOfShow, href: fallbackHref },
    });
  }

  const recommendations = facts
    .filter((fact) => fact.severity !== "informational" || fact.id === "no-active-readiness-issues")
    .slice(0, 5)
    .map((fact) => factRecommendation(
      fact,
      input,
      fact.id === "no-active-readiness-issues" && input.readiness.summary.total === 0 ? "Add or import the first session" : `Review ${fact.evidence.label.toLowerCase()}`,
      fact.severity === "critical" ? "high" : fact.severity === "warning" ? "medium" : "low",
    ));

  const unavailableSources = [...new Set(input.unavailableSources ?? [])].sort();
  const dataAsOfMs = Date.parse(input.dataAsOf);
  const asOfMs = Date.parse(input.asOf ?? new Date().toISOString());
  const stale = Number.isFinite(dataAsOfMs) && Number.isFinite(asOfMs) && asOfMs - dataAsOfMs > STALE_AFTER_MS;
  const freshness = unavailableSources.length > 0 ? "partial" : stale ? "stale" : "current";

  return {
    event: { id: input.eventId, name: safeText(input.eventName, "Untitled event") },
    dataAsOf: input.dataAsOf,
    freshness,
    generation: {
      mode: "deterministic_fallback",
      status: unavailableSources.length > 0 ? "partial" : "unavailable",
      message: unavailableSources.length > 0
        ? "AI generation is unavailable; this deterministic briefing uses the canonical sources that were available."
        : "AI generation is unavailable; this deterministic briefing remains grounded in canonical event records.",
    },
    facts: facts.slice(0, 7),
    recommendations,
    unavailableSources,
  };
}
