"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { DateField } from "@/components/date-field";
import {
  ACTION_OPTIONS,
  ACTION_LABELS,
  ACTOR_KIND_LABELS,
  actorDisplayLabel,
  buildActivityQuery,
  changeFieldLabel,
  entryHeadline,
  EMPTY_FILTERS,
  formatChangeValue,
  hasActiveFilters,
  hasChanges,
  isLegacyActivity,
  MODULE_OPTIONS,
  MODULE_LABELS,
  PAGE_SIZE,
  type ActivityActorOption,
  type ActivityEntry,
  type ActivityFilters,
} from "./activity-view";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventActivity({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [actors, setActors] = useState<ActivityActorOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");

  // Cursor stack: cursorStack[i] is the cursor that produced page i.
  // The first page uses a null cursor. nextCursor drives the "Next" control.
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Debounce free-text search into the filter set (which resets pagination).
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput.trim() ? prev : { ...prev, search: searchInput.trim() }));
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? null;

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const query = buildActivityQuery(filters, currentCursor);
      const res = await fetch(`/api/events/${eventId}/activity${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("You do not have access to this event's activity.");
        }
        if (res.status === 400 && payload?.code === "INVALID_CURSOR") {
          // Recover from a stale/expired cursor by returning to the first page.
          setCursorStack([null]);
          throw new Error("This page link expired. Showing the latest activity.");
        }
        throw new Error(payload?.error ?? "Failed to load activity.");
      }
      setEntries((payload.entries ?? []) as ActivityEntry[]);
      setNextCursor((payload.nextCursor ?? null) as string | null);
      setActors((payload.actors ?? []) as ActivityActorOption[]);
    } catch (e) {
      setEntries([]);
      setNextCursor(null);
      setErrorMessage(e instanceof Error ? e.message : "Failed to load activity.");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, filters, currentCursor]);

  useEffect(() => {
    void load();
  }, [load]);

  // Changing any filter resets pagination to the first page.
  const updateFilter = useCallback((patch: Partial<ActivityFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCursorStack([null]);
    setExpanded(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
    setCursorStack([null]);
    setExpanded(new Set());
  }, []);

  const goNext = useCallback(() => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, nextCursor]);
    setExpanded(new Set());
  }, [nextCursor]);

  const goPrev = useCallback(() => {
    setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setExpanded(new Set());
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const pageNumber = cursorStack.length;
  const canGoPrev = cursorStack.length > 1;
  const filtersActive = hasActiveFilters(filters);

  const bodyState = useMemo<"loading" | "error" | "empty-filtered" | "empty" | "list">(() => {
    if (isLoading) return "loading";
    if (errorMessage) return "error";
    if (entries.length === 0) return filtersActive ? "empty-filtered" : "empty";
    return "list";
  }, [isLoading, errorMessage, entries.length, filtersActive]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
        <h3 className="text-[22px] leading-[26px] font-semibold text-slate-900">Activity</h3>
        <p className="mt-1 text-[13px] text-slate-500">
          A read-only history of changes across this event.
        </p>
        </div>
        {!isLoading ? <span className="text-sm text-slate-500">{entries.length}{nextCursor ? "+" : ""} activities</span> : null}
      </header>

      {/* Filters */}
      <section className="mb-4 flex flex-wrap items-end gap-2" aria-label="Activity filters">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
          From
          <DateField value={filters.from} min={undefined} onChange={(from) => updateFilter({ from, ...(filters.to && from > filters.to ? { to: "" } : {}) })} ariaLabel="Filter activity from date" placeholder="Any date" buttonClassName="h-9 rounded-lg px-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
          To
          <DateField value={filters.to} min={filters.from || undefined} onChange={(to) => updateFilter({ to })} ariaLabel="Filter activity to date" placeholder="Any date" buttonClassName="h-9 rounded-lg px-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
          Actor
          <select
            value={filters.actor}
            onChange={(e) => updateFilter({ actor: e.target.value })}
            aria-label="Filter activity by actor"
            className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-700"
          >
            <option value="">All actors</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
          Module
          <select
            value={filters.module}
            onChange={(e) => updateFilter({ module: e.target.value })}
            aria-label="Filter activity by module"
            className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-700"
          >
            <option value="">All modules</option>
            {MODULE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {MODULE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
          Action
          <select
            value={filters.action}
            onChange={(e) => updateFilter({ action: e.target.value })}
            aria-label="Filter activity by action type"
            className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-700"
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-slate-500">
          Search
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search activity"
            aria-label="Search activity"
            className="h-9 min-w-[10rem] rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300"
          />
        </label>
        {filtersActive || searchInput ? (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50"
          >
            Clear filters
          </button>
        ) : null}
      </section>

      {/* Body */}
      {bodyState === "error" ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {bodyState === "loading" ? (
        <div className="space-y-2 py-2" role="status" aria-label="Loading activity">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : null}

      {bodyState === "empty" ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <p className="text-[14px] font-medium text-slate-700">No activity yet</p>
          <p className="mt-1 text-[13px] text-slate-500">
            Activity will appear here as changes are recorded across this event.
          </p>
        </div>
      ) : null}

      {bodyState === "empty-filtered" ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <p className="text-[14px] font-medium text-slate-700">No activity matches these filters</p>
          <span className="sr-only">No matching activity</span>
          <button type="button" onClick={clearFilters} className="mt-2 text-[13px] font-semibold text-[#28439A]">Clear filters</button>
        </div>
      ) : null}

      {bodyState === "list" ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Event activity">
          {entries.map((entry) => {
            const isOpen = expanded.has(entry.id);
            const expandable = hasChanges(entry);
            const legacy = isLegacyActivity(entry);
            return (
              <li key={entry.id} className="bg-white">
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${legacy ? "bg-amber-50 text-amber-700" : "bg-[#28439A]/[0.06] text-[#28439A]"}`}>
                        {entryHeadline(entry)}
                      </span>
                      {entry.entityLabel ? (
                        <span className="truncate text-[12px] text-slate-500">{entry.entityLabel}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[13px] text-slate-800">{entry.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="font-medium text-slate-500">{actorDisplayLabel(entry)}</span>
                      {entry.actorKind !== "USER" ? (
                        <span className="rounded border border-slate-200 px-1 py-px text-[10px] uppercase tracking-wide text-slate-400">
                          {ACTOR_KIND_LABELS[entry.actorKind]}
                        </span>
                      ) : null}
                      <span aria-hidden>·</span>
                      <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
                    </p>
                  </div>
                  {expandable ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(entry.id)}
                      aria-expanded={isOpen}
                      aria-controls={`activity-changes-${entry.id}`}
                      className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-50"
                    >
                      {isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                      {isOpen ? "Hide changes" : "View changes"}
                    </button>
                  ) : null}
                </div>
                {expandable && isOpen ? (
                  <div id={`activity-changes-${entry.id}`} className="border-t border-slate-100 px-3 py-2">
                    <dl className="flex flex-col gap-1.5">
                      {entry.changes!.map((change, index) => (
                        <div key={`${change.field}-${index}`} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                          <dt className="font-medium text-slate-600">{changeFieldLabel(change)}</dt>
                          <dd className="flex items-center gap-1.5 text-slate-500">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 line-through decoration-slate-300">
                              {formatChangeValue(change.from)}
                            </span>
                            <span aria-hidden>→</span>
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                              {formatChangeValue(change.to)}
                            </span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Pagination */}
      {bodyState === "list" || canGoPrev ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Activity pagination">
          <span className="text-[12px] text-slate-400">
            Page {pageNumber} · {PAGE_SIZE} per page
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev || isLoading}
              className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextCursor || isLoading}
              className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
