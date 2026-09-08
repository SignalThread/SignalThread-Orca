/**
 * Pure planner for app-invite redemption side effects.
 *
 * Given a redeemed `invite_codes` row and the full set of currently pending
 * (unused, unexpired) rows for the same (email, exhibitor_company_id), return
 * a deterministic plan the route handlers can apply:
 *
 *   - {@link PlannedRedeem.role}             — `public.users.role` to persist
 *                                              (`exhibitor_admin` or `exhibitor_viewer` from invite
 *                                              `permissions`; see {@link publicUsersRoleFromInvitePermissions}).
 *   - {@link PlannedRedeem.userEventAccessMode}
 *                                            — `public.users.event_access_mode`
 *                                              to persist (mirrors the admin
 *                                              intent recorded on the invite).
 *   - {@link PlannedRedeem.grantEventIds}    — every `events.id` that must have
 *                                              an active `event_users` row for
 *                                              the user. For `all_company_events`
 *                                              this is the union of all pending
 *                                              invite rows; for
 *                                              `assigned_events_only` it's just
 *                                              the redeemed invite's event.
 *   - {@link PlannedRedeem.consumeInviteIds} — every `invite_codes.id` that must
 *                                              be marked used (`used_at`,
 *                                              `used_by_user_id`) atomically.
 *
 * Access is still governed by the canonical resolver
 * (`resolveAccessibleEventIdsForUser`). With an eligible company-scoped
 * license, `all_company_events` resolves from `events.company_id`; without one,
 * the legacy fallback reads the same `event_users` rows this plan produces —
 * so both paths converge on the admin's intent without creating a parallel
 * access model.
 */

import type { EventAccessMode } from "@/lib/access/event-access-mode";
import { normalizeEventAccessMode } from "@/lib/access/event-access-mode";
import {
  publicUsersRoleFromInvitePermissions,
  type InviteRedeemPublicUsersRole
} from "@/lib/server/invites/invite-permissions-public-users-role";

/**
 * Thrown when the plan would grant zero events (e.g. empty `event_id` after trim, or
 * no resolvable `event_id` in `all_company_events`). Routes must not consume invites.
 */
export class InviteRedeemNoEventsError extends Error {
  constructor(
    message = "This invite is missing a valid event assignment and cannot be redeemed."
  ) {
    super(message);
    this.name = "InviteRedeemNoEventsError";
  }
}

export type InviteRedeemPermissions = {
  admin: boolean;
  app: boolean;
};

export type InviteRedeemInviteRow = {
  id: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  email: string;
  permissions: unknown;
  event_access_mode: string | null;
};

export type InviteRedeemPendingRow = {
  id: string;
  event_id: string | null;
};

export type PlannedRedeemRole = InviteRedeemPublicUsersRole;

export type PlannedRedeem = {
  role: PlannedRedeemRole;
  userEventAccessMode: EventAccessMode;
  permissions: InviteRedeemPermissions;
  grantEventIds: string[];
  consumeInviteIds: string[];
};

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

export function normalizePermissions(value: unknown): InviteRedeemPermissions {
  if (Array.isArray(value)) {
    const lowered = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase());
    return {
      admin: lowered.includes("admin"),
      app: lowered.includes("app")
    };
  }
  if (!value || typeof value !== "object") {
    return { admin: false, app: false };
  }
  const record = value as Record<string, unknown>;
  return {
    admin: toBoolean(record.admin),
    app: toBoolean(record.app)
  };
}

/**
 * @deprecated Prefer {@link publicUsersRoleFromInvitePermissions} — single canonical mapper.
 */
export function roleForPermissions(permissions: InviteRedeemPermissions): PlannedRedeemRole {
  return publicUsersRoleFromInvitePermissions(permissions);
}

/** Unique, order-preserving string set. */
function dedupe(values: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Build the full redemption plan.
 *
 * The caller is responsible for loading `pendingRowsSameEmailAndCompany` with
 * `used_at IS NULL` and `expires_at > now()` filters already applied. The
 * redeemed row itself MAY or may not be in that list — the planner is
 * idempotent either way.
 */
export function planInviteRedeem(input: {
  inviteRow: InviteRedeemInviteRow;
  pendingRowsSameEmailAndCompany: ReadonlyArray<InviteRedeemPendingRow>;
}): PlannedRedeem {
  const permissions = normalizePermissions(input.inviteRow.permissions);
  const role = publicUsersRoleFromInvitePermissions(permissions);
  const invitedEventId = String(input.inviteRow.event_id ?? "").trim();
  const userEventAccessMode: EventAccessMode = normalizeEventAccessMode(
    input.inviteRow.event_access_mode
  );

  if (userEventAccessMode === "all_company_events") {
    const grantEventIds = dedupe([
      invitedEventId,
      ...input.pendingRowsSameEmailAndCompany.map((r) => r.event_id ?? null)
    ]);
    const consumeInviteIds = dedupe([
      String(input.inviteRow.id ?? ""),
      ...input.pendingRowsSameEmailAndCompany.map((r) => r.id)
    ]);
    const planned: PlannedRedeem = {
      role,
      userEventAccessMode,
      permissions,
      grantEventIds,
      consumeInviteIds
    };
    if (planned.grantEventIds.length === 0) {
      throw new InviteRedeemNoEventsError();
    }
    return planned;
  }

  const grantEventIds = invitedEventId ? [invitedEventId] : [];
  const planned: PlannedRedeem = {
    role,
    userEventAccessMode: "assigned_events_only",
    permissions,
    grantEventIds,
    consumeInviteIds: [String(input.inviteRow.id ?? "")].filter(Boolean)
  };
  if (planned.grantEventIds.length === 0) {
    throw new InviteRedeemNoEventsError();
  }
  return planned;
}

/**
 * For `all_company_events`, the planner only unions the redeemed invite + pending
 * invite rows' `event_id` values. Routes must also load every `events.id` for
 * `events.company_id = exhibitor company` and grant membership for that full set.
 * Union preserves invite event ids that might not yet appear in `events` (safety).
 */
export function expandGrantEventIdsForAllCompanyEventsMode(input: {
  userEventAccessMode: EventAccessMode;
  planGrantEventIds: string[];
  companyOwnedEventIds: string[];
}): string[] {
  if (input.userEventAccessMode !== "all_company_events") {
    return input.planGrantEventIds;
  }
  const union = dedupe([...input.companyOwnedEventIds, ...input.planGrantEventIds]);
  if (union.length === 0) {
    throw new InviteRedeemNoEventsError();
  }
  return union;
}
