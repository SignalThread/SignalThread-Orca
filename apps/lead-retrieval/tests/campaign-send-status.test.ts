import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFinalCampaignStatus } from "../lib/campaigns/campaign-send-status";

describe("resolveFinalCampaignStatus", () => {
  it("marks sent only when all recipients delivered with no failures or skips", () => {
    assert.equal(
      resolveFinalCampaignStatus({ sent: 2, failed: 0, skippedNoEmail: 0 }),
      "sent"
    );
  });

  it("marks failed when any row failed or was skipped", () => {
    assert.equal(
      resolveFinalCampaignStatus({ sent: 1, failed: 1, skippedNoEmail: 0 }),
      "failed"
    );
    assert.equal(
      resolveFinalCampaignStatus({ sent: 1, failed: 0, skippedNoEmail: 1 }),
      "failed"
    );
    assert.equal(
      resolveFinalCampaignStatus({ sent: 0, failed: 0, skippedNoEmail: 2 }),
      "failed"
    );
  });
});
