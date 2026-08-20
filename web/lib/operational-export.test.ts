import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalExport, renderOperationalExportHtml, serializeOperationalExportCsv } from "./operational-export";

const sessions = [{
  id: "session-1", date: "2026-08-10", start: "09:00", end: "10:00", title: "Opening", room: "Grand Ballroom", setupType: "Theater", attendance: 250,
  fnbContext: "Coffee service", avSummary: "Projection and 2 microphones", internalNotes: "Security arrival route",
  showFlow: [{ start: "09:00", label: "Welcome", owner: "Production", avNotes: "Walk-on music", notes: "Internal production note", visibility: "INTERNAL" as const }, { start: "09:05", label: "Keynote", visibility: "PUBLIC" as const }],
}];

test("operational exports are recipient-specific allowlisted projections", () => {
  const publicExport = buildOperationalExport("public", sessions);
  assert.deepEqual(publicExport.rows[0], ["Date", "Start", "End", "Session", "Room", "Description", "Published agenda"]);
  assert.equal(publicExport.rows[1]?.includes("Security arrival route"), false);
  assert.equal(publicExport.rows[1]?.includes("Coffee service"), false);
  assert.equal(buildOperationalExport("caterer", sessions).rows[0]?.includes("Verified aggregate dietary / allergen needs"), true);
  assert.equal(buildOperationalExport("av", sessions).rows[1]?.some((cell) => cell.includes("Walk-on music")), true);
  assert.equal(buildOperationalExport("av", sessions).rows[1]?.some((cell) => cell.includes("Internal production note")), false);
  assert.equal(buildOperationalExport("internal", sessions).rows[1]?.some((cell) => cell.includes("Security arrival route")), true);
});

test("operational export CSV escapes spreadsheet cells deterministically", () => {
  assert.equal(serializeOperationalExportCsv([["a,b", "quote \"here\""]]), '"a,b","quote ""here"""');
  assert.equal(serializeOperationalExportCsv([["=HYPERLINK(\"bad\")"]]), '"\'=HYPERLINK(""bad"")"');
});

test("projection regeneration is deterministic and printable output is accessible", () => {
  const options = { dataAsOf: "2026-08-10T10:00:00.000Z", sourceVersion: "source-1", projectionVersion: 3, filters: { date: "2026-08-10" } };
  const first = buildOperationalExport("hotel", sessions, options);
  const second = buildOperationalExport("hotel", sessions, options);
  assert.equal(first.checksum, second.checksum);
  assert.equal(first.filename, "hotel-handoff-v3.csv");
  const html = renderOperationalExportHtml(first);
  assert.match(html, /<th scope="col">/);
  assert.match(html, /role="region" aria-label="Handoff table" tabindex="0"/);
  assert.match(html, /Print command to print or save this handoff as PDF/);
});
