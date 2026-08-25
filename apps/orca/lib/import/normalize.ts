// Shared value normalizers used during row validation. Each returns null when
// the input cannot be confidently parsed so callers can raise row-level errors.

/** Parse a numeric string, tolerating `$`, thousands separators, and spaces. */
export function parseNumber(raw: string): number | null {
  const normalized = raw.replace(/[$,\s]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a currency/number string into integer cents.
 * Accepts `$1,200.50` -> 120050. Returns null for non-numeric input.
 */
export function parseCurrencyToCents(raw: string): number | null {
  const parsed = parseNumber(raw);
  if (parsed === null) return null;
  return Math.round(parsed * 100);
}

/**
 * Parse a date string into an ISO `YYYY-MM-DD` string.
 * Accepts `2027-01-25`, `1/25/2027`, `01/25/2027`. Returns null when invalid.
 */
export function parseDateToIso(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return buildIsoDate(Number(slash[3]), Number(slash[1]), Number(slash[2]));
  }

  return null;
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/**
 * Parse a time string into 24h `HH:MM`.
 * Accepts `07:00`, `7:00`, `7:00 AM`, `2:30 pm`, `14:30`. Returns null when invalid.
 */
export function parseTimeTo24h(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];

  if (minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "am") hours = hours === 12 ? 0 : hours;
    else hours = hours === 12 ? 12 : hours + 12;
  } else if (hours > 23) {
    return null;
  }

  return `${pad(hours, 2)}:${pad(minutes, 2)}`;
}

/**
 * Parse a percent into a fraction.
 * `22%` -> 0.22, `8%` -> 0.08, `22` -> 0.22, `0.22` -> 0.22. Returns null when invalid.
 */
export function parsePercentToFraction(raw: string): number | null {
  const trimmed = raw.trim();
  const hadPercent = trimmed.includes("%");
  const parsed = parseNumber(trimmed.replace(/%/g, ""));
  if (parsed === null) return null;
  if (hadPercent) return parsed / 100;
  return parsed > 1 ? parsed / 100 : parsed;
}

/** Normalize an enum-style label: `Not Started` -> `NOT_STARTED`. */
export function normalizeEnumValue(raw: string): string {
  return raw.trim().toUpperCase().replace(/[-\s]+/g, "_");
}

/**
 * Match a free-text status against allowed enum values (after normalization).
 * Returns the matched canonical value or null.
 */
export function matchStatus(raw: string, allowed: readonly string[]): string | null {
  const normalized = normalizeEnumValue(raw);
  if (!normalized) return null;
  return allowed.find((value) => normalizeEnumValue(value) === normalized) ?? null;
}

/** Split a comma/semicolon-separated cell into trimmed, non-empty values. */
export function splitList(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}
