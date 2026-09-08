/**
 * Regression: one canonical license per (event_id, exhibitor_company_id).
 *
 * Migration 0026 restored a partial unique index `licenses_unique_event_exhibitor` and merges
 * historical duplicates. This file simulates those rules in-memory for fast CI without a DB.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { generateLicenseKey } from "../lib/licenses/utils";

test("generateLicenseKey returns a string starting with LIC-", () => {
  const key = generateLicenseKey();
  assert.match(key, /^LIC-[0-9A-F]{10}$/);
});

test("generateLicenseKey produces unique values on every call", () => {
  const SAMPLES = 1000;
  const seen = new Set<string>();
  for (let i = 0; i < SAMPLES; i++) {
    const key = generateLicenseKey();
    assert.ok(!seen.has(key), `Duplicate key generated: ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, SAMPLES);
});

function createInMemoryLicenseTable() {
  type LicenseRow = {
    id: string;
    event_id: string | null;
    exhibitor_company_id: string | null;
    license_key: string;
  };
  const rows: LicenseRow[] = [];

  function insert(row: LicenseRow) {
    if (rows.some((r) => r.license_key === row.license_key)) {
      throw new Error(
        `duplicate key value violates unique constraint "licenses_unique_key"`
      );
    }
    const ev = row.event_id;
    const ex = row.exhibitor_company_id;
    if (ev != null && ex != null) {
      const dup = rows.some(
        (r) => r.event_id === ev && r.exhibitor_company_id === ex
      );
      if (dup) {
        throw new Error(
          `duplicate key value violates unique constraint "licenses_unique_event_exhibitor"`
        );
      }
    }
    rows.push({ ...row });
    return row;
  }

  return { insert, rows };
}

test("second license for same exhibitor+event is rejected (matches migration 0026 index)", () => {
  const table = createInMemoryLicenseTable();
  const shared = { event_id: "evt-1", exhibitor_company_id: "co-A" };
  const key1 = generateLicenseKey();
  const key2 = generateLicenseKey();
  assert.notEqual(key1, key2);

  table.insert({ ...shared, license_key: key1, id: "lic-1" });

  assert.throws(
    () => {
      table.insert({ ...shared, license_key: key2, id: "lic-2" });
    },
    /licenses_unique_event_exhibitor/
  );
});

test("inserting two licenses with the same license_key is rejected", () => {
  const table = createInMemoryLicenseTable();
  const key = generateLicenseKey();

  table.insert({ event_id: "evt-2", exhibitor_company_id: "co-B", license_key: key, id: "lic-3" });

  assert.throws(
    () => {
      table.insert({ event_id: "evt-2", exhibitor_company_id: "co-B", license_key: key, id: "lic-4" });
    },
    /licenses_unique_key/
  );
});

test("duplicate license_key across different exhibitors is still rejected", () => {
  const table = createInMemoryLicenseTable();
  const key = generateLicenseKey();

  table.insert({ event_id: "evt-3", exhibitor_company_id: "co-C", license_key: key, id: "lic-5" });

  assert.throws(
    () => {
      table.insert({ event_id: "evt-4", exhibitor_company_id: "co-D", license_key: key, id: "lic-6" });
    },
    /licenses_unique_key/
  );
});
