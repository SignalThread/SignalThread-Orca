import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellsMatricesEqual } from "../lib/import-wizard/cells-matrix-compare";

describe("cellsMatricesEqual", () => {
  it("detects identical matrices for revision compare", () => {
    const a = [
      ["1", "2"],
      ["3", "4"],
    ];
    assert.equal(cellsMatricesEqual(a, a), true);
    assert.equal(cellsMatricesEqual(a, structuredClone(a)), true);
  });

  it("detects changes for append/replace semantics", () => {
    const a = [["a"]];
    const b = [
      ["a"],
      ["b"],
    ];
    assert.equal(cellsMatricesEqual(a, b), false);
  });
});

describe("validation input contract", () => {
  it("deriveImportBatchValidation output follows the staged_rows matrix (what the API passes from import_batch_rows)", async () => {
    const { deriveImportBatchValidation } = await import(
      "../lib/import-wizard/import-batch-validation-derive"
    );
    const mapping = {
      csv_headers: ["Email", "Name"],
      selections: { Email: "email", Name: "name" } as Record<string, string>,
    };
    const a = deriveImportBatchValidation({
      ...mapping,
      staged_rows: [["a@x.com", "A"]],
    });
    const b = deriveImportBatchValidation({
      ...mapping,
      staged_rows: [
        ["a@x.com", "A"],
        ["b@x.com", "B"],
      ],
    });
    assert.notEqual(a.totalRows, b.totalRows);
  });
});
