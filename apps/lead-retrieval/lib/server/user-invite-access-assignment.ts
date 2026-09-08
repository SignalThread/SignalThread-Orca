import type { Json } from "@/types/database";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeUserInviteAccessConfig,
  requiresEventAccessMode,
  type InviteRoleKind,
  type NormalizedUserInviteAccessConfig,
  type UserInviteAccessConfigInput,
  type UserInviteAccessValidationError
} from "@/lib/access/user-invite-access-config";

type AdminClient = ReturnType<typeof createAdminClient>;

export type PersistUserInviteAccessInput = {
  supabase: AdminClient;
  userId: string;
  companyId: string;
  rawConfig: UserInviteAccessConfigInput;
  /** Permissions JSON for any event_users rows we create in assigned_events_only. */
  assignedEventPermissions?: Json;
  /** status for newly created assigned-event rows. Defaults to "invited". */
  assignedEventStatus?: "invited" | "active";
};

export type PersistUserInviteAccessResult =
  | { ok: true; config: NormalizedUserInviteAccessConfig; assignedEventsCreated: number }
  | { ok: false; error: string; code: UserInviteAccessValidationError["code"] | "DB_ERROR" };

type EventUsersInsertRow = {
  user_id: string;
  event_id: string;
  exhibitor_company_id: string;
  status: "invited" | "active";
  permissions: Json;
  created_at: string;
};

function uniqueTrimmed(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function loadEventIdsAssociatedWithCompany(input: {
  supabase: AdminClient;
  companyId: string;
  eventIds: string[];
}): Promise<{ ok: true; eventIds: string[] } | { ok: false; error: string }> {
  const eventIds = uniqueTrimmed(input.eventIds);
  if (eventIds.length === 0) {
    return { ok: true, eventIds: [] };
  }

  const [ownedEventsResult, exhibitorEventsResult] = await Promise.all([
    (input.supabase as any)
      .from("events")
      .select("id")
      .eq("company_id", input.companyId)
      .in("id", eventIds),
    (input.supabase as any)
      .from("exhibitors")
      .select("event_id")
      .eq("company_id", input.companyId)
      .in("event_id", eventIds)
  ]);

  if (ownedEventsResult.error) {
    return {
      ok: false,
      error: ownedEventsResult.error.message ?? "Failed loading company events."
    };
  }
  if (exhibitorEventsResult.error) {
    return {
      ok: false,
      error: exhibitorEventsResult.error.message ?? "Failed loading exhibitor event scope."
    };
  }

  return {
    ok: true,
    eventIds: uniqueTrimmed([
      ...((ownedEventsResult.data ?? []) as Array<{ id: string }>).map((row) => String(row.id)),
      ...((exhibitorEventsResult.data ?? []) as Array<{ event_id: string }>).map((row) =>
        String(row.event_id)
      )
    ])
  };
}

function permissionsMatch(input: { actual: unknown; expected: Json }): boolean {
  const actual = input.actual && typeof input.actual === "object"
    ? (input.actual as Record<string, unknown>)
    : {};
  const expected = input.expected && typeof input.expected === "object"
    ? (input.expected as Record<string, unknown>)
    : {};
  return Boolean(actual.app) === Boolean(expected.app) && Boolean(actual.admin) === Boolean(expected.admin);
}

/**
 * Apply a normalized user-invite access configuration to the `users` row and, for
 * `assigned_events_only`, to `event_users`.
 *
 * - Always writes `users.event_access_mode` when the role is company-scoped.
 * - For `all_company_events`: resolver derives broad access from events.company_id; if
 *   `assignedEventIds` is non-empty, still creates those `event_users` rows (optional bootstrap).
 * - For `assigned_events_only`: creates one `event_users` row per assigned event (scoped to
 *   `users.company_id`), skipping rows that already exist for this (user, event, company) triple.
 *
 * The resolver remains the only runtime authority; this function only persists the configuration
 * that the resolver consumes.
 */
export async function persistUserInviteAccessConfig(
  input: PersistUserInviteAccessInput
): Promise<PersistUserInviteAccessResult> {
  const { supabase, userId, companyId, rawConfig } = input;

  if (!userId || !companyId) {
    return { ok: false, error: "Missing user or company scope.", code: "DB_ERROR" };
  }

  const normalized = normalizeUserInviteAccessConfig(rawConfig);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error.message, code: normalized.error.code };
  }

  const config = normalized.config;

  if (config.assignedEventIds.length > 0) {
    const associated = await loadEventIdsAssociatedWithCompany({
      supabase,
      companyId,
      eventIds: config.assignedEventIds
    });
    if (!associated.ok) {
      return { ok: false, error: associated.error, code: "DB_ERROR" };
    }
    const associatedSet = new Set(associated.eventIds);
    const offending = config.assignedEventIds.filter((eventId) => !associatedSet.has(eventId));
    if (offending.length > 0) {
      return {
        ok: false,
        error: "Assigned events must be associated with the user's company.",
        code: "ASSIGNED_EVENTS_FOREIGN_COMPANY"
      };
    }
  }

  if (requiresEventAccessMode(config.role) && config.eventAccessMode) {
    const { error: updateError } = await (supabase as any)
      .from("users")
      .update({ event_access_mode: config.eventAccessMode })
      .eq("id", userId);
    if (updateError) {
      return {
        ok: false,
        error: updateError.message ?? "Failed updating event_access_mode.",
        code: "DB_ERROR"
      };
    }
  }

  let assignedEventsCreated = 0;
  if (config.assignedEventIds.length > 0) {
    const desiredStatus = input.assignedEventStatus ?? "invited";
    const desiredPermissions = (input.assignedEventPermissions ?? ({ admin: false, app: true } as Json));
    const { data: existingRows, error: existingError } = await (supabase as any)
      .from("event_users")
      .select("event_id")
      .eq("user_id", userId)
      .eq("exhibitor_company_id", companyId)
      .in("event_id", config.assignedEventIds);

    if (existingError) {
      return {
        ok: false,
        error: existingError.message ?? "Failed checking existing event memberships.",
        code: "DB_ERROR"
      };
    }

    const existing = new Set(
      ((existingRows ?? []) as Array<{ event_id: string }>).map((r) => String(r.event_id))
    );
    const existingEventIds = config.assignedEventIds.filter((id) => existing.has(id));
    if (existingEventIds.length > 0) {
      const { error: updateExistingError } = await (supabase as any)
        .from("event_users")
        .update({
          status: desiredStatus,
          permissions: desiredPermissions
        })
        .eq("user_id", userId)
        .eq("exhibitor_company_id", companyId)
        .in("event_id", existingEventIds);
      if (updateExistingError) {
        return {
          ok: false,
          error: updateExistingError.message ?? "Failed updating assigned event memberships.",
          code: "DB_ERROR"
        };
      }
    }

    const toInsert: EventUsersInsertRow[] = config.assignedEventIds
      .filter((id) => !existing.has(id))
      .map((id) => ({
        user_id: userId,
        event_id: id,
        exhibitor_company_id: companyId,
        status: desiredStatus,
        permissions: desiredPermissions,
        created_at: new Date().toISOString()
      }));

    if (toInsert.length > 0) {
      const { error: insertError } = await (supabase as any).from("event_users").insert(toInsert);
      if (insertError) {
        return {
          ok: false,
          error: insertError.message ?? "Failed creating assigned event memberships.",
          code: "DB_ERROR"
        };
      }
      assignedEventsCreated = toInsert.length;
    }

    const { data: verifyRows, error: verifyError } = await (supabase as any)
      .from("event_users")
      .select("event_id, exhibitor_company_id, status, permissions")
      .eq("user_id", userId)
      .eq("exhibitor_company_id", companyId)
      .in("event_id", config.assignedEventIds);

    if (verifyError) {
      return {
        ok: false,
        error: verifyError.message ?? "Failed verifying assigned event memberships.",
        code: "DB_ERROR"
      };
    }

    const verifiedByEventId = new Map(
      ((verifyRows ?? []) as Array<{
        event_id: string;
        exhibitor_company_id: string | null;
        status: string | null;
        permissions: unknown;
      }>).map((row) => [String(row.event_id), row])
    );
    const missingOrInvalid = config.assignedEventIds.filter((eventId) => {
      const row = verifiedByEventId.get(eventId);
      return (
        !row ||
        String(row.exhibitor_company_id ?? "").trim() !== companyId ||
        String(row.status ?? "").trim().toLowerCase() !== desiredStatus ||
        !permissionsMatch({ actual: row.permissions, expected: desiredPermissions })
      );
    });
    if (missingOrInvalid.length > 0) {
      return {
        ok: false,
        error: "Invite access verification failed for one or more selected events.",
        code: "DB_ERROR"
      };
    }
  }

  return { ok: true, config, assignedEventsCreated };
}

export type { InviteRoleKind };
