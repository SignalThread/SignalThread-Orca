import test from "node:test";
import assert from "node:assert/strict";
import { executeCreateEventMutation } from "../lib/events/create-event-mutation-core";
import { resolveAccessibleEventIdsForUserWithDeps, type ResolveAccessibleEventIdsDeps } from "../lib/server/company-event-access-core";
import {
  EXHIBITOR_EVENTS_CREATE_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  getExhibitorNavItemsForSidebar,
  isExhibitorEntryPathAllowedWithNoEvents
} from "../lib/exhibitor/exhibitor-app-nav";

function buildResolverDeps(overrides: Partial<ResolveAccessibleEventIdsDeps>): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async () => ({
      id: "user_exhibitor",
      role: "exhibitor_admin",
      companyId: "company_foo",
      eventAccessMode: "assigned_events_only"
    }),
    loadCompanyLicenseEligibility: async () => true,
    loadCompanyOwnedEventIds: async () => [],
    loadAssignedCompanyEventIds: async (_u, _c, _r) => [],
    loadLegacyEventIds: async (_u, _c, _r) => [],
    loadOrganizerEventIds: async () => [],
    ...overrides
  };
}

test("exhibitor_admin with zero events: sees Manage + Settings + Help (account mode)", () => {
  const items = getExhibitorNavItemsForSidebar({ mode: "account" });
  assert.equal(items.length, 3);
  assert.equal(items[0].href, EXHIBITOR_EVENTS_ENTRY_HREF);
  assert.equal(items[1].href, "/app/settings");
  assert.equal(items[1].label, "Settings");
  assert.equal(items[2].href, "/help");
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_EVENTS_CREATE_HREF), true);
});

test("exhibitor_admin: zero events → create → resolver widens → full nav restored", async () => {
  const assignedByUser = new Map<string, string[]>();
  const deps = buildResolverDeps({
    loadAssignedCompanyEventIds: async (userId, _c, _r) => assignedByUser.get(userId) ?? []
  });

  const before = await resolveAccessibleEventIdsForUserWithDeps({ userId: "user_exhibitor" }, deps);
  assert.deepEqual(before.eventIds, [], "no events before create");
  assert.equal(before.licenseEligible, true);
  assert.equal(
    getExhibitorNavItemsForSidebar({
      mode: before.eventIds.length > 0 ? "event" : "account"
    }).length,
    3
  );

  let insertedEventId: string | null = null;
  const create = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "user_exhibitor", companyId: "company_foo" },
    {
      companyId: "company_foo",
      name: "Spring Showcase 2026",
      timezone: "America/New_York",
      city: null,
      state: null,
      startDate: null,
      endDate: null,
      status: "UPCOMING"
    },
    {
      evaluateExhibitorEntitlement: async () => ({
        allowed: true,
        reason: "allowed",
        message: "ok",
        licenseId: "lic_1",
        currentEventCount: 0,
        maxEvents: null
      }),
      insertEvent: async () => {
        insertedEventId = "evt_new_1";
        return { eventId: insertedEventId, errorMessage: null };
      }
    }
  );

  assert.equal(create.ok, true);
  if (!create.ok) throw new Error("create failed");
  assert.equal(create.eventId, "evt_new_1");
  assert.ok(insertedEventId);

  assignedByUser.set("user_exhibitor", [insertedEventId!]);

  const after = await resolveAccessibleEventIdsForUserWithDeps({ userId: "user_exhibitor" }, deps);
  assert.deepEqual(after.eventIds, ["evt_new_1"], "resolver now sees created event via canonical channels");
  // Once accessible events exist, the sidebar can render the full event-mode nav
  // (event-route URLs would resolve to "event" via resolveExhibitorSidebarMode).
  const afterNav = getExhibitorNavItemsForSidebar({
    mode: after.eventIds.length > 0 ? "event" : "account",
    activeEventId: after.eventIds[0] ?? null
  });
  assert.ok(afterNav.length > 3, "full exhibitor nav restored post-create");
  assert.ok(afterNav.some((i) => i.href === "/exhibitor/dashboard"));
  assert.ok(afterNav.some((i) => i.href === "/exhibitor/leads"));
});

test("exhibitor_admin cannot create for a different company", async () => {
  const result = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "user_exhibitor", companyId: "company_foo" },
    {
      companyId: "company_bar",
      name: "Bad Scope",
      timezone: "America/New_York",
      city: null,
      state: null,
      startDate: null,
      endDate: null,
      status: "UPCOMING"
    },
    {
      evaluateExhibitorEntitlement: async () => {
        throw new Error("entitlement should not be evaluated on scope mismatch");
      },
      insertEvent: async () => {
        throw new Error("insert should not run");
      }
    }
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.equal(result.status, 403);
  assert.equal(result.error.code, "EVENT_CREATION_EXHIBITOR_SCOPE_MISMATCH");
});
