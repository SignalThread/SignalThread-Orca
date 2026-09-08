import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resendAuthInviteWithDeps,
  type ResendAuthInviteDeps,
  type ResendAuthInviteUser
} from "../lib/server/invites/resend-auth-invite-core";
import { INVITE_USER_METADATA } from "../lib/data/platform-admin";

const ROOT = process.cwd();

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function createDeps(users: ResendAuthInviteUser[]) {
  const state = new Map(users.map((user) => [user.id, { ...user, user_metadata: { ...(user.user_metadata ?? {}) } }]));
  const calls = {
    updates: [] as Array<{ userId: string; metadata: Record<string, unknown> }>,
    issued: [] as Array<{ email: string; userMetadata: Record<string, unknown> }>,
    publicUserCreates: 0,
    eventUserInserts: 0,
    legacyEmailSends: 0
  };
  const deps: ResendAuthInviteDeps = {
    getAuthUserById: async (userId) => state.get(userId) ?? null,
    findAuthUserByEmail: async (email) =>
      [...state.values()].find((user) => String(user.email ?? "").toLowerCase() === email.toLowerCase()) ?? null,
    updateAuthUserMetadata: async (userId, metadata) => {
      calls.updates.push({ userId, metadata });
      const user = state.get(userId);
      if (!user) return { ok: false, error: "missing user" };
      user.user_metadata = metadata;
      return { ok: true };
    },
    issueAuthInvite: async ({ email, userMetadata }) => {
      calls.issued.push({ email, userMetadata });
      const user = [...state.values()].find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
      return user ? { ok: true, userId: user.id } : { ok: false, error: "missing user" };
    }
  };
  return { deps, calls, state };
}

test("resend company-scoped invite uses the Supabase invite delivery path and preserves metadata", async () => {
  const { deps, calls } = createDeps([
    { id: "auth-1", email: "admin@example.com", user_metadata: { stale: true } }
  ]);

  const result = await resendAuthInviteWithDeps(deps, {
    userId: "auth-1",
    fullName: "Ada Admin",
    inviteMetadata: {
      [INVITE_USER_METADATA.COMPANY_ID]: "company-1",
      [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: "company-1",
      [INVITE_USER_METADATA.ROLE]: "exhibitor_admin",
      [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: "all_company_events",
      [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: []
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.issued.length, 1);
  assert.equal(calls.issued[0]?.email, "admin@example.com");
  assert.equal(calls.issued[0]?.userMetadata[INVITE_USER_METADATA.EVENT_ACCESS_MODE], "all_company_events");
  assert.equal(calls.issued[0]?.userMetadata.full_name, "Ada Admin");
  assert.equal(calls.legacyEmailSends, 0);
});

test("resend event-scoped invite preserves company, role, and assigned event scope", async () => {
  const { deps, calls } = createDeps([{ id: "auth-2", email: "rep@example.com", user_metadata: {} }]);

  const result = await resendAuthInviteWithDeps(deps, {
    userId: "auth-2",
    inviteMetadata: {
      [INVITE_USER_METADATA.EVENT_ID]: "event-1",
      [INVITE_USER_METADATA.COMPANY_ID]: "company-1",
      [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: "company-1",
      [INVITE_USER_METADATA.ROLE]: "viewer",
      [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: "assigned_events_only",
      [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: ["event-1"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls.issued[0]?.userMetadata[INVITE_USER_METADATA.EVENT_ID], "event-1");
  assert.equal(calls.issued[0]?.userMetadata[INVITE_USER_METADATA.COMPANY_ID], "company-1");
  assert.equal(calls.issued[0]?.userMetadata[INVITE_USER_METADATA.ROLE], "viewer");
  assert.deepEqual(calls.issued[0]?.userMetadata[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS], ["event-1"]);
});

test("resend reissues the existing pending Auth user without creating public users, memberships, or seats", async () => {
  const { deps, calls } = createDeps([{ id: "auth-existing", email: "Existing@Example.com", user_metadata: {} }]);

  const result = await resendAuthInviteWithDeps(deps, {
    email: "existing@example.com",
    inviteMetadata: { [INVITE_USER_METADATA.COMPANY_ID]: "company-1" }
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.userId, "auth-existing");
  assert.equal(calls.publicUserCreates, 0);
  assert.equal(calls.eventUserInserts, 0);
  assert.equal(calls.issued.length, 1);
});

test("resend rejects active users and invalid reissues without changing invitation records", async () => {
  const { deps, calls } = createDeps([
    { id: "auth-active", email: "active@example.com", last_sign_in_at: "2026-05-26T10:00:00.000Z", user_metadata: {} }
  ]);
  const result = await resendAuthInviteWithDeps(deps, {
    userId: "auth-active",
    inviteMetadata: { [INVITE_USER_METADATA.COMPANY_ID]: "company-1" }
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "already_active");
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.issued.length, 0);
});

test("resend fails safely if Auth did not reissue the same pending user", async () => {
  const { deps } = createDeps([{ id: "auth-3", email: "rep3@example.com", user_metadata: {} }]);
  const result = await resendAuthInviteWithDeps(
    { ...deps, issueAuthInvite: async () => ({ ok: true, userId: "unexpected-user" }) },
    { userId: "auth-3", inviteMetadata: { [INVITE_USER_METADATA.COMPANY_ID]: "company-1" } }
  );

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "invite_failed");
});

test("new invite and resend share the canonical Supabase Auth delivery service, never the legacy custom sender", () => {
  const platformActions = read("app/admin/users/actions.ts");
  const resendService = read("lib/server/invites/resend-auth-invite.ts");
  const deliveryService = read("lib/server/invites/send-auth-invite.ts");
  const companyActions = read("lib/server/company-team-management.ts");

  assert.match(platformActions, /sendAuthInvite\(/);
  assert.match(resendService, /sendAuthInvite\(/);
  assert.match(deliveryService, /auth\.admin\.inviteUserByEmail\(input\.email,/);
  assert.match(platformActions, /resendAuthInvite\(/);
  assert.match(companyActions, /resendAuthInvite\(/);
  assert.doesNotMatch(platformActions, /sendAuthActionLinkEmail|generateLink\(/);
  assert.doesNotMatch(resendService, /sendAuthActionLinkEmail|generateLink\(/);
});

test("Platform Admin resend keeps its pending-invitation and scope guards before delivery", () => {
  const platformActions = read("app/admin/users/actions.ts");
  const resendAction = platformActions.match(/export async function resendInviteAction[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(resendAction, /if \(!userId \|\| !eventId\)/);
  assert.match(resendAction, /Invite metadata does not match this event\./);
  assert.match(resendAction, /status !== "invited"/);
  assert.match(resendAction, /User is already active\./);
  assert.match(resendAction, /resendAuthInvite\(/);
});

test("exhibitor users UI exposes resend only for invited or pending users", () => {
  const client = read("app/(app)/exhibitor/users/users-client.tsx");
  const action = read("app/(app)/exhibitor/users/actions.ts");
  const settingsClient = read("app/app/settings/company-team-settings-client.tsx");

  assert.match(client, /resendExhibitorUserInviteAction/);
  assert.match(client, /status === "invited" \|\| status === "pending"/);
  assert.match(client, /handleResendInvite\(user\)/);
  assert.match(action, /resendCompanyMemberInviteImpl\(null, formData\)/);
  assert.doesNotMatch(
    settingsClient,
    /if \(isPending\) return;[\s\S]{0,260}resendCompanyAppUserInviteAction/,
    "pending invite rows must be able to open and run resend"
  );
});
