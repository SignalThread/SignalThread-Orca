import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const reviewClientSource = readFileSync(
  join(here, "..", "components", "exhibitor", "review-brief-client.tsx"),
  "utf8"
);

describe("Review briefs — full-batch completion state", () => {
  it("uses server queue allApproved and totalRowsInBatch for completion, not client-only queue length", () => {
    assert.match(reviewClientSource, /setQueueMeta\(/);
    assert.match(reviewClientSource, /json\.allApproved === true/);
    assert.match(reviewClientSource, /totalRowsInBatch/);
    assert.match(reviewClientSource, /showReviewCompleteScreen/);
    assert.match(reviewClientSource, /queueMeta\.allApproved === true/);
  });

  it("exposes a completion landmark for tests and accessibility", () => {
    assert.match(reviewClientSource, /data-testid="review-briefs-complete"/);
  });

  it("next-step links use canonical exhibitor routes", () => {
    assert.match(reviewClientSource, /EXHIBITOR_LEADS_PATH/);
    assert.match(reviewClientSource, /EXHIBITOR_BRIEFINGS_PATH/);
    assert.match(reviewClientSource, /#briefings-workspaces/);
    assert.match(reviewClientSource, /EXHIBITOR_BRIEFINGS_SETUP_PATH/);
  });

  it("completion screen offers Review approved briefs for this run (same batch review URL, browse mode)", () => {
    assert.match(reviewClientSource, /data-testid="review-briefs-complete-browse-approved-cta"/);
    assert.match(reviewClientSource, /batchBriefingsReviewBrowseApprovedPath\(batchId\)/);
    assert.match(reviewClientSource, /Review approved briefs for this run/);
    assert.match(reviewClientSource, /BRIEFING_REVIEW_BROWSE_APPROVED_PARAM/);
  });
});
