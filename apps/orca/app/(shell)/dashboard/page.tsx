import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Info,
  Plus,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DeadlineStatus,
  EventStatus,
  TimelinePriority,
  TimelineStatus,
} from "@prisma/client";
import {
  portfolioCriticalItemContext,
  summarizePortfolioBudget,
  summarizePortfolioHealth,
} from "@/lib/account-event-portfolio";
import {
  accountActionCenterHref,
  accountEventsHref,
  accountFinancialsHref,
  commandCenterRoadmapRecordHref,
} from "@/lib/event-command-center-links";
import { getBudgetCategoryDisplay, resolveBudgetCategory } from "@/lib/budget-category-filter";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import { getCommandCenterDashboardData } from "@/src/server/services/command-center-dashboard";
import { EventLauncher } from "./EventLauncher";
import styles from "./dashboard.module.css";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NEAR_DUE_DAYS = 7;
const DEADLINE_LOOKAHEAD_DAYS = 45;
const EVENT_SINGLE_DATE_WINDOW_DAYS = 30;

type RiskTone = "critical" | "warning" | "stable" | "neutral";
type KpiTone = "neutral" | "healthy" | "warning" | "critical";
type KpiAccent = "blue" | "cyan" | "purple";

const TIMELINE_COLORS = [
  "#00C3CC",
  "#3372E3",
  "#7426EF",
  "#6EE7B7",
  "#FDBA74",
] as const;
type FinancialCategory = {
  category: string;
  forecastCents: number;
  actualCents: number;
  pendingCount: number;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Unscheduled";
  return dateFormatter.format(value);
}

function formatExecutiveMoney(cents: number): string {
  return compactMoneyFormatter.format(Math.abs(cents) / 100);
}

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function formatVarianceForecastLabel(cents: number): string {
  if (cents > 0) return `+${formatExecutiveMoney(cents)} over forecast`;
  if (cents < 0) return `${formatExecutiveMoney(cents)} under forecast`;
  return "On plan";
}

function formatBudgetDeltaLabel(
  forecastCents: number,
  actualCents: number,
): string {
  const deltaCents = forecastCents - actualCents;
  if (deltaCents > 0) return `${formatExecutiveMoney(deltaCents)} under`;
  if (deltaCents < 0) return `${formatExecutiveMoney(deltaCents)} over`;
  return "On plan";
}

function formatDateRange(
  startDate: Date,
  endDate: Date | null | undefined,
): string {
  return `${formatDate(startDate)}${endDate ? ` - ${formatDate(endDate)}` : ""}`;
}

function eventStartDistanceLabel(startDate: Date, today: Date): string {
  const daysUntil = daysFromToday(startDate, today);
  if (daysUntil < 0) return "Live";
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "1 day";
  return `${daysUntil} days`;
}

function deadlineTone(
  status: DeadlineStatus,
  dueAt: Date,
  today: Date,
): RiskTone {
  const daysUntil = daysFromToday(dueAt, today);
  if (status === DeadlineStatus.BLOCKED || daysUntil < 0) return "critical";
  if (daysUntil <= NEAR_DUE_DAYS) return "warning";
  return "neutral";
}

function dueLabel(value: Date, today: Date): string {
  const daysUntil = daysFromToday(value, today);
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`;
  if (daysUntil === 0) return "Due today";
  if (daysUntil === 1) return "Due tomorrow";
  if (daysUntil <= NEAR_DUE_DAYS) return `Due in ${daysUntil}d`;
  return formatDate(value);
}

function timelineRiskTone(
  input: {
    status: TimelineStatus;
    priority: TimelinePriority;
    endDate: Date | null;
    blockedPredecessorCount: number;
  },
  today: Date,
): RiskTone {
  if (
    input.status === TimelineStatus.AT_RISK ||
    input.priority === TimelinePriority.CRITICAL ||
    input.blockedPredecessorCount > 0
  ) {
    return "critical";
  }
  if (
    input.endDate &&
    input.status !== TimelineStatus.COMPLETE &&
    daysFromToday(input.endDate, today) < 0
  ) {
    return "critical";
  }
  if (input.priority === TimelinePriority.HIGH) return "warning";
  return "neutral";
}

function metricTone(input: {
  pacePercent: number | null;
  goalValue: number | null;
  currentValue: number;
}): RiskTone {
  if (typeof input.pacePercent === "number") {
    if (input.pacePercent < 75) return "critical";
    if (input.pacePercent < 95) return "warning";
    return "stable";
  }
  if (input.goalValue && input.goalValue > 0) {
    const percent = (input.currentValue / input.goalValue) * 100;
    if (percent < 60) return "warning";
    return "stable";
  }
  return "neutral";
}

function toneClasses(tone: RiskTone): string {
  if (tone === "critical") return styles.pillDanger;
  if (tone === "warning") return styles.pillWarning;
  if (tone === "stable") return styles.pillStable;
  return styles.pillNeutral;
}

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function kpiToneClasses(
  tone: KpiTone,
  accent: KpiAccent = "blue",
): { icon: string } {
  if (tone === "critical") {
    return {
      icon: styles.kpiIconRed,
    };
  }
  if (accent === "cyan") {
    return {
      icon: styles.kpiIconCyan,
    };
  }
  if (accent === "purple") {
    return {
      icon: styles.kpiIconPurple,
    };
  }
  if (tone === "warning") {
    return {
      icon: styles.kpiIconAmber,
    };
  }
  if (tone === "healthy") {
    return {
      icon: styles.kpiIconGreen,
    };
  }
  return {
    icon: styles.kpiIconBlue,
  };
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className={styles.emptyState}>{children}</div>;
}

function StatusBadge({
  tone,
  children,
}: {
  tone: RiskTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClasses(tone)}`}
    >
      {children}
    </span>
  );
}

function DashboardPanel({
  id,
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cx(styles.panel, className)}>
      <div className={styles.panelHeader}>
        <div className="min-w-0">
          {eyebrow ? <p className={styles.panelEyebrow}>{eyebrow}</p> : null}
          <h2 className={styles.panelTitle}>{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  accent,
  href,
  title,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: KpiTone;
  accent?: KpiAccent;
  href?: string;
  title?: string;
}) {
  const toneStyles = kpiToneClasses(tone, accent);
  const testId = `command-center-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const content = (
    <>
      <span className={cx(styles.kpiIcon, toneStyles.icon)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>{value}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={styles.kpiCard}
        data-testid={testId}
        aria-label={`Open ${label}`}
        title={title ?? `Open ${label}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={styles.kpiCard} data-testid={testId} title={title}>
      {content}
    </div>
  );
}

export default async function DashboardPage() {
  const authContext = await ensureProvisionedUserAndContext();
  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  if (authContext.status !== "OK") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-[24px] font-normal leading-[28px] text-slate-800">
          Dashboard unavailable
        </h2>
        <p className="mt-3 text-[14px] text-slate-500">
          Select an organization context to view account operations.
        </p>
      </section>
    );
  }

  const today = startOfToday();
  const nearFuture = addDays(today, DEADLINE_LOOKAHEAD_DAYS);

  // Dashboard reads do not require a transaction; Promise.all avoids P2028 transaction startup failures with the single-connection pg adapter pool.
  const {
    events,
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
  } = await getCommandCenterDashboardData({
    orgId: authContext.activeOrgId,
    appUserId: authContext.appUserId!,
    role: authContext.role!,
    today,
    nearFuture,
  });
  // Per-budget rollups are pre-aggregated DB-side; look them up by budgetId.
  const budgetTotalsByBudgetIdMap = new Map(
    budgetTotalsByBudgetId.map((group) => [group.budgetId, group]),
  );
  const budgetPendingByBudgetIdMap = new Map(
    budgetPendingByBudgetId.map((group) => [group.budgetId, group.pendingCount]),
  );
  const budgetOverForecastByBudgetIdMap = new Map(
    budgetOverForecastByBudgetId.map((group) => [group.budgetId, group.overCount]),
  );
  const submittedBudgetCountByBudgetId = submittedBudgetSubmissionCounts.reduce(
    (map, submissionGroup) => {
      map.set(submissionGroup.budgetId, submissionGroup._count._all);
      return map;
    },
    new Map<string, number>(),
  );
  const submittedBudgetSubmissionCount =
    submittedBudgetSubmissionCounts.reduce(
      (sum, submissionGroup) => sum + submissionGroup._count._all,
      0,
    );
  const getEventBudgetTotals = (event: (typeof events)[number]) =>
    (event.budget && budgetTotalsByBudgetIdMap.get(event.budget.id)) || {
      forecastCents: 0,
      actualCents: 0,
    };
  const getEventPendingApprovalCount = (event: (typeof events)[number]) =>
    event.budget ? (budgetPendingByBudgetIdMap.get(event.budget.id) ?? 0) : 0;
  const getEventOverForecastCount = (event: (typeof events)[number]) =>
    event.budget ? (budgetOverForecastByBudgetIdMap.get(event.budget.id) ?? 0) : 0;

  const totalForecastCents = budgetTotals.forecastCents;
  const totalActualCents = budgetTotals.actualCents;
  const netVarianceCents = totalActualCents - totalForecastCents;
  const overForecastLineItemCount = budgetOverForecastOrgCount;
  const pendingApprovalItemCount = budgetPendingApprovalCount;
  const overdueDeadlinesCount = deadlines.filter(
    (deadline) => daysFromToday(deadline.dueAt, today) < 0,
  ).length;
  const urgentRisksCount =
    deadlines.filter(
      (deadline) =>
        deadlineTone(deadline.status, deadline.dueAt, today) === "critical",
    ).length +
    timelineRisks.filter(
      (item) =>
        timelineRiskTone(
          {
            status: item.status,
            priority: item.priority,
            endDate: item.endDate,
            blockedPredecessorCount: item.successorDependencies.filter(
              (dependency) =>
                dependency.predecessor.status !== TimelineStatus.COMPLETE,
            ).length,
          },
          today,
        ) === "critical",
    ).length +
    overForecastLineItemCount;
  // Cross-module approvals: budget line-item approvals + submitted budget
  // submissions + portfolio documents in review.
  const pendingApprovalsCount =
    pendingApprovalItemCount +
    submittedBudgetSubmissionCount +
    documentsInReviewCount;
  const deadlineSignalCount = deadlines.length;
  const eventsHref = accountEventsHref();
  const budgetVarianceHref = accountActionCenterHref({ view: "budget" });
  const approvalsHref = accountActionCenterHref({ view: "approvals" });
  const deadlinesHref = accountActionCenterHref({ view: "deadlines" });
  const overdueHref = accountActionCenterHref({ view: "deadlines", filter: "overdue" });
  const atRiskHref = accountActionCenterHref({ view: "risks" });
  const financialsHref = accountFinancialsHref();
  const financialsEventsHref = accountFinancialsHref({ view: "events" });

  const financialCategories: FinancialCategory[] = [...budgetCategoryBreakdown].sort(
    (left, right) =>
      Math.abs(right.actualCents - right.forecastCents) -
      Math.abs(left.actualCents - left.forecastCents),
  );

  const rankedPortfolioEvents = events
    .map((event) => {
      const activeRecentRank =
        event.status === EventStatus.ACTIVE
          ? 0
          : event.status === EventStatus.DRAFT
            ? 1
            : event.endDate && daysFromToday(event.endDate, today) >= -14
              ? 2
              : 3;
      // C1: per-event risk counts are DB aggregates from the dashboard service
      // (see command-center-dashboard.ts) — no per-event nested array re-filtering.
      const riskyDeadlineCount = event.riskyDeadlineCount;
      const riskyTimelineCount = event.riskyTimelineCount;
      const pendingBudgetCount = getEventPendingApprovalCount(event);
      const overBudgetCount = getEventOverForecastCount(event);
      const submittedBudgetCount = event.budget
        ? (submittedBudgetCountByBudgetId.get(event.budget.id) ?? 0)
        : 0;
      const integrationSignalCount = event.integrationMetrics.filter(
        (metric) => {
          const tone = metricTone(metric);
          return tone === "critical" || tone === "warning";
        },
      ).length;
      const healthSignalCount =
        riskyDeadlineCount +
        riskyTimelineCount +
        pendingBudgetCount +
        overBudgetCount +
        submittedBudgetCount +
        integrationSignalCount;
      const startsInDays = daysFromToday(event.startDate, today);
      const upcomingFallback =
        startsInDays >= 0 ? startsInDays : 10000 + Math.abs(startsInDays);

      return {
        event,
        activeRecentRank,
        healthSignalCount,
        upcomingFallback,
      };
    })
    .sort(
      (left, right) =>
        left.activeRecentRank - right.activeRecentRank ||
        Number(right.healthSignalCount > 0) -
          Number(left.healthSignalCount > 0) ||
        right.healthSignalCount - left.healthSignalCount ||
        left.upcomingFallback - right.upcomingFallback ||
        left.event.name.localeCompare(right.event.name),
    )
    .map(({ event }) => event);
  const visiblePortfolioEvents = rankedPortfolioEvents.slice(0, 5);
  const remainingPortfolioEvents = rankedPortfolioEvents.slice(5);
  const timelineWindowEvents =
    rankedPortfolioEvents.length > 0 ? rankedPortfolioEvents : events;
  const timelineStarts = timelineWindowEvents.map((event) =>
    event.startDate.getTime(),
  );
  const timelineEnds = timelineWindowEvents.map((event) =>
    (
      event.endDate ?? addDays(event.startDate, EVENT_SINGLE_DATE_WINDOW_DAYS)
    ).getTime(),
  );
  const timelineWindowStart =
    timelineStarts.length > 0
      ? addDays(new Date(Math.min(...timelineStarts)), -7).getTime()
      : today.getTime();
  const timelineWindowEnd =
    timelineEnds.length > 0
      ? addDays(new Date(Math.max(...timelineEnds)), 7).getTime()
      : addDays(today, EVENT_SINGLE_DATE_WINDOW_DAYS).getTime();
  const timelineWindowDuration = Math.max(
    MS_PER_DAY,
    timelineWindowEnd - timelineWindowStart,
  );
  const todayMarkerPercent = clamp(
    ((today.getTime() - timelineWindowStart) / timelineWindowDuration) * 100,
    0,
    100,
  );
  const showTodayMarker =
    today.getTime() >= timelineWindowStart &&
    today.getTime() <= timelineWindowEnd;
  const getTimelinePlacement = (
    event: (typeof rankedPortfolioEvents)[number],
  ) => {
    const eventStart = event.startDate.getTime();
    const eventEnd = (
      event.endDate ?? addDays(event.startDate, EVENT_SINGLE_DATE_WINDOW_DAYS)
    ).getTime();
    const left = clamp(
      ((eventStart - timelineWindowStart) / timelineWindowDuration) * 100,
      0,
      96,
    );
    const width = clamp(
      ((eventEnd - eventStart) / timelineWindowDuration) * 100,
      8,
      100 - left,
    );
    return { left, width };
  };
  const topFinancialCategories = financialCategories.slice(0, 3);
  const budgetUsedPercent =
    totalForecastCents > 0
      ? clamp((totalActualCents / totalForecastCents) * 100, 0, 100)
      : totalActualCents > 0
        ? 100
        : 0;
  const budgetDonutColor =
    netVarianceCents > 0 ? "#d97706" : "var(--orca-blue)";
  const budgetDonutBackground = `conic-gradient(${budgetDonutColor} 0 ${budgetUsedPercent}%, rgba(51, 114, 227, 0.16) ${budgetUsedPercent}% 100%)`;
  const isFinanciallyUnstarted =
    totalForecastCents === 0 &&
    totalActualCents === 0 &&
    netVarianceCents === 0;
  const futureBudgetEvents = events
    .filter((event) => daysFromToday(event.startDate, today) >= 0)
    .sort(
      (left, right) =>
        left.startDate.getTime() - right.startDate.getTime() ||
        left.name.localeCompare(right.name),
    );
  const futureBudgetEventIds = new Set(
    futureBudgetEvents.map((event) => event.id),
  );
  const fallbackBudgetEvents = events
    .filter(
      (event) =>
        !futureBudgetEventIds.has(event.id) &&
        event.status === EventStatus.ACTIVE,
    )
    .sort(
      (left, right) =>
        Math.abs(daysFromToday(left.startDate, today)) -
          Math.abs(daysFromToday(right.startDate, today)) ||
        left.name.localeCompare(right.name),
    );
  const eventBudgetOverviewEvents = [
    ...futureBudgetEvents,
    ...fallbackBudgetEvents,
  ].slice(0, 3);

  const portfolioCriticalItemByEventId = new Map(
    portfolioCriticalItems.map((item) => [item.eventId, item]),
  );
  const getEventPortfolioSummary = (event: (typeof events)[number]) => {
    const eventTotals = getEventBudgetTotals(event);
    const totalForecast = eventTotals.forecastCents;
    const totalActual = eventTotals.actualCents;
    const pendingApprovals = getEventPendingApprovalCount(event);
    const budgetSummary = summarizePortfolioBudget(
      {
        hasBudget: Boolean(event.budget),
        forecastCents: totalForecast,
        actualCents: totalActual,
      },
      formatExecutiveMoney,
    );
    const overdueTimeline = event.overdueTimelineCount;
    const atRiskTimeline = event.atRiskTimelineCount;
    const riskyDeadlineCount = event.riskyDeadlineCount;
    const pendingBudgetCount = pendingApprovals;
    const overBudgetCount = getEventOverForecastCount(event);
    const metricSignalCount = event.integrationMetrics.filter((metric) => {
      const tone = metricTone(metric);
      return tone === "critical" || tone === "warning";
    }).length;
    const healthSummary = summarizePortfolioHealth({
      riskyDeadlineCount,
      overdueTimelineCount: overdueTimeline,
      atRiskTimelineCount: atRiskTimeline,
      pendingBudgetCount,
      overBudgetCount,
      metricSignalCount,
    });

    return {
      budgetTone: budgetSummary.tone,
      budgetLabel: budgetSummary.label,
      eventHealthCount: healthSummary.count,
      eventHealthTone: healthSummary.tone,
      healthLabel: healthSummary.label,
      nextCriticalItem: portfolioCriticalItemByEventId.get(event.id) ?? null,
    };
  };
  const eventPortfolioSummaries = new Map(
    events.map((event) => [event.id, getEventPortfolioSummary(event)]),
  );
  const eventPortfolioToneRank: Record<RiskTone, number> = {
    critical: 0,
    warning: 1,
    stable: 2,
    neutral: 3,
  };
  const sortedPortfolioEvents = [...events].sort((left, right) => {
    const leftSummary = eventPortfolioSummaries.get(left.id)!;
    const rightSummary = eventPortfolioSummaries.get(right.id)!;
    return (
      eventPortfolioToneRank[leftSummary.eventHealthTone] -
        eventPortfolioToneRank[rightSummary.eventHealthTone] ||
      Math.abs(daysFromToday(left.startDate, today)) -
        Math.abs(daysFromToday(right.startDate, today)) ||
      left.startDate.getTime() - right.startDate.getTime() ||
      left.name.localeCompare(right.name)
    );
  });
  const visiblePortfolioRows = sortedPortfolioEvents.slice(0, 8);
  const remainingPortfolioRows = sortedPortfolioEvents.slice(8);

  const renderTimelineContent = (
    portfolioEvents: typeof rankedPortfolioEvents,
    offset = 0,
  ) => {
    const tickCount = 5;
    const timelineTicks = Array.from({ length: tickCount }, (_, index) => {
      const percent = (index / (tickCount - 1)) * 100;
      const value = new Date(
        timelineWindowStart + (timelineWindowDuration * percent) / 100,
      );
      return { percent, label: formatDate(value) };
    });
    return (
      <div className={styles.timelineContent}>
        <div className={styles.timelineNames}>
          <div className={styles.timelineAxisSpacer}>Events</div>
          {portfolioEvents.map((event, index) => {
            const color =
              TIMELINE_COLORS[(index + offset) % TIMELINE_COLORS.length];
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}/timeline`}
                className={styles.timelineNameRow}
                title={event.name}
              >
                <span
                  className={styles.timelineDot}
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{event.name}</span>
              </Link>
            );
          })}
        </div>
        <div className={styles.timelineGraph}>
          <div className={styles.timelineAxis}>
            {timelineTicks.map((tick) => (
              <span
                key={`${tick.percent}-${tick.label}`}
                className={styles.timelineTick}
                style={{ left: `${tick.percent}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          {showTodayMarker ? (
            <span
              className={styles.timelineMarker}
              style={{ left: `${todayMarkerPercent}%` }}
              aria-hidden
            />
          ) : null}
          {portfolioEvents.map((event, index) => {
            const color =
              TIMELINE_COLORS[(index + offset) % TIMELINE_COLORS.length];
            const placement = getTimelinePlacement(event);
            return (
              <Link
                key={event.id}
                href={`/events/${event.id}/timeline`}
                className={styles.timelineBarRow}
                title={`${event.name}: ${formatDate(event.startDate)}${event.endDate ? ` - ${formatDate(event.endDate)}` : ""}`}
              >
                <span
                  className={styles.timelineBar}
                  style={{
                    background: color,
                    left: `${placement.left}%`,
                    width: `${placement.width}%`,
                  }}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </div>
    );
  };
  const renderRemainingPortfolioEvents = () => {
    if (remainingPortfolioEvents.length === 0) return null;
    return (
      <details className="group">
        <summary
          className={cx(
            styles.timelineFooter,
            "cursor-pointer list-none text-[12px] font-medium text-[var(--orca-blue)] transition hover:bg-blue-50/30 [&::-webkit-details-marker]:hidden",
          )}
        >
          <span className="group-open:hidden">View all events</span>
          <span className="hidden group-open:inline">Show fewer</span>
          <ChevronDown
            className="ml-1.5 inline h-3.5 w-3.5 transition group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="border-t border-slate-100/80">
          {renderTimelineContent(
            remainingPortfolioEvents,
            visiblePortfolioEvents.length,
          )}
        </div>
      </details>
    );
  };
  const renderEventPortfolioRows = (
    portfolioEvents: typeof sortedPortfolioEvents,
  ) =>
    portfolioEvents.map((event) => {
      const summary = eventPortfolioSummaries.get(event.id)!;
      const criticalItemTitle =
        summary.nextCriticalItem?.title ?? "No immediate action";
      const criticalItemContext = summary.nextCriticalItem
        ? portfolioCriticalItemContext(
            summary.nextCriticalItem.dueAt,
            today,
            formatDate,
          )
        : "Nothing critical in the next 10 days";

      return (
        <Link
          key={event.id}
          href={`/events/${event.id}`}
          className={styles.snapshotRow}
          aria-label={`Open ${event.name}. Next critical item: ${criticalItemTitle}, ${criticalItemContext}. Budget: ${summary.budgetLabel}. Health: ${summary.healthLabel}${summary.eventHealthCount > 0 ? `, ${summary.eventHealthCount} operational signals` : ""}.`}
        >
          <span className={styles.snapshotEventCell}>
            <span className={styles.snapshotEventName} title={event.name}>
              {event.name}
            </span>
            <span className={styles.snapshotSecondaryText}>
              {formatDateRange(event.startDate, event.endDate)}
            </span>
          </span>
          <span className={styles.snapshotCriticalCell}>
            <span className={styles.snapshotCriticalTitle} title={criticalItemTitle}>
              {criticalItemTitle}
            </span>
            <span className={styles.snapshotSecondaryText}>
              {criticalItemContext}
            </span>
          </span>
          <span className={styles.snapshotBudgetCell}>
            <span className={styles.snapshotMobileLabel}>Budget</span>
            <StatusBadge tone={summary.budgetTone}>
              {summary.budgetLabel}
            </StatusBadge>
          </span>
          <span className={styles.snapshotHealthCell}>
            <span className={styles.snapshotMobileLabel}>Health</span>
            <StatusBadge tone={summary.eventHealthTone}>
              {summary.healthLabel}
            </StatusBadge>
          </span>
        </Link>
      );
    });
  return (
    <div className={styles.dashboardPage}>
      <div className={styles.dashboardShell} data-testid="command-center-shell">
        <header className={styles.dashboardHeader} data-testid="command-center-header">
          <div className="min-w-0">
            <h1 className={styles.dashboardTitle}>Command Center</h1>
          </div>

          <div className={styles.dashboardActions} data-testid="command-center-actions">
            <EventLauncher />
            <Link
              href="/events/new"
              className={styles.primaryButton}
              aria-label="Open Event Builder to create an event"
              title="Open Event Builder to create an event"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create Event
            </Link>
          </div>
        </header>

        <section className={styles.kpiGrid} data-testid="command-center-kpi-grid">
          <KpiCard
            label="EVENTS"
            value={events.length.toString()}
            icon={CalendarDays}
            tone="neutral"
            accent="blue"
            href={eventsHref}
            title={`View all ${events.length} events`}
          />
          <KpiCard
            label="AT RISK"
            value={urgentRisksCount.toString()}
            icon={ShieldAlert}
            tone={urgentRisksCount > 0 ? "critical" : "healthy"}
            href={atRiskHref}
            title="Open portfolio risk actions"
          />
          <KpiCard
            label="BUDGET"
            value={formatExecutiveMoney(netVarianceCents)}
            icon={CircleDollarSign}
            tone={netVarianceCents !== 0 ? "warning" : "healthy"}
            accent="cyan"
            href={budgetVarianceHref}
            title="Open portfolio budget actions"
          />
          <KpiCard
            label="APPROVALS"
            value={pendingApprovalsCount.toString()}
            icon={CheckCircle2}
            tone={pendingApprovalsCount > 0 ? "warning" : "healthy"}
            accent="purple"
            href={approvalsHref}
            title="Open portfolio approval actions (budget approvals, submissions, and documents in review)"
          />
          <KpiCard
            label="DEADLINES"
            value={overdueDeadlinesCount.toString()}
            icon={Clock3}
            tone={
              overdueDeadlinesCount > 0
                ? "critical"
                : deadlineSignalCount > 0
                  ? "warning"
                  : "healthy"
            }
            href={overdueHref}
            title="Open portfolio deadline actions"
          />
          <KpiCard
            label="OVERDUE"
            value={overdueActionableCount.toString()}
            icon={Clock3}
            tone={overdueActionableCount > 0 ? "critical" : "healthy"}
            href={deadlinesHref}
            title="Open overdue portfolio actions"
          />
        </section>

        <section className={styles.midGrid}>
          <DashboardPanel
            title="Portfolio Timeline"
            action={
              <span className={styles.timelinePanelMeta}>
                <StatusBadge tone="neutral">
                  {visiblePortfolioEvents.length} of {rankedPortfolioEvents.length}{" "}
                  events
                </StatusBadge>
                <span className={styles.timelinePriorityHelp}>
                  <button
                    type="button"
                    className={styles.timelinePriorityTrigger}
                    aria-label="How portfolio events are prioritized"
                    aria-describedby="portfolio-timeline-prioritization"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span id="portfolio-timeline-prioritization" className="sr-only">
                    Prioritized by event status, risks, approvals, and budget signals.
                  </span>
                  <span className={styles.timelinePriorityTooltip} aria-hidden>
                    Prioritized by event status, risks, approvals, and budget signals.
                  </span>
                </span>
              </span>
            }
          >
            {rankedPortfolioEvents.length === 0 ? (
              <EmptyState>No portfolio events available.</EmptyState>
            ) : (
              <>
                {renderTimelineContent(visiblePortfolioEvents)}
                {renderRemainingPortfolioEvents()}
              </>
            )}
          </DashboardPanel>

          <DashboardPanel title="Upcoming Deadlines">
            {deadlines.length === 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100/80 bg-emerald-50/45 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-950">
                    No urgent deadlines
                  </p>
                  <p className="mt-0.5 text-[12px] leading-4 text-slate-600">
                    Clear for the next {DEADLINE_LOOKAHEAD_DAYS} days.
                  </p>
                </div>
                <StatusBadge tone="stable">Clear</StatusBadge>
              </div>
            ) : (
              <div className={styles.deadlineList}>
                {deadlines.slice(0, 3).map((deadline) => {
                  const tone = deadlineTone(
                    deadline.status,
                    deadline.dueAt,
                    today,
                  );
                  return (
                    <Link
                      key={deadline.id}
                      href={commandCenterRoadmapRecordHref(deadline.event.id, deadline.id)}
                      className={styles.deadlineRow}
                    >
                      <span className={styles.deadlineDate}>
                        <span className={styles.deadlineMonth}>
                          {dateFormatter.format(deadline.dueAt).split(" ")[0]}
                        </span>
                        <span className={styles.deadlineDay}>
                          {deadline.dueAt.getDate()}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={styles.deadlineTitle}>
                          {deadline.title}
                        </span>
                        <span className={styles.deadlineEvent}>
                          {deadline.event.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <StatusBadge tone={tone}>
                          {deadline.status === DeadlineStatus.BLOCKED
                            ? "Blocked"
                            : dueLabel(deadline.dueAt, today)}
                        </StatusBadge>
                      </span>
                    </Link>
                  );
                })}
                <Link
                  href="/dashboard/action-center?view=deadlines"
                  className={styles.deadlineCta}
                >
                  {deadlines.length > 3
                    ? `View all ${deadlines.length} deadlines`
                    : "View all deadlines"}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            )}
          </DashboardPanel>
        </section>

        <section className={styles.financialOverviewGrid}>
          <DashboardPanel
            title="Portfolio Financial Health"
            action={
              <Link
                href={financialsHref}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--orca-blue)] hover:underline"
              >
                Open budgets
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          >
            <div className={styles.financialGrid}>
              <div className="flex flex-col items-center justify-center">
                {isFinanciallyUnstarted ? (
                  <div className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-4 text-center shadow-[0_8px_18px_rgba(15,23,42,0.022)]">
                    <p className="text-[13px] font-medium text-slate-950">
                      Budget ready for setup
                    </p>
                    <p className="mx-auto mt-1 max-w-[220px] text-[12px] leading-4 text-slate-500">
                      No forecast or actual spend yet.
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      className={styles.donutWrap}
                      style={{ background: budgetDonutBackground }}
                      aria-label={`Budget utilization ${Math.round(budgetUsedPercent)} percent. Forecast ${formatMoney(totalForecastCents)}, actual ${formatMoney(totalActualCents)}, variance ${formatVarianceForecastLabel(netVarianceCents)}.`}
                      title={`Forecast ${formatMoney(totalForecastCents)} / Actual ${formatMoney(totalActualCents)} / Variance ${formatVarianceForecastLabel(netVarianceCents)}`}
                    >
                      <div className={styles.donutCenter}>
                        <span className="text-[10px] font-medium text-slate-500">
                          Actualized
                        </span>
                        <span className="mt-1 max-w-[74px] truncate text-[17px] font-medium leading-none text-slate-950">
                          {Math.round(budgetUsedPercent)}%
                        </span>
                      </div>
                    </div>
                    <p
                      className={`mt-3 text-center text-[14px] font-medium ${netVarianceCents > 0 ? "text-amber-700" : netVarianceCents < 0 ? "text-emerald-700" : "text-slate-950"}`}
                    >
                      {formatVarianceForecastLabel(netVarianceCents)}
                    </p>
                    <p className="mt-1 text-center text-[12px] leading-4 text-slate-500">
                      {formatExecutiveMoney(totalActualCents)} actualized
                    </p>
                  </>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className={styles.financialMetrics}>
                  <div className={styles.financialMetric}>
                    <p className={styles.financialMetricLabel}>Forecast</p>
                    <p
                      className={styles.financialMetricValue}
                      title={formatMoney(totalForecastCents)}
                    >
                      {totalForecastCents > 0
                        ? formatExecutiveMoney(totalForecastCents)
                        : "$0"}
                    </p>
                  </div>
                  <div className={styles.financialMetric}>
                    <p className={styles.financialMetricLabel}>Actual</p>
                    <p
                      className={styles.financialMetricValue}
                      title={formatMoney(totalActualCents)}
                    >
                      {totalActualCents > 0
                        ? formatExecutiveMoney(totalActualCents)
                        : "$0"}
                    </p>
                  </div>
                  <div className={styles.financialMetric}>
                    <p className={styles.financialMetricLabel}>Variance</p>
                    <p
                      className={cx(
                        styles.financialMetricValue,
                        netVarianceCents > 0
                          ? "text-amber-700"
                          : netVarianceCents < 0
                            ? "text-emerald-700"
                            : "text-slate-800",
                      )}
                      title={formatMoney(netVarianceCents)}
                    >
                      {formatVarianceForecastLabel(netVarianceCents)}
                    </p>
                  </div>
                </div>

                {isFinanciallyUnstarted || financialCategories.length === 0 ? (
                  <EmptyState>
                    No category-level budget data is available yet.
                  </EmptyState>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                      <span>Top spend categories</span>
                      <span>Actual / forecast</span>
                    </div>
                    {topFinancialCategories.map((category) => {
                      const categoryKey = resolveBudgetCategory(category.category) ?? getBudgetCategoryDisplay(category.category);
                      const usedPercent =
                        category.forecastCents > 0
                          ? Math.round(
                              (category.actualCents / category.forecastCents) *
                                100,
                            )
                          : 0;
                      const spendWidth =
                        category.forecastCents > 0
                          ? clamp(
                              (category.actualCents / category.forecastCents) *
                                100,
                              0,
                              100,
                            )
                          : category.actualCents > 0
                            ? 100
                            : 0;
                      const categoryTitle = `${category.category}: ${formatExecutiveMoney(category.actualCents)} actual of ${formatExecutiveMoney(category.forecastCents)} forecast (${usedPercent}% used)`;
                      return (
                        <Link
                          key={category.category}
                          href={accountFinancialsHref({ category: categoryKey, view: "categories" })}
                          className="block space-y-2 rounded-xl border border-transparent p-2 transition hover:border-blue-100 hover:bg-blue-50/20"
                          title={categoryTitle}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 text-[13px] font-medium text-slate-800">
                              {category.category}
                            </p>
                            <p
                              className="shrink-0 text-[12px] font-medium text-slate-500"
                              title={`${formatMoney(category.actualCents)} / ${formatMoney(category.forecastCents)}`}
                            >
                              {formatExecutiveMoney(category.actualCents)} /{" "}
                              {formatExecutiveMoney(category.forecastCents)} ·{" "}
                              {usedPercent}%
                            </p>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-[var(--orca-blue)]"
                              style={{ width: `${spendWidth}%` }}
                            />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Event Budget Overview"
            action={
              <Link
                href={financialsEventsHref}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--orca-blue)] hover:underline"
              >
                View all events
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          >
            <div className={styles.eventBudgetHeader}>
              Next 3 upcoming events
            </div>
            {eventBudgetOverviewEvents.length === 0 ? (
              <EmptyState>
                No event budget data is available for visible events.
              </EmptyState>
            ) : (
              <div className={styles.eventBudgetList}>
                {eventBudgetOverviewEvents.map((event, index) => {
                  const eventTotals = getEventBudgetTotals(event);
                  const forecastCents = eventTotals.forecastCents;
                  const actualCents = eventTotals.actualCents;
                  const percentUsed =
                    forecastCents > 0 ? actualCents / forecastCents : 0;
                  const usedPercent =
                    forecastCents > 0 ? Math.round(percentUsed * 100) : 0;
                  const barWidth =
                    forecastCents > 0
                      ? clamp(percentUsed * 100, 0, 100)
                      : actualCents > 0
                        ? 100
                        : 0;
                  const trend =
                    forecastCents <= 0
                      ? "No budget"
                      : actualCents > forecastCents
                        ? "Over budget"
                        : percentUsed >= 0.75
                          ? "Watching"
                          : "On track";
                  const trendTone =
                    trend === "Over budget"
                      ? "danger"
                      : trend === "Watching"
                        ? "warning"
                        : trend === "No budget"
                          ? "neutral"
                          : "brand";
                  const usageLabel = `${event.name} budget usage: ${formatMoney(actualCents)} actual of ${formatMoney(forecastCents)} forecast, ${usedPercent}% used.`;

                  return (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}/budget`}
                      className={styles.eventBudgetRow}
                    >
                      <span
                        className={cx(
                          styles.eventBudgetIcon,
                          index === 0
                            ? styles.eventBudgetIconBlue
                            : index === 1
                              ? styles.eventBudgetIconPurple
                              : styles.eventBudgetIconRose,
                        )}
                      >
                        <CircleDollarSign className="h-4 w-4" aria-hidden />
                      </span>
                      <span className={styles.eventBudgetMain}>
                        <span className={styles.eventBudgetName}>
                          {event.name}
                        </span>
                        <span className={styles.eventBudgetMeta}>
                          <span>
                            {formatDateRange(event.startDate, event.endDate)}
                          </span>
                          <span>
                            {eventStartDistanceLabel(event.startDate, today)}
                          </span>
                        </span>
                        <span className={styles.eventBudgetMetrics}>
                          <span>
                            {formatExecutiveMoney(forecastCents)} forecast
                          </span>
                          <span>
                            {formatExecutiveMoney(actualCents)} actual
                          </span>
                          <span>{usedPercent}% used</span>
                        </span>
                        <span
                          className={styles.eventBudgetProgress}
                          role="img"
                          aria-label={usageLabel}
                        >
                          <span
                            className={cx(
                              styles.eventBudgetProgressFill,
                              styles[
                                `eventBudgetProgress${trendTone[0].toUpperCase()}${trendTone.slice(1)}`
                              ],
                            )}
                            style={{ width: `${barWidth}%` }}
                          />
                        </span>
                        <span className={styles.eventBudgetFooter}>
                          <span
                            className={cx(
                              styles.eventBudgetTrend,
                              styles[
                                `eventBudgetTrend${trendTone[0].toUpperCase()}${trendTone.slice(1)}`
                              ],
                            )}
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            {trend}
                          </span>
                          <span className={styles.eventBudgetVariance}>
                            {formatBudgetDeltaLabel(forecastCents, actualCents)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </DashboardPanel>
        </section>

        <DashboardPanel
          id="event-snapshot"
          title="Event Snapshot"
          action={
            <StatusBadge tone="neutral">{events.length} events</StatusBadge>
          }
        >
          {events.length === 0 ? (
            <EmptyState>
              No events are available in this organization yet.
            </EmptyState>
          ) : (
            <div
              className={styles.snapshotTable}
              data-testid="event-portfolio-table"
            >
              <div className={styles.snapshotHeader}>
                <span>Event</span>
                <span>Next Critical Item</span>
                <span>Budget</span>
                <span>Health</span>
              </div>
              <div className={styles.snapshotRows}>
                {renderEventPortfolioRows(visiblePortfolioRows)}
                {remainingPortfolioRows.length > 0 ? (
                  <details className={cx(styles.snapshotExpansion, "group")}>
                    <summary className={styles.snapshotExpansionControl}>
                      <span className="group-open:hidden">
                        View all {sortedPortfolioEvents.length} events
                      </span>
                      <span className="hidden group-open:inline">Show fewer</span>
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </summary>
                    <div className={styles.snapshotExpandedRows}>
                      {renderEventPortfolioRows(remainingPortfolioRows)}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
}
