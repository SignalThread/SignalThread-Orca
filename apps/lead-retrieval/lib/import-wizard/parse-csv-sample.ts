/**
 * Minimal CSV parsing for header + first N data rows (RFC 4180-style quotes).
 * Used for import wizard preview only — not a full streaming parser.
 */

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type CsvSampleParse = {
  headers: string[];
  /** Up to `maxRows` data rows (after header), each aligned to headers length. */
  dataRows: string[][];
};

/**
 * @param maxDataRows - number of sample data rows to return (default 3)
 */
export function parseCsvHeadersAndSampleRows(text: string, maxDataRows = 3): CsvSampleParse {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], dataRows: [] };
  }
  const headers = parseCsvLine(lines[0]!);
  const dataRows: string[][] = [];
  for (let r = 1; r < lines.length && dataRows.length < maxDataRows; r++) {
    const cells = parseCsvLine(lines[r]!);
    const padded = [...cells];
    while (padded.length < headers.length) padded.push("");
    dataRows.push(padded.slice(0, headers.length));
  }
  return { headers, dataRows };
}

/** All data rows (after header); each row padded/truncated to header width. */
export function parseCsvHeadersAndAllDataRows(text: string): CsvSampleParse {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], dataRows: [] };
  }
  const headers = parseCsvLine(lines[0]!);
  const dataRows: string[][] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]!);
    const padded = [...cells];
    while (padded.length < headers.length) padded.push("");
    dataRows.push(padded.slice(0, headers.length));
  }
  return { headers, dataRows };
}

/** One row per CSV column: header label + up to three sample cell values. */
export function buildPreviewColumnsFromParse(parsed: CsvSampleParse): { csvColumn: string; cells: string[] }[] {
  return parsed.headers.map((h, colIdx) => ({
    csvColumn: h,
    cells: parsed.dataRows.map((row) => row[colIdx] ?? ""),
  }));
}
