import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizerScope } from "@/lib/data/organizer-scope";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * True if the exhibitor company is already in organizer scope, or shares the same
 * `companies.organizer_id` as any event host company in that scope (direct-buyer companies
 * created under that organizer without an `exhibitors` row yet).
 */
export async function organizerAdminMayAccessExhibitorCompany(
  supabase: AdminClient,
  scope: OrganizerScope,
  exhibitorCompanyId: string
): Promise<boolean> {
  if (!exhibitorCompanyId) return false;
  if (scope.companyIds.includes(exhibitorCompanyId)) return true;

  const { data: exhibitorCo, error: exErr } = await (supabase as any)
    .from("companies")
    .select("organizer_id")
    .eq("id", exhibitorCompanyId)
    .maybeSingle();

  if (exErr || !exhibitorCo?.organizer_id) return false;

  const hostCompanyIds = Array.from(new Set(scope.events.map((e) => e.companyId).filter(Boolean)));
  if (!hostCompanyIds.length) return false;

  const { data: hosts, error: hostErr } = await (supabase as any)
    .from("companies")
    .select("organizer_id")
    .in("id", hostCompanyIds);

  if (hostErr || !hosts?.length) return false;

  const hostOrganizerIds = new Set(
    (hosts as Array<{ organizer_id: string }>).map((h) => String(h.organizer_id)).filter(Boolean)
  );
  return hostOrganizerIds.has(String(exhibitorCo.organizer_id));
}
