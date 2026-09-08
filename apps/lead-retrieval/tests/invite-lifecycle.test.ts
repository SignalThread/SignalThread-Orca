import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { resolveAccessibleEventIdsForUserWithDeps } from "../lib/server/company-event-access-core";
import { buildMobileEventsResponse, type MobileEventRow } from "../lib/mobile/mobile-events-core";
import type { ResolveAccessibleEventIdsDeps } from "../lib/server/company-event-access-core";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function depsForActivatedUser(input: {
  role: "exhibitor_admin" | "exhibitor_viewer" | "viewer";
  eventAccessMode: "all_company_events" | "assigned_events_only" | null;
  assignedEvents: string[];
}): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async () => ({
      id: "user-a",
      role: input.role,
      companyId: "company-a",
      eventAccessMode: input.eventAccessMode,
    }),
    loadCompanyLicenseEligibility: async () => true,
    loadCompanyOwnedEventIds: async () => ["event-a", "event-b", "event-c"],
    loadAssignedCompanyEventIds: async () => input.assignedEvents,
    loadLegacyEventIds: async () => input.assignedEvents,
    loadOrganizerEventIds: async () => [],
  };
}

const mobileRows: MobileEventRow[] = [
  {
    id: "event-a",
    name: "Alpha",
    status: "active",
    is_active: true,
    start_date: "2026-06-01",
    end_date: "2026-06-02",
    location: null,
    city: null,
    state: null,
  },
  {
    id: "event-b",
    name: "Beta",
    status: "active",
    is_active: true,
    start_date: "2026-06-03",
    end_date: "2026-06-04",
    location: null,
    city: null,
    state: null,
  },
  {
    id: "event-c",
    name: "Gamma",
    status: "active",
    is_active: true,
    start_date: "2026-06-05",
    end_date: "2026-06-06",
    location: null,
    city: null,
    state: null,
  },
];

describe("invite -> login -> access lifecycle contracts", () => {
  it("exhibitor_admin all_company_events redeems to broad admin/mobile access without per-event rows", async () => {
    const inviteService = read("lib/server/company-scoped-invite.ts");
    const claimRoute = read("app/api/invites/claim/route.ts");

    assert.match(inviteService, /event_access_mode:\s*input\.eventAccessMode/);
    assert.match(read("tests/company-scoped-invite.test.ts"), /all_company_events with empty selected events creates the company user without explicit event rows/);
    assert.match(claimRoute, /expandGrantEventIdsForAllCompanyEventsMode/);
    assert.match(claimRoute, /listEventIdsForExhibitorCompany/);

    const access = await resolveAccessibleEventIdsForUserWithDeps(
      { userId: "user-a" },
      depsForActivatedUser({
        role: "exhibitor_admin",
        eventAccessMode: "all_company_events",
        assignedEvents: [],
      })
    );
    assert.equal(access.resolution, "company_all_events");
    assert.deepEqual(access.eventIds, ["event-a", "event-b", "event-c"]);

    const mobile = buildMobileEventsResponse({
      access,
      eventRows: mobileRows,
      appEnabledEventIds: [],
    });
    assert.deepEqual(mobile.events.map((event) => event.id), ["event-a", "event-b", "event-c"]);
  });

  it("exhibitor_admin assigned_events_only redeems to repaired event_users rows and only assigned access", async () => {
    const inviteService = read("lib/server/company-scoped-invite.ts");
    const accessAssignment = read("lib/server/user-invite-access-assignment.ts");
    const existingTests = read("tests/company-scoped-invite.test.ts");

    assert.match(inviteService, /selectedEventIds/);
    assert.match(accessAssignment, /\.from\("event_users"\)[\s\S]*\.eq\("exhibitor_company_id",\s*companyId\)/);
    assert.match(accessAssignment, /\.update\(\{[\s\S]*status:\s*desiredStatus,[\s\S]*permissions:\s*desiredPermissions/);
    assert.match(accessAssignment, /\.insert\(toInsert\)/);
    assert.match(existingTests, /existing event_users row is repaired instead of duplicated on reinvite/);

    const access = await resolveAccessibleEventIdsForUserWithDeps(
      { userId: "user-a" },
      depsForActivatedUser({
        role: "exhibitor_admin",
        eventAccessMode: "assigned_events_only",
        assignedEvents: ["event-b"],
      })
    );
    assert.equal(access.resolution, "company_assigned_only");
    assert.deepEqual(access.eventIds, ["event-b"]);
  });

  it("reinvite existing auth user repairs access without duplicates or downgrade", () => {
    const inviteService = read("lib/server/company-scoped-invite.ts");
    const accessAssignment = read("lib/server/user-invite-access-assignment.ts");
    const existingTests = read("tests/company-scoped-invite.test.ts");

    assert.match(inviteService, /isAuthUserAlreadyExistsError/);
    assert.match(inviteService, /findAuthUserByEmail/);
    assert.match(inviteService, /mergeInviteRedeemUserRole/);
    assert.match(accessAssignment, /const existing = new Set/);
    assert.match(accessAssignment, /filter\(\(id\) => !existing\.has\(id\)\)/);
    assert.match(existingTests, /existing same-company user reinvite updates safely, adds new events, and keeps prior valid access/);
    assert.match(existingTests, /reinvite must not create duplicate public\.users rows/);
  });

  it("viewer invite remains assigned-event and app-permission restricted for mobile", async () => {
    const claimRoute = read("app/api/invites/claim/route.ts");
    const permissionMapping = read("lib/exhibitor/exhibitor-invite-role.ts");

    assert.match(claimRoute, /activateInvitedMembershipWithSeatEnforcement/);
    assert.match(claimRoute, /ensureEventMembershipForInviteRedeem/);
    assert.match(permissionMapping, /v === "viewer" \|\| v === "exhibitor_viewer"/);
    assert.match(permissionMapping, /admin:\s*input\.role === "exhibitor_admin"/);
    assert.match(permissionMapping, /app:\s*Boolean\(input\.hasAppAccess\)/);

    const access = await resolveAccessibleEventIdsForUserWithDeps(
      { userId: "user-a" },
      depsForActivatedUser({
        role: "exhibitor_viewer",
        eventAccessMode: "assigned_events_only",
        assignedEvents: ["event-a", "event-b"],
      })
    );
    assert.deepEqual(access.eventIds, ["event-a", "event-b"]);

    const mobile = buildMobileEventsResponse({
      access,
      eventRows: mobileRows,
      appEnabledEventIds: ["event-b"],
    });
    assert.deepEqual(mobile.events.map((event) => event.id), ["event-b"]);
  });
});
