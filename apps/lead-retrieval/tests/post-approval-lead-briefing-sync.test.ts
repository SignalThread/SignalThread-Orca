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

const rowRouteSource = readFileSync(
  join(
    here,
    "..",
    "app",
    "api",
    "exhibitor",
    "import-wizard",
    "batches",
    "[batchId]",
    "briefing-rows",
    "[rowId]",
    "route.ts"
  ),
  "utf8"
);

const approveAllRouteSource = readFileSync(
  join(
    here,
    "..",
    "app",
    "api",
    "exhibitor",
    "import-wizard",
    "batches",
    "[batchId]",
    "briefing-rows",
    "approve-all",
    "route.ts"
  ),
  "utf8"
);

const reviewClientSource = readFileSync(
  join(here, "..", "components", "exhibitor", "review-brief-client.tsx"),
  "utf8"
);

describe("post-approval lead_briefings sync (contract)", () => {
  it("sync returns ApprovedBriefingSyncResult and logs structured approve_briefing_lead_sync events", () => {
    assert.match(serviceSource, /export async function syncApprovedBriefingRowToLeadBriefing/);
    assert.match(serviceSource, /Promise<ApprovedBriefingSyncResult>/);
    assert.match(serviceSource, /logApprovedBriefingSyncStructured/);
    assert.match(serviceSource, /"approve_briefing_lead_sync"/);
    assert.match(serviceSource, /phase: "lead_briefings_upsert_attempt"/);
    assert.match(serviceSource, /published_lead_id:/);
  });

  it("refuses email fallback when published_lead_id is present but not in company scope", () => {
    assert.match(serviceSource, /invalid_published_lead_linkage/);
    assert.match(serviceSource, /never email-guess over a bad linkage/);
  });

  it("approve uses service role after batch guard so sync is not blocked by import RLS", () => {
    assert.match(serviceSource, /export async function approveBatchBriefingRow[\s\S]*?const supabase = createAdminClient\(\)/);
  });

  it("exposes reconcile helper for approved rows missing lead_briefings", () => {
    assert.match(serviceSource, /export async function reconcileApprovedBatchBriefingsToLeadBriefings/);
  });

  it("single-approve API returns post-mutation sync fields, not blind ok: true", () => {
    assert.match(rowRouteSource, /approvalUpdated:/);
    assert.match(rowRouteSource, /syncAttempted:/);
    assert.match(rowRouteSource, /syncSucceeded:/);
    assert.match(rowRouteSource, /resolvedLeadId:/);
    assert.match(rowRouteSource, /leadBriefingWritten:/);
    assert.match(rowRouteSource, /failureReason:/);
    assert.match(rowRouteSource, /ok: approveResult\.ok/);
  });

  it("approve-all API returns authoritative progress and sync failure list", () => {
    assert.match(approveAllRouteSource, /getBatchBriefingReviewProgress/);
    assert.match(approveAllRouteSource, /syncSucceededCount/);
    assert.match(approveAllRouteSource, /syncFailedCount/);
    assert.match(approveAllRouteSource, /syncFailures/);
    assert.match(approveAllRouteSource, /ok: bulk\.ok/);
  });

  it("review client prefers server progress for bulk approve and surfaces sync ok: false", () => {
    assert.match(reviewClientSource, /json\.progress\?\.totalRowsInBatch/);
    assert.match(reviewClientSource, /json\.ok === false/);
    assert.match(reviewClientSource, /patchJson\.ok === false/);
  });
});
