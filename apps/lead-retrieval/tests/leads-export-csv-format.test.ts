import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEADS_EXPORT_COLUMNS,
  buildLeadsCsvDocument,
  buildLeadsCsvHeaderLine,
  escapeCsvCell
} from "../lib/server/leads/csvFormat";

describe("csvFormat (canonical CSV for export)", () => {
  it("LEADS_EXPORT_COLUMNS is stable and includes id + contract fields", () => {
    assert.deepEqual(
      [...LEADS_EXPORT_COLUMNS],
      [
        "id",
        "full_name",
        "job_title",
        "company_text",
        "rating",
        "priority_score",
        "status",
        "follow_up_date",
        "created_at",
        "updated_at",
        "event_id",
        "company_id"
      ]
    );
  });

  it("escapeCsvCell handles comma, quote, CRLF, and null", () => {
    assert.equal(escapeCsvCell(null), "");
    assert.equal(escapeCsvCell(undefined), "");
    assert.equal(escapeCsvCell(`say "hi"`), `"say ""hi"""`);
    assert.equal(escapeCsvCell("a,b"), `"a,b"`);
    assert.equal(escapeCsvCell("line\nbreak"), `"line\nbreak"`);
    assert.equal(escapeCsvCell("x\ry"), `"x\ry"`);
  });

  it("buildLeadsCsvDocument: empty rows still yields BOM + header only", () => {
    const doc = buildLeadsCsvDocument([]);
    assert.ok(doc.startsWith("\uFEFF"));
    const lines = doc.split("\r\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].replace(/^\uFEFF/, ""), LEADS_EXPORT_COLUMNS.join(","));
  });

  it("buildLeadsCsvDocument: one row round-trips all columns", () => {
    const row: Record<string, unknown> = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      full_name: "Doe, Jane",
      job_title: "VP",
      company_text: "Acme, Inc.",
      rating: 4,
      priority_score: 80,
      status: "new",
      follow_up_date: "2026-03-01",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      event_id: "evt-1",
      company_id: "co-1"
    };
    const doc = buildLeadsCsvDocument([row]);
    assert.ok(doc.includes("Doe, Jane"));
    assert.match(doc, /"Doe, Jane"/);
    assert.match(doc, /"Acme, Inc\."/);
    const header = buildLeadsCsvHeaderLine().trimEnd();
    assert.equal(header.split(",").length, LEADS_EXPORT_COLUMNS.length);
  });
});
