import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const briefingServiceSource = readFileSync(
  join(here, "..", "lib", "server", "import-wizard", "import-batch-briefing-service.ts"),
  "utf8"
);

describe("briefing approval sync to lead_briefings", () => {
  it("allows review workflow on both draft and published batches", () => {
    assert.ok(
      briefingServiceSource.includes("assertBatchBriefingReviewable"),
      "approval flow should use reviewable batch guard"
    );
    assert.ok(
      briefingServiceSource.includes('batch.status !== "draft" && batch.status !== "published"'),
      "reviewable guard should allow draft and published"
    );
  });

  it("syncs approved row content into lead_briefings", () => {
    assert.ok(
      briefingServiceSource.includes("syncApprovedBriefingRowToLeadBriefing"),
      "service should define row-to-lead briefing sync helper"
    );
    assert.ok(
      briefingServiceSource.includes('from("lead_briefings")'),
      "approval sync must upsert into lead_briefings"
    );
    assert.ok(
      briefingServiceSource.includes('onConflict: "lead_id"'),
      "approval sync should be idempotent per lead"
    );
    assert.ok(
      briefingServiceSource.includes("toLeadBriefingApprovalStatus"),
      "approval sync should normalize approval status"
    );
  });

  it("triggers lead_briefings sync from both single approve and approve-all", () => {
    assert.ok(
      briefingServiceSource.includes("await syncApprovedBriefingRowToLeadBriefing({") &&
        briefingServiceSource.includes("batchRowId") &&
        briefingServiceSource.includes("for (const id of ids)"),
      "single + bulk approve paths should both invoke sync"
    );
  });

  it("surfaces structured approve results (no blind void return)", () => {
    assert.ok(
      briefingServiceSource.includes("export type ApproveBatchBriefingRowResult"),
      "single approve should expose a structured result type"
    );
    assert.ok(
      briefingServiceSource.includes("Promise<ApproveBatchBriefingRowResult>"),
      "approveBatchBriefingRow should return structured mutation outcome"
    );
    assert.ok(
      briefingServiceSource.includes("export type ApproveAllBatchBriefingRowsResult"),
      "approve-all should expose aggregate sync outcome"
    );
  });
});
