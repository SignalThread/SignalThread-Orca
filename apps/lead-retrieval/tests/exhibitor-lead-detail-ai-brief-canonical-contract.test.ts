import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const detailPageSource = readFileSync(
  join(here, "..", "app", "(app)", "exhibitor", "leads", "[leadId]", "page.tsx"),
  "utf8"
);

describe("exhibitor lead detail — AI Brief canonical rule shared with list", () => {
  it("uses shared renderability helper for briefingHasSections", () => {
    assert.match(detailPageSource, /exhibitorLeadBriefStoredContentHasRenderableAiBriefSections/);
    assert.match(detailPageSource, /\.from\("lead_briefings"\)/);
  });

  it("renders Pre-Show Brief through ExhibitorLeadPreShowBriefPanel with parsed briefing props", () => {
    assert.match(detailPageSource, /ExhibitorLeadPreShowBriefPanel/);
    assert.match(detailPageSource, /leadFullName=\{lead\.full_name\}/);
    assert.match(detailPageSource, /briefingUpdatedAt=/);
    assert.match(detailPageSource, /buildPreShowBriefSections/);
    assert.match(detailPageSource, /briefingSections=\{briefingSections\}/);
  });
});
