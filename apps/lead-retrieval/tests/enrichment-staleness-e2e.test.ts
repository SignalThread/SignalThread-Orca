import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { isEnrichmentOutputStaleForBatch } from "../lib/import-wizard/batch-downstream-stale";

const here = dirname(fileURLToPath(import.meta.url));

const batchEnrichSource = readFileSync(
  join(here, "..", "lib", "enrichment", "import-wizard-batch.ts"),
  "utf8"
);

const enrichmentStepSource = readFileSync(
  join(here, "..", "components", "import-wizard", "steps", "enrichment-step.tsx"),
  "utf8"
);

const flowSource = readFileSync(
  join(here, "..", "components", "import-wizard", "import-wizard-flow.tsx"),
  "utf8"
);

describe("enrichment results → source alignment", () => {
  it("server enrichment reads displayName from batch row cells (not mock data)", () => {
    assert.ok(
      batchEnrichSource.includes('batchRowCanonical(cells, selections, "full_name")'),
      "displayName must derive from batch row cells via canonical mapping"
    );
  });

  it("server enrichment reads displayEmail from batch row cells", () => {
    assert.ok(
      batchEnrichSource.includes('batchRowCanonical(cells, selections, "email")'),
      "displayEmail must derive from batch row cells"
    );
  });

  it("server enrichment reads displayCompany from batch row cells", () => {
    assert.ok(
      batchEnrichSource.includes('batchRowCanonical(cells, selections, "company_text")'),
      "displayCompany must derive from batch row cells"
    );
  });

  it("enrichment run returns dataRevision to client for staleness check", () => {
    assert.ok(
      batchEnrichSource.includes("dataRevision: batchDataRevision"),
      "server outcome must include dataRevision"
    );
  });

  it("enrichment step does not import any mock data module", () => {
    assert.ok(
      !enrichmentStepSource.includes("enrichment-mock"),
      "enrichment-step must not import enrichment-mock"
    );
  });
});

describe("stale enrichment run → no display as current", () => {
  it("enrichmentStale=true when batch data_revision advances after a run", () => {
    assert.equal(
      isEnrichmentOutputStaleForBatch({
        enrichmentPhase: "succeeded",
        enrichmentRunResult: { runId: "r1" },
        enrichmentRunAtDataRevision: 1,
        currentBatchDataRevision: 2,
      }),
      true
    );
  });

  it("enrichmentStale=false when revision matches", () => {
    assert.equal(
      isEnrichmentOutputStaleForBatch({
        enrichmentPhase: "succeeded",
        enrichmentRunResult: { runId: "r1" },
        enrichmentRunAtDataRevision: 2,
        currentBatchDataRevision: 2,
      }),
      false
    );
  });

  it("enrichment step renders stale panel instead of old results when stale", () => {
    assert.ok(
      enrichmentStepSource.includes('data-testid="import-wizard-enrichment-stale"'),
      "stale state must render a distinct testid"
    );
    assert.ok(
      enrichmentStepSource.includes("Batch data changed since the last enrichment run"),
      "stale UI must have explicit message"
    );
    assert.ok(
      enrichmentStepSource.includes("Re-run enrichment"),
      "stale UI must offer re-run CTA"
    );
  });

  it("enrichment continue action is gated on fresh successful results", () => {
    assert.ok(
      enrichmentStepSource.includes('data-testid="import-wizard-enrichment-continue"'),
      "enrichment results must expose the continue action in the step content"
    );
    assert.ok(
      enrichmentStepSource.includes("disabled={!canContinue}"),
      "enrichment continue action must be disabled when results cannot continue"
    );
    assert.ok(
      flowSource.includes('const enrichmentCanContinue = enrichmentPhase === "succeeded" && !enrichmentStale'),
      "continue requires both succeeded and not-stale"
    );
    assert.ok(flowSource.includes("if (!enrichmentCanContinue) return;"), "navigation must keep the same guard");
    assert.ok(flowSource.includes("onContinue={goToValidationStep}"), "continue must route through the guarded callback");
  });

  it("flow tracks enrichmentRunAtDataRevision separately from batch dataRevision", () => {
    assert.ok(
      flowSource.includes("enrichmentRunAtDataRevision"),
      "flow must track the revision at which enrichment last ran"
    );
    assert.ok(
      flowSource.includes("isEnrichmentOutputStaleForBatch"),
      "flow must call the canonical staleness helper"
    );
  });
});
