import assert from "node:assert/strict";
import test from "node:test";
import {
  emitGoogleCalendarDiagnostic,
  type GoogleCalendarDiagnostic
} from "../lib/integrations/google/calendar-diagnostics";

test("Calendar diagnostics retain operational counts without credential or attendee fields", () => {
  const events: Array<{ level: string; diagnostic: GoogleCalendarDiagnostic }> = [];
  emitGoogleCalendarDiagnostic({
    level: "info",
    diagnostic: {
      stage: "slot_generation",
      safe_error_category: "none",
      authenticated_user: true,
      calendar_capability: true,
      calendar_id: "primary",
      range_start: "2026-08-18T19:00:00.000Z",
      range_end: "2026-08-18T21:00:00.000Z",
      timezone: "America/New_York",
      google_http_status: 200,
      google_reason: null,
      token_refresh_attempted: false,
      busy_interval_count: 1,
      generated_slot_count: 2,
      slots_removed_by_busy: 1,
      slots_removed_by_window_end: 0,
      slots_removed_by_lead_time: 0,
      slots_removed_by_same_day: 0,
      slots_truncated_by_limit: 0
    },
    logger: (level, diagnostic) => events.push({ level, diagnostic })
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.diagnostic.generated_slot_count, 2);
  assert.doesNotMatch(
    JSON.stringify(events),
    /access.?token|refresh.?token|authorization|attendee|credential|pkce|oauth.?state/i
  );
});

test("successful meeting diagnostics retain Google-returned organizer attribution without secrets", () => {
  const events: Array<{ level: string; diagnostic: GoogleCalendarDiagnostic }> = [];
  emitGoogleCalendarDiagnostic({
    level: "info",
    diagnostic: {
      stage: "event_create",
      safe_error_category: "none",
      authenticated_user: true,
      calendar_capability: true,
      calendar_id: "primary",
      range_start: "2026-08-18T19:00:00.000Z",
      range_end: "2026-08-18T19:30:00.000Z",
      timezone: "America/New_York",
      google_http_status: 200,
      google_reason: null,
      token_refresh_attempted: false,
      busy_interval_count: null,
      generated_slot_count: null,
      slots_removed_by_busy: null,
      slots_removed_by_window_end: null,
      slots_removed_by_lead_time: null,
      slots_removed_by_same_day: null,
      slots_truncated_by_limit: null,
      organizer_email: "ali@signalthread.ai",
      creator_email: "ali@signalthread.ai"
    },
    logger: (level, diagnostic) => events.push({ level, diagnostic })
  });
  assert.deepEqual(events[0]?.diagnostic.organizer_email, "ali@signalthread.ai");
  assert.deepEqual(events[0]?.diagnostic.creator_email, "ali@signalthread.ai");
  assert.doesNotMatch(JSON.stringify(events), /access.?token|refresh.?token|authorization|credential|pkce|oauth.?state/i);
});
