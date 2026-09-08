import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leadQualificationChanged } from "@/lib/leads/leadQualificationChange";

describe("leadQualificationChanged", () => {
  const before = {
    rating: 0,
    temperature: null,
    status: "new",
  };

  it("returns true when rating, temperature, or status changes", () => {
    assert.equal(leadQualificationChanged({ rating: 5 }, before, { ...before, rating: 5 }), true);
    assert.equal(leadQualificationChanged({ temperature: "Cold" }, before, { ...before, temperature: "cold" }), true);
    assert.equal(leadQualificationChanged({ status: "follow_up" }, before, { ...before, status: "follow_up" }), true);
  });

  it("returns false for follow-up, email, enrichment, and other non-qualification patches", () => {
    assert.equal(
      leadQualificationChanged(
        { follow_up_date: "2026-06-12", email: "ada@example.com", company_domain: "example.com" },
        before,
        { ...before }
      ),
      false
    );
  });

  it("returns false for no-op qualification saves", () => {
    const assessed = { rating: 5, temperature: "hot", status: "new" };
    assert.equal(leadQualificationChanged({ rating: 5 }, assessed, assessed), false);
    assert.equal(leadQualificationChanged({ temperature: "HOT" }, assessed, assessed), false);
    assert.equal(leadQualificationChanged({ status: "new" }, assessed, assessed), false);
  });
});
