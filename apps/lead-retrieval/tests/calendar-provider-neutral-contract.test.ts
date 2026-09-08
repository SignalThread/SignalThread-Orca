import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("provider-neutral calendar routes expose availability, create, update, and cancel", () => {
  const availability = read("app/api/exhibitor/leads/[leadId]/availability/route.ts");
  const create = read("app/api/exhibitor/leads/[leadId]/meetings/route.ts");
  const mutation = read("app/api/exhibitor/leads/[leadId]/meetings/[activityId]/route.ts");
  assert.match(availability, /handleCalendarAvailability/);
  assert.match(create, /handleCalendarMeetingCreate/);
  assert.match(mutation, /handleCalendarMeetingUpdate/);
  assert.match(mutation, /handleCalendarMeetingCancel/);

  const handler = read("lib/integrations/calendar/routes.ts");
  assert.match(handler, /parseCalendarProviderOverride\(payload\.providerOverride\)/);
  assert.match(handler, /includeConferencing/);
  assert.doesNotMatch(handler, /accessToken|refreshToken|clientSecret/);
});

test("Microsoft meeting persistence stores safe metadata and pins canonical provider claims", () => {
  const migration = read("supabase/migrations/0105_microsoft_calendar_meetings.sql");
  assert.match(migration, /CREATE TABLE public\.calendar_meeting_provider_claims/);
  assert.match(migration, /idempotency_key uuid PRIMARY KEY/);
  assert.match(migration, /provider IN \('google_workspace', 'microsoft_365'\)/);
  assert.match(migration, /FROM public\.google_calendar_meeting_activities/);
  assert.match(migration, /CREATE TABLE public\.microsoft_calendar_meeting_activities/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.calendar_meeting_provider_claims FROM anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.microsoft_calendar_meeting_activities FROM anon, authenticated/);
  assert.doesNotMatch(migration, /access_token|refresh_token|client_secret|raw_response/i);
});

test("mobile integration response exposes nested calendarProvider status", () => {
  const route = read("app/api/mobile/integrations/connections/route.ts");
  assert.match(route, /calendarProvider: toMobileCalendarProviderStatus/);
  assert.match(route, /listEligibleCalendars/);
  assert.match(route, /resolveCalendarProviderForUser/);
});

test("legacy Google calendar routes remain on the existing Google service", () => {
  const availability = read("app/api/exhibitor/leads/[leadId]/google/availability/route.ts");
  const create = read("app/api/exhibitor/leads/[leadId]/google/meetings/route.ts");
  const mutation = read("app/api/exhibitor/leads/[leadId]/google/meetings/[activityId]/route.ts");
  assert.match(availability, /getGoogleAvailability/);
  assert.match(create, /createGoogleMeeting/);
  assert.match(mutation, /updateGoogleMeeting/);
  assert.match(mutation, /cancelGoogleMeeting/);
  const service = read("lib/integrations/google/calendar-service.ts");
  assert.match(service, /claimCalendarMeetingProvider/);
  assert.match(service, /provider: "google_workspace"/);
});
