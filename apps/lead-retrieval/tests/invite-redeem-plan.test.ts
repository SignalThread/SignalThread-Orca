import test from "node:test";
import assert from "node:assert/strict";

import {
  InviteRedeemRoleMappingError,
  publicUsersRoleFromInvitePermissions
} from "../lib/server/invites/invite-permissions-public-users-role";
import {
  InviteRedeemNoEventsError,
  planInviteRedeem,
  expandGrantEventIdsForAllCompanyEventsMode,
  normalizePermissions,
  roleForPermissions,
  type InviteRedeemInviteRow,
  type InviteRedeemPendingRow
} from "../lib/server/invites/invite-redeem-plan";

function makeInvite(overrides: Partial<InviteRedeemInviteRow> = {}): InviteRedeemInviteRow {
  return {
    id: "invite-1",
    event_id: "ev-1",
    exhibitor_company_id: "co-1",
    email: "booth@example.com",
    permissions: { admin: false, app: true },
    event_access_mode: "assigned_events_only",
    ...overrides
  };
}

function pending(id: string, eventId: string): InviteRedeemPendingRow {
  return { id, event_id: eventId };
}

test("normalizePermissions: object / array / missing forms", () => {
  assert.deepEqual(normalizePermissions({ admin: true, app: true }), { admin: true, app: true });
  assert.deepEqual(normalizePermissions({ admin: false, app: true }), { admin: false, app: true });
  assert.deepEqual(normalizePermissions(["app"]), { admin: false, app: true });
  assert.deepEqual(normalizePermissions(["admin"]), { admin: true, app: false });
  assert.deepEqual(normalizePermissions(null), { admin: false, app: false });
  assert.deepEqual(normalizePermissions({ app: "true", admin: "false" }), { admin: false, app: true });
});

test("roleForPermissions: delegates to canonical mapper", () => {
  assert.equal(roleForPermissions({ admin: true, app: true }), "exhibitor_admin");
  assert.equal(roleForPermissions({ admin: true, app: false }), "exhibitor_admin");
  assert.equal(roleForPermissions({ admin: false, app: true }), "exhibitor_viewer");
});

test("publicUsersRoleFromInvitePermissions: rejects missing app and admin flags", () => {
  assert.throws(
    () => publicUsersRoleFromInvitePermissions({ admin: false, app: false }),
    InviteRedeemRoleMappingError
  );
});

test("publicUsersRoleFromInvitePermissions: admin=true without app still maps to exhibitor_admin", () => {
  assert.equal(publicUsersRoleFromInvitePermissions({ admin: true, app: false }), "exhibitor_admin");
});

test("plan (all_company_events): consumes every pending code + grants every pending event_id", () => {
  const invite = makeInvite({
    id: "i1",
    event_id: "e1",
    event_access_mode: "all_company_events"
  });
  const pendingList: InviteRedeemPendingRow[] = [
    pending("i1", "e1"),
    pending("i2", "e2"),
    pending("i3", "e3")
  ];

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pendingList
  });

  assert.equal(plan.userEventAccessMode, "all_company_events");
  assert.equal(plan.role, "exhibitor_viewer");
  assert.deepEqual(plan.grantEventIds, ["e1", "e2", "e3"]);
  assert.deepEqual(plan.consumeInviteIds, ["i1", "i2", "i3"]);
});

test("plan (all_company_events): redeemed row may not appear in pending list; planner still covers it", () => {
  const invite = makeInvite({
    id: "iRedeemed",
    event_id: "eR",
    event_access_mode: "all_company_events"
  });
  const pendingList: InviteRedeemPendingRow[] = [pending("i2", "e2"), pending("i3", "e3")];

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pendingList
  });

  assert.deepEqual(plan.grantEventIds, ["eR", "e2", "e3"]);
  assert.deepEqual(plan.consumeInviteIds, ["iRedeemed", "i2", "i3"]);
});

test("plan (assigned_events_only): grants only the invited event; consumes only that invite", () => {
  const invite = makeInvite({
    id: "i1",
    event_id: "e1",
    event_access_mode: "assigned_events_only"
  });
  const pendingList: InviteRedeemPendingRow[] = [
    pending("i1", "e1"),
    pending("i2", "e2")
  ];

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pendingList
  });

  assert.equal(plan.userEventAccessMode, "assigned_events_only");
  assert.deepEqual(plan.grantEventIds, ["e1"]);
  assert.deepEqual(plan.consumeInviteIds, ["i1"]);
});

test("planInviteRedeem throws InviteRedeemRoleMappingError when permissions are empty", () => {
  const invite = makeInvite({ permissions: { admin: false, app: false } });
  assert.throws(
    () =>
      planInviteRedeem({
        inviteRow: invite,
        pendingRowsSameEmailAndCompany: [pending(invite.id, invite.event_id ?? "")]
      }),
    InviteRedeemRoleMappingError
  );
});

test("plan: app-only invite (permissions.admin=false) produces role=exhibitor_viewer", () => {
  const invite = makeInvite({
    permissions: { admin: false, app: true },
    event_access_mode: "all_company_events"
  });
  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: [pending(invite.id, invite.event_id ?? "")]
  });
  assert.equal(plan.role, "exhibitor_viewer");
});

test("plan: admin-flag invite produces role=exhibitor_admin", () => {
  const invite = makeInvite({
    permissions: { admin: true, app: true },
    event_access_mode: "all_company_events"
  });
  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: [pending(invite.id, invite.event_id ?? "")]
  });
  assert.equal(plan.role, "exhibitor_admin");
});

test("plan: unknown event_access_mode defaults safely (all_company_events default from normalizer)", () => {
  const invite = makeInvite({ event_access_mode: "bogus" });
  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: [pending(invite.id, invite.event_id ?? "")]
  });
  assert.ok(
    plan.userEventAccessMode === "all_company_events" ||
      plan.userEventAccessMode === "assigned_events_only",
    "must normalize to one of the canonical modes"
  );
});

test("expandGrantEventIdsForAllCompanyEventsMode: all-company mode unions DB catalog + invite union", () => {
  const out = expandGrantEventIdsForAllCompanyEventsMode({
    userEventAccessMode: "all_company_events",
    planGrantEventIds: ["e1", "e2"],
    companyOwnedEventIds: ["e2", "e3", "e4"]
  });
  assert.deepEqual(out.slice().sort(), ["e1", "e2", "e3", "e4"]);
});

test("expandGrantEventIdsForAllCompanyEventsMode: assigned mode passes plan only", () => {
  const out = expandGrantEventIdsForAllCompanyEventsMode({
    userEventAccessMode: "assigned_events_only",
    planGrantEventIds: ["e9"],
    companyOwnedEventIds: ["e1", "e2", "e3"]
  });
  assert.deepEqual(out, ["e9"]);
});

test("expandGrantEventIdsForAllCompanyEventsMode: empty company + plan throws", () => {
  assert.throws(
    () =>
      expandGrantEventIdsForAllCompanyEventsMode({
        userEventAccessMode: "all_company_events",
        planGrantEventIds: [],
        companyOwnedEventIds: []
      }),
    InviteRedeemNoEventsError
  );
});

test("plan (all_company_events): deduplicates identical event_ids across pending rows", () => {
  const invite = makeInvite({
    id: "i1",
    event_id: "e1",
    event_access_mode: "all_company_events"
  });
  const pendingList: InviteRedeemPendingRow[] = [
    pending("i1", "e1"),
    pending("i2", "e1"),
    pending("i3", "e2")
  ];
  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pendingList
  });
  assert.deepEqual(plan.grantEventIds, ["e1", "e2"]);
  assert.deepEqual(plan.consumeInviteIds, ["i1", "i2", "i3"]);
});

test("planInviteRedeem: assigned_events_only with whitespace-only event_id throws InviteRedeemNoEventsError", () => {
  const invite = makeInvite({ event_id: "  \t  " });
  assert.throws(
    () =>
      planInviteRedeem({
        inviteRow: invite,
        pendingRowsSameEmailAndCompany: [pending("i1", "e1")]
      }),
    InviteRedeemNoEventsError
  );
});

test("planInviteRedeem: all_company_events with no resolvable event ids throws InviteRedeemNoEventsError", () => {
  const invite = makeInvite({
    event_id: "   ",
    event_access_mode: "all_company_events"
  });
  assert.throws(
    () =>
      planInviteRedeem({
        inviteRow: invite,
        pendingRowsSameEmailAndCompany: [pending("i1", "  ")]
      }),
    InviteRedeemNoEventsError
  );
});

test("plan: ignores pending rows with empty/null event_id (safety)", () => {
  const invite = makeInvite({
    id: "i1",
    event_id: "e1",
    event_access_mode: "all_company_events"
  });
  const pendingList: InviteRedeemPendingRow[] = [
    pending("i1", "e1"),
    pending("i2", ""),
    { id: "i3", event_id: null },
    pending("i4", "e2")
  ];
  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pendingList
  });
  assert.deepEqual(plan.grantEventIds, ["e1", "e2"]);
  assert.deepEqual(plan.consumeInviteIds, ["i1", "i2", "i3", "i4"]);
});
