export const CALENDAR_PROVIDERS = ["google_workspace", "microsoft_365"] as const;
export const CALENDAR_CAPABILITY = "calendar" as const;

export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export type CalendarProviderConnection = {
  id: string;
  provider: CalendarProvider;
  accountEmail: string;
  accountDisplayName: string | null;
};

export type CalendarProviderCandidate = CalendarProviderConnection & {
  healthy: boolean;
  reconnectRequired: boolean;
};

export type CalendarProviderResolution =
  | {
      ok: true;
      connection: CalendarProviderConnection;
      source: "only_healthy" | "preference" | "override";
    }
  | {
      ok: false;
      outcome: "missing_connection" | "reconnect_required" | "provider_selection_required";
    };

export type EligibleCalendar = {
  provider: CalendarProvider;
  accountEmail: string;
  isDefault: boolean;
};

export type NormalizedMeeting = {
  activityId: string;
  provider: CalendarProvider;
  eventId: string;
  joinUrl: string | null;
  start: string;
  end: string;
  timezone: string;
  attendeeEmail: string;
};

export function isCalendarProvider(value: unknown): value is CalendarProvider {
  return (
    typeof value === "string" &&
    (CALENDAR_PROVIDERS as readonly string[]).includes(value)
  );
}

export function parseCalendarProviderOverride(
  value: unknown
): { valid: true; provider?: CalendarProvider } | { valid: false } {
  if (typeof value === "undefined") return { valid: true };
  return isCalendarProvider(value) ? { valid: true, provider: value } : { valid: false };
}
