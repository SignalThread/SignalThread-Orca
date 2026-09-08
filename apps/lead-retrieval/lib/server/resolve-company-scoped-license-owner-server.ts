import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCompanyScopedLicenseOwnerWithExplicitHost } from "@/lib/licenses/resolve-company-scoped-license-owner";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ResolveCompanyScopedLicenseOwnerServerResult =
  | { ok: true; licenseOwnerCompanyId: string }
  | { ok: false; error: string };

/**
 * Resolves `licenses.company_id` (billing / host) for a company-scoped license.
 * Prefer an explicit host when provided; otherwise fall back to any exhibitors row → event host.
 */
export async function resolveCompanyScopedLicenseOwnerServer(
  supabase: AdminClient,
  exhibitorCompanyId: string,
  explicitHostCompanyId?: string | null
): Promise<ResolveCompanyScopedLicenseOwnerServerResult> {
  const exId = String(exhibitorCompanyId ?? "").trim();
  if (!exId) {
    return { ok: false, error: "exhibitorCompanyId is required" };
  }

  const { data: exhibitorCo, error: exCoErr } = await (supabase as any)
    .from("companies")
    .select("id, organizer_id")
    .eq("id", exId)
    .maybeSingle();

  if (exCoErr || !exhibitorCo?.organizer_id) {
    return { ok: false, error: exCoErr?.message ?? "Exhibitor company was not found." };
  }

  const exhibitorOrganizerId = String(exhibitorCo.organizer_id);

  const hostId = String(explicitHostCompanyId ?? "").trim();
  if (hostId) {
    const { data: hostCo, error: hostErr } = await (supabase as any)
      .from("companies")
      .select("id, organizer_id")
      .eq("id", hostId)
      .maybeSingle();

    if (hostErr || !hostCo?.organizer_id) {
      return { ok: false, error: hostErr?.message ?? "Host company was not found." };
    }

    return resolveCompanyScopedLicenseOwnerWithExplicitHost({
      exhibitorOrganizerId,
      hostCompanyId: hostId,
      hostOrganizerId: String(hostCo.organizer_id)
    });
  }

  const { data: exhibitorRow, error: exhibitorLookupError } = await (supabase as any)
    .from("exhibitors")
    .select("event_id")
    .eq("company_id", exId)
    .limit(1)
    .maybeSingle();

  if (exhibitorLookupError) {
    return { ok: false, error: exhibitorLookupError.message ?? "Failed resolving exhibitor participation." };
  }
  if (!exhibitorRow?.event_id) {
    return {
      ok: false,
      error: "Select a billing organization (host company), or link this company to an event first."
    };
  }

  const { data: eventRow, error: eventError } = await (supabase as any)
    .from("events")
    .select("company_id")
    .eq("id", String(exhibitorRow.event_id))
    .maybeSingle();

  if (eventError || !eventRow?.company_id) {
    return { ok: false, error: eventError?.message ?? "Failed resolving event host for exhibitor company." };
  }

  return { ok: true, licenseOwnerCompanyId: String(eventRow.company_id) };
}
