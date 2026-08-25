// RFC-4180-ish delimited text tokenizer shared by every CSV importer.
// Consolidates the per-feature parsers that previously lived in
// speaker-csv-import-utils.ts and marketing-csv-utils.ts.

export type TokenizedRow = { rowNumber: number; values: string[] };

/**
 * Tokenize delimited text into rows of string cells.
 *
 * - Honors quoted fields, escaped quotes (""), and CRLF/CR/LF line endings.
 * - Strips a leading UTF-8 BOM.
 * - `rowNumber` is 1-based and counts every physical line, including the header.
 * - Throws on an unterminated quoted field.
 */
export function tokenizeDelimited(text: string, delimiter = ","): TokenizedRow[] {
  const normalized = text.replace(/^﻿/, "");
  const rows: TokenizedRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowNumber = 1;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      rows.push({ rowNumber, values: row });
      row = [];
      field = "";
      rowNumber += 1;
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field.");
  }

  row.push(field);
  rows.push({ rowNumber, values: row });

  return rows;
}
