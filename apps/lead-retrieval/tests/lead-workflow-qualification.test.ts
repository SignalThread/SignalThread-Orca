import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leadHasWorkflowQualificationSignal } from "@/lib/leads/leadWorkflowQualification";

describe("lead workflow qualification signal", () => {
  it("treats raw mobile scan defaults as unqualified", () => {
    assert.equal(
      leadHasWorkflowQualificationSignal({
        rating: 0,
        temperature: null,
        status: "new",
        priority_score: 0
      }),
      false
    );
  });

  it("treats rating, temperature, status, or priority score as workflow qualification signals", () => {
    assert.equal(leadHasWorkflowQualificationSignal({ rating: 4 }), true);
    assert.equal(leadHasWorkflowQualificationSignal({ temperature: "hot" }), true);
    assert.equal(leadHasWorkflowQualificationSignal({ status: "follow_up" }), true);
    assert.equal(leadHasWorkflowQualificationSignal({ priority_score: 80 }), true);
  });
});
