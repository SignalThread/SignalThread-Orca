import test from "node:test";
import assert from "node:assert/strict";

import {
  computeCompanyEventAccessSet,
  normalizeEventAccessMode,
  parseEventAccessModeColumn,
  pickValidatedEventIdForAccess,
  DEFAULT_EVENT_ACCESS_MODE,
  type EventAccessMode
} from "../lib/access/event-access-mode";
import {
  resolveAccessibleEventIdsForUserWithDeps,
  type ResolveAccessibleEventIdsDeps
} from "../lib/server/company-event-access-core";

function makeDeps(overrides: Partial<ResolveAccessibleEventIdsDeps> = {}): ResolveAccessibleEventIdsDeps {
  return {
    loadUser: async () => null,
    loadCompanyLicenseEligibility: async () => false,
    loadCompanyOwnedEventIds: async () => [],
    loadAssignedCompanyEventIds: async (_u, _c, _r) => [],
    loadLegacyEventIds: async (_u, _c, _r) => [],
    loadOrganizerEventIds: async () => [],
    ...overrides
  };
}

test("normalizeEventAccessMode: recognizes both modes; defaults safely", () => {
  assert.equal(normalizeEventAccessMode("all_company_events"), "all_company_events");
  assert.equal(normalizeEventAccessMode("assigned_events_only"), "assigned_events_only");
  assert.equal(normalizeEventAccessMode("ALL_COMPANY_EVENTS"), "all_company_events");
  assert.equal(normalizeEventAccessMode(null), DEFAULT_EVENT_ACCESS_MODE);
  assert.equal(normalizeEventAccessMode("bogus"), DEFAULT_EVENT_ACCESS_MODE);
});

test("parseEventAccessModeColumn: unset column distinct from explicit default", () => {
  assert.equal(parseEventAccessModeColumn(null), null);
  assert.equal(parseEventAccessModeColumn(""), null);
  assert.equal(parseEventAccessModeColumn("   "), null);
  assert.equal(parseEventAccessModeColumn("assigned_events_only"), "assigned_events_only");
  assert.equal(parseEventAccessModeColumn("all_company_events"), "all_company_events");
  assert.equal(parseEventAccessModeColumn("bogus"), DEFAULT_EVENT_ACCESS_MODE);
});

test("computeCompanyEventAccessSet: licensed + all_company_events => company-owned events", () => {
  const r = computeCompanyEventAccessSet({
    licenseEligible: true,
    eventAccessMode: "all_company_events",
    companyOwnedEventIds: ["e1", "e2", "e3"],
    assignedCompanyEventIds: ["e1"],
    legacyEventIds: ["e9"]
  });
  assert.equal(r.resolution, "company_all_events");
  assert.deepEqual(r.eventIds, ["e1", "e2", "e3"]);
});

test("computeCompanyEventAccessSet: licensed + assigned_events_only => only assigned", () => {
  const r = computeCompanyEventAccessSet({
    licenseEligible: true,
    eventAccessMode: "assigned_events_only",
    companyOwnedEventIds: ["e1", "e2", "e3", "e4"],
    assignedCompanyEventIds: ["e1", "e2"],
    legacyEventIds: ["e9"]
  });
  assert.equal(r.resolution, "company_assigned_only");
  assert.deepEqual(r.eventIds, ["e1", "e2"]);
  assert.equal(r.eventIds.includes("e3"), false);
  assert.equal(r.eventIds.includes("e4"), false);
});

test("computeCompanyEventAccessSet: no eligible license => legacy event_users set regardless of mode", () => {
  const legacy = ["legacy-1", "legacy-2"];
  const a = computeCompanyEventAccessSet({
    licenseEligible: false,
    eventAccessMode: "all_company_events",
    companyOwnedEventIds: ["e1", "e2"],
    assignedCompanyEventIds: ["e1"],
    legacyEventIds: legacy
  });
  assert.equal(a.resolution, "legacy_event_scoped");
  assert.deepEqual(a.eventIds, legacy);

  const b = computeCompanyEventAccessSet({
    licenseEligible: false,
    eventAccessMode: "assigned_events_only",
    companyOwnedEventIds: ["e1"],
    assignedCompanyEventIds: ["e1"],
    legacyEventIds: legacy
  });
  assert.equal(b.resolution, "legacy_event_scoped");
  assert.deepEqual(b.eventIds, legacy);
});

test("assigned_events_only MUST NOT widen when license becomes valid", () => {
  const assigned = ["only-this"];
  const companyOwned = ["only-this", "other-a", "other-b"];
  const r = computeCompanyEventAccessSet({
    licenseEligible: true,
    eventAccessMode: "assigned_events_only",
    companyOwnedEventIds: companyOwned,
    assignedCompanyEventIds: assigned,
    legacyEventIds: []
  });
  assert.deepEqual(r.eventIds, assigned);
});

test("all_company_events MUST NOT activate without valid license", () => {
  const r = computeCompanyEventAccessSet({
    licenseEligible: false,
    eventAccessMode: "all_company_events",
    companyOwnedEventIds: ["e1", "e2"],
    assignedCompanyEventIds: [],
    legacyEventIds: ["legacy-only"]
  });
  assert.equal(r.resolution, "legacy_event_scoped");
  assert.deepEqual(r.eventIds, ["legacy-only"]);
});

test("pickValidatedEventIdForAccess: accepts accessible, rejects others, fallback to first", () => {
  assert.equal(pickValidatedEventIdForAccess(["a", "b"], "b"), "b");
  assert.equal(pickValidatedEventIdForAccess(["a", "b"], "c"), "a");
  assert.equal(pickValidatedEventIdForAccess(["a", "b"], null), "a");
  assert.equal(pickValidatedEventIdForAccess([], "a"), null);
});

/* ---------- Resolver orchestration (deps-injected) ---------- */

test("resolver: exhibitor_admin with eligible license + all_company_events => all company events", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "all_company_events"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => ["e1", "e2", "e3"]
    })
  );
  assert.equal(r.resolution, "company_all_events");
  assert.equal(r.licenseEligible, true);
  assert.equal(r.eventAccessMode, "all_company_events");
  assert.deepEqual(r.eventIds, ["e1", "e2", "e3"]);
});

test("resolver: exhibitor_admin with eligible license + assigned_events_only => only assigned", async () => {
  let companyOwnedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "assigned_events_only"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["e1", "e2", "e3", "e4"];
      },
      loadAssignedCompanyEventIds: async (_u, _c, _r) => ["e1", "e2"]
    })
  );
  assert.equal(r.resolution, "company_assigned_only");
  assert.deepEqual(r.eventIds, ["e1", "e2"]);
  assert.equal(companyOwnedLoaded, 0);
});

test("resolver: assigned_events_only + zero assigned => empty ids (never widen to company-owned)", async () => {
  let companyOwnedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "assigned_events_only"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadAssignedCompanyEventIds: async (_u, _c, _r) => [],
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["owned-1", "owned-2"];
      }
    })
  );
  assert.equal(r.resolution, "company_assigned_only");
  assert.deepEqual(r.eventIds, []);
  assert.equal(companyOwnedLoaded, 0);
});

test("active event: assigned_events_only + zero assigned + unrelated preferred => null", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "assigned_events_only"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadAssignedCompanyEventIds: async (_u, _c, _r) => []
    })
  );
  assert.deepEqual(r.eventIds, []);
  assert.equal(pickValidatedEventIdForAccess(r.eventIds, "unrelated-event"), null);
});

test("active event: assigned_events_only + one assigned + unrelated preferred => that event", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "assigned_events_only"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadAssignedCompanyEventIds: async (_u, _c, _r) => ["only-e"]
    })
  );
  assert.deepEqual(r.eventIds, ["only-e"]);
  assert.equal(pickValidatedEventIdForAccess(r.eventIds, "other"), "only-e");
});

test("active event: all_company_events + no preferred => first accessible", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "all_company_events"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => ["e-first", "e-second"]
    })
  );
  assert.equal(pickValidatedEventIdForAccess(r.eventIds, null), "e-first");
  assert.equal(pickValidatedEventIdForAccess(r.eventIds, undefined), "e-first");
});

test("resolver: assigned_events_only => cannot access unassigned company event", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "assigned_events_only"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadAssignedCompanyEventIds: async (_u, _c, _r) => ["e1"]
    })
  );
  assert.equal(r.eventIds.includes("e1"), true);
  assert.equal(r.eventIds.includes("e2"), false);
  assert.equal(r.eventIds.includes("e3"), false);
});

test("resolver: exhibitor user without eligible license => legacy event_users scope (not widened)", async () => {
  let companyOwnedLoaded = 0;
  let assignedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-1" },
    makeDeps({
      loadUser: async () => ({
        id: "u-1",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: "all_company_events"
      }),
      loadCompanyLicenseEligibility: async () => false,
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["e1", "e2", "e3"];
      },
      loadAssignedCompanyEventIds: async (_u, _c, _r) => {
        assignedLoaded += 1;
        return [];
      },
      loadLegacyEventIds: async (_u, _c, _r) => ["legacy-e"]
    })
  );
  assert.equal(r.resolution, "legacy_event_scoped");
  assert.equal(r.licenseEligible, false);
  assert.deepEqual(r.eventIds, ["legacy-e"]);
  assert.equal(companyOwnedLoaded, 0);
  assert.equal(assignedLoaded, 0);
});

test("resolver: company app user (viewer) follows same company rule", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-viewer" },
    makeDeps({
      loadUser: async () => ({
        id: "u-viewer",
        role: "viewer",
        companyId: "co-A",
        eventAccessMode: "all_company_events"
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => ["e1", "e2"]
    })
  );
  assert.equal(r.resolution, "company_all_events");
  assert.deepEqual(r.eventIds, ["e1", "e2"]);
});

test("resolver: licensed exhibitor_admin with unset event_access_mode defaults to all_company_events", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-admin" },
    makeDeps({
      loadUser: async () => ({
        id: "u-admin",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: null
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => ["e1", "e2", "e3"]
    })
  );
  assert.equal(r.resolution, "company_all_events");
  assert.deepEqual(r.eventIds, ["e1", "e2", "e3"]);
});

test("resolver: licensed exhibitor_admin with unset mode but active memberships uses assigned_events_only", async () => {
  let companyOwnedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-admin-partial" },
    makeDeps({
      loadUser: async () => ({
        id: "u-admin-partial",
        role: "exhibitor_admin",
        companyId: "co-A",
        eventAccessMode: null
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadAssignedCompanyEventIds: async (_u, _c, _r) => ["tech-summit-2026"],
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["full-test", "global-shindig", "tech-summit-2026"];
      }
    })
  );
  assert.equal(r.resolution, "company_assigned_only");
  assert.deepEqual(r.eventIds, ["tech-summit-2026"]);
  assert.equal(companyOwnedLoaded, 0);
});

test("resolver: licensed exhibitor_viewer with unset event_access_mode uses assigned_events_only (Settings-style scope)", async () => {
  let companyOwnedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-ev" },
    makeDeps({
      loadUser: async () => ({
        id: "u-ev",
        role: "exhibitor_viewer",
        companyId: "co-A",
        eventAccessMode: null
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["e-extra-1", "e-extra-2", "tech-summit-2026"];
      },
      loadAssignedCompanyEventIds: async (_u, _c, _r) => ["tech-summit-2026"]
    })
  );
  assert.equal(r.resolution, "company_assigned_only");
  assert.deepEqual(r.eventIds, ["tech-summit-2026"]);
  assert.equal(companyOwnedLoaded, 0);
});

test("resolver: licensed viewer role with unset event_access_mode uses assigned_events_only", async () => {
  let companyOwnedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-viewer-null-mode" },
    makeDeps({
      loadUser: async () => ({
        id: "u-viewer-null-mode",
        role: "viewer",
        companyId: "co-A",
        eventAccessMode: null
      }),
      loadCompanyLicenseEligibility: async () => true,
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["e1", "e2"];
      },
      loadAssignedCompanyEventIds: async (_u, _c, _r) => ["e1"]
    })
  );
  assert.equal(r.resolution, "company_assigned_only");
  assert.deepEqual(r.eventIds, ["e1"]);
  assert.equal(companyOwnedLoaded, 0);
});

test("resolver: organizer_admin unchanged (organizer scope)", async () => {
  let licenseChecked = 0;
  let companyOwnedLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-org" },
    makeDeps({
      loadUser: async () => ({
        id: "u-org",
        role: "organizer_admin",
        companyId: "co-org",
        eventAccessMode: "all_company_events"
      }),
      loadCompanyLicenseEligibility: async () => {
        licenseChecked += 1;
        return true;
      },
      loadCompanyOwnedEventIds: async () => {
        companyOwnedLoaded += 1;
        return ["should-not-use"];
      },
      loadOrganizerEventIds: async () => ["org-e1", "org-e2"]
    })
  );
  assert.equal(r.resolution, "organizer_scope");
  assert.deepEqual(r.eventIds, ["org-e1", "org-e2"]);
  assert.equal(licenseChecked, 0);
  assert.equal(companyOwnedLoaded, 0);
});

test("resolver: organizer legacy role 'event_organizer' normalizes to organizer_admin path", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-org" },
    makeDeps({
      loadUser: async () => ({
        id: "u-org",
        role: "event_organizer",
        companyId: "co-org",
        eventAccessMode: "all_company_events"
      }),
      loadOrganizerEventIds: async () => ["org-e1"]
    })
  );
  assert.equal(r.resolution, "organizer_scope");
  assert.deepEqual(r.eventIds, ["org-e1"]);
});

test("resolver: platform_admin preserves existing behavior (no list; caller handles)", async () => {
  let anyCompanyLoaded = 0;
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-plat" },
    makeDeps({
      loadUser: async () => ({
        id: "u-plat",
        role: "platform_admin",
        companyId: null,
        eventAccessMode: "all_company_events"
      }),
      loadCompanyLicenseEligibility: async () => {
        anyCompanyLoaded += 1;
        return true;
      },
      loadCompanyOwnedEventIds: async () => {
        anyCompanyLoaded += 1;
        return ["anything"];
      }
    })
  );
  assert.equal(r.resolution, "platform_all");
  assert.deepEqual(r.eventIds, []);
  assert.equal(anyCompanyLoaded, 0);
});

test("resolver: validated active event selection rejects preferred id outside accessible set", async () => {
  const deps = makeDeps({
    loadUser: async () => ({
      id: "u-1",
      role: "exhibitor_admin",
      companyId: "co-A",
      eventAccessMode: "assigned_events_only"
    }),
    loadCompanyLicenseEligibility: async () => true,
    loadAssignedCompanyEventIds: async (_u, _c, _r) => ["e1", "e2"]
  });
  const { eventIds } = await resolveAccessibleEventIdsForUserWithDeps({ userId: "u-1" }, deps);
  assert.equal(pickValidatedEventIdForAccess(eventIds, "e99"), "e1");
  assert.equal(pickValidatedEventIdForAccess(eventIds, "e2"), "e2");
});

test("resolver: unknown user / missing user returns none", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-ghost" },
    makeDeps({
      loadUser: async () => null
    })
  );
  assert.equal(r.resolution, "none");
  assert.deepEqual(r.eventIds, []);
});

test("resolver: exhibitor user without company returns none (no widening)", async () => {
  const r = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "u-no-co" },
    makeDeps({
      loadUser: async () => ({
        id: "u-no-co",
        role: "exhibitor_admin",
        companyId: null,
        eventAccessMode: "all_company_events" as EventAccessMode
      })
    })
  );
  assert.equal(r.resolution, "none");
  assert.deepEqual(r.eventIds, []);
});
