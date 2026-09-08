import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const fieldMappingStepSource = readFileSync(
  join(here, "..", "components", "import-wizard", "steps", "field-mapping-step.tsx"),
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

const batchEnrichSource = readFileSync(
  join(here, "..", "lib", "enrichment", "import-wizard-batch.ts"),
  "utf8"
);

describe("Enrichment results table — stale rows regression", () => {
  describe("field-mapping-step: server baseline must not preemptively mark as saved", () => {
    it("baseline effect does NOT call setLastSavedFingerprint", () => {
      const match = fieldMappingStepSource.match(
        /shouldApplyServerBaselineRef\.current\s*=\s*false;([\s\S]*?)},\s*\[/
      );
      assert.ok(match, "Could not find the baseline effect body");
      const body = match[1]!;
      const lines = body.split("\n").filter((l) => !l.trim().startsWith("//"));
      const hasCall = lines.some((l) => l.includes("setLastSavedFingerprint("));
      assert.ok(
        !hasCall,
        "Baseline effect still calls setLastSavedFingerprint — this causes staged_rows to skip persist and " +
          "leaves old rows in DB when a new CSV with the same headers is uploaded"
      );
    });

    it("baseline effect does NOT assign lastSavedFingerprintRef.current", () => {
      const match = fieldMappingStepSource.match(
        /shouldApplyServerBaselineRef\.current\s*=\s*false;([\s\S]*?)},\s*\[/
      );
      assert.ok(match, "Could not find the baseline effect body");
      const body = match[1]!;
      const lines = body.split("\n").filter((l) => !l.trim().startsWith("//"));
      const hasAssign = lines.some((l) => /lastSavedFingerprintRef\.current\s*=/.test(l));
      assert.ok(
        !hasAssign,
        "Baseline effect still assigns lastSavedFingerprintRef.current — same bug as above via ref"
      );
    });

    it("persist effect uses lastSavedFingerprintRef for skip check", () => {
      assert.ok(
        fieldMappingStepSource.includes("lastSavedFingerprintRef.current"),
        "Persist effect should reference lastSavedFingerprintRef.current for its skip check"
      );
    });

    it("persist effect sends staged_rows to the server", () => {
      assert.ok(
        fieldMappingStepSource.includes("staged_rows"),
        "Persist payload must include staged_rows so batch rows are replaced in DB"
      );
    });
  });

  describe("enrichment-step: table renders from enrichmentRunResult prop only", () => {
    it("does NOT import from enrichment-mock", () => {
      assert.ok(
        !enrichmentStepSource.includes("enrichment-mock"),
        "Enrichment step still imports from enrichment-mock"
      );
    });

    it("does NOT import from batch-contract", () => {
      assert.ok(
        !enrichmentStepSource.includes("batch-contract"),
        "Enrichment step still imports from batch-contract"
      );
    });

    it("does NOT contain hardcoded sample names", () => {
      const staleNames = ["Sarah Chen", "Marcus Rivera", "Priya Patel"];
      for (const name of staleNames) {
        assert.ok(
          !enrichmentStepSource.includes(name),
          `Enrichment step contains hardcoded name "${name}"`
        );
      }
    });

    it("renders sampleRows from enrichmentRunResult", () => {
      assert.ok(
        enrichmentStepSource.includes("enrichmentRunResult"),
        "Enrichment step must use enrichmentRunResult for table rows"
      );
      assert.ok(
        enrichmentStepSource.includes("sampleRows"),
        "Enrichment step must access sampleRows from the run result"
      );
    });

    it("shows stale warning when enrichmentStale is true", () => {
      assert.ok(
        enrichmentStepSource.includes("enrichmentStale"),
        "Enrichment step must check enrichmentStale prop"
      );
      assert.ok(
        enrichmentStepSource.includes("Batch data changed since the last enrichment run"),
        "Enrichment step must show stale warning message"
      );
    });
  });

  describe("import-wizard-flow: enrichment state management", () => {
    it("clears enrichmentRunResult when a new enrichment run starts", () => {
      const startBlock = flowSource.indexOf('setEnrichmentPhase("starting")');
      assert.ok(startBlock !== -1, "Flow must set phase to starting");
      const nextChunk = flowSource.slice(startBlock, startBlock + 200);
      assert.ok(
        nextChunk.includes("setEnrichmentRunResult(null)"),
        "Flow must clear enrichmentRunResult when starting a new enrichment run"
      );
    });

    it("clears enrichment state on batch id change", () => {
      assert.ok(
        flowSource.includes("setEnrichmentRunResult(null)"),
        "Flow must clear enrichment run result"
      );
      assert.ok(
        flowSource.includes("setEnrichmentRunAtDataRevision(null)"),
        "Flow must clear enrichment data revision"
      );
    });

    it("sends real batchId to enrichment API", () => {
      assert.ok(
        flowSource.includes("batchId: activeImportDraft.batchId"),
        "Flow must send activeImportDraft.batchId to the enrichment API"
      );
    });

    it("stores server response in enrichmentRunResult", () => {
      assert.ok(
        flowSource.includes("setEnrichmentRunResult(runPayload)"),
        "Flow must store the server response payload"
      );
    });
  });

  describe("server enrichment: reads from import_batch_rows only", () => {
    it("reads batch rows from import_batch_rows table", () => {
      assert.ok(
        batchEnrichSource.includes('from("import_batch_rows")'),
        "Server enrichment must read from import_batch_rows"
      );
    });

    it("filters by batch_id", () => {
      assert.ok(
        batchEnrichSource.includes('.eq("batch_id", params.batchId)'),
        "Server enrichment must filter by batch_id"
      );
    });

    it("reads field mapping selections from import_batch_field_mapping_state", () => {
      assert.ok(
        batchEnrichSource.includes('from("import_batch_field_mapping_state")'),
        "Server enrichment must read selections from field mapping state"
      );
    });

    it("derives names from batch row cells and selections", () => {
      assert.ok(
        batchEnrichSource.includes("batchRowCanonical"),
        "Server enrichment must derive display values from batch row canonical function"
      );
    });

    it("does NOT contain hardcoded sample names", () => {
      const staleNames = ["Sarah Chen", "Marcus Rivera", "Priya Patel"];
      for (const name of staleNames) {
        assert.ok(
          !batchEnrichSource.includes(name),
          `Server enrichment contains hardcoded name "${name}"`
        );
      }
    });

    it("returns dataRevision in the response", () => {
      assert.ok(
        batchEnrichSource.includes("dataRevision"),
        "Server enrichment must return dataRevision for client freshness checks"
      );
    });
  });
});
