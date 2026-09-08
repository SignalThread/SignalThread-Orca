import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exhibitorLeadBriefingJsonHasRenderableAiBrief,
  exhibitorLeadBriefStoredContentHasRenderableAiBriefSections,
} from "../lib/leads/exhibitorLeadAiBriefRenderable";

describe("exhibitorLeadAiBriefRenderable (canonical list + detail rule)", () => {
  it("is false when content is null or empty object", () => {
    assert.equal(exhibitorLeadBriefingJsonHasRenderableAiBrief(null), false);
    assert.equal(exhibitorLeadBriefingJsonHasRenderableAiBrief({}), false);
  });

  it("is false when row would exist but no section has renderable payload", () => {
    assert.equal(
      exhibitorLeadBriefStoredContentHasRenderableAiBriefSections({
        talkingPoints: [{ title: "Only title", detail: "" }],
        whyHere: ["  ", ""],
      }),
      false
    );
  });

  it("is true when whyHere has a non-empty line (matches detail tab)", () => {
    assert.equal(
      exhibitorLeadBriefStoredContentHasRenderableAiBriefSections({
        whyHere: ["DEV: evaluating platform"],
      }),
      true
    );
  });

  it("is true when talkingPoints has title+detail (matches detail tab)", () => {
    assert.equal(
      exhibitorLeadBriefStoredContentHasRenderableAiBriefSections({
        talkingPoints: [{ title: "ROI", detail: "Time to value" }],
      }),
      true
    );
  });

  it("is true for competitorContext string (matches detail tab)", () => {
    assert.equal(
      exhibitorLeadBriefStoredContentHasRenderableAiBriefSections({
        competitorContext: "Competitors: X and Y",
      }),
      true
    );
  });

  it("is true for full gaps shape (matches What We Still Don't Know)", () => {
    assert.equal(
      exhibitorLeadBriefStoredContentHasRenderableAiBriefSections({
        gaps: [{ gap: "Budget", whyItMatters: "Qualify", probe: "Ask about fiscal year" }],
      }),
      true
    );
  });

  it("json wrapper parses and matches stored helper", () => {
    const json = {
      whyHere: ["x"],
      questionsToAsk: [],
    };
    assert.equal(exhibitorLeadBriefingJsonHasRenderableAiBrief(json), true);
  });
});
