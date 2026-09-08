import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  briefingsBatchListPrimaryCta,
  briefingsReviewProgressLine,
  formatBriefingsBatchRunTitle,
  formatBriefingsImportSourceLine,
  importBatchStatusBadgeLabel,
} from "../lib/exhibitor/briefings-ui-copy";

describe("briefings UI copy helpers", () => {
  it("maps import batch status to user-facing badge labels", () => {
    assert.equal(importBatchStatusBadgeLabel("draft"), "In progress");
    assert.equal(importBatchStatusBadgeLabel("published"), "Live on leads");
    assert.equal(importBatchStatusBadgeLabel("discarded"), "discarded");
  });

  it("formats run title from created date and batch id", () => {
    const title = formatBriefingsBatchRunTitle("2026-04-18T14:00:00.000Z", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    assert.ok(title.includes("Lead brief run"));
    assert.ok(title.includes("Apr 18, 2026"));
    assert.ok(title.includes("#a1b2c3"));
  });

  it("formats import source line with basename", () => {
    assert.equal(formatBriefingsImportSourceLine("/tmp/export.csv"), "Import file: export.csv");
    assert.equal(formatBriefingsImportSourceLine(null), null);
  });

  it("summarizes review progress", () => {
    assert.equal(briefingsReviewProgressLine(3, 10), "3 of 10 briefs reviewed");
    assert.equal(briefingsReviewProgressLine(10, 10), "All 10 briefs reviewed");
    assert.equal(briefingsReviewProgressLine(0, 0), null);
  });

  it("picks list CTA by batch and briefing progress", () => {
    assert.deepStrictEqual(
      briefingsBatchListPrimaryCta({
        batchId: "b1",
        batchStatus: "published",
        briefingTotal: 5,
        briefingApproved: 2,
      }),
      { href: "/exhibitor/briefings/b1/review", label: "Open Review" }
    );
    assert.deepStrictEqual(
      briefingsBatchListPrimaryCta({
        batchId: "b2",
        batchStatus: "draft",
        briefingTotal: 5,
        briefingApproved: 2,
      }),
      { href: "/exhibitor/briefings/b2/review", label: "Continue to Review" }
    );
    assert.deepStrictEqual(
      briefingsBatchListPrimaryCta({
        batchId: "b3",
        batchStatus: "draft",
        briefingTotal: 5,
        briefingApproved: 5,
      }),
      { href: "/exhibitor/briefings/b3/review", label: "Continue to Review" }
    );
    assert.deepStrictEqual(
      briefingsBatchListPrimaryCta({
        batchId: "b4",
        batchStatus: "draft",
        briefingTotal: 0,
        briefingApproved: 0,
      }),
      { href: "/exhibitor/briefings/b4", label: "Prepare" }
    );
  });
});
