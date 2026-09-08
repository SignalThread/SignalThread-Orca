export type EventTimezoneOption = {
  value: string;
  label: string;
};

/** Curated primary choices for North American event teams. Values remain canonical IANA identifiers. */
export const EVENT_TIMEZONE_OPTIONS: readonly EventTimezoneOption[] = [
  { label: "Eastern Time", value: "America/New_York" },
  { label: "Central Time", value: "America/Chicago" },
  { label: "Mountain Time", value: "America/Denver" },
  { label: "Pacific Time", value: "America/Los_Angeles" },
  { label: "Arizona", value: "America/Phoenix" },
  { label: "Alaska Time", value: "America/Anchorage" },
  { label: "Hawaii Time", value: "Pacific/Honolulu" },
  { label: "Atlantic Time", value: "America/Halifax" },
  { label: "Newfoundland Time", value: "America/St_Johns" }
];

export function findEventTimezoneOption(value: string | null | undefined): EventTimezoneOption | null {
  const normalized = String(value ?? "").trim();
  return EVENT_TIMEZONE_OPTIONS.find((option) => option.value === normalized) ?? null;
}

export function eventTimezoneLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Select timezone…";
  return findEventTimezoneOption(normalized)?.label ?? `Other — ${normalized}`;
}
