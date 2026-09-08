import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const leadsPageSource = readFileSync(join(here, "..", "app", "(app)", "exhibitor", "leads", "page.tsx"), "utf8");
const tableSource = readFileSync(join(here, "..", "components", "leads", "exhibitor-leads-table.tsx"), "utf8");

describe("exhibitor leads list — AI Brief from lead_briefings (contract)", () => {
  it("loads lead_briefings scoped by company_id and lead_id chunk for list cards", () => {
    assert.match(leadsPageSource, /\.from\("lead_briefings"\)/);
    assert.match(leadsPageSource, /exhibitorLeadBriefingJsonHasRenderableAiBrief/);
    assert.match(leadsPageSource, /\.eq\("company_id", companyId\)/);
    assert.match(leadsPageSource, /\.in\("lead_id", chunk\)/);
    assert.match(leadsPageSource, /aiBriefRenderable/);
  });

  it("shows AI Brief link only when server sets aiBriefRenderable", () => {
    assert.match(tableSource, /lead\.aiBriefRenderable/);
    assert.match(tableSource, /#ai-brief/);
    assert.match(tableSource, /lead-card-ai-brief/);
  });
});
