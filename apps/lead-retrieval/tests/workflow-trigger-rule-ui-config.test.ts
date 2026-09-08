import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_TRIGGER_RULE_CONFIG,
  isTriggerRuleConfigDefault,
  triggerRuleConfigToJson,
  triggerRuleConfigFromJson,
  triggerRuleConfigPreview,
  triggerRuleConfigCardSummary,
  validateTriggerRuleConfig,
  type LeadCapturedTriggerRuleConfig
} from "@/lib/exhibitor/workflows/lead-captured-trigger-rule-config";
import { evaluateLeadCapturedTriggerRules } from "@/lib/workflows/trigger-rules/lead-captured-rules";

const repoRoot = process.cwd();

function read(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("trigger rule UI config — inspector surface", () => {
  it("does not render the legacy Status selector in trigger setup", () => {
    const source = read("components/exhibitor/workflows/workflow-orchestration-inspector.tsx");
    assert.match(source, /LEAD_RATING_VALUES/);
    assert.match(source, /LEAD_TEMPERATURE_VALUES/);
    assert.doesNotMatch(source, /LEAD_STATUS_VALUES/);
    assert.doesNotMatch(source, /Any status/);
    assert.doesNotMatch(source, /LeadStatusValue/);
  });
});

// ---------------------------------------------------------------------------
// isTriggerRuleConfigDefault
// ---------------------------------------------------------------------------

describe("trigger rule UI config — isTriggerRuleConfigDefault", () => {
  it("returns true for the default (all-empty) config", () => {
    assert.equal(isTriggerRuleConfigDefault(DEFAULT_TRIGGER_RULE_CONFIG), true);
  });

  it("returns false when ratings is non-empty", () => {
    assert.equal(
      isTriggerRuleConfigDefault({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4"] }),
      false
    );
  });

  it("returns false when temperatures is non-empty", () => {
    assert.equal(
      isTriggerRuleConfigDefault({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["warm"] }),
      false
    );
  });

  it("ignores legacy statuses when deciding whether visible conditions are default", () => {
    assert.equal(
      isTriggerRuleConfigDefault({ ...DEFAULT_TRIGGER_RULE_CONFIG, statuses: ["new"] }),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// validateTriggerRuleConfig
// ---------------------------------------------------------------------------

describe("trigger rule UI config — validateTriggerRuleConfig", () => {
  it("passes for the default config", () => {
    assert.equal(validateTriggerRuleConfig(DEFAULT_TRIGGER_RULE_CONFIG), null);
  });

  it("passes for valid multi-value configs", () => {
    assert.equal(
      validateTriggerRuleConfig({ ratings: ["4", "5"], temperatures: ["hot", "warm"], statuses: ["new"] }),
      null
    );
    assert.equal(
      validateTriggerRuleConfig({ ratings: ["1", "2", "3"], temperatures: [], statuses: ["closed"] }),
      null
    );
  });

  it("fails for invalid rating values", () => {
    assert.notEqual(
      validateTriggerRuleConfig({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["6" as any] }),
      null
    );
  });

  it("fails for invalid temperature values", () => {
    assert.notEqual(
      validateTriggerRuleConfig({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["lukewarm" as any] }),
      null
    );
  });

  it("ignores invalid legacy status values because status is no longer a UI condition", () => {
    assert.equal(
      validateTriggerRuleConfig({ ...DEFAULT_TRIGGER_RULE_CONFIG, statuses: ["pending" as any] }),
      null
    );
  });
});

// ---------------------------------------------------------------------------
// triggerRuleConfigToJson — persisted shape
// ---------------------------------------------------------------------------

describe("trigger rule UI config — triggerRuleConfigToJson", () => {
  it("returns null for the all-empty config", () => {
    assert.equal(triggerRuleConfigToJson(DEFAULT_TRIGGER_RULE_CONFIG), null);
  });

  it("multi-rating rule saves with { in: [...] }", () => {
    const json = triggerRuleConfigToJson({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4", "5"] });
    assert.ok(json !== null);
    const rule = (json as any).lead_captured;
    assert.deepEqual(rule.rating, { in: [4, 5] });
    assert.ok(typeof rule.ruleId === "string" && rule.ruleId.length > 0);
  });

  it("single-rating rule saves with { in: [n] }", () => {
    const json = triggerRuleConfigToJson({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["3"] });
    assert.ok(json !== null);
    const rule = (json as any).lead_captured;
    assert.deepEqual(rule.rating, { in: [3] });
  });

  it("multi-temperature rule saves with { in: [...] }", () => {
    const json = triggerRuleConfigToJson({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["hot", "warm"] });
    assert.ok(json !== null);
    const rule = (json as any).lead_captured;
    assert.deepEqual(rule.temperature, { in: ["hot", "warm"] });
    assert.equal(rule.rating, undefined);
  });

  it("single-temperature rule saves with { in: [value] }", () => {
    const json = triggerRuleConfigToJson({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["cold"] });
    assert.ok(json !== null);
    const rule = (json as any).lead_captured;
    assert.deepEqual(rule.temperature, { in: ["cold"] });
  });

  it("legacy status selections are not written to newly saved trigger JSON", () => {
    const json = triggerRuleConfigToJson({ ...DEFAULT_TRIGGER_RULE_CONFIG, statuses: ["new", "follow_up"] });
    assert.equal(json, null);
  });

  it("combined multi-field rule saves correctly", () => {
    const json = triggerRuleConfigToJson({
      ratings: ["4", "5"],
      temperatures: ["hot", "warm"],
      statuses: []
    });
    assert.ok(json !== null);
    const rule = (json as any).lead_captured;
    assert.deepEqual(rule.rating, { in: [4, 5] });
    assert.deepEqual(rule.temperature, { in: ["hot", "warm"] });
    assert.equal(rule.status, undefined);
    assert.equal(rule.source, undefined);
  });

  it("source is never included in persisted JSON", () => {
    const configs: LeadCapturedTriggerRuleConfig[] = [
      DEFAULT_TRIGGER_RULE_CONFIG,
      { ratings: ["4"], temperatures: [], statuses: [] },
      { ratings: [], temperatures: ["hot"], statuses: [] },
      { ratings: ["4", "5"], temperatures: ["hot", "warm"], statuses: ["new", "closed"] }
    ];
    for (const config of configs) {
      const json = triggerRuleConfigToJson(config);
      if (json !== null) {
        assert.equal((json as any).lead_captured?.source, undefined, "source must never appear");
        assert.equal((json as any).lead_captured?.status, undefined, "status must never appear");
      }
    }
  });

  it("omits fields whose arrays are empty", () => {
    const json = triggerRuleConfigToJson({ ratings: ["5"], temperatures: [], statuses: [] });
    assert.ok(json !== null);
    const rule = (json as any).lead_captured;
    assert.equal(rule.temperature, undefined);
    assert.equal(rule.status, undefined);
  });

  it("ruleId encodes all selected values deterministically", () => {
    const j1 = triggerRuleConfigToJson({ ratings: ["4", "5"], temperatures: ["hot"], statuses: [] });
    const j2 = triggerRuleConfigToJson({ ratings: ["4", "5"], temperatures: ["hot"], statuses: [] });
    assert.equal((j1 as any).lead_captured.ruleId, (j2 as any).lead_captured.ruleId);

    const j3 = triggerRuleConfigToJson({ ratings: ["4"], temperatures: ["hot"], statuses: [] });
    assert.notEqual(
      (j1 as any).lead_captured.ruleId,
      (j3 as any).lead_captured.ruleId
    );
  });
});

describe("trigger rule UI config — triggerRuleConfigFromJson", () => {
  it("returns default config when no persisted rule exists", () => {
    assert.deepEqual(triggerRuleConfigFromJson(null), DEFAULT_TRIGGER_RULE_CONFIG);
    assert.deepEqual(triggerRuleConfigFromJson({}), DEFAULT_TRIGGER_RULE_CONFIG);
  });

  it("round-trips multi-select persisted JSON back to the UI config", () => {
    const config: LeadCapturedTriggerRuleConfig = {
      ratings: ["4", "5"],
      temperatures: ["hot", "warm"],
      statuses: []
    };
    assert.deepEqual(triggerRuleConfigFromJson(triggerRuleConfigToJson(config)), config);
  });

  it("tolerates older single-value rule shapes including legacy status", () => {
    assert.deepEqual(
      triggerRuleConfigFromJson({
        lead_captured: {
          rating: { gte: 4 },
          temperature: { eq: "hot" },
          status: "new"
        }
      }),
      { ratings: ["4"], temperatures: ["hot"], statuses: ["new"] }
    );
  });

  it("loads legacy status-only rules safely without making visible conditions active", () => {
    const config = triggerRuleConfigFromJson({
      lead_captured: {
        ruleId: "ui-old-status-only",
        status: { in: ["new", "follow_up"] }
      }
    });

    assert.deepEqual(config, { ratings: [], temperatures: [], statuses: ["new", "follow_up"] });
    assert.equal(isTriggerRuleConfigDefault(config), true);
    assert.equal(triggerRuleConfigPreview(config), "Runs for all captured leads");
    assert.equal(triggerRuleConfigToJson(config), null);
  });
});

// ---------------------------------------------------------------------------
// Backend evaluator — multi-select OR within field, AND across fields
// ---------------------------------------------------------------------------

describe("trigger rule UI config — backend evaluator receives correct JSON", () => {
  function evalWith(config: LeadCapturedTriggerRuleConfig, lead: Record<string, unknown>) {
    const conditions = triggerRuleConfigToJson(config);
    return evaluateLeadCapturedTriggerRules({ conditions, lead });
  }

  it("default config matches any lead (no-rule path)", () => {
    const result = evalWith(DEFAULT_TRIGGER_RULE_CONFIG, { rating: 1, temperature: "cold" });
    assert.equal(result.ok, true);
    assert.equal((result as any).reasonMatched, "default_no_lead_rules");
  });

  it("multi-rating rule: OR — matches lead with rating in the set", () => {
    const result = evalWith({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4", "5"] }, { rating: 4 });
    assert.equal(result.ok, true);
    assert.equal((result as any).reasonMatched, "lead_rule_matched");
  });

  it("multi-rating rule: OR — matches lead with second value in set", () => {
    const result = evalWith({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4", "5"] }, { rating: 5 });
    assert.equal(result.ok, true);
  });

  it("multi-rating rule: skips lead outside the set", () => {
    const result = evalWith({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4", "5"] }, { rating: 3 });
    assert.equal(result.ok, false);
    assert.equal((result as any).reasonSkipped, "lead_rule_mismatch");
  });

  it("single-rating rule: matches exact star", () => {
    const result = evalWith({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["3"] }, { rating: 3 });
    assert.equal(result.ok, true);
  });

  it("single-rating rule: skips different star", () => {
    const result = evalWith({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["3"] }, { rating: 4 });
    assert.equal(result.ok, false);
  });

  it("multi-temperature rule: OR — matches first value", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["hot", "warm"] },
      { temperature: "hot" }
    );
    assert.equal(result.ok, true);
  });

  it("multi-temperature rule: OR — matches second value", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["hot", "warm"] },
      { temperature: "warm" }
    );
    assert.equal(result.ok, true);
  });

  it("multi-temperature rule: skips value outside the set", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["hot", "warm"] },
      { temperature: "cold" }
    );
    assert.equal(result.ok, false);
  });

  it("new unassessed lead with null temperature does not match a Cold workflow", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["cold"] },
      { temperature: null, rating: 0, status: "new" }
    );
    assert.equal(result.ok, false);
  });

  it("explicit Cold save matches a Cold workflow", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["cold"] },
      { temperature: "Cold", rating: 0, status: "new" }
    );
    assert.equal(result.ok, true);
  });

  it("unrated value does not match rating conditions", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["1"] },
      { temperature: "hot", rating: 0, status: "new" }
    );
    assert.equal(result.ok, false);
  });

  it("combined multi-field rule: AND — matches when all fields match (OR within each)", () => {
    const result = evalWith(
      { ratings: ["4", "5"], temperatures: ["hot", "warm"], statuses: [] },
      { rating: 5, temperature: "warm" }
    );
    assert.equal(result.ok, true);
  });

  it("explicit Hot + 5 stars matches a Hot/5 workflow", () => {
    const result = evalWith(
      { ratings: ["5"], temperatures: ["hot"], statuses: [] },
      { rating: 5, temperature: "HOT", status: "new" }
    );
    assert.equal(result.ok, true);
  });

  it("combined multi-field rule: AND — skips when one field does not match", () => {
    const result = evalWith(
      { ratings: ["4", "5"], temperatures: ["hot", "warm"], statuses: [] },
      { rating: 5, temperature: "cold" }
    );
    assert.equal(result.ok, false);
  });

  it("combined multi-field rule: AND — skips when rating outside set even if temp matches", () => {
    const result = evalWith(
      { ratings: ["4", "5"], temperatures: ["hot"], statuses: [] },
      { rating: 3, temperature: "hot" }
    );
    assert.equal(result.ok, false);
  });

  it("evaluator treats temperature match as case-insensitive", () => {
    const result = evalWith(
      { ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["warm"] },
      { temperature: "Warm" }
    );
    assert.equal(result.ok, true);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — old single-value / gte / eq JSON still parses
// ---------------------------------------------------------------------------

describe("trigger rule UI config — backward compatibility with old saved formats", () => {
  function evalRaw(conditions: unknown, lead: Record<string, unknown>) {
    return evaluateLeadCapturedTriggerRules({ conditions, lead });
  }

  it("old { gte: 4 } rating condition still matches 4-star lead", () => {
    const conditions = { lead_captured: { ruleId: "ui-old-gte4", rating: { gte: 4 } } };
    assert.equal(evalRaw(conditions, { rating: 4 }).ok, true);
    assert.equal(evalRaw(conditions, { rating: 5 }).ok, true);
    assert.equal(evalRaw(conditions, { rating: 3 }).ok, false);
  });

  it("old { eq: 3 } rating condition still matches exactly 3-star lead", () => {
    const conditions = { lead_captured: { ruleId: "ui-old-eq3", rating: { eq: 3 } } };
    assert.equal(evalRaw(conditions, { rating: 3 }).ok, true);
    assert.equal(evalRaw(conditions, { rating: 4 }).ok, false);
  });

  it("old bare string temperature still parses and matches", () => {
    const conditions = { lead_captured: { ruleId: "ui-old-temp-warm", temperature: "warm" } };
    assert.equal(evalRaw(conditions, { temperature: "warm" }).ok, true);
    assert.equal(evalRaw(conditions, { temperature: "cold" }).ok, false);
  });

  it("old combined { gte, bare string temp } still parses and matches", () => {
    const conditions = {
      lead_captured: { ruleId: "ui-old-combined", rating: { gte: 4 }, temperature: "warm" }
    };
    assert.equal(evalRaw(conditions, { rating: 5, temperature: "warm" }).ok, true);
    assert.equal(evalRaw(conditions, { rating: 5, temperature: "cold" }).ok, false);
    assert.equal(evalRaw(conditions, { rating: 3, temperature: "warm" }).ok, false);
  });

  it("old persisted status condition still evaluates unchanged outside the UI config writer", () => {
    const conditions = { lead_captured: { ruleId: "ui-old-status-new", status: { in: ["new"] } } };
    assert.equal(evalRaw(conditions, { status: "new" }).ok, true);
    assert.equal(evalRaw(conditions, { status: "closed" }).ok, false);
  });

  it("null conditions is the no-rule path — matches all leads", () => {
    assert.equal(evalRaw(null, { rating: 1, temperature: "cold" }).ok, true);
    assert.equal(
      (evalRaw(null, { rating: 1 }) as any).reasonMatched,
      "default_no_lead_rules"
    );
  });
});

// ---------------------------------------------------------------------------
// triggerRuleConfigPreview
// ---------------------------------------------------------------------------

describe("trigger rule UI config — triggerRuleConfigPreview", () => {
  it("returns all-leads message for default config", () => {
    assert.equal(triggerRuleConfigPreview(DEFAULT_TRIGGER_RULE_CONFIG), "Runs for all captured leads");
  });

  it("single rating", () => {
    const text = triggerRuleConfigPreview({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4"] });
    assert.ok(text.includes("4★"), `Expected '4★' in: ${text}`);
  });

  it("multi-rating: 4★ or 5★", () => {
    const text = triggerRuleConfigPreview({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4", "5"] });
    assert.ok(text.includes("4★") && text.includes("5★"), `Expected '4★' and '5★' in: ${text}`);
    assert.ok(text.toLowerCase().includes("or"), `Expected 'or' in: ${text}`);
  });

  it("single temperature", () => {
    const text = triggerRuleConfigPreview({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["warm"] });
    assert.ok(text.toLowerCase().includes("warm"), `Expected 'warm' in: ${text}`);
  });

  it("multi-temperature: hot or warm", () => {
    const text = triggerRuleConfigPreview({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["hot", "warm"] });
    assert.ok(text.toLowerCase().includes("hot"), `Expected 'hot' in: ${text}`);
    assert.ok(text.toLowerCase().includes("warm"), `Expected 'warm' in: ${text}`);
    assert.ok(text.toLowerCase().includes("or"), `Expected 'or' in: ${text}`);
  });

  it("combined: temperature and rating both appear", () => {
    const text = triggerRuleConfigPreview({
      ratings: ["4", "5"],
      temperatures: ["hot", "warm"],
      statuses: []
    });
    assert.ok(text.toLowerCase().includes("hot") || text.toLowerCase().includes("warm"), `Expected temp in: ${text}`);
    assert.ok(text.includes("4★") || text.includes("5★"), `Expected rating in: ${text}`);
  });

  it("cold temperature alone", () => {
    const text = triggerRuleConfigPreview({ ratings: [], temperatures: ["cold"], statuses: [] });
    assert.ok(text.toLowerCase().includes("cold"), `Expected 'cold' in: ${text}`);
  });

  it("source never appears in preview regardless of config", () => {
    const text = triggerRuleConfigPreview({ ratings: ["4"], temperatures: ["hot"], statuses: [] });
    assert.ok(!text.toLowerCase().includes("source"), `source must not appear in: ${text}`);
    assert.ok(!text.toLowerCase().includes("mobile"), `mobile must not appear in: ${text}`);
  });

  it("legacy statuses never appear in preview", () => {
    const text = triggerRuleConfigPreview({ ratings: [], temperatures: [], statuses: ["new"] });
    assert.equal(text, "Runs for all captured leads");
    assert.ok(!text.toLowerCase().includes("new"), `status must not appear in: ${text}`);
  });
});

// ---------------------------------------------------------------------------
// triggerRuleConfigCardSummary
// ---------------------------------------------------------------------------

describe("trigger rule UI config — triggerRuleConfigCardSummary", () => {
  it("returns 'All captured leads' for default", () => {
    assert.equal(triggerRuleConfigCardSummary(DEFAULT_TRIGGER_RULE_CONFIG), "All captured leads");
  });

  it("single rating chip", () => {
    const s = triggerRuleConfigCardSummary({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4"] });
    assert.ok(s.includes("4★"), `Expected '4★' in: ${s}`);
  });

  it("multi-rating chip: 4★/5★", () => {
    const s = triggerRuleConfigCardSummary({ ...DEFAULT_TRIGGER_RULE_CONFIG, ratings: ["4", "5"] });
    assert.ok(s.includes("4★/5★"), `Expected '4★/5★' in: ${s}`);
  });

  it("single temperature chip", () => {
    const s = triggerRuleConfigCardSummary({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["warm"] });
    assert.ok(s.toLowerCase().includes("warm"), `Expected 'warm' in: ${s}`);
  });

  it("multi-temperature chip: Hot/Warm", () => {
    const s = triggerRuleConfigCardSummary({ ...DEFAULT_TRIGGER_RULE_CONFIG, temperatures: ["hot", "warm"] });
    assert.ok(s.includes("Hot/Warm"), `Expected 'Hot/Warm' in: ${s}`);
  });

  it("combined chip: rating · temperature", () => {
    const s = triggerRuleConfigCardSummary({ ratings: ["4", "5"], temperatures: ["hot", "warm"], statuses: [] });
    assert.ok(s.includes("4★/5★"), `Expected '4★/5★' in: ${s}`);
    assert.ok(s.includes("Hot/Warm"), `Expected 'Hot/Warm' in: ${s}`);
    assert.ok(s.includes("·"), `Expected '·' separator in: ${s}`);
  });

  it("separates fields with ·", () => {
    const s = triggerRuleConfigCardSummary({ ratings: ["5"], temperatures: ["hot"], statuses: [] });
    assert.ok(s.includes("·"), `Expected '·' separator in: ${s}`);
  });

  it("source never appears in card summary", () => {
    const s = triggerRuleConfigCardSummary({ ratings: ["4"], temperatures: [], statuses: [] });
    assert.ok(!s.toLowerCase().includes("source"), `source must not appear in card summary: ${s}`);
  });

  it("legacy statuses never appear in card summary", () => {
    assert.equal(triggerRuleConfigCardSummary({ ratings: [], temperatures: [], statuses: ["new"] }), "All captured leads");
  });
});
