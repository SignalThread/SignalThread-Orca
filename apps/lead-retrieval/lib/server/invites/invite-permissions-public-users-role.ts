/**
 * Canonical mapping: invite `permissions` flags → `public.users.role` at redeem/claim.
 *
 * `users_role_check` is defined in `supabase/migrations/0064_users_role_exhibitor_viewer_and_read_rls.sql`:
 * `platform_admin`, `event_organizer`, `exhibitor_admin`, `exhibitor_viewer`.
 * Invite redeem/claim may only persist exhibitor-side roles from
 * {@link INVITE_REDEEM_PUBLIC_USERS_ROLES}. Capability differences stay on
 * `invite_codes.permissions` / `event_users.permissions`.
 */

export type InviteRedeemPermissionFlags = {
  admin: boolean;
  app: boolean;
};

/**
 * Values allowed by `public.users.role` per the latest repo migration (0064).
 * Single source of truth for “what the DB schema in git allows.”
 */
export const USERS_ROLE_CHECK_VALUES_IN_REPO = [
  "platform_admin",
  "event_organizer",
  "exhibitor_admin",
  "exhibitor_viewer"
] as const;
export type UsersRoleCheckValueInRepo = (typeof USERS_ROLE_CHECK_VALUES_IN_REPO)[number];

/**
 * Subset of {@link USERS_ROLE_CHECK_VALUES_IN_REPO} that invite redeem/claim may write.
 */
export const INVITE_REDEEM_PUBLIC_USERS_ROLES = ["exhibitor_admin", "exhibitor_viewer"] as const;
export type InviteRedeemPublicUsersRole = (typeof INVITE_REDEEM_PUBLIC_USERS_ROLES)[number];

function assertInviteRedeemRolesSubsetOfRepoConstraint(): void {
  for (const r of INVITE_REDEEM_PUBLIC_USERS_ROLES) {
    if (!(USERS_ROLE_CHECK_VALUES_IN_REPO as readonly string[]).includes(r)) {
      throw new Error(
        `[invite-permissions-public-users-role] INVITE_REDEEM_PUBLIC_USERS_ROLES includes "${r}" which is not in USERS_ROLE_CHECK_VALUES_IN_REPO — fix mapper vs supabase/migrations.`
      );
    }
  }
}

assertInviteRedeemRolesSubsetOfRepoConstraint();

export class InviteRedeemRoleMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteRedeemRoleMappingError";
  }
}

/**
 * Map invite permission flags to `public.users.role`.
 *
 * - `admin === true` → `exhibitor_admin` (including when both app and admin are true).
 * - `app === true` and `admin !== true` → `exhibitor_viewer`.
 * - Neither → error (invite cannot be redeemed).
 */
export function publicUsersRoleFromInvitePermissions(
  permissions: InviteRedeemPermissionFlags
): InviteRedeemPublicUsersRole {
  if (permissions.admin === true) {
    return "exhibitor_admin";
  }
  if (permissions.app === true) {
    return "exhibitor_viewer";
  }
  throw new InviteRedeemRoleMappingError(
    "This invite does not grant app or admin access and cannot be redeemed."
  );
}

/**
 * When updating an existing `public.users` row during invite redemption, never
 * demote `exhibitor_admin` to `exhibitor_viewer` (e.g. redeeming an app-only
 * invite). New users use {@link publicUsersRoleFromInvitePermissions} directly.
 */
export function mergeInviteRedeemUserRole(
  existingRole: string | null | undefined,
  planned: InviteRedeemPublicUsersRole
): InviteRedeemPublicUsersRole {
  const e = String(existingRole ?? "").trim().toLowerCase();
  if (e === "exhibitor_admin" && planned === "exhibitor_viewer") {
    return "exhibitor_admin";
  }
  return planned;
}

/** Last line of defense before INSERT/UPDATE `public.users.role`. */
export function assertPublicUsersRoleForInviteRedeemDbWrite(
  role: string
): asserts role is InviteRedeemPublicUsersRole {
  if (!(INVITE_REDEEM_PUBLIC_USERS_ROLES as readonly string[]).includes(role)) {
    throw new InviteRedeemRoleMappingError(
      `Refusing to write invalid public.users.role for invite redemption: ${JSON.stringify(role)}`
    );
  }
  if (!(USERS_ROLE_CHECK_VALUES_IN_REPO as readonly string[]).includes(role as UsersRoleCheckValueInRepo)) {
    throw new InviteRedeemRoleMappingError(
      `Refusing to write role not allowed by repo users_role_check: ${JSON.stringify(role)}`
    );
  }
}
