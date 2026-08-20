import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { BudgetLineItemApproval, UserRole } from "@prisma/client";
import {
  createSessionFnbCatalogAssignment,
  FnbCatalogError,
  listSessionFnbCatalogAssignments,
  updateSessionFnbCatalogAssignment,
} from "@/lib/fnb-catalog";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";
import { getBudgetDashboard } from "@/src/server/services/budget";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for Prompt 9 DB validation.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `prompt9-fnb-${randomUUID().slice(0, 8)}` });
}

test("Prompt 9 UI exposes canonical financial concepts, actuals, approval, trace, custom safety, and recoverable concurrency", async () => {
  const [workspace, service, schema, route] = await Promise.all([
    readFile("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8"),
    readFile("lib/fnb-catalog.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-catalog-assignments/route.ts", "utf8"),
  ]);
  for (const label of ["Original unit price", "Negotiated override", "Negotiated comparison", "Explicit discounts", "Taxability", "Service charge", "Taxes", "Fees", "Final estimate", "Actual / variance", "Calculation explanation"]) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workspace, /Create and assign custom item/);
  assert.match(workspace, /Dietary suitability/);
  assert.match(workspace, /Contains allergens/);
  assert.match(workspace, /Explicitly free of/);
  assert.match(workspace, /Approval \{assignment\.syncedBudgetLineItem\.approval/);
  assert.match(workspace, /expectedUpdatedAt: assignment\.updatedAt/);
  assert.match(service, /Refresh and retry without losing your draft/);
  assert.match(service, /sessionFnbCatalogAssignment\.updateMany\(\{[\s\S]*updatedAt: expected/);
  assert.match(schema, /taxable\s+Boolean\s+@default\(true\)/);
  assert.match(route, /actorUserId: authResult\.user\.id/);
});

test("Prompt 9 custom/off-menu lifecycle preserves pricing, safety, notes, approval impacts, actuals, and exact Budget reconciliation", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const owner = await harness.createUser({ orgId: organization.id, role: UserRole.OWNER });
    const client = await harness.createClient({ orgId: organization.id });
    const event = await harness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id });
    const session = await harness.createMatrixRow({ eventId: event.id, attendance: 5 });
    await harness.db.matrixRow.update({ where: { id: session.id }, data: { fnbTaxPercent: "8.8750", fnbServiceChargePercent: "20.0000" } });

    const created = await createSessionFnbCatalogAssignment(event.id, session.id, {
      customItem: {
        itemName: "Off-menu plated alternative",
        description: "Chef-prepared alternative",
        category: "Food",
        publishedPriceCents: 2_500,
        negotiatedPriceCents: 2_200,
        discountCents: 200,
        currency: "USD",
        pricingUnit: "PER_PERSON",
        minimumQuantity: 10,
        taxable: false,
        preparationNotes: "Use a dedicated prep surface",
        serviceNotes: "Plate marker required",
        vendorNotes: "Hold at service station",
        verificationStatus: "VERIFIED",
        verificationSource: "Chef email 2026-08-11",
        claims: [
          { kind: "SUITABILITY", code: "VEGAN" },
          { kind: "CONTAINS", code: "SOY" },
          { kind: "FREE_OF", code: "MILK" },
        ],
      },
      quantity: 5,
      serviceTiming: "Serve at 12:15",
      notes: "Two guests need aisle-side placement",
      taxes: [{ label: "Food district", percentage: "3" }],
    }, { actorUserId: owner.id });

    assert.equal(created.catalogItem.isCustom, true);
    assert.equal(created.catalogItem.sourceMenuId, null, "custom item is not attached to a venue/source menu");
    assert.equal(created.catalogItem.taxable, false);
    assert.equal(created.catalogItem.verificationStatus, "VERIFIED");
    assert.deepEqual(created.catalogItem.claims.map((claim) => `${claim.kind}:${claim.code}`).sort(), ["CONTAINS:SOY", "FREE_OF:MILK", "SUITABILITY:VEGAN"]);
    assert.equal(created.notes, "Two guests need aisle-side placement");
    assert.equal(created.financialCalculation?.publishedSubtotalCents, 25_000);
    assert.equal(created.financialCalculation?.negotiatedSavingsCents, 3_000);
    assert.equal(created.financialCalculation?.itemDiscountCents, 2_000);
    assert.equal(created.calculation.subtotalCents, 20_000);
    assert.equal(created.calculation.taxCents, 0, "non-taxable item excludes canonical session tax");
    assert.equal(created.calculation.additionalTaxCents, 0);
    assert.equal(created.calculation.serviceChargeCents, 4_000);
    assert.equal(created.calculation.totalCents, 24_000);
    assert.equal(created.syncedBudgetLineItem?.forecastCents, 24_000);
    assert.equal(created.syncedBudgetLineItem?.approval, BudgetLineItemApproval.PENDING);

    await harness.db.budgetLineItem.update({
      where: { id: created.budgetLineItemId as string },
      data: { actualCents: 25_000, approval: BudgetLineItemApproval.APPROVED },
    });
    const [withActual] = await listSessionFnbCatalogAssignments(event.id, session.id);
    assert.equal(withActual?.financialCalculation?.actualTotalCents, 25_000);
    assert.equal(withActual?.financialCalculation?.varianceCents, 1_000);

    const updated = await updateSessionFnbCatalogAssignment(event.id, session.id, created.id, {
      expectedUpdatedAt: withActual?.updatedAt,
      notes: "Two guests need aisle-side placement; confirmed with banquet captain",
    });
    assert.equal(updated.notes, "Two guests need aisle-side placement; confirmed with banquet captain");
    assert.equal(updated.syncedBudgetLineItem?.actualCents, 25_000, "planning edits preserve posted actuals");
    assert.equal(updated.syncedBudgetLineItem?.approval, BudgetLineItemApproval.PENDING, "a financial-source edit invalidates prior approval");
    assert.equal(updated.syncedBudgetLineItem?.forecastCents, updated.calculation.totalCents);
    const dashboard = await getBudgetDashboard(event.id, { id: owner.id, orgId: organization.id, role: owner.role });
    assert.equal(dashboard.summary.totalForecastCents, updated.calculation.totalCents, "dashboard/API forecast reconciles to the canonical assignment");
    assert.equal(dashboard.summary.totalActualCents, 25_000, "dashboard/API actual reconciles to the Full Budget Grid row");

    await assert.rejects(
      updateSessionFnbCatalogAssignment(event.id, session.id, created.id, { expectedUpdatedAt: created.updatedAt, notes: "stale overwrite" }),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 409 && /without losing your draft/.test(error.message),
    );

    await assert.rejects(
      createSessionFnbCatalogAssignment(event.id, session.id, {
        customItem: { itemName: "Unsafe verified item", publishedPriceCents: 100, verificationStatus: "VERIFIED" },
        quantity: 1,
      }, { actorUserId: owner.id }),
      (error: unknown) => error instanceof FnbCatalogError && error.status === 400 && /vendor evidence/.test(error.message),
    );
  } finally {
    await harness.cleanup();
  }
});
