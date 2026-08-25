import { expect, test } from "@playwright/test";
import { EventMemberRole, EventStatus } from "@prisma/client";
import { createPlannerTimelineBrowserFixture, openEventWorkspace, openEventsList, openTimeline, usePlannerOrgContext } from "./helpers/planner-e2e";

test("PF-005 Timeline import maps source notes, persists them, and safely replays a retry", async ({ baseURL, context, page }) => {
  const fixture = await createPlannerTimelineBrowserFixture();
  const title = `PF-005 source-notes task ${Date.now()}`;
  const notes = "Keep the venue hold until the signed contract is stored.";

  try {
    await usePlannerOrgContext(context, baseURL, fixture.orgId);
    await openEventsList(page);
    await openEventWorkspace(page, fixture.eventName);
    await openTimeline(page);
    await page.getByRole("button", { name: "Matrix" }).click();
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByRole("heading", { name: "Import Roadmap" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "pf-005-timeline.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`Task,Due Date,Comments\n${title},2026-09-17,${notes}\n`),
    });
    await expect(page.getByText("Comments", { exact: true })).toBeVisible();
    await expect(page.getByText(notes, { exact: true })).toBeVisible();

    const request = page.waitForRequest((candidate) => candidate.url().includes(`/api/events/${fixture.eventId}/timeline-items/import`));
    const imported = page.waitForResponse((candidate) => candidate.url().includes(`/api/events/${fixture.eventId}/timeline-items/import`) && candidate.request().method() === "POST");
    await page.getByRole("button", { name: /Import \d+ row/ }).click();
    expect((await imported).status()).toBe(201);
    const requestBody = (await request).postDataJSON() as { rows: unknown[]; rowNumbers: number[]; idempotencyKey: string };
    expect(requestBody.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(page.getByRole("heading", { name: "Import Roadmap" })).toHaveCount(0);

    await page.reload();
    await page.getByRole("button", { name: "Matrix" }).click();
    const row = page.locator("tbody tr").filter({ hasText: title }).first();
    await expect(row).toContainText(notes);

    const plannerNote = "Planner confirmation: contract signature is pending legal review.";
    const plannerSave = page.waitForResponse((candidate) =>
      candidate.url().includes(`/api/events/${fixture.eventId}/timeline-items/`) && candidate.request().method() === "PATCH",
    );
    await row.getByRole("button", { name: `Edit notes for ${title}` }).click();
    const notesEditor = row.getByLabel(`Edit notes for ${title}`);
    await notesEditor.fill(plannerNote);
    await notesEditor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    expect((await plannerSave).status()).toBe(200);
    await expect(row).toContainText(plannerNote);

    const replay = await page.evaluate(async ({ eventId, body }) => {
      const response = await fetch(`/api/events/${eventId}/timeline-items/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }, { eventId: fixture.eventId, body: requestBody });
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({ importedCount: 1, replayed: true });

    await page.getByRole("button", { name: "Import" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "pf-005-timeline-blank-notes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`Task,Due Date,Notes\n${title},2026-09-17,\n`),
    });
    const blankReimport = page.waitForResponse((candidate) => candidate.url().includes(`/api/events/${fixture.eventId}/timeline-items/import`) && candidate.request().method() === "POST");
    await page.getByRole("button", { name: /Import \d+ row/ }).click();
    const blankReimportPayload = await (await blankReimport).json() as { importedCount: number; duplicateCount: number; replayed: boolean };
    expect(blankReimportPayload).toMatchObject({ importedCount: 0, duplicateCount: 1, replayed: false, validCount: 1, invalidCount: 0, blankCount: 0, missingAssignmentsCount: 0 });
    await page.reload();
    await page.getByRole("button", { name: "Matrix" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: title }).first()).toContainText(plannerNote);

    const persisted = await fixture.harness.db.timelineItem.findMany({
      where: { eventId: fixture.eventId, title },
      select: { notes: true },
    });
    expect(persisted).toEqual([{ notes: plannerNote }]);
    expect(await fixture.harness.db.timelineImportBatch.count({ where: { eventId: fixture.eventId } })).toBe(2);

    const eventB = await fixture.harness.createEvent({
      orgId: fixture.orgId,
      createdByUserId: fixture.editorUserId,
      name: `PF-005 isolated event ${Date.now()}`,
      status: EventStatus.ACTIVE,
    });
    await fixture.harness.createEventMember({ eventId: eventB.id, userId: fixture.editorUserId, eventRole: EventMemberRole.EVENT_EDITOR });
    await page.goto(`/events/${eventB.id}/timeline`);
    await page.getByRole("button", { name: "Matrix" }).click();
    await expect(page.getByText(plannerNote, { exact: true })).toHaveCount(0);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    const isolation = await page.evaluate(async ({ eventId, foreignItemId }) => {
      const [list, patch] = await Promise.all([
        fetch(`/api/events/${eventId}/timeline-items`, { credentials: "include" }),
        fetch(`/api/events/${eventId}/timeline-items/${foreignItemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ notes: "attempted cross-event note update" }),
        }),
      ]);
      return { listStatus: list.status, list: await list.json(), patchStatus: patch.status };
    }, { eventId: eventB.id, foreignItemId: (await fixture.harness.db.timelineItem.findFirstOrThrow({ where: { eventId: fixture.eventId, title }, select: { id: true } })).id });
    expect(isolation.listStatus).toBe(200);
    expect(isolation.list).toEqual(expect.not.arrayContaining([expect.objectContaining({ title, notes: plannerNote })]));
    expect(isolation.patchStatus).toBe(404);
  } finally {
    await fixture.harness.cleanup();
  }
});
