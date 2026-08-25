"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EVENT_LIFECYCLE_FILTER_OPTIONS,
  type EventLifecycleFilterValue,
  type EventStatusValue,
} from "@/lib/event-lifecycle";

export type ApiEventStatus = EventStatusValue;
export type StatusFilter = EventLifecycleFilterValue;
export const STATUS_FILTER_OPTIONS = EVENT_LIFECYCLE_FILTER_OPTIONS;

export type EventSummary = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  status: ApiEventStatus;
  deadlines: number;
  forecastCents: number;
  actualCents: number;
  location?: string | null;
  nextMilestoneDate?: string | null;
  risk?: "critical" | "warning" | "stable";
  budgetUtilization?: number;
  pendingApprovals?: number;
};

export type EventGroups = {
  live: EventSummary[];
  planning: EventSummary[];
  completed: EventSummary[];
  canceled: EventSummary[];
};

export type EventStats = {
  live: number;
  atRisk: number;
  approvals: number;
  deadlines: number;
};

type UseEventsDataOptions = {
  search?: string;
  statusFilter?: StatusFilter;
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeEvent(event: Partial<EventSummary> & { id: string; name: string; startDate: string; status: ApiEventStatus }): EventSummary {
  return {
    id: event.id,
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate ?? null,
    status: event.status,
    deadlines: event.deadlines ?? 0,
    forecastCents: event.forecastCents ?? 0,
    actualCents: event.actualCents ?? 0,
    location: event.location ?? null,
    nextMilestoneDate: event.nextMilestoneDate ?? null,
    risk: event.risk,
    budgetUtilization: event.budgetUtilization,
    pendingApprovals: event.pendingApprovals ?? 0,
  };
}

function budgetUtilization(event: EventSummary): number {
  if (typeof event.budgetUtilization === "number") {
    return event.budgetUtilization;
  }
  if (event.forecastCents <= 0) return 0;
  return Math.round((event.actualCents / event.forecastCents) * 100);
}

function eventRisk(event: EventSummary): "critical" | "warning" | "stable" {
  if (event.risk) return event.risk;
  const utilization = budgetUtilization(event);
  if (utilization > 100) return "critical";
  if (event.deadlines > 0 || utilization >= 90) return "warning";
  return "stable";
}

function milestoneDate(event: EventSummary): Date | null {
  const value = event.nextMilestoneDate ?? event.startDate;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildStats(events: EventSummary[]): EventStats {
  const today = new Date();
  const deadlineWindowEnd = addDays(today, 14);

  return {
    live: events.filter((event) => event.status === "ACTIVE").length,
    atRisk: events.filter((event) => {
      const risk = eventRisk(event);
      return risk === "critical" || risk === "warning";
    }).length,
    approvals: events.reduce((sum, event) => sum + (event.pendingApprovals ?? 0), 0),
    deadlines: events.filter((event) => {
      const date = milestoneDate(event);
      return date !== null && date >= today && date < deadlineWindowEnd;
    }).length,
  };
}

function groupEvents(events: EventSummary[]): EventGroups {
  return {
    live: events.filter((event) => event.status === "ACTIVE"),
    planning: events.filter((event) => event.status === "DRAFT"),
    completed: events.filter((event) => event.status === "COMPLETED"),
    canceled: events.filter((event) => event.status === "CANCELED"),
  };
}

async function fetchEvents(): Promise<EventSummary[]> {
  const response = await fetch("/api/events", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load events");
  }

  const payload = await response.json();
  const loaded = Array.isArray(payload) ? payload : [];
  return loaded.map(normalizeEvent);
}

export function useEventsData({ search = "", statusFilter = "ALL" }: UseEventsDataOptions = {}) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setEvents(await fetchEvents());
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not load events.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return sortedEvents.filter((event) => {
      const matchesStatus = statusFilter === "ALL" || event.status === statusFilter;
      const matchesSearch = normalizedSearch.length === 0 || event.name.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [search, sortedEvents, statusFilter]);

  const grouped = useMemo(() => groupEvents(filteredEvents), [filteredEvents]);
  const stats = useMemo(() => buildStats(sortedEvents), [sortedEvents]);
  const visibleEvents = useMemo(
    () => sortedEvents.filter((event) => event.status !== "CANCELED"),
    [sortedEvents],
  );

  return {
    allEvents: sortedEvents,
    events: grouped,
    filteredEvents,
    visibleEvents,
    stats,
    isLoading,
    errorMessage,
    refetch,
  };
}
