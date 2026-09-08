import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const serviceSource = readFileSync(
  join(here, "..", "lib", "server", "import-wizard", "import-batch-briefing-service.ts"),
  "utf8"
);

describe("manual context save wiring (published + draft batches)", () => {
  it("saveManualContextForBatchRow gates on assertBatchBriefingReviewable, not draft-only", () => {
    const i = serviceSource.lastIndexOf("export async function saveManualContextForBatchRow");
    assert.ok(i >= 0, "saveManualContextForBatchRow not found");
    const tail = serviceSource.slice(i);
    assert.match(tail, /await assertBatchBriefingReviewable\(batchId, companyId\)/);
    assert.doesNotMatch(tail, /assertDraftBatchWritable/);
  });

  it("loadBatchBriefingDetail loads field mapping via getFieldMappingStateForBatchWithAdmin (queue parity)", () => {
    const block = serviceSource.match(
      /export async function loadBatchBriefingDetail\([\s\S]*?\n}\n\nexport async function approveBatchBriefingRow/
    );
    assert.ok(block, "expected loadBatchBriefingDetail block");
    assert.match(block![0], /getFieldMappingStateForBatchWithAdmin\(batchId\)/);
    assert.doesNotMatch(block![0], /getFieldMappingStateForBatch\(batchId\)/);
  });

  it("syncApprovedBriefingRowToLeadBriefing uses admin field mapping read", () => {
    const i = serviceSource.indexOf("async function syncApprovedBriefingRowToLeadBriefing");
    assert.ok(i >= 0);
    const syncFn = serviceSource.slice(i, serviceSource.indexOf("\nexport async function loadBatchBriefingQueue"));
    assert.match(syncFn, /getFieldMappingStateForBatchWithAdmin\(batchId\)/);
    assert.doesNotMatch(syncFn, /getFieldMappingStateForBatch\(batchId\)/);
  });
});
