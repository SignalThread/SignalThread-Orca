import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPreShowBriefSections } from "../lib/leads/exhibitor-lead-preshow-brief-sections";

describe("buildPreShowBriefSections", () => {
  it("omits empty sections and preserves stable ordering", () => {
    const sections = buildPreShowBriefSections({
      whyHere: ["Authority note", "Pain note"],
      questionsToAsk: ["Q1"],
      talkingPoints: [{ title: "T1", detail: "D1" }],
      signalsToWatch: [],
      gaps: [],
      competitorContext: "Cvent"
    });
    assert.equal(sections.length, 4);
    assert.equal(sections[0]!.id, "key-context");
    assert.equal(sections[0]!.type, "list");
    assert.equal(sections[1]!.id, "questions");
    assert.equal(sections[2]!.id, "positioning");
    assert.equal(sections[3]!.id, "competitor");
  });

  it("returns no sections for empty stored content", () => {
    assert.equal(buildPreShowBriefSections({}).length, 0);
  });
});
