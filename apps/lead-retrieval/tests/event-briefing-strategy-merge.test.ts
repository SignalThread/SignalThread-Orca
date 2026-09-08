import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeEventBriefingStrategyPatch } from "../lib/import-wizard/event-briefing-strategy-merge";

describe("mergeEventBriefingStrategyPatch", () => {
  const complete = {
    productFocus: "Lead capture platform",
    eventGoal: "pipeline_acceleration",
    targetBuyerPersona: "Event marketers",
    toneOfVoice: "Strategic",
  };

  it("preserves all untouched fields when each strategy field is patched independently", () => {
    for (const [key, value] of Object.entries({
      productFocus: "Mobile lead capture",
      eventGoal: "lead_generation",
      targetBuyerPersona: "Revenue leaders",
      toneOfVoice: "Concise",
    })) {
      const merged = mergeEventBriefingStrategyPatch(complete, { [key]: value });
      assert.equal(merged[key as keyof typeof complete], value);
      for (const sibling of Object.keys(complete) as Array<keyof typeof complete>) {
        if (sibling !== key) assert.equal(merged[sibling], complete[sibling]);
      }
    }
  });

  it("preserves toneOfVoice when patch omits it", () => {
    const merged = mergeEventBriefingStrategyPatch(
      { productFocus: "A", toneOfVoice: "Concise" },
      { productFocus: "B" }
    );
    assert.equal(merged.productFocus, "B");
    assert.equal(merged.toneOfVoice, "Concise");
  });

  it("allows clearing a field with empty string when provided", () => {
    const merged = mergeEventBriefingStrategyPatch(
      { productFocus: "A", eventGoal: "lead_generation" },
      { eventGoal: "" }
    );
    assert.equal(merged.eventGoal, "");
  });

  it("merges guardrails without dropping existing flags when patch omits them", () => {
    const merged = mergeEventBriefingStrategyPatch(
      {
        guardrails: { excludeUnverifiedSources: true, neutralToneBias: false },
      },
      { guardrails: { neutralToneBias: true } }
    );
    assert.equal(merged.guardrails?.excludeUnverifiedSources, true);
    assert.equal(merged.guardrails?.neutralToneBias, true);
  });

  it("keeps rapid independent patches regardless of arrival order", () => {
    const productThenGoal = mergeEventBriefingStrategyPatch(
      mergeEventBriefingStrategyPatch(complete, { productFocus: "Updated product" }),
      { eventGoal: "lead_generation" }
    );
    const goalThenProduct = mergeEventBriefingStrategyPatch(
      mergeEventBriefingStrategyPatch(complete, { eventGoal: "lead_generation" }),
      { productFocus: "Updated product" }
    );
    assert.deepEqual(productThenGoal, goalThenProduct);
    assert.equal(productThenGoal.productFocus, "Updated product");
    assert.equal(productThenGoal.eventGoal, "lead_generation");
  });
});
