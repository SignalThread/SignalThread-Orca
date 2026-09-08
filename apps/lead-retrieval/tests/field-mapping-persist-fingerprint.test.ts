import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldMappingPersistFingerprint } from "../lib/import-wizard/field-mapping-persist-fingerprint";

describe("fieldMappingPersistFingerprint", () => {
  it("is stable for identical logical payloads (sorted selections keys)", () => {
    const a = fieldMappingPersistFingerprint({
      csv_headers: ["a", "b"],
      preview_rows: [{ csvColumn: "a", cells: ["1"] }],
      selections: { "1": "email", "0": "full_name" },
      custom_field_definitions: {},
      staged_rows: [["x", "y"]],
      source_filename: "f.csv",
    });
    const b = fieldMappingPersistFingerprint({
      csv_headers: ["a", "b"],
      preview_rows: [{ csvColumn: "a", cells: ["1"] }],
      selections: { "0": "full_name", "1": "email" },
      custom_field_definitions: {},
      staged_rows: [["x", "y"]],
      source_filename: "f.csv",
    });
    assert.equal(a, b);
  });

  it("changes when staged data changes", () => {
    const base = {
      csv_headers: ["a"],
      preview_rows: [{ csvColumn: "a", cells: ["1"] }],
      selections: { "0": "full_name" },
      custom_field_definitions: {},
      staged_rows: [["x"]],
      source_filename: "f.csv",
    };
    const a = fieldMappingPersistFingerprint(base);
    const b = fieldMappingPersistFingerprint({ ...base, staged_rows: [["z"]] });
    assert.notEqual(a, b);
  });
});
