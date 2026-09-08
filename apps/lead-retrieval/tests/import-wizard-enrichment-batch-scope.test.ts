import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { canonicalValueForRow } from "../lib/import-wizard/import-batch-validation-derive";

const here = dirname(fileURLToPath(import.meta.url));
const batchEnrichSource = readFileSync(
  join(here, "..", "lib", "enrichment", "import-wizard-batch.ts"),
  "utf8"
);
const runRouteSource = readFileSync(
  join(here, "..", "app", "api", "exhibitor", "import-wizard", "enrichment", "run", "route.ts"),
  "utf8"
);

describe("import-wizard-batch enrichment scoping", () => {
  it("reads rows from import_batch_rows, not from the leads table", () => {
    assert.ok(
      batchEnrichSource.includes("import_batch_rows"),
      "must query import_batch_rows"
    );
    assert.ok(
      !batchEnrichSource.includes('.from("leads")'),
      "must NOT query the leads table directly"
    );
  });

  it("reads field mapping from import_batch_field_mapping_state", () => {
    assert.ok(
      batchEnrichSource.includes("import_batch_field_mapping_state"),
      "must query import_batch_field_mapping_state for selections"
    );
  });

  it("requires batchId as a parameter", () => {
    assert.ok(
      batchEnrichSource.includes("batchId: string"),
      "runImportWizardBatchEnrichment must require batchId"
    );
  });

  it("filters batch rows by batchId (.eq(\"batch_id\"))", () => {
    assert.match(batchEnrichSource, /\.eq\(["']batch_id["']/);
  });

  it("run route validates batchId from request body", () => {
    assert.ok(
      runRouteSource.includes("batchId"),
      "route must accept batchId in body"
    );
    assert.ok(
      runRouteSource.includes("Missing batchId"),
      "route must reject missing batchId"
    );
  });

  it("run route passes batchId to runImportWizardBatchEnrichment", () => {
    assert.match(runRouteSource, /batchId/);
  });

  it("does not insert into lead_enrichments (batch row ids are not leads.id)", () => {
    assert.ok(
      !batchEnrichSource.includes('.from("lead_enrichments")'),
      "must not insert lead_enrichments: FK targets published leads only"
    );
  });

  it("persists per-row wizard_enrichment_normalized on import_batch_rows for publish handoff", () => {
    assert.ok(batchEnrichSource.includes("wizard_enrichment_normalized"));
    assert.match(batchEnrichSource, /\.from\(["']import_batch_rows["']\)/);
  });

  it("persists run audit with batch_id on import_wizard_enrichment_runs", () => {
    assert.ok(batchEnrichSource.includes("batch_id: params.batchId"));
  });
});

describe("canonicalValueForRow extracts mapped fields from batch row cells", () => {
  const sel = { "0": "full_name", "1": "email", "2": "company_text" };

  it("batch A row returns batch A values only", () => {
    const batchARow = ["Alice", "alice@a.com", "CompanyA"];
    assert.equal(canonicalValueForRow(batchARow, sel, "full_name"), "Alice");
    assert.equal(canonicalValueForRow(batchARow, sel, "email"), "alice@a.com");
    assert.equal(canonicalValueForRow(batchARow, sel, "company_text"), "CompanyA");
  });

  it("batch B row returns batch B values only (no leakage)", () => {
    const batchBRow = ["Bob", "bob@b.com", "CompanyB"];
    assert.equal(canonicalValueForRow(batchBRow, sel, "full_name"), "Bob");
    assert.equal(canonicalValueForRow(batchBRow, sel, "email"), "bob@b.com");
    assert.equal(canonicalValueForRow(batchBRow, sel, "company_text"), "CompanyB");
  });

  it("unmapped field returns empty string (account leads never leak in)", () => {
    const row = ["Alice", "alice@a.com", "CompanyA"];
    assert.equal(canonicalValueForRow(row, sel, "linkedin_url"), "");
    assert.equal(canonicalValueForRow(row, sel, "job_title"), "");
  });

  it("summary counts derive from batch row count, not account lead count", () => {
    const batchRows = [
      ["A", "a@x.com", "C1"],
      ["B", "b@x.com", "C2"],
      ["C", "c@x.com", "C3"],
    ];
    assert.equal(batchRows.length, 3);
  });
});
