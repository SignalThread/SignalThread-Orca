import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Review briefs — automatic polish and editable drafts", () => {
  it("documents the current OpenAI polish provider/model and does not change it", () => {
    const polish = read("lib/server/import-wizard/briefing-ai-polish.ts");
    assert.match(polish, /import OpenAI from "openai"/);
    assert.match(polish, /chat\.completions\.create/);
    assert.match(polish, /BRIEFING_POLISH_OPENAI_MODEL = process\.env\.OPENAI_MODEL\?\.trim\(\) \|\| "gpt-4o-mini"/);
  });

  it("persists AI polish on the existing polish route so review shows polished content by default", () => {
    const route = read("app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/ai-polish/route.ts");
    const client = read("components/exhibitor/review-brief-client.tsx");
    assert.match(route, /runBriefingAiPolish/);
    assert.match(route, /savePolishedBriefingForBatchRow/);
    assert.match(client, /json\.detail\.polished/);
    assert.match(client, /viewVariant=\{polishedForRow \? "polished" : "deterministic"\}/);
  });

  it("automatically triggers polish once per unpolished review row", () => {
    const client = read("components/exhibitor/review-brief-client.tsx");
    assert.match(client, /autoPolishAttempted/);
    assert.match(client, /handleAiPolish\(\{ automatic: true \}\)/);
    assert.match(client, /detail\.polished/);
    assert.match(client, /detail\.hasManualBriefEdits/);
  });

  it("keeps manual re-polish and warns before overwriting reviewer edits", () => {
    const client = read("components/exhibitor/review-brief-client.tsx");
    const route = read("app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/ai-polish/route.ts");
    const service = read("lib/server/import-wizard/import-batch-briefing-service.ts");
    assert.match(client, /data-testid="brief-secondary-actions"/);
    assert.match(client, /Polish again/);
    assert.doesNotMatch(client, /Brief display/);
    assert.doesNotMatch(client, />Standard</);
    assert.doesNotMatch(client, />Polished</);
    assert.match(client, /window\.confirm\("Re-polishing may rewrite text you edited\. Continue\?"\)/);
    assert.match(client, /forceOverwriteManualEdits: detail\.hasManualBriefEdits/);
    assert.match(route, /forceOverwriteManualEdits/);
    assert.match(service, /briefing_manual_edits_present/);
  });

  it("does not render the main Standard/Polished display toggle when polish is automatic", () => {
    const client = read("components/exhibitor/review-brief-client.tsx");
    assert.doesNotMatch(client, /setBriefViewVariant/);
    assert.doesNotMatch(client, /Brief display/);
    assert.doesNotMatch(client, />Standard</);
    assert.doesNotMatch(client, />Polished</);
    assert.match(client, /viewVariant=\{polishedForRow \? "polished" : "deterministic"\}/);
  });

  it("allows users to edit and save each major brief section", () => {
    const sections = read("components/import-wizard/import-briefing-view-sections.tsx");
    const route = read("app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/route.ts");
    const client = read("components/exhibitor/review-brief-client.tsx");
    assert.match(sections, /type EditableSection = "identity" \| "why" \| "talking" \| "questions" \| "competitors" \| "signals" \| "gaps"/);
    assert.match(sections, /data-testid=\{`brief-section-edit-\$\{section\}`\}/);
    assert.match(sections, /data-testid=\{`brief-section-editor-\$\{section\}`\}/);
    assert.match(sections, /data-testid="brief-section-editor-identity"/);
    assert.match(sections, /onSaveEditedBrief/);
    assert.match(client, /action: "save_brief_edits"/);
    assert.match(route, /saveEditedBriefingForBatchRow/);
  });

  it("approval sync uses edited or polished content instead of recomputing over it", () => {
    const service = read("lib/server/import-wizard/import-batch-briefing-service.ts");
    const contentType = read("lib/import-wizard/briefing-content-json.ts");
    assert.match(contentType, /polished\?: BriefingPolishedBundle/);
    assert.match(contentType, /briefingEdits/);
    assert.match(service, /finalContentFromDetail/);
    assert.match(service, /polished\?\.whyHere/);
    assert.match(service, /polished\?\.talkingPoints/);
    assert.match(service, /polished\?\.questions/);
    assert.match(service, /polished\?\.signals/);
    assert.match(service, /polished\?\.gaps/);
  });
});
