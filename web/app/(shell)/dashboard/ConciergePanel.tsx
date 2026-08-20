"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MessageCircle, X } from "lucide-react";
import { FEATURES } from "@/config/features";
import styles from "./dashboard.module.css";

type ConciergePrompt =
  | "attention"
  | "deadlines"
  | "budget"
  | "risks"
  | "next"
  | "queue"
  | "unassigned"
  | "exposure";

export type ConciergeDashboardContext = {
  periodLabel: string;
  portfolioSummary: {
    eventCount: number;
    approvalsWaiting: number;
    criticalIssues: number;
    nextMilestoneLabel: string | null;
  };
  kpis: {
    events: string;
    atRisk: string;
    budgetVariance: string;
    tasks: string;
    approvals: string;
    deadlines: string;
  };
  deadlines: Array<{
    title: string;
    eventName: string;
    dueDateLabel: string;
    statusLabel: string;
    href: string;
  }>;
  timelineEvents: Array<{
    name: string;
    dateRange: string;
    status: string;
    href: string;
  }>;
  financials: {
    forecast: string;
    actual: string;
    variance: string;
    varianceDirection: "over" | "under" | "on-plan";
    actualizedPercent: number;
    topCategories: Array<{
      category: string;
      actual: string;
      forecast: string;
      pendingCount: number;
    }>;
    href: string;
  };
  eventSnapshot: Array<{
    name: string;
    dateRange: string;
    status: string;
    budgetStatus: string;
    timelineStatus: string;
    healthStatus: string;
    signalCount: number;
    href: string;
  }>;
  links: {
    events: string;
    risks: string;
    approvals: string;
    deadlines: string;
    tasks: string;
    budget: string;
    budgets: string;
  };
};

export type ConciergeActionCenterContext = {
  page: "action-center";
  view: string;
  summary: {
    totalItems: number;
    affectedEvents: number;
    criticalItems: number;
  };
  queueItems: Array<{
    title: string;
    eventName: string;
    type: string;
    assigneeName: string | null;
    statusLabel: string;
    overdueDays: number | null;
    href: string;
  }>;
  links: {
    dashboard: string;
    risks: string;
    approvals: string;
    deadlines: string;
    tasks: string;
    budget: string;
  };
};

export type ConciergeContext = ConciergeDashboardContext | ConciergeActionCenterContext;

const DASHBOARD_PROMPTS: Array<{ id: ConciergePrompt; label: string }> = [
  { id: "attention", label: "What needs attention first?" },
  { id: "deadlines", label: "Summarize overdue deadlines" },
  { id: "budget", label: "Show budget exposure" },
  { id: "risks", label: "Which events are most at risk?" },
  { id: "next", label: "Where should I go next?" },
];

const ACTION_CENTER_PROMPTS: Array<{ id: ConciergePrompt; label: string }> = [
  { id: "attention", label: "What should I triage first?" },
  { id: "queue", label: "Summarize this queue" },
  { id: "unassigned", label: "Find unassigned items" },
  { id: "exposure", label: "Which event has the most exposure?" },
  { id: "next", label: "Where should I go next?" },
];

const DASHBOARD_LINK_LABELS: Array<{ label: string; key: keyof ConciergeDashboardContext["links"] }> = [
  { label: "View risks", key: "risks" },
  { label: "View approvals", key: "approvals" },
  { label: "View deadlines", key: "deadlines" },
  ...(FEATURES.ENABLE_GENERIC_TASKING_UI ? [{ label: "View tasks", key: "tasks" as const }] : []),
  { label: "View budget", key: "budget" },
  { label: "View events", key: "events" },
  { label: "Open budgets", key: "budgets" },
];

const ACTION_LINK_LABELS: Array<{ label: string; key: keyof ConciergeActionCenterContext["links"] }> = [
  { label: "Dashboard", key: "dashboard" },
  { label: "View risks", key: "risks" },
  { label: "View approvals", key: "approvals" },
  { label: "View deadlines", key: "deadlines" },
  ...(FEATURES.ENABLE_GENERIC_TASKING_UI ? [{ label: "View tasks", key: "tasks" as const }] : []),
  { label: "View budget", key: "budget" },
];

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isActionCenterContext(context: ConciergeContext): context is ConciergeActionCenterContext {
  return "page" in context && context.page === "action-center";
}

function topRiskEvent(context: ConciergeDashboardContext) {
  return [...context.eventSnapshot].sort((left, right) =>
    right.signalCount - left.signalCount || left.name.localeCompare(right.name),
  )[0];
}

function buildBriefing(context: ConciergeDashboardContext) {
  const topEvent = topRiskEvent(context);
  const nextDeadline = context.deadlines[0];

  return [
    {
      title: "Needs attention",
      text:
        context.portfolioSummary.criticalIssues > 0
          ? `${pluralize(context.portfolioSummary.criticalIssues, "risk")} across ${pluralize(context.portfolioSummary.eventCount, "visible event")}${topEvent && topEvent.signalCount > 0 ? `. ${topEvent.name} has the highest concentration of signals.` : "."}`
          : "No critical portfolio risks are visible right now.",
    },
    {
      title: "Next deadline",
      text: nextDeadline
        ? `${nextDeadline.title} for ${nextDeadline.eventName} is ${nextDeadline.statusLabel.toLowerCase()}.`
        : "No open or blocked deadlines are visible in the current lookahead window.",
    },
    {
      title: "Budget",
      text: `Portfolio is ${context.financials.variance.toLowerCase()} with ${context.financials.actualizedPercent}% actualized.`,
    },
  ];
}

function buildActionCenterBriefing(context: ConciergeActionCenterContext) {
  const topEvent = [...context.queueItems].reduce<Map<string, number>>((map, item) => {
    map.set(item.eventName, (map.get(item.eventName) ?? 0) + 1);
    return map;
  }, new Map());
  const topEventEntry = Array.from(topEvent.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const overdue = context.queueItems.filter((item) => typeof item.overdueDays === "number" && item.overdueDays > 0);

  return [
    {
      title: "Queue",
      text: `${pluralize(context.summary.totalItems, "item")} in ${context.view}; ${pluralize(context.summary.affectedEvents, "event")} affected.`,
    },
    {
      title: "Highest exposure",
      text: topEventEntry ? `${topEventEntry[0]} has ${pluralize(topEventEntry[1], "visible item")} in this queue.` : "No queue exposure is visible right now.",
    },
    {
      title: "Time sensitivity",
      text: overdue.length > 0 ? `${pluralize(overdue.length, "item")} are overdue in the current queue context.` : "No overdue items are visible in this queue.",
    },
  ];
}

function guidanceForActionPrompt(prompt: ConciergePrompt, context: ConciergeActionCenterContext): string {
  const critical = context.queueItems.filter((item) => item.statusLabel.toLowerCase().includes("blocked") || (item.overdueDays ?? 0) > 0);
  const unassigned = context.queueItems.filter((item) => !item.assigneeName);
  const eventCounts = Array.from(
    context.queueItems.reduce<Map<string, number>>((map, item) => {
      map.set(item.eventName, (map.get(item.eventName) ?? 0) + 1);
      return map;
    }, new Map()).entries(),
  ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  if (prompt === "attention") {
    if (critical.length > 0) {
      return `Start with the highest time-sensitive items. ${pluralize(critical.length, "item")} are blocked or overdue in this queue.`;
    }
    if (unassigned.length > 0) {
      return `Start by assigning ownership. ${pluralize(unassigned.length, "item")} do not show an assignee.`;
    }
    return "No critical queue signals stand out. Work from the top event group and clear items by due date.";
  }

  if (prompt === "queue") {
    return `${context.view} queue summary: ${pluralize(context.summary.totalItems, "item")}, ${pluralize(context.summary.affectedEvents, "affected event")}, ${pluralize(context.summary.criticalItems, "critical item")}.`;
  }

  if (prompt === "unassigned") {
    if (unassigned.length === 0) return "No unassigned items are visible in this queue.";
    return `Unassigned items: ${unassigned.slice(0, 4).map((item) => `${item.title} (${item.eventName})`).join("; ")}.`;
  }

  if (prompt === "exposure") {
    if (!eventCounts[0]) return "No event exposure is visible in this queue.";
    return `Highest exposure: ${eventCounts.slice(0, 3).map(([eventName, count]) => `${eventName} (${count})`).join("; ")}.`;
  }

  return "Open the most relevant queue from the links below, then use search, grouping, and selection to narrow the work.";
}

function guidanceForDashboardPrompt(prompt: ConciergePrompt, context: ConciergeDashboardContext): string {
  const topEvent = topRiskEvent(context);
  const overdueDeadlines = context.deadlines
    .filter((deadline) => deadline.statusLabel.toLowerCase().includes("overdue") || deadline.statusLabel === "Blocked")
    .slice(0, 3);

  if (prompt === "attention") {
    if (context.portfolioSummary.criticalIssues > 0) {
      return `Start with risks. There are ${pluralize(context.portfolioSummary.criticalIssues, "item")} needing attention${topEvent && topEvent.signalCount > 0 ? `, and ${topEvent.name} has the highest visible signal count` : ""}. Open Risks to work the queue before approvals or budget review.`;
    }
    if (overdueDeadlines.length > 0) {
      return `Start with deadlines. ${overdueDeadlines[0]!.title} is the first visible overdue or blocked item, tied to ${overdueDeadlines[0]!.eventName}.`;
    }
    if (context.portfolioSummary.approvalsWaiting > 0) {
      return `Start with approvals. ${pluralize(context.portfolioSummary.approvalsWaiting, "approval")} are waiting across the visible portfolio.`;
    }
    return "No urgent portfolio signals are visible. Review the Event Snapshot for upcoming work and keep budgets current.";
  }

  if (prompt === "deadlines") {
    if (context.deadlines.length === 0) {
      return "No open or blocked deadlines are visible in the dashboard lookahead window.";
    }
    const selected = (overdueDeadlines.length > 0 ? overdueDeadlines : context.deadlines.slice(0, 3))
      .map((deadline) => `${deadline.title} for ${deadline.eventName}: ${deadline.statusLabel}`)
      .join("; ");
    return `Top deadline signals: ${selected}.`;
  }

  if (prompt === "budget") {
    const categories = context.financials.topCategories
      .slice(0, 3)
      .map((category) => `${category.category} ${category.actual} / ${category.forecast}`)
      .join("; ");
    return `Budget exposure: forecast ${context.financials.forecast}, actual ${context.financials.actual}, variance ${context.financials.variance}, ${context.financials.actualizedPercent}% actualized${categories ? `. Top categories: ${categories}.` : "."}`;
  }

  if (prompt === "risks") {
    const riskyEvents = context.eventSnapshot
      .filter((event) => event.signalCount > 0)
      .sort((left, right) => right.signalCount - left.signalCount)
      .slice(0, 3);
    if (riskyEvents.length === 0) {
      return "No events in the snapshot currently show risk signals. The visible portfolio is clear based on the dashboard context.";
    }
    return `Most at risk: ${riskyEvents.map((event) => `${event.name} (${event.healthStatus}, ${event.timelineStatus}, ${event.budgetStatus})`).join("; ")}.`;
  }

  const rankedLinks = [
    context.portfolioSummary.criticalIssues > 0 ? "Open Risks first to clear critical portfolio items." : null,
    overdueDeadlines.length > 0 ? "Open Deadlines next to resolve overdue or blocked dates." : null,
    context.portfolioSummary.approvalsWaiting > 0 ? "Open Approvals to move waiting budget decisions." : null,
    context.financials.varianceDirection === "over" ? "Open Budget to inspect over-forecast exposure." : null,
    "Use Events for a full portfolio scan.",
  ].filter(Boolean);

  return rankedLinks.join(" ");
}

export function ConciergePanel({ context }: { context: ConciergeContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const isActionCenter = isActionCenterContext(context);
  const briefing = useMemo(() => isActionCenter ? buildActionCenterBriefing(context) : buildBriefing(context), [context, isActionCenter]);
  const hasContext = isActionCenter
    ? context.summary.totalItems > 0
    : context.portfolioSummary.eventCount > 0 || context.deadlines.length > 0;
  const prompts = isActionCenter ? ACTION_CENTER_PROMPTS : DASHBOARD_PROMPTS;
  const readyCopy = isActionCenter
    ? "Ask about this queue, unassigned work, event exposure, or where to focus next."
    : "Ask about risks, deadlines, approvals, budget exposure, or where to focus next.";

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={styles.conciergeLauncher}
        aria-expanded={isOpen}
        aria-controls="dashboard-concierge-panel"
        aria-label={isActionCenter ? "Ask Concierge about this queue" : "Ask Concierge about this portfolio"}
        title={isActionCenter ? "Ask about this queue" : "Ask about this portfolio"}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={styles.conciergeOrb} aria-hidden>
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        </span>
        Concierge
      </button>

      {isOpen ? (
        <aside id="dashboard-concierge-panel" className={styles.conciergePanel} aria-label={isActionCenter ? "Concierge queue intelligence" : "Concierge portfolio intelligence"}>
          <div className={styles.conciergeHeader}>
            <div className="min-w-0">
              <div className={styles.conciergeTitleRow}>
                <span className={styles.conciergeStatusDot} aria-hidden />
                <h2 className={styles.conciergeTitle}>Concierge</h2>
              </div>
              <p className={styles.conciergeSubtitle}>{isActionCenter ? "Queue intelligence" : "Portfolio intelligence"}</p>
            </div>
            <button
              type="button"
              className={styles.conciergeClose}
              aria-label="Close Concierge"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className={styles.conciergeBody}>
            <section aria-labelledby="concierge-briefing-title">
              <h3 id="concierge-briefing-title" className={styles.conciergeSectionTitle}>Live context</h3>
              {hasContext ? (
                <div className={styles.conciergeBriefing}>
                  {briefing.map((item) => (
                    <div key={item.title} className={styles.conciergeBriefingItem}>
                      <span className={styles.conciergeDot} aria-hidden />
                      <span>
                        <span className={styles.conciergeBriefingTitle}>{item.title}</span>
                        <span className={styles.conciergeBriefingText}>{item.text}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.conciergeResponse}>No portfolio signals are available yet.</div>
              )}
            </section>

            <section aria-labelledby="concierge-prompts-title">
              <h3 id="concierge-prompts-title" className={styles.conciergeSectionTitle}>Ask</h3>
              <div className={styles.conciergePromptGrid}>
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    className={styles.conciergePrompt}
                    onClick={() => setResponse(isActionCenter ? guidanceForActionPrompt(prompt.id, context) : guidanceForDashboardPrompt(prompt.id, context))}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="concierge-response-title">
              <div className={styles.conciergeResponseHeader}>
                <h3 id="concierge-response-title" className={styles.conciergeSectionTitle}>Response</h3>
                {response ? (
                  <button type="button" className={styles.conciergeReset} onClick={() => setResponse(null)}>
                    Clear
                  </button>
                ) : null}
              </div>
              <div className={styles.conciergeResponse}>
                {response ?? readyCopy}
              </div>
            </section>

            <section aria-labelledby="concierge-links-title">
              <h3 id="concierge-links-title" className={styles.conciergeSectionTitle}>Go to</h3>
              <div className={styles.conciergeLinkList}>
                {isActionCenter
                  ? ACTION_LINK_LABELS.map((link) => (
                      <Link key={link.key} href={context.links[link.key]} className={styles.conciergeLink}>
                        {link.label}
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ))
                  : DASHBOARD_LINK_LABELS.map((link) => (
                      <Link key={link.key} href={context.links[link.key]} className={styles.conciergeLink}>
                        {link.label}
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ))}
              </div>
            </section>
          </div>
        </aside>
      ) : null}
    </>
  );
}
