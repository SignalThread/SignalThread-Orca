import assert from "node:assert/strict";
import test from "node:test";
import { calculateTimelineCompletion } from "@/lib/timeline/completion";

test("Timeline completion ignores stored item progress and uses Complete status", () => {
  const completion = calculateTimelineCompletion([
    { status: "COMPLETE", progress: 0 },
    { status: "IN_PROGRESS", progress: 100 },
    { status: "AT_RISK", progress: 100 },
  ]);

  assert.deepEqual(completion, { totalItems: 3, completeItems: 1, percentComplete: 33 });
});
