import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isImportBatchBriefingStepComplete } from "../lib/import-wizard/batch-briefing-gate";
import type { BriefingQueueItemView } from "../lib/import-wizard/briefing-detail-model";

function item(approvalStatus: BriefingQueueItemView["approvalStatus"]): BriefingQueueItemView {
  return {
    briefingRecordId: "br1",
    batchRowId: "row1",
    personName: "A",
    title: null,
    company: null,
    approvalStatus,
    identityComplete: true,
    hasManualContext: false,
  };
}

describe("isImportBatchBriefingStepComplete", () => {
  it("is false when the queue is empty (nothing to publish)", () => {
    assert.equal(isImportBatchBriefingStepComplete([]), false);
  });

  it("is false when any row is not approved", () => {
    assert.equal(isImportBatchBriefingStepComplete([item("approved"), item("pending")]), false);
  });

  it("is true when there is at least one row and all are approved", () => {
    assert.equal(isImportBatchBriefingStepComplete([item("approved")]), true);
    assert.equal(isImportBatchBriefingStepComplete([item("approved"), item("approved")]), true);
  });
});

