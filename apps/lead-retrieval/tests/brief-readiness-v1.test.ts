import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasManualContextInStored } from "../lib/import-wizard/briefing-content-json";
import { briefingRowReadinessBadgeV1 } from "../lib/import-wizard/briefing-readiness-v1";
import type { BriefingQueueItemView } from "../lib/import-wizard/briefing-detail-model";
import { mergeBriefingBlocksIntoContent } from "../lib/import-wizard/briefing-blocks-derive";

function queueItem(partial: Partial<BriefingQueueItemView>): BriefingQueueItemView {
  return {
    briefingRecordId: "br",
    batchRowId: "row",
    personName: "P",
    title: null,
    company: null,
    approvalStatus: "pending",
    identityComplete: true,
    hasManualContext: false,
    ...partial,
  };
}

describe("Brief Readiness v1 helpers", () => {
  it("hasManualContextInStored is false for empty content", () => {
    assert.equal(hasManualContextInStored({}), false);
  });

  it("hasManualContextInStored is true when a text field is non-empty", () => {
    assert.equal(hasManualContextInStored({ manualContext: { internalNotes: "  hi  " } }), true);
  });

  it("hasManualContextInStored is true when priority override is not auto", () => {
    assert.equal(hasManualContextInStored({ manualContext: { priorityOverride: "high" } }), true);
  });

  it("briefingRowReadinessBadgeV1 reflects approval and identity", () => {
    assert.equal(briefingRowReadinessBadgeV1(queueItem({ approvalStatus: "approved" })).label, "Approved");
    assert.equal(
      briefingRowReadinessBadgeV1(queueItem({ approvalStatus: "pending", identityComplete: false })).label,
      "Missing required mapped data"
    );
    assert.equal(
      briefingRowReadinessBadgeV1(queueItem({ approvalStatus: "pending", identityComplete: true })).label,
      "Ready for review"
    );
  });

  it("mergeBriefingBlocksIntoContent preserves manualContext", () => {
    const prev = {
      manualContext: { internalNotes: "keep me" },
      meta: { sourceFingerprint: "old", blocksVersion: 1 as const },
    };
    const derived = {
      companySnapshot: {
        name: "Co",
        tagline: "",
        quote: "",
        headcount: "",
        techSophistication: "",
        hq: "",
      },
      whyHere: [],
      talkingPoints: [],
    };
    const merged = mergeBriefingBlocksIntoContent(prev, derived, "newfp");
    assert.equal(merged.manualContext?.internalNotes, "keep me");
    assert.equal(merged.meta?.sourceFingerprint, "newfp");
  });
});
