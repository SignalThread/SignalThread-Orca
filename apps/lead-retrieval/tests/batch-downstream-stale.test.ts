import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEnrichmentOutputStaleForBatch } from "../lib/import-wizard/batch-downstream-stale";

describe("isEnrichmentOutputStaleForBatch", () => {
  it("is not stale when the run revision matches the current batch revision", () => {
    assert.equal(
      isEnrichmentOutputStaleForBatch({
        enrichmentPhase: "succeeded",
        enrichmentRunResult: { runId: "x" },
        enrichmentRunAtDataRevision: 3,
        currentBatchDataRevision: 3,
      }),
      false
    );
  });

  it("is stale when batch revision advances after a successful run", () => {
    assert.equal(
      isEnrichmentOutputStaleForBatch({
        enrichmentPhase: "succeeded",
        enrichmentRunResult: { runId: "x" },
        enrichmentRunAtDataRevision: 1,
        currentBatchDataRevision: 2,
      }),
      true
    );
  });

  it("is stale when a success exists but no run revision was recorded", () => {
    assert.equal(
      isEnrichmentOutputStaleForBatch({
        enrichmentPhase: "succeeded",
        enrichmentRunResult: { runId: "x" },
        enrichmentRunAtDataRevision: null,
        currentBatchDataRevision: 1,
      }),
      true
    );
  });

  it("is not stale when phase is not succeeded", () => {
    assert.equal(
      isEnrichmentOutputStaleForBatch({
        enrichmentPhase: "ready",
        enrichmentRunResult: null,
        enrichmentRunAtDataRevision: null,
        currentBatchDataRevision: 5,
      }),
      false
    );
  });
});
