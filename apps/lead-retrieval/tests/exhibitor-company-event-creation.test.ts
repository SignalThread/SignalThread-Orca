import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExhibitorCompanyEventCreationFromLicenseRow } from "../lib/licenses/evaluate-exhibitor-company-event-creation";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");

function baseLicense(
  overrides: Partial<{
    id: string;
    scope: string;
    status: string;
    expiresAt: string | null;
    canCreateEvents: boolean;
    maxEvents: number | null;
  }> = {}
) {
  return {
    id: "lic-1",
    scope: "company",
    status: "active",
    expiresAt: "2099-12-31",
    canCreateEvents: true,
    maxEvents: null as number | null,
    ...overrides
  };
}

test("active company license, can_create_events=true, max_events=null => allowed", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense(),
    currentEventCount: 50,
    nowMs: NOW
  });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "allowed");
  assert.equal(r.licenseId, "lic-1");
  assert.equal(r.currentEventCount, 50);
  assert.equal(r.maxEvents, null);
});

test("active company license, max_events=3, count below limit => allowed", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense({ maxEvents: 3 }),
    currentEventCount: 2,
    nowMs: NOW
  });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "allowed");
});

test("active company license, max_events=3, count at limit => denied", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense({ maxEvents: 3 }),
    currentEventCount: 3,
    nowMs: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "event_limit_reached");
  assert.equal(r.licenseId, "lic-1");
  assert.equal(r.currentEventCount, 3);
  assert.equal(r.maxEvents, 3);
});

test("expired company license => denied", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense({ expiresAt: "2020-01-01" }),
    currentEventCount: 0,
    nowMs: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "license_expired");
});

test("inactive company license => denied", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense({ status: "trial" }),
    currentEventCount: 0,
    nowMs: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "license_inactive");
});

test("company license with can_create_events=false => denied", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense({ canCreateEvents: false }),
    currentEventCount: 0,
    nowMs: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "capability_disabled");
});

test("event-scoped license with can_create_events=true => denied (wrong scope)", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: baseLicense({ scope: "event" }),
    currentEventCount: 0,
    nowMs: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "wrong_scope");
});

test("no eligible company license => denied cleanly", () => {
  const r = evaluateExhibitorCompanyEventCreationFromLicenseRow({
    license: null,
    currentEventCount: 0,
    nowMs: NOW
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "no_license");
  assert.equal(r.licenseId, null);
  assert.equal(r.maxEvents, null);
});
