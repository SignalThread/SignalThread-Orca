import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { tokenizeDelimited } from "./csv";
import {
  buildInitialMapping,
  buildMappedRows,
  buildSheet,
  parseCsv,
  suggestField,
  validateMapping,
} from "./mapping";
import {
  matchStatus,
  normalizeEnumValue,
  parseCurrencyToCents,
  parseDateToIso,
  parseNumber,
  parsePercentToFraction,
  parseTimeTo24h,
  splitList,
} from "./normalize";
import { createImportSummary, summarizeRowResults } from "./summary";
import { parseWorkbookBytes, summarizeWorkbookBytes } from "./workbook";
import type { ImportFieldSpec } from "./types";

type DemoField = "category" | "planned" | "actual" | "notes";

const DEMO_SPECS: ImportFieldSpec<DemoField>[] = [
  { field: "category", label: "Category", required: true, synonyms: ["category", "cat"] },
  { field: "planned", label: "Planned", required: true, synonyms: ["planned", "budgeted", "forecast"] },
  { field: "actual", label: "Actual", synonyms: ["actual", "spent"] },
  { field: "notes", label: "Notes", synonyms: ["notes", "comment", "comments"] },
];

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../../import-fixtures/event-upload/${name}`, import.meta.url));
}

function fixtureBytes(name: string): Uint8Array | null {
  const path = fixturePath(name);
  if (!existsSync(path)) return null;
  return new Uint8Array(readFileSync(path));
}

test("tokenizeDelimited handles quotes, escaped quotes, CRLF, and BOM", () => {
  const rows = tokenizeDelimited('﻿a,b\r\n"x,y","he said ""hi""",z');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].values, ["a", "b"]);
  assert.deepEqual(rows[1].values, ["x,y", 'he said "hi"', "z"]);
  assert.equal(rows[0].rowNumber, 1);
  assert.equal(rows[1].rowNumber, 2);
});

test("tokenizeDelimited throws on an unterminated quote", () => {
  assert.throws(() => tokenizeDelimited('a,"b'), /unterminated quoted field/);
});

test("parseCsv exposes headers, data rows, row count, and sample values", () => {
  const sheet = parseCsv("Category,Planned,Notes\nF&B,4500,Dinner\nAV,,\nRooms,78000,Block");
  assert.equal(sheet.name, "CSV");
  assert.deepEqual(sheet.columns.map((column) => column.header), ["Category", "Planned", "Notes"]);
  assert.equal(sheet.rowCount, 3);
  // Samples are non-empty trimmed values only.
  assert.deepEqual(sheet.columns[1].samples, ["4500", "78000"]);
  assert.equal(sheet.rows[0].rowNumber, 2);
});

test("buildSheet flags duplicate headers and warns once", () => {
  const sheet = buildSheet("CSV", tokenizeDelimited("Name,Email,Email\nA,a@x.com,b@x.com"));
  assert.equal(sheet.columns[1].duplicateHeader, true);
  assert.equal(sheet.columns[2].duplicateHeader, true);
  assert.equal(sheet.columns[0].duplicateHeader, false);
  assert.equal(sheet.warnings.length, 1);
  assert.match(sheet.warnings[0], /Duplicate headers/);
});

test("suggestField maps via synonyms and never double-maps", () => {
  const mapped = new Set<DemoField>();
  assert.equal(suggestField("Budgeted", DEMO_SPECS, mapped), "planned");
  // "forecast" is another synonym for planned, but planned is already taken.
  assert.equal(suggestField("Forecast", DEMO_SPECS, mapped), "");
  assert.equal(suggestField("Unknown Column", DEMO_SPECS, mapped), "");
});

test("buildInitialMapping suggests a sensible mapping across columns", () => {
  const sheet = parseCsv("Cat,Planned,Spent,Comments\nF&B,1,2,hi");
  const mapping = buildInitialMapping(sheet.columns, DEMO_SPECS);
  assert.deepEqual(mapping, {
    "0:Cat": "category",
    "1:Planned": "planned",
    "2:Spent": "actual",
    "3:Comments": "notes",
  });
});

test("validateMapping enforces required fields and rejects duplicate mappings", () => {
  const missing = validateMapping({ "0:Cat": "category" }, DEMO_SPECS);
  assert.deepEqual(missing, ["Map one column to Planned."]);

  const dupes = validateMapping(
    { "0:A": "category", "1:B": "planned", "2:C": "planned" },
    DEMO_SPECS,
  );
  assert.equal(dupes.length, 1);
  assert.match(dupes[0], /Each field can only be mapped once\. Duplicates: Planned\./);

  assert.deepEqual(validateMapping({ "0:A": "category", "1:B": "planned" }, DEMO_SPECS), []);
});

test("buildMappedRows trims values, skips blank rows, and keys by field", () => {
  const sheet = parseCsv("Cat,Planned,Spent\n F&B , 4500 ,\n,,\nAV,12000,0");
  const mapping = { "0:Cat": "category" as const, "1:Planned": "planned" as const, "2:Spent": "actual" as const };
  const rows = buildMappedRows(sheet, mapping);
  assert.equal(rows.length, 2); // fully blank row skipped
  assert.deepEqual(rows[0], { rowNumber: 2, category: "F&B", planned: "4500" });
  assert.deepEqual(rows[1], { rowNumber: 4, category: "AV", planned: "12000", actual: "0" });
});

test("normalizers cover currency, number, date, time, percent, status, and lists", () => {
  assert.equal(parseCurrencyToCents("$1,200.50"), 120050);
  assert.equal(parseCurrencyToCents(""), null);
  assert.equal(parseCurrencyToCents("abc"), null);
  assert.equal(parseNumber("78,000"), 78000);

  assert.equal(parseDateToIso("2027-01-25"), "2027-01-25");
  assert.equal(parseDateToIso("1/25/2027"), "2027-01-25");
  assert.equal(parseDateToIso("2027-13-01"), null);
  assert.equal(parseDateToIso("not a date"), null);

  assert.equal(parseTimeTo24h("07:00"), "07:00");
  assert.equal(parseTimeTo24h("7:00 AM"), "07:00");
  assert.equal(parseTimeTo24h("2:30 pm"), "14:30");
  assert.equal(parseTimeTo24h("14:30"), "14:30");
  assert.equal(parseTimeTo24h("25:00"), null);

  assert.equal(parsePercentToFraction("22%"), 0.22);
  assert.equal(parsePercentToFraction("8%"), 0.08);
  assert.equal(parsePercentToFraction("0.22"), 0.22);
  assert.equal(parsePercentToFraction("nope"), null);

  assert.equal(normalizeEnumValue("Not Started"), "NOT_STARTED");
  assert.equal(matchStatus("not started", ["NOT_STARTED", "IN_PROGRESS"]), "NOT_STARTED");
  assert.equal(matchStatus("done", ["NOT_STARTED", "IN_PROGRESS"]), null);

  assert.deepEqual(splitList("CEO, CRO; Host"), ["CEO", "CRO", "Host"]);
  assert.deepEqual(splitList("  "), []);
});

test("import summary helpers produce the shared shape", () => {
  assert.deepEqual(createImportSummary(), {
    imported: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
  });

  const counts = summarizeRowResults([
    { rowNumber: 2, isBlank: false, isValid: true, errors: [], warnings: ["w"] },
    { rowNumber: 3, isBlank: false, isValid: false, errors: ["e"], warnings: [] },
    { rowNumber: 4, isBlank: true, isValid: false, errors: [], warnings: [] },
  ]);
  assert.deepEqual(counts, { validCount: 1, invalidCount: 1, blankCount: 1, warningCount: 1 });
});

test("parseWorkbookBytes discovers multiple sheets in the Budget fixture", async (t) => {
  const bytes = fixtureBytes("Detailed_Budget.xlsx");
  if (!bytes) {
    t.skip("Detailed_Budget.xlsx fixture not present");
    return;
  }

  const workbook = await parseWorkbookBytes(bytes);
  assert.deepEqual(workbook.sheetNames, ["Detailed Budget", "Detailed F&B Budget"]);

  const budgetSheet = workbook.sheets.find((sheet) => sheet.name === "Detailed Budget")!;
  assert.deepEqual(budgetSheet.columns.map((column) => column.header), [
    "Category",
    "Subcategory",
    "Planned",
    "Actual",
    "Variance",
    "Notes",
  ]);
  assert.ok(budgetSheet.rowCount > 0);

  const fnbSheet = workbook.sheets.find((sheet) => sheet.name === "Detailed F&B Budget")!;
  assert.ok(fnbSheet.columns.some((column) => column.header === "Service Charge (22%)"));
});

test("summarizeWorkbookBytes returns per-sheet name/rowCount/headers for Matrix + Timeline fixtures", async (t) => {
  const matrixBytes = fixtureBytes("Program_Matrix_Detailed.xlsx");
  if (matrixBytes) {
    const [matrixSheet] = await summarizeWorkbookBytes(matrixBytes);
    assert.equal(matrixSheet.name, "Program Matrix Detailed");
    assert.ok(matrixSheet.rowCount > 0);
    for (const header of ["Day", "Session", "Date", "Start Time", "End Time", "Room"]) {
      assert.ok(matrixSheet.headers.includes(header), `expected matrix header ${header}`);
    }
  } else {
    t.diagnostic("Program_Matrix_Detailed.xlsx fixture not present; skipping matrix assertions");
  }

  const timelineBytes = fixtureBytes("Detailed_Timeline.xlsx");
  if (timelineBytes) {
    const [timelineSheet] = await summarizeWorkbookBytes(timelineBytes);
    assert.equal(timelineSheet.name, "Detailed Timeline");
    assert.deepEqual(timelineSheet.headers, ["Month", "Task", "Due Date", "Responsible Party", "Status"]);
  } else {
    t.diagnostic("Detailed_Timeline.xlsx fixture not present; skipping timeline assertions");
  }
});
