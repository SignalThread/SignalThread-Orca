// Flexible, synonym-driven mapping for the Matrix 2 / Run of Show importer.
//
// Builds on the shared import foundation (lib/import) so Matrix import does not
// require an exact header row. Detected columns are mapped to canonical Matrix
// fields, then projected onto the MatrixImportDraftRow shape the shared
// validator + server route consume. This fills the Run of Show list/table only —
// it never creates related records.

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
  emptyMatrixDraftRow,
  type MatrixImportDraftRow,
  type MatrixImportField,
} from "@/lib/matrix-import";

export type { MatrixImportField } from "@/lib/matrix-import";

/** Header synonyms used to DETECT (not map) ignored/calculated columns. */
export const MATRIX_DAY_SYNONYMS = ["day", "day number", "event day"];
export const MATRIX_CONFLICT_SYNONYMS = ["conflict", "conflicts"];
export const MATRIX_ACTION_SYNONYMS = ["action", "actions"];
/**
 * Capacity synonyms are detected for a notice but intentionally NOT included in
 * the `attendance` field synonyms — a "Capacity" column is room capacity and must
 * never silently become expected attendance. The user can map it explicitly.
 */
export const MATRIX_CAPACITY_SYNONYMS = ["capacity", "room capacity", "max capacity"];

/**
 * Field specs with synonyms for auto-detection. Session, Date, Start Time, and
 * End Time are required. "Capacity" is deliberately absent from `attendance`
 * synonyms (see {@link detectCapacityColumns}).
 */
export const MATRIX_IMPORT_FIELD_SPECS: ImportFieldSpec<MatrixImportField>[] = [
  {
    field: "title",
    label: "Session",
    required: true,
    synonyms: ["session", "title", "session name", "session/title", "program", "agenda item", "name"],
  },
  {
    field: "date",
    label: "Date",
    required: true,
    synonyms: ["date", "day date", "session date"],
  },
  {
    field: "startTime",
    label: "Start Time",
    required: true,
    synonyms: ["start time", "start", "from", "begin", "begins"],
  },
  {
    field: "endTime",
    label: "End Time",
    required: true,
    synonyms: ["end time", "end", "to", "finish", "ends"],
  },
  {
    field: "room",
    label: "Room",
    synonyms: ["room", "location", "venue", "space", "room name"],
  },
  {
    field: "setup",
    label: "Setup Type",
    synonyms: ["setup", "setup type", "room setup", "room set", "seating setup"],
  },
  {
    field: "av",
    label: "AV Needs",
    synonyms: ["av", "a/v", "av needs", "av requirements", "audio visual", "audiovisual"],
  },
  {
    field: "fnb",
    label: "F&B Service",
    synonyms: ["f&b", "fnb", "f&b service", "food and beverage", "food & beverage", "meal service", "catering"],
  },
  {
    field: "speakers",
    label: "Speakers/Facilitators",
    synonyms: ["speakers/facilitators", "speakers", "facilitators", "speaker", "presenters", "facilitator", "speakers / facilitators"],
  },
  {
    field: "staff",
    label: "Assigned Staff",
    synonyms: ["assigned staff", "staff", "staffing", "crew", "team", "staff assigned"],
  },
  {
    field: "supplies",
    label: "Supplies",
    synonyms: ["supplies", "session supplies", "materials", "session materials", "workshop materials"],
  },
  {
    field: "signage",
    label: "Signage",
    synonyms: ["signage", "signs", "wayfinding", "session signage", "room signage"],
  },
  {
    field: "attendance",
    label: "Attendance",
    synonyms: ["attendance", "expected attendance", "headcount", "attendees", "pax", "expected headcount"],
  },
  {
    field: "status",
    label: "Status",
    synonyms: ["status", "state"],
  },
  {
    field: "notes",
    label: "Special Notes",
    synonyms: ["special notes", "notes", "note", "remarks", "comments", "comment"],
  },
];

const MATRIX_BASIC_SESSION_IMPORT_FIELDS: readonly MatrixImportField[] = [
  "title",
  "date",
  "startTime",
  "endTime",
  "room",
  "setup",
  "av",
  "fnb",
  "speakers",
  "staff",
  "supplies",
  "signage",
  "attendance",
  "status",
  "notes",
];

function detectBySynonyms(columns: ImportColumn[], synonyms: string[]): ImportColumn[] {
  const set = new Set(synonyms.map((value) => normalizeHeader(value)));
  return columns.filter((column) => set.has(normalizeHeader(column.header)));
}

/** Detect Day columns (derived from Date) for an informational notice. */
export function detectDayColumns(columns: ImportColumn[]): ImportColumn[] {
  return detectBySynonyms(columns, MATRIX_DAY_SYNONYMS);
}

/** Detect Conflicts columns (calculated) for an informational notice. */
export function detectConflictColumns(columns: ImportColumn[]): ImportColumn[] {
  return detectBySynonyms(columns, MATRIX_CONFLICT_SYNONYMS);
}

/** Detect Actions columns for an informational notice. */
export function detectActionColumns(columns: ImportColumn[]): ImportColumn[] {
  return detectBySynonyms(columns, MATRIX_ACTION_SYNONYMS);
}

/** Detect Capacity columns (room capacity) for an opt-in attendance notice. */
export function detectCapacityColumns(columns: ImportColumn[]): ImportColumn[] {
  return detectBySynonyms(columns, MATRIX_CAPACITY_SYNONYMS);
}

/** Suggest an initial column -> field mapping for a sheet's columns. */
export function buildMatrixInitialMapping(
  columns: ImportColumn[],
): ImportMapping<MatrixImportField> {
  return buildInitialMapping(columns, MATRIX_IMPORT_FIELD_SPECS);
}

/** Validate a Matrix mapping (required fields present, no field mapped twice). */
export function validateMatrixMapping(
  mapping: ImportMapping<MatrixImportField>,
): string[] {
  return validateMapping(mapping, MATRIX_IMPORT_FIELD_SPECS);
}

/** Project a single mapped row onto the draft-row shape (draft keys are fields). */
export function mappedRowToDraftRow(mapped: MappedRow<MatrixImportField>): MatrixImportDraftRow {
  const row = emptyMatrixDraftRow();
  for (const field of MATRIX_BASIC_SESSION_IMPORT_FIELDS) {
    const value = mapped[field];
    if (typeof value === "string") {
      row[field] = value;
    }
  }
  return row;
}

/**
 * Apply a mapping to a parsed sheet, producing draft rows (for the shared
 * validator + server route) plus the originating source row numbers so preview
 * and error messages can reference the real spreadsheet line.
 */
export function buildMatrixDraftRows(
  sheet: Pick<ParsedSheet, "columns" | "rows">,
  mapping: ImportMapping<MatrixImportField>,
): { draftRows: MatrixImportDraftRow[]; rowNumbers: number[] } {
  const mappedRows = buildMappedRows(sheet, mapping);
  return {
    draftRows: mappedRows.map(mappedRowToDraftRow),
    rowNumbers: mappedRows.map((row) => row.rowNumber),
  };
}
