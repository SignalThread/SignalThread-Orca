import {
  pickValidatedEventIdForAccess,
  type EventAccessResolution
} from "@/lib/access/event-access-mode";
import { resolveEventLocation } from "@/lib/events/event-location";

export type MobileEventAccessRole =
  | "platform_admin"
  | "organizer_admin"
  | "exhibitor_admin"
  | "exhibitor_viewer"
  | "viewer"
  | string
  | null;

export type MobileEventAccessResult = {
  eventIds: string[];
  resolution: EventAccessResolution;
  companyId: string | null;
  role: string | null;
};

export type MobileEventRow = {
  id: string;
  name: string | null;
  status: string | null;
  is_active: boolean | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
};

export type MobileAccessibleEvent = {
  id: string;
  name: string;
  status: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  displayLocation: string | null;
};

export type MobileEventsResponse = {
  events: MobileAccessibleEvent[];
  selectedDefaultEventId: string | null;
  accessResolution: EventAccessResolution;
};

function normalizeRole(role: MobileEventAccessRole): string {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "organizer" || value === "event_organizer") return "organizer_admin";
  return value;
}

function roleUsesViewerMobileAppPermission(role: MobileEventAccessRole): boolean {
  const normalized = normalizeRole(role);
  return normalized === "viewer" || normalized === "exhibitor_viewer";
}

function sortMobileEvents(events: MobileAccessibleEvent[]): MobileAccessibleEvent[] {
  return [...events].sort((a, b) => {
    const startA = a.startDate ?? "9999-12-31";
    const startB = b.startDate ?? "9999-12-31";
    if (startA !== startB) return startA.localeCompare(startB);
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    return a.id.localeCompare(b.id);
  });
}

export function buildMobileEventsResponse(input: {
  access: MobileEventAccessResult;
  eventRows: MobileEventRow[];
  appEnabledEventIds?: string[];
  preferredEventId?: string | null;
}): MobileEventsResponse {
  const canonicalEventIds = new Set(input.access.eventIds);
  const appEnabledEventIds = new Set(input.appEnabledEventIds ?? []);
  const isPlatformAll = input.access.resolution === "platform_all";
  const requiresAppEnabledAssignment = roleUsesViewerMobileAppPermission(input.access.role);

  const events = sortMobileEvents(
    input.eventRows
      .filter((row) => {
        const id = String(row.id ?? "").trim();
        if (!id) return false;
        if (!isPlatformAll && !canonicalEventIds.has(id)) return false;
        if (requiresAppEnabledAssignment && !appEnabledEventIds.has(id)) return false;
        return true;
      })
      .map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled event",
        status: row.status ?? null,
        isActive: row.is_active !== false,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        location: row.location ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        displayLocation: resolveEventLocation(row.city, row.state, row.location)
      }))
  );

  return {
    events,
    selectedDefaultEventId: pickValidatedEventIdForAccess(
      events.map((event) => event.id),
      input.preferredEventId
    ),
    accessResolution: input.access.resolution
  };
}
