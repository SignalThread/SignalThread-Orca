import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("createInviteCode writes event_access_mode on the invite_codes insert", () => {
  const src = read("lib/server/invites/createInviteCode.ts");
  const insertMatch = src.match(/\.from\("invite_codes"\)[\s\S]*?\.insert\(\{[\s\S]*?\}\)/);
  assert.ok(insertMatch, "expected to find invite_codes insert body");
  const body = insertMatch[0];
  assert.match(body, /event_access_mode:\s*eventAccessMode/);
  assert.match(body, /permissions:\s*permissions as Json/);
});

test("createInviteCode accepts eventAccessMode and normalizes via canonical helper", () => {
  const src = read("lib/server/invites/createInviteCode.ts");
  assert.match(src, /eventAccessMode\?:\s*EventAccessMode/);
  assert.match(src, /normalizeEventAccessMode/);
});

test("orchestrator forwards eventAccessMode to createInviteCode on every row", () => {
  const src = read("lib/exhibitor/company-team-app-user-invite.ts");
  const createCall = src.match(/deps\.createInviteCode\(\{[\s\S]*?\}\);/);
  assert.ok(createCall, "expected to find createInviteCode call");
  assert.match(createCall[0], /eventAccessMode:\s*input\.eventAccessMode/);
  assert.match(
    createCall[0],
    /permissions:\s*\{\s*admin:\s*false,\s*app:\s*true\s*\}/,
    "app-user invite must always write admin=false, app=true"
  );
});

test("redeem route delegates to invite-redeem-execute (executeInviteRedeemCore)", () => {
  const src = read("app/api/invites/redeem/route.ts");
  assert.match(src, /getAuthenticatedUserEmailForRedeem/);
  assert.match(src, /loadInviteRowByCodeHash/);
  assert.match(src, /executeInviteRedeemCore/);
  assert.doesNotMatch(
    src,
    /role:\s*"exhibitor_admin"/,
    "redeem must not hardcode role exhibitor_admin — role comes from the planner"
  );
});

test("invite redeem execute uses planInviteRedeem and assertPublicUsersRoleForInviteRedeemDbWrite", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /assertPublicUsersRoleForInviteRedeemDbWrite\s*\(\s*plan\.role\s*\)/);
  assert.match(src, /planInviteRedeem/);
  assert.match(
    src,
    /"id,\s*event_id,\s*exhibitor_company_id,\s*email,\s*permissions,\s*event_access_mode"/
  );
  assert.doesNotMatch(
    src,
    /role:\s*"exhibitor_admin"/,
    "execute must not hardcode role exhibitor_admin — role comes from the planner"
  );
});

test("invite redeem execute catches InviteRedeemNoEventsError from planner (empty grant list)", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /InviteRedeemNoEventsError/);
});

test("redeem route never calls supabase.auth.admin.inviteUserByEmail", () => {
  const src = read("app/api/invites/redeem/route.ts");
  assert.doesNotMatch(src, /auth\.admin\.inviteUserByEmail/);
});

test("invite redeem execute applies mergeInviteRedeemUserRole and exhibitor scope guard", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /mergeInviteRedeemUserRole/);
  assert.match(src, /isExhibitorSideUsersRole/);
});

test("invite redeem execute consumes all planned invite ids (additional invites marked used_at)", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /consumeInviteIds/);
  assert.match(src, /used_by_user_id/);
  assert.match(src, /\.in\("id",\s*additionalConsumeIds\)/);
});

test("invite redeem execute activates every granted event (not just one)", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /for\s*\(const\s+eventId\s+of\s+grantEventIds\)/);
  assert.match(src, /activateInvitedMembershipWithSeatEnforcement\(/);
});

test("invite redeem execute expands all-company invites against events.company_id before the grant loop", () => {
  const src = read("lib/server/invites/invite-redeem-execute.ts");
  assert.match(src, /listEventIdsForExhibitorCompany/);
  assert.match(src, /expandGrantEventIdsForAllCompanyEventsMode/);
});

test("claim route mirrors redeem wiring (planner + consume-all + role from permissions)", () => {
  const src = read("app/api/invites/claim/route.ts");
  assert.match(src, /assertPublicUsersRoleForInviteRedeemDbWrite\s*\(\s*plan\.role\s*\)/);
  assert.match(src, /mergeInviteRedeemUserRole/);
  assert.match(src, /planInviteRedeem/);
  assert.match(
    src,
    /"id,\s*event_id,\s*exhibitor_company_id,\s*email,\s*permissions,\s*event_access_mode"/
  );
  assert.doesNotMatch(
    src,
    /role:\s*"exhibitor_admin"/,
    "claim must not hardcode role exhibitor_admin — role comes from the planner"
  );
  assert.match(src, /consumeInviteIds/);
  assert.match(src, /for\s*\(const\s+eventId\s+of\s+grantEventIds\)/);
  assert.match(src, /expandGrantEventIdsForAllCompanyEventsMode/);
  assert.match(src, /listEventIdsForExhibitorCompany/);
});

test("migration 0063 adds event_access_mode column with canonical check constraint", () => {
  const src = read("test-fixtures/legacy-lr-migrations/0063_invite_codes_event_access_mode.sql");
  assert.match(src, /ALTER TABLE public\.invite_codes/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS event_access_mode/);
  assert.match(src, /CHECK \(event_access_mode IN \('all_company_events',\s*'assigned_events_only'\)\)/);
  assert.match(src, /SET DEFAULT 'assigned_events_only'/);
  assert.match(src, /SET NOT NULL/);
});
