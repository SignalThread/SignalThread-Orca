import { createHash } from "node:crypto";

export type BusyWindow = { start: string; end: string };
export type MeetingSuggestion = { start: string; end: string };
export type MeetingSuggestionDiagnostics = {
  candidatesConsidered: number;
  removedByBusy: number;
  removedByWindowEnd: number;
  removedByLeadTime: number;
  removedBySameDay: number;
  returned: number;
  truncatedByLimit: number;
};

export function isIanaTimeZone(value: string) {
  const timeZone = String(value ?? "").trim();
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localParts(value: string) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5])
  };
}

function formatPartsAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function zonedLocalToIso(localValue: string, timeZone: string) {
  const desired = localParts(localValue);
  if (!desired || !isIanaTimeZone(timeZone)) return null;
  const targetWallClock = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  let guess = targetWallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = formatPartsAt(new Date(guess), timeZone);
    const shownWallClock = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    guess += targetWallClock - shownWallClock;
  }
  const finalParts = formatPartsAt(new Date(guess), timeZone);
  if (Object.keys(desired).some((key) => desired[key as keyof typeof desired] !== finalParts[key as keyof typeof finalParts])) {
    return null;
  }
  return new Date(guess).toISOString();
}

export function normalizeBusyWindows(windows: BusyWindow[], rangeStart: string, rangeEnd: string): BusyWindow[] {
  const min = Date.parse(rangeStart);
  const max = Date.parse(rangeEnd);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const normalized = windows
    .map((window) => ({ start: Math.max(Date.parse(window.start), min), end: Math.min(Date.parse(window.end), max) }))
    .filter((window) => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const window of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end);
    else merged.push({ ...window });
  }
  return merged.map((window) => ({ start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() }));
}

export function suggestAvailableMeetingTimesWithDiagnostics(input: {
  rangeStart: string;
  rangeEnd: string;
  durationMinutes: number;
  busy: BusyWindow[];
  stepMinutes?: number;
  limit?: number;
}): { suggestions: MeetingSuggestion[]; diagnostics: MeetingSuggestionDiagnostics } {
  const start = Date.parse(input.rangeStart);
  const end = Date.parse(input.rangeEnd);
  const duration = Math.trunc(input.durationMinutes) * 60_000;
  const step = Math.max(5, Math.trunc(input.stepMinutes ?? 30)) * 60_000;
  const diagnostics: MeetingSuggestionDiagnostics = {
    candidatesConsidered: 0,
    removedByBusy: 0,
    removedByWindowEnd: 0,
    // The canonical generator currently has no hidden lead-time or same-day
    // filters. Keeping these explicit prevents production diagnostics from
    // implying that such filters removed otherwise valid slots.
    removedByLeadTime: 0,
    removedBySameDay: 0,
    returned: 0,
    truncatedByLimit: 0
  };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || duration < 5 * 60_000) {
    return { suggestions: [], diagnostics };
  }
  const busy = normalizeBusyWindows(input.busy, input.rangeStart, input.rangeEnd)
    .map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) }));
  const suggestions: MeetingSuggestion[] = [];
  const limit = Math.max(1, Math.trunc(input.limit ?? 8));
  for (let cursor = start; cursor < end; cursor += step) {
    diagnostics.candidatesConsidered += 1;
    const candidateEnd = cursor + duration;
    if (candidateEnd > end) {
      diagnostics.removedByWindowEnd += 1;
      continue;
    }
    if (busy.some((window) => cursor < window.end && candidateEnd > window.start)) {
      diagnostics.removedByBusy += 1;
      continue;
    }
    if (suggestions.length >= limit) {
      diagnostics.truncatedByLimit += 1;
      continue;
    }
    suggestions.push({ start: new Date(cursor).toISOString(), end: new Date(candidateEnd).toISOString() });
  }
  diagnostics.returned = suggestions.length;
  return { suggestions, diagnostics };
}

export function suggestAvailableMeetingTimes(input: {
  rangeStart: string;
  rangeEnd: string;
  durationMinutes: number;
  busy: BusyWindow[];
  stepMinutes?: number;
  limit?: number;
}): MeetingSuggestion[] {
  return suggestAvailableMeetingTimesWithDiagnostics(input).suggestions;
}

export function deterministicGoogleEventId(idempotencyKey: string) {
  return `lr${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}
