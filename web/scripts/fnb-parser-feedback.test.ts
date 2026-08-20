import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFnbParserFeedbackCreateData,
  createFnbParserFeedback,
  FnbParserFeedbackError,
} from "../lib/fnb-parser-feedback";

const event = {
  id: "event-1",
  orgId: "org-1",
  clientId: "client-1",
};

const originalRow = {
  itemName: "Avocado Toast",
  description: "Needs review: recovered from visible menu price text.",
  price: "12",
  unit: "",
  category: "Breakfast",
  sourceMenuFileName: "menu.pdf",
  sourcePageNumber: 2,
  sourceSection: "Breakfast",
  extractionSource: "deterministic_fallback",
  confidence: "",
  parserVersion: "map-first-price-candidates-v2",
};

function fakePrisma(options: {
  createError?: Error;
  documentBelongsToEvent?: boolean;
} = {}) {
  const created: unknown[] = [];
  return {
    created,
    event: {
      findUnique: async () => event,
    },
    document: {
      findFirst: async () => options.documentBelongsToEvent === false ? null : { id: "document-1" },
    },
    fnbParserFeedback: {
      create: async (input: { data: unknown }) => {
        if (options.createError) throw options.createError;
        created.push(input.data);
        return { id: "feedback-1" };
      },
    },
  };
}

describe("F&B parser feedback", () => {
  it("creates accepted unchanged feedback", async () => {
    const prisma = fakePrisma();

    await createFnbParserFeedback({
      eventId: event.id,
      action: "accepted",
      originalRow,
      finalRow: originalRow,
    }, { prisma });

    assert.equal(prisma.created.length, 1);
    assert.deepEqual(prisma.created[0], {
      orgId: "org-1",
      eventId: "event-1",
      clientId: "client-1",
      documentId: null,
      sourceMenuFileName: "menu.pdf",
      action: "accepted",
      changeFlags: ["accepted_unchanged", "fallback_row_accepted"],
      originalRow,
      finalRow: originalRow,
      rejectionReason: null,
      sourcePageNumber: 2,
      sourceSection: "Breakfast",
      extractionSource: "deterministic_fallback",
      confidence: null,
      parserVersion: "map-first-price-candidates-v2",
    });
  });

  it("creates edited feedback with before and after rows", () => {
    const finalRow = {
      ...originalRow,
      itemName: "Avocado Toast with Egg",
      price: "16",
      category: "Enhancements",
    };

    const data = buildFnbParserFeedbackCreateData({
      eventId: event.id,
      action: "edited",
      originalRow,
      finalRow,
    }, event);

    assert.equal(data.action, "edited");
    assert.deepEqual(data.originalRow, originalRow);
    assert.deepEqual(data.finalRow, finalRow);
    assert.deepEqual(data.changeFlags, [
      "name_changed",
      "price_changed",
      "category_changed",
      "edited",
      "fallback_row_accepted",
    ]);
  });

  it("creates rejected feedback", () => {
    const data = buildFnbParserFeedbackCreateData({
      eventId: event.id,
      action: "rejected",
      originalRow,
      rejectionReason: "User discarded parsed review row",
    }, event);

    assert.equal(data.action, "rejected");
    assert.equal(data.finalRow, null);
    assert.equal(data.rejectionReason, "User discarded parsed review row");
    assert.deepEqual(data.changeFlags, ["rejected", "fallback_row_rejected"]);
  });

  it("lets callers isolate feedback failures from catalog saves", async () => {
    const prisma = fakePrisma({ createError: new Error("feedback insert failed") });
    let catalogSaved = false;

    async function saveCatalogThenLogFeedback() {
      catalogSaved = true;
      await createFnbParserFeedback({
        eventId: event.id,
        action: "accepted",
        originalRow,
        finalRow: originalRow,
      }, { prisma }).catch(() => undefined);
      return { id: "catalog-item-1" };
    }

    const saved = await saveCatalogThenLogFeedback();
    assert.equal(catalogSaved, true);
    assert.equal(saved.id, "catalog-item-1");
  });

  it("enforces tenant and event scoping for document ids", async () => {
    const prisma = fakePrisma({ documentBelongsToEvent: false });

    await assert.rejects(
      () => createFnbParserFeedback({
        eventId: event.id,
        documentId: "document-from-another-event",
        action: "accepted",
        originalRow,
        finalRow: originalRow,
      }, { prisma }),
      (error) => error instanceof FnbParserFeedbackError
        && error.message === "documentId is not valid for this event",
    );
  });
});
