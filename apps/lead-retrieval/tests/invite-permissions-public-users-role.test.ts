import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  assertPublicUsersRoleForInviteRedeemDbWrite,
  INVITE_REDEEM_PUBLIC_USERS_ROLES,
  InviteRedeemRoleMappingError,
  mergeInviteRedeemUserRole,
  publicUsersRoleFromInvitePermissions
} from "../lib/server/invites/invite-permissions-public-users-role";
import { publicUsersRoleForCompanyMember } from "../lib/exhibitor/company-team-public-users-role";

import { mergeEventUserPermissionsForInviteRedeem } from "../lib/server/invites/invite-redeem-event-permissions";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("app-only invite maps to public.users.role exhibitor_viewer", () => {
  assert.equal(publicUsersRoleFromInvitePermissions({ admin: false, app: true }), "exhibitor_viewer");
});

test("admin invite maps to exhibitor_admin; both app+admin is exhibitor_admin", () => {
  assert.equal(publicUsersRoleFromInvitePermissions({ admin: true, app: true }), "exhibitor_admin");
  assert.equal(publicUsersRoleFromInvitePermissions({ admin: true, app: false }), "exhibitor_admin");
});

test("neither app nor admin throws before DB write", () => {
  assert.throws(
    () => publicUsersRoleFromInvitePermissions({ admin: false, app: false }),
    InviteRedeemRoleMappingError
  );
});

test("mergeInviteRedeemUserRole: no demotion from exhibitor_admin to exhibitor_viewer", () => {
  assert.equal(mergeInviteRedeemUserRole("exhibitor_admin", "exhibitor_viewer"), "exhibitor_admin");
  assert.equal(mergeInviteRedeemUserRole("EXHIBITOR_ADMIN", "exhibitor_viewer"), "exhibitor_admin");
});

test("mergeInviteRedeemUserRole: promotion and new users", () => {
  assert.equal(mergeInviteRedeemUserRole("exhibitor_viewer", "exhibitor_admin"), "exhibitor_admin");
  assert.equal(mergeInviteRedeemUserRole(null, "exhibitor_viewer"), "exhibitor_viewer");
  assert.equal(mergeInviteRedeemUserRole("exhibitor", "exhibitor_viewer"), "exhibitor_viewer");
});

test("mergeEventUserPermissionsForInviteRedeem: never demote admin on event_users", () => {
  assert.deepEqual(
    mergeEventUserPermissionsForInviteRedeem({ admin: true, app: true }, { admin: false, app: true }),
    { admin: true, app: true }
  );
  assert.deepEqual(
    mergeEventUserPermissionsForInviteRedeem({ admin: true, app: false }, { admin: false, app: true }),
    { admin: true, app: true }
  );
});

test("mergeEventUserPermissionsForInviteRedeem: applies invite when no existing admin", () => {
  assert.deepEqual(
    mergeEventUserPermissionsForInviteRedeem({ admin: false, app: false }, { admin: false, app: true }),
    { admin: false, app: true }
  );
});

test("publicUsersRoleForCompanyMember maps viewer to exhibitor_viewer", () => {
  assert.equal(publicUsersRoleForCompanyMember("viewer"), "exhibitor_viewer");
  assert.equal(publicUsersRoleForCompanyMember("exhibitor_admin"), "exhibitor_admin");
});

test("assertPublicUsersRoleForInviteRedeemDbWrite rejects legacy and non-invite values", () => {
  for (const bad of [
    "exhibitor",
    "viewer",
    "organizer",
    "app_user",
    "app",
    "booth_user",
    "organizer_admin",
    "platform_admin",
    "event_organizer",
    ""
  ]) {
    assert.throws(
      () => assertPublicUsersRoleForInviteRedeemDbWrite(bad),
      InviteRedeemRoleMappingError,
      `expected rejection for ${JSON.stringify(bad)}`
    );
  }
});

test("assertPublicUsersRoleForInviteRedeemDbWrite accepts invite-redeem allow-list", () => {
  for (const ok of INVITE_REDEEM_PUBLIC_USERS_ROLES) {
    assert.doesNotThrow(() => assertPublicUsersRoleForInviteRedeemDbWrite(ok));
  }
});

test("redeem and claim routes use canonical mapper + assert + mapping error handling", () => {
  const redeem = read("app/api/invites/redeem/route.ts");
  const execute = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(execute, /assertPublicUsersRoleForInviteRedeemDbWrite\s*\(\s*plan\.role\s*\)/);
  assert.match(execute, /assertPublicUsersRoleForInviteRedeemDbWrite\s*\(\s*effectiveRole\s*\)/);
  for (const src of [execute, redeem]) {
    assert.match(src, /executeInviteRedeemCore/);
  }
  assert.match(execute, /mergeInviteRedeemUserRole/);
  assert.match(execute, /InviteRedeemRoleMappingError/);
  assert.match(execute, /planInviteRedeem/);
  assert.doesNotMatch(
    execute,
    /role:\s*["'](viewer|organizer|app_user|exhibitor)["']\s*[,}]/,
    "execute must not hardcode invalid users.role string literals for users table"
  );

  const claim = read("app/api/invites/claim/route.ts");
  assert.match(claim, /assertPublicUsersRoleForInviteRedeemDbWrite\s*\(\s*plan\.role\s*\)/);
  assert.match(claim, /assertPublicUsersRoleForInviteRedeemDbWrite\s*\(\s*effectiveRole\s*\)/);
  assert.match(claim, /mergeInviteRedeemUserRole/);
  assert.match(claim, /InviteRedeemRoleMappingError/);
  assert.match(claim, /planInviteRedeem/);
  assert.doesNotMatch(
    claim,
    /role:\s*["'](viewer|organizer|app_user|exhibitor)["']\s*[,}]/,
    "claim must not hardcode invalid users.role string literals for users table"
  );
});

test("exhibitor invite POST and team user PATCH use company → public.users role mapper", () => {
  const inviteSrc = read("app/api/exhibitor/invite/route.ts");
  assert.match(inviteSrc, /publicUsersRoleForCompanyMember/);
  assert.match(inviteSrc, /mergeInviteRedeemUserRole/);

  const usersPatchSrc = read("app/api/exhibitor/users/[userId]/route.ts");
  assert.match(usersPatchSrc, /publicUsersRoleForCompanyMember/);
  assert.doesNotMatch(
    usersPatchSrc,
    /mergeInviteRedeemUserRole/,
    "team user PATCH must apply explicit role edits (no redeem merge anti-demotion)"
  );
});

test("mapper lives in invite-permissions-public-users-role.ts (single boundary module)", () => {
  const src = read("lib/server/invites/invite-permissions-public-users-role.ts");
  assert.match(src, /publicUsersRoleFromInvitePermissions/);
  assert.match(src, /USERS_ROLE_CHECK_VALUES_IN_REPO/);
  assert.match(src, /0064_users_role_exhibitor_viewer_and_read_rls/);
  assert.match(src, /INVITE_REDEEM_PUBLIC_USERS_ROLES/);
});
