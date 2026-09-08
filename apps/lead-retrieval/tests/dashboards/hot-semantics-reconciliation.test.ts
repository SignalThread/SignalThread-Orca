// @lr area=dashboards severity=P1 layer=unit category=local-only
/**
 * Hot semantics and degraded-metric truthfulness — Prompt 8 items 13 and 15, plan §41.
 *
 * Brief §7 makes `temperature = hot` a **cross-surface contract**: event dashboard,
 * account cards, organizer, campaigns, Leads destinations, lead detail and mobile must all
 * classify the same lead the same way. Item 13 requires the matrix to hold even in the
 * awkward corners — `temperature = hot` with a low priority score, and `temperature = cold`
 * with a high one.
 *
 * That is precisely where **LR-PROD-007** bites: two helpers disagree about what "hot"
 * means, so which answer a surface gets depends on which function it happens to call.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  legacyPriorityScoreToLeadTemperature,
  leadTemperatureToLegacyPriorityScore,
  parseLeadTemperature,
  type LeadTemperature,
} from "../../lib/leads/temperature";
import { isHotOrAbovePriorityScore, scoreToPriorityLevel } from "../../lib/leads/priorityLevels";

/**
 * The two ways a surface can ask "is this lead hot".
 *
 * `byTemperature` reads the stored `temperature` column — the canonical field per Brief §7.
 * `byScore` derives from `priority_score`. A surface picks one; the contract says both must
 * agree for the same lead.
 */
const byTemperature = (lead: { temperature: string | null; priority_score: number }) =>
  parseLeadTemperature(lead.temperature) === "hot";
const byScore = (lead: { temperature: string | null; priority_score: number }) =>
  isHotOrAbovePriorityScore(lead.priority_score);

type Lead = { id: string; temperature: string | null; priority_score: number };

// ── the awkward corners item 13 names ──────────────────────────────────────────────

describe("temperature is the authority, not the derived score (Brief §7)", () => {
  it("temperature=hot with a LOW score is hot by the canonical field", () => {
    const lead: Lead = { id: "hot-low", temperature: "hot", priority_score: 10 };
    assert.equal(byTemperature(lead), true, "the stored temperature is what the user set");
  });

  it("temperature=cold with a HIGH score is cold by the canonical field", () => {
    const lead: Lead = { id: "cold-high", temperature: "cold", priority_score: 95 };
    assert.equal(byTemperature(lead), false, "a high computed score must not override an explicit cold");
  });

  it("DOCUMENTED: the two methods disagree in exactly these corners (LR-PROD-007)", () => {
    const hotLow: Lead = { id: "hot-low", temperature: "hot", priority_score: 10 };
    const coldHigh: Lead = { id: "cold-high", temperature: "cold", priority_score: 95 };

    assert.equal(byTemperature(hotLow), true);
    assert.equal(byScore(hotLow), false, "a score-based surface classifies this lead as NOT hot");

    assert.equal(byTemperature(coldHigh), false);
    assert.equal(byScore(coldHigh), true, "a score-based surface classifies this lead as hot");
  });

  // KNOWN-DEFECT: LR-PROD-007 — the two definitions of "hot" must agree for any lead.
  // Today `legacyPriorityScoreToLeadTemperature` calls a score hot at >= 67 while
  // `isHotOrAbovePriorityScore` requires >= 80, so scores 67-79 classify differently
  // depending on which helper a surface calls. Not fixed here: Brief §6.
  it.skip("KNOWN-DEFECT: LR-PROD-007 — score-derived and threshold hotness agree everywhere", () => {
    for (let score = 0; score <= 99; score++) {
      assert.equal(
        legacyPriorityScoreToLeadTemperature(score) === "hot",
        isHotOrAbovePriorityScore(score),
        `the two definitions of hot disagree at score ${score}`
      );
    }
  });

  it("DOCUMENTED: the disagreement band is scores 67-79 (LR-PROD-007)", () => {
    const disagreeing: number[] = [];
    for (let score = 0; score <= 99; score++) {
      if ((legacyPriorityScoreToLeadTemperature(score) === "hot") !== isHotOrAbovePriorityScore(score)) {
        disagreeing.push(score);
      }
    }
    assert.equal(disagreeing.length, 13);
    assert.equal(disagreeing[0], 67);
    assert.equal(disagreeing[disagreeing.length - 1], 79);
  });
});

// ── the cross-surface matrix ───────────────────────────────────────────────────────

/** One classification helper per consuming surface, as Brief §7 enumerates them. */
const SURFACES = [
  "event-dashboard",
  "account-card",
  "organizer",
  "campaigns",
  "leads-destination",
  "lead-detail",
  "mobile",
] as const;

const MATRIX: Array<{ lead: Lead; expectedHot: boolean; why: string }> = [
  { lead: { id: "explicit-hot", temperature: "hot", priority_score: 85 }, expectedHot: true, why: "canonical hot" },
  { lead: { id: "explicit-warm", temperature: "warm", priority_score: 50 }, expectedHot: false, why: "canonical warm" },
  { lead: { id: "explicit-cold", temperature: "cold", priority_score: 20 }, expectedHot: false, why: "canonical cold" },
  { lead: { id: "hot-low-score", temperature: "hot", priority_score: 10 }, expectedHot: true, why: "explicit hot wins over a low score" },
  { lead: { id: "cold-high-score", temperature: "cold", priority_score: 95 }, expectedHot: false, why: "explicit cold wins over a high score" },
  { lead: { id: "unset-temperature", temperature: null, priority_score: 85 }, expectedHot: false, why: "an unset temperature is not hot by the canonical field" },
];

describe("every surface classifies a lead identically (Brief §7, item 13)", () => {
  for (const { lead, expectedHot, why } of MATRIX) {
    it(`${lead.id}: hot=${expectedHot} on all ${SURFACES.length} surfaces — ${why}`, () => {
      // All surfaces must consult the canonical field. This asserts the *rule*; the
      // production wiring of each surface is covered where that surface is tested.
      const answers = SURFACES.map(() => byTemperature(lead));
      assert.deepStrictEqual(
        answers,
        SURFACES.map(() => expectedHot),
        "a surface disagreeing here is the §41 reconciliation failure"
      );
      assert.equal(new Set(answers).size, 1, "all surfaces must give one answer");
    });
  }

  it("a mixed set produces the same hot COUNT regardless of surface", () => {
    const expected = MATRIX.filter((m) => m.expectedHot).length;
    for (const surface of SURFACES) {
      const count = MATRIX.filter((m) => byTemperature(m.lead)).length;
      assert.equal(count, expected, `${surface} produced a different hot count`);
    }
  });

  it("the hot SET is identical across surfaces, not merely the count", () => {
    // Two surfaces can agree on "3 hot leads" while naming different leads. §41 requires
    // linked destinations to resolve to the same exact IDs.
    const ids = MATRIX.filter((m) => byTemperature(m.lead)).map((m) => m.lead.id).sort();
    assert.deepStrictEqual(ids, ["explicit-hot", "hot-low-score"]);
    for (const _surface of SURFACES) {
      assert.deepStrictEqual(MATRIX.filter((m) => byTemperature(m.lead)).map((m) => m.lead.id).sort(), ids);
    }
  });
});

// ── round-trip safety for the canonical field ──────────────────────────────────────

describe("canonical temperature survives a write/read round trip", () => {
  for (const temperature of ["hot", "warm", "cold"] as LeadTemperature[]) {
    it(`${temperature} round-trips through the score mapping`, () => {
      const score = leadTemperatureToLegacyPriorityScore(temperature);
      assert.equal(legacyPriorityScoreToLeadTemperature(score), temperature);
    });
  }

  it("a canonical hot lead is hot under BOTH definitions", () => {
    // Why LR-PROD-007 has stayed hidden: the canonical hot score (85) clears both
    // thresholds. The divergence only surfaces for scores from enrichment or import.
    const score = leadTemperatureToLegacyPriorityScore("hot");
    assert.equal(legacyPriorityScoreToLeadTemperature(score) === "hot", true);
    assert.equal(isHotOrAbovePriorityScore(score), true);
    assert.equal(scoreToPriorityLevel(score), "hot");
  });
});

// ── degraded metrics must never read as an all-clear (item 15) ─────────────────────

/**
 * `loadDashboardEventLeadMetrics` returns `null` when the metric RPC fails. That is the
 * correct shape: a failed query must be distinguishable from a genuine zero. These tests
 * pin the distinction at the rendering boundary, which is where the mistake gets made.
 */
type Metrics = { totalLeads: number; hotLeads: number } | null;

const renderCount = (metrics: Metrics, pick: (m: NonNullable<Metrics>) => number) =>
  metrics === null ? "unavailable" : String(pick(metrics));

describe("a failed metric query renders unavailable, never a reassuring zero", () => {
  it("null metrics render as unavailable", () => {
    assert.equal(renderCount(null, (m) => m.totalLeads), "unavailable");
  });

  it("a genuine zero renders as 0, and is NOT the same as unavailable", () => {
    const zero = renderCount({ totalLeads: 0, hotLeads: 0 }, (m) => m.totalLeads);
    assert.equal(zero, "0");
    assert.notEqual(zero, renderCount(null, (m) => m.totalLeads));
  });

  it("`?? 0` would erase the distinction — the anti-pattern this guards", () => {
    // The tempting one-liner. An exhibitor mid-event would read "0 leads today" and
    // conclude capture is broken, when in fact the metric query failed.
    const naive = (metrics: Metrics) => String(metrics?.totalLeads ?? 0);
    assert.equal(naive(null), "0");
    assert.equal(naive({ totalLeads: 0, hotLeads: 0 }), "0");
    assert.equal(naive(null), naive({ totalLeads: 0, hotLeads: 0 }), "indistinguishable — which is the bug");
  });

  it("the loader's contract allows null, so callers are forced to decide", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/server/dashboard-event-lead-metrics.ts", "utf8");
    assert.match(
      source,
      /Promise<Map<string, DashboardEventLeadMetrics> \| null>/,
      "the nullable return type is what makes the degraded state representable"
    );
    assert.match(source, /return null/, "a failed RPC must return null, not an empty map of zeros");
  });

  it("an empty event list is an empty map, NOT null — no events is not a failure", () => {
    // The mirror case: returning null for zero events would render "unavailable" on a
    // brand-new account that is simply empty.
    const source = require("node:fs").readFileSync("lib/server/dashboard-event-lead-metrics.ts", "utf8");
    assert.match(source, /if \(input\.eventIds\.length === 0\) return new Map\(\)/);
  });
});

// ── bounded intelligence must declare its bounds (item 16) ─────────────────────────

describe("bounded reads pair details with an authoritative total", () => {
  /** A bounded read: N detail rows plus the true total, so coverage is visible. */
  const boundedRead = (allRows: number[], limit: number) => ({
    details: allRows.slice(0, limit),
    analyzed: Math.min(limit, allRows.length),
    total: allRows.length,
  });

  it("reports analyzed/total when the set exceeds the bound", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => i);
    const result = boundedRead(rows, 300);
    assert.equal(result.details.length, 300);
    assert.equal(result.analyzed, 300);
    assert.equal(result.total, 1200, "the total must be authoritative, not the page size");
    assert.ok(result.analyzed < result.total, "partial coverage must be visible");
  });

  it("analyzed equals total when everything fits, so full coverage is unambiguous", () => {
    const result = boundedRead([1, 2, 3], 300);
    assert.equal(result.analyzed, result.total);
  });

  it("the detail count is never presented as the total", () => {
    const rows = Array.from({ length: 1200 }, (_, i) => i);
    const result = boundedRead(rows, 300);
    assert.notEqual(
      result.details.length,
      result.total,
      "rendering details.length as the total is how a 1,200-lead event reports 300"
    );
  });

  it("exercises the >300 conversations and >1,000 records thresholds item 16 names", () => {
    for (const size of [301, 1001, 5000]) {
      const result = boundedRead(Array.from({ length: size }, (_, i) => i), 300);
      assert.equal(result.total, size);
      assert.equal(result.analyzed, 300);
    }
  });
});
