/**
 * Pure validation/normalization for admin license create payloads (no server-only).
 * Used by POST /api/admin/licenses and unit tests.
 */

export type AdminLicenseScope = "event" | "company";
export type AdminLicenseBilling = "one_time" | "monthly";
export type AdminLicenseBillingSource = "internal" | "stripe" | "app_store" | "google_play";

export function normalizeLicenseScope(value: unknown): AdminLicenseScope | null {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "event" || v === "company") return v;
  return null;
}

export function normalizeLicenseBilling(value: unknown): AdminLicenseBilling | null {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "one_time" || v === "monthly") return v;
  return null;
}

export function normalizeLicenseBillingSource(value: unknown): AdminLicenseBillingSource | null {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "internal" || v === "stripe" || v === "app_store" || v === "google_play") return v;
  return null;
}

/** Mirrors POST /api/admin/licenses exhibitor + event rules (for tests and client hints). */
export function validateLicenseCreateScopeFields(input: {
  scope: AdminLicenseScope;
  eventId: string;
  exhibitorCompanyId: string;
}): string | null {
  if (!String(input.exhibitorCompanyId ?? "").trim()) {
    return "exhibitorCompanyId is required";
  }
  if (input.scope === "event" && !String(input.eventId ?? "").trim()) {
    return "eventId is required for event-scoped licenses";
  }
  return null;
}
