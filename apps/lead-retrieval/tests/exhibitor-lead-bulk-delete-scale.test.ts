import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkLeadIds, partitionLeadIdsForExhibitorDelete } from "../lib/leads/exhibitorLeadDeletePartition";

describe("event-scoped bulk lead deletion", () => {
  it("handles 1, 199, 200, 201, 1,000, and 5,000 requested IDs without truncation", () => {
    for (const count of [1, 199, 200, 201, 1_000, 5_000]) {
      const ids = Array.from({ length: count }, (_, index) => `lead-${index}`);
      const chunks = chunkLeadIds(ids);
      assert.equal(chunks.flat().length, count);
      assert.equal(new Set(chunks.flat()).size, count);
      assert.ok(chunks.every((chunk) => chunk.length <= 500));
    }
  });

  it("only permits leads in the requested company and event", () => {
    const result = partitionLeadIdsForExhibitorDelete(
      ["event-a", "event-b", "other-company", "missing"],
      [
        { id: "event-a", company_id: "company-1", event_id: "event-a" },
        { id: "event-b", company_id: "company-1", event_id: "event-b" },
        { id: "other-company", company_id: "company-2", event_id: "event-a" }
      ],
      "company-1",
      "event-a"
    );
    assert.deepEqual(result.deletable, ["event-a"]);
    assert.deepEqual(result.missing, ["missing"]);
    assert.deepEqual(result.forbidden.map((item) => item.leadId), ["event-b", "other-company"]);
  });
});
