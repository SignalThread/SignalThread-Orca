import test from "node:test";
import assert from "node:assert/strict";
import type { ExhibitorLicenseOption } from "../lib/data/users";

/**
 * Mirrors the rule in `app/(app)/exhibitor/users/users-client.tsx`:
 *   seatAssignableLicenses = licenses.filter(
 *     (l) => l.status === "active" && Number(l.seats_used) < Number(l.seats_total)
 *   );
 *   hasAssignableLicenses = seatAssignableLicenses.length > 0;
 *
 * The "No assignable seats" banner shows when `!hasAssignableLicenses`. These tests lock in that
 * a company-scoped license returned by the server causes the banner to be hidden (the Ali and
 * Co regression).
 */
function clientHasAssignableLicenses(licenses: ExhibitorLicenseOption[]): boolean {
  return (
    licenses.filter((license) => {
      const status = String(license.status ?? "").toLowerCase();
      return status === "active" && Number(license.seats_used) < Number(license.seats_total);
    }).length > 0
  );
}

test("company-scoped license 10/0 → banner is hidden (Ali and Co regression)", () => {
  const licenses: ExhibitorLicenseOption[] = [
    {
      id: "lic-company",
      scope: "company",
      event_id: null,
      exhibitor_company_id: "co-1",
      seats_total: 10,
      seats_used: 0,
      status: "active"
    }
  ];
  assert.equal(clientHasAssignableLicenses(licenses), true);
});

test("empty licenses → banner is shown (no assignable seats)", () => {
  assert.equal(clientHasAssignableLicenses([]), false);
});

test("only full company-scoped license → banner is shown", () => {
  const licenses: ExhibitorLicenseOption[] = [
    {
      id: "lic-company",
      scope: "company",
      event_id: null,
      exhibitor_company_id: "co-1",
      seats_total: 2,
      seats_used: 2,
      status: "active"
    }
  ];
  assert.equal(clientHasAssignableLicenses(licenses), false);
});

test("event-scoped license with capacity → banner is hidden", () => {
  const licenses: ExhibitorLicenseOption[] = [
    {
      id: "lic-event",
      scope: "event",
      event_id: "evt-1",
      exhibitor_company_id: "co-1",
      seats_total: 5,
      seats_used: 2,
      status: "active"
    }
  ];
  assert.equal(clientHasAssignableLicenses(licenses), true);
});

test("inactive status with capacity → banner is shown", () => {
  const licenses: ExhibitorLicenseOption[] = [
    {
      id: "lic-company",
      scope: "company",
      event_id: null,
      exhibitor_company_id: "co-1",
      seats_total: 10,
      seats_used: 0,
      status: "cancelled"
    }
  ];
  assert.equal(clientHasAssignableLicenses(licenses), false);
});
