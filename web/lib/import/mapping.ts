// Header normalization, sheet shaping, synonym matching, suggested mappings,
// mapping validation, and mapped-row building. Pure (no xlsx / no DOM) so it is
// safe to import from client mapping UIs and from Node tests.

import { tokenizeDelimited, type TokenizedRow } from "./csv";
import type {
  ImportColumn,
  ImportFieldSpec,
  ImportMapping,
  ImportRow,
  MappedRow,
  ParsedSheet,
} from "./types";

export type { ImportFieldSpec } from "./types";

export type SheetShapeOptions = {
  /** Max non-empty sample values captured per column (default 10). */
  sampleLimit?: number;
  /** Emit a warning when duplicate headers are detected (default true). */
  warnOnDuplicateHeaders?: boolean;
};

/** Lowercase, trim, and collapse separators so headers compare loosely. */
export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Turn tokenized rows into a ParsedSheet: the first row containing any
 * non-empty cell becomes the header; subsequent rows are data rows.
 */
export function buildSheet(
  name: string,
  tokenized: TokenizedRow[],
  options: SheetShapeOptions = {},
): ParsedSheet {
  const sampleLimit = options.sampleLimit ?? 10;
  const warnOnDuplicateHeaders = options.warnOnDuplicateHeaders ?? true;

  const headerRowIndex = tokenized.findIndex((candidate) =>
    candidate.values.some((value) => value.trim()),
  );
  if (headerRowIndex === -1) {
    throw new Error("Sheet is empty.");
  }

  const headerRow = tokenized[headerRowIndex];
  const dataRows: ImportRow[] = tokenized
    .slice(headerRowIndex + 1)
    .map((candidate) => ({ rowNumber: candidate.rowNumber, values: candidate.values }));

  const warnings: string[] = [];
  const headerCounts = new Map<string, number>();
  const headers = headerRow.values.map((header, index) => {
    const trimmed = header.trim() || `Column ${index + 1}`;
    const normalized = normalizeHeader(trimmed);
    headerCounts.set(normalized, (headerCounts.get(normalized) ?? 0) + 1);
    return trimmed;
  });

  const malformedRows = dataRows.filter(
    (candidate) =>
      candidate.values.length > headers.length && candidate.values.some((value) => value.trim()),
  );
  if (malformedRows.length > 0) {
    throw new Error(`Malformed row ${malformedRows[0]!.rowNumber}: more values than headers.`);
  }

  const duplicateHeaders = new Set(
    [...headerCounts.entries()].filter(([, count]) => count > 1).map(([header]) => header),
  );
  if (warnOnDuplicateHeaders && duplicateHeaders.size > 0) {
    warnings.push("Duplicate headers detected. Columns are kept separate; review mappings carefully.");
  }

  const columns: ImportColumn[] = headers.map((header, index) => ({
    id: `${index}:${header}`,
    header,
    index,
    duplicateHeader: duplicateHeaders.has(normalizeHeader(header)),
    samples: dataRows
      .map((candidate) => candidate.values[index]?.trim() ?? "")
      .filter(Boolean)
      .slice(0, sampleLimit),
  }));

  return { name, columns, rows: dataRows, rowCount: dataRows.length, warnings };
}

/** Parse a single CSV string into one ParsedSheet. */
export function parseCsv(text: string, options: SheetShapeOptions = {}): ParsedSheet {
  return buildSheet("CSV", tokenizeDelimited(text), options);
}

/** Suggest the best field for a header given the field specs, avoiding double-mapping. */
export function suggestField<Field extends string>(
  header: string,
  specs: ImportFieldSpec<Field>[],
  alreadyMapped: Set<Field>,
): Field | "" {
  const normalized = normalizeHeader(header);
  const suggestion = specs.find(
    (spec) =>
      !alreadyMapped.has(spec.field) &&
      (spec.synonyms ?? []).some((candidate) => normalizeHeader(candidate) === normalized),
  );
  if (!suggestion) return "";
  alreadyMapped.add(suggestion.field);
  return suggestion.field;
}

/** Build a suggested mapping across all columns of a sheet. */
export function buildInitialMapping<Field extends string>(
  columns: ImportColumn[],
  specs: ImportFieldSpec<Field>[],
): ImportMapping<Field> {
  const mappedFields = new Set<Field>();
  return Object.fromEntries(
    columns.map((column) => [column.id, suggestField(column.header, specs, mappedFields)]),
  ) as ImportMapping<Field>;
}

/** Validate a mapping: required fields present, no field mapped twice. */
export function validateMapping<Field extends string>(
  mapping: ImportMapping<Field>,
  specs: ImportFieldSpec<Field>[],
): string[] {
  const selected = Object.values(mapping).filter(Boolean) as Field[];
  const errors: string[] = [];

  for (const spec of specs) {
    if (spec.required && !selected.includes(spec.field)) {
      errors.push(`Map one column to ${spec.label}.`);
    }
  }

  const duplicates = [...new Set(selected.filter((field, index) => selected.indexOf(field) !== index))];
  if (duplicates.length > 0) {
    const labels = duplicates.map((field) => specs.find((spec) => spec.field === field)?.label ?? field);
    errors.push(`Each field can only be mapped once. Duplicates: ${labels.join(", ")}.`);
  }

  return errors;
}

/**
 * Build mapped rows keyed by field. Skips fully blank rows and trims values.
 * Unmapped and blank optional cells are simply omitted.
 */
export function buildMappedRows<Field extends string>(
  sheet: Pick<ParsedSheet, "columns" | "rows">,
  mapping: ImportMapping<Field>,
): MappedRow<Field>[] {
  const fieldByColumnIndex = new Map<number, Field>();
  for (const column of sheet.columns) {
    const field = mapping[column.id];
    if (field) fieldByColumnIndex.set(column.index, field);
  }

  return sheet.rows
    .filter((row) => row.values.some((value) => value.trim()))
    .map((row) => {
      const fields: Partial<Record<Field, string>> = {};
      for (const [columnIndex, field] of fieldByColumnIndex.entries()) {
        const value = row.values[columnIndex]?.trim() ?? "";
        if (value) fields[field] = value;
      }
      return { rowNumber: row.rowNumber, ...fields } as MappedRow<Field>;
    });
}
