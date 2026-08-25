import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  buildShowFlowExportDocument,
  serializeShowFlowCsv,
  serializeShowFlowDocx,
  serializeShowFlowPdf,
  serializeShowFlowXlsx,
} from "@/lib/session-show-flow-export";

const base = {
  eventName: "Orca Summit",
  sessionTitle: "General Session",
  sessionDate: "2027-01-18",
  roomName: "Grand Ballroom",
  timezone: "America/New_York",
  generatedAt: "2026-08-19T22:00:00.000Z",
  version: 4,
  status: "DRAFT" as const,
  cues: [{
    id: "cue-1", cueType: "AV_TECHNICAL", effectiveStartTime: "09:00", effectiveEndTime: "09:05", durationMin: 5,
    label: "Roll opening video", owner: "AV lead", ownerPerson: null, department: "Production", action: "GO video",
    internalNotes: "Internal-only standby detail", avNotes: "Playback machine A",
  }],
};

test("client-facing Show Flow documents omit internal instructions by construction", () => {
  const document = buildShowFlowExportDocument({ ...base, variant: "client" });
  const text = Buffer.from(serializeShowFlowCsv(document)).toString("utf8");
  assert.equal(text.includes("Internal-only standby detail"), false);
  assert.equal(text.includes("Playback machine A"), false);
  assert.match(text, /Timezone: America\/New_York/);
  assert.match(text, /Status: DRAFT/);
});

test("selected and role exports filter canonical cues", () => {
  const role = buildShowFlowExportDocument({ ...base, variant: "role", role: "venue" });
  assert.equal(role.rows.length, 0);
  const selected = buildShowFlowExportDocument({ ...base, variant: "internal", selectedCueIds: ["missing"] });
  assert.equal(selected.rows.length, 0);
});

test("PDF, XLSX, CSV, and DOCX serializers produce structurally valid files", () => {
  const document = buildShowFlowExportDocument({ ...base, variant: "internal" });
  const pdf = Buffer.from(serializeShowFlowPdf(document));
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /%%EOF$/);

  const csv = Buffer.from(serializeShowFlowCsv(document));
  assert.match(csv.toString("utf8"), /Internal-only standby detail/);

  const xlsx = Buffer.from(serializeShowFlowXlsx(document));
  assert.equal(xlsx.subarray(0, 2).toString("ascii"), "PK");
  const workbook = XLSX.read(xlsx, { type: "buffer" });
  assert.equal(workbook.SheetNames[0], "Show Flow");
  assert.match(XLSX.utils.sheet_to_csv(workbook.Sheets["Show Flow"]!), /Roll opening video/);

  const docx = Buffer.from(serializeShowFlowDocx(document));
  assert.equal(docx.subarray(0, 2).toString("ascii"), "PK");
  assert.match(docx.toString("utf8"), /word\/document.xml/);
  assert.match(docx.toString("utf8"), /Internal-only standby detail/);
});

test("PDF export paginates long Show Flows without truncating the final cue", () => {
  const cues = Array.from({ length: 60 }, (_, index) => ({ ...base.cues[0]!, id: `cue-${index}`, label: `Cue ${index + 1}` }));
  const document = buildShowFlowExportDocument({ ...base, variant: "internal", cues });
  const pdf = Buffer.from(serializeShowFlowPdf(document)).toString("latin1");
  assert.match(pdf, /\/Count 2/);
  assert.match(pdf, /Cue 60/);
});
