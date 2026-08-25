// Flexible, synonym-driven mapping for the Timeline section importer.
//
// Builds on the shared import foundation (lib/import) so Timeline import does not
// require an exact header row. Detected columns are mapped to canonical Timeline
// fields, then projected onto the TimelineImportDraftRow shape the shared
// validator + server route consume. This is NOT a global Event Upload wizard.

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
  emptyTimelineDraftRow,
  type TimelineImportColumn,
  type TimelineImportDraftRow,
} from "@/lib/timeline-import";

/**
 * Canonical Timeline target fields the mapping UI can assign columns to.
 * `month` is intentionally NOT a target — it is derived from the date and never
 * stored (see {@link detectMonthColumns} for the informational notice).
 * Owner values are matched against event-scoped users by the canonical validator.
 */
export type TimelineImportField =
  | "title"
  | "workstream"
  | "planningStage"
  | "status"
  | "priority"
  | "startDate"
  | "endDate"
  | "isCriticalPath"
  | "owner"
  | "notes";

/** Header synonyms used to DETECT (not map) a Month column for the notice. */
export const TIMELINE_MONTH_SYNONYMS = ["month", "months"];
export const TIMELINE_RESPONSIBLE_PARTY_SYNONYMS = ["responsible party", "responsible parties"];

/**
 * Field specs with synonyms for auto-detection. Item is required; a lone End
 * Date imports as a single-day item, and both dates may be left blank.
 */
export const TIMELINE_IMPORT_FIELD_SPECS: ImportFieldSpec<TimelineImportField>[] = [
  {
    field: "title",
    label: "Item",
    required: true,
    synonyms: ["item", "task", "title", "name", "activity", "deliverable", "milestone"],
  },
  {
    field: "workstream",
    label: "Workstream",
    synonyms: ["workstream", "stream", "department", "category", "area"],
  },
  {
    field: "planningStage",
    label: "Planning Stage",
    synonyms: ["planning stage", "stage", "phase", "planning phase"],
  },
  {
    field: "status",
    label: "Status",
    synonyms: ["status", "state", "stage"],
  },
  {
    field: "priority",
    label: "Priority",
    synonyms: ["priority", "importance", "urgency"],
  },
  {
    field: "startDate",
    label: "Start Date",
    synonyms: ["start date", "start", "begin date", "begins", "from"],
  },
  {
    field: "endDate",
    label: "End Date",
    synonyms: ["end date", "due date", "date", "deadline", "due", "target date", "finish date", "to"],
  },
  {
    field: "isCriticalPath",
    label: "Critical Path",
    synonyms: ["critical path", "cp", "critical", "is critical", "critical?"],
  },
  {
    field: "owner",
    label: "Owner",
    synonyms: ["owner", "responsible party", "responsible person", "assignee", "assigned to"],
  },
  {
    field: "notes",
    label: "Notes",
    synonyms: ["notes", "note", "remarks", "comments", "details", "description"],
  },
];

/** Maps a canonical Timeline field onto the draft-row column key. */
const FIELD_TO_COLUMN: Record<TimelineImportField, TimelineImportColumn> = {
  title: "Item",
  workstream: "Workstream",
  planningStage: "Planning Stage",
  status: "Status",
  priority: "Priority",
  startDate: "Start Date",
  endDate: "End Date",
  isCriticalPath: "Critical Path",
  owner: "Owner",
  notes: "Notes",
};

const ALL_FIELDS = Object.keys(FIELD_TO_COLUMN) as TimelineImportField[];

/**
 * Detect Month-like columns so the UI can show a single informational notice.
 * These columns are never mapped to a Timeline field (Month is derived), so they
 * default to "Do not import".
 */
export function detectMonthColumns(columns: ImportColumn[]): ImportColumn[] {
  const synonyms = new Set(TIMELINE_MONTH_SYNONYMS.map((value) => normalizeHeader(value)));
  return columns.filter((column) => synonyms.has(normalizeHeader(column.header)));
}

/**
 * Detect Responsible Party columns for an informational notice.
 */
export function detectResponsiblePartyColumns(columns: ImportColumn[]): ImportColumn[] {
  const synonyms = new Set(TIMELINE_RESPONSIBLE_PARTY_SYNONYMS.map((value) => normalizeHeader(value)));
  return columns.filter((column) => synonyms.has(normalizeHeader(column.header)));
}

/** Suggest an initial column -> field mapping for a sheet's columns. */
export function buildTimelineInitialMapping(
  columns: ImportColumn[],
): ImportMapping<TimelineImportField> {
  return buildInitialMapping(columns, TIMELINE_IMPORT_FIELD_SPECS);
}

/** Validate a Timeline mapping (required fields present, no field mapped twice). */
export function validateTimelineMapping(
  mapping: ImportMapping<TimelineImportField>,
): string[] {
  return validateMapping(mapping, TIMELINE_IMPORT_FIELD_SPECS);
}

/** Project a single mapped row onto the draft-row column shape. */
export function mappedRowToDraftRow(mapped: MappedRow<TimelineImportField>): TimelineImportDraftRow {
  const row = emptyTimelineDraftRow();
  for (const field of ALL_FIELDS) {
    const value = mapped[field];
    if (typeof value === "string") {
      row[FIELD_TO_COLUMN[field]] = value;
    }
  }
  return row;
}

/**
 * Apply a mapping to a parsed sheet, producing draft rows (for the shared
 * validator + server route) plus the originating source row numbers so preview
 * and error messages can reference the real spreadsheet line.
 */
export function buildTimelineDraftRows(
  sheet: Pick<ParsedSheet, "columns" | "rows">,
  mapping: ImportMapping<TimelineImportField>,
): { draftRows: TimelineImportDraftRow[]; rowNumbers: number[] } {
  const mappedRows = buildMappedRows(sheet, mapping);
  return {
    draftRows: mappedRows.map(mappedRowToDraftRow),
    rowNumbers: mappedRows.map((row) => row.rowNumber),
  };
}
