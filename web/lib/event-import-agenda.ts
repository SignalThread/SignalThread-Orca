/**
 * Paste Agenda parser (pure, no writes, no AI/external APIs).
 *
 * Turns a rough pasted schedule into normalized Run of Show rows that feed the
 * SAME EventImportPreview + create plan as the workbook path. Best-effort: it
 * extracts time / title / room / day and keeps uncertain text as notes, emitting
 * warnings rather than guessing. Budget and Timeline are not created here.
 */
import { parseDateToIso, parseTimeTo24h } from "@/lib/import";
import {
  emptyEventImportPreview,
  type EventImportBasics,
  type EventImportCreatePlan,
  type EventImportPreview,
  type EventImportRunOfShowInput,
  type ImportWarning,
  type RunOfShowPreviewRow,
} from "@/lib/event-import-types";

const TIME_TOKEN = "\\d{1,2}:\\d{2}\\s*(?:am|pm)?";
const TIME_RANGE_AT_START = new RegExp(`^(${TIME_TOKEN})\\s*(?:-|–|—|to)\\s*(${TIME_TOKEN})`, "i");
const SINGLE_TIME_AT_START = new RegExp(`^(${TIME_TOKEN})`, "i");
const SEGMENT_SEPARATOR_RE = /\s*(?:\||–|—| - |\t)\s*/;
const DAY_N_RE = /^day\s*\d+/i;
const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const LEADING_SEPARATORS_RE = /^[\s|,:–—-]+/;

const ROOM_HINT_RE = /\b(room|ballroom|hall|foyer|stage|suite|theat|salon|atrium|lobby|terrace|pavilion|deck)\b/i;

type ParsedAgendaLine = {
  lineNumber: number;
  title: string;
  startTime: string | null;
  endTime: string | null;
  roomName: string | null;
  dayToken: string | null;
  dateIso: string | null;
  notes: string[];
};

function addMinutesClamped(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Pull a leading day/date token off a line, returning the remainder. */
function extractLeadingDay(text: string): { dayToken: string | null; dateIso: string | null; rest: string } {
  const trimmed = text.trim();
  // Explicit date at start (ISO or M/D/Y).
  const explicit = trimmed.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b[\s|,–—-]*/);
  if (explicit) {
    return { dayToken: explicit[1], dateIso: parseDateToIso(explicit[1]), rest: trimmed.slice(explicit[0].length) };
  }
  // "Day 1" / weekday name — not resolvable to a real date here. Capture the whole
  // token (including the number / full weekday) so the remainder starts cleanly.
  const dayN = trimmed.match(DAY_N_RE);
  const weekday = trimmed.match(WEEKDAY_RE);
  const token = dayN?.[0] ?? weekday?.[0];
  if (token) {
    return { dayToken: token, dateIso: null, rest: trimmed.slice(token.length).replace(LEADING_SEPARATORS_RE, "") };
  }
  return { dayToken: null, dateIso: null, rest: trimmed };
}

function parseAgendaLine(rawLine: string, lineNumber: number): ParsedAgendaLine | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  const { dayToken, dateIso, rest } = extractLeadingDay(trimmed);
  // Strip any leading separators left behind so the time is at the start.
  const beforeTime = rest.replace(LEADING_SEPARATORS_RE, "");

  let startTime: string | null = null;
  let endTime: string | null = null;
  let afterTime = beforeTime;

  const range = beforeTime.match(TIME_RANGE_AT_START);
  if (range) {
    startTime = parseTimeTo24h(range[1]);
    endTime = parseTimeTo24h(range[2]);
    afterTime = beforeTime.slice(range[0].length);
  } else {
    const single = beforeTime.match(SINGLE_TIME_AT_START);
    if (single) {
      startTime = parseTimeTo24h(single[1]);
      afterTime = beforeTime.slice(single[0].length);
    }
  }

  afterTime = afterTime.replace(LEADING_SEPARATORS_RE, "").trim();

  const segments = afterTime
    .split(SEGMENT_SEPARATOR_RE)
    .map((s) => s.trim())
    .filter(Boolean);

  const title = segments[0] ?? "";
  let roomName: string | null = null;
  const notes: string[] = [];

  if (segments.length >= 2) {
    // Prefer a room-looking segment; otherwise treat the 2nd segment as the room.
    const roomIdx = segments.findIndex((seg, i) => i > 0 && ROOM_HINT_RE.test(seg));
    const chosen = roomIdx > 0 ? roomIdx : 1;
    roomName = segments[chosen] ?? null;
    segments.forEach((seg, i) => {
      if (i === 0 || i === chosen) return;
      notes.push(seg);
    });
  }

  if (dayToken && !dateIso) notes.unshift(`Day: ${dayToken}`);

  return { lineNumber, title, startTime, endTime, roomName, dayToken, dateIso, notes };
}

export type AgendaParseResult = {
  rows: EventImportRunOfShowInput[];
  previewRows: RunOfShowPreviewRow[];
  warnings: ImportWarning[];
  totalLines: number;
  skippedCount: number;
};

/**
 * Parse pasted agenda text into writable Run of Show rows. Rows missing a title
 * or a start time are skipped (warned). Missing dates default to the event start
 * date; missing end times are inferred from the next session (warned).
 */
export function parseAgenda(text: string, basics: EventImportBasics): AgendaParseResult {
  const warnings: ImportWarning[] = [];
  const lines = text.split(/\r?\n/);
  const parsed: ParsedAgendaLine[] = [];
  let totalLines = 0;
  let skippedCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    totalLines += 1;
    const line = parseAgendaLine(lines[i], i + 1);
    if (!line) continue;
    if (!line.title) {
      skippedCount += 1;
      warnings.push({ module: "runOfShow", severity: "warning", rowNumber: i + 1, message: "Skipped a line with no session title." });
      continue;
    }
    if (!line.startTime) {
      skippedCount += 1;
      warnings.push({
        module: "runOfShow",
        severity: "warning",
        rowNumber: i + 1,
        message: `"${line.title}" needs a start time before it can be created.`,
      });
      continue;
    }
    parsed.push(line);
  }

  const defaultDateIso = /^\d{4}-\d{2}-\d{2}$/.test(basics.startDate) ? basics.startDate : "";
  let inferredEndCount = 0;
  let defaultedDateCount = 0;

  const rows: EventImportRunOfShowInput[] = [];
  const previewRows: RunOfShowPreviewRow[] = [];

  for (let i = 0; i < parsed.length; i += 1) {
    const line = parsed[i];
    const dayDateIso = line.dateIso ?? defaultDateIso;
    if (!line.dateIso) defaultedDateCount += 1;

    let endTime = line.endTime;
    if (!endTime) {
      const next = parsed[i + 1];
      if (next?.startTime && (next.dateIso ?? defaultDateIso) === dayDateIso && next.startTime > line.startTime!) {
        endTime = next.startTime;
      } else {
        endTime = addMinutesClamped(line.startTime!, 60);
      }
      inferredEndCount += 1;
    }

    if (!dayDateIso) {
      // No event date and no row date — cannot place on a schedule.
      skippedCount += 1;
      warnings.push({
        module: "runOfShow",
        severity: "warning",
        rowNumber: line.lineNumber,
        message: `"${line.title}" needs a date before it can be created.`,
      });
      continue;
    }

    const notes = line.notes.join(" • ");
    rows.push({
      sessionName: line.title,
      dayDateIso,
      startTime: line.startTime!,
      endTime,
      roomName: line.roomName,
      setupType: null,
      avNeeds: null,
      attendance: null,
      notes,
    });
    previewRows.push({
      title: line.title,
      date: dayDateIso || null,
      startTime: line.startTime,
      endTime,
      roomName: line.roomName,
      notes: notes || null,
    });
  }

  if (inferredEndCount > 0) {
    warnings.push({
      module: "runOfShow",
      severity: "info",
      message: `${inferredEndCount} session${inferredEndCount === 1 ? "" : "s"} had an end time inferred from the next session.`,
    });
  }
  if (defaultedDateCount > 0 && defaultDateIso) {
    warnings.push({
      module: "runOfShow",
      severity: "info",
      message: `${defaultedDateCount} session${defaultedDateCount === 1 ? "" : "s"} used the event start date because no date was found in the text.`,
    });
  }

  return { rows, previewRows, warnings, totalLines, skippedCount };
}

function uniqueRooms(rows: EventImportRunOfShowInput[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const name = row.roomName?.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

export function buildAgendaPreview(text: string, basics: EventImportBasics): EventImportPreview {
  const result = parseAgenda(text, basics);
  const preview = emptyEventImportPreview(basics, "pasteAgenda");
  preview.modules.runOfShow = {
    ...preview.modules.runOfShow,
    detected: result.previewRows.length > 0,
    rows: result.previewRows,
    sampleRows: result.previewRows.slice(0, 3),
    validRowCount: result.previewRows.length,
    skippedRowCount: result.skippedCount,
    roomsToCreate: uniqueRooms(result.rows),
    warnings: result.warnings,
  };
  preview.globalWarnings.push({
    module: "global",
    severity: "info",
    message: "Paste Agenda creates your Run of Show. Add Budget and Timeline from the dashboard afterward.",
  });
  return preview;
}

export function buildAgendaCreatePlan(text: string, basics: EventImportBasics): EventImportCreatePlan {
  const result = parseAgenda(text, basics);
  return {
    eventBasics: basics,
    sourceType: "pasteAgenda",
    runOfShow: result.rows,
    budget: [],
    timeline: [],
    timelineDependencies: [],
  };
}
