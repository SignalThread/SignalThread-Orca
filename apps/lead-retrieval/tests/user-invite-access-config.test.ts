import test from "node:test";
import assert from "node:assert/strict";

import {
  findAssignedEventIdsNotInCompany,
  isCompanyScopedInviteRole,
  normalizeUserInviteAccessConfig,
  requiresEventAccessMode
} from "../lib/access/user-invite-access-config";

test("normalizeUserInviteAccessConfig: all_company_events keeps optional assigned ids", () => {
  const r = normalizeUserInviteAccessConfig({
    role: "exhibitor_admin",
    eventAccessMode: "all_company_events",
    assignedEventIds: ["evt-1", "evt-2"]
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.role, "exhibitor_admin");
  assert.equal(r.config.eventAccessMode, "all_company_events");
  assert.deepEqual(r.config.assignedEventIds, ["evt-1", "evt-2"]);
});

test("normalizeUserInviteAccessConfig: all_company_events allows empty assigned ids", () => {
  const r = normalizeUserInviteAccessConfig({
    role: "exhibitor_admin",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.config.assignedEventIds, []);
});

test("normalizeUserInviteAccessConfig: exhibitor_viewer is company-scoped and requires a mode", () => {
  assert.equal(requiresEventAccessMode("exhibitor_viewer"), true);
  assert.equal(isCompanyScopedInviteRole("exhibitor_viewer"), true);

  const missingMode = normalizeUserInviteAccessConfig({
    role: "exhibitor_viewer",
    eventAccessMode: null,
    assignedEventIds: []
  });
  assert.equal(missingMode.ok, false);
  if (missingMode.ok) return;
  assert.equal(missingMode.error.code, "MODE_REQUIRED");
});

test("normalizeUserInviteAccessConfig: assigned_events_only requires at least one event", () => {
  const r = normalizeUserInviteAccessConfig({
    role: "exhibitor_admin",
    eventAccessMode: "assigned_events_only",
    assignedEventIds: []
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "ASSIGNED_EVENTS_REQUIRED");
});

test("normalizeUserInviteAccessConfig: assigned_events_only normalizes & dedupes ids", () => {
  const r = normalizeUserInviteAccessConfig({
    role: "exhibitor_viewer",
    eventAccessMode: "assigned_events_only",
    assignedEventIds: ["evt-1", "", "evt-1", "  evt-2  "]
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.config.assignedEventIds, ["evt-1", "evt-2"]);
});

test("normalizeUserInviteAccessConfig: non-company-scoped roles ignore mode + assignments", () => {
  for (const role of ["platform_admin", "organizer_admin"] as const) {
    const r = normalizeUserInviteAccessConfig({
      role,
      eventAccessMode: "assigned_events_only",
      assignedEventIds: ["evt-1"]
    });
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(r.config.eventAccessMode, null);
    assert.deepEqual(r.config.assignedEventIds, []);
  }
});

test("normalizeUserInviteAccessConfig: rejects unknown role", () => {
  const r = normalizeUserInviteAccessConfig({
    role: "super_admin",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_ROLE");
});

test("normalizeUserInviteAccessConfig: rejects unknown mode", () => {
  const r = normalizeUserInviteAccessConfig({
    role: "exhibitor_admin",
    eventAccessMode: "weird_mode",
    assignedEventIds: []
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_MODE");
});

test("findAssignedEventIdsNotInCompany: returns offending cross-company ids only", () => {
  const offending = findAssignedEventIdsNotInCompany(
    ["evt-1", "evt-2", "evt-3"],
    ["evt-1", "evt-2"]
  );
  assert.deepEqual(offending, ["evt-3"]);
});

test("findAssignedEventIdsNotInCompany: empty when all assigned ids belong to the company", () => {
  const offending = findAssignedEventIdsNotInCompany(["evt-1"], ["evt-1", "evt-2"]);
  assert.deepEqual(offending, []);
});
