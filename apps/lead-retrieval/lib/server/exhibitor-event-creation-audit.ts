import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExhibitorCompanyEventCreationResult } from "@/lib/licenses/evaluate-exhibitor-company-event-creation";

/** Temporary: entitlement audit for a specific production repro. Remove after root cause is confirmed. */
const AUDIT_EVENT_CREATION_EMAIL = "kamyab.ali+direct@gmail.com";

export function shouldAuditExhibitorEventCreation(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return e === AUDIT_EVENT_CREATION_EMAIL;
}

function failingFieldHint(reason: ExhibitorCompanyEventCreationResult["reason"]): string {
  switch (reason) {
    case "allowed":
      return "—";
    case "no_license":
      return "No single company-scoped license row: licenses where exhibitor_company_id = users.company_id AND scope = 'company' (0 rows, or PostgREST error if multiple).";
    case "wrong_scope":
      return "Resolved license.scope is not 'company'.";
    case "capability_disabled":
      return "licenses.can_create_events is false or null for that row (mapped to Boolean in code; null → false).";
    case "license_inactive":
      return "licenses.status is not 'active' (case-insensitive check).";
    case "license_expired":
      return "licenses.expires_at is on or before evaluation time.";
    case "event_limit_reached":
      return "Count of events with company_id = exhibitor company >= licenses.max_events.";
    default:
      return "unknown";
  }
}

/**
 * Structured server log for one entitlement evaluation. Search logs for tag EVENT_CREATION_ENTITLEMENT_AUDIT.
 */
export async function logExhibitorEventCreationEntitlementAudit(input: {
  email: string | null;
  userId: string;
  companyId: string;
  eligibility: ExhibitorCompanyEventCreationResult;
}): Promise<void> {
  const supabase = createAdminClient();
  const { companyId, userId } = input;

  const [userRes, companyRes, canonicalLicenseRes, licensesOrRes, eventCountRes] = await Promise.all([
    (supabase as any)
      .from("users")
      .select("id, email, role, company_id, event_access_mode, license_id, created_at")
      .eq("id", userId)
      .maybeSingle(),
    (supabase as any).from("companies").select("id, name").eq("id", companyId).maybeSingle(),
    (supabase as any)
      .from("licenses")
      .select(
        "id, scope, status, exhibitor_company_id, company_id, event_id, can_create_events, max_events, expires_at, starts_at, seats_total, seats_used, billing, billing_source, license_plan_id, license_key"
      )
      .eq("exhibitor_company_id", companyId)
      .eq("scope", "company"),
    (supabase as any)
      .from("licenses")
      .select(
        "id, scope, status, exhibitor_company_id, company_id, event_id, can_create_events, max_events, expires_at, starts_at"
      )
      .or(`exhibitor_company_id.eq.${companyId},company_id.eq.${companyId}`),
    (supabase as any)
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
  ]);

  const canonicalRows = canonicalLicenseRes.data;
  const canonicalCount = Array.isArray(canonicalRows) ? canonicalRows.length : canonicalLicenseRes.data ? 1 : 0;

  const payload = {
    tag: "EVENT_CREATION_ENTITLEMENT_AUDIT",
    timestamp: new Date().toISOString(),
    email: input.email,
    userId: input.userId,
    companyId: input.companyId,
    userRow: userRes.data ?? null,
    userFetchError: userRes.error?.message ?? null,
    companyRow: companyRes.data ?? null,
    companyFetchError: companyRes.error?.message ?? null,
    /** Query matching evaluateExhibitorCompanyEventCreationEligibility (without maybeSingle). */
    companyScopedLicensesForExhibitorId: Array.isArray(canonicalRows)
      ? canonicalRows
      : canonicalLicenseRes.data
        ? [canonicalLicenseRes.data]
        : [],
    canonicalLicenseQueryError: canonicalLicenseRes.error?.message ?? null,
    canonicalLicenseRowCount: canonicalCount,
    canonicalLicenseAmbiguous: canonicalCount > 1,
    allLicensesLinkedToCompanyOrExhibitor: licensesOrRes.data ?? [],
    allLicensesFetchError: licensesOrRes.error?.message ?? null,
    eventCountForCompanyId: eventCountRes.count ?? null,
    eventCountError: eventCountRes.error?.message ?? null,
    eligibility: input.eligibility,
    denyReason: input.eligibility.allowed ? null : input.eligibility.reason,
    failingCondition: input.eligibility.allowed ? null : failingFieldHint(input.eligibility.reason),
    codePath:
      "createExhibitorEventAction → runCreateEventMutation → executeCreateEventMutation → evaluateExhibitorCompanyEventCreationEligibility → evaluateExhibitorCompanyEventCreationFromLicenseRow"
  };

  console.log(JSON.stringify(payload, null, 2));
}
