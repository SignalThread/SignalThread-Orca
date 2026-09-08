import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("server auth callback runs invite completion then membership activation after session", () => {
  const src = read("app/auth/server-callback/route.ts");
  const fnStart = src.indexOf("async function completeInviteAndActivateMemberships");
  assert.ok(fnStart >= 0);
  const fnEnd = src.indexOf("export async function GET", fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /tryCompletePendingInvitesAfterAuth/);
  assert.match(fnBody, /activateInvitedMembershipsWithSeatEnforcement/);
  const idxComplete = fnBody.indexOf("tryCompletePendingInvitesAfterAuth");
  const idxActivate = fnBody.indexOf("activateInvitedMembershipsWithSeatEnforcement");
  assert.ok(idxComplete < idxActivate, "invite completion must run before seat activation");
});

test("server callback passes invite_code query (not Supabase PKCE code) to invite completion", () => {
  const src = read("app/auth/server-callback/route.ts");
  assert.match(src, /searchParams\.get\("invite_code"\)/);
  assert.match(src, /rawInviteCode/);
});

test("POST /api/invites/complete-session uses same completion as server callback", () => {
  const src = read("app/api/invites/complete-session/route.ts");
  assert.match(src, /tryCompletePendingInvitesAfterAuth/);
  assert.match(src, /activateInvitedMembershipsWithSeatEnforcement/);
});

test("client auth/callback hash flow POSTs complete-session after setSession", () => {
  const src = read("app/auth/callback/page.tsx");
  assert.match(src, /\/api\/invites\/complete-session/);
  assert.match(src, /inviteCodeParam/);
  assert.match(src, /credentials:\s*"same-origin"/);
});

test("plain OTP login also POSTs complete-session before role navigation", () => {
  const src = read("app/(public)/login/login-form.tsx");
  assert.match(src, /\/api\/invites\/complete-session/);
  assert.match(src, /credentials:\s*"same-origin"/);
  const idxComplete = src.indexOf('fetch("/api/invites/complete-session"');
  const idxResolveRole = src.indexOf("resolveRoleAndNavigate()");
  assert.ok(idxComplete >= 0 && idxResolveRole >= 0 && idxComplete < idxResolveRole);
});

test("tryCompletePendingInvitesAfterAuth logs skip when no pending codes", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /no_pending_invite_codes/);
  assert.match(src, /auth\.invite_completion/);
});

test("tryCompletePendingInvitesAfterAuth logs when invite_code param is invalid or expired", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /invalid_or_expired_invite_code_param/);
});

test("executeInviteRedeemCore loads fresh pending rows for planInviteRedeem (edited pending invite)", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /pendingRowsSameEmailAndCompany:\s*pendingRows/);
  assert.match(src, /\.from\("invite_codes"\)[\s\S]*?\.ilike\("email",\s*userEmail\)/);
});

test("planner maps invite permissions to public role (exhibitor_admin or exhibitor_viewer)", () => {
  const src = read("lib/server/invites/invite-redeem-plan.ts");
  assert.match(src, /publicUsersRoleFromInvitePermissions/);
  assert.match(src, /InviteRedeemPublicUsersRole/);
});

test("all-company event grants use expandGrantEventIds in executeInviteRedeemCore", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /expandGrantEventIdsForAllCompanyEventsMode/);
  assert.match(src, /listEventIdsForExhibitorCompany/);
});
