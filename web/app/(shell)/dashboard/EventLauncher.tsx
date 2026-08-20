"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import {
  getEventLifecycleLabel,
  getEventLifecycleTone,
  isEventStatusValue,
  type EventStatusValue,
} from "@/lib/event-lifecycle";
import styles from "./dashboard.module.css";

type LauncherEvent = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: EventStatusValue;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatEventDateRange(event: LauncherEvent): string | null {
  const start = formatDate(event.startDate);
  if (!start) return null;
  const end = formatDate(event.endDate);
  return end && end !== start ? `${start} - ${end}` : start;
}

function formatEventLocation(event: LauncherEvent): string | null {
  const cityState = [event.city, event.state].filter(Boolean).join(", ");
  if (event.venueName && cityState) return `${event.venueName}, ${cityState}`;
  return event.venueName ?? (cityState || null);
}

function eventMatchesSearch(event: LauncherEvent, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    event.name,
    getEventLifecycleLabel(event.status),
    formatEventDateRange(event),
    formatEventLocation(event),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function eventSortRank(event: LauncherEvent): number {
  if (event.status === "ACTIVE") return 0;
  if (event.status === "DRAFT") return 1;
  if (event.status === "COMPLETED") return 2;
  return 3;
}

function parseLauncherEvents(value: unknown): LauncherEvent[] {
  if (!Array.isArray(value)) throw new Error("Invalid event list response");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid event list response");
    const event = entry as Record<string, unknown>;
    if (typeof event.id !== "string" || !event.id || typeof event.name !== "string" || !event.name.trim()) {
      throw new Error("Invalid event list response");
    }
    if (typeof event.status !== "string" || !isEventStatusValue(event.status)) {
      throw new Error("Invalid event list response");
    }
    return {
      id: event.id,
      name: event.name,
      startDate: typeof event.startDate === "string" ? event.startDate : null,
      endDate: typeof event.endDate === "string" ? event.endDate : null,
      status: event.status,
      venueName: typeof event.venueName === "string" ? event.venueName : null,
      city: typeof event.city === "string" ? event.city : null,
      state: typeof event.state === "string" ? event.state : null,
    };
  });
}

function lifecycleClass(status: EventStatusValue): string {
  const tone = getEventLifecycleTone(status);
  if (tone === "live") return styles.eventLauncherStatusLive;
  if (tone === "completed") return styles.eventLauncherStatusCompleted;
  if (tone === "canceled") return styles.eventLauncherStatusCanceled;
  return styles.eventLauncherStatusPlanning;
}

export function EventLauncher() {
  const router = useRouter();
  const launcherRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<LauncherEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const loadEvents = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    try {
      const response = await fetch("/api/events", { credentials: "include", signal });
      if (!response.ok) throw new Error(`Failed to load events: ${response.status}`);
      const loadedEvents = parseLauncherEvents(await response.json());
      if (signal?.aborted) return;
      setEvents(loadedEvents);
      setStatus("loaded");
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error("Failed to load event launcher options", error);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadEvents(controller.signal);

    return () => controller.abort();
  }, [loadEvents]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (launcherRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  const orderedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const rankDelta = eventSortRank(left) - eventSortRank(right);
        if (rankDelta !== 0) return rankDelta;
        return (
          new Date(right.startDate ?? 0).getTime() -
            new Date(left.startDate ?? 0).getTime() ||
          left.name.localeCompare(right.name)
        );
      }),
    [events],
  );

  const filteredEvents = useMemo(
    () => orderedEvents.filter((event) => eventMatchesSearch(event, search)),
    [orderedEvents, search],
  );

  return (
    <div className={styles.eventLauncher} ref={launcherRef} data-testid="command-center-event-launcher">
      <button
        type="button"
        className={styles.eventLauncherButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Search and open an event workspace"
      >
        <Search className="h-4 w-4 text-[var(--orca-blue)]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">Search events</span>
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} aria-hidden />
        )}
      </button>

      {isOpen ? (
        <div className={styles.eventLauncherPopover} role="listbox" aria-label="Select event">
          <label className={styles.eventLauncherSearch}>
            <span className="sr-only">Search events</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search events"
              className={styles.eventLauncherInput}
            />
          </label>

          <div className={styles.eventLauncherList}>
            {status === "loading" ? (
              <p className={styles.eventLauncherEmpty}>Loading events...</p>
            ) : status === "error" ? (
              <div className={styles.eventLauncherEmpty} role="alert">
                <p>Event list unavailable.</p>
                <button type="button" onClick={() => void loadEvents()} className="mt-2 font-semibold text-blue-700 underline underline-offset-2">
                  Retry
                </button>
              </div>
            ) : events.length === 0 ? (
              <div className={styles.eventLauncherEmpty}>
                <p>No events yet.</p>
                <button type="button" onClick={() => router.push("/events/new")} className="mt-2 font-semibold text-blue-700 underline underline-offset-2">
                  Create event
                </button>
              </div>
            ) : filteredEvents.length === 0 ? (
              <p className={styles.eventLauncherEmpty}>No events match your search.</p>
            ) : (
              filteredEvents.map((event) => {
                const dateRange = formatEventDateRange(event);
                const location = formatEventLocation(event);
                return (
                  <button
                    key={event.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.eventLauncherOption}
                    onClick={() => {
                      setIsOpen(false);
                      router.push(`/events/${event.id}`);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={styles.eventLauncherName}>{event.name}</span>
                      <span className={styles.eventLauncherMeta}>
                        {dateRange ? (
                          <span className={styles.eventLauncherMetaItem}>
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {dateRange}
                          </span>
                        ) : null}
                        {location ? (
                          <span className={styles.eventLauncherMetaItem}>
                            {event.venueName ? <Building2 className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}
                            {location}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className={`${styles.eventLauncherStatus} ${lifecycleClass(event.status)}`}>
                      {getEventLifecycleLabel(event.status)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
