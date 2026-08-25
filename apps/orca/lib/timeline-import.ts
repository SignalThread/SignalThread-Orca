// Validation + normalization for the Timeline section importer.
//
// Pure (no Prisma, no DOM) so the client mapping UI and the server route share
// exactly one validator. Mapped spreadsheet/CSV rows are projected onto a small
// canonical draft-row shape, then validated into TimelineImportNormalizedRow.
// This is NOT a global Event Upload wizard — Timeline composes the shared import
// foundation (lib/import) with its own field rules.
//
// Field rules (see the Timeline import audit):
//   Item          -> title           (required; blank -> row error)
//   Start/End     -> startDate/endDate (optional; a lone End defaults Start)
//   Status        -> status          (blank -> NOT_STARTED; unknown -> row error)
//   Workstream    -> workstream      (canonical enum/alias)
//   Planning Stage-> planningStage   (canonical enum/alias)
//   Priority      -> priority        (blank -> MEDIUM; unknown -> row error)
//   Critical Path -> isCriticalPath  (yes/true/1/x)
//   Owner / Responsible Party -> ownerUserId (matched against event users)
//   Notes         -> notes (optional, preserved verbatim after trimming)
//   Month         -> ignored (derived from the date; never imported)

import { matchStatus, parseDateToIso } from "@/lib/import";
import type { TimelinePlanningStage, TimelineWorkstream } from "@prisma/client";
import { TIMELINE_PRIORITIES, TIMELINE_STATUSES, type TimelinePriority, type TimelineStatus } from "@/lib/timeline/types";
import {
  resolvePlanningStage,
  resolveWorkstream,
} from "@/lib/timeline/taxonomy";

export const TIMELINE_IMPORT_COLUMNS = [
  "Item",
  "Workstream",
  "Planning Stage",
  "Status",
  "Priority",
  "Start Date",
  "End Date",
  "Critical Path",
  "Owner",
  "Notes",
] as const;

export type TimelineImportColumn = (typeof TIMELINE_IMPORT_COLUMNS)[number];

export type TimelineImportDraftRow = Record<Exclude<TimelineImportColumn, "Notes">, string> & { Notes?: string };

/** A validated, normalized Timeline row ready for the bulk create service. */
export type TimelineImportNormalizedRow = {
  title: string;
  /** ISO `YYYY-MM-DD`. */
  startDateIso: string | null;
  /** ISO `YYYY-MM-DD`. */
  endDateIso: string | null;
  status: TimelineStatus;
  priority: TimelinePriority;
  workstream: TimelineWorkstream | null;
  planningStage: TimelinePlanningStage | null;
  isCriticalPath: boolean;
  /** Exact trimmed source value, retained even before user resolution is possible. */
  ownerSource: string | null;
  /** Event-scoped owner ID, or null when the source value is blank/unmatched. */
  ownerUserId: string | null;
  /** Optional planner context from the source workbook. */
  notes: string | null;
};

export type TimelineImportValidatedRow = {
  rowNumber: number;
  raw: TimelineImportDraftRow;
  normalized?: TimelineImportNormalizedRow;
  isBlank: boolean;
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type TimelineImportValidationResult = {
  rows: TimelineImportValidatedRow[];
  validRows: TimelineImportNormalizedRow[];
  validCount: number;
  invalidCount: number;
  blankCount: number;
  /** Count of real, row-specific warnings — never top-level notices. */
  warningCount: number;
};

export type ValidateTimelineImportOptions = {
  /** Source row numbers aligned to `rows` so messages cite the real sheet line. */
  rowNumbers?: number[];
  /** Event-scoped users available for safe owner matching. */
  ownerOptions?: Array<{ id: string; name: string | null; email: string }>;
};

/** Human-readable enum lists for error messages. */
const STATUS_LABELS = "Not Started, In Progress, At Risk, Complete";
const PRIORITY_LABELS = "Low, Medium, High, Critical";

const TIMELINE_TEMPLATE_EXAMPLE_ROWS: TimelineImportDraftRow[] = [
  {
    Item: "Launch registration page",
    Workstream: "Registration",
    "Planning Stage": "Build",
    Status: "In Progress",
    Priority: "High",
    "Start Date": "2026-09-01",
    "End Date": "2026-09-15",
    "Critical Path": "Yes",
    Owner: "",
    Notes: "",
  },
  {
    Item: "Finalize keynote AV run-of-show",
    Workstream: "Production",
    "Planning Stage": "Show Week",
    Status: "Not Started",
    Priority: "Medium",
    "Start Date": "",
    "End Date": "2026-09-22",
    "Critical Path": "",
    Owner: "",
    Notes: "Confirm production handoff with the AV lead.",
  },
];

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function emptyTimelineDraftRow(): TimelineImportDraftRow {
  return {
    Item: "",
    Workstream: "",
    "Planning Stage": "",
    Status: "",
    Priority: "",
    "Start Date": "",
    "End Date": "",
    "Critical Path": "",
    Owner: "",
  };
}

export function buildTimelineImportTemplateCsv(): string {
  const header = TIMELINE_IMPORT_COLUMNS.join(",");
  const lines = [header];

  for (const row of TIMELINE_TEMPLATE_EXAMPLE_ROWS) {
    lines.push(TIMELINE_IMPORT_COLUMNS.map((column) => csvEscape(row[column] ?? "")).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export function validateTimelineImportRows(
  rows: TimelineImportDraftRow[],
  options: ValidateTimelineImportOptions = {},
): TimelineImportValidationResult {
  const validatedRows: TimelineImportValidatedRow[] = [];
  const validRows: TimelineImportNormalizedRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = options.rowNumbers?.[index] ?? index + 2;
    const raw = rows[index];

    const title = raw.Item.trim();
    const workstream = raw.Workstream.trim();
    const planningStage = raw["Planning Stage"].trim();
    const status = raw.Status.trim();
    const priority = raw.Priority.trim();
    const startDate = raw["Start Date"].trim();
    const endDate = raw["End Date"].trim();
    const criticalPath = raw["Critical Path"].trim();
    const owner = raw.Owner.trim();
    const notes = raw.Notes?.trim() ?? "";

    const isBlank =
      title.length === 0 &&
      workstream.length === 0 &&
      planningStage.length === 0 &&
      status.length === 0 &&
      priority.length === 0 &&
      startDate.length === 0 &&
      endDate.length === 0 &&
      criticalPath.length === 0 &&
      owner.length === 0 &&
      notes.length === 0;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (isBlank) {
      validatedRows.push({ rowNumber, raw, isBlank: true, isValid: false, errors, warnings });
      continue;
    }

    if (!title) {
      errors.push("Item is required.");
    }

    let startDateIso: string | null = null;
    let endDateIso: string | null = null;
    if (startDate) {
      startDateIso = parseDateToIso(startDate);
      if (!startDateIso) {
        errors.push("Start Date must be a valid date (YYYY-MM-DD or M/D/YYYY).");
      }
    }
    if (endDate) {
      endDateIso = parseDateToIso(endDate);
      if (!endDateIso) {
        errors.push("End Date must be a valid date (YYYY-MM-DD or M/D/YYYY).");
      }
    }
    if (!startDateIso && endDateIso) {
      startDateIso = endDateIso;
    }
    if (startDateIso && endDateIso && endDateIso < startDateIso) {
      errors.push("End Date must be on or after Start Date.");
    }

    // Blank status defaults to NOT_STARTED; anything present must be a known value.
    let normalizedStatus: TimelineStatus = "NOT_STARTED";
    if (status) {
      const matched = matchStatus(status, TIMELINE_STATUSES);
      if (!matched) {
        errors.push(`Status must be one of: ${STATUS_LABELS}.`);
      } else {
        normalizedStatus = matched as TimelineStatus;
      }
    }

    let normalizedPriority: TimelinePriority = "MEDIUM";
    if (priority) {
      const matched = matchStatus(priority, TIMELINE_PRIORITIES);
      if (!matched) {
        errors.push(`Priority must be one of: ${PRIORITY_LABELS}.`);
      } else {
        normalizedPriority = matched as TimelinePriority;
      }
    }

    let normalizedWorkstream: TimelineWorkstream | null = null;
    if (workstream) {
      normalizedWorkstream = resolveWorkstream(workstream);
      if (!normalizedWorkstream) {
        errors.push(`Workstream \"${workstream}\" is not supported. Choose a canonical workstream or skip this row.`);
      }
    }

    let normalizedPlanningStage: TimelinePlanningStage | null = null;
    if (planningStage) {
      normalizedPlanningStage = resolvePlanningStage(planningStage);
      if (!normalizedPlanningStage) {
        errors.push(`Stage \"${planningStage}\" is not supported. Choose a canonical planning stage or skip this row.`);
      }
    }

    let ownerUserId: string | null = null;
    if (owner && options.ownerOptions) {
      const ownerKey = owner.toLocaleLowerCase();
      const matches = options.ownerOptions.filter((candidate) =>
        [candidate.name, candidate.email].some((value) => value?.trim().toLocaleLowerCase() === ownerKey),
      );
      if (matches.length === 1) {
        ownerUserId = matches[0]!.id;
      } else {
        warnings.push(`Owner \"${owner}\" was not found and will be left unassigned.`);
      }
    }

    const normalizedCriticalPath = /^(true|yes|y|1|x|critical)$/i.test(criticalPath);

    const isValid = errors.length === 0;
    const normalized: TimelineImportNormalizedRow | undefined =
      isValid
        ? {
            title,
            startDateIso,
            endDateIso,
            status: normalizedStatus,
            priority: normalizedPriority,
            workstream: normalizedWorkstream,
            planningStage: normalizedPlanningStage,
            isCriticalPath: normalizedCriticalPath,
            ownerSource: owner || null,
            ownerUserId,
            notes: notes || null,
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
  };
}

/** What the UI should do after a successful Timeline import. */
export type TimelineImportSuccessOutcome = {
  /** Always true: a successful import never traps the user in the modal. */
  closeModal: boolean;
  noticeTitle: string;
  noticeDetail: string;
};

/**
 * Build the post-import success outcome (close decision + toast copy). Pure so
 * the close/refresh behavior is unit-tested without rendering the timeline. Only
 * the selected sheet is ever imported; when other usable sheets exist we say so.
 */
export function buildTimelineImportSuccessOutcome(input: {
  importedCount: number;
  skippedCount: number;
  hasOtherSheets: boolean;
}): TimelineImportSuccessOutcome {
  const { importedCount, skippedCount, hasOtherSheets } = input;
  const importedLabel = `Imported ${importedCount} timeline item${importedCount === 1 ? "" : "s"}`;
  const base =
    skippedCount > 0
      ? `${importedLabel}; skipped ${skippedCount} invalid row${skippedCount === 1 ? "" : "s"}.`
      : `${importedLabel}.`;
  const followUp = hasOtherSheets
    ? "Only the selected sheet was imported — reopen Import to add another sheet."
    : "No additional save needed.";

  return {
    closeModal: true,
    noticeTitle: "Timeline imported",
    noticeDetail: `${base} ${followUp}`,
  };
}
