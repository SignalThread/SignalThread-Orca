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

const queueRouteSource = readFileSync(
  join(here, "..", "app", "api", "exhibitor", "import-wizard", "batches", "[batchId]", "briefing-queue", "route.ts"),
  "utf8"
);

describe("briefing-queue access for published import batches (exhibitor_admin)", () => {
  it("loadBatchBriefingQueue delegates batch lifecycle to assertBatchBriefingReviewable (draft + published)", () => {
    const fnBlock = briefingServiceSource.match(
      /export async function loadBatchBriefingQueue\([\s\S]*?\n}\n\nexport async function loadBatchBriefingDetail/
    );
    assert.ok(fnBlock, "expected loadBatchBriefingQueue block before loadBatchBriefingDetail");
    const body = fnBlock![0];
    assert.match(body, /await assertBatchBriefingReviewable\(batchId, companyId\)/);
    assert.doesNotMatch(body, /batch_not_draft/);
  });

  it("loadBatchBriefingDetail allows draft and published batches only", () => {
    const fnBlock = briefingServiceSource.match(
      /export async function loadBatchBriefingDetail\([\s\S]*?\n}\n\nexport async function approveBatchBriefingRow/
    );
    assert.ok(fnBlock, "expected loadBatchBriefingDetail block before approveBatchBriefingRow");
    const body = fnBlock![0];
    assert.match(
      body,
      /batch\.status !== "draft" && batch\.status !== "published"\)\) return null/
    );
  });

  it("briefing-queue GET maps batch_not_reviewable to 409 (discarded / invalid status)", () => {
    assert.match(queueRouteSource, /batch_not_reviewable/);
    assert.match(queueRouteSource, /status:\s*409/);
  });

  it("briefing-queue GET still maps missing / wrong-company batch to 404", () => {
    assert.match(queueRouteSource, /batch_not_found/);
    assert.match(queueRouteSource, /status:\s*404/);
  });
});
