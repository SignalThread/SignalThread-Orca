import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helperSource = readFileSync("app/api/events/[eventId]/budget/_lib/route-auth.ts", "utf8");
const budgetServiceSource = readFileSync("src/server/services/budget.ts", "utf8");
const lineItemsRouteSource = readFileSync("app/api/events/[eventId]/budget/line-items/route.ts", "utf8");
const lineItemRouteSource = readFileSync("app/api/events/[eventId]/budget/line-items/[id]/route.ts", "utf8");
const importRouteSource = readFileSync("app/api/events/[eventId]/budget/import/route.ts", "utf8");
const submitRouteSource = readFileSync("app/api/events/[eventId]/budget/submit/route.ts", "utf8");
const approveRouteSource = readFileSync("app/api/events/[eventId]/budget/approve/route.ts", "utf8");
const rejectRouteSource = readFileSync("app/api/events/[eventId]/budget/reject/route.ts", "utf8");
const reviseRouteSource = readFileSync("app/api/events/[eventId]/budget/revise/route.ts", "utf8");
const submissionCreateRouteSource = readFileSync("app/api/events/[eventId]/budget/submissions/route.ts", "utf8");
const submissionApproveRouteSource = readFileSync(
  "app/api/events/[eventId]/budget/submissions/[submissionId]/approve/route.ts",
  "utf8",
);
const submissionRejectRouteSource = readFileSync(
  "app/api/events/[eventId]/budget/submissions/[submissionId]/reject/route.ts",
  "utf8",
);
const submissionPullbackRouteSource = readFileSync(
  "app/api/events/[eventId]/budget/submissions/[submissionId]/pullback/route.ts",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test("budget route auth helper resolves the request user and delegates to canonical budget access", () => {
  assert.equal(helperSource.includes("resolveRequestUser(request)"), true);
  assert.equal(helperSource.includes("assertBudgetAccessForEvent(eventId, user, accessType)"), true);
  assert.equal(helperSource.includes("BudgetServiceError"), true);
});

test("EVENT_VIEWER is blocked from budget writes by the canonical access guard", () => {
  // Read + write capability are resolved in one pass: the capability resolver
  // computes canWrite from the EVENT_VIEWER role, and the guard throws on write.
  const capabilitySource = sourceBetween(
    budgetServiceSource,
    "async function resolveBudgetEventAccessCapability",
    "async function assertBudgetEventAccess",
  );
  assert.equal(capabilitySource.includes("membership.eventRole !== EventMemberRole.EVENT_VIEWER"), true);
  assert.equal(capabilitySource.includes('throw new BudgetServiceError("Event membership required", 403)'), true);

  const guardSource = sourceBetween(
    budgetServiceSource,
    "async function assertBudgetEventAccess",
    "export async function resolveBudgetAccessForEvent",
  );
  assert.equal(guardSource.includes('accessType: "read" | "write"'), true);
  assert.equal(guardSource.includes('accessType === "write" && !canWrite'), true);
  assert.equal(guardSource.includes('throw new BudgetServiceError("Event editor role required", 403)'), true);
});

test("budget line-item create, update, delete, and import routes require write access", () => {
  assert.equal(lineItemsRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
  assert.equal(countOccurrences(lineItemRouteSource, 'requireBudgetRouteAccess(request, eventId, "write")'), 2);
  assert.equal(importRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
});

test("write-capable budget users still reach existing mutation services after authorization", () => {
  // Routes thread the authenticated actor into the mutation services (never a
  // client-supplied id) so canonical audit entries record the real user.
  assert.equal(lineItemsRouteSource.includes("const lineItem = await addLineItem(eventId, body, auth.user)"), true);
  assert.equal(lineItemRouteSource.includes("const lineItem = await updateLineItem(eventId, id, body, auth.user)"), true);
  assert.equal(lineItemRouteSource.includes("const deleted = await deleteLineItem(eventId, id, auth.user)"), true);
  assert.equal(importRouteSource.includes("const imported = await importLineItems("), true);
});

test("budget submission mutation routes also require write access", () => {
  assert.equal(submissionCreateRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
  assert.equal(submissionApproveRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
  assert.equal(submissionRejectRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
  assert.equal(submissionPullbackRouteSource.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
});

test("legacy budget transition routes use authenticated actor identity instead of body actorId", () => {
  assert.equal(submitRouteSource.includes("actorUserId: auth.user.id"), true);
  assert.equal(submitRouteSource.includes("body.actorUserId"), false);

  assert.equal(approveRouteSource.includes("approveBudget(eventId, auth.user.id)"), true);
  assert.equal(approveRouteSource.includes("body.actorUserId"), false);

  assert.equal(rejectRouteSource.includes("rejectBudget(eventId, body.reason, auth.user.id)"), true);
  assert.equal(rejectRouteSource.includes("body.actorUserId"), false);

  assert.equal(reviseRouteSource.includes("reviseBudget(eventId, auth.user.id)"), true);
  assert.equal(reviseRouteSource.includes("body.actorUserId"), false);
});

test("submission decision routes do not accept actorId spoofing payloads", () => {
  assert.equal(submissionApproveRouteSource.includes("decideBudgetSubmission(eventId, submissionId, \"APPROVED\", auth.user.id)"), true);
  assert.equal(submissionApproveRouteSource.includes("requestedActorUserId"), false);
  assert.equal(submissionApproveRouteSource.includes("body.actorUserId"), false);

  assert.equal(submissionRejectRouteSource.includes("decideBudgetSubmission(eventId, submissionId, \"REJECTED\", auth.user.id)"), true);
  assert.equal(submissionRejectRouteSource.includes("requestedActorUserId"), false);
  assert.equal(submissionRejectRouteSource.includes("body.actorUserId"), false);

  assert.equal(submissionPullbackRouteSource.includes("pullBackBudgetSubmission(eventId, submissionId, auth.user.id)"), true);
});

test("submission approve/reject routes are reachable in production (no NODE_ENV 404 guard)", () => {
  // Regression: the wired UI (full-budget-grid.tsx) calls the submission-based
  // approve/reject routes. A prior `NODE_ENV === "production"` short-circuit made
  // them hard-return 404 in production, so a budget could be submitted and pulled
  // back but never approved/rejected in prod. The guard must stay removed.
  assert.equal(submissionApproveRouteSource.includes('process.env.NODE_ENV === "production"'), false);
  assert.equal(submissionApproveRouteSource.includes("Not available in production"), false);
  assert.equal(submissionRejectRouteSource.includes('process.env.NODE_ENV === "production"'), false);
  assert.equal(submissionRejectRouteSource.includes("Not available in production"), false);

  // Parity with the pullback route, which was never production-guarded.
  assert.equal(submissionPullbackRouteSource.includes('process.env.NODE_ENV === "production"'), false);
});

test("submission approve/reject enforce write access identically to pullback", () => {
  // EVENT_VIEWER / unauthorized / wrong-event callers are blocked before the
  // decision service runs, because every decision route funnels through the same
  // write-access guard (asserted end-to-end by assertBudgetAccessForEvent above).
  for (const source of [submissionApproveRouteSource, submissionRejectRouteSource, submissionPullbackRouteSource]) {
    const guardBeforeService =
      source.indexOf('requireBudgetRouteAccess(request, eventId, "write")') <
      source.indexOf("BudgetSubmission(eventId, submissionId");
    assert.equal(guardBeforeService, true);
    assert.equal(source.includes('if ("response" in auth) return auth.response;'), true);
  }
});

test("decideBudgetSubmission records an APPROVED/REJECTED budget activity for audit", () => {
  const decisionSource = sourceBetween(
    budgetServiceSource,
    "export async function decideBudgetSubmission",
    "async function transitionBudget",
  );

  // Scopes the submission lookup to the event's budget (wrong-event submissions 404).
  assert.equal(decisionSource.includes("budgetId: budget.id"), true);
  assert.equal(decisionSource.includes('throw new BudgetServiceError("Submission not found", 404)'), true);
  // Only SUBMITTED submissions can be decided (keeps submit/pullback state machine intact).
  assert.equal(decisionSource.includes("BudgetSubmissionStatus.SUBMITTED"), true);
  // Writes an audit/activity row attributed to the acting user.
  assert.equal(decisionSource.includes("tx.budgetActivity.create"), true);
  assert.equal(decisionSource.includes("BudgetActivityType.APPROVED"), true);
  assert.equal(decisionSource.includes("BudgetActivityType.REJECTED"), true);
  assert.equal(decisionSource.includes("actorUserId,"), true);
});
