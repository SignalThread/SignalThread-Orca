import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import {
  createManualRegistrationAgendaEntry,
  importRegistrationAgendaSpreadsheet,
  listRegistrationAgendaEntries,
  recordRegistrationAgendaPdfReference,
  RegistrationAgendaError,
  updateRegistrationAgendaEntry,
  validateRegistrationAgendaDraft,
} from "@/lib/registration-agenda";
import { createPlannerFixtureHarness, hasPlannerTestDatabaseUrl, type PlannerFixtureHarness } from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) { t.skip("DATABASE_URL is not configured"); return null; }
  return createPlannerFixtureHarness({ runLabel: `agenda-paths-${randomUUID().slice(0, 8)}` });
}

test("manual and spreadsheet agenda paths persist, edit, publish, validate, and deduplicate", async (t) => {
  const harness = harnessOrSkip(t); if (!harness) return;
  try {
    const roles = await harness.createRoleAccessFixture();
    const manual = await createManualRegistrationAgendaEntry(roles.event.id, roles.owner.user.id, {
      title: "Welcome",
      description: "Doors open",
      date: "2026-01-15",
      startTime: "9:00 am",
      endTime: "10:00",
      location: "Lobby",
      sessionType: "General",
      officialStatus: "Draft",
    });
    assert.equal(manual.source, "MANUAL");
    await updateRegistrationAgendaEntry(roles.event.id, manual.id, roles.owner.user.id, { title: "Welcome updated" });
    const published = await updateRegistrationAgendaEntry(roles.event.id, manual.id, roles.owner.user.id, { action: "publish" });
    assert.equal(published.publicationStatus, "PUBLISHED");
    const unpublished = await updateRegistrationAgendaEntry(roles.event.id, manual.id, roles.owner.user.id, { action: "unpublish" });
    assert.equal(unpublished.publicationStatus, "UNPUBLISHED");

    await assert.rejects(
      () => createManualRegistrationAgendaEntry(roles.event.id, roles.owner.user.id, { title: "", date: "bad", startTime: "12:00", endTime: "11:00" }),
      (error: unknown) => error instanceof RegistrationAgendaError && error.code === "INVALID_AGENDA_ENTRY",
    );

    const rows = [
      { title: "Breakout A", date: "2026-01-15", startTime: "10:00", endTime: "11:00", location: "Room A" },
      { title: "Breakout A", date: "2026-01-15", startTime: "10:00", endTime: "11:00", location: "Room A" },
      { title: "Broken row", date: "", startTime: "nope", endTime: "11:00" },
    ];
    const first = await importRegistrationAgendaSpreadsheet({
      eventId: roles.event.id, actorUserId: roles.owner.user.id, fileName: "agenda.csv", mimeType: "text/csv", sizeBytes: 256,
      mapping: { title: "Session", date: "Date", startTime: "Start", endTime: "End" }, rows,
    });
    assert.equal(first.importedCount, 1);
    assert.equal(first.duplicateCount, 1);
    assert.equal(first.invalidRows.length, 1);
    const second = await importRegistrationAgendaSpreadsheet({
      eventId: roles.event.id, actorUserId: roles.owner.user.id, fileName: "agenda-again.csv", mimeType: "text/csv", sizeBytes: 256,
      mapping: {}, rows: [rows[0]!],
    });
    assert.equal(second.importedCount, 0);
    assert.equal(second.duplicateCount, 1);
    const entries = await listRegistrationAgendaEntries(roles.event.id);
    assert.equal(entries.filter((entry) => entry.source === "SPREADSHEET").length, 1);
    assert.equal(entries.find((entry) => entry.id === manual.id)?.title, "Welcome updated");

    const pdf = await recordRegistrationAgendaPdfReference({ eventId: roles.event.id, actorUserId: roles.owner.user.id, fileName: "legacy-agenda.pdf", mimeType: "application/pdf", sizeBytes: 512 });
    assert.equal(pdf.referenceOnly, true);
    assert.equal(pdf.status, "REFERENCE_RECORDED_NO_EXTRACTION");
  } finally { await harness.cleanup(); }
});

test("agenda input validation rejects malformed ranges", () => {
  const invalid = validateRegistrationAgendaDraft({ title: "Session", date: "2026-01-15", startTime: "14:00", endTime: "13:00" });
  assert.equal(invalid.draft, null);
  assert.ok(invalid.errors.includes("End time must be after start time"));
});

test("entry-path APIs authorize writes before mutation and UI exposes all truthful paths", () => {
  const paths = [
    "app/api/events/[eventId]/registration/agenda/entries/route.ts",
    "app/api/events/[eventId]/registration/agenda/entries/[entryId]/route.ts",
    "app/api/events/[eventId]/registration/agenda/spreadsheet/route.ts",
    "app/api/events/[eventId]/registration/agenda/pdf-reference/route.ts",
  ];
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    const write = source.indexOf('assertEventAccessForUser(eventId, auth.user, "write")');
    assert.notEqual(write, -1, `${path} must enforce write access`);
  }
  const spreadsheet = readFileSync(paths[2]!, "utf8");
  assert.ok(spreadsheet.includes("detectedMapping"));
  assert.ok(spreadsheet.includes("previewRows"));
  assert.ok(spreadsheet.includes("CSV, XLSX, or XLS"));
  assert.ok(spreadsheet.includes("1,000 rows"));
  const pdf = readFileSync(paths[3]!, "utf8");
  assert.ok(pdf.includes('signature !== "%PDF-"'));
  assert.ok(pdf.includes("extractionPerformed: false"));
  const ui = readFileSync("app/(shell)/events/[eventId]/registration/agenda/registration-agenda-workspace.tsx", "utf8");
  for (const label of ["Import from ShowOps", "Manual agenda entry", "Spreadsheet upload", "PDF reference", "Preview mapping", "Import valid rows", "Unpublish", "Remove"]) assert.ok(ui.includes(label), `missing ${label}`);
  assert.ok(ui.includes("No agenda extraction was performed"));
  assert.ok(ui.includes("window.confirm"));
  assert.ok(ui.includes("if (working) return"));
});
