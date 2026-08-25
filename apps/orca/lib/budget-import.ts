import { normalizeBudgetCategoryForStorage } from "@/lib/budget-category-filter";
import { parseBudgetCurrencyToCents } from "@/lib/budget-money";

export const BUDGET_IMPORT_COLUMNS = [
  "Category",
  "Session",
  "Group",
  "Subcategory",
  "Line Item",
  "Vendor",
  "Forecast",
  "Actual",
  "Status",
  "Notes",
] as const;

export type BudgetImportColumn = (typeof BUDGET_IMPORT_COLUMNS)[number];
export type BudgetImportStatus = "PLANNED" | "COMMITTED" | "PAID";

export type BudgetImportDraftRow = Record<BudgetImportColumn, string>;

export type BudgetImportNormalizedRow = {
  category: string;
  subcategory?: string;
  session?: string;
  group?: string;
  lineItem: string;
  vendor?: string;
  forecastCents: number;
  actualCents: number;
  status?: BudgetImportStatus;
  notes?: string;
};

export type BudgetImportValidatedRow = {
  rowNumber: number;
  raw: BudgetImportDraftRow;
  normalized?: BudgetImportNormalizedRow;
  isBlank: boolean;
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type BudgetImportValidationResult = {
  rows: BudgetImportValidatedRow[];
  validRows: BudgetImportNormalizedRow[];
  validCount: number;
  invalidCount: number;
  blankCount: number;
  /** Count of real, row-specific warnings the user needs to inspect. */
  warningCount: number;
  /** Rows that carried an ignored Notes value (one top-level notice). */
  notesIgnoredCount: number;
};

export type BudgetImportParseResult = {
  rows: BudgetImportDraftRow[];
  headerError: string | null;
};

const BUDGET_TEMPLATE_EXAMPLE_ROWS: BudgetImportDraftRow[] = [
  {
    Category: "F&B",
    Session: "Opening Keynote",
    Group: "Day 1 Catering",
    Subcategory: "Catering",
    "Line Item": "Breakfast - Day 1",
    Vendor: "Sunrise Catering",
    Forecast: "4500",
    Actual: "4200",
    Status: "Committed",
    Notes: "Continental breakfast for 300 attendees",
  },
  {
    Category: "AV & Production",
    Session: "Opening Keynote",
    Group: "",
    Subcategory: "Equipment",
    "Line Item": "Main Stage Setup",
    Vendor: "Brightline AV",
    Forecast: "12000",
    Actual: "0",
    Status: "Planned",
    Notes: "LED wall, confidence monitor, wireless mics",
  },
  {
    Category: "Housing",
    Session: "",
    Group: "",
    Subcategory: "Sleeping Rooms",
    "Line Item": "Guest Room Block",
    Vendor: "Grand City Hotel",
    Forecast: "78000",
    Actual: "0",
    Status: "Planned",
    Notes: "2 nights, 150 room block",
  },
];

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvRecords(csvText: string): { rows: string[][]; error: string | null } {
  const text = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentValue += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentValue += char;
  }

  if (inQuotes) {
    return {
      rows: [],
      error: "CSV parse error: unmatched quote detected.",
    };
  }

  currentRow.push(currentValue);
  const hasData = currentRow.some((cell) => cell.length > 0);
  if (hasData || rows.length === 0) {
    rows.push(currentRow);
  }

  return { rows, error: null };
}

const parseCurrencyToCents = (rawValue: string): number | null => parseBudgetCurrencyToCents(rawValue);

function normalizeStatus(rawValue: string): BudgetImportStatus | null {
  const normalized = rawValue
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");

  if (!normalized) return null;
  if (normalized === "PLANNED" || normalized === "COMMITTED" || normalized === "PAID") {
    return normalized;
  }

  return null;
}

export function emptyBudgetDraftRow(): BudgetImportDraftRow {
  return {
    Category: "",
    Session: "",
    Group: "",
    Subcategory: "",
    "Line Item": "",
    Vendor: "",
    Forecast: "",
    Actual: "",
    Status: "",
    Notes: "",
  };
}

export function buildBudgetImportTemplateCsv(): string {
  const header = BUDGET_IMPORT_COLUMNS.join(",");
  const lines = [header];

  for (const row of BUDGET_TEMPLATE_EXAMPLE_ROWS) {
    lines.push(BUDGET_IMPORT_COLUMNS.map((column) => csvEscape(row[column] ?? "")).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export function parseBudgetImportCsv(csvText: string): BudgetImportParseResult {
  const { rows, error } = parseCsvRecords(csvText);

  if (error) {
    return {
      rows: [],
      headerError: error,
    };
  }

  if (rows.length === 0) {
    return {
      rows: [],
      headerError: "CSV is empty. Download the template and add rows.",
    };
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeader = headerRow.map((value) => value.trim());
  const hasExactHeader =
    normalizedHeader.length === BUDGET_IMPORT_COLUMNS.length
    && BUDGET_IMPORT_COLUMNS.every((column, index) => normalizedHeader[index] === column);

  if (!hasExactHeader) {
    return {
      rows: [],
      headerError: `CSV header must match exactly: ${BUDGET_IMPORT_COLUMNS.join(", ")}`,
    };
  }

  const parsedRows = dataRows.map((cells) => {
    const row = emptyBudgetDraftRow();
    for (let index = 0; index < BUDGET_IMPORT_COLUMNS.length; index += 1) {
      const column = BUDGET_IMPORT_COLUMNS[index];
      row[column] = cells[index] ?? "";
    }
    return row;
  });

  return {
    rows: parsedRows,
    headerError: null,
  };
}

export type ValidateBudgetImportOptions = {
  /**
   * Source row numbers aligned to `rows`. Supplied by the flexible mapping flow
   * so preview/error messages reference the real spreadsheet line. When omitted
   * (e.g. exact-template CSV), a 1-based offset past the header row is used.
   */
  rowNumbers?: number[];
};

export function validateBudgetImportRows(
  rows: BudgetImportDraftRow[],
  options: ValidateBudgetImportOptions = {},
): BudgetImportValidationResult {
  const validatedRows: BudgetImportValidatedRow[] = [];
  const validRows: BudgetImportNormalizedRow[] = [];
  let notesIgnoredCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = options.rowNumbers?.[index] ?? index + 2;
    const raw = rows[index];

    const rawCategory = raw.Category.trim();
    const category = normalizeBudgetCategoryForStorage(rawCategory);
    const subcategory = raw.Subcategory.trim();
    const session = raw.Session.trim();
    const group = raw.Group.trim();
    const lineItem = raw["Line Item"].trim();
    const vendor = raw.Vendor.trim();
    const forecast = raw.Forecast.trim();
    const actual = raw.Actual.trim();
    const status = raw.Status.trim();
    const notes = raw.Notes.trim();

    const isBlank =
      rawCategory.length === 0
      && subcategory.length === 0
      && session.length === 0
      && group.length === 0
      && lineItem.length === 0
      && vendor.length === 0
      && forecast.length === 0
      && actual.length === 0
      && status.length === 0
      && notes.length === 0;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (isBlank) {
      validatedRows.push({
        rowNumber,
        raw,
        isBlank: true,
        isValid: false,
        errors,
        warnings,
      });
      continue;
    }

    if (!rawCategory) {
      errors.push("Category is required.");
    }

    if (!lineItem) {
      errors.push("Line Item is required.");
    }

    if (!forecast) {
      errors.push("Planned/Forecast amount is required.");
    }

    const forecastCents = parseCurrencyToCents(forecast);
    if (forecast && forecastCents === null) {
      errors.push("Forecast must be a valid non-negative number.");
    }

    const actualCents = actual ? parseCurrencyToCents(actual) : 0;
    if (actual && actualCents === null) {
      errors.push("Actual must be a valid non-negative number.");
    }

    const normalizedStatus = status ? normalizeStatus(status) : undefined;
    if (status && !normalizedStatus) {
      errors.push("Status must be Planned, Committed, or Paid.");
    }

    if (notes) {
      // Notes are not persisted (no BudgetLineItem.notes). Surfaced once at the
      // top level, never as a per-row warning.
      notesIgnoredCount += 1;
    }

    const isValid = errors.length === 0;
    const normalized = isValid
      ? {
          category,
          subcategory: subcategory || undefined,
          session: session || undefined,
          group: group || undefined,
          lineItem,
          vendor: vendor || undefined,
          forecastCents: forecastCents ?? 0,
          actualCents: actualCents ?? 0,
          status: normalizedStatus ?? undefined,
          notes: notes || undefined,
        }
      : undefined;

    if (normalized) {
      validRows.push(normalized);
    }

    validatedRows.push({
      rowNumber,
      raw,
      normalized,
      isBlank: false,
      isValid,
      errors,
      warnings,
    });
  }

  const blankCount = validatedRows.filter((row) => row.isBlank).length;
  const invalidCount = validatedRows.filter((row) => !row.isBlank && !row.isValid).length;
  const warningCount = validatedRows.reduce((sum, row) => sum + row.warnings.length, 0);

  return {
    rows: validatedRows,
    validRows,
    validCount: validRows.length,
    invalidCount,
    blankCount,
    warningCount,
    notesIgnoredCount,
  };
}

/** What the UI should do after a successful Budget import. */
export type BudgetImportSuccessOutcome = {
  /**
   * Whether to close the import modal. Always true today: a successful import
   * must never leave the user trapped in a reset, empty "Import 0 rows" state.
   */
  closeModal: boolean;
  noticeTitle: string;
  noticeDetail: string;
};

/**
 * Build the post-import success outcome (close-modal decision + toast copy) from
 * the server's import counts. Pure so the close/refresh behavior is unit-tested
 * without rendering the grid.
 *
 * One sheet at a time: only the selected sheet is ever imported. When the
 * workbook had other usable sheets we say so explicitly and point the user back
 * to Import — we never auto-import another sheet or hold the modal open.
 */
export function buildBudgetImportSuccessOutcome(input: {
  importedCount: number;
  skippedCount: number;
  /** True when the source workbook had more than one usable (mappable) sheet. */
  hasOtherSheets: boolean;
}): BudgetImportSuccessOutcome {
  const { importedCount, skippedCount, hasOtherSheets } = input;
  const importedLabel = `Imported ${importedCount} line item${importedCount === 1 ? "" : "s"}`;
  const base =
    skippedCount > 0
      ? `${importedLabel}; skipped ${skippedCount} invalid row${skippedCount === 1 ? "" : "s"}.`
      : `${importedLabel}.`;
  const followUp = hasOtherSheets
    ? "Only the selected sheet was imported — reopen Import to add another sheet."
    : "No additional save needed.";

  return {
    closeModal: true,
    noticeTitle: "Budget uploaded",
    noticeDetail: `${base} ${followUp}`,
  };
}
