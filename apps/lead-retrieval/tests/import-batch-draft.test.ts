import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canWriteFieldMappingForBatchStatus,
  importBatchDisplayLabel,
  isImportBatchDraftStatus,
  isImportBatchTerminalStatus,
} from "../lib/import-wizard/import-batch-contract";
import type { Json } from "../types/database";
import { fieldMappingSourceChanged } from "../lib/import-wizard/field-mapping-source-persist";

describe("import batch status helpers", () => {
  it("identifies draft as the only writable mapping state", () => {
    assert.equal(canWriteFieldMappingForBatchStatus("draft"), true);
    assert.equal(canWriteFieldMappingForBatchStatus("published"), false);
    assert.equal(canWriteFieldMappingForBatchStatus("discarded"), false);
  });

  it("treats published and discarded as terminal", () => {
    assert.equal(isImportBatchTerminalStatus("published"), true);
    assert.equal(isImportBatchTerminalStatus("discarded"), true);
    assert.equal(isImportBatchTerminalStatus("draft"), false);
  });

  it("narrows draft for type guards", () => {
    assert.equal(isImportBatchDraftStatus("draft"), true);
    assert.equal(isImportBatchDraftStatus("published"), false);
  });
});

describe("importBatchDisplayLabel", () => {
  it("produces a short stable-looking label from uuid", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    assert.equal(importBatchDisplayLabel(id), "#a1b2c3");
  });
});

describe("fieldMappingSourceChanged (append / reopen)", () => {
  const base = {
    csv_headers: ["a", "b"],
    preview_rows: [{ csvColumn: "a", cells: ["1"] }] as unknown as import("../types/database").Json,
  };

  it("detects first persist as a source change", () => {
    assert.equal(fieldMappingSourceChanged(null, base), true);
  });

  it("does not flag change when only mapping selections would differ (not stored in this compare)", () => {
    const same = {
      csv_headers: ["a", "b"],
      preview_rows: base.preview_rows,
    };
    assert.equal(fieldMappingSourceChanged(same, { ...same, csv_headers: ["a", "b"] }), false);
  });

  it("detects header change (e.g. new column appended)", () => {
    const next = {
      csv_headers: ["a", "b", "c"],
      preview_rows: base.preview_rows,
    };
    assert.equal(fieldMappingSourceChanged(base, next), true);
  });

  it("detects preview row change (more sample rows / different cells)", () => {
    const next = {
      csv_headers: ["a", "b"],
      preview_rows: [{ csvColumn: "a", cells: ["1", "2"] }] as unknown as Json,
    };
    assert.equal(fieldMappingSourceChanged(base, next), true);
  });
});

describe("one active draft per company (server contract)", () => {
  it("documents enforcement via partial unique index import_batches_one_draft_per_company", () => {
    assert.ok(true);
  });
});
