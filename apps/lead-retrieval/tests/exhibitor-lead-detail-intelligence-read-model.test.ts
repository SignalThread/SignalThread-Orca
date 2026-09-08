import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const page = readFileSync(
  path.join(process.cwd(), "app/(app)/exhibitor/leads/[leadId]/page.tsx"),
  "utf8"
);

describe("exhibitor lead detail canonical intelligence read path", () => {
  it("selects a usable synthesis and hydrates the canonical cumulative intelligence contract", () => {
    assert.match(page, /selectCanonicalConversationIntelligence/);
    assert.match(page, /from\("lead_cumulative_insights"\)/);
    assert.match(page, /buildCanonicalConversationIntelligence/);
    assert.doesNotMatch(page, /\.limit\(1\)\s*\.maybeSingle\(\).*lead_conversations/s);
  });

  it("renders structured intelligence fields instead of only the legacy summary fields", () => {
    for (const label of [
      "Priority Themes",
      "Pain Points & Needs",
      "Buying Signals",
      "Competitors Mentioned",
      "Desired Outcomes"
    ]) {
      assert.match(page, new RegExp(label.replace(/[&]/g, "&")));
    }
  });
});
