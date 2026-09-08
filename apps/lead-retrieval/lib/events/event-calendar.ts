export type EventCalendarDay = {
  timeZone: string;
  instantIso: string;
  ymd: string;
  startIso: string;
  endExclusiveIso: string;
};

export function isIanaTimeZone(value: string | null | undefined): boolean {
  const timeZone = String(value ?? "").trim();
  if (!timeZone || (timeZone !== "UTC" && !timeZone.includes("/"))) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function partsAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

function ymdFromParts(parts: ReturnType<typeof partsAt>) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedMidnightToIso(ymd: string, timeZone: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const wanted = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = wanted;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsAt(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const delta = wanted - actualAsUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess).toISOString();
}

function nextYmd(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Returns null for an unconfigured/invalid event timezone; business truth never falls back to the browser or server. */
export function getEventCalendarDay(now: Date, timeZone: string | null | undefined): EventCalendarDay | null {
  const normalized = String(timeZone ?? "").trim();
  if (!isIanaTimeZone(normalized)) return null;
  const ymd = ymdFromParts(partsAt(now, normalized));
  return {
    timeZone: normalized,
    instantIso: now.toISOString(),
    ymd,
    startIso: zonedMidnightToIso(ymd, normalized),
    endExclusiveIso: zonedMidnightToIso(nextYmd(ymd), normalized)
  };
}

export function formatEventLocalDateTime(value: string | Date, timeZone: string): string | null {
  if (!isIanaTimeZone(timeZone)) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

export function isInstantInEventDay(
  instant: string | null | undefined,
  day: Pick<EventCalendarDay, "startIso" | "endExclusiveIso">
): boolean {
  const value = String(instant ?? "");
  return value >= day.startIso && value < day.endExclusiveIso;
}
