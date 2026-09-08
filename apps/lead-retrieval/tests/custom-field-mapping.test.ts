import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUSTOM_FIELD_PREFIX,
  MAX_CUSTOM_FIELD_DEFINITIONS,
  customFieldValuesForRow,
  generateCustomStorageKey,
  isCustomMappingValue,
  parseCustomStorageKey,
  pruneCustomFieldDefinitions,
} from "../lib/import-wizard/custom-field-mapping";

describe("custom-field-mapping", () => {
  it("uses custom: prefix and stable storage keys (no fixed small cap on mapped columns)", () => {
    const k = generateCustomStorageKey("My Notes", "salt123456789");
    const v = `${CUSTOM_FIELD_PREFIX}${k}`;
    assert.ok(isCustomMappingValue(v));
    assert.equal(parseCustomStorageKey(v), k);
  });

  it("extracts per-row values for arbitrarily many custom columns", () => {
    const n = 40;
    const row = Array.from({ length: n }, (_, i) => `v${i}`);
    const selections: Record<string, string> = {};
    const defs: Record<string, { label: string }> = {};
    for (let i = 0; i < n; i++) {
      const key = `cf_col_${i}`;
      selections[String(i)] = `${CUSTOM_FIELD_PREFIX}${key}`;
      defs[key] = { label: `Col ${i}` };
    }
    const out = customFieldValuesForRow(row, selections, defs);
    assert.equal(Object.keys(out).length, n);
    assert.equal(out.cf_col_7, "v7");
  });

  it("pruneCustomFieldDefinitions keeps only keys still referenced in selections", () => {
    const selections = { "0": `${CUSTOM_FIELD_PREFIX}a`, "1": "full_name" };
    const pruned = pruneCustomFieldDefinitions(selections, {
      a: { label: "A" },
      orphan: { label: "X" },
    });
    assert.deepEqual(pruned, { a: { label: "A" } });
  });

  it("documents backend safety cap (high; not a product limit)", () => {
    assert.equal(MAX_CUSTOM_FIELD_DEFINITIONS, 500);
  });
});
