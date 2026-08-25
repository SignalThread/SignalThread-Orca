// Flexible, synonym-driven mapping for the Budget section importer.
//
// Builds on the shared import foundation (lib/import) so Budget no longer
// requires an exact header row. Detected spreadsheet/CSV columns are mapped to
// canonical Budget fields, then projected onto the existing
// `BudgetImportDraftRow` shape so the established validator + server route keep
// working unchanged. This is NOT a global Event Upload wizard.

import {
  buildInitialMapping,
  buildMappedRows,
  normalizeHeader,
  validateMapping,
  type ImportColumn,
  type ImportFieldSpec,
  type ImportMapping,
  type MappedRow,
  type ParsedSheet,
} from "@/lib/import";
import {
  emptyBudgetDraftRow,
  type BudgetImportColumn,
  type BudgetImportDraftRow,
} from "@/lib/budget-import";

/**
 * Canonical Budget target fields the mapping UI can assign columns to.
 * Notes is intentionally NOT a target: BudgetLineItem has no notes column, so a
 * Notes column is detected (see {@link detectNotesColumns}) for an informational
 * notice but is never imported. Variance is likewise absent — it is calculated.
 */
export type BudgetImportField =
  | "category"
  | "session"
  | "group"
  | "subcategory"
  | "lineItem"
  | "vendor"
  | "forecast"
  | "actual"
  | "status";

/** Header synonyms used to DETECT (not map) a Notes column for the notice. */
export const BUDGET_NOTES_SYNONYMS = ["notes", "note", "comment", "comments", "remarks", "memo"];

/**
 * Field specs with synonyms for auto-detection. Category and Planned/Forecast
 * are required. Line Item is the required identity of each imported cost;
 * Subcategory remains optional legacy classification. Variance and Notes are intentionally absent as targets — Variance
 * is calculated by the app and Notes are not persisted, so those columns simply
 * stay unmapped ("Do not import").
 */
export const BUDGET_IMPORT_FIELD_SPECS: ImportFieldSpec<BudgetImportField>[] = [
  {
    field: "category",
    label: "Category",
    required: true,
    synonyms: ["category", "cat", "budget category", "expense category", "cost category"],
  },
  {
    field: "session",
    label: "Session",
    synonyms: ["session", "run of show", "agenda item", "agenda", "session name", "session title"],
  },
  {
    field: "group",
    label: "Group",
    synonyms: ["group", "grouping", "budget group"],
  },
  {
    field: "subcategory",
    label: "Subcategory (legacy)",
    synonyms: ["subcategory", "sub category", "sub-category"],
  },
  {
    field: "lineItem",
    label: "Line Item",
    required: true,
    synonyms: ["line item", "item", "description", "detail", "expense", "expense item", "name"],
  },
  {
    field: "vendor",
    label: "Vendor",
    synonyms: ["vendor", "vendor name", "supplier", "supplier name", "payee", "provider"],
  },
  {
    field: "forecast",
    label: "Planned / Forecast",
    required: true,
    synonyms: [
      "forecast",
      "planned",
      "plan",
      "budget",
      "budgeted",
      "estimate",
      "estimated",
      "projected",
      "planned amount",
      "forecast amount",
      "planned cost",
      "budget amount",
      "estimated cost",
      "est cost",
    ],
  },
  {
    field: "actual",
    label: "Actual",
    synonyms: ["actual", "actuals", "spent", "actual amount", "actual cost", "paid"],
  },
  {
    field: "status",
    label: "Status",
    synonyms: ["status", "state", "stage"],
  },
];

/** Maps a canonical Budget field onto the legacy draft-row column key. */
const FIELD_TO_COLUMN: Record<BudgetImportField, BudgetImportColumn> = {
  category: "Category",
  session: "Session",
  group: "Group",
  subcategory: "Subcategory",
  lineItem: "Line Item",
  vendor: "Vendor",
  forecast: "Forecast",
  actual: "Actual",
  status: "Status",
};

/**
 * Detect columns that look like Notes so the UI can show a single informational
 * notice. These columns are not mapped to any Budget field (Notes is not a
 * target), so they default to "Do not import".
 */
export function detectNotesColumns(columns: ImportColumn[]): ImportColumn[] {
  const synonyms = new Set(BUDGET_NOTES_SYNONYMS.map((value) => normalizeHeader(value)));
  return columns.filter((column) => synonyms.has(normalizeHeader(column.header)));
}

const ALL_FIELDS = Object.keys(FIELD_TO_COLUMN) as BudgetImportField[];

/** Suggest an initial column -> field mapping for a sheet's columns. */
export function buildBudgetInitialMapping(
  columns: ImportColumn[],
): ImportMapping<BudgetImportField> {
  return buildInitialMapping(columns, BUDGET_IMPORT_FIELD_SPECS);
}

/** Validate a Budget mapping (required fields present, no field mapped twice). */
export function validateBudgetMapping(
  mapping: ImportMapping<BudgetImportField>,
): string[] {
  return validateMapping(mapping, BUDGET_IMPORT_FIELD_SPECS);
}

/** Project a single mapped row onto the legacy draft-row column shape. */
export function mappedRowToDraftRow(mapped: MappedRow<BudgetImportField>): BudgetImportDraftRow {
  const row = emptyBudgetDraftRow();
  for (const field of ALL_FIELDS) {
    const value = mapped[field];
    if (typeof value === "string") {
      row[FIELD_TO_COLUMN[field]] = value;
    }
  }
  return row;
}

/**
 * Apply a mapping to a parsed sheet, producing draft rows (for the existing
 * validator + server route) plus the originating source row numbers so preview
 * and error messages can reference the real spreadsheet line.
 */
export function buildBudgetDraftRows(
  sheet: Pick<ParsedSheet, "columns" | "rows">,
  mapping: ImportMapping<BudgetImportField>,
): { draftRows: BudgetImportDraftRow[]; rowNumbers: number[] } {
  const mappedRows = buildMappedRows(sheet, mapping);
  return {
    draftRows: mappedRows.map(mappedRowToDraftRow),
    rowNumbers: mappedRows.map((row) => row.rowNumber),
  };
}
