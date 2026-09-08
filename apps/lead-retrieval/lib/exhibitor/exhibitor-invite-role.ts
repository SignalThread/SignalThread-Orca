import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";
import { companyMemberRoleProductLabel } from "@/lib/exhibitor/company-member-role-label";

/**
 * Canonical invite role model shared by every exhibitor team invite surface:
 *   - `/exhibitor/users` (event-scoped seat invite)
 *   - `/app/settings` company team invite
 *
 * There are only two canonical product roles for exhibitor teams:
 *   - **Exhibitor admin** (`exhibitor_admin`) — can manage users/settings/events.
 *   - **Exhibitor viewer** (stored as `viewer` in `CompanyMemberDbRole` for historical compatibility) —
 *     view-only / app-seat users per product model.
 *
 * The UI NEVER shows "Viewer". Always map `viewer` → product label via
 * {@link companyMemberRoleProductLabel}.
 */
export type ExhibitorInviteRole = CompanyMemberDbRole;

/** Dropdown options for every invite/edit-role selector. Order is deliberate. */
export const EXHIBITOR_INVITE_ROLE_OPTIONS: ReadonlyArray<{
  value: ExhibitorInviteRole;
  label: string;
}> = [
  { value: "exhibitor_admin", label: companyMemberRoleProductLabel("exhibitor_admin") },
  { value: "viewer", label: companyMemberRoleProductLabel("viewer") }
];

/**
 * Server-side normalization for untrusted role values coming off the wire.
 * Returns `null` when the caller sent a value we don't accept (including `"platform_admin"`,
 * `"organizer_admin"`, etc.) so callers can bail with a 400.
 */
export function normalizeExhibitorInviteRole(
  raw: unknown
): ExhibitorInviteRole | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "exhibitor_admin") return "exhibitor_admin";
  if (v === "viewer" || v === "exhibitor_viewer") return "viewer";
  return null;
}

/**
 * Canonical `event_users.permissions` shape for an exhibitor team invite.
 *
 * `admin` is purely a **role** bit (only exhibitor admins get it).
 * `app` is purely an **access type** bit (only when the invite consumes an app seat).
 *
 * This keeps role and app access as two independent concepts — never conflate them.
 */
export function exhibitorInviteEventUserPermissions(input: {
  role: ExhibitorInviteRole;
  hasAppAccess: boolean;
}): { admin: boolean; app: boolean } {
  return {
    admin: input.role === "exhibitor_admin",
    app: Boolean(input.hasAppAccess)
  };
}

/**
 * Access-type parsing: accepts only `"app"` (default) or `"no_app"` from untrusted input.
 * Seat assignment is gated on `hasAppAccess === true`; no-app invites must not consume a seat.
 */
export function normalizeExhibitorInviteAccessType(raw: unknown): {
  accessType: "app" | "no_app";
  hasAppAccess: boolean;
} {
  const v = String(raw ?? "").trim().toLowerCase();
  const accessType = v === "no_app" ? "no_app" : "app";
  return { accessType, hasAppAccess: accessType === "app" };
}

/** Product-facing label for a stored role. Never returns "Viewer". */
export function exhibitorTeamRoleProductLabel(role: unknown): string {
  if (role === null || role === undefined) {
    return companyMemberRoleProductLabel(role);
  }
  return companyMemberRoleProductLabel(String(role));
}

/**
 * Roles we treat as "organizer" and refuse to mutate from exhibitor surfaces.
 * Shared with PATCH/DELETE endpoints that must bail before touching org users.
 */
export function isOrganizerRoleForExhibitorScope(role: unknown): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "event_organizer" || r === "organizer_admin" || r === "platform_admin";
}
