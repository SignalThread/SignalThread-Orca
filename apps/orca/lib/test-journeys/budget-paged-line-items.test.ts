import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { BudgetLineItemApproval, BudgetLineItemStatus } from "@prisma/client";
import { getBudgetLineItemIds, getPagedBudgetLineItems } from "@/src/server/services/budget";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// Prompt 4 (Budget deep performance): the paged line-items endpoint must return
// filter/search/sort-scoped rows with filter-scoped footer totals, while never
// masquerading as global truth (no global totals are returned here). These
// parity cases lock the server filter semantics against hand-computed results.
test("getPagedBudgetLineItems: server filter/search/sort parity + scoped footer totals", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-paged-line-items");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const budget = await harness.createBudget({ eventId });

    const groupA = await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Group A", normalizedName: "group a", color: "blue", sortOrder: 1 },
    });
    const groupB = await harness.db.budgetGroup.create({
      data: { budgetId: budget.id, name: "Group B", normalizedName: "group b", color: "emerald", sortOrder: 2 },
    });

    const sessionOne = await harness.createMatrixRow({ eventId, sessionName: "Session One" });
    const sessionTwo = await harness.createMatrixRow({ eventId, sessionName: "Session Two" });

    // LI1: A/V, vendor Acme, session One, group A, PLANNED/PENDING, 1000/500.
    const li1 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", subcategory: "Audio", vendor: "Acme", matrixRowId: sessionOne.id, forecastCents: 1000, actualCents: 500 });
    // LI2: A/V, vendor Beta, session One, group A, COMMITTED/APPROVED, 2000/2500.
    const li2 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "A/V", subcategory: "Video", vendor: "Beta", matrixRowId: sessionOne.id, forecastCents: 2000, actualCents: 2500 });
    // LI3: Food, vendor Cafe, session Two, group B, PLANNED/PENDING, 5000/0.
    const li3 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", subcategory: "Snacks", vendor: "Cafe", matrixRowId: sessionTwo.id, forecastCents: 5000, actualCents: 0 });
    // LI4: Food, no vendor/session/group, PAID/APPROVED, 1000/1200.
    const li4 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Food", subcategory: "Snacks", forecastCents: 1000, actualCents: 1200 });
    // LI5: Travel, vendor Delta, no session, group B, PLANNED/PENDING, 0/300.
    const li5 = await harness.createBudgetLineItem({ budgetId: budget.id, category: "Travel", subcategory: "Flights", vendor: "Delta", forecastCents: 0, actualCents: 300 });

    await harness.db.budgetLineItem.update({ where: { id: li1.id }, data: { groupId: groupA.id } });
    await harness.db.budgetLineItem.update({ where: { id: li2.id }, data: { groupId: groupA.id, status: BudgetLineItemStatus.COMMITTED, approval: BudgetLineItemApproval.APPROVED } });
    await harness.db.budgetLineItem.update({ where: { id: li3.id }, data: { groupId: groupB.id } });
    await harness.db.budgetLineItem.update({ where: { id: li4.id }, data: { status: BudgetLineItemStatus.PAID, approval: BudgetLineItemApproval.APPROVED } });
    await harness.db.budgetLineItem.update({ where: { id: li5.id }, data: { groupId: groupB.id } });

    // --- No filter: every row, global-shaped footer, default page size 10 ---
    const all = await getPagedBudgetLineItems(eventId, {});
    assert.equal(all.filteredCount, 5, "no filter returns all rows");
    assert.equal(all.rows.length, 5, "no filter returns all rows on one page");
    assert.equal(all.pageSize, 10, "default page size is 10");
    assert.equal(all.page, 1, "default page is 1");
    assert.deepEqual(
      all.filteredFooterTotals,
      { forecastCents: 9000, actualCents: 4500, varianceCents: -4500 },
      "no-filter footer totals sum every row",
    );
    // Row shape parity: labels resolved like the snapshot mapper.
    const li1Row = all.rows.find((row) => row.id === li1.id);
    assert.equal(li1Row?.sessionTitle, "Session One", "session label resolved");
    assert.equal(li1Row?.groupName, "Group A", "group label resolved");
    assert.equal(li1Row?.documentCount, 0, "document count present");

    // --- Category filter (display-normalized match) ---
    const av = await getPagedBudgetLineItems(eventId, { category: "A/V" });
    assert.equal(av.filteredCount, 2, "category A/V matches 2 rows");
    assert.deepEqual(
      av.filteredFooterTotals,
      { forecastCents: 3000, actualCents: 3000, varianceCents: 0 },
      "category footer totals are filter-scoped",
    );

    // --- Status filter ---
    const planned = await getPagedBudgetLineItems(eventId, { status: BudgetLineItemStatus.PLANNED });
    assert.equal(planned.filteredCount, 3, "PLANNED matches LI1/LI3/LI5");
    assert.deepEqual(
      planned.filteredFooterTotals,
      { forecastCents: 6000, actualCents: 800, varianceCents: -5200 },
      "status footer totals are filter-scoped",
    );

    // --- Approval filter ---
    const approved = await getPagedBudgetLineItems(eventId, { approval: BudgetLineItemApproval.APPROVED });
    assert.equal(approved.filteredCount, 2, "APPROVED matches LI2/LI4");
    assert.deepEqual(
      approved.filteredFooterTotals,
      { forecastCents: 3000, actualCents: 3700, varianceCents: 700 },
      "approval footer totals are filter-scoped",
    );

    // --- Session filter (sessionId -> matrixRowId) ---
    const sess = await getPagedBudgetLineItems(eventId, { sessionId: sessionOne.id });
    assert.equal(sess.filteredCount, 2, "session One matches LI1/LI2");
    assert.deepEqual(
      sess.filteredFooterTotals,
      { forecastCents: 3000, actualCents: 3000, varianceCents: 0 },
      "session footer totals are filter-scoped",
    );

    // --- Group filter ---
    const grp = await getPagedBudgetLineItems(eventId, { groupId: groupB.id });
    assert.equal(grp.filteredCount, 2, "group B matches LI3/LI5");
    assert.deepEqual(
      grp.filteredFooterTotals,
      { forecastCents: 5000, actualCents: 300, varianceCents: -4700 },
      "group footer totals are filter-scoped",
    );

    // --- Search (vendor / session name / group name) ---
    const byVendor = await getPagedBudgetLineItems(eventId, { search: "acme" });
    assert.deepEqual(byVendor.rows.map((row) => row.id), [li1.id], "search matches vendor case-insensitively");
    const bySession = await getPagedBudgetLineItems(eventId, { search: "Session Two" });
    assert.deepEqual(bySession.rows.map((row) => row.id), [li3.id], "search matches linked session name");
    const byGroup = await getPagedBudgetLineItems(eventId, { search: "Group B" });
    assert.equal(byGroup.filteredCount, 2, "search matches linked group name");

    // --- Sort + direction (server-backed, stable) ---
    const sorted = await getPagedBudgetLineItems(eventId, { sort: "forecastCents", dir: "desc" });
    assert.deepEqual(
      sorted.rows.map((row) => row.forecastCents),
      [5000, 2000, 1000, 1000, 0],
      "forecast desc sort is server-backed",
    );

    // --- Pagination boundaries ---
    const p1 = await getPagedBudgetLineItems(eventId, { page: 1, pageSize: 2, sort: "forecastCents", dir: "desc" });
    assert.equal(p1.rows.length, 2, "page 1 has pageSize rows");
    assert.equal(p1.filteredCount, 5, "filteredCount is total, not page length");
    const p3 = await getPagedBudgetLineItems(eventId, { page: 3, pageSize: 2, sort: "forecastCents", dir: "desc" });
    assert.equal(p3.rows.length, 1, "final page has the remainder");

    // --- Page beyond range: empty rows, count preserved ---
    const beyond = await getPagedBudgetLineItems(eventId, { page: 5, pageSize: 2 });
    assert.equal(beyond.rows.length, 0, "page beyond range returns no rows");
    assert.equal(beyond.filteredCount, 5, "page beyond range still reports the true filtered count");

    // --- Empty filtered state ---
    const empty = await getPagedBudgetLineItems(eventId, { category: "Does Not Exist" });
    assert.equal(empty.filteredCount, 0, "unmatched category yields empty result");
    assert.equal(empty.rows.length, 0, "unmatched category yields no rows");
    assert.deepEqual(
      empty.filteredFooterTotals,
      { forecastCents: 0, actualCents: 0, varianceCents: 0 },
      "empty filtered footer totals are zero",
    );

    // --- ids-only endpoint mirrors the same filter set (all pages) ---
    const allIds = await getBudgetLineItemIds(eventId, {});
    assert.equal(allIds.count, 5, "ids endpoint returns every id across all pages");
    assert.deepEqual([...allIds.ids].sort(), [li1.id, li2.id, li3.id, li4.id, li5.id].sort(), "ids cover the full set");
    // ids honor the same filter semantics as the paged rows.
    const avIds = await getBudgetLineItemIds(eventId, { category: "A/V" });
    assert.deepEqual([...avIds.ids].sort(), [li1.id, li2.id].sort(), "ids honor the category filter");
    assert.equal(avIds.count, 2, "ids count matches filtered rows");
    // ids follow the requested sort order (forecast desc => LI3 first).
    const sortedIds = await getBudgetLineItemIds(eventId, { sort: "forecastCents", dir: "desc" });
    assert.equal(sortedIds.ids[0], li3.id, "ids follow the requested sort order");
    // empty filter => no ids.
    const noIds = await getBudgetLineItemIds(eventId, { category: "Does Not Exist" });
    assert.deepEqual(noIds, { ids: [], count: 0 }, "unmatched filter yields no ids");
  } finally {
    await harness.cleanup();
  }
});

// Returns the empty page contract (never throws) when the event has no budget.
test("getPagedBudgetLineItems: no budget yields an empty page contract", async (t) => {
  const harness = createHarnessOrSkip(t, "budget-paged-no-budget");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const result = await getPagedBudgetLineItems(roles.event.id, { page: 2, pageSize: 25 });
    assert.deepEqual(result.rows, [], "no budget => no rows");
    assert.equal(result.filteredCount, 0, "no budget => zero count");
    assert.deepEqual(result.filteredFooterTotals, { forecastCents: 0, actualCents: 0, varianceCents: 0 });
    assert.equal(result.page, 2, "requested page echoed back");
    assert.equal(result.pageSize, 25, "requested page size echoed back");
  } finally {
    await harness.cleanup();
  }
});
