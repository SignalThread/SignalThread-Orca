import "server-only";

import type { AppRole } from "@/types/app";
import type { SessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { resolveAccessibleEventIdsForUser } from "@/lib/server/company-event-access";
import {
  isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess,
  primaryOrganizerAdminAccessibleEvents,
  type AdminAppAccessibleEvent
} from "@/lib/licenses/exhibitor-company-license-admin-eligibility";
import { selectLatestCompanyScopedLicense } from "@/lib/server/company-scoped-license-select";

export type AdminAppEventScopeResult =
  | { kind: "platform" }
  | { kind: "organizer"; accessibleEvents: AdminAppAccessibleEvent[]; multiEventLicensed: false }
  | {
      kind: "exhibitor";
      companyId: string | null;
      accessibleEvents: AdminAppAccessibleEvent[];
      multiEventLicensed: boolean;
    }
  /** Non-admin roles or unknown callers; no admin event scope. */
  | { kind: "none"; accessibleEvents: []; multiEventLicensed: false };

type LicenseRow = {
  scope: string | null;
  status: string | null;
  expires_at: string | null;
  starts_at: string | null;
};

async function loadCompanyScopedLicenseRow(
  supabase: ReturnType<typeof createAdminClient>,
  exhibitorCompanyId: string
): Promise<LicenseRow | null> {
  const { data, error } = await selectLatestCompanyScopedLicense(
    supabase,
    exhibitorCompanyId,
    "scope, status, expires_at, starts_at"
  );

  if (error) {
    throw new Error(error.message ?? "Failed loading company-scoped license.");
  }

  return (data as LicenseRow | null) ?? null;
}

async function loadAccessibleEventsInOrder(
  supabase: ReturnType<typeof createAdminClient>,
  orderedIds: string[]
): Promise<AdminAppAccessibleEvent[]> {
  if (orderedIds.length === 0) return [];

  const { data, error } = await (supabase as any)
    .from("events")
    .select("id, name")
    .in("id", orderedIds);

  if (error) {
    throw new Error(error.message ?? "Failed loading events for admin scope.");
  }

  const byId = new Map(
    ((data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, { id: row.id, name: row.name }])
  );

  const out: AdminAppAccessibleEvent[] = [];
  for (const id of orderedIds) {
    const ev = byId.get(id);
    if (ev) out.push(ev);
  }
  return out;
}

/**
 * Canonical admin-app event scope: one place for which events a user may access in admin surfaces.
 *
 * Platform admins: kind "platform" (no list; callers use existing platform flows).
 * Organizer admins: single primary event only (first in organizer scope ordering).
 *
 * Exhibitor admins: **same event id list as `resolveAccessibleEventIdsForUser`** (users.event_access_mode
 * + company license eligibility). In particular, `assigned_events_only` with zero `event_users` rows
 * yields an empty list — do not widen to company-owned events just because the company has a license.
 */
export async function resolveAdminAppEventScopeForUser(session: SessionUser): Promise<AdminAppEventScopeResult> {
  const role = session.role as AppRole | null;

  if (role === "platform_admin") {
    return { kind: "platform" };
  }

  if (role === "organizer_admin") {
    const organizerScope = await getOrganizerScope(session.id);
    const mapped = organizerScope.events.map((event) => ({ id: event.id, name: event.name }));
    return {
      kind: "organizer",
      accessibleEvents: primaryOrganizerAdminAccessibleEvents(mapped),
      multiEventLicensed: false
    };
  }

  if (role !== "exhibitor_admin") {
    return { kind: "none", accessibleEvents: [], multiEventLicensed: false };
  }

  const companyId = session.company_id;
  if (!companyId) {
    return {
      kind: "exhibitor",
      companyId: null,
      accessibleEvents: [],
      multiEventLicensed: false
    };
  }

  const supabase = createAdminClient();
  const nowMs = Date.now();
  const licenseRow = await loadCompanyScopedLicenseRow(supabase, companyId);
  const multiEventLicensed = isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(licenseRow, nowMs);

  const access = await resolveAccessibleEventIdsForUser({ userId: session.id, nowMs });
  const accessibleEvents = await loadAccessibleEventsInOrder(supabase, access.eventIds);

  return {
    kind: "exhibitor",
    companyId,
    accessibleEvents,
    multiEventLicensed
  };
}
