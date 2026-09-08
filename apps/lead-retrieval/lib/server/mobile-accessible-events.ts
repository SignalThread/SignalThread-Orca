import "server-only";

import { eventAppPermissionEnabled } from "@/lib/exhibitor/event-app-permission-enabled";
import {
  buildMobileEventsResponse,
  type MobileEventRow,
  type MobileEventsResponse
} from "@/lib/mobile/mobile-events-core";
import { resolveAccessibleEventIdsForUser } from "@/lib/server/company-event-access";
import { createAdminClient } from "@/lib/supabase/admin";

type MobileEventsSession = {
  userId: string;
  companyId: string;
  role: string;
};

const MOBILE_EVENT_SELECT_COLUMNS = "id, name, status, is_active, start_date, end_date, location, city, state";

function normalizeRole(role: string | null | undefined) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "organizer" || value === "event_organizer") return "organizer_admin";
  return value;
}

function roleNeedsAppEnabledAssignments(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return normalized === "viewer" || normalized === "exhibitor_viewer";
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function loadEventRows(eventIds: string[], includeAll: boolean): Promise<MobileEventRow[]> {
  const supabase = createAdminClient();
  let query = (supabase as any).from("events").select(MOBILE_EVENT_SELECT_COLUMNS);
  if (!includeAll) {
    if (eventIds.length === 0) return [];
    query = query.in("id", eventIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed loading mobile events.");
  }
  return (data ?? []) as MobileEventRow[];
}

async function loadAppEnabledEventIds(userId: string, companyId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("event_id, permissions")
    .eq("user_id", userId)
    .eq("exhibitor_company_id", companyId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message ?? "Failed loading mobile event assignments.");
  }

  return dedupe(
    ((data ?? []) as Array<{ event_id: string | null; permissions: unknown }>)
      .filter((row) => eventAppPermissionEnabled(row.permissions))
      .map((row) => String(row.event_id ?? "").trim())
  );
}

export async function getMobileAccessibleEventsForSession(
  session: MobileEventsSession,
  options: { preferredEventId?: string | null } = {}
): Promise<MobileEventsResponse> {
  const access = await resolveAccessibleEventIdsForUser({ userId: session.userId });
  const eventRows = await loadEventRows(access.eventIds, access.resolution === "platform_all");
  const appEnabledEventIds = roleNeedsAppEnabledAssignments(access.role)
    ? await loadAppEnabledEventIds(session.userId, access.companyId ?? session.companyId)
    : [];

  return buildMobileEventsResponse({
    access,
    eventRows,
    appEnabledEventIds,
    preferredEventId: options.preferredEventId
  });
}
