export type TimezoneOption = {
  value: string;
  label: string;
};

const COMMON_TIMEZONE_LABELS: Record<string, string> = {
  "America/New_York": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Anchorage": "Alaska Time",
  "Pacific/Honolulu": "Hawaii Time",
  "America/Phoenix": "Arizona",
  UTC: "UTC",
  "Europe/London": "London Time",
  "Europe/Paris": "Central European Time",
  "Asia/Tokyo": "Japan Time",
  "Australia/Sydney": "Sydney Time",
};

const FALLBACK_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export const FALLBACK_EVENT_CREATION_TIMEZONE = "America/New_York";

function availableTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [...FALLBACK_TIMEZONES];
}

function fallbackTimezoneLabel(value: string): string {
  const parts = value.split("/");
  const city = parts[parts.length - 1]?.replace(/_/g, " ") ?? value;
  return `${city} — ${value}`;
}

export function formatTimezoneLabel(value: string): string {
  const common = COMMON_TIMEZONE_LABELS[value];
  if (common) return `${common} — ${value}`;
  return fallbackTimezoneLabel(value);
}

export function getTimezoneOptions(): TimezoneOption[] {
  return availableTimezones().map((value) => ({
    value,
    label: formatTimezoneLabel(value),
  }));
}

export function isSupportedTimezone(value: string): boolean {
  return availableTimezones().includes(value);
}

export function getDefaultTimezone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved && isSupportedTimezone(resolved) ? resolved : "";
  } catch {
    return "";
  }
}

export function getEventCreationDefaultTimezone(): string {
  return getDefaultTimezone() || FALLBACK_EVENT_CREATION_TIMEZONE;
}
