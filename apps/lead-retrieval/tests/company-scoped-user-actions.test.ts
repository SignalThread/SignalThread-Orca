import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getCompanyScopedUserActionState,
  isPlatformAdminCompanyScopedUserManager
} from "../lib/admin/company-scoped-user-actions";

test("company-scoped user actions allow platform admins only", () => {
  assert.equal(isPlatformAdminCompanyScopedUserManager("platform_admin"), true);
  assert.equal(isPlatformAdminCompanyScopedUserManager("organizer_admin"), false);
  assert.equal(isPlatformAdminCompanyScopedUserManager("exhibitor_admin"), false);
  assert.equal(isPlatformAdminCompanyScopedUserManager(null), false);
});

test("company-scoped user actions hide resend for active users", () => {
  assert.deepEqual(
    getCompanyScopedUserActionState({
      isPendingInvite: false,
      status: "active"
    }),
    {
      canEdit: true,
      canDelete: true,
      canResendInvite: false
    }
  );
});

test("company-scoped user actions allow invited user management and resend", () => {
  assert.deepEqual(
    getCompanyScopedUserActionState({
      isPendingInvite: false,
      status: "invited"
    }),
    {
      canEdit: true,
      canDelete: true,
      canResendInvite: true
    }
  );
});

test("company-scoped user actions allow pending invite management and resend", () => {
  assert.deepEqual(
    getCompanyScopedUserActionState({
      isPendingInvite: true,
      status: "expired"
    }),
    {
      canEdit: true,
      canDelete: true,
      canResendInvite: true
    }
  );
});

test("company-scoped user edit UI documents read-only email rules", () => {
  const src = fs.readFileSync("components/admin/company-scoped-users-row-actions.tsx", "utf8");

  assert.match(src, /Email is managed by the user's login identity and cannot be edited here\./);
  assert.match(src, /To correct an email, remove this invite and send a new one\./);
  assert.doesNotMatch(src, /onChange=\{\(event\) => setEmail/);
  assert.doesNotMatch(src, /fd\.set\("email",\s*email\)/);
});

test("company-scoped admin update action does not mutate emails", () => {
  const src = fs.readFileSync("app/admin/company-licenses/users/actions.ts", "utf8");

  assert.match(src, /export async function updateCompanyScopedUserFromAdminAction/);
  assert.doesNotMatch(src, /nextEmail/);
  assert.doesNotMatch(src, /authPatch\.email/);
  assert.doesNotMatch(src, /email:\s*nextEmail/);
});
