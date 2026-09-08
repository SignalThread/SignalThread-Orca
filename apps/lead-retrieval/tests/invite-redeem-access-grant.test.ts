import test from "node:test";
import assert from "node:assert/strict";

import { planInviteRedeem, expandGrantEventIdsForAllCompanyEventsMode } from "../lib/server/invites/invite-redeem-plan";
import {
  resolveAccessibleEventIdsForUserWithDeps,
  type ResolveAccessibleEventIdsDeps
} from "../lib/server/company-event-access-core";
import { pickExhibitorAppActiveEventId } from "../lib/exhibitor/exhibitor-app-active-event-logic";

/**
 * Simulates the post-redeem database state used by the canonical resolver,
 * then verifies the mobile Settings picker would land on the invited event.
 *
 * No I/O — we inject the deps `ResolveAccessibleEventIdsDeps` expects.
 */

type FakeWorld = {
  userId: string;
  companyId: string;
  role: string;
  eventAccessMode: "all_company_events" | "assigned_events_only";
  licenseEligible: boolean;
  companyOwnedEventIds: string[];
  userEventUsers: string[];
};

function makeResolverDeps(world: FakeWorld): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async (uid) =>
      uid === world.userId
        ? {
            id: world.userId,
            role: world.role,
            companyId: world.companyId,
            eventAccessMode: world.eventAccessMode
          }
        : null,
    loadCompanyLicenseEligibility: async () => world.licenseEligible,
    loadCompanyOwnedEventIds: async () => [...world.companyOwnedEventIds],
    loadAssignedCompanyEventIds: async (_u, _c, _r) => [...world.userEventUsers],
    loadLegacyEventIds: async (_u, _c, _r) => [...world.userEventUsers],
    loadOrganizerEventIds: async () => []
  };
}

test("all-events invite redeem: user gains access to every company event via resolver (licensed)", async () => {
  const invite = {
    id: "i1",
    event_id: "e1",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true } as unknown,
    event_access_mode: "all_company_events"
  };

  const pending = [
    { id: "i1", event_id: "e1" },
    { id: "i2", event_id: "e2" },
    { id: "i3", event_id: "e3" }
  ];

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pending
  });

  assert.equal(plan.userEventAccessMode, "all_company_events");
  assert.equal(plan.role, "exhibitor_viewer");
  assert.deepEqual(plan.grantEventIds, ["e1", "e2", "e3"]);

  const postRedeemEventIds = expandGrantEventIdsForAllCompanyEventsMode({
    userEventAccessMode: plan.userEventAccessMode,
    planGrantEventIds: plan.grantEventIds,
    companyOwnedEventIds: ["e1", "e2", "e3", "e4"]
  });
  assert.deepEqual(postRedeemEventIds, ["e1", "e2", "e3", "e4"]);

  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: plan.role,
    eventAccessMode: plan.userEventAccessMode,
    licenseEligible: true,
    companyOwnedEventIds: ["e1", "e2", "e3", "e4"],
    userEventUsers: postRedeemEventIds
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  assert.equal(resolved.resolution, "company_all_events");
  assert.deepEqual(resolved.eventIds.sort(), ["e1", "e2", "e3", "e4"]);
});

test("all-events invite redeem: unlicensed company falls back to legacy event_users (still covers invited set)", async () => {
  const invite = {
    id: "i1",
    event_id: "e1",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true } as unknown,
    event_access_mode: "all_company_events"
  };

  const pending = [
    { id: "i1", event_id: "e1" },
    { id: "i2", event_id: "e2" }
  ];

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pending
  });

  const postRedeemEventIds = expandGrantEventIdsForAllCompanyEventsMode({
    userEventAccessMode: plan.userEventAccessMode,
    planGrantEventIds: plan.grantEventIds,
    companyOwnedEventIds: ["e1", "e2", "e3"]
  });
  assert.deepEqual(postRedeemEventIds, ["e1", "e2", "e3"]);

  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: plan.role,
    eventAccessMode: plan.userEventAccessMode,
    licenseEligible: false,
    companyOwnedEventIds: ["e1", "e2", "e3"],
    userEventUsers: postRedeemEventIds
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  assert.equal(resolved.resolution, "legacy_event_scoped");
  assert.deepEqual(resolved.eventIds.sort(), ["e1", "e2", "e3"]);
});

test("specific-event invite redeem: grants exactly the invited event", async () => {
  const invite = {
    id: "i1",
    event_id: "e2",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true } as unknown,
    event_access_mode: "assigned_events_only"
  };

  const pending = [
    { id: "i1", event_id: "e2" },
    { id: "i2", event_id: "e3" }
  ];

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: pending
  });

  assert.equal(plan.userEventAccessMode, "assigned_events_only");
  assert.deepEqual(plan.grantEventIds, ["e2"]);
  assert.deepEqual(plan.consumeInviteIds, ["i1"]);

  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: plan.role,
    eventAccessMode: plan.userEventAccessMode,
    licenseEligible: true,
    companyOwnedEventIds: ["e1", "e2", "e3"],
    userEventUsers: plan.grantEventIds
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  assert.equal(resolved.resolution, "company_assigned_only");
  assert.deepEqual(resolved.eventIds, ["e2"]);
});

test("mobile active event picker returns the redeemed event id when no URL/cookie override is present", async () => {
  const invite = {
    id: "i1",
    event_id: "e-redeemed",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true } as unknown,
    event_access_mode: "assigned_events_only"
  };

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: [{ id: "i1", event_id: "e-redeemed" }]
  });

  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: plan.role,
    eventAccessMode: plan.userEventAccessMode,
    licenseEligible: true,
    companyOwnedEventIds: ["e-other", "e-redeemed"],
    userEventUsers: plan.grantEventIds
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  const active = pickExhibitorAppActiveEventId(resolved.eventIds, null, null);
  assert.equal(active, "e-redeemed");
});

test("mobile active event picker honors a valid URL override inside the accessible set", async () => {
  const invite = {
    id: "i1",
    event_id: "e1",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true } as unknown,
    event_access_mode: "all_company_events"
  };

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: [
      { id: "i1", event_id: "e1" },
      { id: "i2", event_id: "e2" }
    ]
  });

  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: plan.role,
    eventAccessMode: plan.userEventAccessMode,
    licenseEligible: true,
    companyOwnedEventIds: ["e1", "e2"],
    userEventUsers: plan.grantEventIds
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  const active = pickExhibitorAppActiveEventId(resolved.eventIds, "e2", null);
  assert.equal(active, "e2");
});

test("mobile active event picker ignores URL/cookie values outside the accessible set", async () => {
  const invite = {
    id: "i1",
    event_id: "e1",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true } as unknown,
    event_access_mode: "assigned_events_only"
  };

  const plan = planInviteRedeem({
    inviteRow: invite,
    pendingRowsSameEmailAndCompany: [{ id: "i1", event_id: "e1" }]
  });

  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: plan.role,
    eventAccessMode: plan.userEventAccessMode,
    licenseEligible: true,
    companyOwnedEventIds: ["e1", "e2"],
    userEventUsers: plan.grantEventIds
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  const active = pickExhibitorAppActiveEventId(resolved.eventIds, "e-unknown", "e-also-unknown");
  assert.equal(active, "e1");
});

test("expired/inactive: no invite redeem means no event_users rows and no accessible events", async () => {
  // Simulates the case where all invite rows were expired or already used —
  // the redeem route would have rejected the request earlier, so no event_users
  // rows exist. The resolver must return the empty set (never leak access).
  const world: FakeWorld = {
    userId: "u1",
    companyId: "co1",
    role: "exhibitor_viewer",
    eventAccessMode: "assigned_events_only",
    licenseEligible: true,
    companyOwnedEventIds: ["e1", "e2"],
    userEventUsers: []
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u1" },
    makeResolverDeps(world)
  );

  assert.deepEqual(resolved.eventIds, []);
  const active = pickExhibitorAppActiveEventId(resolved.eventIds, null, null);
  assert.equal(active, null);
});

test("expired/inactive: user with no companyId (pre-redeem) cannot access any event", async () => {
  const deps: ResolveAccessibleEventIdsDeps = {
    loadUser: async () => ({
      id: "u1",
      role: "exhibitor_viewer",
      companyId: null,
      eventAccessMode: "all_company_events"
    }),
    loadCompanyLicenseEligibility: async () => true,
    loadCompanyOwnedEventIds: async () => ["e1", "e2"],
    loadAssignedCompanyEventIds: async (_u, _c, _r) => [],
    loadLegacyEventIds: async (_u, _c, _r) => [],
    loadOrganizerEventIds: async () => []
  };

  const resolved = await resolveAccessibleEventIdsForUserWithDeps({ userId: "u1" }, deps);
  assert.equal(resolved.resolution, "none");
  assert.deepEqual(resolved.eventIds, []);
});
