import { expect, test } from "@playwright/test";
import { EventMemberRole, EventPersonRole, EventStatus, UserRole } from "@prisma/client";
import { buildPlannerFixture, type PlannerFixtureHarness } from "../lib/test-harness/planner-fixtures";
import { createRunLabel, E2E_DEV_USER_EMAIL } from "./helpers/planner-e2e";
import * as XLSX from "xlsx";
import { initializeEventSessionRequirementTemplate } from "../lib/session-requirements";

test("PF-020 delivers persisted session Show Flow v1 with isolation and four exports", async ({ page }) => {
  const runLabel = createRunLabel("pf020-show-flow");
  let harness: PlannerFixtureHarness | undefined;
  try {
    const fixture = await buildPlannerFixture({ runLabel }, async (createdHarness) => {
      harness = createdHarness;
      const organization = await createdHarness.createOrganization({ name: `PF020 Org ${runLabel}` });
      const owner = await createdHarness.createUser({ orgId: organization.id, role: UserRole.OWNER, email: E2E_DEV_USER_EMAIL, name: "PF020 Planner" });
      await createdHarness.createMembership({ orgId: organization.id, userId: owner.id });
      const client = await createdHarness.createClient({ orgId: organization.id, name: `PF020 Client ${runLabel}` });
      const event = await createdHarness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id, name: `PF020 Event A ${runLabel}`, status: EventStatus.ACTIVE });
      await initializeEventSessionRequirementTemplate(event.id);
      await createdHarness.createEventMember({ eventId: event.id, userId: owner.id, eventRole: EventMemberRole.EVENT_EDITOR });
      const room = await createdHarness.createRoom({ eventId: event.id, name: `PF020 Ballroom ${runLabel}` });
      const target = await createdHarness.createMatrixRow({ eventId: event.id, roomId: room.id, sessionName: `PF020 Target ${runLabel}` });
      const source = await createdHarness.createMatrixRow({ eventId: event.id, roomId: room.id, sessionName: `PF020 Source ${runLabel}`, startTime: new Date(Date.UTC(1970, 0, 1, 11)), endTime: new Date(Date.UTC(1970, 0, 1, 12)) });
      const copyTarget = await createdHarness.createMatrixRow({ eventId: event.id, roomId: room.id, sessionName: `PF020 Copy ${runLabel}`, startTime: new Date(Date.UTC(1970, 0, 1, 13)), endTime: new Date(Date.UTC(1970, 0, 1, 14)) });
      const person = await createdHarness.createEventPerson({ eventId: event.id, name: `Alex Showcaller ${runLabel}`, role: EventPersonRole.STAFF });
      const eventB = await createdHarness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id, name: `PF020 Event B ${runLabel}`, status: EventStatus.ACTIVE });
      await initializeEventSessionRequirementTemplate(eventB.id);
      await createdHarness.createEventMember({ eventId: eventB.id, userId: owner.id, eventRole: EventMemberRole.EVENT_EDITOR });
      const eventBSession = await createdHarness.createMatrixRow({ eventId: eventB.id, sessionName: `PF020 Foreign ${runLabel}` });
      const foreignPerson = await createdHarness.createEventPerson({ eventId: eventB.id, name: `Foreign Owner ${runLabel}`, role: EventPersonRole.STAFF });
      return { event, target, source, copyTarget, person, eventB, eventBSession, foreignPerson };
    });

    await page.goto(`/events/${fixture.event.id}/matrix/sessions/${fixture.source.id}#show-flow`);
    await expect(page.getByRole("heading", { name: fixture.source.sessionName!, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply template" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Edit show flow" })).toBeVisible();
    await page.getByRole("button", { name: "Build show flow" }).click();
    await page.getByRole("button", { name: "Use starter template" }).click();
    await expect(page.getByRole("button", { name: "Apply template" })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Apply template" }).click();
    await expect.poll(() => harness!.db.sessionShowFlowItem.count({ where: { sessionId: fixture.source.id } })).toBe(4);
    await page.getByRole("button", { name: "Close Manage flow" }).click();
    await expect(page.getByRole("region", { name: "View Show Flow" }).getByText("Room and stage final check")).toBeVisible();

    await page.goto(`/events/${fixture.event.id}/matrix/sessions/${fixture.target.id}#show-flow`);
    await expect(page.getByRole("region", { name: "Empty Show Flow" })).toBeVisible();
    await expect(page.getByLabel("Starter template")).toBeHidden();
    await page.getByRole("button", { name: "Build show flow" }).click();
    await page.getByRole("button", { name: "Start blank" }).click();
    const cueDrawer = page.locator('aside[aria-labelledby="show-flow-cue-editor-title"]');
    await expect(page.getByRole("region", { name: "View Show Flow" })).toBeVisible();
    await cueDrawer.getByLabel("Cue type").selectOption("AV_TECHNICAL");
    await cueDrawer.getByLabel("Cue / segment").fill("Opening video roll");
    await cueDrawer.getByLabel("Directory owner").selectOption(fixture.person.id);
    await cueDrawer.getByLabel("Internal notes").fill("Internal standby channel 2");
    await cueDrawer.getByRole("button", { name: "Save cue" }).click();
    await page.getByRole("button", { name: "Add cue", exact: true }).click();
    const secondCueDrawer = page.locator('aside[aria-labelledby="show-flow-cue-editor-title"]');
    await secondCueDrawer.getByLabel("Cue type").selectOption("SPEAKER_HANDOFF");
    await secondCueDrawer.getByLabel("Cue / segment").fill("Host handoff");
    await secondCueDrawer.getByLabel("Unfilled owner role").fill("Speaker wrangler");
    await secondCueDrawer.getByRole("button", { name: "Save cue" }).click();
    await expect(page.getByText("Show flow saved.")).toBeVisible();
    await expect(page.getByRole("region", { name: "View Show Flow" })).toBeVisible();
    await expect(page.getByLabel("Cue type")).toBeHidden();

    await page.getByRole("button", { name: "Edit cue 1" }).click();
    await page.getByRole("dialog", { name: "Opening video roll" }).getByLabel("Cue / segment").fill("Opening brand video");
    await page.getByRole("button", { name: "Save cue" }).click();
    await expect(page.getByRole("dialog", { name: "Opening brand video" })).toBeHidden();
    await expect(page.getByRole("region", { name: "View Show Flow" }).getByText("Opening brand video")).toBeVisible();
    await page.getByRole("button", { name: "Duplicate cue 1" }).click();
    await page.getByRole("button", { name: "Move cue 2 down" }).click();
    const saveChanges = page.getByRole("button", { name: "Save changes" });
    await expect(saveChanges).toBeEnabled();
    await saveChanges.click();
    await expect.poll(() => harness!.db.sessionShowFlowItem.count({ where: { sessionId: fixture.target.id } })).toBe(3);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete cue 3" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => harness!.db.sessionShowFlowItem.count({ where: { sessionId: fixture.target.id } })).toBe(2);

    await page.getByRole("button", { name: "Edit cue 1" }).click();
    await page.getByRole("dialog", { name: "Opening brand video" }).getByLabel("Cue / segment").fill("Unsaved onsite change");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("dialog", { name: "Unsaved onsite change" }).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("region", { name: "View Show Flow" }).getByText("Opening brand video")).toBeVisible();
    await expect(page.getByText("Unsaved onsite change")).toBeHidden();

    const itemsBeforeIsolation = await page.evaluate(async ({ eventId, sessionId }) => (await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow?mode=workspace`)).json(), { eventId: fixture.event.id, sessionId: fixture.target.id });
    const invalidOwner = await page.evaluate(async ({ eventId, sessionId, items, revision, foreignPersonId }) => {
      items[0].ownerPersonId = foreignPersonId;
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items, expectedRevision: revision }) });
      return { status: response.status, body: await response.json() };
    }, { eventId: fixture.event.id, sessionId: fixture.target.id, items: itemsBeforeIsolation.items, revision: itemsBeforeIsolation.revision, foreignPersonId: fixture.foreignPerson.id });
    expect(invalidOwner.status).toBe(400);
    expect(invalidOwner.body.code).toBe("CROSS_EVENT_OWNER");

    await page.reload();
    await expect(page.getByRole("region", { name: "View Show Flow" }).getByText("Opening brand video")).toBeVisible();
    await expect(page.getByRole("region", { name: "View Show Flow" }).getByText("Host handoff")).toBeVisible();
    await page.getByRole("button", { name: "Edit show flow" }).click();
    await page.getByRole("button", { name: "Edit cue 1" }).click();
    await expect(page.getByRole("dialog", { name: "Opening brand video" }).getByLabel("Directory owner")).toHaveValue(fixture.person.id);
    await expect(page.getByRole("dialog", { name: "Opening brand video" }).getByLabel("Directory owner").locator("option:checked")).toContainText(
      `Alex Showcaller ${runLabel}`,
    );
    await page.getByRole("button", { name: "Close cue editor" }).click();
    await page.getByRole("button", { name: "Approve Show Flow" }).click();
    await expect(page.getByText("Show Flow approved.")).toBeVisible();
    await expect(page.getByRole("region", { name: "View Show Flow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to draft" })).toBeHidden();
    await page.reload();
    await expect(page.getByLabel("Show Flow readiness summary").getByText("Approved", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "View Show Flow" })).toBeVisible();
    await page.getByRole("button", { name: "Edit show flow" }).click();
    await expect(page.getByRole("dialog", { name: "Return this Show Flow to Draft?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep approved" }).click();
    await expect(page.getByLabel("Cue type")).toBeHidden();
    await page.getByRole("button", { name: "Edit show flow" }).click();
    await page.getByRole("button", { name: "Return to Draft and edit" }).click();
    await expect(page.getByLabel("Show Flow readiness summary").getByText("Draft · changes pending approval")).toBeVisible();
    await expect(page.getByRole("region", { name: "View Show Flow" }).getByText("Opening brand video")).toBeVisible();

    await page.goto(`/events/${fixture.event.id}/matrix/sessions/${fixture.copyTarget.id}#show-flow`);
    await page.getByRole("button", { name: "Build show flow" }).click();
    await page.getByRole("button", { name: "Use starter template" }).click();
    await page.getByLabel("Copy from session").selectOption(fixture.source.id);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Copy cues" }).click();
    await expect.poll(() => harness!.db.sessionShowFlowItem.count({ where: { sessionId: fixture.copyTarget.id } })).toBe(4);

    await page.goto(`/events/${fixture.event.id}/matrix/sessions/${fixture.target.id}#show-flow`);
    const exportRegion = page.getByRole("region", { name: "Export Show Flow" });
    await expect(exportRegion).toBeVisible();
    await exportRegion.getByRole("combobox", { name: "Cues" }).selectOption("selected");
    await page.getByRole("checkbox", { name: "Select cue 1 for export" }).check();
    await exportRegion.getByRole("combobox", { name: "Format" }).selectOption("csv");
    const [selectedDownload] = await Promise.all([page.waitForEvent("download"), exportRegion.getByRole("button", { name: "Download export" }).click()]);
    const selectedPath = await selectedDownload.path();
    const selectedText = await import("node:fs").then(({ readFileSync }) => readFileSync(selectedPath!, "utf8"));
    expect(selectedText).toContain("Opening brand video");
    expect(selectedText).not.toContain("Host handoff");
    await exportRegion.getByRole("combobox", { name: "Cues" }).selectOption("session");
    for (const format of ["pdf", "xlsx", "csv", "docx"] as const) {
      await exportRegion.getByRole("combobox", { name: "Format" }).selectOption(format);
      const [download] = await Promise.all([page.waitForEvent("download"), exportRegion.getByRole("button", { name: "Download export" }).click()]);
      const path = await download.path();
      expect(path).not.toBeNull();
      const bytes = await import("node:fs").then(({ readFileSync }) => readFileSync(path!));
      if (format === "pdf") expect(bytes.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
      if (format === "xlsx") expect(XLSX.read(bytes, { type: "buffer" }).SheetNames).toContain("Show Flow");
      if (format === "csv") expect(bytes.toString("utf8")).toContain("Opening brand video");
      if (format === "docx") expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
    }
    await exportRegion.getByRole("combobox", { name: "Audience" }).selectOption("client");
    await exportRegion.getByRole("combobox", { name: "Format" }).selectOption("csv");
    const [clientDownload] = await Promise.all([page.waitForEvent("download"), exportRegion.getByRole("button", { name: "Download export" }).click()]);
    const clientPath = await clientDownload.path();
    const clientText = await import("node:fs").then(({ readFileSync }) => readFileSync(clientPath!, "utf8"));
    expect(clientText).not.toContain("Internal standby channel 2");

    const crossEvent = await page.evaluate(async ({ eventBId, targetId }) => {
      const read = await fetch(`/api/events/${eventBId}/sessions/${targetId}/show-flow?mode=workspace`);
      const mutation = await fetch(`/api/events/${eventBId}/sessions/${targetId}/show-flow`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "DRAFT", expectedRevision: 0 }) });
      const exported = await fetch(`/api/events/${eventBId}/sessions/${targetId}/show-flow/export?format=csv`);
      return [read.status, mutation.status, exported.status];
    }, { eventBId: fixture.eventB.id, targetId: fixture.target.id });
    expect(crossEvent).toEqual([404, 404, 404]);

    expect(await harness!.db.eventActivity.count({ where: { eventId: fixture.event.id, entityType: "SessionShowFlow" } })).toBeGreaterThan(4);
  } finally {
    await harness?.cleanup();
  }
});
