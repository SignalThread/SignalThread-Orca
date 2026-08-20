import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { DocumentLinkType } from "@prisma/client";
import { createDocumentDraft, listDocumentsForEvent } from "@/src/server/services/documents";
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

// D1 regression: the Docs list resolves all document link targets in one batched
// pass (deduped by linkType + linkedId) instead of per document. This asserts each
// document's links still resolve to the correct labels/hrefs, including a target
// shared across two documents.
test("Docs list batches link-target resolution and preserves per-document links", async (t) => {
  const harness = createHarnessOrSkip(t, "documents-list-link-batch");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const orgId = roles.organization.id;

    const budget = await harness.createBudget({ eventId });
    const lineItem = await harness.createBudgetLineItem({ budgetId: budget.id, lineItem: "Projector Rental", forecastCents: 10000 });
    const speaker = await harness.createSpeaker({ eventId, name: "Ada Lovelace" });
    const session = await harness.createMatrixRow({ eventId, sessionName: "Opening Keynote" });

    const category = await harness.createDocumentCategory({ eventId });
    const docA = await harness.createDocument({ orgId, eventId, categoryId: category.id, title: "Doc A" });
    const docB = await harness.createDocument({ orgId, eventId, categoryId: category.id, title: "Doc B" });

    // Doc A links a budget item and a speaker.
    await harness.db.documentLink.create({ data: { documentId: docA.id, linkType: DocumentLinkType.BUDGET_ITEM, linkedId: lineItem.id } });
    await harness.db.documentLink.create({ data: { documentId: docA.id, linkType: DocumentLinkType.SPEAKER, linkedId: speaker.id } });
    // Doc B links the SAME budget item (shared -> deduped) and a matrix session.
    await harness.db.documentLink.create({ data: { documentId: docB.id, linkType: DocumentLinkType.BUDGET_ITEM, linkedId: lineItem.id } });
    await harness.db.documentLink.create({ data: { documentId: docB.id, linkType: DocumentLinkType.MATRIX_SESSION, linkedId: session.id } });

    const result = await listDocumentsForEvent(eventId, {});
    const cardA = result.documents.find((d) => d.title === "Doc A")!;
    const cardB = result.documents.find((d) => d.title === "Doc B")!;

    const labelsA = cardA.links.map((l) => l.label);
    assert.equal(labelsA.includes("Budget: Projector Rental"), true, "Doc A budget link resolved");
    assert.equal(labelsA.includes("Speaker: Ada Lovelace"), true, "Doc A speaker link resolved");
    assert.equal(cardA.links.length, 2, "Doc A has both links");

    const labelsB = cardB.links.map((l) => l.label);
    assert.equal(labelsB.includes("Budget: Projector Rental"), true, "Doc B shares the same budget target");
    assert.equal(labelsB.includes("Matrix: Opening Keynote"), true, "Doc B matrix link resolved");
    assert.equal(cardB.links.length, 2, "Doc B has both links");

    // Resolved link carries an href to the correct surface.
    const budgetLink = cardA.links.find((l) => l.linkType === DocumentLinkType.BUDGET_ITEM)!;
    assert.equal(budgetLink.href.includes(`lineItemId=${lineItem.id}`), true, "budget href targets the line item");
  } finally {
    await harness.cleanup();
  }
});

// D1 edge cases: a document with no links serializes to an empty links array, and
// stale links whose targets no longer exist are omitted so unresolved or
// cross-event identifiers never leak through fallback labels.
test("Docs list handles documents with no links and missing link targets", async (t) => {
  const harness = createHarnessOrSkip(t, "documents-list-link-missing");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventId = roles.event.id;
    const orgId = roles.organization.id;

    const category = await harness.createDocumentCategory({ eventId });
    await harness.createDocument({ orgId, eventId, categoryId: category.id, title: "No Links Doc" });
    const missingTargetDoc = await harness.createDocument({ orgId, eventId, categoryId: category.id, title: "Missing Target Doc" });

    // Link to a budget item id that does not exist (deleted/never-existed target).
    await harness.db.documentLink.create({
      data: { documentId: missingTargetDoc.id, linkType: DocumentLinkType.BUDGET_ITEM, linkedId: randomUUID() },
    });

    const result = await listDocumentsForEvent(eventId, {});
    const noLinksCard = result.documents.find((d) => d.title === "No Links Doc")!;
    const missingCard = result.documents.find((d) => d.title === "Missing Target Doc")!;

    assert.deepEqual(noLinksCard.links, [], "document with no links serializes to an empty array");
    assert.deepEqual(missingCard.links, [], "missing-target link is omitted");
  } finally {
    await harness.cleanup();
  }
});

test("Docs rejects a cross-event polymorphic link before creating a document", async (t) => {
  const harness = createHarnessOrSkip(t, "documents-cross-event-link");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const otherEvent = await harness.createEvent({
      orgId: roles.organization.id,
      clientId: roles.client.id,
      createdByUserId: roles.owner.user.id,
      name: "Other fixture event",
    });
    const foreignBudget = await harness.createBudget({ eventId: otherEvent.id });
    const foreignLineItem = await harness.createBudgetLineItem({
      budgetId: foreignBudget.id,
      lineItem: "Foreign projector",
      forecastCents: 10000,
    });
    const category = await harness.createDocumentCategory({ eventId: roles.event.id });
    const before = await harness.db.document.count({ where: { eventId: roles.event.id } });

    await assert.rejects(
      createDocumentDraft(roles.event.id, {
        title: "Must not be created",
        categoryId: category.id,
        links: [{ linkType: DocumentLinkType.BUDGET_ITEM, linkedId: foreignLineItem.id }],
      }),
      /linkedId is invalid for this event/,
    );

    assert.equal(
      await harness.db.document.count({ where: { eventId: roles.event.id } }),
      before,
      "invalid cross-event links do not leave a draft behind",
    );
  } finally {
    await harness.cleanup();
  }
});
