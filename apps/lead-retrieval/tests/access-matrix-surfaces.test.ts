import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickValidatedEventIdForAccess } from "../lib/access/event-access-mode";
import {
  resolveAccessibleEventIdsForUserWithDeps,
  type ResolveAccessibleEventIdsDeps,
  type ResolveAccessibleEventIdsResult,
} from "../lib/server/company-event-access-core";
import { buildMobileEventsResponse, type MobileEventRow } from "../lib/mobile/mobile-events-core";

function makeDeps(overrides: Partial<ResolveAccessibleEventIdsDeps> = {}): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async () => null,
    loadCompanyLicenseEligibility: async () => false,
    loadCompanyOwnedEventIds: async () => [],
    loadAssignedCompanyEventIds: async () => [],
    loadLegacyEventIds: async () => [],
    loadOrganizerEventIds: async () => [],
    ...overrides,
  };
}

async function resolveFor(input: {
  role: string | null;
  companyId?: string | null;
  eventAccessMode?: "all_company_events" | "assigned_events_only" | null;
  licenseEligible?: boolean;
  companyOwnedEventIds?: string[];
  assignedEventIds?: string[];
  organizerEventIds?: string[];
}): Promise<ResolveAccessibleEventIdsResult> {
  return resolveAccessibleEventIdsForUserWithDeps(
    { userId: "user-a", nowMs: Date.UTC(2026, 5, 8) },
    makeDeps({
      loadUser: async () => ({
        id: "user-a",
        role: input.role,
        companyId: input.companyId ?? "company-a",
        eventAccessMode: input.eventAccessMode ?? null,
      }),
      loadCompanyLicenseEligibility: async (companyId) =>
        companyId === "company-a" && (input.licenseEligible ?? true),
      loadCompanyOwnedEventIds: async (companyId) =>
        companyId === "company-a" ? input.companyOwnedEventIds ?? ["event-a", "event-b"] : ["foreign-event"],
      loadAssignedCompanyEventIds: async (_userId, companyId) =>
        companyId === "company-a" ? input.assignedEventIds ?? [] : ["foreign-event"],
      loadLegacyEventIds: async (_userId, companyId) =>
        companyId === "company-a" ? input.assignedEventIds ?? [] : ["foreign-event"],
      loadOrganizerEventIds: async () => input.organizerEventIds ?? ["organizer-event"],
    })
  );
}

const eventScopedSurfaces = [
  "leads",
  "briefings",
  "import wizard",
  "campaigns",
  "signals",
  "team/users",
  "settings",
  "workflows",
  "mobile events endpoint",
] as const;

function canUseEvent(access: ResolveAccessibleEventIdsResult, eventId: string): boolean {
  if (access.resolution === "platform_all") return true;
  return access.eventIds.includes(eventId);
}

describe("access matrix by surface", () => {
  it("exhibitor_admin + all_company_events resolves every canonical company event for every surface", async () => {
    const access = await resolveFor({
      role: "exhibitor_admin",
      eventAccessMode: "all_company_events",
      companyOwnedEventIds: ["event-a", "event-b", "event-c"],
      assignedEventIds: [],
    });

    assert.equal(access.resolution, "company_all_events");
    assert.deepEqual(access.eventIds, ["event-a", "event-b", "event-c"]);
    for (const surface of eventScopedSurfaces) {
      assert.equal(canUseEvent(access, "event-b"), true, `${surface} should honor all-company event access`);
    }
  });

  it("exhibitor_admin + assigned_events_only resolves only assigned company events", async () => {
    const access = await resolveFor({
      role: "exhibitor_admin",
      eventAccessMode: "assigned_events_only",
      companyOwnedEventIds: ["event-a", "event-b", "event-c"],
      assignedEventIds: ["event-a", "event-c"],
    });

    assert.equal(access.resolution, "company_assigned_only");
    assert.deepEqual(access.eventIds, ["event-a", "event-c"]);
    for (const surface of eventScopedSurfaces) {
      assert.equal(canUseEvent(access, "event-a"), true, `${surface} should allow assigned event`);
      assert.equal(canUseEvent(access, "event-b"), false, `${surface} should reject unassigned event`);
    }
  });

  it("viewer roles remain assigned-event only and do not widen to all company events", async () => {
    for (const role of ["viewer", "exhibitor_viewer"] as const) {
      const access = await resolveFor({
        role,
        eventAccessMode: null,
        companyOwnedEventIds: ["event-a", "event-b"],
        assignedEventIds: ["event-a"],
      });

      assert.equal(access.resolution, "company_assigned_only");
      assert.deepEqual(access.eventIds, ["event-a"]);
      assert.equal(canUseEvent(access, "event-b"), false, `${role} should not inherit all company events`);
    }
  });

  it("wrong-company and wrong-event inputs fail the same canonical event check", async () => {
    const wrongCompany = await resolveFor({
      role: "exhibitor_admin",
      companyId: "company-b",
      eventAccessMode: "all_company_events",
      companyOwnedEventIds: ["event-a", "event-b"],
      assignedEventIds: ["event-a"],
    });
    assert.deepEqual(wrongCompany.eventIds, ["foreign-event"]);
    assert.equal(canUseEvent(wrongCompany, "event-a"), false);

    const wrongEvent = await resolveFor({
      role: "exhibitor_admin",
      eventAccessMode: "assigned_events_only",
      assignedEventIds: ["event-a"],
    });
    assert.equal(pickValidatedEventIdForAccess(wrongEvent.eventIds, "event-b"), "event-a");
    assert.equal(canUseEvent(wrongEvent, "event-b"), false);
  });

  it("platform and organizer models remain explicit special cases instead of exhibitor-company widening", async () => {
    const platform = await resolveFor({ role: "platform_admin", companyId: null });
    assert.equal(platform.resolution, "platform_all");
    assert.deepEqual(platform.eventIds, []);

    const organizer = await resolveFor({
      role: "organizer_admin",
      companyId: null,
      organizerEventIds: ["organizer-event-a", "organizer-event-b"],
    });
    assert.equal(organizer.resolution, "organizer_scope");
    assert.deepEqual(organizer.eventIds, ["organizer-event-a", "organizer-event-b"]);
    assert.equal(canUseEvent(organizer, "event-a"), false);
  });

  it("mobile endpoint payload does not let stale app permissions block exhibitor_admin, but still restricts viewers", () => {
    const eventRows: MobileEventRow[] = [
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
    ];

    const adminPayload = buildMobileEventsResponse({
      access: {
        eventIds: ["event-a", "event-b"],
        resolution: "company_all_events",
        companyId: "company-a",
        role: "exhibitor_admin",
      },
      eventRows,
      appEnabledEventIds: [],
    });
    assert.deepEqual(adminPayload.events.map((event) => event.id), ["event-a", "event-b"]);

    const viewerPayload = buildMobileEventsResponse({
      access: {
        eventIds: ["event-a", "event-b"],
        resolution: "company_assigned_only",
        companyId: "company-a",
        role: "exhibitor_viewer",
      },
      eventRows,
      appEnabledEventIds: ["event-b"],
    });
    assert.deepEqual(viewerPayload.events.map((event) => event.id), ["event-b"]);
  });
});
