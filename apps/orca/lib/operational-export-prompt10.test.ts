import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildOperationalExport } from "./operational-export";
import { serializeOperationalExportWorkbook } from "./operational-export-xlsx";
import * as XLSX from "xlsx";

const secret = "PRIVATE-MEDICAL-CONTACT-$999";
const session = {
  id: "s-1", date: "2026-09-01", start: "09:00", end: "10:00", title: "Opening", room: "Grand",
  status: "blocked", changedAt: "2026-08-11T12:00:00.000Z", setupType: "Theater", attendance: 100,
  supplies: "Lectern × 1", signage: "Door sign × 2", accessibility: "Wheelchair route × 2",
  operationalNotes: "Approved loading dock", fnbContext: "Coffee at 08:45", fnbSelections: "Coffee × 100",
  fnbVerifiedNeeds: "Gluten Free × 4 (required)", fnbModifications: "Separate verified preparation",
  fnbFinancials: "$2,400.00", avSummary: "Projector × 1", speakers: "Alex Rivera", staffing: "Sam — Lead",
  approvals: "Coffee: pending", risks: "Power plan", unresolved: "insufficient information", internalNotes: secret,
  publicDescription: "Welcome to the event",
  showFlow: [{ label: "Private cue", start: "09:00", owner: secret, notes: secret, visibility: "INTERNAL" as const }, { label: "Welcome", start: "09:05", publicDescription: "Opening remarks", visibility: "PUBLIC" as const }],
};

test("every recipient is an explicit necessary-data allowlist", () => {
  const hotel = buildOperationalExport("hotel", [session]);
  assert.match(hotel.rows[1]!.join(" "), /Lectern/);
  assert.match(hotel.rows[1]!.join(" "), /Door sign/);
  assert.doesNotMatch(hotel.rows.flat().join(" "), /PRIVATE-MEDICAL|\$999/);
  const caterer = buildOperationalExport("caterer", [session]);
  assert.match(caterer.rows[1]!.join(" "), /Gluten Free/);
  assert.match(caterer.rows[1]!.join(" "), /Separate verified preparation/);
  assert.doesNotMatch(caterer.rows.flat().join(" "), /PRIVATE-MEDICAL/);
  const av = buildOperationalExport("av", [session]);
  assert.match(av.rows[1]!.join(" "), /Alex Rivera/);
  assert.match(av.rows[1]!.join(" "), /Projector/);
  assert.doesNotMatch(av.rows.flat().join(" "), /PRIVATE-MEDICAL/);
  const internal = buildOperationalExport("internal", [session]);
  assert.match(internal.rows[1]!.join(" "), /PRIVATE-MEDICAL/);
});

test("public handoff contains published attendee fields and public cues only", () => {
  const projected = buildOperationalExport("public", [session]);
  const text = projected.rows.flat().join(" ");
  assert.match(text, /Welcome to the event/);
  assert.match(text, /Opening remarks/);
  for (const forbidden of [secret, "Coffee", "Gluten", "Projector", "Sam", "pending", "Power plan"]) assert.doesNotMatch(text, new RegExp(forbidden.replace("$", "\\$")));
});

test("spreadsheet contains reconciled metadata and handoff rows", () => {
  const projection = buildOperationalExport("caterer", [session], { dataAsOf: "2026-08-11T12:00:00.000Z", sourceVersion: "stable-source", projectionVersion: 4, filters: { room: "Grand" } });
  const workbook = XLSX.read(serializeOperationalExportWorkbook(projection), { type: "array" });
  assert.deepEqual(workbook.SheetNames, ["About", "Handoff"]);
  const about = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.About!, { header: 1 });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Handoff!, { header: 1 });
  assert.deepEqual(about[1], ["Projection version", 4]);
  assert.equal(rows.length - 1, projection.rowCount);
  assert.equal(rows[1]?.[3], "Opening");
  assert.ok(workbook.Sheets.Handoff!["!autofilter"]);
});

test("route and handoff center implement preview, filters, audit and all formats", async () => {
  const [route, service, ui] = await Promise.all([
    readFile("app/api/events/[eventId]/exports/route.ts", "utf8"),
    readFile("lib/operational-export-service.ts", "utf8"),
    readFile("app/(shell)/events/[eventId]/reports/_components/operational-handoff-center.tsx", "utf8"),
  ]);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "read"\)/);
  for (const filter of ["date", "room", "session", "status", "changedSince"]) assert.match(route, new RegExp(filter));
  for (const format of ["csv", "xlsx", "print", "json"]) assert.match(route, new RegExp(`"${format}"`));
  assert.match(service, /sessionAgendaPublication\.findMany/);
  assert.match(service, /sessionSpeakerAssignments: \{ include: \{ speaker:/);
  assert.doesNotMatch(service, /sessionSpeakers:/);
  assert.match(service, /eventFnbExportRecord\.create/);
  assert.match(service, /projectionVersion/);
  assert.match(ui, /Safe preview/);
  assert.match(ui, /Generation history/);
  assert.match(ui, /Print \/ save PDF/);
  assert.match(ui, /overflow-auto/);
});
