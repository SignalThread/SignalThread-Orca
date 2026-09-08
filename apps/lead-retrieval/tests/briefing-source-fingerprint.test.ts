import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBriefingSourceFingerprint } from "../lib/import-wizard/briefing-source-fingerprint";

describe("computeBriefingSourceFingerprint", () => {
  it("is stable for identical inputs", () => {
    const cells = ["A", "B"];
    const h = ["Col1", "Col2"];
    const sel = { "0": "full_name", "1": "email" };
    const a = computeBriefingSourceFingerprint(cells, h, sel);
    const b = computeBriefingSourceFingerprint(cells, h, sel);
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it("changes when selections change", () => {
    const cells = ["A"];
    const headers = ["X"];
    const a = computeBriefingSourceFingerprint(cells, headers, { "0": "full_name" });
    const b = computeBriefingSourceFingerprint(cells, headers, { "0": "email" });
    assert.notEqual(a, b);
  });

  it("is insensitive to key order in selections object", () => {
    const cells: string[] = [];
    const headers: string[] = [];
    const a = computeBriefingSourceFingerprint(cells, headers, { "1": "a", "0": "b" });
    const b = computeBriefingSourceFingerprint(cells, headers, { "0": "b", "1": "a" });
    assert.equal(a, b);
  });

  it("changes when custom_field_definitions change (stable batch-scoped labels)", () => {
    const cells = ["A"];
    const headers = ["X"];
    const sel = { "0": "custom:cf_n" };
    const a = computeBriefingSourceFingerprint(cells, headers, sel, { cf_n: { label: "Notes" } });
    const b = computeBriefingSourceFingerprint(cells, headers, sel, { cf_n: { label: "Notes " } });
    assert.notEqual(a, b);
  });
});
