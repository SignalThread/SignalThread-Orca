import * as XLSX from "xlsx";
import {
  parseCsvHeadersAndAllDataRows,
  type CsvSampleParse
} from "@/lib/import-wizard/parse-csv-sample";

const EXCEL_EXTENSIONS = [".xlsx", ".xls"] as const;

export function isExcelImportFile(file: Pick<File, "name" | "type">): boolean {
  const name = file.name.toLowerCase();
  if (EXCEL_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  const type = String(file.type ?? "").toLowerCase();
  return (
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function normalizeSheetRows(rows: unknown[][]): CsvSampleParse {
  const nonEmptyRows = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (nonEmptyRows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const headers = nonEmptyRows[0]!;
  const dataRows: string[][] = [];
  for (let i = 1; i < nonEmptyRows.length; i++) {
    const padded = [...nonEmptyRows[i]!];
    while (padded.length < headers.length) padded.push("");
    dataRows.push(padded.slice(0, headers.length));
  }
  return { headers, dataRows };
}

async function parseExcelFile(file: File): Promise<CsvSampleParse> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], dataRows: [] };
  }
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return { headers: [], dataRows: [] };
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: ""
  });
  return normalizeSheetRows(rows);
}

export async function parseImportFileHeadersAndAllDataRows(file: File): Promise<CsvSampleParse> {
  if (isExcelImportFile(file)) {
    return parseExcelFile(file);
  }
  return parseCsvHeadersAndAllDataRows(await file.text());
}
