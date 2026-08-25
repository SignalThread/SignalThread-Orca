import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCostByDay,
  buildCostByType,
  buildEventTotals,
  fnbFunctionTypeLabel,
  type FnbFunctionRecord,
} from "./fnb-event-planner";

type FnbFunctionOverrides = Partial<Omit<FnbFunctionRecord, "calculation">> & {
  calculation?: Partial<FnbFunctionRecord["calculation"]>;
};

function fnbFunction(overrides: FnbFunctionOverrides = {}): FnbFunctionRecord {
  const calculation = {
    subtotalCents: 100_000,
    taxCents: 8_000,
    serviceChargeCents: 22_000,
    additionalTaxCents: 0,
    totalEstimatedCents: 130_000,
    perPersonCents: 1_300,
    assignedItemCount: 4,
    unpricedItemCount: 0,
    ...(overrides.calculation ?? {}),
  };

  return {
    sessionId: "session-1",
    name: "Breakfast",
    date: "2026-01-19",
    startTime: "07:00",
    endTime: "08:00",
    type: "BREAKFAST",
    typeLabel: "Breakfast",
    location: "Expo Hall",
    isSessionLinked: false,
    attendance: 100,
    guarantee: 100,
    assignedItemCount: 4,
    unpricedItemCount: 0,
    taxPercent: "8.0000",
    serviceChargePercent: "22.0000",
    budgetedCents: 120_000,
    budgetVarianceCents: 10_000,
    approvalsPending: 0,
    openRequirementCount: 0,
    accommodationCount: 0,
    readiness: "ready",
    warnings: [],
    href: "/events/e/matrix/sessions/session-1?focus=fnb",
    ...overrides,
    calculation,
  };
}

test("event totals sum the canonical per-function calculations", () => {
  const totals = buildEventTotals([
    fnbFunction({ sessionId: "a" }),
    fnbFunction({ sessionId: "b", calculation: { totalEstimatedCents: 70_000, subtotalCents: 60_000 } }),
  ]);

  assert.equal(totals.functionCount, 2);
  assert.equal(totals.totalEstimatedCents, 200_000);
  assert.equal(totals.subtotalCents, 160_000);
  assert.equal(totals.budgetedCents, 240_000);
  assert.equal(totals.budgetVarianceCents, -40_000);
});

test("cost per person is weighted by headcount, not averaged across functions", () => {
  // A 500-person lunch at $20/head and a 10-person break at $200/head must not average to $110.
  const totals = buildEventTotals([
    fnbFunction({
      sessionId: "lunch",
      guarantee: 500,
      attendance: 500,
      calculation: { totalEstimatedCents: 1_000_000 },
    }),
    fnbFunction({
      sessionId: "break",
      guarantee: 10,
      attendance: 10,
      calculation: { totalEstimatedCents: 200_000 },
    }),
  ]);

  // (1,000,000 + 200,000) / 510 people = 2,352.9 cents.
  assert.equal(totals.averageCostPerPersonCents, 2_353);
  // A plain mean of the two per-function rates would be 11,000 cents.
  assert.notEqual(totals.averageCostPerPersonCents, 11_000);
});

test("functions without a headcount are excluded from both sides of cost per person", () => {
  const totals = buildEventTotals([
    fnbFunction({ sessionId: "known", guarantee: 100, attendance: 100, calculation: { totalEstimatedCents: 100_000 } }),
    fnbFunction({ sessionId: "unknown", guarantee: null, attendance: null, calculation: { totalEstimatedCents: 50_000 } }),
  ]);

  // The unknown function's spend is not charged to the 100 people we do know about.
  assert.equal(totals.averageCostPerPersonCents, 1_000);
  assert.equal(totals.costPerPersonFunctionCount, 1);
  assert.equal(totals.costPerPersonExcludedFunctionCount, 1);
  // The excluded spend still shows up in the event total, so the two figures stay reconcilable.
  assert.equal(totals.totalEstimatedCents, 150_000);
});

test("cost per person is null rather than zero when no function declares a headcount", () => {
  const totals = buildEventTotals([fnbFunction({ guarantee: null, attendance: null })]);
  assert.equal(totals.averageCostPerPersonCents, null);
});

test("budget variance stays null when no function has a linked budget line", () => {
  const totals = buildEventTotals([
    fnbFunction({ sessionId: "a", budgetedCents: null, budgetVarianceCents: null }),
    fnbFunction({ sessionId: "b", budgetedCents: null, budgetVarianceCents: null }),
  ]);

  assert.equal(totals.budgetedCents, null);
  assert.equal(totals.budgetVarianceCents, null);
});

test("session-linked and independent functions are counted separately", () => {
  const totals = buildEventTotals([
    fnbFunction({ sessionId: "a", isSessionLinked: true }),
    fnbFunction({ sessionId: "b", isSessionLinked: false }),
    fnbFunction({ sessionId: "c", isSessionLinked: false }),
  ]);

  assert.equal(totals.sessionLinkedFunctionCount, 1);
  assert.equal(totals.independentFunctionCount, 2);
  assert.equal(totals.functionCount, 3);
});

test("readiness counts partition the function list exactly once", () => {
  const totals = buildEventTotals([
    fnbFunction({ sessionId: "a", readiness: "ready" }),
    fnbFunction({ sessionId: "b", readiness: "needsWork" }),
    fnbFunction({ sessionId: "c", readiness: "blocked" }),
    fnbFunction({ sessionId: "d", readiness: "blocked" }),
  ]);

  assert.equal(totals.readyCount + totals.needsWorkCount + totals.blockedCount, totals.functionCount);
  assert.equal(totals.blockedCount, 2);
});

test("requirements and accommodations are reported as distinct quantities", () => {
  const totals = buildEventTotals([
    fnbFunction({ sessionId: "a", openRequirementCount: 2, accommodationCount: 15 }),
    fnbFunction({ sessionId: "b", openRequirementCount: 1, accommodationCount: 4 }),
  ]);

  assert.equal(totals.openRequirementCount, 3);
  assert.equal(totals.accommodationCount, 19);
});

test("cost by day is grouped and chronologically ordered", () => {
  const byDay = buildCostByDay([
    fnbFunction({ sessionId: "a", date: "2026-01-20", calculation: { totalEstimatedCents: 50_000 } }),
    fnbFunction({ sessionId: "b", date: "2026-01-19", calculation: { totalEstimatedCents: 30_000 } }),
    fnbFunction({ sessionId: "c", date: "2026-01-19", calculation: { totalEstimatedCents: 20_000 } }),
  ]);

  assert.deepEqual(
    byDay.map((day) => [day.date, day.functionCount, day.totalEstimatedCents]),
    [
      ["2026-01-19", 2, 50_000],
      ["2026-01-20", 1, 50_000],
    ],
  );
});

test("cost by type ranks by spend and keeps untyped functions visible", () => {
  const byType = buildCostByType([
    fnbFunction({ sessionId: "a", type: "BREAK", typeLabel: "Break", calculation: { totalEstimatedCents: 10_000 } }),
    fnbFunction({ sessionId: "b", type: "LUNCH", typeLabel: "Lunch", calculation: { totalEstimatedCents: 90_000 } }),
    fnbFunction({
      sessionId: "c",
      type: null,
      typeLabel: "Not specified",
      calculation: { totalEstimatedCents: 40_000 },
    }),
  ]);

  assert.deepEqual(byType.map((entry) => entry.typeLabel), ["Lunch", "Not specified", "Break"]);
});

test("empty events produce zeroed totals and no breakdown rows", () => {
  const totals = buildEventTotals([]);
  assert.equal(totals.functionCount, 0);
  assert.equal(totals.totalEstimatedCents, 0);
  assert.equal(totals.budgetedCents, null);
  assert.equal(totals.averageCostPerPersonCents, null);
  assert.deepEqual(buildCostByDay([]), []);
  assert.deepEqual(buildCostByType([]), []);
});

test("function type labels cover every meal period and the unspecified case", () => {
  assert.equal(fnbFunctionTypeLabel(null), "Not specified");
  assert.equal(fnbFunctionTypeLabel("RECEPTION"), "Reception");
  assert.equal(fnbFunctionTypeLabel("BREAK"), "Break");
});

test("the planner service reads canonical records and never writes its own rollup copy", () => {
  const source = readFileSync("lib/fnb-event-planner.ts", "utf8");
  assert.match(source, /toSessionFnbAssignmentRecord/);
  assert.match(source, /calculateFnbPlanCost/);
  assert.match(source, /createMatrixRow/);
  // No dashboard-only persistence of derived totals.
  assert.doesNotMatch(source, /prisma\.\w*[Rr]ollup/);
  assert.doesNotMatch(source, /\.create\(\{\s*data:\s*\{[^}]*totalEstimatedCents/);
});

test("planner API routes assert event access before reading or writing", () => {
  const readRoute = readFileSync("app/api/events/[eventId]/fnb/planner/route.ts", "utf8");
  const writeRoute = readFileSync("app/api/events/[eventId]/fnb/functions/route.ts", "utf8");

  assert.match(readRoute, /assertEventAccessForUser\(eventId, authResult\.user, "read"\)/);
  assert.match(writeRoute, /assertEventAccessForUser\(eventId, authResult\.user, "write"\)/);
  // The write path returns server-recomputed rollups rather than trusting the client.
  assert.match(writeRoute, /getEventFnbPlanner\(eventId\)/);
});

test("a session association is optional in the create-function flow", () => {
  const workspace = readFileSync(
    "app/(shell)/events/[eventId]/matrix/fnb/_components/fnb-planner-workspace.tsx",
    "utf8",
  );
  assert.match(workspace, /Standalone function/);
  assert.match(workspace, /A content session is not required/);

  const service = readFileSync("lib/fnb-event-planner.ts", "utf8");
  assert.match(service, /name is required for a standalone function/);
  assert.match(service, /sessionId\?: unknown/);
});
