/**
 * Pure selection logic for "which license does the exhibitor Users page show as assignable?"
 *
 * Mirrors the precedence in `lib/server/event-user-access.ts#evaluateAppAccessGrant`:
 *   1. A **valid** company-scoped license (active, unexpired, `seats_total >= 1`, company
 *      distinct-user pool not full) wins.
 *   2. Otherwise, fall back to a **valid** event-scoped license for the same company and the
 *      current event slice.
 *   3. Otherwise, no assignable license.
 *
 * All DB lookups happen in the server wrapper; this function takes pre-loaded candidates and the
 * live seat counts so it can be unit-tested without Supabase.
 */

export type AssignableLicenseScope = "company" | "event";

export type AssignableLicenseCandidate = {
  id: string;
  scope: AssignableLicenseScope;
  event_id: string | null;
  exhibitor_company_id: string;
  seats_total: number | null;
  status: string | null;
  expires_at: string | null;
};

export type SelectAssignableLicenseInput = {
  companyScoped: AssignableLicenseCandidate | null;
  companyScopedSeatsUsed: number;
  eventScoped: AssignableLicenseCandidate | null;
  eventScopedSeatsUsed: number;
  now?: Date;
};

export type AssignableLicenseResult = {
  id: string;
  scope: AssignableLicenseScope;
  event_id: string | null;
  exhibitor_company_id: string;
  seats_total: number;
  seats_used: number;
  status: string | null;
};

function isLicenseEligible(
  license: AssignableLicenseCandidate | null,
  now: Date
): license is AssignableLicenseCandidate {
  if (!license) return false;
  if (String(license.status ?? "").toLowerCase() !== "active") return false;
  if (license.expires_at) {
    const expiresAt = new Date(license.expires_at).getTime();
    if (!Number.isNaN(expiresAt) && expiresAt <= now.getTime()) {
      return false;
    }
  }
  const seatsTotal = Math.max(0, Number(license.seats_total ?? 0));
  if (seatsTotal < 1) return false;
  return true;
}

function toResult(
  license: AssignableLicenseCandidate,
  seatsUsed: number
): AssignableLicenseResult {
  const seatsTotal = Math.max(0, Number(license.seats_total ?? 0));
  return {
    id: license.id,
    scope: license.scope,
    event_id: license.event_id,
    exhibitor_company_id: license.exhibitor_company_id,
    seats_total: seatsTotal,
    seats_used: Math.max(0, seatsUsed),
    status: license.status
  };
}

/**
 * Distinct active app-enabled users across all events for one exhibitor company.
 *
 * This is the canonical company-scoped seat consumption rule (see `lib/server/event-user-access.ts`)
 * expressed purely so it can be unit-tested without Supabase. `excludeUserId` removes the user
 * from the distinct set (re-seat flows).
 */
export function countDistinctCompanyScopedAppUsers(
  rows: ReadonlyArray<{ user_id: string | null }>,
  options?: { excludeUserId?: string }
): number {
  const distinct = new Set<string>();
  const exclude = options?.excludeUserId ? String(options.excludeUserId).trim() : "";
  for (const row of rows) {
    const uid = String(row.user_id ?? "").trim();
    if (!uid) continue;
    if (exclude && uid === exclude) continue;
    distinct.add(uid);
  }
  return distinct.size;
}

/**
 * Returns the single canonical assignable license (0 or 1 row) for the Users page.
 *
 * Precedence (matches `evaluateAppAccessGrant`):
 * - If the company-scoped license is eligible (active, unexpired, seats_total >= 1) AND its
 *   distinct-user pool has capacity → return the company-scoped license.
 * - Else if the event-scoped license is eligible AND its slice has capacity → return it.
 * - Else return null. Invalid/expired/full company rows do NOT block a valid event-scoped
 *   fallback, exactly like the canonical grant resolver.
 */
export function selectExhibitorAssignableLicense(
  input: SelectAssignableLicenseInput
): AssignableLicenseResult | null {
  const now = input.now ?? new Date();

  if (isLicenseEligible(input.companyScoped, now)) {
    const seatsTotal = Math.max(0, Number(input.companyScoped.seats_total ?? 0));
    if (input.companyScopedSeatsUsed < seatsTotal) {
      return toResult(input.companyScoped, input.companyScopedSeatsUsed);
    }
  }

  if (isLicenseEligible(input.eventScoped, now)) {
    const seatsTotal = Math.max(0, Number(input.eventScoped.seats_total ?? 0));
    if (input.eventScopedSeatsUsed < seatsTotal) {
      return toResult(input.eventScoped, input.eventScopedSeatsUsed);
    }
  }

  return null;
}
