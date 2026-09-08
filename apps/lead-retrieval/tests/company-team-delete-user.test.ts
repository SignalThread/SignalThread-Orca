import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyCompanyTeamUserFullyDeleted } from "../lib/exhibitor/company-team-delete-verify";

test("deleteCompanyTeamUserAction source: full delete, guards, reconcile, verify", () => {
  const src = readFileSync(path.join(process.cwd(), "lib/server/company-team-management.ts"), "utf8");
  assert.match(src, /export async function deleteCompanyTeamUserAction/);
  assert.match(src, /You cannot delete your own account/);
  assert.match(src, /Cannot delete the last company admin/);
  assert.match(src, /deleteAllEventUsersForUser/);
  assert.match(src, /deletePendingInviteCodesForCompanyEmail/);
  assert.match(src, /verifyCompanyTeamUserFullyDeleted/);
  assert.match(src, /auth\.admin\.deleteUser/);
  assert.match(src, /reconcileCompanyLicenseSeatsUsed/);
  assert.match(src, /reconcileLicenseSeatsUsed/);
  assert.match(src, /\.from\("users"\)\s*\n\s*\.delete\(\)/m);
});

test("team-actions exports deleteCompanyTeamUserAction", () => {
  const src = readFileSync(path.join(process.cwd(), "app/app/settings/team-actions.ts"), "utf8");
  assert.match(src, /deleteCompanyTeamUserAction/);
  assert.doesNotMatch(src, /removeCompanyMemberAction/);
});

test("Account settings client uses Delete user label and confirmation copy", () => {
  const src = readFileSync(
    path.join(process.cwd(), "app/app/settings/company-team-settings-client.tsx"),
    "utf8"
  );
  assert.match(src, />[\s\n]*Delete user/);
  assert.match(
    src,
    /This permanently deletes this user and removes their access to all events in this company/
  );
});

function mockSupabaseForDeleteVerify(input: {
  userRow: unknown | null;
  userError?: { message: string } | null;
  eventUsersCount: number | null;
  eventUsersError?: { message: string } | null;
  inviteCount?: number | null;
  inviteError?: { message: string } | null;
  authUser: unknown | null;
  authError?: { message: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "users") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: input.userRow,
                    error: input.userError ?? null
                  })
                };
              }
            };
          }
        };
      }
      if (table === "event_users") {
        return {
          select(_cols: string, opts: { count: string; head: boolean }) {
            assert.equal(opts.count, "exact");
            assert.equal(opts.head, true);
            return {
              eq: async () => ({
                count: input.eventUsersCount,
                error: input.eventUsersError ?? null
              })
            };
          }
        };
      }
      if (table === "invite_codes") {
        return {
          select(_cols: string, opts: { count: string; head: boolean }) {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      is: async () => ({
                        count: input.inviteCount ?? 0,
                        error: input.inviteError ?? null
                      })
                    };
                  }
                };
              }
            };
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: input.authUser },
          error: input.authError ?? null
        })
      }
    }
  };
}

test("verifyCompanyTeamUserFullyDeleted: fails when users row still exists", async () => {
  const r = await verifyCompanyTeamUserFullyDeleted({
    supabase: mockSupabaseForDeleteVerify({
      userRow: { id: "u1" },
      eventUsersCount: 0,
      authUser: null
    }) as any,
    userId: "u1",
    exhibitorCompanyId: "c1",
    userEmail: "a@b.co"
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assert.match(r.error, /profile still exists/i);
});

test("verifyCompanyTeamUserFullyDeleted: fails when event_users remain", async () => {
  const r = await verifyCompanyTeamUserFullyDeleted({
    supabase: mockSupabaseForDeleteVerify({
      userRow: null,
      eventUsersCount: 1,
      authUser: null
    }) as any,
    userId: "u1",
    exhibitorCompanyId: "c1",
    userEmail: "a@b.co"
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assert.match(r.error, /Event memberships still exist/i);
});

test("verifyCompanyTeamUserFullyDeleted: fails when pending invite codes remain", async () => {
  const r = await verifyCompanyTeamUserFullyDeleted({
    supabase: mockSupabaseForDeleteVerify({
      userRow: null,
      eventUsersCount: 0,
      inviteCount: 1,
      authUser: null
    }) as any,
    userId: "u1",
    exhibitorCompanyId: "c1",
    userEmail: "a@b.co"
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assert.match(r.error, /invite codes/i);
});

test("verifyCompanyTeamUserFullyDeleted: fails when auth user still exists", async () => {
  const r = await verifyCompanyTeamUserFullyDeleted({
    supabase: mockSupabaseForDeleteVerify({
      userRow: null,
      eventUsersCount: 0,
      authUser: { id: "u1" }
    }) as any,
    userId: "u1",
    exhibitorCompanyId: "c1",
    userEmail: "a@b.co"
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assert.match(r.error, /Auth user still exists/i);
});

test("verifyCompanyTeamUserFullyDeleted: succeeds when user, memberships, invites, and auth are gone", async () => {
  const r = await verifyCompanyTeamUserFullyDeleted({
    supabase: mockSupabaseForDeleteVerify({
      userRow: null,
      eventUsersCount: 0,
      inviteCount: 0,
      authUser: null
    }) as any,
    userId: "u1",
    exhibitorCompanyId: "c1",
    userEmail: "a@b.co"
  });
  assert.equal(r.ok, true);
});

test("verifyCompanyTeamUserFullyDeleted: auth not found error counts as success", async () => {
  const r = await verifyCompanyTeamUserFullyDeleted({
    supabase: mockSupabaseForDeleteVerify({
      userRow: null,
      eventUsersCount: 0,
      authUser: null,
      authError: { message: "User not found" }
    }) as any,
    userId: "u1",
    exhibitorCompanyId: "c1",
    userEmail: "a@b.co"
  });
  assert.equal(r.ok, true);
});
