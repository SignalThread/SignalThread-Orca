import test from "node:test";
import assert from "node:assert/strict";
import {
  countDistinctCompanyScopedAppUsers,
  selectExhibitorAssignableLicense,
  type AssignableLicenseCandidate
} from "../lib/licenses/select-exhibitor-assignable-license";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function companyLicense(overrides: Partial<AssignableLicenseCandidate> = {}): AssignableLicenseCandidate {
  return {
    id: "lic-company-1",
    scope: "company",
    event_id: null,
    exhibitor_company_id: "co-1",
    seats_total: 10,
    status: "active",
    expires_at: null,
    ...overrides
  };
}

function eventLicense(overrides: Partial<AssignableLicenseCandidate> = {}): AssignableLicenseCandidate {
  return {
    id: "lic-event-1",
    scope: "event",
    event_id: "evt-1",
    exhibitor_company_id: "co-1",
    seats_total: 5,
    status: "active",
    expires_at: null,
    ...overrides
  };
}

test("company-scoped active license with 10 seats / 0 used is selected (Ali and Co case)", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ seats_total: 10 }),
    companyScopedSeatsUsed: 0,
    eventScoped: null,
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.ok(result);
  assert.equal(result?.id, "lic-company-1");
  assert.equal(result?.scope, "company");
  assert.equal(result?.event_id, null);
  assert.equal(result?.seats_total, 10);
  assert.equal(result?.seats_used, 0);
  assert.equal(result?.status, "active");
});

test("company-scoped license resolves even when no event context exists (eventId null)", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense(),
    companyScopedSeatsUsed: 2,
    eventScoped: null,
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.ok(result);
  assert.equal(result?.scope, "company");
  assert.equal(result?.seats_used, 2);
});

test("company-scoped license wins over event-scoped when both are eligible", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ seats_total: 10 }),
    companyScopedSeatsUsed: 3,
    eventScoped: eventLicense({ seats_total: 5 }),
    eventScopedSeatsUsed: 1,
    now: NOW
  });

  assert.equal(result?.scope, "company");
  assert.equal(result?.id, "lic-company-1");
});

test("invalid/expired company-scoped license does NOT block valid event-scoped fallback", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ expires_at: "2020-01-01T00:00:00.000Z" }),
    companyScopedSeatsUsed: 0,
    eventScoped: eventLicense(),
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.equal(result?.scope, "event");
  assert.equal(result?.id, "lic-event-1");
});

test("inactive company-scoped license does NOT block valid event-scoped fallback", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ status: "cancelled" }),
    companyScopedSeatsUsed: 0,
    eventScoped: eventLicense(),
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.equal(result?.scope, "event");
});

test("full company-scoped license falls through to valid event-scoped license", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ seats_total: 3 }),
    companyScopedSeatsUsed: 3,
    eventScoped: eventLicense({ seats_total: 5 }),
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.equal(result?.scope, "event");
});

test("no licenses → null (no assignable seat)", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: null,
    companyScopedSeatsUsed: 0,
    eventScoped: null,
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.equal(result, null);
});

test("only full licenses on both scopes → null", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ seats_total: 2 }),
    companyScopedSeatsUsed: 2,
    eventScoped: eventLicense({ seats_total: 1 }),
    eventScopedSeatsUsed: 1,
    now: NOW
  });

  assert.equal(result, null);
});

test("seats_total = 0 company-scoped license is ineligible (falls through)", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ seats_total: 0 }),
    companyScopedSeatsUsed: 0,
    eventScoped: eventLicense(),
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.equal(result?.scope, "event");
});

test("company-scoped seat counting is distinct by user_id across all events", () => {
  // Same user active in two different events counts once.
  const rows = [
    { user_id: "user-a" }, // evt-1
    { user_id: "user-a" }, // evt-2
    { user_id: "user-b" }, // evt-1
    { user_id: "user-c" }, // evt-3
    { user_id: null },
    { user_id: "" }
  ];
  assert.equal(countDistinctCompanyScopedAppUsers(rows), 3);
});

test("company-scoped seat counting excludes the excluded user (re-seat flow)", () => {
  const rows = [{ user_id: "user-a" }, { user_id: "user-a" }, { user_id: "user-b" }];
  assert.equal(countDistinctCompanyScopedAppUsers(rows, { excludeUserId: "user-a" }), 1);
});

test("returned id matches the canonical license id (what the PATCH endpoint validates)", () => {
  const result = selectExhibitorAssignableLicense({
    companyScoped: companyLicense({ id: "canonical-co-license" }),
    companyScopedSeatsUsed: 0,
    eventScoped: eventLicense({ id: "also-valid-event-license" }),
    eventScopedSeatsUsed: 0,
    now: NOW
  });

  assert.equal(result?.id, "canonical-co-license");
});
