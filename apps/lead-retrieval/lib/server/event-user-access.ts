import "server-only";

/**
 * Canonical license / seat / app-access model (server-side)
 *
 * - **Event-scoped** (`licenses.scope = 'event'`): seat consumption = active `event_users` with
 *   `permissions.app === true` in the (event_id, exhibitor_company_id) slice.
 * - **Company-scoped** (`licenses.scope = 'company'`): seat consumption = **distinct** `user_id`
 *   among active `event_users` with `permissions.app === true` for that `exhibitor_company_id` (all events).
 * - `licenses.seats_used` is a derived cache — never use it to grant or deny app access.
 * - Precedence: use a **valid** company-scoped license (active, unexpired, `seats_total >= 1`, company
 *   pool not full) when present; otherwise fall back to **event-scoped** rules. Invalid/expired/full
 *   company rows do **not** block a valid event-scoped license.
 * - `users.license_id` is non-authoritative for access; do not use `license_plan_id` for entitlements.
 *
 * All app-access *grant* decisions must go through `evaluateAppAccessGrant`.
 */
import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  filterInvitedMembershipRowsForActivation,
  type InvitedMembershipActivationScope
} from "@/lib/server/invites/invite-auth-membership-activation";
import {
  countDistinctCompanyScopedAppUsers,
  selectExhibitorAssignableLicense,
  type AssignableLicenseCandidate,
  type AssignableLicenseResult
} from "@/lib/licenses/select-exhibitor-assignable-license";
import { selectLatestCompanyScopedLicense } from "@/lib/server/company-scoped-license-select";

const LICENSE_SCOPE_EVENT = "event" as const;
const LICENSE_SCOPE_COMPANY = "company" as const;

export type EventUserPermissions = {
  admin: boolean;
  app: boolean;
};

export type SeatEnforcementError =
  | "No available seats"
  | "Missing exhibitor company scope"
  | "No active license for this exhibitor";

type BackfillResult = {
  scanned: number;
  updated: number;
};

type ScopeBackfillResult = {
  scanned: number;
  updated: number;
  skipped: number;
};

type LicenseSeatRow = {
  id: string;
  seats_total: number | null;
  status: string | null;
  expires_at: string | null;
  created_at?: string | null;
};

type ActivationBlockedRow = {
  eventUserId: string;
  eventId: string;
  exhibitorCompanyId: string | null;
  error: SeatEnforcementError | string;
};

export type ActivationResult = {
  ok: boolean;
  error?: string;
  activated: number;
  blocked: ActivationBlockedRow[];
  permissions?: EventUserPermissions;
};

export type SeatCheckResult =
  | { ok: true; licenseId: string; seatsUsed: number; seatsTotal: number; seatsRemaining: number }
  | { ok: false; error: SeatEnforcementError };

const DEFAULT_PERMISSIONS: EventUserPermissions = {
  admin: false,
  app: false
};

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

function fromLegacyArray(value: unknown[]): EventUserPermissions {
  const lowered = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase());

  return {
    admin: lowered.includes("admin"),
    app: lowered.includes("app")
  };
}

export function normalizeEventUserPermissions(value: unknown): EventUserPermissions {
  if (Array.isArray(value)) {
    return fromLegacyArray(value);
  }

  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PERMISSIONS };
  }

  const record = value as Record<string, unknown>;
  return {
    admin: toBoolean(record.admin),
    app: toBoolean(record.app)
  };
}

export function toEventUserPermissionsJson(value: unknown): Json {
  return normalizeEventUserPermissions(value) as Json;
}

function permissionsNeedNormalization(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return true;
  }

  const record = value as Record<string, unknown>;
  return typeof record.admin !== "boolean" || typeof record.app !== "boolean";
}

/**
 * Active `event_users` with app permission for one (event_id, exhibitor_company_id) slice.
 * This is the seat consumption source of truth for **event-scoped** entitlements.
 */
async function countConsumedAppSeatsForEventSlice(input: {
  eventId: string;
  exhibitorCompanyId: string;
  excludeUserId?: string;
}) {
  const supabase = createAdminClient();
  let query = (supabase as any)
    .from("event_users")
    .select("id", { count: "exact", head: true })
    .eq("event_id", input.eventId)
    .eq("exhibitor_company_id", input.exhibitorCompanyId)
    .eq("status", "active")
    .filter("permissions->>app", "eq", "true");

  if (input.excludeUserId) {
    query = query.neq("user_id", input.excludeUserId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed counting consumed seats.");
  }

  return Number(count ?? 0);
}

/** Active app seats for the (event_id, exhibitor_company_id) slice (event-scoped entitlement consumption). */
export async function getSeatsUsed(input: {
  eventId: string;
  exhibitorCompanyId: string;
  excludeUserId?: string;
}) {
  return countConsumedAppSeatsForEventSlice(input);
}

/**
 * Company-scoped seat consumption: distinct active users with app permission for this exhibitor
 * company across all events. `excludeUserId` removes that user from the distinct set (re-seat flows).
 */
export async function countConsumedAppSeatsForCompanyScope(input: {
  exhibitorCompanyId: string;
  excludeUserId?: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("user_id")
    .eq("exhibitor_company_id", input.exhibitorCompanyId)
    .eq("status", "active")
    .filter("permissions->>app", "eq", "true");

  if (error) {
    throw new Error(error.message ?? "Failed counting company-scoped consumed seats.");
  }

  return countDistinctCompanyScopedAppUsers(
    (data ?? []) as Array<{ user_id: string | null }>,
    { excludeUserId: input.excludeUserId }
  );
}

async function loadLatestCompanyScopedLicenseForCompany(input: {
  supabase: ReturnType<typeof createAdminClient>;
  exhibitorCompanyId: string;
}) {
  const { data, error } = await (input.supabase as any)
    .from("licenses")
    .select("id, seats_total, status, expires_at")
    .eq("exhibitor_company_id", input.exhibitorCompanyId)
    .eq("scope", LICENSE_SCOPE_COMPANY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data as LicenseSeatRow | null, error };
}

type CompanyScopedSeatGrant = Extract<SeatCheckResult, { ok: true }>;

/**
 * If the latest `scope = 'company'` license is **eligible** (active, unexpired, `seats_total >= 1`,
 * company distinct-user pool not full), returns a successful seat check for that license.
 * Otherwise returns `null` so callers can fall back to event-scoped enforcement.
 */
async function resolveCompanyScopedSeatGrantIfApplicable(input: {
  exhibitorCompanyId: string;
  excludeUserId?: string;
}): Promise<CompanyScopedSeatGrant | null> {
  const supabase = createAdminClient();
  const { data: license, error } = await loadLatestCompanyScopedLicenseForCompany({
    supabase,
    exhibitorCompanyId: input.exhibitorCompanyId
  });

  if (error) {
    throw new Error(error.message ?? "Failed loading company-scoped license for seat enforcement.");
  }

  if (!license) {
    return null;
  }

  if (seatCheckForInactiveOrExpiredLicense(license)) {
    return null;
  }

  const seatsTotal = Math.max(0, Number(license.seats_total ?? 0));

  const seatsUsed = await countConsumedAppSeatsForCompanyScope({
    exhibitorCompanyId: input.exhibitorCompanyId,
    excludeUserId: input.excludeUserId
  });

  if (seatsUsed >= seatsTotal) {
    return null;
  }

  return {
    ok: true,
    licenseId: license.id,
    seatsUsed,
    seatsTotal,
    seatsRemaining: seatsTotal - seatsUsed
  };
}

async function loadLatestEventScopedLicenseForPair(input: {
  supabase: ReturnType<typeof createAdminClient>;
  eventId: string;
  exhibitorCompanyId: string;
}) {
  const { data, error } = await (input.supabase as any)
    .from("licenses")
    .select("id, seats_total, status, expires_at")
    .eq("event_id", input.eventId)
    .eq("exhibitor_company_id", input.exhibitorCompanyId)
    .eq("scope", LICENSE_SCOPE_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data as LicenseSeatRow | null, error };
}

function seatCheckForInactiveOrExpiredLicense(license: LicenseSeatRow): SeatCheckResult | null {
  if (String(license.status ?? "").toLowerCase() !== "active") {
    return { ok: false, error: "No active license for this exhibitor" };
  }

  if (license.expires_at) {
    const expiresAt = new Date(license.expires_at).getTime();
    if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
      return { ok: false, error: "No active license for this exhibitor" };
    }
  }

  const seatsTotal = Math.max(0, Number(license.seats_total ?? 0));
  if (seatsTotal < 1) {
    return { ok: false, error: "No available seats" };
  }

  return null;
}

/**
 * Event-scoped seat gate: latest `scope = 'event'` license for (event_id, exhibitor_company_id),
 * then live seat count for that event slice vs seats_total.
 */
async function evaluateEventScopedSeatAvailability(input: {
  eventId: string;
  exhibitorCompanyId: string;
  excludeUserId?: string;
}): Promise<SeatCheckResult> {
  const supabase = createAdminClient();
  const { data, error } = await loadLatestEventScopedLicenseForPair({
    supabase,
    eventId: input.eventId,
    exhibitorCompanyId: input.exhibitorCompanyId
  });

  if (error) {
    throw new Error(error.message ?? "Failed loading license for seat enforcement.");
  }

  const license = data;
  if (!license) {
    return { ok: false, error: "No active license for this exhibitor" };
  }

  const inactiveOrExpired = seatCheckForInactiveOrExpiredLicense(license);
  if (inactiveOrExpired) {
    return inactiveOrExpired;
  }

  const seatsTotal = Math.max(0, Number(license.seats_total ?? 0));

  const seatsUsed = await countConsumedAppSeatsForEventSlice({
    eventId: input.eventId,
    exhibitorCompanyId: input.exhibitorCompanyId,
    excludeUserId: input.excludeUserId
  });

  if (seatsUsed >= seatsTotal) {
    return { ok: false, error: "No available seats" };
  }

  return {
    ok: true,
    licenseId: license.id,
    seatsUsed,
    seatsTotal,
    seatsRemaining: seatsTotal - seatsUsed
  };
}

async function loadLatestEventScopedLicenseIdForPair(input: {
  supabase: ReturnType<typeof createAdminClient>;
  eventId: string;
  exhibitorCompanyId: string;
}) {
  const { data, error } = await (input.supabase as any)
    .from("licenses")
    .select("id")
    .eq("event_id", input.eventId)
    .eq("exhibitor_company_id", input.exhibitorCompanyId)
    .eq("scope", LICENSE_SCOPE_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

/**
 * Writes `seats_used` on the **event-scoped** license for (event_id, exhibitor_company_id) from live
 * `event_users` counts for that slice. Ignores `scope = 'company'` rows.
 */
export async function reconcileLicenseSeatsUsed(input: {
  eventId: string;
  exhibitorCompanyId: string;
}) {
  const eventId = String(input.eventId ?? "").trim();
  const exhibitorCompanyId = String(input.exhibitorCompanyId ?? "").trim();
  if (!eventId || !exhibitorCompanyId) {
    throw new Error("Missing exhibitor company scope");
  }

  const supabase = createAdminClient();
  const seatsUsed = await countConsumedAppSeatsForEventSlice({ eventId, exhibitorCompanyId });

  const { data: licenseRow, error: licenseLookupError } = await loadLatestEventScopedLicenseIdForPair({
    supabase,
    eventId,
    exhibitorCompanyId
  });

  if (licenseLookupError) {
    throw new Error(licenseLookupError.message ?? "Failed loading license for seat reconciliation.");
  }

  if (!licenseRow?.id) {
    await reconcileCompanyLicenseSeatsUsed({ exhibitorCompanyId }).catch(() => {});
    return { licenseId: "", seatsUsed };
  }

  const { error: updateError } = await (supabase as any)
    .from("licenses")
    .update({ seats_used: seatsUsed })
    .eq("id", String(licenseRow.id));

  if (updateError) {
    throw new Error(updateError.message ?? "Failed updating license seats_used.");
  }

  await reconcileCompanyLicenseSeatsUsed({ exhibitorCompanyId }).catch(() => {});

  return { licenseId: String(licenseRow.id), seatsUsed };
}

/**
 * Writes `seats_used` on the **company-scoped** license for `exhibitor_company_id` from distinct-user
 * app seat counts. Does not touch event-scoped license rows.
 */
export async function reconcileCompanyLicenseSeatsUsed(input: { exhibitorCompanyId: string }) {
  const exhibitorCompanyId = String(input.exhibitorCompanyId ?? "").trim();
  if (!exhibitorCompanyId) {
    throw new Error("Missing exhibitor company scope");
  }

  const supabase = createAdminClient();
  const seatsUsed = await countConsumedAppSeatsForCompanyScope({ exhibitorCompanyId });

  const { data: licenseRow, error: licenseLookupError } = await selectLatestCompanyScopedLicense(
    supabase,
    exhibitorCompanyId,
    "id"
  );

  if (licenseLookupError) {
    throw new Error(licenseLookupError.message ?? "Failed loading company-scoped license for seat reconciliation.");
  }

  if (!licenseRow?.id) {
    return { licenseId: "", seatsUsed };
  }

  const { error: updateError } = await (supabase as any)
    .from("licenses")
    .update({ seats_used: seatsUsed })
    .eq("id", String(licenseRow.id));

  if (updateError) {
    throw new Error(updateError.message ?? "Failed updating company license seats_used.");
  }

  return { licenseId: String(licenseRow.id), seatsUsed };
}

/**
 * Low-level seat-capacity check for app access. Prefer `evaluateAppAccessGrant` for all grant
 * decisions so non-app flows never hit seat math.
 *
 * Resolves **company-scoped** license first, then **event-scoped** (same order as `evaluateAppAccessGrant`).
 */
export type AppAccessGrantEvaluationInput = {
  eventId: string | null;
  exhibitorCompanyId: string | null;
  /** When false, no seat/license capacity check runs (organizer non-app invite, exhibitor no_app, etc.). */
  requestedAppAccess: boolean;
  excludeUserId?: string;
};

export type AppAccessGrantResult =
  | {
      ok: true;
      decision: "no_app_access_requested";
    }
  | {
      ok: true;
      decision: "seats_available";
      licenseId: string;
      seatsUsed: number;
      seatsTotal: number;
      seatsRemaining: number;
    }
  | { ok: false; decision: "denied"; error: SeatEnforcementError };

/**
 * Single canonical entry point for whether an operation may grant exhibitor app access for a scope.
 * Returns structured outcomes — do not branch on `users.license_id` or `licenses.seats_used`.
 *
 * **Precedence:** Valid company-scoped license first; if none applies (missing, invalid, expired, or
 * full pool), fall back to event-scoped license for `(eventId, exhibitor_company_id)`.
 */
export async function evaluateAppAccessGrant(
  input: AppAccessGrantEvaluationInput
): Promise<AppAccessGrantResult> {
  if (!input.requestedAppAccess) {
    return { ok: true, decision: "no_app_access_requested" };
  }

  if (!input.exhibitorCompanyId) {
    return { ok: false, decision: "denied", error: "Missing exhibitor company scope" };
  }

  const companyGrant = await resolveCompanyScopedSeatGrantIfApplicable({
    exhibitorCompanyId: input.exhibitorCompanyId,
    excludeUserId: input.excludeUserId
  });

  if (companyGrant !== null) {
    return {
      ok: true,
      decision: "seats_available",
      licenseId: companyGrant.licenseId,
      seatsUsed: companyGrant.seatsUsed,
      seatsTotal: companyGrant.seatsTotal,
      seatsRemaining: companyGrant.seatsRemaining
    };
  }

  const eventId = String(input.eventId ?? "").trim();
  if (!eventId) {
    return {
      ok: false,
      decision: "denied",
      error: "No active license for this exhibitor"
    };
  }

  const seat = await evaluateEventScopedSeatAvailability({
    eventId,
    exhibitorCompanyId: input.exhibitorCompanyId,
    excludeUserId: input.excludeUserId
  });

  if (!seat.ok) {
    return { ok: false, decision: "denied", error: seat.error };
  }

  return {
    ok: true,
    decision: "seats_available",
    licenseId: seat.licenseId,
    seatsUsed: seat.seatsUsed,
    seatsTotal: seat.seatsTotal,
    seatsRemaining: seat.seatsRemaining
  };
}

/**
 * Canonical resolver for the exhibitor Users page license selector. Returns the single license
 * row (if any) that `evaluateAppAccessGrant` would select for a hypothetical app-access invite
 * from this exhibitor company, along with live seat counts (distinct-user pool for company
 * scope, event slice count for event scope).
 *
 * Contract:
 * - `eventId` may be `null` — a company-scoped license is still resolvable.
 * - Returns `[]` if no valid license applies (no row, inactive/expired, or full pool with no
 *   eligible event-scoped fallback).
 * - Returns at most one row. The `id` is the canonical license id — it matches what
 *   `evaluateAppAccessGrant` returns and therefore passes the `licenseId` equality check on
 *   the exhibitor users PATCH endpoint.
 */
export async function resolveExhibitorAssignableLicenses(input: {
  exhibitorCompanyId: string;
  eventId: string | null;
}): Promise<AssignableLicenseResult[]> {
  const exhibitorCompanyId = String(input.exhibitorCompanyId ?? "").trim();
  if (!exhibitorCompanyId) return [];

  const eventId = input.eventId ? String(input.eventId).trim() || null : null;
  const supabase = createAdminClient();

  const companyPromise = selectLatestCompanyScopedLicense(
    supabase,
    exhibitorCompanyId,
    "id, event_id, exhibitor_company_id, seats_total, status, expires_at, created_at"
  );

  const eventPromise = eventId
    ? (supabase as any)
        .from("licenses")
        .select("id, event_id, exhibitor_company_id, seats_total, status, expires_at, created_at")
        .eq("exhibitor_company_id", exhibitorCompanyId)
        .eq("event_id", eventId)
        .eq("scope", LICENSE_SCOPE_EVENT)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [companyRes, eventRes] = await Promise.all([companyPromise, eventPromise]);

  if (companyRes.error) {
    throw new Error(
      companyRes.error.message ?? "Failed loading company-scoped license for assignable lookup."
    );
  }
  if (eventRes.error) {
    throw new Error(
      eventRes.error.message ?? "Failed loading event-scoped license for assignable lookup."
    );
  }

  const companyScoped = companyRes.data
    ? ({
        id: String(companyRes.data.id),
        scope: "company",
        event_id: null,
        exhibitor_company_id: exhibitorCompanyId,
        seats_total: Number(companyRes.data.seats_total ?? 0),
        status: companyRes.data.status ?? null,
        expires_at: companyRes.data.expires_at ?? null
      } satisfies AssignableLicenseCandidate)
    : null;

  const eventScoped =
    eventRes.data && eventId
      ? ({
          id: String(eventRes.data.id),
          scope: "event",
          event_id: eventId,
          exhibitor_company_id: exhibitorCompanyId,
          seats_total: Number(eventRes.data.seats_total ?? 0),
          status: eventRes.data.status ?? null,
          expires_at: eventRes.data.expires_at ?? null
        } satisfies AssignableLicenseCandidate)
      : null;

  const [companySeatsUsed, eventSeatsUsed] = await Promise.all([
    companyScoped
      ? countConsumedAppSeatsForCompanyScope({ exhibitorCompanyId })
      : Promise.resolve(0),
    eventScoped && eventId
      ? countConsumedAppSeatsForEventSlice({ eventId, exhibitorCompanyId })
      : Promise.resolve(0)
  ]);

  const selected = selectExhibitorAssignableLicense({
    companyScoped,
    companyScopedSeatsUsed: companySeatsUsed,
    eventScoped,
    eventScopedSeatsUsed: eventSeatsUsed
  });

  return selected ? [selected] : [];
}

export async function enforceSeatAvailability(input: {
  eventId: string;
  exhibitorCompanyId: string | null;
  excludeUserId?: string;
}): Promise<SeatCheckResult> {
  if (!input.exhibitorCompanyId) {
    return { ok: false, error: "Missing exhibitor company scope" };
  }

  const companyGrant = await resolveCompanyScopedSeatGrantIfApplicable({
    exhibitorCompanyId: input.exhibitorCompanyId,
    excludeUserId: input.excludeUserId
  });

  if (companyGrant !== null) {
    return companyGrant;
  }

  return evaluateEventScopedSeatAvailability({
    eventId: input.eventId,
    exhibitorCompanyId: input.exhibitorCompanyId,
    excludeUserId: input.excludeUserId
  });
}

export async function activateInvitedMembershipsWithSeatEnforcement(
  userId: string,
  scope?: InvitedMembershipActivationScope | null
): Promise<ActivationResult> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("id, event_id, exhibitor_company_id, status, permissions, created_at")
    .eq("user_id", userId)
    .eq("status", "invited")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed loading invited memberships.");
  }

  const invitedRows = (data ?? []) as Array<{
    id: string;
    event_id: string;
    exhibitor_company_id: string | null;
    status: string;
    permissions: unknown;
    created_at: string;
  }>;
  const rows = filterInvitedMembershipRowsForActivation(invitedRows, scope);

  const blocked: ActivationBlockedRow[] = [];
  let activated = 0;
  const reconcileScopes = new Set<string>();

  for (const row of rows) {
    const permissions = normalizeEventUserPermissions(row.permissions);

    if (permissions.app) {
      const grant = await evaluateAppAccessGrant({
        eventId: row.event_id,
        exhibitorCompanyId: row.exhibitor_company_id,
        requestedAppAccess: true
      });
      if (!grant.ok) {
        blocked.push({
          eventUserId: row.id,
          eventId: row.event_id,
          exhibitorCompanyId: row.exhibitor_company_id,
          error: grant.error
        });
        continue;
      }
    }

    const { error: updateError, data: updated } = await (supabase as any)
      .from("event_users")
      .update({
        status: "active",
        permissions: toEventUserPermissionsJson(permissions)
      })
      .eq("id", row.id)
      .eq("status", "invited")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      blocked.push({
        eventUserId: row.id,
        eventId: row.event_id,
        exhibitorCompanyId: row.exhibitor_company_id,
        error: updateError?.message ?? "Failed activating membership"
      });
      continue;
    }

    activated += 1;
    if (permissions.app && row.exhibitor_company_id) {
      reconcileScopes.add(`${row.event_id}::${row.exhibitor_company_id}`);
    }
  }

  for (const scope of reconcileScopes) {
    const [eventId, exhibitorCompanyId] = scope.split("::");
    if (!eventId || !exhibitorCompanyId) continue;
    await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId });
  }

  return {
    ok: blocked.length === 0,
    activated,
    blocked,
    error: blocked.length > 0 ? blocked[0]?.error : undefined
  };
}

export async function activateInvitedMembershipWithSeatEnforcement(input: {
  userId: string;
  eventId: string;
  exhibitorCompanyId: string;
}): Promise<ActivationResult> {
  const userId = String(input.userId ?? "").trim();
  const eventId = String(input.eventId ?? "").trim();
  const exhibitorCompanyId = String(input.exhibitorCompanyId ?? "").trim();

  if (!userId || !eventId || !exhibitorCompanyId) {
    return {
      ok: false,
      error: "Missing invite scope",
      activated: 0,
      blocked: []
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("id, event_id, exhibitor_company_id, status, permissions, created_at")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed loading invited membership.");
  }

  if (!data?.id) {
    return {
      ok: false,
      error: "No invited membership",
      activated: 0,
      blocked: []
    };
  }

  const permissions = normalizeEventUserPermissions(data.permissions);
  const status = String(data.status ?? "").toLowerCase();
  if (status === "active") {
    return {
      ok: true,
      activated: 0,
      blocked: [],
      permissions
    };
  }

  if (status !== "invited") {
    return {
      ok: false,
      error: "No invited membership",
      activated: 0,
      blocked: []
    };
  }

  if (permissions.app) {
    const grant = await evaluateAppAccessGrant({
      eventId,
      exhibitorCompanyId,
      requestedAppAccess: true
    });
    if (!grant.ok) {
      return {
        ok: false,
        error: grant.error,
        activated: 0,
        blocked: [
          {
            eventUserId: String(data.id),
            eventId,
            exhibitorCompanyId,
            error: grant.error
          }
        ]
      };
    }
  }

  const { error: updateError, data: updated } = await (supabase as any)
    .from("event_users")
    .update({
      status: "active",
      permissions: toEventUserPermissionsJson(permissions)
    })
    .eq("id", data.id)
    .eq("status", "invited")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    const updateMessage = updateError?.message ?? "Failed activating membership.";
    return {
      ok: false,
      error: updateMessage,
      activated: 0,
      blocked: [
        {
          eventUserId: String(data.id),
          eventId,
          exhibitorCompanyId,
          error: updateMessage
        }
      ]
    };
  }

  if (permissions.app) {
    await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId });
  }

  return {
    ok: true,
    activated: 1,
    blocked: [],
    permissions
  };
}

export async function backfillEventUserPermissionsShape(options?: {
  eventId?: string;
  dryRun?: boolean;
  limit?: number;
}): Promise<BackfillResult> {
  const dryRun = options?.dryRun ?? true;
  const limit = options?.limit ?? 1000;
  const supabase = createAdminClient();

  let query = (supabase as any).from("event_users").select("id, permissions").limit(limit);
  if (options?.eventId) {
    query = query.eq("event_id", options.eventId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed loading event user permissions for backfill.");
  }

  const rows = (data ?? []) as Array<{ id: string; permissions: unknown }>;
  const toUpdate = rows.filter((row) => permissionsNeedNormalization(row.permissions));

  if (dryRun || toUpdate.length === 0) {
    return { scanned: rows.length, updated: 0 };
  }

  for (const row of toUpdate) {
    const normalized = normalizeEventUserPermissions(row.permissions);
    const { error: updateError } = await (supabase as any)
      .from("event_users")
      .update({ permissions: normalized })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message ?? "Failed normalizing event user permissions.");
    }
  }

  return { scanned: rows.length, updated: toUpdate.length };
}

export async function backfillEventUsersMissingExhibitorScope(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<ScopeBackfillResult> {
  const dryRun = options?.dryRun ?? true;
  const limit = Math.max(1, Number(options?.limit ?? 1000));
  const supabase = createAdminClient();

  const { data: eventUsers, error: eventUsersError } = await (supabase as any)
    .from("event_users")
    .select("id, user_id, event_id, exhibitor_company_id")
    .is("exhibitor_company_id", null)
    .limit(limit);

  if (eventUsersError) {
    throw new Error(eventUsersError.message ?? "Failed loading event_users rows for scope backfill.");
  }

  const rows = (eventUsers ?? []) as Array<{
    id: string;
    user_id: string;
    event_id: string;
    exhibitor_company_id: string | null;
  }>;

  if (rows.length === 0) {
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  const userIds = Array.from(new Set(rows.map((row) => String(row.user_id ?? "").trim()).filter(Boolean)));
  if (userIds.length === 0) {
    return { scanned: rows.length, updated: 0, skipped: rows.length };
  }

  const { data: usersData, error: usersError } = await (supabase as any)
    .from("users")
    .select("id, role, company_id")
    .in("id", userIds);

  if (usersError) {
    throw new Error(usersError.message ?? "Failed loading users rows for scope backfill.");
  }

  const usersById = new Map(
    ((usersData ?? []) as Array<{ id: string; role: string | null; company_id: string | null }>).map((row) => [
      String(row.id),
      row
    ])
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const user = usersById.get(String(row.user_id));
    const role = String(user?.role ?? "").trim().toLowerCase();
    const companyId = String(user?.company_id ?? "").trim();

    if (role !== "exhibitor_admin" || !companyId) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    const { error: updateError, data: updatedRow } = await (supabase as any)
      .from("event_users")
      .update({ exhibitor_company_id: companyId })
      .eq("id", row.id)
      .is("exhibitor_company_id", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message ?? "Failed updating event_users exhibitor scope.");
    }

    if (updatedRow?.id) {
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  return { scanned: rows.length, updated, skipped };
}
