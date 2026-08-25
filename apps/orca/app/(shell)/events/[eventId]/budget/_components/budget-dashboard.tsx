"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DollarSign,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BudgetImportAction } from "@/app/(shell)/budgets/_components/budget-import-action";
import {
  DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS,
  DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS,
  DashboardEmptyState,
} from "@/components/dashboard-empty-state";
import { FEATURES } from "@/config/features";
import { TaskCreateLauncher, type TaskCreateAttachmentOption } from "@/components/tasks/task-create-modal";
import { EVENT_MODULE_PRIMARY_CLASS, EventModuleSurface } from "../../_components/event-module-header";
import { BudgetPageHeader } from "./budget-page-header";
import { BudgetBlocksSection } from "./budget-blocks-section";

type DashboardLink = {
  href: string;
  filters: Record<string, string>;
};

type DashboardSummary = {
  totalForecastCents: number;
  totalActualCents: number;
  remainingCents: number;
  varianceCents: number;
  lineItemCount: number;
  pendingActionCount: number;
};

type CategoryBreakdown = {
  category: string;
  forecastCents: number;
  actualCents: number;
  varianceCents: number;
  percentUsed: number;
  lineItemCount: number;
  pendingCount: number;
  link: DashboardLink;
};

type WorkQueueItem = {
  id: string;
  type: string;
  sourceModule: "budget";
  sourceId: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high";
  assignee: UserMini | null;
  dueAt: string | null;
  createdAt: string;
  actionLabel: string;
  link: DashboardLink;
};

type DashboardActivity = {
  id: string;
  action: string;
  title: string;
  description: string;
  actor: UserMini | null;
  createdAt: string;
  sourceId: string | null;
  sourceType: string | null;
  dollarImpactCents: number | null;
};

type UserMini = {
  id: string;
  name: string | null;
  email: string;
};

type BudgetDashboardResponse = {
  generatedAt: string;
  budget: {
    id: string;
    eventId: string;
    status: string;
    currentVersionId: string | null;
  };
  permissions?: {
    canWriteBudget: boolean;
  };
  summary: DashboardSummary;
  categoryBreakdown: CategoryBreakdown[];
  workQueue: WorkQueueItem[];
  recentActivity: DashboardActivity[];
};

type BudgetTaskLineItemOption = {
  id: string;
  category?: string | null;
  lineItem?: string | null;
  vendor?: string | null;
};

type BudgetDashboardProps = {
  eventId: string;
};

const WORK_QUEUE_PANEL_LIMIT = 2;
const ACTIVITY_PANEL_LIMIT = 3;

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return fallback;
}

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function formatSignedMoney(cents: number): string {
  if (cents > 0) return `+${formatMoney(cents)}`;
  if (cents < 0) return `-${formatMoney(Math.abs(cents))}`;
  return formatMoney(0);
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function safeDashboardHref(eventId: string, link?: DashboardLink): string {
  if (link?.href?.startsWith(`/events/${encodeURIComponent(eventId)}/budget`)) {
    return link.href;
  }
  return `/events/${encodeURIComponent(eventId)}/budget?view=grid`;
}

function priorityClasses(priority: WorkQueueItem["priority"]): string {
  if (priority === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function userName(user: UserMini | null): string {
  return user?.name?.trim() || user?.email || "Budget team";
}

function KpiCard({
  label,
  value,
  detail,
  meta,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  meta?: string;
  tone?: "neutral" | "good" | "warning" | "critical";
  icon: ReactNode;
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "critical"
        ? "text-rose-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-slate-950";

  return (
    <div className="h-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500">{label}</p>
          <p className={`mt-0.5 text-[20px] leading-[24px] font-semibold ${valueClass}`}>{value}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-1.5 text-slate-600">{icon}</div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-[15px] text-slate-500">
        <span>{detail}</span>
        {meta ? <span className="font-semibold text-slate-600">{meta}</span> : null}
      </div>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center">
      <p className="text-[13px] font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-[12px] text-slate-500">{detail}</p>
    </div>
  );
}

function BudgetDashboardEmptyState({
  eventId,
  canWriteBudget,
  existingImportLineItems,
  onError,
  onImported,
}: {
  eventId: string;
  canWriteBudget: boolean;
  existingImportLineItems: Array<{ category: string }>;
  onError: (message: string) => void;
  onImported: () => Promise<void>;
}) {
  const gridHref = `/events/${encodeURIComponent(eventId)}/budget?view=grid`;

  return (
    <DashboardEmptyState
      title="No budget data yet"
      description="Import a budget spreadsheet or add your first line item to start tracking forecast, actuals, categories, and approvals."
      icon={<DollarSign className="h-6 w-6" aria-hidden />}
      bullets={["Forecast and actual spend", "Categories and approvals"]}
      primaryAction={
        <BudgetImportAction
          eventId={eventId}
          existingLineItems={existingImportLineItems}
          disabled={!canWriteBudget}
          onError={onError}
          onImported={onImported}
          trigger={({ open, disabled }) => (
            <button
              type="button"
              onClick={open}
              disabled={disabled}
              className={DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Import budget
            </button>
          )}
        />
      }
      secondaryAction={
        <Link href={gridHref} className={DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS}>
          <ArrowRight className="h-4 w-4" aria-hidden />
          Add line item
        </Link>
      }
    />
  );
}

export function BudgetDashboard({ eventId }: BudgetDashboardProps) {
  const [dashboard, setDashboard] = useState<BudgetDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const request = ++requestRef.current;
    if (!eventId) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/budget/dashboard`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load budget dashboard"));
      }
      if (request !== requestRef.current) return;
      setDashboard(payload as BudgetDashboardResponse);
    } catch (error) {
      if (request !== requestRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Failed to load budget dashboard");
      setDashboard(null);
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const handleFinancialsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (detail?.eventId && detail.eventId !== eventId) return;
      void loadDashboard();
    };
    window.addEventListener("budget-financials:changed", handleFinancialsChanged);
    return () => window.removeEventListener("budget-financials:changed", handleFinancialsChanged);
  }, [eventId, loadDashboard]);

  const summary = dashboard?.summary;
  const categories = dashboard?.categoryBreakdown ?? [];
  const workQueue = dashboard?.workQueue ?? [];
  const recentActivity = dashboard?.recentActivity ?? [];
  const isEmptyBudget = Boolean(dashboard && summary?.lineItemCount === 0);
  const gridHref = `/events/${encodeURIComponent(eventId)}/budget?view=grid`;
  const canWriteBudget = dashboard?.permissions?.canWriteBudget ?? false;
  const visibleWorkQueue = workQueue.slice(0, WORK_QUEUE_PANEL_LIMIT);
  const hiddenWorkQueueCount = Math.max(0, workQueue.length - visibleWorkQueue.length);
  const visibleActivity = recentActivity.slice(0, ACTIVITY_PANEL_LIMIT);
  const hiddenActivityCount = Math.max(0, recentActivity.length - visibleActivity.length);
  const existingImportLineItems = categories.map((category) => ({ category: category.category }));

  const loadBudgetTaskAttachmentOptions = useCallback(async (): Promise<TaskCreateAttachmentOption[]> => {
    const response = await fetch(`/api/events/${eventId}/budget`, { cache: "no-store" });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return [];

    const lineItems = Array.isArray((payload as { lineItems?: unknown })?.lineItems)
      ? (payload as { lineItems: BudgetTaskLineItemOption[] }).lineItems
      : [];

    return lineItems.map((item) => {
      const name = item.lineItem?.trim() || item.vendor?.trim() || item.category?.trim() || "Budget line item";
      const context = [item.category?.trim(), item.vendor?.trim()].filter(Boolean).join(" · ");
      return {
        objectType: "BUDGET_LINE_ITEM",
        objectId: item.id,
        label: name,
        description: context || undefined,
      };
    });
  }, [eventId]);

  const remainingTone = useMemo(() => {
    const remaining = summary?.remainingCents ?? 0;
    if (remaining < 0) return "critical";
    if (remaining > 0) return "good";
    return "neutral";
  }, [summary?.remainingCents]);

  return (
    <EventModuleSurface className="space-y-5">
      <BudgetPageHeader
        eventId={eventId}
        activeView="dashboard"
        title="Budget"
        subtitle="Live financial control across forecast, actuals, approvals, and budget-derived actions."
        actions={
          <>
            {FEATURES.ENABLE_GENERIC_TASKING_UI ? (
              <TaskCreateLauncher
                eventId={eventId}
                source="budget"
                loadAttachmentOptions={loadBudgetTaskAttachmentOptions}
                disabled={isLoading || !dashboard || !canWriteBudget}
                buttonLabel="Task"
                buttonClassName={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[12px] font-semibold shadow-sm transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300 ${EVENT_MODULE_PRIMARY_CLASS}`}
                onTaskCreated={() => {
                  void loadDashboard();
                }}
              />
            ) : null}
            <BudgetImportAction
              eventId={eventId}
              existingLineItems={existingImportLineItems}
              disabled={isLoading || !dashboard || !canWriteBudget}
              onError={(message) => setErrorMessage(message || null)}
              onImported={async () => {
                await loadDashboard();
              }}
              trigger={({ open, disabled }) => (
                <button
                  type="button"
                  onClick={open}
                  disabled={disabled}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </button>
              )}
            />
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Unable to load Budget Command Center</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={isLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {isLoading && !dashboard ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-[13px] text-slate-600">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading budget dashboard...
          </div>
        </div>
      ) : dashboard && summary ? (
        isEmptyBudget ? (
          <BudgetDashboardEmptyState
            eventId={eventId}
            canWriteBudget={canWriteBudget}
            existingImportLineItems={existingImportLineItems}
            onError={(message) => setErrorMessage(message || null)}
            onImported={async () => {
              await loadDashboard();
            }}
          />
        ) : (
        <>
          <div className="grid items-stretch gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total Forecast"
              value={formatMoney(summary.totalForecastCents)}
              detail="Planned budget"
              meta={`${summary.lineItemCount} line item${summary.lineItemCount === 1 ? "" : "s"}`}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <KpiCard
              label="Total Actual"
              value={formatMoney(summary.totalActualCents)}
              detail="Recorded actual spend"
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <KpiCard
              label="Remaining Budget"
              value={formatMoney(summary.remainingCents)}
              detail="Forecast less actual"
              tone={remainingTone}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <KpiCard
              label="Needs Action"
              value={String(summary.pendingActionCount)}
              detail="Budget-derived actions"
              meta="Approval workflow"
              tone={summary.pendingActionCount > 0 ? "warning" : "good"}
              icon={<ShieldAlert className="h-4 w-4" />}
            />
          </div>

          <BudgetBlocksSection eventId={eventId} />

          <div className="grid items-stretch gap-3 xl:grid-cols-2">
            <section className="flex h-full min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">Budget Work Queue</h2>
                  <p className="mt-0.5 text-[12px] leading-[16px] text-slate-500">Budget-derived actions for approvals and revisions.</p>
                </div>
                <Clock3 className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-2.5 flex-1 divide-y divide-slate-100">
                {workQueue.length === 0 ? (
                  <EmptyPanel title="No budget actions pending." detail="Approval and revision items will appear here." />
                ) : (
                  visibleWorkQueue.map((item) => (
                    <div key={item.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="min-w-0 break-words text-[12px] font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-0.5 text-[11px] leading-[15px] text-slate-600">{item.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            <span className={`rounded-full border px-2 py-0.5 font-semibold ${priorityClasses(item.priority)}`}>
                              {formatLabel(item.priority)}
                            </span>
                            <span>{formatLabel(item.status)}</span>
                            <span>Created {formatDate(item.createdAt)}</span>
                            {item.assignee ? <span>Owner {userName(item.assignee)}</span> : null}
                          </div>
                        </div>
                        <Link
                          href={safeDashboardHref(eventId, item.link)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          aria-label={`${item.actionLabel}: ${item.title}`}
                        >
                          {canWriteBudget ? item.actionLabel : "Open in grid"}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))
                )}
                {hiddenWorkQueueCount > 0 ? (
                  <div className="pt-2">
                    <Link
                      href={gridHref}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View all budget actions
                      <span className="text-slate-500">({hiddenWorkQueueCount} more)</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="flex h-full min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">Recent Activity</h2>
                  <p className="mt-0.5 text-[12px] leading-[16px] text-slate-500">Latest budget workflow and file activity.</p>
                </div>
                <CalendarClock className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-2.5 flex-1 divide-y divide-slate-100">
                {recentActivity.length === 0 ? (
                  <EmptyPanel title="No recent budget activity." detail="Budget submissions, approvals, and file changes will appear here." />
                ) : (
                  visibleActivity.map((activity) => (
                    <div key={activity.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-md bg-slate-50 p-1.5 text-slate-500">
                          <CalendarClock className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <p className="min-w-0 break-words text-[12px] font-semibold text-slate-900">{activity.title}</p>
                            <span className="text-[11px] text-slate-500">{formatDateTime(activity.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-[15px] text-slate-600">{activity.description}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {activity.actor ? userName(activity.actor) : "System"}
                            {activity.dollarImpactCents !== null ? ` - ${formatSignedMoney(activity.dollarImpactCents)}` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {hiddenActivityCount > 0 ? (
                  <div className="pt-2">
                    <Link
                      href={gridHref}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View full history
                      <span className="text-slate-500">({hiddenActivityCount} more)</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </>
        )
      ) : null}
    </EventModuleSurface>
  );
}
