"use client";

import { Flag, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS,
  DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS,
  DashboardEmptyState,
} from "@/components/dashboard-empty-state";
import type {
  EventTimelineDashboard,
  StageStatus,
  TimelineBlocker,
  TimelineStageRollup,
  TimelineWorkstreamRollup,
} from "@/src/server/services/timeline-dashboard";
import type { TimelinePlanningStage, TimelineStatus } from "./types";

type TimelineDashboardViewProps = {
  eventId: string;
  canEdit?: boolean;
  refreshToken?: number;
  onViewItems?: (workstream: string | null) => void;
  onViewStage?: (stage: TimelinePlanningStage) => void;
  onOpenItem?: (itemId: string) => void;
  onAddWorkstream?: () => void;
  onAddItem?: () => void;
  onAddMilestone?: () => void;
};

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: EventTimelineDashboard };

function dashboardLoadError(status: number): string {
  if (status === 401) return "Sign in again to continue.";
  if (status === 403) return "You do not have access to this event's roadmap dashboard.";
  if (status === 404) return "This event's roadmap dashboard was not found.";
  return "Unable to load the roadmap dashboard. Please try again.";
}

function isDashboardPayload(value: unknown, eventId: string): value is EventTimelineDashboard {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<EventTimelineDashboard>;
  return data.event?.id === eventId
    && Boolean(data.totals && typeof data.totals.totalItems === "number")
    && Array.isArray(data.stages)
    && Array.isArray(data.workstreams)
    && Array.isArray(data.upcomingDates)
    && Array.isArray(data.blockers)
    && Boolean(data.health && typeof data.health.score === "number");
}

// Module-level dashboard cache keyed by `${eventId}::${refreshToken}`.
//
// The dashboard view is conditionally mounted, so switching List → Dashboard →
// Roadmap → Dashboard used to unmount/remount it and refetch every time. A
// module-scoped cache survives remounts, so revisiting the Dashboard with an
// unchanged (eventId, refreshToken) reuses the last payload instead of hitting
// the network. A mutation bumps refreshToken (new key) which forces a refetch,
// keeping dashboard metrics correct after writes.
const DASHBOARD_CACHE_MAX = 8;
const dashboardCache = new Map<string, EventTimelineDashboard>();

function dashboardCacheKey(eventId: string, refreshToken: number): string {
  return `${eventId}::${refreshToken}`;
}

function rememberDashboard(key: string, eventId: string, data: EventTimelineDashboard): void {
  const eventPrefix = `${eventId}::`;
  // Drop stale entries for this event (older refresh tokens) so the cache does
  // not serve pre-mutation data and does not grow per token.
  for (const existing of Array.from(dashboardCache.keys())) {
    if (existing !== key && existing.startsWith(eventPrefix)) {
      dashboardCache.delete(existing);
    }
  }
  dashboardCache.set(key, data);
  while (dashboardCache.size > DASHBOARD_CACHE_MAX) {
    const oldest = dashboardCache.keys().next().value;
    if (oldest === undefined) break;
    dashboardCache.delete(oldest);
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

const STAGE_STATUS_META: Record<StageStatus, { label: string; chip: string }> = {
  COMPLETE: { label: "Complete", chip: "bg-emerald-100 text-emerald-700" },
  AHEAD: { label: "Ahead", chip: "bg-sky-100 text-sky-700" },
  IN_PROGRESS: { label: "In Progress", chip: "bg-blue-100 text-blue-700" },
  UPCOMING: { label: "Upcoming", chip: "bg-slate-100 text-slate-600" },
  AT_RISK: { label: "At Risk", chip: "bg-rose-100 text-rose-700" },
};

const ITEM_STATUS_META: Record<TimelineStatus, { label: string; chip: string; dot: string }> = {
  COMPLETE: { label: "Complete", chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  IN_PROGRESS: { label: "In Progress", chip: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  AT_RISK: { label: "At Risk", chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  NOT_STARTED: { label: "Not Started", chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};

const BLOCKER_REASON_LABEL: Record<TimelineBlocker["reason"], string> = {
  DEPENDENCY_BLOCKED: "Blocked by dependency",
  OVERDUE: "Overdue",
  AT_RISK: "At risk",
  APPROACHING_DEADLINE: "Due soon",
  EVENT_APPROACHING: "Event approaching",
  CRITICAL_PATH: "Critical path",
};

/**
 * Event roadmap command center. Renders planning-stage cards, the workstream
 * grid, the selected workstream detail panel, and the right rail (upcoming
 * dates, top blockers, roadmap health). All values come from the canonical
 * server payload — nothing is computed or hardcoded here.
 */
export default function TimelineDashboardView({
  eventId,
  canEdit = true,
  refreshToken = 0,
  onViewItems,
  onViewStage,
  onOpenItem,
  onAddItem,
  onAddMilestone,
}: TimelineDashboardViewProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [selectedWorkstream, setSelectedWorkstream] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const load = useCallback(async (options?: { force?: boolean; signal?: AbortSignal }) => {
    if (!eventId) return;
    const requestVersion = ++requestVersionRef.current;
    const cacheKey = dashboardCacheKey(eventId, refreshToken);
    if (!options?.force) {
      const cached = dashboardCache.get(cacheKey);
      if (cached) {
        // Cache hit (e.g. remounting after a view switch): reuse the payload and
        // skip the network round-trip entirely.
        setState({ phase: "ready", data: cached });
        return;
      }
    }
    setState({ phase: "loading" });
    try {
      const response = await fetch(`/api/events/${eventId}/timeline-dashboard`, { credentials: "include", signal: options?.signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(dashboardLoadError(response.status));
      }
      if (!isDashboardPayload(payload, eventId)) throw new Error("The roadmap dashboard response was invalid. Please try again.");
      if (options?.signal?.aborted || requestVersionRef.current !== requestVersion) return;
      const data = payload as EventTimelineDashboard;
      rememberDashboard(cacheKey, eventId, data);
      setState({ phase: "ready", data });
    } catch (error) {
      if (options?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (requestVersionRef.current !== requestVersion) return;
      setState({
        phase: "error",
        message: error instanceof Error ? error.message : "Unable to load the roadmap dashboard. Please try again.",
      });
    }
  }, [eventId, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    setSelectedWorkstream(null);
    void load({ signal: controller.signal });
    return () => {
      requestVersionRef.current += 1;
      controller.abort();
    };
  }, [load, refreshToken]);

  const activeWorkstream = useMemo<TimelineWorkstreamRollup | null>(() => {
    if (state.phase !== "ready") return null;
    const chosen = selectedWorkstream
      ? state.data.workstreams.find((w) => w.workstream === selectedWorkstream)
      : null;
    return chosen ?? state.data.selectedWorkstream ?? state.data.workstreams[0] ?? null;
  }, [selectedWorkstream, state]);

  if (state.phase === "loading") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Loading roadmap dashboard…
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p>{state.message}</p>
        <button
          type="button"
          onClick={() => void load({ force: true })}
          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const { data } = state;

  if (data.totals.totalItems === 0) {
    return (
      <DashboardEmptyState
        title="No roadmap items yet"
        description="Create roadmap items to track planning progress from pre-planning through closeout."
        icon={<Flag className="h-6 w-6" aria-hidden />}
        bullets={["Stage progress and ownership", "Milestones, due dates, and blockers"]}
        primaryAction={
          <button
            type="button"
            onClick={onAddItem}
            className={DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS}
            disabled={!canEdit || !onAddItem}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add roadmap item
          </button>
        }
        secondaryAction={
          <button
            type="button"
            onClick={onAddMilestone}
            className={DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS}
            disabled={!canEdit || !onAddMilestone}
          >
            Create milestone
          </button>
        }
      />
    );
  }

  return (
    <div data-testid="timeline-dashboard" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Main column */}
      <div className="space-y-5">
        <StageCards stages={data.stages} onViewStage={onViewStage} />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Workstreams</h3>
              <p className="text-xs text-slate-500">Readiness by workstream for your event</p>
            </div>
            <button
              type="button"
              onClick={() => onViewItems?.(null)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all workstreams
            </button>
          </div>
          <WorkstreamGrid
            workstreams={data.workstreams}
            activeKey={activeWorkstream?.workstream ?? null}
            onSelect={(key) => setSelectedWorkstream(key)}
          />
          {data.totals.unassignedWorkstreamItems > 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {data.totals.unassignedWorkstreamItems}{" "}
              {data.totals.unassignedWorkstreamItems === 1 ? "item has" : "items have"} no workstream. Use the
              List View workstream filter to find and bulk-fix unassigned rows.
            </p>
          ) : null}
        </section>

        {activeWorkstream ? (
          <WorkstreamDetailPanel workstream={activeWorkstream} onViewItems={onViewItems} onOpenItem={onOpenItem} />
        ) : null}
      </div>

      {/* Right rail */}
      <aside className="space-y-5">
        <UpcomingDatesCard dates={data.upcomingDates} />
        <BlockersCard blockers={data.blockers} onOpenItem={onOpenItem} />
        <HealthCard health={data.health} />
      </aside>
    </div>
  );
}

function ProgressBar({ percent, barClass = "bg-blue-500" }: { percent: number; barClass?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-200">
      <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

function StageCards({
  stages,
  onViewStage,
}: {
  stages: TimelineStageRollup[];
  onViewStage?: (stage: TimelinePlanningStage) => void;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}
    >
      {stages.map((stage) => {
        const meta = STAGE_STATUS_META[stage.status];
        return (
          <button
            key={stage.stage}
            type="button"
            onClick={() => onViewStage?.(stage.stage)}
            aria-label={`View ${stage.label} stage items`}
            className="min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h4 className="min-w-0 text-sm font-semibold leading-5 text-slate-900">{stage.label}</h4>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{stage.percentComplete}%</p>
            <div className="mt-2 w-full">
              <ProgressBar percent={stage.percentComplete} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {stage.completeItems}/{stage.totalItems} {stage.totalItems === 1 ? "item" : "items"} ready
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {stage.nextDate ? `Next ${formatDate(stage.nextDate)}` : stage.startDate ? `Starts ${formatDate(stage.startDate)}` : "No dates yet"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function WorkstreamGrid({
  workstreams,
  activeKey,
  onSelect,
}: {
  workstreams: TimelineWorkstreamRollup[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {workstreams.map((ws) => {
        const isActive = ws.workstream === activeKey;
        return (
          <button
            key={ws.workstream}
            type="button"
            onClick={() => onSelect(ws.workstream)}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${
              isActive ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${ws.theme.dot}`} />
                <span className="text-sm font-semibold text-slate-900">{ws.label}</span>
              </div>
              <span className="text-sm font-semibold text-slate-700">{ws.percentComplete}%</span>
            </div>
            <div className="mt-3">
              <ProgressBar percent={ws.percentComplete} barClass={ws.theme.bar} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{ws.completeItems}/{ws.totalItems} complete</span>
              {ws.blockerItems > 0 ? (
                <span className="font-medium text-rose-600">{ws.blockerItems} at risk</span>
              ) : ws.openItems > 0 ? (
                <span>{ws.openItems} open</span>
              ) : (
                <span className="text-emerald-600">On track</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function WorkstreamDetailPanel({
  workstream,
  onViewItems,
  onOpenItem,
}: {
  workstream: TimelineWorkstreamRollup;
  onViewItems?: (workstream: string | null) => void;
  onOpenItem?: (itemId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${workstream.theme.dot}`} />
          <h3 className="text-base font-semibold text-slate-900">{workstream.label}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${workstream.theme.badge}`}>
            {workstream.percentComplete}% ready
          </span>
        </div>
        <button
          type="button"
          onClick={() => onViewItems?.(workstream.workstream)}
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          View all items
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        {/* Readiness checklist */}
        <div className="lg:col-span-1">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Readiness Checklist</h4>
          {workstream.readiness.length === 0 ? (
            <p className="text-xs text-slate-400">No items yet</p>
          ) : (
            <ul className="space-y-1.5">
              {workstream.readiness.map((item) => {
                const meta = ITEM_STATUS_META[item.status];
                return (
                  <li key={item.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                    <span className="truncate" title={item.title}>{item.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Key dates */}
        <div className="lg:col-span-1">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Dates</h4>
          {workstream.keyDates.length === 0 ? (
            <p className="text-xs text-slate-400">No dates set</p>
          ) : (
            <ul className="space-y-1.5">
              {workstream.keyDates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700" title={item.title}>{item.title}</span>
                  <span className="shrink-0 text-slate-500">{formatDate(item.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Owners */}
        <div className="lg:col-span-1">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Owners</h4>
          {workstream.owners.length === 0 ? (
            <p className="text-xs text-slate-400">No owners assigned</p>
          ) : (
            <ul className="space-y-1.5">
              {workstream.owners.map((owner) => (
                <li key={owner.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700" title={owner.name}>{owner.name}</span>
                  <span className="shrink-0 text-slate-400">{owner.openItems} open</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent activity (no canonical timeline activity source yet) */}
        <div className="lg:col-span-1">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Activity</h4>
          {workstream.recentActivityAvailable ? null : (
            <p className="text-xs text-slate-400">Activity history isn’t tracked for timeline items yet.</p>
          )}
        </div>
      </div>

      {workstream.blockers.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Blockers</h4>
          <ul className="space-y-1.5">
            {workstream.blockers.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                <button type="button" onClick={() => onOpenItem?.(b.id)} className="min-w-0 text-left text-slate-700 hover:text-blue-700 hover:underline" title={`${b.title}. ${b.explanation}`}>
                  <span className="block truncate font-medium">{b.title}</span>
                  <span className="block truncate text-[11px] text-slate-500">{b.explanation}</span>
                </button>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.severity === "HIGH" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                  {BLOCKER_REASON_LABEL[b.reason]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function UpcomingDatesCard({ dates }: { dates: EventTimelineDashboard["upcomingDates"] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Upcoming Dates</h3>
      {dates.length === 0 ? (
        <p className="text-xs text-slate-400">No upcoming due dates.</p>
      ) : (
        <ul className="space-y-2.5">
          {dates.map((d) => {
            const meta = ITEM_STATUS_META[d.status];
            return (
              <li key={d.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800" title={d.title}>{d.title}</p>
                  <p className="text-[11px] text-slate-400">{d.workstreamLabel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-slate-700">{formatDate(d.date)}</p>
                  <span className={`text-[10px] font-medium ${meta.chip} rounded-full px-1.5 py-0.5`}>{meta.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BlockersCard({ blockers, onOpenItem }: { blockers: TimelineBlocker[]; onOpenItem?: (itemId: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-900">
        Planning alerts
        {blockers.length > 0 ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{blockers.length}</span>
        ) : null}
      </h3>
      {blockers.length === 0 ? (
        <p className="text-xs text-slate-500">No active blockers or time-based risks.</p>
      ) : (
        <ul className="space-y-2.5">
          {blockers.slice(0, 6).map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => onOpenItem?.(b.id)} className="min-w-0 text-left hover:text-blue-700" aria-label={`Open ${b.title}`}>
                <span className="block truncate text-xs font-medium text-slate-800">{b.title}</span>
                <span className="block text-[11px] text-slate-500">{b.workstreamLabel} · {b.kind === "BLOCKER" ? "Blocker" : "At risk"} · {BLOCKER_REASON_LABEL[b.reason]}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-600">{b.explanation}</span>
              </button>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.severity === "HIGH" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                {b.severity === "HIGH" ? "High" : "Med"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HealthCard({ health }: { health: EventTimelineDashboard["health"] }) {
  const ring =
    health.label === "Good" ? "text-emerald-500" : health.label === "Fair" ? "text-amber-500" : "text-rose-500";
  const circumference = 2 * Math.PI * 30;
  const dash = (Math.max(0, Math.min(100, health.score)) / 100) * circumference;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Roadmap Health</h3>
      <div className="flex items-center gap-4">
        <div className="relative h-[76px] w-[76px]">
          <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
            <circle cx="38" cy="38" r="30" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
            <circle
              cx="38"
              cy="38"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className={ring}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold text-slate-900">{health.score}</span>
          </div>
        </div>
        <div>
          <p className={`text-sm font-semibold ${ring}`}>{health.label}</p>
          <p className="text-[11px] text-slate-400">Out of 100</p>
        </div>
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">What’s driving this</p>
        <ul className="space-y-1.5">
          {health.drivers.map((driver, idx) => (
            <li key={`${driver.label}-${idx}`} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  driver.tone === "positive" ? "bg-emerald-500" : driver.tone === "negative" ? "bg-rose-500" : "bg-slate-400"
                }`}
              />
              <span className="text-slate-600">
                <span className="font-medium text-slate-800">{driver.label}.</span> {driver.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
