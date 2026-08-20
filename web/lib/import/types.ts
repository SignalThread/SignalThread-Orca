// Shared, schema-agnostic types for the section-level import foundation.
// Section importers (Budget, Timeline, Matrix, F&B, Speakers, Marketing, ...)
// describe their target fields with ImportFieldSpec and reuse the parsing,
// mapping, normalization, and summary helpers in this module.

/** A detected source column from a CSV or worksheet. */
export type ImportColumn = {
  /** Stable id used as the mapping key: `${index}:${header}`. */
  id: string;
  header: string;
  /** Zero-based position of the column within the source row. */
  index: number;
  /** True when another column shares the same normalized header. */
  duplicateHeader: boolean;
  /** First N non-empty trimmed values, for preview / mapping hints. */
  samples: string[];
};

/** A single data row (header row excluded). */
export type ImportRow = {
  /** 1-based source line number including the header row, for error messages. */
  rowNumber: number;
  values: string[];
};

/** One parsed sheet (a CSV file yields a single sheet named "CSV"). */
export type ParsedSheet = {
  name: string;
  columns: ImportColumn[];
  rows: ImportRow[];
  /** Number of data rows (excludes the header row). */
  rowCount: number;
  warnings: string[];
};

/** A parsed workbook. CSV input yields a single-sheet workbook. */
export type ParsedWorkbook = {
  sheetNames: string[];
  sheets: ParsedSheet[];
};

/** Lightweight per-sheet metadata for sheet discovery without full parsing. */
export type SheetSummary = {
  name: string;
  rowCount: number;
  headers: string[];
};

/** Describes one target field a section wants to import into. */
export type ImportFieldSpec<Field extends string = string> = {
  field: Field;
  label: string;
  required?: boolean;
  recommended?: boolean;
  /** Header strings that should auto-map to this field (case/format-insensitive). */
  synonyms?: string[];
};

/** A column-id -> field selection. Empty string means "do not import". */
export type ImportMapping<Field extends string = string> = Record<string, Field | "">;

/** A mapped row keyed by field, plus the originating row number. */
export type MappedRow<Field extends string = string> = { rowNumber: number } & Partial<
  Record<Field, string>
>;
