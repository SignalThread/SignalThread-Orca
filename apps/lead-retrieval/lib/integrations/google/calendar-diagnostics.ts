export type GoogleCalendarDiagnostic = {
  stage:
    | "request_context"
    | "input_validation"
    | "token_manager"
    | "freebusy_request"
    | "freebusy_retry"
    | "slot_generation"
    | "event_create"
    | "event_create_retry";
  safe_error_category: string;
  authenticated_user: boolean;
  calendar_capability: boolean | null;
  calendar_id: "primary" | null;
  range_start: string | null;
  range_end: string | null;
  timezone: string | null;
  google_http_status: number | null;
  google_reason: string | null;
  token_refresh_attempted: boolean;
  busy_interval_count: number | null;
  generated_slot_count: number | null;
  slots_removed_by_busy: number | null;
  slots_removed_by_window_end: number | null;
  slots_removed_by_lead_time: number | null;
  slots_removed_by_same_day: number | null;
  slots_truncated_by_limit: number | null;
  /** Returned by Google only after a successful events.insert; never a token. */
  organizer_email?: string | null;
  /** Returned by Google only after a successful events.insert; never a token. */
  creator_email?: string | null;
};

export function emitGoogleCalendarDiagnostic(input: {
  level: "info" | "warn" | "error";
  diagnostic: GoogleCalendarDiagnostic;
  logger?: (level: "info" | "warn" | "error", diagnostic: GoogleCalendarDiagnostic) => void;
}) {
  if (input.logger) {
    input.logger(input.level, input.diagnostic);
    return;
  }
  console[input.level]("[google/calendar]", input.diagnostic);
}
