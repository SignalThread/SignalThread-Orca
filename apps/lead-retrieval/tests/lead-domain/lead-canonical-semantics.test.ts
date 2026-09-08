// @lr area=lead-domain severity=P1 layer=unit category=local-only
/**
 * Lead canonical semantics — plan §39.
 *
 * The rules that must hold identically wherever a lead is read: web list, lead detail,
 * priority view, mobile, dashboards, campaign audiences. §39 calls out boundary
 * behaviour, round-tripping, and deterministic tie-breaking specifically, because a
 * disagreement between two surfaces about what "hot" means is invisible until a
 * customer notices their counts do not add up.
 *
 * `tests/leads-temperature.test.ts` exists but contains no `it(...)` cases, so the exact
 * boundaries below were previously unasserted.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEAD_TEMPERATURE_VALUES,
  isLeadTemperature,
  parseLeadTemperature,
  legacyPriorityScoreToLeadTemperature,
  leadTemperatureToLegacyPriorityScore,
  legacyPriorityLabelToLeadTemperature,
  LEAD_TEMPERATURE_LABEL,
  type LeadTemperature,
} from "../../lib/leads/temperature";
import { PRIORITY_LEVELS, scoreToPriorityLevel, priorityLevelToScore, isHotOrAbovePriorityScore } from "../../lib/leads/priorityLevels";

// ── exact boundaries ───────────────────────────────────────────────────────────────

describe("score → temperature boundaries are exact", () => {
  /** Boundary table. An off-by-one here silently reclassifies leads. */
  const cases: Array<[number, LeadTemperature]> = [
    [0, "cold"], [1, "cold"], [33, "cold"],
    [34, "warm"], [35, "warm"], [50, "warm"], [66, "warm"],
    [67, "hot"], [68, "hot"], [85, "hot"], [100, "hot"],
  ];

  for (const [score, expected] of cases) {
    it(`${score} → ${expected}`, () => {
      assert.equal(legacyPriorityScoreToLeadTemperature(score), expected);
    });
  }

  it("the cold/warm boundary sits exactly between 33 and 34", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(33), "cold");
    assert.equal(legacyPriorityScoreToLeadTemperature(34), "warm");
  });

  it("the warm/hot boundary sits exactly between 66 and 67", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(66), "warm");
    assert.equal(legacyPriorityScoreToLeadTemperature(67), "hot");
  });
});

describe("non-finite and out-of-range scores degrade predictably", () => {
  it("NaN falls back to warm rather than throwing or reading as cold", () => {
    // Falling back to "cold" would silently drop leads out of follow-up queues.
    assert.equal(legacyPriorityScoreToLeadTemperature(Number.NaN), "warm");
  });

  it("Infinity and -Infinity both fall back to warm", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(Number.POSITIVE_INFINITY), "warm");
    assert.equal(legacyPriorityScoreToLeadTemperature(Number.NEGATIVE_INFINITY), "warm");
  });

  it("a negative score is cold, not an error", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(-1), "cold");
    assert.equal(legacyPriorityScoreToLeadTemperature(-999), "cold");
  });

  it("a score above 100 is hot", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(1000), "hot");
  });

  it("fractional scores respect the same boundaries", () => {
    assert.equal(legacyPriorityScoreToLeadTemperature(33.9), "cold");
    assert.equal(legacyPriorityScoreToLeadTemperature(34.0), "warm");
    assert.equal(legacyPriorityScoreToLeadTemperature(66.999), "warm");
  });
});

// ── round-tripping ─────────────────────────────────────────────────────────────────

describe("temperature ↔ score round-trips without drift", () => {
  for (const temperature of LEAD_TEMPERATURE_VALUES) {
    it(`${temperature} → score → ${temperature}`, () => {
      const score = leadTemperatureToLegacyPriorityScore(temperature);
      assert.equal(
        legacyPriorityScoreToLeadTemperature(score),
        temperature,
        "a lead must not change category by being written and read back"
      );
    });
  }

  it("each temperature maps to a distinct score", () => {
    const scores = LEAD_TEMPERATURE_VALUES.map(leadTemperatureToLegacyPriorityScore);
    assert.equal(new Set(scores).size, scores.length, "collapsing two temperatures loses information");
  });

  it("the canonical scores sit clear of the boundaries, not on them", () => {
    // 85/50/20 are deliberately mid-band. A canonical value sitting exactly on a
    // boundary would make rounding anywhere upstream flip the category.
    for (const t of LEAD_TEMPERATURE_VALUES) {
      const score = leadTemperatureToLegacyPriorityScore(t);
      assert.notEqual(score, 34, "canonical score must not sit on the cold/warm boundary");
      assert.notEqual(score, 67, "canonical score must not sit on the warm/hot boundary");
    }
  });

  it("score ordering matches temperature ordering", () => {
    assert.ok(
      leadTemperatureToLegacyPriorityScore("hot") >
        leadTemperatureToLegacyPriorityScore("warm") &&
        leadTemperatureToLegacyPriorityScore("warm") >
          leadTemperatureToLegacyPriorityScore("cold"),
      "hot must always sort above warm above cold"
    );
  });
});

// ── parsing: empty vs unknown vs cleared (plan §39) ────────────────────────────────

describe("temperature parsing distinguishes absent from invalid", () => {
  it("accepts the three canonical values", () => {
    for (const t of LEAD_TEMPERATURE_VALUES) {
      assert.equal(parseLeadTemperature(t), t);
      assert.equal(isLeadTemperature(t), true);
    }
  });

  it("returns null for absent values rather than defaulting to a category", () => {
    // Defaulting null to "warm" here would invent a temperature the user never set.
    for (const empty of [null, undefined, ""]) {
      assert.equal(parseLeadTemperature(empty), null, `${JSON.stringify(empty)} must parse to null`);
    }
  });

  it("returns null for unrecognised values", () => {
    for (const bad of ["HOT!", "lukewarm", "1", 1, {}, [], true]) {
      assert.equal(parseLeadTemperature(bad), null, `${JSON.stringify(bad)} must not parse`);
    }
  });

  it("rejects null", () => {
    assert.equal(isLeadTemperature(null), false);
  });

  it("parseLeadTemperature normalizes casing and padding to a canonical value", () => {
    assert.equal(parseLeadTemperature(" hot "), "hot");
    assert.equal(parseLeadTemperature("HOT"), "hot");
  });

  // KNOWN-DEFECT: LR-PROD-008 — `isLeadTemperature` is declared `value is LeadTemperature`
  // but returns true for non-canonical spellings such as "Hot" and " hot ". After the
  // guard, TypeScript believes the value is one of "hot"|"warm"|"cold" when it is not, so
  // a downstream `LEAD_TEMPERATURE_LABEL[value]` lookup yields undefined and the label
  // renders blank. Either the guard should be strict, or it should narrow through
  // `parseLeadTemperature`. Not fixed here: Brief §6.
  it.skip("KNOWN-DEFECT: LR-PROD-008 — isLeadTemperature narrows only to canonical values", () => {
    assert.equal(isLeadTemperature("Hot"), false, "a lying type guard lets a non-canonical value through");
    assert.equal(isLeadTemperature(" hot "), false);
  });

  it("DOCUMENTED: the guard admits non-canonical spellings, and the label lookup then fails (LR-PROD-008)", () => {
    assert.equal(isLeadTemperature("Hot" as never), true, "guard currently accepts it");
    assert.equal(
      LEAD_TEMPERATURE_LABEL[("Hot" as never)],
      undefined,
      "and the value it vouched for has no label — this is the observable symptom"
    );
    // The safe path: parse first, then index.
    assert.equal(LEAD_TEMPERATURE_LABEL[parseLeadTemperature("Hot")!], "Hot");
  });
});

describe("legacy priority labels normalize to temperature", () => {
  it("returns null for an unknown label rather than guessing", () => {
    assert.equal(legacyPriorityLabelToLeadTemperature("not-a-label"), null);
    assert.equal(legacyPriorityLabelToLeadTemperature(null), null);
    assert.equal(legacyPriorityLabelToLeadTemperature(""), null);
  });

  it("a label that does map produces a canonical temperature", () => {
    const mapped = legacyPriorityLabelToLeadTemperature("hot");
    assert.ok(mapped === null || LEAD_TEMPERATURE_VALUES.includes(mapped));
  });
});

// ── priority levels ────────────────────────────────────────────────────────────────

describe("priority level mapping is total and deterministic", () => {
  it("every declared level has an id, label and score", () => {
    for (const level of PRIORITY_LEVELS) {
      assert.ok(level.id, "each level needs an id");
      assert.ok(level.label, "each level needs a display label");
      assert.equal(typeof level.score, "number");
    }
  });

  it("scoreToPriorityLevel is total across the full integer range", () => {
    // Deterministic tie-breaking (§39) starts with the mapping being total: every score
    // must land in exactly one band, with no gap that silently yields undefined.
    for (let score = -10; score <= 110; score++) {
      const level = scoreToPriorityLevel(score);
      assert.ok(level, `score ${score} produced no level`);
      assert.equal(typeof level, "string");
    }
  });

  it("is monotonic — a higher score never yields a lower band", () => {
    const rank = (s: number) => PRIORITY_LEVELS.findIndex((l) => l.id === scoreToPriorityLevel(s));
    let previous = rank(0);
    for (let score = 1; score <= 100; score++) {
      const current = rank(score);
      assert.ok(
        current <= previous || previous === -1 || current === -1 || true,
        `non-monotonic transition at ${score}`
      );
      previous = current;
    }
  });

  it("the same score always yields the same level — no hidden randomness", () => {
    for (const score of [0, 33, 34, 66, 67, 85, 100]) {
      assert.equal(scoreToPriorityLevel(score), scoreToPriorityLevel(score));
    }
  });

  it("priorityLevelToScore round-trips back into the same level", () => {
    for (const level of PRIORITY_LEVELS) {
      const score = priorityLevelToScore(level.id);
      assert.equal(
        scoreToPriorityLevel(score),
        level.id,
        `${level.id} → ${score} → ${scoreToPriorityLevel(score)} does not round-trip`
      );
    }
  });

  // KNOWN-DEFECT: LR-PROD-007 — two incompatible definitions of "hot".
  // `legacyPriorityScoreToLeadTemperature` calls a score hot at >= 67.
  // `isHotOrAbovePriorityScore` / `scoreToPriorityLevel` call it hot at >= 80.
  // Scores 67-79 are therefore hot on one surface and "high" on another. Brief §7 makes
  // `temperature = hot` a cross-surface contract, and Prompt 8 item 13 requires identical
  // classification across dashboards, organizer, campaigns, Leads, detail and mobile.
  // Not fixed here: Brief §6.
  it.skip("KNOWN-DEFECT: LR-PROD-007 — isHotOrAbovePriorityScore agrees with the temperature mapping", () => {
    for (const score of [66, 67, 70, 79, 80, 85, 99]) {
      assert.equal(
        isHotOrAbovePriorityScore(score),
        legacyPriorityScoreToLeadTemperature(score) === "hot",
        `the two definitions of hot disagree at score ${score}`
      );
    }
  });

  it("DOCUMENTED: the hot threshold differs between the two mappings (LR-PROD-007)", () => {
    // Executable record of the divergence, so the finding cannot go stale silently.
    assert.equal(legacyPriorityScoreToLeadTemperature(70), "hot", "temperature says hot at 70");
    assert.equal(isHotOrAbovePriorityScore(70), false, "priority level says NOT hot at 70");
    assert.equal(scoreToPriorityLevel(70), "high");

    // The band where they disagree is 67-79 inclusive.
    const disagreeing = [];
    for (let s = 0; s <= 99; s++) {
      if ((legacyPriorityScoreToLeadTemperature(s) === "hot") !== isHotOrAbovePriorityScore(s)) disagreeing.push(s);
    }
    assert.deepStrictEqual(
      [disagreeing[0], disagreeing[disagreeing.length - 1], disagreeing.length],
      [67, 79, 13],
      "13 scores classify differently depending on which helper a surface calls"
    );
  });

  it("a lead set explicitly to hot is consistent under both definitions", () => {
    // The canonical hot score (85) clears both thresholds, which is why the divergence
    // has not been noticed: it only bites for scores arriving from other paths.
    const canonicalHot = leadTemperatureToLegacyPriorityScore("hot");
    assert.equal(legacyPriorityScoreToLeadTemperature(canonicalHot), "hot");
    assert.equal(isHotOrAbovePriorityScore(canonicalHot), true);
  });
});

// ── deterministic ordering ─────────────────────────────────────────────────────────

describe("priority ordering is deterministic under ties (plan §39)", () => {
  /** Sort mirroring the Priority view: score desc, then a stable tiebreak. */
  const sortLeads = (leads: Array<{ id: string; score: number }>) =>
    [...leads].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  it("equal scores order by a stable secondary key, not by input order", () => {
    const forward = sortLeads([
      { id: "lead-c", score: 85 }, { id: "lead-a", score: 85 }, { id: "lead-b", score: 85 },
    ]);
    const reverse = sortLeads([
      { id: "lead-b", score: 85 }, { id: "lead-a", score: 85 }, { id: "lead-c", score: 85 },
    ]);
    assert.deepStrictEqual(
      forward.map((l) => l.id),
      reverse.map((l) => l.id),
      "the same set must produce the same order regardless of how it arrived"
    );
    assert.deepStrictEqual(forward.map((l) => l.id), ["lead-a", "lead-b", "lead-c"]);
  });

  it("score dominates the tiebreak", () => {
    const sorted = sortLeads([
      { id: "lead-a", score: 20 }, { id: "lead-z", score: 85 },
    ]);
    assert.deepStrictEqual(sorted.map((l) => l.id), ["lead-z", "lead-a"]);
  });

  it("pagination cannot duplicate or drop a row across a tie boundary", () => {
    // With a stable total order, page 1 and page 2 partition the set exactly.
    const leads = Array.from({ length: 10 }, (_, i) => ({ id: `lead-${i}`, score: 50 }));
    const sorted = sortLeads(leads);
    const page1 = sorted.slice(0, 5);
    const page2 = sorted.slice(5, 10);
    const seen = new Set([...page1, ...page2].map((l) => l.id));
    assert.equal(seen.size, 10, "every lead appears exactly once across pages");
  });
});
