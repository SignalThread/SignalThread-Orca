import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bed,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  History,
  Inbox,
  LayoutGrid,
  ListChecks,
  MapPin,
  Mic,
  Presentation,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  commandCenterRoadmapRecordHref,
  eventBudgetGridHref,
  eventTimelineListHref,
} from "@/lib/event-command-center-links";
import { getConflictDistributionModel } from "@/lib/event-command-center-conflict-distribution";
import type { EventCommandCenterPayload, NotificationItem } from "@/src/server/services/event-command-center";
import type { EventDashboardWidgetState } from "./event-command-center-widget-registry";
import styles from "./event-command-center.module.css";

type EventCommandCenterData = EventCommandCenterPayload;

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactMoneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function formatCompactMoney(cents: number): string {
  return compactMoneyFormatter.format(cents / 100);
}

function formatEventDateRange(event: EventCommandCenterData["event"]): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const start = formatter.format(new Date(event.startDate));
  const end = formatter.format(new Date(event.endDate));
  return start === end ? start : `${start} - ${end}`;
}

function formatMonthDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatMonthDayParts(value: string): { month: string; day: string; label: string } {
  const label = formatMonthDay(value);
  const [month = "", day = ""] = label.split(" ");
  return { month, day, label };
}

function statusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function budgetUsedPercent(financial: EventCommandCenterPayload["event"]["financial"]): number {
  return financial.forecast > 0 ? Math.round((financial.actual / financial.forecast) * 100) : 0;
}

function deadlineBadgeLabel(deadline: EventCommandCenterData["event"]["deadlines"][number]): string {
  if (deadline.status === "completed") return "Complete";
  if (deadline.status === "overdue") return "Overdue";
  if (deadline.daysRemaining === 0) return "Due today";
  return `Due in ${deadline.daysRemaining}d`;
}

function roadmapItemDueLabel(item: EventCommandCenterData["event"]["roadmapProgress"]["upcomingItems"][number]): string {
  if (item.daysRemaining === null) return item.status === "AT_RISK" ? "At risk" : "No due date";
  if (item.daysRemaining < 0) return `${Math.abs(item.daysRemaining)} days overdue`;
  if (item.daysRemaining === 0) return "Due today";
  return `Due in ${item.daysRemaining}d`;
}

function notificationTone(severity: NotificationItem["severity"]): "critical" | "warning" | "neutral" {
  if (severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "neutral";
}

function notificationHref(type: NotificationItem["type"], links: EventCommandCenterPayload["links"]): string {
  if (type === "approval") return links.docs;
  if (type === "budget") return links.budget;
  if (type === "deadline" || type === "risk") return links.timeline;
  return links.runOfShow;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className={styles.emptyState}>{children}</div>;
}

function WidgetAction({ href, label }: { href: string; label: string }) {
  if (!href) return <span className={styles.disabledInlineAction}>{label}</span>;
  return (
    <Link href={href} className={styles.inlineAction}>
      {label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function WidgetPanel({
  title,
  children,
  action,
}: {
  title: string;
  // Accepted for call-site compatibility; titles render without an icon to
  // match the org dashboard's clean panel headers.
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  const titleId = `widget-${title.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`;
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHeader}>
        <h2 id={titleId} className={styles.cardTitle}>{title}</h2>
        {action}
      </div>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "neutral" | "stable" | "warning" | "critical" | "accent";
  href: string;
}) {
  return (
    <Link href={href} className={styles.kpiCard} aria-label={`${label}: ${value}. ${detail}`}>
      <span className={cx(styles.kpiIcon, styles[`kpiIcon${tone.charAt(0).toUpperCase() + tone.slice(1)}`])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className={styles.kpiContent}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiValue}>{value}</span>
      </span>
    </Link>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(clampPercent(value));
  return (
    <div className={styles.progressShell} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`}>
      <span className={styles.progressTrack}>
        <span className={styles.progressFill} style={{ width: `${percent}%` }} />
      </span>
      <span className={styles.progressMeta}>{percent}%</span>
    </div>
  );
}

function DonutChart({ value, label }: { value: number; label: string }) {
  const percent = Math.round(clampPercent(value));
  return (
    <div className={styles.donutChart} style={{ "--donut-value": `${percent}%` } as CSSProperties} aria-label={`${label}: ${percent}%`} role="img">
      <span className={styles.donutCenter}>
        <span className={styles.donutValue}>{percent}%</span>
        <span className={styles.donutLabel}>{label}</span>
      </span>
      <span className={styles.srOnly}>{label} is {percent}%.</span>
    </div>
  );
}

function ConflictDistributionDonut({
  critical,
  warning,
  neutral,
}: {
  critical: number;
  warning: number;
  neutral: number;
}) {
  const model = getConflictDistributionModel({ critical, warning, neutral });

  return (
    <div
      className={cx(styles.donutChart, styles.conflictDistributionDonut)}
      style={
        {
          "--conflict-critical-end": model.criticalEnd,
          "--conflict-warning-end": model.warningEnd,
          "--conflict-neutral-end": model.neutralEnd,
        } as CSSProperties
      }
      aria-label={model.summary}
      role="img"
    >
      <span className={styles.donutCenter}>
        <span className={styles.donutValue}>{model.total}</span>
        <span className={styles.donutLabel}>{model.conflictLabel}</span>
      </span>
      <span className={styles.srOnly}>{model.summary}</span>
    </div>
  );
}

function MiniBars({ rows }: { rows: Array<{ label: string; value: number; href?: string; tone?: "success" | "warning" | "critical" | "neutral" }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className={styles.miniBars}>
      {rows.map((row) => {
        const content = <>
          <span>{row.label}</span>
          <span className={styles.miniBarTrack}>
            <span className={cx(styles.miniBarFill, row.tone && styles[`miniBar${row.tone}`])} style={{ width: `${clampPercent((row.value / max) * 100)}%` }} />
          </span>
          <span className={styles.miniBarValue}>{row.value.toLocaleString()}</span>
        </>;
        return row.href ? (
          <Link key={row.label} href={row.href} className={styles.miniBarRow} aria-label={`Open ${row.label} in the full budget grid`}>
            {content}
          </Link>
        ) : (
          <div key={row.label} className={styles.miniBarRow}>{content}</div>
        );
      })}
    </div>
  );
}

function notificationTypeLabel(type: NotificationItem["type"]): string {
  if (type === "approval") return "Approval";
  if (type === "budget") return "Budget";
  if (type === "risk") return "Risk";
  if (type === "opportunity") return "Opportunity";
  return "Deadline";
}

function notificationActionLabel(type: NotificationItem["type"]): string {
  if (type === "approval") return "Review";
  if (type === "budget") return "Open budget";
  if (type === "risk") return "Resolve";
  return "Open";
}

function notificationDueLabel(item: NotificationItem): string {
  if (!item.dueDate) return notificationTypeLabel(item.type);
  return formatActivityTime(item.dueDate);
}

function NeedsYouWidget({ data }: { data: EventCommandCenterData }) {
  const items = data.event.notifications.slice(0, 6);
  const criticalCount = items.filter((item) => item.severity === "high").length;
  const summary =
    items.length === 0
      ? "Nothing is waiting on you"
      : `${items.length} item${items.length === 1 ? "" : "s"} need a decision${criticalCount > 0 ? ` · ${criticalCount} urgent` : ""}`;
  return (
    <WidgetPanel
      title="Needs You"
      icon={Inbox}
      action={<WidgetAction href={data.links.timeline} label="View all" />}
    >
      {items.length === 0 ? (
        <EmptyState>
          <strong>You&rsquo;re all caught up</strong>
          <span>No approvals, blockers, or at-risk items are waiting on you right now.</span>
        </EmptyState>
      ) : (
        <>
          <p className={styles.supportingText}>{summary}</p>
          <ul className={styles.needsYouList} aria-label="Items that need your attention">
            {items.map((item) => {
              const href = notificationHref(item.type, data.links);
              const tone = notificationTone(item.severity);
              return (
                <li key={item.id}>
                  <Link href={href || data.links.timeline} className={styles.needsYouRow}>
                    <span className={cx(styles.statusDot, styles[`statusDot${tone}`])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={styles.actionTitle}>{item.title}</span>
                      <span className={styles.actionDetail}>
                        {notificationTypeLabel(item.type)}
                        {item.description ? ` · ${item.description}` : ""}
                      </span>
                    </span>
                    <span className={styles.needsYouMeta}>
                      <span className={cx(styles.pill, styles[`pill${tone}`])}>{notificationDueLabel(item)}</span>
                      <span className={styles.needsYouAction}>
                        {notificationActionLabel(item.type)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </WidgetPanel>
  );
}

function ActivityFeedWidget({ data }: { data: EventCommandCenterData }) {
  const items = data.event.activity.slice(0, 6);
  return (
    <WidgetPanel title="Activity" icon={History} action={<WidgetAction href={`/events/${data.event.id}/activity`} label="View all" />}>
      {items.length === 0 ? (
        <EmptyState>
          <strong>No recent activity</strong>
          <span>Updates to roadmap items, budget, and the schedule will appear here as they happen.</span>
        </EmptyState>
      ) : (
        <ul className={styles.activityList} aria-label="Recent event activity">
          {items.map((item) => (
            <li key={item.id} className={styles.activityRow}>
              <span className={styles.activityDot} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={styles.actionTitle}>{item.message}</span>
                <span className={styles.actionDetail}>
                  {statusLabel(item.type)} · {item.actor} · {formatActivityTime(item.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetPanel>
  );
}

function KpiRowWidget({ data }: { data: EventCommandCenterData }) {
  const daysLabel = data.event.timing?.value ?? (data.event.daysToEvent < 0 ? `${Math.abs(data.event.daysToEvent)} days past` : `${data.event.daysToEvent} days`);
  const atRiskCount = data.event.KPIs.blockers.atRiskTimelineItems;
  const speakersNeedingInfo = data.event.speakers.tasksPending;
  const deadlineCount = data.event.KPIs.overdueItems;
  return (
    <section className={styles.kpiGrid} aria-label="Event health metrics">
      <KpiCard label="DAYS TO EVENT" value={daysLabel} detail={data.event.timing?.detail ?? data.event.timezone} icon={CalendarDays} tone="neutral" href={data.links.timeline} />
      <KpiCard label="AT RISK" value={String(atRiskCount)} detail="At-risk roadmap items" icon={ShieldAlert} tone={atRiskCount > 0 ? "critical" : "stable"} href={data.links.timeline} />
      <KpiCard
        label="BUDGET"
        value={
          data.event.KPIs.budgetStatus.statusLabel === "No budget data"
            ? "No budget data"
            : data.event.KPIs.budgetStatus.variance === 0
              ? "On track"
              : `${formatCompactMoney(Math.abs(data.event.KPIs.budgetStatus.variance))} ${data.event.KPIs.budgetStatus.variance > 0 ? "under" : "over"}`
        }
        detail="Budget variance"
        icon={CircleDollarSign}
        tone={data.event.financial.varianceStatus === "over" ? "critical" : "accent"}
        href={data.links.budget}
      />
      <KpiCard label="APPROVALS" value={String(data.event.KPIs.approvals)} detail="Documents and budget approvals" icon={CheckCircle2} tone={data.event.KPIs.approvals > 0 ? "warning" : "stable"} href={data.links.docs} />
      <KpiCard label="DEADLINES" value={String(deadlineCount)} detail="Overdue roadmap items" icon={AlertTriangle} tone={deadlineCount > 0 ? "critical" : data.event.deadlines.length > 0 ? "warning" : "stable"} href={data.links.timeline} />
      <KpiCard label="SPEAKERS" value={String(speakersNeedingInfo)} detail={`${data.event.speakers.sessionStatus.confirmed} confirmed, ${speakersNeedingInfo} needing info of ${data.event.speakers.totalSpeakers} speakers`} icon={Mic} tone={speakersNeedingInfo > 0 ? "warning" : "stable"} href={data.links.speakers} />
    </section>
  );
}

function UpcomingDeadlinesWidget({ data }: { data: EventCommandCenterData }) {
  const hasAdditionalDeadlines = data.event.deadlines.length > 5;
  return (
    <WidgetPanel title="Upcoming Critical Dates" icon={CalendarDays} action={hasAdditionalDeadlines ? <WidgetAction href={eventTimelineListHref(data.event.id)} label="View all" /> : undefined}>
      {data.event.deadlines.length === 0 ? (
        <EmptyState>No upcoming critical dates</EmptyState>
      ) : (
        <ul className={styles.actionList} aria-label="Upcoming deadline widget list">
          {data.event.deadlines.slice(0, 5).map((deadline) => {
            const dateParts = formatMonthDayParts(deadline.eventDate);
            const timingTone = deadline.status === "overdue" ? "critical" : deadline.daysRemaining <= 7 ? "warning" : "neutral";
            return (
              <li key={deadline.id}>
                <Link href={commandCenterRoadmapRecordHref(data.event.id, deadline.id)} className={cx(styles.actionRow, styles.criticalDateRow)} aria-label={`${deadline.title} due ${dateParts.label}. ${deadlineBadgeLabel(deadline)}`}>
                  <span className={cx(styles.dateBadge, styles.criticalDateBadge)} aria-hidden>
                    <span>{dateParts.month}</span>
                    <span>{dateParts.day}</span>
                  </span>
                  <span className={styles.criticalDateContent}>
                    <span className={styles.actionTitle} title={deadline.title}>{deadline.title}</span>
                    <span className={styles.actionDetail}>{statusLabel(deadline.category)}</span>
                  </span>
                  <span className={cx(styles.pill, styles.criticalDateTiming, styles[`pill${timingTone}`])}>{deadlineBadgeLabel(deadline)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetPanel>
  );
}

function PlannerFocusWidget({ data }: { data: EventCommandCenterData }) {
  const items = data.event.plannerFocus.slice(0, 5);
  return (
    <WidgetPanel title="Planner Focus" icon={Inbox}>
      {items.length === 0 ? (
        <EmptyState>No immediate action required.</EmptyState>
      ) : (
        <ul className={styles.actionList} aria-label="Planner focus list">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cx(styles.actionRow, styles.focusRow)}
                aria-label={`${item.title}. ${item.source}. ${item.urgency}. ${item.reason}`}
                title={item.reason}
              >
                <span className={cx(styles.statusDot, styles[`statusDot${item.tone}`])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={styles.focusTitle}>{item.title}</span>
                  <span className={styles.focusMeta}>
                    <span className={styles.focusSource}>{item.source}</span>
                    {item.reason ? ` · ${item.reason}` : ""}
                  </span>
                </span>
                <span className={cx(styles.pill, styles[`pill${item.tone}`])}>{item.urgency}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetPanel>
  );
}

function RoadmapProgressWidget({ data }: { data: EventCommandCenterData }) {
  const roadmap = data.event.roadmapProgress;
  return (
    <WidgetPanel title="Planning Progress" icon={ListChecks} action={<WidgetAction href={data.links.timeline} label="View Roadmap" />}>
      {roadmap.totalTasks === 0 ? (
        <EmptyState><strong>No roadmap has been created yet.</strong><WidgetAction href={data.links.timeline} label="Open Roadmap" /></EmptyState>
      ) : (
        <div className={styles.roadmapProgressStack}>
          <div className={styles.roadmapProgressSummary}>
            <div className="min-w-0"><span className={styles.metricHeroValue}>{roadmap.percentComplete}%</span><span className={styles.metricHeroLabel}>Overall Progress</span></div>
            <ProgressBar value={roadmap.percentComplete} label="Roadmap planning progress" />
          </div>
          {/* The roadmap rollup counts every non-root task, subtasks included. Saying so keeps
              the headline reconcilable with the Roadmap list. */}
          <p className={styles.supportingText}>
            Across {roadmap.totalTasks.toLocaleString()} roadmap tasks, including subtasks.
          </p>
          <dl className={styles.roadmapStatusGrid} aria-label="Roadmap task status counts">
            <div className={styles.statTile}><dt className={styles.statLabel}>Completed</dt><dd className={styles.statValue}>{roadmap.completed}</dd></div>
            <div className={styles.statTile}><dt className={styles.statLabel}>In Progress</dt><dd className={styles.statValue}>{roadmap.inProgress}</dd></div>
            <div className={styles.statTile}><dt className={styles.statLabel}>Not Started</dt><dd className={styles.statValue}>{roadmap.notStarted}</dd></div>
            <div className={styles.statTile}><dt className={styles.statLabel}>At Risk</dt><dd className={styles.statValue}>{roadmap.atRisk}</dd></div>
          </dl>
          <div className={styles.roadmapUpcomingBlock}>
            <h3 className={styles.widgetSectionTitle}>Upcoming</h3>
            {roadmap.upcomingItems.length > 0 ? (
              <ul className={styles.compactTableList} aria-label="Upcoming roadmap items">
                {roadmap.upcomingItems.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <Link href={commandCenterRoadmapRecordHref(data.event.id, item.id)} className={styles.compactTableRow}>
                      <span className={cx(styles.statusDot, styles[`statusDot${item.status === "AT_RISK" ? "warning" : item.daysRemaining !== null && item.daysRemaining < 0 ? "critical" : "neutral"}`])} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={styles.actionTitle}>{item.title}</span>
                        <span className={styles.actionDetail}>{roadmapItemDueLabel(item)}</span>
                      </span>
                      <span className={cx(styles.pill, styles[`pill${item.status === "AT_RISK" ? "warning" : item.daysRemaining !== null && item.daysRemaining < 0 ? "critical" : "neutral"}`])}>{statusLabel(item.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.supportingText}>All roadmap tasks are complete.</p>}
          </div>
        </div>
      )}
    </WidgetPanel>
  );
}

function EventBudgetOverviewWidget({ data }: { data: EventCommandCenterData }) {
  const financial = data.event.financial;
  const budgetPercent = budgetUsedPercent(financial);
  const hasBudget = financial.forecast > 0 || financial.actual > 0 || financial.categories.length > 0;
  return (
    <WidgetPanel title="Financial Exposure" icon={CircleDollarSign} action={<WidgetAction href={data.links.budget} label="View full budget" />}>
      {!hasBudget ? (
        <EmptyState>No budget data yet.</EmptyState>
      ) : (
        <>
          <div className={styles.budgetOverview}>
            <DonutChart value={budgetPercent} label="Spent" />
            <dl className={styles.financeDefinitionGrid}>
              <div><dt>Total Budget</dt><dd>{formatCompactMoney(financial.forecast)}</dd></div>
              <div><dt>Actual</dt><dd>{formatCompactMoney(financial.actual)}</dd></div>
              <div><dt>Variance</dt><dd>{data.event.KPIs.budgetStatus.statusLabel}</dd></div>
            </dl>
          </div>
          {financial.categories.length > 0 ? (
            <table className={styles.budgetTable}>
              <thead>
                <tr><th>Category</th><th>Budget</th><th>Actual</th><th>Variance</th></tr>
              </thead>
              <tbody>
                {financial.categories.slice(0, 6).map((category) => (
                  <tr key={category.name}>
                    <td><Link href={eventBudgetGridHref(data.event.id, { category: category.name })}>{category.name}</Link></td>
                    <td>{formatCompactMoney(category.forecast)}</td>
                    <td>{formatCompactMoney(category.actual)}</td>
                    <td className={category.variance < 0 ? styles.budgetVarianceNeg : styles.budgetVariancePos}>
                      {category.variance < 0
                        ? `(${formatCompactMoney(Math.abs(category.variance))})`
                        : formatCompactMoney(category.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </WidgetPanel>
  );
}

function FinancialSummaryWidget({ data }: { data: EventCommandCenterData }) {
  const budgetPercent = budgetUsedPercent(data.event.financial);
  return (
    <WidgetPanel title="Financial Summary" icon={CircleDollarSign} action={<WidgetAction href={data.links.budget} label="Report" />}>
      {data.event.financial.categories.length === 0 ? (
        <EmptyState>No budget categories yet.</EmptyState>
      ) : (
        <div className={styles.financialSummaryLayout}>
          <DonutChart value={budgetPercent} label="Actualized" />
          <div className={styles.financialSummaryDetails}>
            <dl className={styles.financeDefinitionGrid}>
              <div><dt>Forecast</dt><dd>{formatMoney(data.event.financial.forecast)}</dd></div>
              <div><dt>Actual</dt><dd>{formatMoney(data.event.financial.actual)}</dd></div>
              <div><dt>Variance</dt><dd>{data.event.KPIs.budgetStatus.statusLabel}</dd></div>
            </dl>
            <MiniBars rows={data.event.financial.categories.slice(0, 5).map((category) => ({ label: category.name, value: Math.round(category.actual / 100), href: eventBudgetGridHref(data.event.id, { category: category.name }), tone: category.status === "over" ? "critical" : "neutral" }))} />
          </div>
        </div>
      )}
    </WidgetPanel>
  );
}

function ConflictsDetailsWidget({ data }: { data: EventCommandCenterData }) {
  const actionQueue = data.event.conflicts.slice(0, 5).map((item) => ({
    ...item,
    href: item.href ?? commandCenterRoadmapRecordHref(data.event.id, item.id),
    dueLabel: item.dueLabel.includes("T") ? formatActivityTime(item.dueLabel) : item.dueLabel,
  }));
  const criticalCount = actionQueue.filter((item) => item.tone === "critical").length;
  const warningCount = actionQueue.filter((item) => item.tone === "warning").length;
  const neutralCount = actionQueue.length - criticalCount - warningCount;
  return (
    <WidgetPanel title="Open Conflicts" icon={ListChecks} action={<WidgetAction href={eventTimelineListHref(data.event.id, { conflict: true })} label="View All Conflicts" />}>
      {actionQueue.length === 0 ? (
        <EmptyState>No conflicts need attention.</EmptyState>
      ) : (
        <div className={styles.conflictsLayout}>
          <div className={styles.conflictSummary}>
            <ConflictDistributionDonut critical={criticalCount} warning={warningCount} neutral={neutralCount} />
            <div className={styles.legendList}>
              <span><i className={styles.legendDotRed} />Critical {criticalCount}</span>
              <span><i className={styles.legendDotAmber} />Warning {warningCount}</span>
              <span><i className={styles.legendDotNeutral} />Neutral {neutralCount}</span>
            </div>
          </div>
          <ul className={styles.compactTableList} aria-label="Conflicts and details widget list">
            {actionQueue.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className={styles.compactTableRow} aria-label={`${item.title}. ${item.detail}. ${item.dueLabel}`}>
                  <span className={cx(styles.statusDot, styles[`statusDot${item.tone}`])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={styles.actionTitle}>{item.title}</span>
                    <span className={styles.actionDetail}>{item.source ? `${item.source} · ` : ""}{item.detail}</span>
                  </span>
                  <span className={cx(styles.pill, styles[`pill${item.tone}`])}>{item.dueLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetPanel>
  );
}

function RegistrationPaceWidget({ data }: { data: EventCommandCenterData }) {
  const delta = data.event.registration.target > 0 ? Math.round(((data.event.registration.current - data.event.registration.target) / data.event.registration.target) * 100) : 0;
  return (
    <WidgetPanel title="Registration Pace" icon={TrendingUp} action={<WidgetAction href={data.links.registration} label="Registration" />}>
      {!data.event.registration.hasData ? (
        <EmptyState><strong>Registration not connected</strong><span>Connect or import registration data to track pacing.</span></EmptyState>
      ) : (
        <div className={styles.operationalMetricStack}>
          <div><span className={styles.metricHeroValue}>{data.event.registration.current.toLocaleString()}</span><span className={styles.metricHeroLabel}>Registered</span></div>
          <dl className={styles.metricDefinitionGrid}>
            <div><dt>Pace</dt><dd>{data.event.registration.target > 0 ? `${Math.abs(delta)}% ${data.event.registration.paceStatus === "behind" ? "behind" : "ahead of"} target` : "Target not set"}</dd></div>
            <div><dt>Target</dt><dd>{data.event.registration.target > 0 ? data.event.registration.target.toLocaleString() : "Not set"}</dd></div>
          </dl>
        </div>
      )}
    </WidgetPanel>
  );
}

function HousingPickupWidget({ data }: { data: EventCommandCenterData }) {
  return (
    <WidgetPanel title="Housing Pickup" icon={Bed} action={<WidgetAction href={data.links.housing} label="Housing" />}>
      {!data.event.housing.hasData ? (
        <EmptyState><strong>Housing not connected</strong><span>Add room blocks to monitor pickup and attrition.</span></EmptyState>
      ) : (
        <div className={styles.operationalMetricStack}>
          <div><span className={styles.metricHeroValue}>{data.event.housing.pickupPercentage}%</span><span className={styles.metricHeroLabel}>Pickup</span></div>
          <dl className={styles.metricDefinitionGrid}>
            <div><dt>Rooms</dt><dd>{data.event.housing.current.toLocaleString()} / {data.event.housing.target.toLocaleString()}</dd></div>
            <div><dt>Cutoff</dt><dd>{formatMonthDay(data.event.housing.cutoffDate)}</dd></div>
            <div><dt>Attrition Exposure</dt><dd>{data.event.housing.attritionExposure > 0 ? formatMoney(data.event.housing.attritionExposure) : "None tracked"}</dd></div>
          </dl>
        </div>
      )}
    </WidgetPanel>
  );
}

function RegistrationHousingWidget({ data }: { data: EventCommandCenterData }) {
  return (
    <div className={styles.registrationHousingGrid} aria-label="Registration and housing widgets">
      <RegistrationPaceWidget data={data} />
      <HousingPickupWidget data={data} />
    </div>
  );
}

function RunOfShowWidget({ data }: { data: EventCommandCenterData }) {
  const runOfShow = data.event.operations.runOfShow;
  return (
    <WidgetPanel title="Run of Show" icon={LayoutGrid} action={<WidgetAction href={data.links.runOfShow} label="Open" />}>
      {!runOfShow?.hasData ? (
        <EmptyState><strong>No run of show yet</strong><span>Build your run of show to monitor segments and timing.</span></EmptyState>
      ) : (
        <>
          <div className={styles.twoStatGrid}>
            <div className={styles.statTile}><span className={styles.statValue}>{runOfShow.totalSegments}</span><span className={styles.statLabel}>Segments</span></div>
            <div className={styles.statTile}><span className={styles.statValue}>{data.event.operations.roomStatus.conflicts}</span><span className={styles.statLabel}>Conflicts</span></div>
          </div>
          {runOfShow.nextSegment ? <p className={styles.supportingText}>Next: {runOfShow.nextSegment.title}</p> : null}
        </>
      )}
    </WidgetPanel>
  );
}

function StaffingOverviewWidget({ data }: { data: EventCommandCenterData }) {
  return <OperationsStatusWidget data={data} type="staffing" />;
}

function TaskSummaryWidget({ data }: { data: EventCommandCenterData }) {
  const total = data.event.deadlines.length + data.event.KPIs.overdueItems;
  const completed = data.event.deadlines.filter((deadline) => deadline.status === "completed").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <WidgetPanel title="Roadmap Summary" icon={CheckCircle2} action={<WidgetAction href={data.links.timeline} label="Roadmap" />}>
      {total === 0 ? (
        <EmptyState>No dated roadmap items or milestones yet.</EmptyState>
      ) : (
        <>
          <div className={styles.twoStatGrid}>
            <div className={styles.statTile}><span className={styles.statValue}>{total}</span><span className={styles.statLabel}>Total</span></div>
            <div className={styles.statTile}><span className={styles.statValue}>{data.event.KPIs.overdueItems}</span><span className={styles.statLabel}>Overdue</span></div>
          </div>
          <div className="mt-4"><ProgressBar value={percent} label="Roadmap completion" /></div>
        </>
      )}
    </WidgetPanel>
  );
}

function VendorStatusWidget() {
  return <UnavailableWidget title="Vendor Status" reason="Connect a vendor list to track readiness and open risks." />;
}

function EventSnapshotWidget({ data }: { data: EventCommandCenterData }) {
  const snapshotRows = [
    { label: "Date", value: formatEventDateRange(data.event), icon: CalendarDays },
    data.event.venue && data.event.venue !== "Venue not set" ? { label: "Location", value: data.event.venue, icon: MapPin } : null,
    data.event.registration.target > 0 ? { label: "Attendance", value: data.event.registration.target.toLocaleString(), icon: Users } : { label: "Attendance", value: "TBD", icon: Users },
    data.event.operations.runOfShow?.hasData ? { label: "Sessions", value: data.event.operations.runOfShow.totalSegments.toLocaleString(), icon: LayoutGrid } : null,
    data.event.financial.forecast > 0 ? { label: "Budget", value: formatCompactMoney(data.event.financial.forecast), icon: CircleDollarSign } : null,
  ].filter((row): row is { label: string; value: string; icon: LucideIcon } => Boolean(row));
  return (
    <WidgetPanel title="Event Snapshot" icon={CalendarDays}>
      <dl className={styles.snapshotList}>
        {snapshotRows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label}>
              <dt><Icon className="h-4 w-4" aria-hidden />{row.label}</dt>
              <dd title={row.value}>{row.value}</dd>
            </div>
          );
        })}
      </dl>
    </WidgetPanel>
  );
}

function WeatherForecastWidget() {
  return (
    <WidgetPanel title="Weather Forecast" icon={LayoutGrid}>
      <EmptyState><strong>Weather unavailable</strong><span>Weather will appear when event location and forecast data are available.</span></EmptyState>
    </WidgetPanel>
  );
}

function ReadinessRows({ rows }: { rows: Array<{ label: string; percent: number }> }) {
  return (
    <ul className={styles.readinessList} aria-label="Readiness metrics">
      {rows.map((row) => (
        <li key={row.label} className={styles.readinessRow}>
          <span className={styles.actionDetail}>{row.label}</span>
          <ProgressBar value={row.percent} label={row.label} />
        </li>
      ))}
    </ul>
  );
}

function SpeakerReadinessWidget({ data }: { data: EventCommandCenterData }) {
  const speakers = data.event.readiness.speakers;
  const total = speakers.total;
  if (total === 0) {
    return (
      <WidgetPanel title="Speaker Readiness" icon={Mic} action={<WidgetAction href={data.links.speakers} label="Speakers" />}>
        <EmptyState>
          <strong>No speaker data available yet.</strong>
          <span>Add speakers to track confirmation and deliverables.</span>
        </EmptyState>
      </WidgetPanel>
    );
  }
  const completePercent = clampPercent((speakers.complete / total) * 100);
  const needsAction = speakers.rows.filter((speaker) => speaker.state === "attention").slice(0, 5);
  return (
    <WidgetPanel title="Speaker Readiness" icon={Mic} action={<WidgetAction href={data.links.speakers} label="Speakers" />}>
      <div className={styles.readinessHeader}><span className={styles.readinessValue}>{Math.round(completePercent)}%</span><span className={cx(styles.pill, speakers.needsAction ? styles.pillwarning : styles.pillstable)}>{speakers.needsAction} need action</span></div>
      <ProgressBar value={completePercent} label="Complete speaker readiness" />
      {needsAction.length ? <ul className={styles.compactTableList} aria-label="Speakers needing readiness action">{needsAction.map((speaker) => <li key={speaker.id}><Link href={speaker.href} className={styles.compactTableRow} aria-label={`${speaker.name}: ${speaker.flags.join(", ")}`}><span className={cx(styles.statusDot, styles.statusDotwarning)} aria-hidden /><span className="min-w-0 flex-1"><span className={styles.actionTitle}>{speaker.name}</span><span className={styles.actionDetail}>{speaker.flags.slice(0, 2).map((flag) => flag.replaceAll("_", " ")).join(" · ")}</span></span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link></li>)}</ul> : null}
    </WidgetPanel>
  );
}

function FnbStatusWidget({ data }: { data: EventCommandCenterData }) {
  return <OperationsStatusWidget data={data} type="fnb" />;
}

function AvProductionWidget({ data }: { data: EventCommandCenterData }) {
  return <OperationsStatusWidget data={data} type="av" />;
}

function OperationsStatusWidget({ data, type }: { data: EventCommandCenterData; type: "staffing" | "fnb" | "av" }) {
  const title = type === "staffing" ? "Staffing Overview" : type === "fnb" ? "F&B Status" : "AV Production";
  const status =
    type === "staffing"
      ? data.event.operations.staffingStatus
      : type === "fnb"
        ? data.event.operations.fnbStatus
        : data.event.operations.avStatus;
  const hasData = "hasData" in status ? Boolean(status.hasData) : false;
  const rows =
    type === "staffing"
      ? [
          { label: "Confirmed", value: data.event.operations.staffingStatus.confirmed, tone: "success" as const },
          { label: "Pending", value: data.event.operations.staffingStatus.pending, tone: "warning" as const },
          { label: "Missing", value: data.event.operations.staffingStatus.missing, tone: "critical" as const },
        ]
      : type === "fnb"
        ? [
            { label: "Finalised", value: data.event.operations.fnbStatus.completed, tone: "success" as const },
            { label: "Pending", value: data.event.operations.fnbStatus.pending, tone: "warning" as const },
            { label: "Overdue", value: data.event.operations.fnbStatus.overdue, tone: "critical" as const },
          ]
        : [
            { label: "Inventory", value: data.event.operations.avStatus.items, tone: "neutral" as const },
            { label: "Issues", value: data.event.operations.avStatus.issues, tone: "critical" as const },
          ];
  const action =
    type === "staffing"
      ? <WidgetAction href={data.links.staffing} label="Staffing" />
      : type === "fnb"
        ? <WidgetAction href={data.links.fnbCatalog} label="F&B" />
        : <WidgetAction href={data.links.runOfShow} label="Run of Show" />;
  const emptyState =
    type === "staffing" ? (
      <EmptyState><strong>No staffing plan yet</strong><span>Add staff assignments to monitor coverage.</span></EmptyState>
    ) : type === "fnb" ? (
      <EmptyState><strong>No F&amp;B status yet</strong><span>Add catalog items or session assignments to monitor food and beverage readiness.</span></EmptyState>
    ) : (
      <EmptyState><strong>No AV / production status yet</strong><span>Add AV requirements or production notes to monitor readiness.</span></EmptyState>
    );
  return (
    <WidgetPanel title={title} icon={type === "av" ? AlertTriangle : ListChecks} action={action}>
      {!hasData ? emptyState : <MiniBars rows={rows} />}
    </WidgetPanel>
  );
}

function ReadinessDashboardWidget({ data }: { data: EventCommandCenterData }) {
  const readinessRows = data.event.operationalReadiness;
  const statusCounts = readinessRows.reduce(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    { stable: 0, warning: 0, critical: 0 },
  );
  const totalAreas = readinessRows.length;
  const overallStatus =
    statusCounts.critical > 0 ? "critical" : statusCounts.warning > 0 ? "warning" : "stable";
  const overallStatusLabel =
    overallStatus === "critical" ? "Critical" : overallStatus === "warning" ? "Needs Review" : "On Track";
  const trackSummary =
    totalAreas === 1
      ? `${statusCounts.stable} of 1 area on track`
      : `${statusCounts.stable} of ${totalAreas} areas on track`;
  const statusSummary = [
    { status: "stable" as const, label: "On Track", count: statusCounts.stable },
    { status: "warning" as const, label: "Needs Review", count: statusCounts.warning },
    { status: "critical" as const, label: "Critical", count: statusCounts.critical },
  ];

  return (
    <WidgetPanel title="Operational Readiness" icon={Gauge}>
      {readinessRows.length === 0 ? (
        <EmptyState>
          <strong>No operational readiness data is available yet.</strong>
          <span>Add budget, approval, or speaker deliverable data to track event operations.</span>
        </EmptyState>
      ) : (
        <div className={styles.operationalReadiness}>
          <div className={styles.operationalReadinessSummary}>
            <div className={styles.operationalReadinessSummaryCopy}>
              <span className={styles.operationalReadinessValue}>{trackSummary}</span>
              <span className={styles.operationalReadinessState}>
                Overall status <span className={cx(styles.pill, styles[`pill${overallStatus}`])}>{overallStatusLabel}</span>
              </span>
            </div>
            <div className={styles.operationalReadinessCounts} aria-label="Operational readiness status counts">
              {statusSummary.map((item) => (
                <span
                  key={item.status}
                  className={styles.operationalReadinessCount}
                  data-empty={item.count === 0 ? "true" : undefined}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </span>
              ))}
            </div>
          </div>
          {totalAreas > 1 ? (
            <div className={styles.operationalReadinessTrack} aria-hidden>
              {statusSummary
                .filter((item) => item.count > 0)
                .map((item) => (
                  <span
                    key={item.status}
                    className={cx(styles.operationalReadinessSegment, styles[`operationalReadinessSegment${item.status}`])}
                    style={{ flexGrow: item.count }}
                  />
                ))}
            </div>
          ) : null}
          <ul className={styles.operationalReadinessRows} aria-label="Operational readiness categories">
            {readinessRows.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className={styles.operationalReadinessRow}
                  aria-label={`${row.label}: ${row.statusLabel}. ${row.detail}`}
                >
                  <span className={styles.operationalReadinessRowText}>
                    <span className={styles.operationalReadinessRowLabel}>{row.label}</span>
                    <span className={styles.operationalReadinessRowDetail}>{row.detail}</span>
                  </span>
                  <span className={cx(styles.pill, styles[`pill${row.status}`])}>{row.statusLabel}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetPanel>
  );
}

function RunOfShowReadinessWidget({ data }: { data: EventCommandCenterData }) {
  const readiness = data.event.runOfShowReadiness;
  const metrics = readiness.metrics.map((metric) => ({
    label: metric.id === "times" ? "Times Complete" : metric.label,
    percent: metric.total > 0 ? clampPercent((metric.ready / metric.total) * 100) : 100,
  }));
  return (
    <WidgetPanel title="Run of Show Readiness" icon={Presentation} action={<WidgetAction href={data.links.runOfShow} label="Open Run of Show" />}>
      {!readiness.hasData ? (
        <EmptyState>
          <strong>No Run of Show items have been added yet.</strong>
          <span>Open Run of Show to add sessions and timing.</span>
        </EmptyState>
      ) : (
        <>
          <div className={styles.readinessHeader}>
            <span>
              <span className={styles.readinessValue}>{readiness.totalSessions.toLocaleString()}</span>{" "}
              <span className={styles.statLabel}>session{readiness.totalSessions === 1 ? "" : "s"}</span>
            </span>
            <span className={cx(styles.pill, styles[`pill${readiness.status}`])}>{readiness.statusLabel}</span>
          </div>
          <ReadinessRows rows={metrics} />
        </>
      )}
    </WidgetPanel>
  );
}

function SessionReadinessWidget({ data }: { data: EventCommandCenterData }) {
  const readiness = data.event.readiness;
  if (readiness.summary.total === 0) {
    return (
      <WidgetPanel title="Session Readiness" icon={Presentation} action={<WidgetAction href={data.links.runOfShow} label="Run of Show" />}>
        <EmptyState>
          <strong>No session data available yet.</strong>
          <span>Build your run of show to track session setup completeness.</span>
        </EmptyState>
      </WidgetPanel>
    );
  }
  const actionable = readiness.sessions.filter((session) => session.state === "blocked" || session.state === "attention").slice(0, 5);
  const readyPercent = Math.round((readiness.summary.ready / readiness.summary.total) * 100);
  return (
    <WidgetPanel title="Session Readiness" icon={Presentation} action={<WidgetAction href={data.links.runOfShow} label="Run of Show" />}>
      <div className={styles.readinessHeader}>
        <span className={styles.readinessValue}>{readyPercent}%</span>
        <span className={styles.statLabel}>{readiness.summary.ready} of {readiness.summary.total} sessions ready</span>
      </div>
      <MiniBars rows={[{ label: "Ready", value: readiness.summary.ready, tone: "success" }, { label: "Needs attention", value: readiness.summary.attention, tone: "warning" }, { label: "Blocked", value: readiness.summary.blocked, tone: "critical" }]} />
      {actionable.length ? <ul className={styles.compactTableList} aria-label="Actionable session readiness">{actionable.map((session) => <li key={session.id}><Link href={session.reasons[0]?.href ?? session.href} className={styles.compactTableRow} aria-label={`${session.title}: ${session.state}. ${session.reasons[0]?.label ?? "Review session"}. Reason code ${session.reasons[0]?.code ?? "READINESS_REVIEW"}`}><span className={cx(styles.statusDot, session.state === "blocked" ? styles.statusDotcritical : styles.statusDotwarning)} aria-hidden /><span className="min-w-0 flex-1"><span className={styles.actionTitle}>{session.title}</span><span className={styles.actionDetail}>{session.reasons[0]?.label}</span></span><span className={cx(styles.pill, session.state === "blocked" ? styles.pillcritical : styles.pillwarning)}>{session.state === "blocked" ? "Blocked" : "Review"}</span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link></li>)}</ul> : null}
    </WidgetPanel>
  );
}

const APPROVAL_AREA_LABELS: Record<EventCommandCenterData["event"]["approvals"][number]["category"], string> = {
  budgetChange: "Budget",
  creative: "Creative",
  contract: "Contracts",
  sponsorship: "Sponsorship",
  content: "Documents",
  other: "Other",
};

function ApprovalCenterWidget({ data }: { data: EventCommandCenterData }) {
  const now = new Date(data.generatedAt).getTime();
  const ageDays = (iso: string) => {
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(now)) return 0;
    return Math.max(0, Math.floor((now - time) / 86_400_000));
  };
  const pending = data.event.approvals.filter((approval) => approval.status === "pending");
  if (pending.length === 0) {
    return (
      <WidgetPanel title="Approval Center" icon={ClipboardCheck} action={<WidgetAction href={data.links.docs} label="Open" />}>
        <EmptyState>
          <strong>No pending approvals.</strong>
          <span>Budget and document approvals appear here when they are submitted.</span>
        </EmptyState>
      </WidgetPanel>
    );
  }
  const byGroup = new Map<string, { area: string; owner: string; urgency: string; pending: number; oldest: number; href: string }>();
  for (const approval of pending) {
    const area = APPROVAL_AREA_LABELS[approval.category] ?? "Other";
    const key = `${approval.urgency}:${approval.owner}:${area}`;
    const entry = byGroup.get(key) ?? { area, owner: approval.owner, urgency: approval.urgency, pending: 0, oldest: 0, href: approval.href };
    entry.pending += 1;
    entry.oldest = Math.max(entry.oldest, ageDays(approval.submittedDate));
    byGroup.set(key, entry);
  }
  const groups = [...byGroup.values()].sort((left, right) => {
    const rank = { overdue: 4, dueSoon: 3, risk: 2, pending: 1 };
    return rank[right.urgency as keyof typeof rank] - rank[left.urgency as keyof typeof rank] || right.pending - left.pending || left.area.localeCompare(right.area);
  });
  return (
    <WidgetPanel title="Approval Center" icon={ClipboardCheck} action={<WidgetAction href={data.links.docs} label="Open" />}>
      <div className={styles.financialStats}>
        <div className={styles.statTile}><span className={styles.statValue}>{pending.length}</span><span className={styles.statLabel}>Total Pending</span></div>
        <div className={styles.statTile}><span className={styles.statValue}>{new Set(pending.map((approval) => approval.owner)).size}</span><span className={styles.statLabel}>Owners</span></div>
        <div className={styles.statTile}><span className={styles.statValue}>{pending.filter((approval) => approval.urgency === "overdue").length}</span><span className={styles.statLabel}>Overdue</span></div>
        <div className={styles.statTile}><span className={styles.statValue}>{pending.filter((approval) => approval.urgency === "dueSoon").length}</span><span className={styles.statLabel}>Due Soon</span></div>
        <div className={styles.statTile}><span className={styles.statValue}>{pending.filter((approval) => approval.urgency === "risk").length}</span><span className={styles.statLabel}>At Risk</span></div>
      </div>
      <ul className={styles.compactTableList} aria-label="Pending approvals by urgency, owner, and type">
        {groups.map((group) => {
          const tone = group.urgency === "overdue" ? "critical" : group.urgency === "dueSoon" || group.urgency === "risk" ? "warning" : "neutral";
          return (
            <li key={`${group.urgency}:${group.owner}:${group.area}`}>
              <Link href={group.href} className={styles.compactTableRow}>
                <span className={cx(styles.statusDot, styles[`statusDot${tone}`])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={styles.actionTitle}>{group.area} · {group.owner}</span>
                  <span className={styles.actionDetail}>{group.pending} pending · {group.urgency.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                </span>
                <span className={cx(styles.pill, styles[`pill${tone}`])}>{group.oldest}d waiting</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </WidgetPanel>
  );
}

function StaffingCoverageWidget({ data }: { data: EventCommandCenterData }) {
  const staffing = data.event.readiness.staffing;
  const byRole = data.event.operations.staffingByRole ?? [];
  const hasData = staffing.requiredRoles > 0 || byRole.length > 0;
  if (!hasData) {
    return (
      <WidgetPanel title="Staffing Coverage" icon={Users} action={<WidgetAction href={data.links.staffing} label="Staffing" />}>
        <EmptyState>
          <strong>No staffing coverage data available yet.</strong>
          <span>Add staff assignments to track coverage by area.</span>
        </EmptyState>
      </WidgetPanel>
    );
  }
  const coverage = staffing.requiredRoles > 0 ? Math.round((staffing.assignedRoles / staffing.requiredRoles) * 100) : 100;
  const tone = coverage >= 90 ? "stable" : coverage >= 70 ? "warning" : "critical";
  const coverageLabel = coverage >= 90 ? "Covered" : coverage >= 70 ? "Needs Review" : "At Risk";
  return (
    <WidgetPanel title="Staffing Coverage" icon={Users} action={<WidgetAction href={data.links.staffing} label="Staffing" />}>
      <div className={styles.readinessHeader}>
        <span className={styles.readinessValue}>{coverage}%</span>
        <span className={cx(styles.pill, styles[`pill${tone}`])}>{coverageLabel}</span>
      </div>
      <p className={styles.supportingText}>{staffing.assignedRoles} of {staffing.requiredRoles} required roles covered · {staffing.conflicts.length} conflicts</p>
      {staffing.gaps.length || staffing.conflicts.length ? <ul className={styles.compactTableList} aria-label="Staffing gaps and conflicts">{[...staffing.conflicts, ...staffing.gaps].slice(0, 5).map((reason, index) => <li key={`${reason.code}-${index}`}><Link href={reason.href} className={styles.compactTableRow}><span className={cx(styles.statusDot, reason.code === "STAFF_DOUBLE_BOOKED" ? styles.statusDotcritical : styles.statusDotwarning)} aria-hidden /><span className="min-w-0 flex-1"><span className={styles.actionTitle}>{reason.code.replaceAll("_", " ")}</span><span className={styles.actionDetail}>{reason.label}</span></span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link></li>)}</ul> : null}
      {byRole.length > 0 ? (
        <MiniBars rows={byRole.slice(0, 6).map((entry) => ({ label: entry.role, value: entry.count, tone: "neutral" as const }))} />
      ) : null}
    </WidgetPanel>
  );
}

function ExecutiveBriefingWidget({ data }: { data: EventCommandCenterData }) {
  const briefing = data.event.executiveBriefing;
  const dataAsOf = formatActivityTime(briefing.dataAsOf);
  return (
    <WidgetPanel
      title="Executive Briefing"
      icon={Sparkles}
      action={data.links.timeline ? <WidgetAction href={data.links.timeline} label="View details" /> : undefined}
    >
      <div className={styles.briefingMeta}>
        <span>{briefing.event.name}</span>
        <span>{briefing.freshness === "current" ? "Current" : briefing.freshness === "stale" ? "Stale" : "Partial"}</span>
      </div>
      <h3 className={styles.briefingSectionTitle}>Facts</h3>
      <ul className={styles.briefingList} aria-label="Executive briefing facts">
        {briefing.facts.map((fact) => (
          <li key={fact.id}>
            <strong>{fact.title}</strong>
            <span>{fact.detail}</span>
            <Link href={fact.evidence.href} className={styles.inlineAction}>{fact.evidence.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link>
          </li>
        ))}
      </ul>
      <h3 className={styles.briefingSectionTitle}>Recommended next actions</h3>
      <ul className={styles.briefingList} aria-label="Executive briefing recommendations">
        {briefing.recommendations.map((recommendation) => (
          <li key={recommendation.id}>
            <strong>{recommendation.title}</strong>
            <span>{recommendation.reason}</span>
            <Link href={recommendation.href} className={styles.inlineAction}>{recommendation.actionMode === "editable" ? "Take action" : "View evidence"} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link>
          </li>
        ))}
      </ul>
      <p className={styles.briefingFooter}>Data as of {dataAsOf}. {briefing.generation.message}</p>
    </WidgetPanel>
  );
}

function UnavailableWidget({ title, reason }: { title: string; reason: string }) {
  return (
    <WidgetPanel title={title} icon={LayoutGrid}>
      <EmptyState>{reason}</EmptyState>
    </WidgetPanel>
  );
}

export function EventDashboardWidgetRenderer({
  widget,
  data,
}: {
  widget: EventDashboardWidgetState;
  data: EventCommandCenterData;
}) {
  if (!widget.available && widget.type === "weather-forecast") return <WeatherForecastWidget />;
  if (!widget.available && widget.type === "run-of-show") return <RunOfShowWidget data={data} />;
  if (!widget.available && widget.type === "staffing-overview") return <StaffingOverviewWidget data={data} />;
  if (!widget.available) return <UnavailableWidget title={widget.title} reason={widget.disabledReason ?? "This widget is not available yet."} />;

  switch (widget.type) {
    case "needs-you":
      return <NeedsYouWidget data={data} />;
    case "activity-feed":
      return <ActivityFeedWidget data={data} />;
    case "kpi-row":
      return <KpiRowWidget data={data} />;
    case "planner-focus":
      return <PlannerFocusWidget data={data} />;
    case "upcoming-deadlines":
      return <UpcomingDeadlinesWidget data={data} />;
    case "roadmap-progress":
      return <RoadmapProgressWidget data={data} />;
    case "event-budget-overview":
      return <EventBudgetOverviewWidget data={data} />;
    case "financial-summary":
      return <FinancialSummaryWidget data={data} />;
    case "conflicts-details":
      return <ConflictsDetailsWidget data={data} />;
    case "registration-housing":
      return <RegistrationHousingWidget data={data} />;
    case "run-of-show":
      return <RunOfShowWidget data={data} />;
    case "staffing-overview":
      return <StaffingOverviewWidget data={data} />;
    case "task-summary":
      return <TaskSummaryWidget data={data} />;
    case "vendor-status":
      return <VendorStatusWidget />;
    case "event-snapshot":
      return <EventSnapshotWidget data={data} />;
    case "weather-forecast":
      return <WeatherForecastWidget />;
    case "speaker-readiness":
      return <SpeakerReadinessWidget data={data} />;
    case "fnb-status":
      return <FnbStatusWidget data={data} />;
    case "av-production":
      return <AvProductionWidget data={data} />;
    case "readiness-dashboard":
      return <ReadinessDashboardWidget data={data} />;
    case "session-readiness":
      return <SessionReadinessWidget data={data} />;
    case "run-of-show-readiness":
      return <RunOfShowReadinessWidget data={data} />;
    case "approval-center":
      return <ApprovalCenterWidget data={data} />;
    case "staffing-coverage":
      return <StaffingCoverageWidget data={data} />;
    case "executive-briefing":
      return <ExecutiveBriefingWidget data={data} />;
    default:
      return null;
  }
}
