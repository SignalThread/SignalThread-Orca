// Phase 2 Budget import: flexible, synonym-driven mapping + sheet picker.
// Exercises the mapping layer (lib/budget-import-mapping) on top of the shared
// import foundation, plus the (server-shared) validator in lib/budget-import.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BUDGET_IMPORT_COLUMNS,
  buildBudgetImportSuccessOutcome,
  validateBudgetImportRows,
  type BudgetImportDraftRow,
} from "@/lib/budget-import";
import {
  BUDGET_IMPORT_FIELD_SPECS,
  buildBudgetDraftRows,
  buildBudgetInitialMapping,
  detectNotesColumns,
  mappedRowToDraftRow,
  validateBudgetMapping,
  type BudgetImportField,
} from "@/lib/budget-import-mapping";
import { parseCsv, parseWorkbookBytes, summarizeWorkbookBytes } from "@/lib/import";

function fixtureBytes(name: string): Uint8Array | null {
  const path = fileURLToPath(new URL(`../import-fixtures/event-upload/${name}`, import.meta.url));
  if (!existsSync(path)) return null;
  return new Uint8Array(readFileSync(path));
}

// Mirrors the real Detailed_Budget "Detailed Budget" sheet header order.
const FIXTURE_HEADER = "Category,Subcategory,Planned,Actual,Variance,Notes";

function fixtureStyleSheet() {
  return parseCsv(
    [
      FIXTURE_HEADER,
      "Guest Rooms,Hotel room block,225000,,,Basic level cost",
      'AV,"Main stage, LED wall",12000,4200,-7800,Deposit paid',
    ].join("\n"),
  );
}

test("fixture-style headers auto-map Category/Subcategory/Planned/Actual; Variance ignored", () => {
  const sheet = fixtureStyleSheet();
  const mapping = buildBudgetInitialMapping(sheet.columns);

  assert.equal(mapping["0:Category"], "category");
  assert.equal(mapping["1:Subcategory"], "subcategory");
  // "Planned" is a synonym for the forecast field.
  assert.equal(mapping["2:Planned"], "forecast");
  assert.equal(mapping["3:Actual"], "actual");
  // Variance has no field spec, so it stays unmapped (ignored).
  assert.equal(mapping["4:Variance"], "");
  // Notes is NOT a selectable target: it stays unmapped ("Do not import"), but
  // is still detected so the UI can show one informational notice.
  assert.equal(mapping["5:Notes"], "");
  assert.equal(detectNotesColumns(sheet.columns).length, 1);

  // A source without a cost identity is blocked until the planner maps Line Item.
  assert.ok(validateBudgetMapping(mapping).some((error) => /Line Item/.test(error)));
});

test("Notes is not a selectable mapping target", () => {
  // No field spec advertises notes; the dropdown is built from these specs.
  assert.ok(!BUDGET_IMPORT_FIELD_SPECS.some((spec) => spec.field === ("notes" as BudgetImportField)));

  // Even a header literally named "Notes" is auto-set to "Do not import".
  const sheet = parseCsv("Category,Planned,Notes\nF&B,4500,hello");
  const mapping = buildBudgetInitialMapping(sheet.columns);
  assert.equal(mapping["2:Notes"], "");
  assert.ok(!Object.values(mapping).includes("notes" as BudgetImportField));
});

test("a detected Notes column produces a single top-level notice, never per-row warnings", () => {
  const sheet = fixtureStyleSheet();
  // detectNotesColumns is the single signal the UI uses for one notice.
  assert.equal(detectNotesColumns(sheet.columns).length, 1);

  const mapping = buildBudgetInitialMapping(sheet.columns);
  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });

  // No row carries a Notes warning; warnings stay clean.
  assert.equal(result.warningCount, 0);
  assert.ok(result.rows.every((row) => row.warnings.length === 0));
});

test("ignored Notes on exact-template rows is one top-level count, not per-row warnings", () => {
  // Simulates the exact-template CSV path where Notes IS carried into drafts.
  const rows: BudgetImportDraftRow[] = [
    { Category: "F&B", Session: "", Group: "", Subcategory: "", "Line Item": "Breakfast", Vendor: "", Forecast: "10", Actual: "", Status: "", Notes: "n1" },
    { Category: "AV", Session: "", Group: "", Subcategory: "", "Line Item": "Stage", Vendor: "", Forecast: "20", Actual: "", Status: "", Notes: "n2" },
  ];
  const result = validateBudgetImportRows(rows);
  assert.equal(result.validCount, 2);
  assert.equal(result.notesIgnoredCount, 2);
  // The noisy per-row warnings are gone; warningCount reflects only real ones.
  assert.equal(result.warningCount, 0);
  assert.ok(result.rows.every((row) => row.warnings.length === 0));
});

test("budget import normalizes old category aliases to the new category labels", () => {
  const rows: BudgetImportDraftRow[] = [
    { Category: "Decor", Session: "", Group: "", Subcategory: "", "Line Item": "Backdrop", Vendor: "", Forecast: "10", Actual: "", Status: "", Notes: "" },
    { Category: "Food & Beverage", Session: "", Group: "", Subcategory: "", "Line Item": "Coffee", Vendor: "", Forecast: "20", Actual: "", Status: "", Notes: "" },
    { Category: "AV", Session: "", Group: "", Subcategory: "", "Line Item": "Stage", Vendor: "", Forecast: "30", Actual: "", Status: "", Notes: "" },
  ];
  const result = validateBudgetImportRows(rows);
  assert.equal(result.validCount, 3);
  assert.deepEqual(
    result.validRows.map((row) => row.category),
    ["Décor & Branding", "F&B", "AV & Production"],
  );
});

test("Planned maps to forecast even without an explicit Forecast column", () => {
  const sheet = parseCsv("Category,Planned\nF&B,4500");
  const mapping = buildBudgetInitialMapping(sheet.columns);
  assert.equal(mapping["1:Planned"], "forecast");
  assert.ok(validateBudgetMapping(mapping).some((error) => /Line Item/.test(error)));
});

test("Vendor is a selectable mapping destination with common supplier aliases", () => {
  const vendorSpec = BUDGET_IMPORT_FIELD_SPECS.find((spec) => spec.field === "vendor");
  assert.ok(vendorSpec, "Vendor should be available in the mapping dropdown");
  assert.equal(vendorSpec.label, "Vendor");

  for (const header of ["Vendor", "Supplier", "Vendor name", "Supplier name"]) {
    const sheet = parseCsv(`Category,Line Item,Planned,${header}\nF&B,Catering,4500,Sunrise Catering`);
    const mapping = buildBudgetInitialMapping(sheet.columns);
    assert.equal(mapping[`3:${header}`], "vendor", `${header} should map to Vendor`);
  }
});

test("mapped and blank vendor values stay on the canonical import row without creating related records", () => {
  const sheet = parseCsv(
    "Category,Line Item,Planned,Supplier\nF&B,Catering,4500,Sunrise Catering\nAV,Stage,12000,",
  );
  const mapping = buildBudgetInitialMapping(sheet.columns);
  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });

  assert.equal(result.validCount, 2);
  assert.equal(result.rows[0].normalized?.vendor, "Sunrise Catering");
  assert.equal(result.rows[1].normalized?.vendor, undefined);
  assert.equal("vendorId" in (result.rows[0].normalized ?? {}), false);
});

test("Variance is never required, but Line Item still is", () => {
  const sheet = parseCsv("Category,Subcategory,Planned,Variance\nF&B,Catering,4500,999");
  const mapping = buildBudgetInitialMapping(sheet.columns);
  assert.equal(mapping["3:Variance"], "");
  assert.ok(validateBudgetMapping(mapping).some((error) => /Line Item/.test(error)));

  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
});

test("blank Actual is allowed and normalizes to zero cents", () => {
  const result = validateBudgetImportRows([
    {
      Category: "Housing", Session: "", Group: "", Subcategory: "Rooms", "Line Item": "Guest room block",
      Vendor: "", Forecast: "225000", Actual: "", Status: "", Notes: "",
    },
  ]);

  const guestRooms = result.rows[0];
  assert.equal(guestRooms.isValid, true);
  assert.equal(guestRooms.normalized?.actualCents, 0);
  assert.equal(guestRooms.normalized?.forecastCents, 22500000);
  assert.equal(guestRooms.rowNumber, 2);
});

test("Line Item is required and never falls back to Subcategory", () => {
  // No Line Item column at all (the real fixture has none).
  const sheet = parseCsv("Category,Subcategory,Planned\nGuest Rooms,Hotel block,225000");
  const mapping = buildBudgetInitialMapping(sheet.columns);
  assert.equal(mapping["2:Planned"], "forecast");
  assert.ok(!Object.values(mapping).includes("lineItem"));

  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });

  assert.equal(result.validCount, 0);
  const row = result.rows[0];
  assert.equal(row.normalized, undefined);
  assert.ok(row.errors.includes("Line Item is required."));
});

test("a row with neither Line Item nor Subcategory (and no Planned) is invalid", () => {
  // Only Category + Planned, no Line Item and no Subcategory -> no line item
  // fallback source, so the row is invalid.
  const sheet = parseCsv("Category,Planned\nF&B,4500");
  const mapping = buildBudgetInitialMapping(sheet.columns);
  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.ok(result.rows[0].errors.some((error) => /Line Item is required/.test(error)));

  // Also missing the required Planned/Forecast amount -> still invalid (this is
  // exactly what the server re-validates on the same code path).
  const missingForecast: BudgetImportDraftRow[] = [
    {
      Category: "F&B",
      Session: "",
      Group: "",
      Subcategory: "",
      "Line Item": "",
      Vendor: "",
      Forecast: "",
      Actual: "",
      Status: "",
      Notes: "",
    },
  ];
  const invalid = validateBudgetImportRows(missingForecast);
  assert.equal(invalid.validCount, 0);
  assert.equal(invalid.invalidCount, 1);
  assert.ok(invalid.rows[0].errors.some((error) => /Planned\/Forecast/.test(error)));
  assert.ok(invalid.rows[0].errors.some((error) => /Line Item is required/.test(error)));
});

test("server-side validation rejects non-numeric and negative amounts", () => {
  const rows: BudgetImportDraftRow[] = [
    {
      Category: "AV & Production",
      Session: "",
      Group: "",
      Subcategory: "",
      "Line Item": "Stage",
      Vendor: "",
      Forecast: "not-a-number",
      Actual: "",
      Status: "",
      Notes: "",
    },
    {
      Category: "AV & Production",
      Session: "",
      Group: "",
      Subcategory: "",
      "Line Item": "Lights",
      Vendor: "",
      Forecast: "-5",
      Actual: "",
      Status: "",
      Notes: "",
    },
  ];
  const result = validateBudgetImportRows(rows);
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 2);
});

test("mappedRowToDraftRow projects fields onto canonical column keys", () => {
  const draft = mappedRowToDraftRow({
    rowNumber: 7,
    category: "F&B",
    subcategory: "Catering",
    forecast: "4500",
  } as Record<BudgetImportField, string> & { rowNumber: number });

  assert.equal(draft.Category, "F&B");
  assert.equal(draft.Subcategory, "Catering");
  assert.equal(draft.Forecast, "4500");
  assert.equal(draft["Line Item"], "");
  assert.equal(draft.Actual, "");
});

test("blank source rows are dropped before validation", () => {
  const sheet = parseCsv("Category,Subcategory,Planned\nF&B,Catering,4500\n,,\nAV,Stage,12000");
  const mapping = buildBudgetInitialMapping(sheet.columns);
  const { draftRows } = buildBudgetDraftRows(sheet, mapping);
  // The fully blank middle row is excluded by buildMappedRows.
  assert.equal(draftRows.length, 2);
});

test("existing exact-template headers still map cleanly and import", () => {
  const header = BUDGET_IMPORT_COLUMNS.join(",");
  const sheet = parseCsv(
    [
      header,
      "F&B,Opening Keynote,Day 1 Catering,Catering,Breakfast,Sunrise,4500,4200,Committed,Continental",
    ].join("\n"),
  );
  const mapping = buildBudgetInitialMapping(sheet.columns);

  // Every template column auto-maps to its field (Session/Group now precede Subcategory).
  assert.equal(mapping["0:Category"], "category");
  assert.equal(mapping["1:Session"], "session");
  assert.equal(mapping["2:Group"], "group");
  assert.equal(mapping["3:Subcategory"], "subcategory");
  assert.equal(mapping["4:Line Item"], "lineItem");
  assert.equal(mapping["5:Vendor"], "vendor");
  assert.equal(mapping["6:Forecast"], "forecast");
  assert.equal(mapping["7:Actual"], "actual");
  assert.equal(mapping["8:Status"], "status");
  // Notes is detected for the notice but is never a mapping target.
  assert.equal(mapping["9:Notes"], "");
  assert.equal(detectNotesColumns(sheet.columns).length, 1);

  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });
  assert.equal(result.validCount, 1);
  const row = result.rows[0];
  assert.equal(row.normalized?.lineItem, "Breakfast");
  assert.equal(row.normalized?.status, "COMMITTED");
  // Notes isn't mapped, so it isn't carried into drafts and raises no warning.
  assert.deepEqual(row.warnings, []);
  assert.equal(result.warningCount, 0);
});

// --- Multi-sheet workbook detection + sheet selection (real fixture) ---

const FIXTURE_NAME = "Detailed_Budget.xlsx";

test("multi-sheet workbook is detected (Detailed_Budget fixture)", async (t) => {
  const bytes = fixtureBytes(FIXTURE_NAME);
  if (!bytes) {
    t.skip(`${FIXTURE_NAME} fixture not present`);
    return;
  }

  const summaries = await summarizeWorkbookBytes(bytes);
  assert.ok(summaries.length > 1, "expected more than one sheet -> sheet picker");
  const budgetSheet = summaries.find((sheet) => /budget/i.test(sheet.name));
  assert.ok(budgetSheet);
  assert.deepEqual(
    budgetSheet!.headers,
    ["Category", "Subcategory", "Planned", "Actual", "Variance", "Notes"],
  );
});

test("selecting the budget sheet maps and validates; the F&B sheet needs manual mapping", async (t) => {
  const bytes = fixtureBytes(FIXTURE_NAME);
  if (!bytes) {
    t.skip(`${FIXTURE_NAME} fixture not present`);
    return;
  }

  const workbook = await parseWorkbookBytes(bytes);
  const budgetSheet = workbook.sheets.find((sheet) =>
    sheet.columns.some((column) => /planned/i.test(column.header)),
  );
  assert.ok(budgetSheet, "expected a sheet with a Planned column");

  const mapping = buildBudgetInitialMapping(budgetSheet!.columns);
  assert.ok(validateBudgetMapping(mapping).some((error) => /Line Item/.test(error)));

  const { draftRows, rowNumbers } = buildBudgetDraftRows(budgetSheet!, mapping);
  const result = validateBudgetImportRows(draftRows, { rowNumbers });
  assert.equal(result.validCount, 0, "budget sheet without Line Item should require explicit mapping");

  // The other sheet ("Detailed F&B Budget": Function, Component, Base Cost, ...)
  // does not auto-map Category or Planned, so the picker would surface mapping
  // errors until the user maps them by hand.
  const otherSheet = workbook.sheets.find((sheet) => sheet.name !== budgetSheet!.name);
  assert.ok(otherSheet);
  const otherMapping = buildBudgetInitialMapping(otherSheet!.columns);
  assert.ok(validateBudgetMapping(otherMapping).length > 0);
});

// --- Issue 1: post-import success outcome (close modal, never trap) ---

test("a successful import always closes the modal (never traps in a reset state)", () => {
  // Single-sheet and multi-sheet workbooks both close by default.
  assert.equal(
    buildBudgetImportSuccessOutcome({ importedCount: 5, skippedCount: 0, hasOtherSheets: false }).closeModal,
    true,
  );
  assert.equal(
    buildBudgetImportSuccessOutcome({ importedCount: 5, skippedCount: 0, hasOtherSheets: true }).closeModal,
    true,
  );
});

test("success message includes imported and skipped counts", () => {
  const outcome = buildBudgetImportSuccessOutcome({ importedCount: 76, skippedCount: 2, hasOtherSheets: false });
  assert.equal(outcome.noticeTitle, "Budget uploaded");
  assert.match(outcome.noticeDetail, /Imported 76 line items/);
  assert.match(outcome.noticeDetail, /skipped 2 invalid rows/);
});

test("success message omits skipped phrasing when nothing was skipped", () => {
  const outcome = buildBudgetImportSuccessOutcome({ importedCount: 1, skippedCount: 0, hasOtherSheets: false });
  assert.match(outcome.noticeDetail, /Imported 1 line item\./);
  assert.ok(!/skipped/.test(outcome.noticeDetail));
  assert.match(outcome.noticeDetail, /No additional save needed\./);
});

test("multi-sheet workbook success explains only the selected sheet was imported", () => {
  const outcome = buildBudgetImportSuccessOutcome({ importedCount: 40, skippedCount: 0, hasOtherSheets: true });
  assert.match(outcome.noticeDetail, /Only the selected sheet was imported/);
  assert.match(outcome.noticeDetail, /reopen Import to add another sheet/);
});

// --- Issue 5: only the selected sheet is mapped/imported (never both) ---

test("mapped rows come only from the selected sheet, excluding the other sheet's rows", async (t) => {
  const bytes = fixtureBytes(FIXTURE_NAME);
  if (!bytes) {
    t.skip(`${FIXTURE_NAME} fixture not present`);
    return;
  }

  const workbook = await parseWorkbookBytes(bytes);
  const budgetSheet = workbook.sheets.find((sheet) =>
    sheet.columns.some((column) => /planned/i.test(column.header)),
  );
  const fnbSheet = workbook.sheets.find((sheet) => sheet.name !== budgetSheet!.name);
  assert.ok(budgetSheet && fnbSheet);

  const mapping = buildBudgetInitialMapping(budgetSheet!.columns);
  const { draftRows } = buildBudgetDraftRows(budgetSheet!, mapping);

  // Exactly the budget sheet's data rows — never budget + F&B combined.
  assert.equal(draftRows.length, budgetSheet!.rowCount);
  assert.notEqual(draftRows.length, budgetSheet!.rowCount + fnbSheet!.rowCount);

  // None of the F&B-only function names leak into the budget draft rows.
  const draftBlob = JSON.stringify(draftRows);
  assert.ok(!/AM Coffee/i.test(draftBlob), "F&B sheet content must not appear in budget draft rows");
});

test("the Detailed_Budget workbook yields 78 import rows (not 111 across both sheets)", async (t) => {
  const bytes = fixtureBytes(FIXTURE_NAME);
  if (!bytes) {
    t.skip(`${FIXTURE_NAME} fixture not present`);
    return;
  }

  const workbook = await parseWorkbookBytes(bytes);
  const budgetSheet = workbook.sheets.find((sheet) =>
    sheet.columns.some((column) => /planned/i.test(column.header)),
  );
  const secondSheet = workbook.sheets.find((sheet) => sheet.name !== budgetSheet?.name);
  const mapping = buildBudgetInitialMapping(budgetSheet!.columns);
  const { draftRows, rowNumbers } = buildBudgetDraftRows(budgetSheet!, mapping);

  // 78 rows from "Detailed Budget" is correct; 111 (78 + 33 F&B) is the bug.
  assert.equal(draftRows.length, 78);
  assert.equal(rowNumbers.length, 78);
  assert.ok(secondSheet);
  assert.equal(draftRows.length + secondSheet!.rowCount, 111);
});
