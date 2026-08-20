import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { DocumentStatus } from "@prisma/client";
import { listDocumentsForEvent } from "@/src/server/services/documents";
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

// D2: the Docs Hub list is bounded/pagination-safe. The response reports an
// accurate filtered total + hasMore so a bounded page never misrepresents how many
// documents exist, and offset paging returns each document exactly once.
test("Docs list bounds the page and reports an accurate total + hasMore", async (t) => {
  const harness = createHarnessOrSkip(t, "documents-list-pagination");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const orgId = roles.organization.id;
    const category = await harness.createDocumentCategory({ eventId });

    // Empty list.
    const empty = await listDocumentsForEvent(eventId, {}, { limit: 10 });
    assert.equal(empty.documents.length, 0, "empty: no documents");
    assert.equal(empty.pagination.total, 0, "empty: total 0");
    assert.equal(empty.pagination.hasMore, false, "empty: no more");

    // Create 5 documents.
    for (let i = 0; i < 5; i += 1) {
      await harness.createDocument({ orgId, eventId, categoryId: category.id, title: `Doc ${String(i).padStart(2, "0")}` });
    }

    // Under-limit: all returned, no more.
    const under = await listDocumentsForEvent(eventId, {}, { limit: 10 });
    assert.equal(under.documents.length, 5, "under-limit returns all");
    assert.equal(under.pagination.total, 5, "under-limit total is accurate");
    assert.equal(under.pagination.hasMore, false, "under-limit: no more");

    // Over-limit: bounded page + hasMore, accurate total.
    const page1 = await listDocumentsForEvent(eventId, {}, { limit: 2, offset: 0 });
    assert.equal(page1.documents.length, 2, "page 1 bounded to limit");
    assert.equal(page1.pagination.total, 5, "page 1 reports true total, not page length");
    assert.equal(page1.pagination.hasMore, true, "page 1 has more");

    const page2 = await listDocumentsForEvent(eventId, {}, { limit: 2, offset: 2 });
    assert.equal(page2.documents.length, 2, "page 2 bounded");
    assert.equal(page2.pagination.hasMore, true, "page 2 has more");

    const page3 = await listDocumentsForEvent(eventId, {}, { limit: 2, offset: 4 });
    assert.equal(page3.documents.length, 1, "final page has the remainder");
    assert.equal(page3.pagination.hasMore, false, "final page: no more");

    // Each document appears exactly once across the pages (stable ordering).
    const paged = [...page1.documents, ...page2.documents, ...page3.documents].map((d) => d.id);
    assert.equal(new Set(paged).size, 5, "no duplicate or dropped documents across pages");

    // Filter composes with pagination: total reflects the filtered set.
    const inReview = await harness.createDocument({ orgId, eventId, categoryId: category.id, title: "In Review Doc", status: DocumentStatus.IN_REVIEW });
    const filtered = await listDocumentsForEvent(eventId, { status: "IN_REVIEW" }, { limit: 10 });
    assert.equal(filtered.pagination.total, 1, "filtered total counts only matching documents");
    assert.equal(filtered.documents.length, 1, "filtered page returns only matching documents");
    assert.equal(filtered.documents[0].id, inReview.id, "filtered page returns the matching document");
  } finally {
    await harness.cleanup();
  }
});

// Omitting pagination preserves the prior unbounded behavior (back-compat).
test("Docs list without pagination returns every document (unbounded)", async (t) => {
  const harness = createHarnessOrSkip(t, "documents-list-unbounded");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const orgId = roles.organization.id;
    const category = await harness.createDocumentCategory({ eventId });
    for (let i = 0; i < 3; i += 1) {
      await harness.createDocument({ orgId, eventId, categoryId: category.id, title: `Doc ${i}` });
    }

    const result = await listDocumentsForEvent(eventId, {});
    assert.equal(result.documents.length, 3, "unbounded returns all documents");
    assert.equal(result.pagination.total, 3, "total still reported");
    assert.equal(result.pagination.hasMore, false, "unbounded: no more");
  } finally {
    await harness.cleanup();
  }
});
