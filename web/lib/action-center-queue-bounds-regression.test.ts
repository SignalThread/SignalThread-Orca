import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// C3 regression: the Action Center deadline-queue reads are bounded, while the
// queues whose ordering/selection depends on JS-computed ranking (timeline risk
// tone, budget cross-field variance) or an external count contract (approvals)
// remain intentionally unbounded. This locks those decisions so a later edit does
// not silently cap a count-sensitive queue or unbound the deadline reads.
const source = readFileSync("app/(shell)/dashboard/action-center/page.tsx", "utf8");

function queryBlock(model: string, occurrence = 1): string {
  let from = -1;
  for (let i = 0; i < occurrence; i += 1) {
    from = source.indexOf(`prisma.${model}.findMany({`, from + 1);
    assert.notEqual(from, -1, `prisma.${model}.findMany #${occurrence} should exist`);
  }
  // Slice to the next findMany (or a chunk) so `take` checks stay within the query.
  const next = source.indexOf("prisma.", from + 10);
  return source.slice(from, next === -1 ? from + 1200 : next);
}

test("Action Center deadline queues are bounded by a shared ordered take", () => {
  assert.match(source, /const DEADLINE_QUEUE_LIMIT = 50;/);
  // Real Deadline rows queue (nearest due) is bounded.
  assert.match(queryBlock("deadline"), /take: DEADLINE_QUEUE_LIMIT/);
  // Timeline-derived deadline queue is bounded by the same limit.
  assert.match(queryBlock("timelineItem", 1), /take: DEADLINE_QUEUE_LIMIT/);
});

test("Risk-tone and budget-variance queues stay unbounded (JS ranking Prisma can't express)", () => {
  // 2nd timelineItem.findMany = the risk queue: no take, and documented.
  const riskBlock = queryBlock("timelineItem", 2);
  assert.equal(riskBlock.includes("take:"), false, "risk queue must not be take-bounded");
  assert.match(source, /intentionally NOT `take`-bounded[\s\S]*JS-computed risk tone/);
  // budgetLineItem.findMany = variance/pending queue: no take, and documented.
  const budgetBlock = queryBlock("budgetLineItem");
  assert.equal(budgetBlock.includes("take:"), false, "budget queue must not be take-bounded");
  assert.match(source, /actualCents - forecastCents/);
});

test("Approval queues stay unbounded to match the APPROVALS KPI count", () => {
  // budgetSubmission queue has no top-level take (nested lineItems take:3 is fine).
  const submissionBlock = queryBlock("budgetSubmission");
  assert.equal(submissionBlock.includes("\n      take:"), false, "submission queue not top-level bounded");
  assert.match(source, /Approvals view, whose count is contracted to\n\s*\/\/ match the account APPROVALS KPI/);
});
