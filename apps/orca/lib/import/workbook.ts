// Workbook parsing for CSV and XLSX/XLS uploads, with multi-sheet discovery.
// xlsx is loaded lazily so pure mapping UIs that only import ./mapping do not
// pull the spreadsheet parser into their bundle.

import { tokenizeDelimited } from "./csv";
import { buildSheet, parseCsv, type SheetShapeOptions } from "./mapping";
import type { ParsedSheet, ParsedWorkbook, SheetSummary } from "./types";

export type WorkbookInput = ArrayBuffer | Uint8Array;

function isCsv(fileName: string, mimeType?: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".csv") || mimeType === "text/csv";
}

function isSpreadsheet(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

async function loadXlsx() {
  const mod = await import("xlsx");
  // xlsx ships as both default and namespace depending on the bundler.
  return (mod as unknown as { default?: typeof import("xlsx") }).default ?? mod;
}

/** Convert raw bytes of an XLSX/XLS workbook into per-sheet parsed sheets. */
export async function parseWorkbookBytes(
  input: WorkbookInput,
  options: SheetShapeOptions = {},
): Promise<ParsedWorkbook> {
  const XLSX = await loadXlsx();
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const workbook = XLSX.read(data, { type: "array" });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const tokenized = matrix.map((values, index) => ({
      rowNumber: index + 1,
      values: values.map((cell) => (cell == null ? "" : String(cell))),
    }));

    if (tokenized.every((row) => row.values.every((cell) => !cell.trim()))) {
      return { name, columns: [], rows: [], rowCount: 0, warnings: ["Sheet is empty."] };
    }
    return buildSheet(name, tokenized, options);
  });

  return { sheetNames: workbook.SheetNames, sheets };
}

/** Lightweight discovery: sheet names, data-row counts, and header labels only. */
export async function summarizeWorkbookBytes(input: WorkbookInput): Promise<SheetSummary[]> {
  const { sheets } = await parseWorkbookBytes(input);
  return sheets.map((sheet) => ({
    name: sheet.name,
    rowCount: sheet.rowCount,
    headers: sheet.columns.map((column) => column.header),
  }));
}

/** Parse a CSV string into a single-sheet workbook for a uniform return shape. */
export function parseCsvWorkbook(text: string, options: SheetShapeOptions = {}): ParsedWorkbook {
  const sheet = parseCsv(text, options);
  return { sheetNames: [sheet.name], sheets: [sheet] };
}

/**
 * Parse an uploaded file (CSV or XLSX/XLS) into a workbook. Unknown extensions
 * are attempted as CSV. Throws for empty/garbage input via the underlying parsers.
 */
export async function parseUploadedFile(
  file: File,
  options: SheetShapeOptions = {},
): Promise<ParsedWorkbook> {
  if (isCsv(file.name, file.type)) {
    return parseCsvWorkbook(await file.text(), options);
  }
  if (isSpreadsheet(file.name)) {
    return parseWorkbookBytes(await file.arrayBuffer(), options);
  }
  // Best-effort fallback: treat as delimited text.
  const text = await file.text();
  return { sheetNames: ["CSV"], sheets: [buildSheet("CSV", tokenizeDelimited(text), options)] };
}
