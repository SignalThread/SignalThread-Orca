// Validation + normalization for the Matrix 2 / Run of Show section importer.
//
// Pure (no Prisma, no DOM) so the client mapping UI and the server route share
// exactly one validator. Mapped spreadsheet/CSV rows are projected onto a small
// canonical draft-row shape, then validated into MatrixImportNormalizedRow.
// This fills the current Matrix 2 Run of Show list/table ONLY — it never creates
// related records (speakers, AV requirements, F&B catalog, staff, rooms, etc.).
//
// Field rules (see the Matrix import audit):
//   Session   -> MatrixRow.sessionName      (required; blank -> row error)
//   Date      -> MatrixRow.dayDate          (required; valid date)
//   Start/End -> MatrixRow.startTime/endTime(required; valid; end >= start)
//   Room      -> MatrixRow.roomName         (free text; no Room record)
//   Speakers  -> notes "Speakers: ..." line (no speaker records)
//   Staff     -> notes "Staff: ..." line    (no staff records)
//   Status    -> notes "Status: ..." line   (no status column exists)
//   Notes     -> plain text appended after the structured lines
//   Attendance-> MatrixRow.attendance       (only when explicitly mapped)
//   Day/Conflicts/Actions/Capacity-as-room  -> ignored (see mapping notices)

import { parseDateToIso, parseTimeTo24h } from "@/lib/import";

/** Canonical draft-row fields. Draft keys ARE the import field names. */
export const MATRIX_IMPORT_FIELDS = [
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
] as const;

export type MatrixImportField = (typeof MATRIX_IMPORT_FIELDS)[number];

export type MatrixImportDraftRow = Record<MatrixImportField, string>;

/** A validated, normalized Matrix row ready for the bulk create service. */
export type MatrixImportNormalizedRow = {
  sessionName: string;
  /** ISO `YYYY-MM-DD`. */
  dayDateIso: string;
  /** 24h `HH:MM`. */
  startTime: string;
  /** 24h `HH:MM`. */
  endTime: string;
  roomName: string | null;
  setupType: string | null;
  avNeeds: string | null;
  attendance: number | null;
  supplies: MatrixImportOperationalRequirement[];
  signage: MatrixImportOperationalRequirement[];
  /** Composed notes (structured lines + plain text). */
  notes: string;
};

export type MatrixImportOperationalRequirement = {
  label: string;
  quantity: number | null;
};

export type MatrixImportValidatedRow = {
  rowNumber: number;
  raw: MatrixImportDraftRow;
  normalized?: MatrixImportNormalizedRow;
  isBlank: boolean;
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export type MatrixImportValidationResult = {
  rows: MatrixImportValidatedRow[];
  validRows: MatrixImportNormalizedRow[];
  validCount: number;
  invalidCount: number;
  blankCount: number;
  /** Count of real, row-specific warnings — never top-level notices. */
  warningCount: number;
  /** Generic, data-handling notices (always returned for transparency). */
  notices: string[];
};

export type ValidateMatrixImportOptions = {
  /** Source row numbers aligned to `rows` so messages cite the real sheet line. */
  rowNumbers?: number[];
};

/** Generic notices about how Run of Show data is stored (not per-row warnings). */
export const MATRIX_IMPORT_DATA_NOTICES = [
  "Speakers, Staffing, and Status are stored as session notes text — no speaker, staff, or related records are created.",
  "Supplies and Signage are imported into permanent session requirement categories; new labels become reusable options in that category.",
  "Conflicts are calculated by the app and are never imported.",
  "Day is derived from the Date column and is not imported.",
] as const;

export function emptyMatrixDraftRow(): MatrixImportDraftRow {
  return {
    title: "",
    date: "",
    startTime: "",
    endTime: "",
    room: "",
    setup: "",
    av: "",
    fnb: "",
    speakers: "",
    staff: "",
    supplies: "",
    signage: "",
    attendance: "",
    status: "",
    notes: "",
  };
}

/** Template headers shown to users (friendly names; re-map via synonyms). */
export const MATRIX_IMPORT_TEMPLATE_HEADERS = [
  "Session",
  "Date",
  "Start Time",
  "End Time",
  "Room",
  "Speakers/Facilitators",
  "Assigned Staff",
  "Supplies",
  "Signage",
  "Attendance",
  "Status",
  "Special Notes",
] as const;

const MATRIX_TEMPLATE_EXAMPLE_ROWS: string[][] = [
  [
    "Opening General Session",
    "2027-01-25",
    "09:00",
    "10:30",
    "Grand Ballroom",
    "CEO, CRO",
    "Production crew, stage manager",
    "Notepads x 450; Pens x 450",
    "Room identification x 2; Directional signage x 4",
    "450",
    "Confirmed",
    "Live streamed for remote attendees",
  ],
  [
    "Networking Lunch",
    "2027-01-25",
    "12:00",
    "13:00",
    "Foyer",
    "",
    "Catering staff",
    "",
    "Buffet labels x 3",
    "400",
    "",
    "Dietary tags on table cards",
  ],
];

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildMatrixImportTemplateCsv(): string {
  const lines = [MATRIX_IMPORT_TEMPLATE_HEADERS.map(csvEscape).join(",")];
  for (const row of MATRIX_TEMPLATE_EXAMPLE_ROWS) {
    lines.push(row.map(csvEscape).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Compose MatrixRow.notes from structured lines + plain notes, in fixed order. */
export function composeMatrixNotes(input: {
  speakers?: string;
  staff?: string;
  fnb?: string;
  status?: string;
  plain?: string;
}): string {
  const lines: string[] = [];
  if (input.speakers?.trim()) lines.push(`Speakers: ${input.speakers.trim()}`);
  if (input.staff?.trim()) lines.push(`Staff: ${input.staff.trim()}`);
  if (input.fnb?.trim()) lines.push(`F&B: ${input.fnb.trim()}`);
  if (input.status?.trim()) lines.push(`Status: ${input.status.trim()}`);
  if (input.plain?.trim()) lines.push(input.plain.trim());
  return lines.join("\n");
}

function parseAttendance(value: string): { attendance: number | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { attendance: null, error: null };
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { attendance: null, error: "Attendance must be a whole number greater than or equal to 0." };
  }
  return { attendance: parsed, error: null };
}

export function parseMatrixOperationalRequirements(value: string): MatrixImportOperationalRequirement[] {
  return value
    .split(/[;\n|]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^(.*?)(?:\s*(?:x|×|:)\s*(\d+))$/i.exec(entry);
      const label = (match?.[1] ?? entry).trim();
      const quantity = match?.[2] ? Number(match[2]) : null;
      return { label, quantity };
    })
    .filter((entry) => entry.label.length > 0);
}

export function matrixImportRowFingerprint(row: Pick<MatrixImportNormalizedRow, "sessionName" | "dayDateIso" | "startTime" | "endTime" | "roomName">): string {
  return [row.sessionName, row.dayDateIso, row.startTime, row.endTime, row.roomName ?? ""]
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function validateMatrixImportRows(
  rows: MatrixImportDraftRow[],
  options: ValidateMatrixImportOptions = {},
): MatrixImportValidationResult {
  const validatedRows: MatrixImportValidatedRow[] = [];
  const validRows: MatrixImportNormalizedRow[] = [];
  const seenFingerprints = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = options.rowNumbers?.[index] ?? index + 2;
    const raw = rows[index];

    const title = raw.title.trim();
    const date = raw.date.trim();
    const startTime = raw.startTime.trim();
    const endTime = raw.endTime.trim();
    const room = raw.room.trim();
    const setup = raw.setup.trim();
    const av = raw.av.trim();
    const fnb = raw.fnb.trim();
    const speakers = raw.speakers.trim();
    const staff = raw.staff.trim();
    const supplies = raw.supplies.trim();
    const signage = raw.signage.trim();
    const attendanceRaw = raw.attendance.trim();
    const status = raw.status.trim();
    const plainNotes = raw.notes.trim();

    const isBlank =
      !title && !date && !startTime && !endTime && !room && !setup && !av &&
      !fnb && !speakers && !staff && !supplies && !signage && !attendanceRaw && !status && !plainNotes;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (isBlank) {
      validatedRows.push({ rowNumber, raw, isBlank: true, isValid: false, errors, warnings });
      continue;
    }

    if (!title) {
      errors.push("Session is required.");
    }

    let dateIso: string | null = null;
    if (!date) {
      errors.push("Date is required.");
    } else {
      dateIso = parseDateToIso(date);
      if (!dateIso) {
        errors.push("Date must be a valid date (YYYY-MM-DD or M/D/YYYY).");
      }
    }

    let start24: string | null = null;
    if (!startTime) {
      errors.push("Start Time is required.");
    } else {
      start24 = parseTimeTo24h(startTime);
      if (!start24) {
        errors.push("Start Time must be a valid time (HH:MM or h:MM AM/PM).");
      }
    }

    let end24: string | null = null;
    if (!endTime) {
      errors.push("End Time is required.");
    } else {
      end24 = parseTimeTo24h(endTime);
      if (!end24) {
        errors.push("End Time must be a valid time (HH:MM or h:MM AM/PM).");
      }
    }

    if (start24 && end24 && end24 < start24) {
      errors.push("End Time must be on or after Start Time.");
    }

    const { attendance, error: attendanceError } = parseAttendance(attendanceRaw);
    if (attendanceError) {
      errors.push(attendanceError);
    }

    let normalized: MatrixImportNormalizedRow | undefined =
      errors.length === 0 && dateIso && start24 && end24
        ? {
            sessionName: title,
            dayDateIso: dateIso,
            startTime: start24,
            endTime: end24,
            roomName: room || null,
            setupType: setup || null,
            avNeeds: av || null,
            attendance,
            supplies: parseMatrixOperationalRequirements(supplies),
            signage: parseMatrixOperationalRequirements(signage),
            notes: composeMatrixNotes({ speakers, staff, fnb, status, plain: plainNotes }),
          }
        : undefined;

    if (normalized) {
      const fingerprint = matrixImportRowFingerprint(normalized);
      if (seenFingerprints.has(fingerprint)) {
        errors.push("Duplicate session row in this import was skipped.");
        normalized = undefined;
      } else {
        seenFingerprints.add(fingerprint);
      }
    }

    const isValid = errors.length === 0;

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
    notices: [...MATRIX_IMPORT_DATA_NOTICES],
  };
}

/** What the UI should do after a successful Matrix import. */
export type MatrixImportSuccessOutcome = {
  /** Always true: a successful import never traps the user in the modal. */
  closeModal: boolean;
  noticeTitle: string;
  noticeDetail: string;
};

/**
 * Build the post-import success outcome (close decision + toast copy). Pure so
 * the close/refresh behavior is unit-tested without rendering the matrix. Only
 * the selected sheet is ever imported; when other usable sheets exist we say so.
 */
export function buildMatrixImportSuccessOutcome(input: {
  importedCount: number;
  skippedCount: number;
  hasOtherSheets: boolean;
}): MatrixImportSuccessOutcome {
  const { importedCount, skippedCount, hasOtherSheets } = input;
  const importedLabel = `Imported ${importedCount} session${importedCount === 1 ? "" : "s"}`;
  const base =
    skippedCount > 0
      ? `${importedLabel}; skipped ${skippedCount} invalid row${skippedCount === 1 ? "" : "s"}.`
      : `${importedLabel}.`;
  const followUp = hasOtherSheets
    ? "Only the selected sheet was imported — reopen Import to add another sheet."
    : "Conflicts are recalculated automatically.";

  return {
    closeModal: true,
    noticeTitle: "Run of Show imported",
    noticeDetail: `${base} ${followUp}`,
  };
}
