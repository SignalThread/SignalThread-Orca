import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type OrganizerEventOption = {
  id: string;
  name: string;
  companyId: string;
  status: string;
  city: string | null;
  state: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type OrganizerScope = {
  companyIds: string[];
  events: OrganizerEventOption[];
};

export async function getOrganizerScope(organizerUserId: string): Promise<OrganizerScope> {
  const supabase = createAdminClient();

  const { data: userRow, error: userError } = await (supabase as any)
    .from("users")
    .select("id, role")
    .eq("id", organizerUserId)
    .maybeSingle();

  if (userError) {
    console.error("[organizer-scope] users fetch failed:", userError.message, userError.code);
    throw new Error(userError.message ?? "Failed loading organizer user role.");
  }

  const normalizedRole = String(userRow?.role ?? "").toLowerCase();
  const hasOrganizerAccess =
    normalizedRole === "organizer_admin" ||
    normalizedRole === "event_organizer" ||
    normalizedRole === "organizer";

  if (!hasOrganizerAccess) {
    return { companyIds: [], events: [] };
  }

  const { data: memberships, error: membershipsError } = await (supabase as any)
    .from("event_users")
    .select("event_id, exhibitor_company_id, status")
    .eq("user_id", organizerUserId)
    .in("status", ["active", "invited"]);

  if (membershipsError) {
    console.error("[organizer-scope] event_users fetch failed:", membershipsError.message, membershipsError.code);
    throw new Error(membershipsError.message ?? "Failed loading organizer event membership.");
  }

  const eventIds = Array.from(
    new Set(
      ((memberships ?? []) as Array<{ event_id: string }>)
        .map((row) => row.event_id)
        .filter(Boolean)
    )
  );

  if (!eventIds.length) {
    return { companyIds: [], events: [] };
  }

  const { data: events, error: eventsError } = await (supabase as any)
    .from("events")
    .select("id, name, company_id, status, city, state, location, start_date, end_date")
    .in("id", eventIds)
    .order("start_date", { ascending: false });

  if (eventsError) {
    console.error("[organizer-scope] events fetch failed:", eventsError.message, eventsError.code);
    throw new Error(eventsError.message ?? "Failed loading organizer events.");
  }

  const scopedEvents = (events ?? []) as Array<{
    id: string;
    name: string;
    company_id: string;
    status: string;
    city: string | null;
    state: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;

  const { data: exhibitors, error: exhibitorsError } = await (supabase as any)
    .from("exhibitors")
    .select("event_id, company_id")
    .in("event_id", eventIds);

  if (exhibitorsError) {
    console.error("[organizer-scope] exhibitors fetch failed:", exhibitorsError.message, exhibitorsError.code);
    throw new Error(exhibitorsError.message ?? "Failed loading organizer exhibitor scope.");
  }

  const companyIds = Array.from(
    new Set([
      ...scopedEvents.map((event) => event.company_id).filter(Boolean),
      ...((exhibitors ?? []) as Array<{ company_id: string }>)
        .map((row) => row.company_id)
        .filter(Boolean),
      ...((memberships ?? []) as Array<{ exhibitor_company_id: string | null }>)
        .map((row) => row.exhibitor_company_id)
        .filter((value): value is string => Boolean(value))
    ])
  );

  return {
    companyIds,
    events: scopedEvents.map((event) => ({
      id: event.id,
      name: event.name,
      companyId: event.company_id,
      status: event.status,
      city: event.city ?? null,
      state: event.state ?? null,
      location: event.location ?? null,
      startDate: event.start_date,
      endDate: event.end_date
    }))
  };
}

export function pickScopedEventId(requestedEventId: string | undefined, events: OrganizerEventOption[]) {
  const normalized = String(requestedEventId ?? "").trim();
  if (normalized && events.some((event) => event.id === normalized)) {
    return normalized;
  }
  return events[0]?.id ?? "";
}

export async function ensureOrganizerOwnsEvent(organizerUserId: string, eventId: string) {
  const scope = await getOrganizerScope(organizerUserId);
  return scope.events.some((event) => event.id === eventId);
}

export async function ensureOrganizerOwnsCompany(organizerUserId: string, companyId: string) {
  const scope = await getOrganizerScope(organizerUserId);
  return scope.companyIds.includes(companyId);
}
