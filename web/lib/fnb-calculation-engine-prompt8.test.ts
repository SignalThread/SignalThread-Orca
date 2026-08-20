import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { UserRole } from "@prisma/client";
import {
  createSessionFnbCatalogAssignment,
  FnbCatalogError,
  getSessionFnbPlan,
  listSessionFnbCatalogAssignments,
  updateSessionFnbCatalogAssignment,
} from "@/lib/fnb-catalog";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for Prompt 8 DB validation.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `prompt8-money-${randomUUID().slice(0, 8)}` });
}

test("Prompt 8 uses one shared financial adapter across persistence, Budget sync, and live drafts", async () => {
  const [engine, service, workspace, legacyPricing] = await Promise.all([
    readFile("lib/fnb-cost-calculation.ts", "utf8"),
    readFile("lib/fnb-catalog.ts", "utf8"),
    readFile("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8"),
    readFile("lib/fnb-package-tier.ts", "utf8"),
  ]);
  assert.match(engine, /export function calculateFnbAssignmentFinancials/);
  assert.match(engine, /item, category and order discounts/);
  assert.match(engine, /independently based taxes/);
  assert.match(service, /calculateFnbAssignmentFinancials/);
  assert.match(service, /catalogItemSnapshot/);
  assert.match(service, /forecastCents: calculation\.totalCents \?\? 0/);
  assert.match(workspace, /calculateFnbAssignmentFinancials/);
  assert.doesNotMatch(workspace, /calculateFnbAssignmentCost\(\{/);
  assert.match(legacyPricing, /exceeds supported exact-money range/);
});

test("Prompt 8 structured pricing is snapshot-stable and reconciles assignment, Budget, and plan totals", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const owner = await harness.createUser({ orgId: organization.id, role: UserRole.OWNER });
    const client = await harness.createClient({ orgId: organization.id });
    const event = await harness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id });
    const session = await harness.createMatrixRow({ eventId: event.id, attendance: 25 });
    await harness.db.matrixRow.update({
      where: { id: session.id },
      data: { fnbTaxPercent: "8.8750", fnbServiceChargePercent: "20.0000" },
    });
    const item = await harness.db.eventFnbCatalogItem.create({
      data: {
        eventId: event.id,
        itemName: "Structured banquet package",
        category: "Food",
        price: "$99.00",
        publishedPriceCents: 2_500,
        negotiatedPriceCents: 2_200,
        discountCents: 200,
        minimumQuantity: 10,
        currency: "USD",
        unit: "person",
      },
    });

    const assignment = await createSessionFnbCatalogAssignment(event.id, session.id, {
      eventFnbCatalogItemId: item.id,
      quantity: 5,
      taxes: [{ label: "Hospitality district", percentage: "3" }],
    });
    assert.equal(assignment.financialCalculation?.publishedSubtotalCents, 25_000);
    assert.equal(assignment.financialCalculation?.negotiatedSavingsCents, 3_000);
    assert.equal(assignment.financialCalculation?.itemDiscountCents, 2_000);
    assert.equal(assignment.calculation.subtotalCents, 20_000);
    assert.equal(assignment.calculation.serviceChargeCents, 4_000);
    assert.equal(assignment.calculation.taxCents, 1_775);
    assert.equal(assignment.calculation.additionalTaxCents, 600);
    assert.equal(assignment.calculation.totalCents, 26_375);
    assert.equal(assignment.syncedBudgetLineItem?.forecastCents, 26_375);
    assert.deepEqual(assignment.financialCalculation?.trace.map((entry) => entry.code).slice(-8), [
      "PUBLISHED_SUBTOTAL",
      "NEGOTIATED_SAVINGS",
      "ITEM_DISCOUNTS",
      "ORDER_DISCOUNTS",
      "SERVICE_CHARGE",
      "TAX",
      "FEES",
      "TOTAL",
    ]);

    const plan = await getSessionFnbPlan(event.id, session.id);
    assert.equal(plan.calculation.totalEstimatedCents, 26_375);

    await harness.db.eventFnbCatalogItem.update({
      where: { id: item.id },
      data: { negotiatedPriceCents: 1_900, discountCents: 50, version: { increment: 1 } },
    });
    const [afterSourceEdit] = await listSessionFnbCatalogAssignments(event.id, session.id);
    assert.equal(afterSourceEdit?.financialCalculation?.negotiatedSavingsCents, 3_000);
    assert.equal(afterSourceEdit?.financialCalculation?.itemDiscountCents, 2_000);
    assert.equal(afterSourceEdit?.calculation.totalCents, 26_375, "pinned assignment evidence preserves historical financial integrity");

    const edited = await updateSessionFnbCatalogAssignment(event.id, session.id, assignment.id, {
      manualPriceCents: 30_000,
    });
    assert.equal(edited.calculation.totalCents, 39_563);
    assert.equal(edited.syncedBudgetLineItem?.forecastCents, 39_563);
    assert.equal((await getSessionFnbPlan(event.id, session.id)).calculation.totalEstimatedCents, 39_563);

    const otherEvent = await harness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id, name: "Cross-event calculation boundary" });
    const otherSession = await harness.createMatrixRow({ eventId: otherEvent.id });
    await assert.rejects(
      createSessionFnbCatalogAssignment(otherEvent.id, otherSession.id, { eventFnbCatalogItemId: item.id, quantity: 1 }),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 404,
    );
  } finally {
    await harness.cleanup();
  }
});
