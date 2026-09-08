/**
 * Cross-surface lead truth journey.
 *
 * The mobile app, admin web, and export/API surfaces must agree on a lead's core fields. There is
 * one canonical `leads` row; each surface selects an overlapping field set. This journey asserts
 * (by source contract) that the shared core fields are read consistently across the create route,
 * the detail GET/PATCH route, and the export fetch — and proves the one place surfaces diverge in
 * representation (canonical `temperature` vs legacy `priority_score`) stays coherent via the real
 * derivation, so no stale derived state causes false display/action. Shared-schema column contracts:
 * `schema-contract.test.ts`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  resolveLeadTemperature,
  leadTemperatureToLegacyPriorityScore,
  type LeadTemperature,
} from "../../lib/leads/temperature";

const root = process.cwd();
const createRoute = readFileSync(join(root, "app/api/exhibitor/leads/create/route.ts"), "utf8");
const detailRoute = readFileSync(join(root, "app/api/exhibitor/leads/[leadId]/route.ts"), "utf8");
const exportFetch = readFileSync(join(root, "lib/server/leads/leadsExportFetch.ts"), "utf8");

// Fields every surface that exposes a lead must agree on.
const CORE_SHARED_FIELDS = [
  "full_name",
  "job_title",
  "company_text",
  "rating",
  "status",
  "follow_up_date",
  "event_id",
  "company_id",
] as const;

describe("cross-surface truth — core lead fields are shared across surfaces", () => {
  for (const field of CORE_SHARED_FIELDS) {
    it(`'${field}' is selected by the create, detail, and export surfaces`, () => {
      assert.match(createRoute, new RegExp(`\\b${field}\\b`));
      assert.match(detailRoute, new RegExp(`\\b${field}\\b`));
      assert.match(exportFetch, new RegExp(`\\b${field}\\b`));
    });
  }
});

describe("cross-surface truth — canonical temperature and legacy priority_score stay coherent", () => {
  // App/admin surfaces carry canonical `temperature`; export carries legacy `priority_score`.
  // Both must resolve to the same heat for the same row.
  const temps: LeadTemperature[] = ["hot", "warm", "cold"];

  it("a temperature maps to a legacy score that resolves back to the same temperature", () => {
    for (const t of temps) {
      const legacyScore = leadTemperatureToLegacyPriorityScore(t);
      // App surface reads canonical temperature directly.
      assert.equal(resolveLeadTemperature(t, null), t);
      // Export/legacy surface only has priority_score, but resolves to the same heat.
      assert.equal(resolveLeadTemperature(null, legacyScore), t);
    }
  });

  it("the detail surface re-parses temperature so reads are canonical", () => {
    assert.match(detailRoute, /parseLeadTemperature\(/);
  });

  it("the export surface exposes the legacy priority_score bridge", () => {
    assert.match(exportFetch, /\bpriority_score\b/);
  });
});
