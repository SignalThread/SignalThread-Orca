import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  emailMatchesExactCaseInsensitive,
  inviteEmailMatchesSession,
  isAuthUserAlreadyExistsError,
  isExhibitorCompanyConflict,
  normalizeRedeemEmail
} from "../lib/server/invites/invite-redeem-guards";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("normalizeRedeemEmail lowercases and trims", () => {
  assert.equal(normalizeRedeemEmail("  User@Example.COM "), "user@example.com");
});

test("inviteEmailMatchesSession is case-insensitive", () => {
  assert.equal(inviteEmailMatchesSession("A@B.CO", "a@b.co"), true);
  assert.equal(inviteEmailMatchesSession("a@b.co", "x@y.z"), false);
});

test("email exact matching does not collapse plus-address aliases or partial local parts", () => {
  assert.equal(emailMatchesExactCaseInsensitive("Zach@SignalThread.ai", "zach@signalthread.ai"), true);
  assert.equal(emailMatchesExactCaseInsensitive("zach+app@signalthread.ai", "zach@signalthread.ai"), false);
  assert.equal(emailMatchesExactCaseInsensitive("zach+123@signalthread.ai", "zach@signalthread.ai"), false);
  assert.equal(emailMatchesExactCaseInsensitive("zachary@signalthread.ai", "zach@signalthread.ai"), false);
});

test("isExhibitorCompanyConflict: empty existing company allows invite", () => {
  assert.equal(isExhibitorCompanyConflict(null, "c1"), false);
  assert.equal(isExhibitorCompanyConflict("", "c1"), false);
  assert.equal(isExhibitorCompanyConflict("  ", "c1"), false);
});

test("isExhibitorCompanyConflict: mismatch blocks", () => {
  assert.equal(isExhibitorCompanyConflict("c1", "c1"), false);
  assert.equal(isExhibitorCompanyConflict("c1", "c2"), true);
});

test("isAuthUserAlreadyExistsError detects common Supabase messages", () => {
  assert.equal(isAuthUserAlreadyExistsError("A user with this email address has already been registered"), true);
  assert.equal(isAuthUserAlreadyExistsError("User already registered"), true);
  assert.equal(isAuthUserAlreadyExistsError("duplicate key value"), true);
  assert.equal(isAuthUserAlreadyExistsError("Network timeout"), false);
});

test("redeem: resolves session email and delegates to executeInviteRedeemCore", () => {
  const src = read("app/api/invites/redeem/route.ts");
  assert.match(src, /getAuthenticatedUserEmailForRedeem/);
  assert.match(src, /invite-redeem-auth-email/);
  assert.match(src, /loadInviteRowByCodeHash/);
  assert.match(src, /executeInviteRedeemCore/);
  assert.doesNotMatch(
    src,
    /\.ilike\("email"/,
    "redeem route must not query invite_codes by email — loading is by code hash in invite-redeem-execute"
  );
});

test("redeem execute: first invite_codes load is by code hash (email verified after row fetch)", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  const fnStart = src.indexOf("export async function loadInviteRowByCodeHash");
  assert.ok(fnStart >= 0);
  const fnBlock = src.slice(fnStart, fnStart + 800);
  assert.match(fnBlock, /\.eq\("code_hash",\s*codeHash\)/);
  assert.doesNotMatch(fnBlock, /\.ilike\("email"/, "load by code hash must not use email ilike");
});

test("redeem: still creates public.users when profile row is missing (fresh / incomplete onboarding)", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /if\s*\(!existingUser\)/);
  assert.match(src, /\.from\("users"\)\.insert/);
});

test("redeem: repairs memberships via grant loop + ensureEventMembershipForInviteRedeem", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /ensureEventMembershipForInviteRedeem/);
  assert.match(src, /for\s*\(const\s+eventId\s+of\s+grantEventIds\)/);
});

test("redeem: wrong email rejected after invite loaded by code", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /different email address/);
});

test("claim: duplicate auth signup falls back to updateUserById or AUTH_USER_EXISTS_USE_REDEEM", () => {
  const src = read("app/api/invites/claim/route.ts");
  assert.match(src, /isAuthUserAlreadyExistsError/);
  assert.match(src, /AUTH_USER_EXISTS_USE_REDEEM/);
  assert.match(src, /findAuthUserByEmailAdmin/);
});

test("exhibitor web invite: duplicate auth user falls back to existing auth lookup and metadata refresh", () => {
  const src = read("app/api/exhibitor/invite/route.ts");
  assert.match(src, /isAuthUserAlreadyExistsError/);
  assert.match(src, /findAuthUserByEmailAdmin/);
  assert.match(src, /updateUserById/);
  assert.match(src, /user_metadata/);
});

test("auth email lookup uses exact case-insensitive comparison, not plus-alias or partial matching", () => {
  const src = read("lib/server/invites/invite-redeem-auth-email.ts");
  assert.match(src, /emailMatchesExactCaseInsensitive/);
  assert.doesNotMatch(src, /split\(["']@["']\)/);
  assert.doesNotMatch(src, /split\(["']\+["']\)/);
  assert.doesNotMatch(src, /\.includes\(/);
  assert.doesNotMatch(src, /\.startsWith\(/);
});

test("exhibitor user delete verifies auth cleanup so stale auth rows do not block reinvite", () => {
  const src = read("app/api/exhibitor/users/[userId]/route.ts");
  assert.match(src, /auth\.admin\.deleteUser/);
  assert.match(src, /verifyCompanyTeamUserFullyDeleted/);
});

test("claim: email must match invite (same as redeem semantics)", () => {
  const src = read("app/api/invites/claim/route.ts");
  assert.match(src, /inviteEmailMatchesSession/);
});
