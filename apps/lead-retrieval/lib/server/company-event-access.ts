import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess } from "@/lib/licenses/exhibitor-company-license-admin-eligibility";
import {
  computeCompanyEventAccessSet,
  normalizeEventAccessMode,
  parseEventAccessModeColumn,
  pickValidatedEventIdForAccess,
  type EventAccessMode,
  type EventAccessResolution
} from "@/lib/access/event-access-mode";
import {
  resolveAccessibleEventIdsForUserWithDeps,
  type ResolveAccessibleEventIdsDeps,
  type ResolveAccessibleEventIdsInput,
  type ResolveAccessibleEventIdsResult
} from "@/lib/server/company-event-access-core";
import { eventMembershipGrantsAppOrAdminSurface } from "@/lib/exhibitor/event-app-permission-enabled";
import { selectLatestCompanyScopedLicense } from "@/lib/server/company-scoped-license-select";
import { getValidatedPlatformAdminAccountContext } from "@/lib/server/platform-admin-account-context";

export type {
  ResolveAccessibleEventIdsInput,
  ResolveAccessibleEventIdsResult,
  ResolveAccessibleEventIdsDeps
} from "@/lib/server/company-event-access-core";

export class EventAccessDeniedError extends Error {
  readonly code = "EVENT_ACCESS_DENIED" as const;
  readonly userId: string;
  readonly eventId: string;
  readonly resolution: EventAccessResolution;

  constructor(params: { userId: string; eventId: string; resolution: EventAccessResolution }) {
    super("Event is not accessible to this user.");
    this.name = "EventAccessDeniedError";
    this.userId = params.userId;
    this.eventId = params.eventId;
    this.resolution = params.resolution;
  }
}

function dedupeStringIds(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Active `event_users` rows only; requires {@link eventMembershipGrantsAppOrAdminSurface} on the row.
 */
function filterExhibitorMembershipEventIdsByRole(
  rows: Array<{ event_id: string | null; permissions: unknown }>,
  _appRole: string | null
): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const eid = r.event_id ? String(r.event_id).trim() : "";
    if (!eid) continue;
    if (!eventMembershipGrantsAppOrAdminSurface(r.permissions)) continue;
    out.push(eid);
  }
  return dedupeStringIds(out);
}

async function loadExhibitorMembershipEventIds(
  userId: string,
  exhibitorCompanyId: string,
  appRole: string | null
): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_users")
    .select("event_id, permissions")
    .eq("user_id", userId)
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message ?? "Failed loading event membership for user.");
  }

  return filterExhibitorMembershipEventIdsByRole(
    (data ?? []) as Array<{ event_id: string | null; permissions: unknown }>,
    appRole
  );
}

/** Active `event_users` rows with app/admin surface entitlements (resolver + Settings pickers). */
export async function loadActiveEntitledMembershipEventIdsForExhibitorUser(
  userId: string,
  exhibitorCompanyId: string
): Promise<string[]> {
  return loadExhibitorMembershipEventIds(userId, exhibitorCompanyId, null);
}

function buildDefaultDeps(): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async (userId) => {
      const supabase = createAdminClient();
      const { data, error } = await (supabase as any)
        .from("users")
        .select("id, role, company_id, event_access_mode")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message ?? "Failed loading user for access resolution.");
      }

      const row = data as
        | { id: string; role: string | null; company_id: string | null; event_access_mode: string | null }
        | null;
      return row
        ? {
            id: row.id,
            role: row.role ?? null,
            companyId: row.company_id ?? null,
            eventAccessMode: parseEventAccessModeColumn(row.event_access_mode)
          }
        : null;
    },
    loadCompanyLicenseEligibility: async (exhibitorCompanyId, nowMs) => {
      const supabase = createAdminClient();
      const { data, error } = await selectLatestCompanyScopedLicense(
        supabase,
        exhibitorCompanyId,
        "scope, status, expires_at, starts_at"
      );

      if (error) {
        throw new Error(error.message ?? "Failed loading company license for access resolution.");
      }

      return isEligibleExhibitorCompanyLicenseForAdminMultiEventAccess(
        data as {
          scope: string | null;
          status: string | null;
          expires_at: string | null;
          starts_at: string | null;
        } | null,
        nowMs
      );
    },
    /**
     * All company-owned events (any lifecycle / `is_active`); direct-buyer “see upcoming”
     * surfaces rely on this list not being filtered to currently-active only.
     */
    loadCompanyOwnedEventIds: async (exhibitorCompanyId) => {
      const supabase = createAdminClient();
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id")
        .eq("company_id", exhibitorCompanyId);

      if (error) {
        throw new Error(error.message ?? "Failed loading company events.");
      }

      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    },
    loadAssignedCompanyEventIds: async (userId, exhibitorCompanyId, appRole) =>
      loadExhibitorMembershipEventIds(userId, exhibitorCompanyId, appRole),
    loadLegacyEventIds: async (userId, exhibitorCompanyId, appRole) =>
      loadExhibitorMembershipEventIds(userId, exhibitorCompanyId, appRole),
    loadOrganizerEventIds: async (organizerUserId) => {
      const scope = await getOrganizerScope(organizerUserId);
      return scope.events.map((e) => e.id);
    }
  };
}

/**
 * Canonical server-side resolver for a user's accessible events. Shared by admin and (later) mobile.
 *
 *   platform_admin     → { resolution: "platform_all", eventIds: [] }
 *                        (existing platform surfaces list events separately)
 *   organizer_admin    → { resolution: "organizer_scope", eventIds: organizer scope events }
 *   exhibitor / other  → company-scoped rule (see computeCompanyEventAccessSet):
 *                         * eligible license + all_company_events → all events.company_id matches
 *                         * eligible license + assigned_events_only → only event_users rows
 *                         * no eligible license → legacy event_users membership only
 *
 * Never trusts client input; `role` alone never decides the event list.
 */
export async function resolveAccessibleEventIdsForUser(
  input: ResolveAccessibleEventIdsInput
): Promise<ResolveAccessibleEventIdsResult> {
  const deps = buildDefaultDeps();
  const loadedUser = await deps.loadUser(input.userId);
  const accountContext =
    loadedUser?.role === "platform_admin"
      ? await getValidatedPlatformAdminAccountContext({
          userId: input.userId,
          role: "platform_admin"
        })
      : null;
  const result = await resolveAccessibleEventIdsForUserWithDeps(
    {
      ...input,
      // Only this server wrapper may project the cookie into the pure resolver.
      platformAdminCompanyId: accountContext?.companyId ?? null
    },
    { ...deps, loadUser: async () => loadedUser }
  );
  if (process.env.DEBUG_ACTIVE_EVENT_RESOLUTION === "1") {
    console.info(
      "[DEBUG_ACTIVE_EVENT_RESOLUTION]",
      JSON.stringify({
        stage: "resolveAccessibleEventIdsForUser",
        userId: input.userId,
        resolution: result.resolution,
        eventIds: result.eventIds,
        licenseEligible: result.licenseEligible,
        eventAccessMode: result.eventAccessMode,
        companyId: result.companyId,
        role: result.role
      })
    );
  }
  return result;
}

/**
 * Single choke point for server reads/writes that accept an eventId.
 * Platform admins pass through (preserving existing behavior in this prompt).
 */
export async function assertEventIdAccessibleForUser(
  userId: string,
  eventId: string,
  options?: { nowMs?: number }
): Promise<{ resolution: EventAccessResolution }> {
  const result = await resolveAccessibleEventIdsForUser({ userId, nowMs: options?.nowMs });
  if (result.resolution === "platform_all") {
    return { resolution: result.resolution };
  }
  if (!result.eventIds.includes(eventId)) {
    throw new EventAccessDeniedError({ userId, eventId, resolution: result.resolution });
  }
  return { resolution: result.resolution };
}

/**
 * Validate a preferred/cookie-selected event id against the accessible set and return a safe choice.
 * Server-authoritative; never trusts the preferred value.
 */
export async function resolveValidatedActiveEventIdForUser(
  userId: string,
  preferredEventId: string | null | undefined,
  options?: { nowMs?: number }
): Promise<{ eventId: string | null; resolution: EventAccessResolution }> {
  const result = await resolveAccessibleEventIdsForUser({ userId, nowMs: options?.nowMs });
  if (result.resolution === "platform_all") {
    const preferred = String(preferredEventId ?? "").trim();
    const eventId = preferred || null;
    if (process.env.DEBUG_ACTIVE_EVENT_RESOLUTION === "1") {
      console.info(
        "[DEBUG_ACTIVE_EVENT_RESOLUTION]",
        JSON.stringify({
          stage: "resolveValidatedActiveEventIdForUser",
          userId,
          preferredEventId: preferredEventId ?? null,
          resolution: result.resolution,
          resolvedEventId: eventId,
          branch: "platform_all"
        })
      );
    }
    return { eventId, resolution: result.resolution };
  }

  const preferredNorm = String(preferredEventId ?? "").trim();
  const eventId = pickValidatedEventIdForAccess(result.eventIds, preferredEventId);
  if (process.env.DEBUG_ACTIVE_EVENT_RESOLUTION === "1") {
    let branch = "fallback_first_accessible";
    if (result.eventIds.length === 0) {
      branch = "no_accessible_events";
    } else if (preferredNorm && result.eventIds.includes(preferredNorm)) {
      branch = "preferred_in_accessible_set";
    } else if (preferredNorm) {
      branch = "preferred_outside_set_use_first_accessible";
    } else {
      branch = "no_preferred_use_first_accessible";
    }
    console.info(
      "[DEBUG_ACTIVE_EVENT_RESOLUTION]",
      JSON.stringify({
        stage: "resolveValidatedActiveEventIdForUser",
        userId,
        preferredEventId: preferredEventId ?? null,
        resolution: result.resolution,
        accessibleEventIds: result.eventIds,
        resolvedEventId: eventId,
        branch
      })
    );
  }
  return {
    eventId,
    resolution: result.resolution
  };
}

export { computeCompanyEventAccessSet, normalizeEventAccessMode };
export type { EventAccessMode, EventAccessResolution };
