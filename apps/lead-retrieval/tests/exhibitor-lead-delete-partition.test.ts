import test from "node:test";
import assert from "node:assert/strict";
import { partitionLeadIdsForExhibitorDelete } from "../lib/leads/exhibitorLeadDeletePartition";

test("partitionLeadIdsForExhibitorDelete: all in scope → deletable only", () => {
  const company = "c1";
  const rows = [
    { id: "a", company_id: company },
    { id: "b", company_id: company }
  ];
  const r = partitionLeadIdsForExhibitorDelete(["a", "b"], rows, company);
  assert.deepEqual(r.deletable, ["a", "b"]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.forbidden, []);
});

test("partitionLeadIdsForExhibitorDelete: unknown id → missing", () => {
  const r = partitionLeadIdsForExhibitorDelete(["x"], [], "c1");
  assert.deepEqual(r.missing, ["x"]);
  assert.deepEqual(r.deletable, []);
});

test("partitionLeadIdsForExhibitorDelete: wrong company → forbidden", () => {
  const r = partitionLeadIdsForExhibitorDelete(
    ["a"],
    [{ id: "a", company_id: "other" }],
    "mine"
  );
  assert.equal(r.forbidden.length, 1);
  assert.equal(r.forbidden[0].leadId, "a");
  assert.deepEqual(r.deletable, []);
});

test("partitionLeadIdsForExhibitorDelete: mixed outcomes", () => {
  const r = partitionLeadIdsForExhibitorDelete(
    ["ok", "gone", "otherco"],
    [
      { id: "ok", company_id: "c1" },
      { id: "otherco", company_id: "c2" }
    ],
    "c1"
  );
  assert.deepEqual(r.deletable, ["ok"]);
  assert.deepEqual(r.missing, ["gone"]);
  assert.equal(r.forbidden[0].leadId, "otherco");
});
