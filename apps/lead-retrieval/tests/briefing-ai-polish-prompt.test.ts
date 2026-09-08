import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGuardrailInstructions,
  buildQualityBarInstructions,
  buildSpecificityContractInstructions,
  buildStrategicRewriteSectionGuidance,
  buildToneInstructions,
} from "@/lib/import-wizard/briefing-ai-polish-prompt";

describe("briefing AI polish prompts", () => {
  it("buildToneInstructions reflects analytical + concise", () => {
    const s = buildToneInstructions("Analytical, Concise");
    assert.match(s, /Analytical, Concise/i);
    assert.match(s, /concise/i);
    assert.match(s, /analytical/i);
  });

  it("buildToneInstructions falls back when empty", () => {
    const s = buildToneInstructions("  ");
    assert.match(s, /seller|notes|conversation|MANUAL_CONTEXT/i);
  });

  it("buildGuardrailInstructions includes unverified constraint when enabled", () => {
    const s = buildGuardrailInstructions({ excludeUnverifiedSources: true });
    assert.match(s, /Verified sources only/i);
    assert.match(s, /DETERMINISTIC_BUNDLE|FOUNDATIONS|SOURCE_SNIPPETS|MANUAL_CONTEXT/i);
    assert.match(s, /Full sentence rewrites are allowed/i);
  });

  it("buildGuardrailInstructions states realtime drift limitation", () => {
    const s = buildGuardrailInstructions({ realtimeDriftDetection: true });
    assert.match(s, /not runtime monitoring/i);
  });

  it("buildGuardrailInstructions neutral tone removes hype instruction", () => {
    const s = buildGuardrailInstructions({ neutralToneBias: true });
    assert.match(s, /Neutral tone/i);
    assert.match(s, /hype|superlatives/i);
  });

  it("buildQualityBarInstructions forbids near-copy and requires strategic rewrite", () => {
    const s = buildQualityBarInstructions();
    assert.match(s, /GROUNDED STRATEGIC REWRITE/i);
    assert.match(s, /near-copy|FORBIDDEN/i);
    assert.match(s, /section-level/i);
    assert.match(s, /SPECIFICITY CHECK|vaguer/i);
  });

  it("buildSpecificityContractInstructions penalizes generic filler and preserves notes", () => {
    const s = buildSpecificityContractInstructions();
    assert.match(s, /SPECIFICITY_CONTRACT/i);
    assert.match(s, /PRESERVE|FORBIDDEN/i);
    assert.match(s, /MANUAL_CONTEXT|BATCH_NOTES/i);
    assert.match(s, /GTM|enablement|synergies/i);
  });

  it("buildStrategicRewriteSectionGuidance names section targets", () => {
    const s = buildStrategicRewriteSectionGuidance();
    assert.match(s, /whyHere|talkingPoints|questions|competitorLines|signals|gaps/i);
    assert.match(s, /SECTION_REWRITE_TARGETS/i);
    assert.match(s, /Person-first|situational|never vaguer/i);
  });
});
