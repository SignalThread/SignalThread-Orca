import test from "node:test";
import assert from "node:assert/strict";

import {
  mayUseExhibitorAppEventResolution,
  pickExhibitorAppActiveEventId
} from "../lib/exhibitor/exhibitor-app-active-event-logic";
import {
  resolveAccessibleEventIdsForUserWithDeps,
  type ResolveAccessibleEventIdsDeps
} from "../lib/server/company-event-access-core";

function platformAdminDeps(companyEvents: string[]): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async () => ({
      id: "platform-admin",
      role: "platform_admin",
      companyId: null,
      eventAccessMode: null
    }),
    loadCompanyLicenseEligibility: async () => {
      throw new Error("platform-admin company context must not use exhibitor license access");
    },
    loadCompanyOwnedEventIds: async () => companyEvents,
    loadAssignedCompanyEventIds: async () => {
      throw new Error("platform-admin company context must not require event_users membership");
    },
    loadLegacyEventIds: async () => {
      throw new Error("platform-admin company context must not require event_users membership");
    },
    loadOrganizerEventIds: async () => []
  };
}

test("exhibitor admin: explicit accessible eventId wins over an unrelated active-event preference", () => {
  assert.equal(mayUseExhibitorAppEventResolution("exhibitor_admin", "company_all_events"), true);
  assert.equal(pickExhibitorAppActiveEventId(["evt-a", "evt-b"], "evt-b", "evt-a"), "evt-b");
});

test("platform admin viewing a company: explicit owned eventId resolves without event_users membership", async () => {
  const access = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "platform-admin", platformAdminCompanyId: "sanity-company" },
    platformAdminDeps(["evt-sanity"])
  );

  assert.equal(access.resolution, "company_all_events");
  assert.equal(access.companyId, "sanity-company");
  assert.equal(mayUseExhibitorAppEventResolution(access.role, access.resolution), true);
  assert.equal(pickExhibitorAppActiveEventId(access.eventIds, "evt-sanity", "other-active-event"), "evt-sanity");
});

test("platform admin viewing a company: another company's eventId is not resolved", async () => {
  const access = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "platform-admin", platformAdminCompanyId: "sanity-company" },
    platformAdminDeps(["evt-sanity"])
  );

  assert.equal(access.eventIds.includes("evt-other-company"), false);
  assert.notEqual(
    pickExhibitorAppActiveEventId(access.eventIds, "evt-other-company", null),
    "evt-other-company"
  );
});

test("invalid explicit eventId is not accepted as the resolved event", () => {
  assert.notEqual(pickExhibitorAppActiveEventId(["evt-sanity"], "not-a-real-event", null), "not-a-real-event");
});
