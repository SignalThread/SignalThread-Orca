import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOrcaTerminology } from "./orca-terminology-contract";

test("terminology uses stable defaults and accepts readable display labels", () => {
  assert.deepEqual(normalizeOrcaTerminology({ agenda: "  Show   Flow " }), { agenda: "Show Flow", runOfShow: "Run of Show", matrix: "Matrix", showFlow: "Show Flow" });
  assert.deepEqual(normalizeOrcaTerminology({ agenda: null, matrix: null }), {
    agenda: "Agenda",
    runOfShow: "Run of Show",
    matrix: "Matrix",
    showFlow: "Show Flow",
  });
});

test("terminology rejects malformed labels before persistence", () => {
  assert.throws(() => normalizeOrcaTerminology({ matrix: "bad\u0000label" }), /control characters/);
  assert.throws(() => normalizeOrcaTerminology({ agenda: "x".repeat(61) }), /60 characters/);
  assert.throws(() => normalizeOrcaTerminology({ showFlow: 4 }), /must be text/);
});
