import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizerScope } from "@/lib/data/organizer-scope";
import type { AdminLicenseRow } from "@/lib/data/admin-licenses-types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * License rows an organizer admin should see: event-scoped for scoped events,
 * company-scoped when the buyer company shares an organizer with a host company in scope.
 */
export async function filterAdminLicenseRowsForOrganizerScope(
  supabase: AdminClient,
  scope: OrganizerScope,
  rows: AdminLicenseRow[]
): Promise<AdminLicenseRow[]> {
  const scopedEventIds = new Set(scope.events.map((e) => e.id));
  const hostCompanyIds = Array.from(new Set(scope.events.map((e) => e.companyId).filter(Boolean)));

  const { data: hosts, error: hostErr } =
    hostCompanyIds.length > 0
      ? await (supabase as any).from("companies").select("organizer_id").in("id", hostCompanyIds)
      : { data: [], error: null };

  if (hostErr) {
    throw new Error(hostErr.message ?? "Failed loading host companies for license scope.");
  }

  const hostOrganizerIds = new Set(
    ((hosts ?? []) as Array<{ organizer_id: string }>).map((h) => String(h.organizer_id)).filter(Boolean)
  );

  const needsOrganizerLookup = rows.filter(
    (row) =>
      row.scope === "company" &&
      !scope.companyIds.includes(row.exhibitorCompanyId) &&
      hostOrganizerIds.size > 0
  );
  const exhibitorIdsToLoad = Array.from(new Set(needsOrganizerLookup.map((r) => r.exhibitorCompanyId)));

  const exhibitorOrganizerById = new Map<string, string>();
  if (exhibitorIdsToLoad.length > 0) {
    const { data: cos, error: coErr } = await (supabase as any)
      .from("companies")
      .select("id, organizer_id")
      .in("id", exhibitorIdsToLoad);

    if (coErr) {
      throw new Error(coErr.message ?? "Failed loading exhibitor companies for license scope.");
    }
    for (const row of (cos ?? []) as Array<{ id: string; organizer_id: string }>) {
      exhibitorOrganizerById.set(row.id, String(row.organizer_id));
    }
  }

  return rows.filter((row) => {
    if (row.scope === "event" && row.eventId && scopedEventIds.has(row.eventId)) {
      return true;
    }
    if (row.scope === "company") {
      if (scope.companyIds.includes(row.exhibitorCompanyId)) {
        return true;
      }
      const orgId = exhibitorOrganizerById.get(row.exhibitorCompanyId);
      return Boolean(orgId && hostOrganizerIds.has(orgId));
    }
    return false;
  });
}
