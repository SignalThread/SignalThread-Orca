import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateExhibitorCompanyEventCreationFromLicenseRow,
  type ExhibitorCompanyEventCreationResult
} from "@/lib/licenses/evaluate-exhibitor-company-event-creation";
import { selectLatestCompanyScopedLicense } from "@/lib/server/company-scoped-license-select";

/**
 * Canonical server evaluation: may this exhibitor (direct-buyer) company create another event?
 *
 * Loads the company-scoped license row for `exhibitor_company_id` and counts live `events` rows
 * where `company_id` matches that exhibitor company (authoritative, not cached).
 *
 * Business rules live only in `evaluateExhibitorCompanyEventCreationFromLicenseRow`.
 */
export async function evaluateExhibitorCompanyEventCreationEligibility(
  exhibitorCompanyId: string,
  options?: { nowMs?: number }
): Promise<ExhibitorCompanyEventCreationResult> {
  const companyId = String(exhibitorCompanyId ?? "").trim();
  const nowMs = options?.nowMs ?? Date.now();

  if (!companyId) {
    return evaluateExhibitorCompanyEventCreationFromLicenseRow({
      license: null,
      currentEventCount: 0,
      nowMs
    });
  }

  const supabase = createAdminClient();

  const [licenseResponse, countResponse] = await Promise.all([
    selectLatestCompanyScopedLicense(
      supabase,
      companyId,
      "id, scope, status, expires_at, can_create_events, max_events"
    ),
    (supabase as any)
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
  ]);

  if (licenseResponse.error) {
    throw new Error(licenseResponse.error.message ?? "Failed loading license for event creation.");
  }
  if (countResponse.error) {
    throw new Error(countResponse.error.message ?? "Failed counting events for exhibitor company.");
  }

  const row = licenseResponse.data as
    | {
        id: string;
        scope: string;
        status: string;
        expires_at: string | null;
        can_create_events: boolean;
        max_events: number | null;
      }
    | null;

  const license = row
    ? {
        id: String(row.id),
        scope: row.scope,
        status: row.status,
        expiresAt: row.expires_at,
        canCreateEvents: Boolean(row.can_create_events),
        maxEvents: row.max_events == null ? null : Number(row.max_events)
      }
    : null;

  const currentEventCount = Number(countResponse.count ?? 0);

  return evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license,
    currentEventCount,
    nowMs
  });
}

export type { ExhibitorCompanyEventCreationResult } from "@/lib/licenses/evaluate-exhibitor-company-event-creation";
