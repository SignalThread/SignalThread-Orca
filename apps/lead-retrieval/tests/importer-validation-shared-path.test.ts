import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { deriveImportBatchValidation } from "../lib/import-wizard/import-batch-validation-derive";
import { suggestMappingsFromHeaders } from "../lib/import-wizard/field-mapping-suggest";
import { fetchGoogleSheetCsvForImport } from "../lib/import-wizard/google-sheets";
import { parseImportFileHeadersAndAllDataRows } from "../lib/import-wizard/parse-import-file";
import { parseCsvHeadersAndAllDataRows } from "../lib/import-wizard/parse-csv-sample";

function validate(parsed: { headers: string[]; dataRows: string[][] }) {
  return deriveImportBatchValidation({
    csv_headers: parsed.headers,
    selections: suggestMappingsFromHeaders(parsed.headers),
    staged_rows: parsed.dataRows,
  });
}

test("Google Sheets uses the shared validator and blocks surname-only rows", async () => {
  const result = await fetchGoogleSheetCsvForImport(
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit",
    async () => new Response("Last Name,Company\nAdams,Acme", { status: 200 })
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    const validation = validate(result.parsed);
    assert.equal(validation.rowsWithMustFix, 1);
    assert.equal(validation.continueAllowed, false);
  }
});

test("CSV uses the shared validator and accepts First + Last + Company", () => {
  const validation = validate(parseCsvHeadersAndAllDataRows("First Name,Last Name,Company\nSarah,Meister,Acme"));
  assert.equal(validation.rowsWithMustFix, 0);
  assert.equal(validation.continueAllowed, true);
});

test("XLSX uses the shared validator and blocks first-name-only rows", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["First Name", "Company"], ["Sarah", "Acme"]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
  const file = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "leads.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const validation = validate(await parseImportFileHeadersAndAllDataRows(file));
  assert.equal(validation.rowsWithMustFix, 1);
  assert.equal(validation.continueAllowed, false);
});
