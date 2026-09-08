import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const materializationSource = readFileSync(
  join(here, "..", "lib", "server", "import-wizard", "publish-leads-materialization.ts"),
  "utf8"
);

describe("publish materialization persists durable lead briefing linkage", () => {
  it("loads source briefing rows from import_batch_row_briefings", () => {
    assert.ok(
      materializationSource.includes('from("import_batch_row_briefings")'),
      "publish materialization must read source row briefings"
    );
    assert.ok(
      materializationSource.includes("batch_row_id"),
      "publish materialization must include batch_row_id for row->lead linkage"
    );
  });

  it("maps source briefings by batch row id", () => {
    assert.ok(
      materializationSource.includes("briefingByBatchRowId"),
      "publish materialization must build a row-id keyed briefing map"
    );
    assert.ok(
      materializationSource.includes("row.batchRowId"),
      "publish materialization must use row.batchRowId to resolve source briefing"
    );
  });

  it("upserts lead_briefings for inserted leads", () => {
    assert.ok(
      materializationSource.includes('from("lead_briefings")'),
      "publish materialization must write to lead_briefings"
    );
    assert.ok(
      materializationSource.includes("lead_id: inserted.id"),
      "lead_briefings upsert must be linked to inserted lead id"
    );
    assert.ok(
      materializationSource.includes("company_id: companyId"),
      "lead_briefings upsert must preserve company scope"
    );
    assert.ok(
      materializationSource.includes("linkedContent") &&
        materializationSource.includes("content: linkedContent"),
      "lead_briefings upsert must persist linked briefing content"
    );
    assert.ok(
      materializationSource.includes("approval_status: toLeadBriefingApprovalStatus"),
      "lead_briefings upsert must normalize approval status"
    );
    assert.ok(
      materializationSource.includes('onConflict: "lead_id"'),
      "lead_briefings upsert should be idempotent per lead"
    );
  });

  it("merges durable published lead linkage into row briefing content", () => {
    assert.ok(
      materializationSource.includes("parseBriefingContent(sourceBriefing.content)"),
      "publish materialization should parse existing briefing content"
    );
    assert.ok(
      materializationSource.includes("linkage") &&
        materializationSource.includes("published_lead_id: inserted.id"),
      "publish materialization must write content.linkage.published_lead_id"
    );
    assert.ok(
      materializationSource.includes("briefing linkage content update failed"),
      "publish materialization should log linkage content update failures"
    );
  });
});
