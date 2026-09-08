/**
 * Pure validation for user creation / invite flows.
 *
 * The resolver (`lib/server/company-event-access.ts`) remains the sole runtime authority for event
 * access. This module only validates the user-provided configuration *at create/invite time* so the
 * persisted state feeds the resolver cleanly:
 *
 *   users.role              — capability class (admin vs exhibitor_viewer invite kind, etc.)
 *   users.company_id        — company anchor
 *   users.event_access_mode — all_company_events | assigned_events_only
 *   event_users             — from assigned ids when non-empty (optional for all_company_events;
 *                             required non-empty set when assigned_events_only)
 *
 * NO access checks live here. NO duplication of resolver logic.
 */

import {
  EVENT_ACCESS_MODES,
  DEFAULT_EVENT_ACCESS_MODE,
  type EventAccessMode
} from "@/lib/access/event-access-mode";

export const INVITE_ROLE_KINDS = [
  "platform_admin",
  "organizer_admin",
  "exhibitor_admin",
  "exhibitor_viewer"
] as const;

export type InviteRoleKind = (typeof INVITE_ROLE_KINDS)[number];

/**
 * Distinguish company-scoped invite roles (`exhibitor_admin`, `exhibitor_viewer`) from org/platform
 * roles. Actual `public.users.role` at insert time is governed by invite redeem / admin flows;
 * this helper only normalizes the UI/body role kind for access-config validation.
 */
export function isCompanyScopedInviteRole(role: InviteRoleKind): boolean {
  return role === "exhibitor_admin" || role === "exhibitor_viewer";
}

export function requiresEventAccessMode(role: InviteRoleKind): boolean {
  return isCompanyScopedInviteRole(role);
}

export type UserInviteAccessConfigInput = {
  role: InviteRoleKind | string | null | undefined;
  eventAccessMode?: string | null;
  assignedEventIds?: ReadonlyArray<string | null | undefined> | null;
};

export type NormalizedUserInviteAccessConfig = {
  role: InviteRoleKind;
  /** `null` when role does not use event_access_mode (platform_admin / organizer_admin). */
  eventAccessMode: EventAccessMode | null;
  /** Deduped + trimmed. For `assigned_events_only`, must be non-empty. For `all_company_events`, optional (e.g. bootstrap memberships). */
  assignedEventIds: string[];
};

export type UserInviteAccessValidationError =
  | { code: "INVALID_ROLE"; message: string }
  | { code: "MODE_REQUIRED"; message: string }
  | { code: "INVALID_MODE"; message: string }
  | { code: "ASSIGNED_EVENTS_REQUIRED"; message: string }
  | { code: "ASSIGNED_EVENTS_FOREIGN_COMPANY"; message: string; offendingIds: string[] };

export type UserInviteAccessValidationResult =
  | { ok: true; config: NormalizedUserInviteAccessConfig }
  | { ok: false; error: UserInviteAccessValidationError };

function normalizeRole(role: string | null | undefined): InviteRoleKind | null {
  const v = String(role ?? "").trim().toLowerCase();
  if (v === "event_organizer") return "organizer_admin";
  if ((INVITE_ROLE_KINDS as readonly string[]).includes(v)) {
    return v as InviteRoleKind;
  }
  return null;
}

function normalizeIdList(values: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const out: string[] = [];
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
 * Shape the raw input (form field / JSON body) into a normalized access config without any
 * database access. Callers must further verify that `assignedEventIds` belong to the user's
 * company via `validateAssignedEventsBelongToCompany` (see below).
 */
export function normalizeUserInviteAccessConfig(
  input: UserInviteAccessConfigInput
): UserInviteAccessValidationResult {
  const role = normalizeRole(input.role);
  if (!role) {
    return {
      ok: false,
      error: { code: "INVALID_ROLE", message: "Invalid role." }
    };
  }

  if (!requiresEventAccessMode(role)) {
    return {
      ok: true,
      config: {
        role,
        eventAccessMode: null,
        assignedEventIds: []
      }
    };
  }

  const modeRaw = String(input.eventAccessMode ?? "").trim().toLowerCase();
  if (!modeRaw) {
    return {
      ok: false,
      error: {
        code: "MODE_REQUIRED",
        message: "event_access_mode is required for company-scoped users."
      }
    };
  }
  if (!(EVENT_ACCESS_MODES as readonly string[]).includes(modeRaw)) {
    return {
      ok: false,
      error: {
        code: "INVALID_MODE",
        message: `event_access_mode must be one of: ${EVENT_ACCESS_MODES.join(", ")}.`
      }
    };
  }
  const eventAccessMode = modeRaw as EventAccessMode;

  const assigned = normalizeIdList(input.assignedEventIds);

  if (eventAccessMode === "assigned_events_only" && assigned.length === 0) {
    return {
      ok: false,
      error: {
        code: "ASSIGNED_EVENTS_REQUIRED",
        message: "At least one event must be assigned for assigned_events_only."
      }
    };
  }

  return {
    ok: true,
    config: {
      role,
      eventAccessMode,
      assignedEventIds: assigned
    }
  };
}

/**
 * Cross-reference the assigned event ids against a loaded set of the target company's events
 * (events.company_id = user.company_id). Caller loads the set; we only compute the mismatch.
 *
 * Returns the subset of ids that do NOT belong to the company.
 */
export function findAssignedEventIdsNotInCompany(
  assignedEventIds: ReadonlyArray<string>,
  companyOwnedEventIds: ReadonlyArray<string>
): string[] {
  const owned = new Set(companyOwnedEventIds.map((id) => String(id).trim()).filter(Boolean));
  const offending: string[] = [];
  for (const id of assignedEventIds) {
    const trimmed = String(id).trim();
    if (!trimmed) continue;
    if (!owned.has(trimmed)) offending.push(trimmed);
  }
  return offending;
}

export { DEFAULT_EVENT_ACCESS_MODE };
