export type RoadmapDeepLinkInput = {
  eventId: string;
  itemId: string;
  view?: "DASHBOARD" | "LIST" | "TIMELINE" | "BOARD";
  stage?: string | null;
};

function eventPath(eventId: string, suffix = ""): string {
  return `/events/${encodeURIComponent(eventId)}${suffix}`;
}

function withQuery(path: string, entries: Array<[string, string | null | undefined]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (!value) continue;
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function eventTimelineHref(eventId: string): string {
  return eventPath(eventId, "/timeline");
}

export function eventTimelineListHref(eventId: string, filter?: { stage?: string | null; conflict?: boolean }): string {
  return withQuery(eventTimelineHref(eventId), [
    ["view", "LIST"],
    ["stage", filter?.stage],
    ["filter", filter?.conflict ? "conflicts" : undefined],
  ]);
}

export function roadmapItemHref({ eventId, itemId, view = "TIMELINE", stage }: RoadmapDeepLinkInput): string {
  return withQuery(eventTimelineHref(eventId), [
    ["view", view],
    ["stage", stage],
    ["item", itemId],
  ]);
}

export function eventDeadlineHref(eventId: string, deadlineId: string): string {
  return withQuery(eventTimelineHref(eventId), [
    ["view", "LIST"],
    ["deadline", deadlineId],
  ]);
}

export function commandCenterRoadmapRecordHref(eventId: string, recordId: string): string {
  if (recordId.startsWith("timeline-")) {
    return roadmapItemHref({ eventId, itemId: recordId.slice("timeline-".length) });
  }
  if (recordId.startsWith("risk-")) {
    return roadmapItemHref({ eventId, itemId: recordId.slice("risk-".length) });
  }
  if (recordId.startsWith("deadline-")) {
    return eventDeadlineHref(eventId, recordId.slice("deadline-".length));
  }
  return eventTimelineListHref(eventId);
}

export function eventBudgetHref(eventId: string): string {
  return eventPath(eventId, "/budget");
}

export function eventBudgetGridHref(eventId: string, filter?: { category?: string | null }): string {
  return withQuery(eventBudgetHref(eventId), [
    ["view", "grid"],
    ["category", filter?.category],
  ]);
}

export function eventRunOfShowHref(eventId: string): string {
  return eventPath(eventId, "/matrix");
}

export function eventDocsHref(eventId: string): string {
  return eventPath(eventId, "/docs");
}

export function eventSpeakersHref(eventId: string): string {
  return eventPath(eventId, "/speakers");
}

export function eventStaffingHref(eventId: string): string {
  return eventPath(eventId, "/staffing");
}

/**
 * Event-level F&B Planner, inside Run of Show. This is the single destination for F&B
 * functions, the approved catalog, and source-menu management.
 */
export function eventFnbPlannerHref(eventId: string): string {
  return eventPath(eventId, "/matrix/fnb");
}

/** @deprecated Menus is not a standalone destination — use {@link eventFnbPlannerHref}. */
export function eventFnbCatalogHref(eventId: string): string {
  return eventFnbPlannerHref(eventId);
}

export function eventAttendeesHref(eventId: string): string {
  return eventPath(eventId, "/attendees");
}

export function eventSettingsHref(eventId: string): string {
  return eventPath(eventId, "/settings");
}

export type OperationalReadinessRouteKey = "speakers" | "avProduction" | "fnb" | "staffing" | "rooms";

export function operationalReadinessHref(eventId: string, key: OperationalReadinessRouteKey): string {
  switch (key) {
    case "speakers":
      return eventSpeakersHref(eventId);
    case "avProduction":
      return eventRunOfShowHref(eventId);
    case "fnb":
      return eventFnbCatalogHref(eventId);
    case "staffing":
      return eventStaffingHref(eventId);
    case "rooms":
      return eventRunOfShowHref(eventId);
  }
}

export type AccountActionCenterView = "risks" | "approvals" | "deadlines" | "tasks" | "budget";
export type AccountDeadlineFilter = "overdue";
export type AccountFinancialView = "summary" | "categories" | "events";

export function accountEventsHref(): string {
  return "/dashboard#event-snapshot";
}

export function accountActionCenterHref(input: {
  view: AccountActionCenterView;
  filter?: AccountDeadlineFilter | null;
}): string {
  return withQuery("/dashboard/action-center", [
    ["view", input.view],
    ["filter", input.filter],
  ]);
}

export function accountFinancialsHref(input: {
  category?: string | null;
  view?: AccountFinancialView | null;
} = {}): string {
  return withQuery("/dashboard/financials", [
    ["view", input.view],
    ["category", input.category],
  ]);
}
