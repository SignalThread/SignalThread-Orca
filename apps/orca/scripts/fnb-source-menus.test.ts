import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { EventFnbSourceMenuSourceType, EventFnbSourceMenuStatus } from "@prisma/client";
import {
  archiveFnbSourceMenu,
  createFnbSourceMenu,
  deleteFnbSourceMenu,
  getFnbSourceMenuForEvent,
  listFnbSourceMenus,
  replaceFnbCatalogItemsForSourceMenu,
  updateFnbSourceMenuStatus,
} from "../lib/fnb-catalog";

type SourceMenuRow = {
  id: string;
  eventId: string;
  menuName: string;
  fileName: string;
  sourceType: EventFnbSourceMenuSourceType;
  status: EventFnbSourceMenuStatus;
  objectKey: string;
  itemsFound: number;
  progressSummary: string | null;
  lastError: string | null;
  baseSourceMenuId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CatalogItemRow = {
  id: string;
  eventId: string;
  sourceMenuId: string | null;
  itemName: string;
  description: string | null;
  price: string | null;
  unit: string | null;
  category: string | null;
  sourceMenuFileName: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentRow = {
  id: string;
  eventFnbCatalogItemId: string;
};

function fakePrisma() {
  const rows: SourceMenuRow[] = [];
  const catalogRows: CatalogItemRow[] = [];
  const assignmentRows: AssignmentRow[] = [];
  const catalogCreateCalls: Array<unknown> = [];
  const catalogCreateManyCalls: Array<unknown[]> = [];
  let nextId = 1;
  let nextCatalogId = 1;
  return {
    rows,
    catalogRows,
    assignmentRows,
    catalogCreateCalls,
    catalogCreateManyCalls,
    event: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === "event-1" ? { id: "event-1" } : null,
    },
    eventFnbSourceMenu: {
      create: async ({ data }: { data: Partial<SourceMenuRow> }) => {
        const now = new Date();
        const row: SourceMenuRow = {
          id: `source-${nextId++}`,
          eventId: String(data.eventId),
          menuName: String(data.menuName),
          fileName: String(data.fileName),
          sourceType: data.sourceType ?? EventFnbSourceMenuSourceType.ORIGINAL,
          status: data.status ?? EventFnbSourceMenuStatus.UPLOADED,
          objectKey: String(data.objectKey),
          itemsFound: Number(data.itemsFound ?? 0),
          progressSummary: data.progressSummary ?? null,
          lastError: data.lastError ?? null,
          baseSourceMenuId: data.baseSourceMenuId ?? null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Partial<SourceMenuRow> }) =>
        rows.find((row) =>
          (!where.id || row.id === where.id)
          && (!where.eventId || row.eventId === where.eventId)
          && (!("archivedAt" in where) || row.archivedAt === where.archivedAt)
        ) ?? null,
      findMany: async ({ where }: { where: { eventId: string; archivedAt?: null; status?: { not: EventFnbSourceMenuStatus } } }) =>
        rows.filter((row) =>
          row.eventId === where.eventId
          && (!("archivedAt" in where) || row.archivedAt === null)
          && (!where.status || row.status !== where.status.not)
        ),
      update: async ({ where, data }: { where: { id: string }; data: Partial<SourceMenuRow> }) => {
        const row = rows.find((entry) => entry.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = rows.findIndex((entry) => entry.id === where.id);
        if (index === -1) throw new Error("not found");
        const [row] = rows.splice(index, 1);
        return row;
      },
    },
    eventFnbCatalogItem: {
      create: async ({ data }: { data: Omit<CatalogItemRow, "id" | "archivedAt" | "createdAt" | "updatedAt"> }) => {
        catalogCreateCalls.push(data);
        const now = new Date();
        const row: CatalogItemRow = {
          id: `catalog-${nextCatalogId++}`,
          ...data,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        catalogRows.push(row);
        return row;
      },
      createMany: async ({ data }: { data: Array<Omit<CatalogItemRow, "id" | "archivedAt" | "createdAt" | "updatedAt">> }) => {
        catalogCreateManyCalls.push(data);
        const now = new Date();
        for (const entry of data) {
          catalogRows.push({
            id: `catalog-${nextCatalogId++}`,
            ...entry,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
        return { count: data.length };
      },
      findMany: async ({ where }: { where: Partial<CatalogItemRow> }) => {
        const result = catalogRows
          .filter((row) =>
            (!where.eventId || row.eventId === where.eventId)
            && (!where.sourceMenuId || row.sourceMenuId === where.sourceMenuId)
            && (!("archivedAt" in where) || row.archivedAt === where.archivedAt)
          );
        if (where.archivedAt === null) return result;
        return result.map((row) => ({ id: row.id }));
      },
      updateMany: async ({ where, data }: {
        where: { eventId: string; sourceMenuId: string; archivedAt: null };
        data: { archivedAt: Date };
      }) => {
        let count = 0;
        for (const row of catalogRows) {
          if (row.eventId === where.eventId && row.sourceMenuId === where.sourceMenuId && row.archivedAt === where.archivedAt) {
            row.archivedAt = data.archivedAt;
            row.updatedAt = new Date();
            count += 1;
          }
        }
        return { count };
      },
      deleteMany: async ({ where }: { where: { eventId: string; sourceMenuId: string } }) => {
        let count = 0;
        for (let index = catalogRows.length - 1; index >= 0; index -= 1) {
          const row = catalogRows[index];
          if (row.eventId === where.eventId && row.sourceMenuId === where.sourceMenuId) {
            catalogRows.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    sessionFnbCatalogAssignment: {
      count: async ({ where }: { where: { eventFnbCatalogItemId: { in: string[] } } }) =>
        assignmentRows.filter((row) => where.eventFnbCatalogItemId.in.includes(row.eventFnbCatalogItemId)).length,
    },
  };
}

describe("F&B source menu persistence helpers", () => {
  it("persists an uploaded source menu and returns it on refetch", async () => {
    const prisma = fakePrisma();
    const created = await createFnbSourceMenu("event-1", {
      fileName: "Banquet Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-1/Banquet-Menu.pdf",
    }, { prisma: prisma as never });

    const refetched = await listFnbSourceMenus("event-1", {}, { prisma: prisma as never });

    assert.equal(created.status, EventFnbSourceMenuStatus.UPLOADED);
    assert.equal(refetched.length, 1);
    assert.equal(refetched[0].fileName, "Banquet Menu.pdf");
  });

  it("keeps a failed parse as a persisted FAILED source menu row", async () => {
    const prisma = fakePrisma();
    const created = await createFnbSourceMenu("event-1", {
      fileName: "Broken.pdf",
      objectKey: "events/event-1/fnb-menus/upload-2/Broken.pdf",
    }, { prisma: prisma as never });

    await updateFnbSourceMenuStatus("event-1", created.id, EventFnbSourceMenuStatus.FAILED, {
      progressSummary: "Parse failed",
      lastError: "Could not extract readable PDF text.",
    }, { prisma: prisma as never });

    const refetched = await listFnbSourceMenus("event-1", {}, { prisma: prisma as never });
    assert.equal(refetched.length, 1);
    assert.equal(refetched[0].status, EventFnbSourceMenuStatus.FAILED);
    assert.equal(refetched[0].lastError, "Could not extract readable PDF text.");
  });

  it("uses the persisted objectKey for re-run handoff", async () => {
    const prisma = fakePrisma();
    const created = await createFnbSourceMenu("event-1", {
      fileName: "Banquet Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-3/Banquet-Menu.pdf",
    }, { prisma: prisma as never });

    const sourceMenu = await getFnbSourceMenuForEvent("event-1", created.id, { prisma: prisma as never });

    assert.equal(sourceMenu.objectKey, "events/event-1/fnb-menus/upload-3/Banquet-Menu.pdf");
  });

  it("archives source menus without deleting persisted rows", async () => {
    const prisma = fakePrisma();
    const created = await createFnbSourceMenu("event-1", {
      fileName: "Archive Me.pdf",
      objectKey: "events/event-1/fnb-menus/upload-4/Archive-Me.pdf",
    }, { prisma: prisma as never });

    await archiveFnbSourceMenu("event-1", created.id, { prisma: prisma as never });

    const active = await listFnbSourceMenus("event-1", {}, { prisma: prisma as never });
    const all = await listFnbSourceMenus("event-1", { includeArchived: true }, { prisma: prisma as never });
    assert.equal(active.length, 0);
    assert.equal(all.length, 1);
    assert.equal(all[0].status, EventFnbSourceMenuStatus.ARCHIVED);
  });

  it("does not leave local-only queued source menu rows in the planner", async () => {
    const source = await readFile("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");
    assert.equal(source.includes("queued locally"), false);
    assert.equal(source.includes("setFnbSourceMenus((current) => [...nextMenus"), false);
  });

  it("persists parsed catalog items for a source menu and replaces active rows on re-run", async () => {
    const prisma = fakePrisma();
    const sourceMenu = await createFnbSourceMenu("event-1", {
      fileName: "Parsed Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-5/Parsed-Menu.pdf",
    }, { prisma: prisma as never });

    const firstSave = await replaceFnbCatalogItemsForSourceMenu("event-1", {
      sourceMenuId: sourceMenu.id,
      sourceMenuFileName: sourceMenu.fileName,
      items: [
        { itemName: "Continental Breakfast", description: "Pastries and fruit", category: "Breakfast", price: "$32", unit: "per guest" },
        { itemName: "Coffee Service", description: "Fresh brewed coffee", category: "Breakfast", price: "$95", unit: "per gallon" },
      ],
    }, { prisma: prisma as never });

    assert.equal(firstSave.length, 2);
    assert.equal(prisma.catalogRows.filter((row) => row.archivedAt === null).length, 2);

    const secondSave = await replaceFnbCatalogItemsForSourceMenu("event-1", {
      sourceMenuId: sourceMenu.id,
      sourceMenuFileName: sourceMenu.fileName,
      items: [
        { itemName: "Continental Breakfast", description: "Pastries, fruit, and juice", category: "Breakfast", price: "$36", unit: "per guest" },
      ],
    }, { prisma: prisma as never });
    await updateFnbSourceMenuStatus("event-1", sourceMenu.id, EventFnbSourceMenuStatus.COMPLETE, {
      itemsFound: secondSave.length,
      progressSummary: `${secondSave.length} item saved`,
      lastError: null,
    }, { prisma: prisma as never });

    const activeRows = prisma.catalogRows.filter((row) => row.archivedAt === null);
    const archivedRows = prisma.catalogRows.filter((row) => row.archivedAt !== null);
    const refetchedSourceMenu = await getFnbSourceMenuForEvent("event-1", sourceMenu.id, { prisma: prisma as never });

    assert.equal(secondSave.length, 1);
    assert.equal(activeRows.length, 1);
    assert.equal(activeRows[0].itemName, "Continental Breakfast");
    assert.equal(activeRows[0].description, "Pastries, fruit, and juice");
    assert.equal(archivedRows.length, 2);
    assert.equal(refetchedSourceMenu.itemsFound, 1);
  });

  it("bulk saves 150 parsed catalog items without row-by-row create calls", async () => {
    const prisma = fakePrisma();
    const sourceMenu = await createFnbSourceMenu("event-1", {
      fileName: "Large Parsed Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-large/Large-Parsed-Menu.pdf",
    }, { prisma: prisma as never });
    const items = Array.from({ length: 150 }, (_, index) => ({
      itemName: `Bulk Item ${index + 1}`,
      description: `Bulk description ${index + 1}`,
      category: "Lunch",
      price: `$${index + 10}`,
      unit: "per guest",
    }));

    const saved = await replaceFnbCatalogItemsForSourceMenu("event-1", {
      sourceMenuId: sourceMenu.id,
      sourceMenuFileName: sourceMenu.fileName,
      items,
    }, { prisma: prisma as never });

    assert.equal(saved.length, 150);
    assert.equal(prisma.catalogCreateCalls.length, 0);
    assert.equal(prisma.catalogCreateManyCalls.length, 1);
    assert.equal(prisma.catalogCreateManyCalls[0].length, 150);
    assert.equal(prisma.catalogRows.filter((row) => row.sourceMenuId === sourceMenu.id && row.archivedAt === null).length, 150);
  });

  it("deletes a source menu and only its unassigned catalog items", async () => {
    const prisma = fakePrisma();
    const keepMenu = await createFnbSourceMenu("event-1", {
      fileName: "Keep Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-6/Keep-Menu.pdf",
    }, { prisma: prisma as never });
    const deleteMenu = await createFnbSourceMenu("event-1", {
      fileName: "Delete Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-7/Delete-Menu.pdf",
    }, { prisma: prisma as never });

    await replaceFnbCatalogItemsForSourceMenu("event-1", {
      sourceMenuId: keepMenu.id,
      sourceMenuFileName: keepMenu.fileName,
      items: [{ itemName: "Keep Item", category: "Breakfast", price: "$20", unit: "per guest" }],
    }, { prisma: prisma as never });
    await replaceFnbCatalogItemsForSourceMenu("event-1", {
      sourceMenuId: deleteMenu.id,
      sourceMenuFileName: deleteMenu.fileName,
      items: [
        { itemName: "Delete Item One", category: "Breakfast", price: "$21", unit: "per guest" },
        { itemName: "Delete Item Two", category: "Breaks", price: "$22", unit: "per guest" },
      ],
    }, { prisma: prisma as never });

    const result = await deleteFnbSourceMenu("event-1", deleteMenu.id, { prisma: prisma as never });

    assert.equal(result.deletedCatalogItemCount, 2);
    assert.equal(prisma.rows.some((row) => row.id === deleteMenu.id), false);
    assert.equal(prisma.rows.some((row) => row.id === keepMenu.id), true);
    assert.equal(prisma.catalogRows.some((row) => row.sourceMenuId === deleteMenu.id), false);
    assert.equal(prisma.catalogRows.filter((row) => row.sourceMenuId === keepMenu.id).length, 1);
  });

  it("blocks source menu delete when catalog items are assigned to sessions", async () => {
    const prisma = fakePrisma();
    const sourceMenu = await createFnbSourceMenu("event-1", {
      fileName: "Assigned Menu.pdf",
      objectKey: "events/event-1/fnb-menus/upload-8/Assigned-Menu.pdf",
    }, { prisma: prisma as never });
    const saved = await replaceFnbCatalogItemsForSourceMenu("event-1", {
      sourceMenuId: sourceMenu.id,
      sourceMenuFileName: sourceMenu.fileName,
      items: [{ itemName: "Assigned Item", category: "Lunch", price: "$45", unit: "per guest" }],
    }, { prisma: prisma as never });
    prisma.assignmentRows.push({ id: "assignment-1", eventFnbCatalogItemId: saved[0].id });

    await assert.rejects(
      () => deleteFnbSourceMenu("event-1", sourceMenu.id, { prisma: prisma as never }),
      /assigned to sessions/,
    );
    assert.equal(prisma.rows.some((row) => row.id === sourceMenu.id), true);
    assert.equal(prisma.catalogRows.some((row) => row.id === saved[0].id), true);
  });
});
