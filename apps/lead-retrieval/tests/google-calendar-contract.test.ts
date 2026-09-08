import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Calendar routes are thin, authenticated, and delegate to the canonical service", () => {
  const availability = read("app/api/exhibitor/leads/[leadId]/google/availability/route.ts");
  const meetings = read("app/api/exhibitor/leads/[leadId]/google/meetings/route.ts");
  const mutation = read("app/api/exhibitor/leads/[leadId]/google/meetings/[activityId]/route.ts");
  for (const source of [availability, meetings, mutation]) assert.match(source, /resolveApiSession\(request\)/);
  assert.match(availability, /getGoogleAvailability/);
  assert.match(meetings, /createGoogleMeeting/);
  assert.match(mutation, /updateGoogleMeeting/);
  assert.match(mutation, /cancelGoogleMeeting/);
});

test("Calendar service enforces company, lead, viewer, ownership, and capabilities", () => {
  const source = read("lib/integrations/google/calendar-service.ts");
  assert.match(source, /\.eq\("id", input\.leadId\)\.eq\("company_id", input\.companyId\)/);
  assert.match(source, /canMutateExhibitorLeadsInContext/);
  assert.match(source, /denyExhibitorViewer: true/);
  assert.match(source, /\.eq\("user_id", input\.userId\)\.eq\("company_id", input\.companyId\)/);
  assert.match(source, /calendarFreeBusy/);
  assert.match(source, /calendarEventsOwned/);
  assert.match(source, /getValidGoogleAccessTokenForUser/);
  assert.match(source, /deterministicGoogleEventId/);
});

test("provider requests use freebusy, owned calendar events, attendee invite, Meet request, update, and cancellation", () => {
  const source = read("lib/integrations/google/calendar-client.ts");
  assert.match(source, /calendar\/v3\/freeBusy/);
  assert.match(source, /calendars\/primary\/events/);
  assert.match(source, /attendees: \[\{ email: input\.attendeeEmail \}\]/);
  assert.match(source, /sendUpdates=all/);
  assert.match(source, /conferenceDataVersion=1/);
  assert.match(source, /hangoutsMeet/);
  assert.match(source, /organizerEmail/);
  assert.match(source, /creatorEmail/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /method: "DELETE"/);
  assert.doesNotMatch(source, /console\./);
});

test("migration stores safe meeting identity and explicitly omits freebusy and content", () => {
  const migration = read("supabase/migrations/0093_google_calendar_meeting_activities.sql");
  assert.match(migration, /CREATE TABLE public\.google_calendar_meeting_activities/);
  assert.match(migration, /UNIQUE \(idempotency_key\)/);
  assert.match(migration, /UNIQUE \(connection_id, google_event_id\)/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.google_calendar_meeting_activities FROM anon, authenticated/);
  assert.doesNotMatch(migration, /\bfree_busy\b\s+(json|jsonb|text)/i);
  assert.doesNotMatch(migration, /\bdescription\b\s+text/i);
});

test("lead UI exposes scheduling, availability, Meet, update, cancel, capability, and unknown states", () => {
  const source = read("components/leads/google-meeting-panel.tsx");
  for (const text of ["Schedule meeting", "Check availability", "Create a Google Meet link", "Confirm update", "Confirm cancellation", "Reconnect Google Workspace", "could not be confirmed"]) {
    assert.match(source, new RegExp(text));
  }
  assert.match(source, /readOnly[\s\S]*value=\{email\}/);
  assert.match(source, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(source, /availabilityState !== "ready"/);
  assert.match(source, /Availability could not be checked/);
  assert.match(source, /setSuggestions\(\[\]\)/);
  assert.match(source, /setAvailabilityState\("idle"\)/);
});

test("availability retains only a safe category for the UI and emits safe production diagnostics", () => {
  const service = read("lib/integrations/google/calendar-service.ts");
  const route = read("app/api/exhibitor/leads/[leadId]/google/availability/route.ts");
  assert.match(service, /emitGoogleCalendarDiagnostic/);
  assert.doesNotMatch(service, /process\.env\.NODE_ENV !== "development"/);
  assert.match(service, /stage: "context" \| "input_validation" \| "token_manager" \| "freebusy_request" \| "freebusy_retry"/);
  assert.match(service, /provider\.status === 401/);
  assert.match(service, /accessToken\(input, true\)/);
  assert.match(service, /tokenRefreshAttempted/);
  assert.match(service, /tokenRefreshAttempted = tokenRefreshAttempted \|\| refreshedToken\.refreshAttempted/);
  assert.doesNotMatch(service, /tokenRefreshAttempted = true/);
  assert.match(service, /validCalendarId/);
  assert.match(service, /validRfc3339Range/);
  assert.match(service, /token\.reason === "missing_connection"[\s\S]*\? "missing_connection"/);
  assert.match(route, /category/);
  assert.doesNotMatch(route, /googleReason/);
});

test("meeting activity uses generic copy and shows safe provider attribution", () => {
  const component = read("components/leads/google-meeting-panel.tsx");
  const service = read("lib/integrations/google/calendar-service.ts");
  assert.match(component, />Meeting activity</);
  assert.match(component, /No meetings scheduled for this lead\./);
  assert.match(component, /Google Workspace/);
  assert.match(component, /Scheduled by/);
  assert.match(component, /calendarOwnerLabel/);
  assert.doesNotMatch(component, /Google meeting activity/);
  assert.doesNotMatch(component, /No Google meetings scheduled/);
  assert.match(service, /google_display_name, google_email/);
  assert.match(service, /full_name, email/);
  assert.match(service, /organizer_email: provider\.identity\.organizerEmail/);
  assert.match(service, /creator_email: provider\.identity\.creatorEmail/);
});
