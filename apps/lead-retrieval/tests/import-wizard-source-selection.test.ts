import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

import { isSpreadsheetReadableForMapping } from "@/lib/import-wizard/csv-import-guard";
import {
  fetchGoogleSheetCsvForImport,
  GOOGLE_SHEETS_INACCESSIBLE_MESSAGE,
  normalizeGoogleSheetsUrl,
} from "@/lib/import-wizard/google-sheets";
import { parseImportFileHeadersAndAllDataRows } from "@/lib/import-wizard/parse-import-file";
import { IMPORT_SOURCE_OPTIONS } from "@/lib/import-wizard/source-types";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function fileFromWorkbook(bookType: "xlsx" | "xls") {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Full Name", "Email", "Company"],
    ["Ada Lovelace", "ada@example.com", "Analytical Engines"],
    ["Grace Hopper", "grace@example.com", "Compiler Co"]
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType });
  const mime =
    bookType === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.ms-excel";
  return new File([buffer], `leads.${bookType}`, { type: mime });
}

test("source UI has one primary Upload lead data path and copy is not CSV-only", () => {
  const spreadsheet = IMPORT_SOURCE_OPTIONS.find((option) => option.id === "csv");
  assert.equal(spreadsheet?.title, "Upload lead data");
  assert.equal(spreadsheet?.description, "Upload a CSV or Excel file, or paste a Google Sheets link.");
  assert.equal(spreadsheet?.available, true);
  assert.equal(spreadsheet?.recommended, true);
});

test("Google Sheets is not a separate primary source card", () => {
  assert.equal(IMPORT_SOURCE_OPTIONS.some((option) => String(option.id) === "google_sheets"), false);
  assert.equal(IMPORT_SOURCE_OPTIONS.filter((option) => option.available).length, 1);
});

test("file input accepts csv, xlsx, and xls extensions and MIME types", () => {
  const source = read("components/import-wizard/steps/source-selection-step.tsx");
  assert.match(source, /accept="[^"]*\.csv[^"]*\.xlsx[^"]*\.xls/);
  assert.match(source, /application\/vnd\.ms-excel/);
  assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});

test("upload UI copy advertises supported spreadsheet formats without CSV-only CTA", () => {
  const source = read("components/import-wizard/steps/source-selection-step.tsx");
  assert.match(source, /Supported formats: CSV, XLSX, XLS \(max 50MB\), and public Google Sheets links\./);
  assert.match(source, /Choose a lead data file to continue/);
  assert.doesNotMatch(source, /Choose a CSV file to continue/);
  assert.doesNotMatch(source, /Not ready — use a \.csv file/);
});

test("Google Sheets link state is inline and enabled", () => {
  const source = read("components/import-wizard/steps/source-selection-step.tsx");
  assert.match(source, /data-testid="import-wizard-google-sheets-inline"/);
  assert.match(source, /placeholder="Paste a Google Sheets link"/);
  assert.match(source, /Use a Google Sheet that is shared with anyone who has the link\./);
  assert.match(source, /Import from Google Sheets/);
  assert.doesNotMatch(source, /Shared-link import is not enabled yet/);
  assert.doesNotMatch(source, /Coming Soon/);
});

test("spreadsheet guard accepts csv, xlsx, and xls files", () => {
  assert.equal(isSpreadsheetReadableForMapping(new File(["a,b\n1,2"], "leads.csv", { type: "text/csv" })), true);
  assert.equal(isSpreadsheetReadableForMapping(fileFromWorkbook("xlsx")), true);
  assert.equal(isSpreadsheetReadableForMapping(fileFromWorkbook("xls")), true);
});

test("Excel .xlsx file path parses real uploaded headers and rows", async () => {
  const parsed = await parseImportFileHeadersAndAllDataRows(fileFromWorkbook("xlsx"));
  assert.deepEqual(parsed.headers, ["Full Name", "Email", "Company"]);
  assert.deepEqual(parsed.dataRows[0], ["Ada Lovelace", "ada@example.com", "Analytical Engines"]);
  assert.deepEqual(parsed.dataRows[1], ["Grace Hopper", "grace@example.com", "Compiler Co"]);
});

test("Excel .xls file path parses real uploaded headers and rows", async () => {
  const parsed = await parseImportFileHeadersAndAllDataRows(fileFromWorkbook("xls"));
  assert.deepEqual(parsed.headers, ["Full Name", "Email", "Company"]);
  assert.deepEqual(parsed.dataRows[0], ["Ada Lovelace", "ada@example.com", "Analytical Engines"]);
});

test("Google Sheets URL normalization builds CSV export URLs", () => {
  const normalized = normalizeGoogleSheetsUrl(
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=12345"
  );

  assert.equal(normalized?.spreadsheetId, "1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890");
  assert.equal(normalized?.gid, "12345");
  assert.equal(normalized?.published, false);
  assert.equal(
    normalized?.exportUrl,
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/export?format=csv"
  );
});

test("published Google Sheets URL normalization builds public CSV URLs", () => {
  const normalized = normalizeGoogleSheetsUrl(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vPublishedSheetId/pubhtml?gid=67890&single=true"
  );

  assert.equal(normalized?.spreadsheetId, "2PACX-1vPublishedSheetId");
  assert.equal(normalized?.gid, "67890");
  assert.equal(normalized?.published, true);
  assert.equal(
    normalized?.exportUrl,
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vPublishedSheetId/pub?output=csv"
  );
});

test("Google Sheets URL normalization rejects non-Sheets URLs", () => {
  assert.equal(normalizeGoogleSheetsUrl("https://example.com/spreadsheets/d/1234567890/edit"), null);
  assert.equal(normalizeGoogleSheetsUrl("https://docs.google.com/document/d/1234567890/edit"), null);
  assert.equal(normalizeGoogleSheetsUrl("not a url"), null);
});

test("Google Sheets URL normalization supports account-scoped Sheets URLs", () => {
  const normalized = normalizeGoogleSheetsUrl(
    "https://docs.google.com/spreadsheets/u/0/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit"
  );

  assert.equal(
    normalized?.exportUrl,
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/export?format=csv"
  );
});

test("Google Sheets import fetches CSV and returns parsed headers and rows", async () => {
  let requestedUrl = "";
  const result = await fetchGoogleSheetCsvForImport(
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit",
    async (input) => {
      requestedUrl = String(input);
      return new Response("Full Name,Email\nAda Lovelace,ada@example.com", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      });
    }
  );

  assert.equal(requestedUrl, "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/export?format=csv");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.parsed.headers, ["Full Name", "Email"]);
    assert.deepEqual(result.parsed.dataRows, [["Ada Lovelace", "ada@example.com"]]);
  }
});

test("Google Sheets import returns validation error for invalid URL", async () => {
  const result = await fetchGoogleSheetCsvForImport("https://example.com/not-sheets", async () => {
    throw new Error("should not fetch");
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_url");
    assert.equal(result.error, "Paste a valid Google Sheets link.");
  }
});

test("Google Sheets import returns inaccessible message for private sheet responses", async () => {
  const result = await fetchGoogleSheetCsvForImport(
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit",
    async () =>
      new Response("<!doctype html><title>Sign in</title>", {
        status: 403,
        headers: { "Content-Type": "text/html" },
      })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "inaccessible");
    assert.equal(result.error, GOOGLE_SHEETS_INACCESSIBLE_MESSAGE);
  }
});

test("Google Sheets import returns empty-sheet and missing-header errors", async () => {
  const empty = await fetchGoogleSheetCsvForImport(
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit",
    async () => new Response("", { status: 200 })
  );
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.code, "empty_sheet");
    assert.equal(empty.error, "This Google Sheet has no rows.");
  }

  const missingHeaders = await fetchGoogleSheetCsvForImport(
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit",
    async () => new Response(",\nAda,ada@example.com", { status: 200 })
  );
  assert.equal(missingHeaders.ok, false);
  if (!missingHeaders.ok) {
    assert.equal(missingHeaders.code, "missing_headers");
    assert.equal(missingHeaders.error, "Could not detect a header row in this Google Sheet.");
  }
});
