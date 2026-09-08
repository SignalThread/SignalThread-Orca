/**
 * Product rules: web admin uses event_users.permissions.admin; mobile uses permissions.app;
 * users.role is exhibitor_admin | exhibitor_viewer; bearer APIs require app for exhibitor roles.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("publicUsersRoleFromInvitePermissions: admin without app maps to exhibitor_admin", () => {
  const src = read("lib/server/invites/invite-permissions-public-users-role.ts");
  assert.match(
    src,
    /if\s*\(\s*permissions\.admin\s*===\s*true\s*\)[\s\S]*?return\s+"exhibitor_admin"/,
    "admin flag must map to exhibitor_admin even when app is false"
  );
});

test("resolveApiSession enforces app access for bearer exhibitor sessions", () => {
  const src = read("lib/auth/resolveApiSession.ts");
  assert.match(src, /getUserHasExhibitorAppAccess/);
  assert.match(src, /Mobile app access is not enabled/);
});

test("requireRole exhibitor_admin path requires web admin permission aggregate", () => {
  const src = read("lib/auth/session.ts");
  assert.match(src, /getUserHasExhibitorWebAdminAccess/);
  assert.match(src, /resolveExhibitorAdminRoleWithoutWebAdminRedirect/);
});

test("exhibitor user PATCH applies role without mergeInviteRedeemUserRole (explicit demotion allowed)", () => {
  const src = read("app/api/exhibitor/users/[userId]/route.ts");
  assert.doesNotMatch(src, /mergeInviteRedeemUserRole/);
  assert.match(src, /publicUsersRoleForCompanyMember/);
});

test("exhibitorInviteEventUserPermissions keeps admin and app independent", () => {
  const src = read("lib/exhibitor/exhibitor-invite-role.ts");
  assert.match(src, /admin:\s*input\.role\s*===\s*"exhibitor_admin"/);
  assert.match(src, /app:\s*Boolean\(input\.hasAppAccess\)/);
});
